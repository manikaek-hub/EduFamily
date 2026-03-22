/**
 * Agent 2 — Planifieur Adaptatif de Révision
 *
 * Génère un plan de révision priorisé à partir du mastery_graph,
 * des devoirs proches, et de la répétition espacée.
 *
 * Purement algorithmique — pas d'appel LLM.
 *
 * Priorités :
 *   1. Urgence contrôle (concept lié à un devoir/contrôle ≤ 7 jours) → HAUTE
 *   2. Score faible (< 2/5) → HAUTE
 *   3. Régression détectée (score a baissé) → MOYENNE
 *   4. Révision espacée (next_review dépassé) → BASSE
 */

const db = require('../db/init');
const { getMasteryProfile, getWeakConcepts } = require('../services/learnerProfile');

/**
 * Génère un plan de révision priorisé pour un enfant.
 * Retourne { date, child, priority_queue, stats }
 */
function generatePlan(memberId) {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
  if (!member) return { success: false, error: 'Membre introuvable' };

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const in7days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const priorityQueue = [];

  // ─── 1. Urgence contrôle : devoirs dans les 7 prochains jours ───
  const upcomingHomework = db.prepare(`
    SELECT subject, description, due_date FROM kb_homework
    WHERE member_id = ? AND done = 0 AND due_date BETWEEN ? AND ?
    ORDER BY due_date ASC
  `).all(memberId, todayStr, in7days);

  const hwSubjects = new Set();
  for (const hw of upcomingHomework) {
    const daysUntil = Math.ceil((new Date(hw.due_date) - today) / 86400000);
    const conceptId = `${hw.subject.toLowerCase().replace(/\s+/g, '_')}_devoir`;

    // Avoid duplicate subjects
    if (hwSubjects.has(hw.subject)) continue;
    hwSubjects.add(hw.subject);

    // Check mastery for this subject
    const mastery = db.prepare(
      'SELECT AVG(score) as avg FROM mastery_graph WHERE member_id = ? AND subject LIKE ?'
    ).get(memberId, `%${hw.subject}%`);

    priorityQueue.push({
      concept: hw.description.slice(0, 80),
      concept_id: conceptId,
      subject: hw.subject,
      urgency: 'haute',
      reason: `Devoir dans ${daysUntil}j (${hw.due_date})`,
      due_date: hw.due_date,
      mastery_score: mastery?.avg || null,
      source: 'homework',
    });
  }

  // ─── 2. Score faible (< 2/5 dans mastery_graph) ───
  const weakConcepts = db.prepare(`
    SELECT * FROM mastery_graph
    WHERE member_id = ? AND score < 2
    ORDER BY score ASC LIMIT 8
  `).all(memberId);

  for (const concept of weakConcepts) {
    // Skip if already in queue from homework
    if (priorityQueue.some(p => p.subject === concept.subject && p.source === 'homework')) continue;

    priorityQueue.push({
      concept: concept.concept_id.replace(/_/g, ' '),
      concept_id: concept.concept_id,
      subject: concept.subject,
      urgency: 'haute',
      reason: `Score faible: ${concept.score}/5 (${concept.attempts} tentatives)`,
      mastery_score: concept.score,
      source: 'weak_score',
    });
  }

  // ─── 3. Régression détectée ───
  // Check training_data for concepts that were correct then became incorrect
  try {
    const regressions = db.prepare(`
      SELECT subject, concept_id,
        SUM(CASE WHEN label = 'correct' THEN 1 ELSE 0 END) as correct_count,
        SUM(CASE WHEN label = 'incorrect' THEN 1 ELSE 0 END) as incorrect_count
      FROM training_data
      WHERE member_id = ? AND label IS NOT NULL AND created_at >= datetime('now', '-14 days')
      GROUP BY subject
      HAVING incorrect_count > correct_count AND correct_count > 0
    `).all(memberId);

    for (const reg of regressions) {
      if (priorityQueue.some(p => p.subject === reg.subject)) continue;

      priorityQueue.push({
        concept: `${reg.subject} — régression`,
        concept_id: reg.concept_id || `${reg.subject.toLowerCase().replace(/\s+/g, '_')}_regression`,
        subject: reg.subject,
        urgency: 'moyenne',
        reason: `Régression: ${reg.correct_count} correct → ${reg.incorrect_count} incorrect (14 derniers jours)`,
        mastery_score: null,
        source: 'regression',
      });
    }
  } catch {}

  // ─── 4. Révision espacée (next_review dépassé) ───
  const dueForReview = db.prepare(`
    SELECT * FROM mastery_graph
    WHERE member_id = ? AND next_review <= ? AND score >= 2
    ORDER BY score ASC LIMIT 5
  `).all(memberId, todayStr);

  for (const concept of dueForReview) {
    if (priorityQueue.some(p => p.concept_id === concept.concept_id)) continue;

    priorityQueue.push({
      concept: concept.concept_id.replace(/_/g, ' '),
      concept_id: concept.concept_id,
      subject: concept.subject,
      urgency: 'basse',
      reason: `Révision espacée (dernière: ${concept.last_seen?.split('T')[0] || '?'}, intervalle: ${concept.review_interval || 1}j)`,
      mastery_score: concept.score,
      source: 'spaced_review',
    });
  }

  // ─── Stats ───
  const masteryProfile = getMasteryProfile(memberId);

  const stats = {
    totalConcepts: masteryProfile.totalConcepts,
    subjectsCount: masteryProfile.subjects.length,
    weakCount: priorityQueue.filter(p => p.urgency === 'haute').length,
    dueReviewCount: dueForReview.length,
    upcomingHomeworkCount: upcomingHomework.length,
  };

  // Save plan to revision_plans
  const planData = { date: todayStr, child: member.name, grade: member.grade, priority_queue: priorityQueue, stats };
  const validUntil = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];

  db.prepare(
    'INSERT INTO revision_plans (member_id, plan_data, valid_until) VALUES (?, ?, ?)'
  ).run(memberId, JSON.stringify(planData), validUntil);

  return { success: true, plan: planData };
}

/**
 * Retourne le concept prioritaire à travailler maintenant.
 */
function getNextConcept(memberId) {
  const todayStr = new Date().toISOString().split('T')[0];
  const in7days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  // Priority 1: homework due soon with low mastery
  const urgentHw = db.prepare(`
    SELECT h.subject, h.description, h.due_date, mg.score
    FROM kb_homework h
    LEFT JOIN mastery_graph mg ON mg.member_id = h.member_id AND mg.subject = h.subject
    WHERE h.member_id = ? AND h.done = 0 AND h.due_date BETWEEN ? AND ?
    ORDER BY h.due_date ASC, COALESCE(mg.score, 0) ASC
    LIMIT 1
  `).get(memberId, todayStr, in7days);

  if (urgentHw) {
    return {
      concept: urgentHw.description.slice(0, 80),
      subject: urgentHw.subject,
      urgency: 'haute',
      reason: `Devoir pour le ${urgentHw.due_date}`,
    };
  }

  // Priority 2: weakest concept
  const weakest = db.prepare(
    'SELECT * FROM mastery_graph WHERE member_id = ? ORDER BY score ASC LIMIT 1'
  ).get(memberId);

  if (weakest) {
    return {
      concept: weakest.concept_id.replace(/_/g, ' '),
      subject: weakest.subject,
      urgency: weakest.score < 2 ? 'haute' : 'moyenne',
      reason: `Score: ${weakest.score}/5`,
    };
  }

  return null;
}

module.exports = { generatePlan, getNextConcept };
