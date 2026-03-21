const db = require('../db/init');
const { generateJSON } = require('./claude');
const { buildRevisionPrompt } = require('./prompts');
const kb = require('./knowledgebase');

// Generate a revision plan for a child using Claude + KB data
async function generatePlan(memberId) {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
  if (!member) throw new Error('Membre non trouve');

  // Gather KB data
  const summary = kb.getChildSummary(memberId);

  // Get weak topics (mastery < 3)
  const weakTopics = db.prepare(
    'SELECT subject, topic, mastery FROM kb_topics WHERE member_id = ? AND mastery > 0 AND mastery < 3 ORDER BY mastery ASC LIMIT 10'
  ).all(memberId);

  // Get textbooks for this child
  const textbooks = db.prepare('SELECT * FROM kb_textbooks WHERE member_id = ?').all(memberId);

  const kbData = {
    pendingHomework: summary.pendingHomework,
    subjects: summary.subjects,
    weakTopics,
    textbooks,
  };

  // Check if we have enough data
  if ((!kbData.pendingHomework || kbData.pendingHomework.length === 0) && kbData.weakTopics.length === 0) {
    if (!kbData.subjects || kbData.subjects.length === 0) {
      return { success: false, error: 'Pas assez de donnees. Synchronisez d\'abord EcoleDirecte.' };
    }
  }

  const child = { name: member.name, age: member.age, grade: member.grade };
  const prompt = buildRevisionPrompt(child, kbData);

  const plan = await generateJSON(prompt, `Genere le programme de revision pour ${member.name}.`);

  // Calculate valid_until (5 days from now)
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 5);
  const validUntilStr = validUntil.toISOString().split('T')[0];

  // Save plan
  const result = db.prepare(
    'INSERT INTO revision_plans (member_id, plan_data, valid_until) VALUES (?, ?, ?)'
  ).run(memberId, JSON.stringify(plan), validUntilStr);

  return { success: true, planId: result.lastInsertRowid, plan };
}

// Get active plan for a child
function getActivePlan(memberId) {
  const today = new Date().toISOString().split('T')[0];

  const planRow = db.prepare(
    'SELECT * FROM revision_plans WHERE member_id = ? AND valid_until >= ? ORDER BY created_at DESC LIMIT 1'
  ).get(memberId, today);

  if (!planRow) return null;

  const plan = JSON.parse(planRow.plan_data);

  // Get progress
  const progress = db.prepare(
    'SELECT day_index, item_index, done, done_at FROM revision_progress WHERE plan_id = ?'
  ).all(planRow.id);

  // Merge progress into plan
  const progressMap = {};
  for (const p of progress) {
    progressMap[`${p.day_index}-${p.item_index}`] = { done: !!p.done, done_at: p.done_at };
  }

  // Count totals
  let totalItems = 0;
  let doneItems = 0;

  if (plan.days) {
    plan.days.forEach((day, di) => {
      if (day.sessions) {
        day.sessions.forEach((session, si) => {
          totalItems++;
          const key = `${di}-${si}`;
          session.done = progressMap[key]?.done || false;
          session.done_at = progressMap[key]?.done_at || null;
          if (session.done) doneItems++;
        });
      }
    });
  }

  return {
    id: planRow.id,
    plan,
    createdAt: planRow.created_at,
    validUntil: planRow.valid_until,
    progress: { total: totalItems, done: doneItems, percent: totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0 },
  };
}

// Toggle progress on an item
function toggleProgress(planId, dayIndex, itemIndex) {
  const existing = db.prepare(
    'SELECT * FROM revision_progress WHERE plan_id = ? AND day_index = ? AND item_index = ?'
  ).get(planId, dayIndex, itemIndex);

  if (existing) {
    const newDone = existing.done ? 0 : 1;
    db.prepare(
      'UPDATE revision_progress SET done = ?, done_at = ? WHERE id = ?'
    ).run(newDone, newDone ? new Date().toISOString() : null, existing.id);
    return { done: !!newDone };
  } else {
    db.prepare(
      'INSERT INTO revision_progress (plan_id, day_index, item_index, done, done_at) VALUES (?, ?, ?, 1, ?)'
    ).run(planId, dayIndex, itemIndex, new Date().toISOString());
    return { done: true };
  }
}

module.exports = { generatePlan, getActivePlan, toggleProgress };
