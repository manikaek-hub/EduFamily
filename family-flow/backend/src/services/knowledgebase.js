const db = require('../db/init');
const ed = require('./ecoledirecte');

// Map EcoleDirecte student ID to Family Flow member ID
function getMemberForStudent(studentId) {
  // Try direct mapping via ed_settings + members name matching
  const edStudent = db.prepare('SELECT * FROM ed_settings WHERE student_id = ?').get(String(studentId));
  if (!edStudent) return null;

  const firstName = (edStudent.student_name || '').split(' ')[0].toLowerCase();

  // Match by first name
  const member = db.prepare(
    "SELECT * FROM members WHERE role = 'child' AND LOWER(name) = ?"
  ).get(firstName);

  return member || null;
}

// Get all ED student → member mappings
function getAllMappings() {
  const edStudents = db.prepare('SELECT * FROM ed_settings WHERE connected = 1').all();
  return edStudents.map(s => {
    const member = getMemberForStudent(s.student_id);
    return { studentId: s.student_id, studentName: s.student_name, memberId: member?.id, memberName: member?.name };
  }).filter(m => m.memberId);
}

// Auto-sync after login: sync all connected children
async function autoSyncAfterLogin(username) {
  const mappings = getAllMappings();
  if (mappings.length === 0) {
    console.log('KB auto-sync: no ED→member mappings found');
    return { success: false, error: 'No mappings' };
  }

  console.log('KB auto-sync: syncing', mappings.length, 'children');
  const results = {};

  for (const mapping of mappings) {
    try {
      const hwResult = await syncHomework(username, mapping.studentId, mapping.memberId);
      // Sync grades into KB too
      const grResult = await syncGrades(username, mapping.studentId, mapping.memberId);
      results[mapping.memberName] = { homework: hwResult, grades: grResult };
      console.log(`  KB synced ${mapping.memberName}: ${hwResult.synced || 0} homework, ${grResult.synced || 0} grade topics`);
    } catch (err) {
      console.error(`  KB sync error for ${mapping.memberName}:`, err.message);
      results[mapping.memberName] = { error: err.message };
    }
  }

  return { success: true, results };
}

// Sync homework from EcoleDirecte into KB
async function syncHomework(username, studentId, memberId) {
  const result = await ed.getHomeworkRange(username, studentId);
  if (!result.success) return { success: false, error: result.error };

  let count = 0;
  const insertHw = db.prepare(`
    INSERT OR REPLACE INTO kb_homework (member_id, subject, description, due_date, done, synced_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);
  const insertTopic = db.prepare(`
    INSERT OR IGNORE INTO kb_topics (member_id, subject, topic, description, source, date_seen, synced_at)
    VALUES (?, ?, ?, ?, 'ecoledirecte', ?, datetime('now'))
  `);

  for (const [date, items] of Object.entries(result.homework)) {
    for (const item of items) {
      if (!item.description || item.description.trim().length < 3) continue;
      insertHw.run(memberId, item.subject, item.description, date, item.done ? 1 : 0);

      // Extract topic from homework description
      const topicName = item.description.slice(0, 80).replace(/\n/g, ' ').trim();
      if (topicName.length > 5) {
        insertTopic.run(memberId, item.subject, topicName, item.description, date);
      }
      count++;
    }
  }

  db.prepare('INSERT INTO kb_sync_log (member_id, sync_type, items_count) VALUES (?, ?, ?)').run(memberId, 'homework', count);
  return { success: true, synced: count };
}

// Sync grades subjects into KB (extract what subjects the child studies)
async function syncGrades(username, studentId, memberId) {
  const result = await ed.getGrades(username, studentId);
  if (!result.success) return { success: false, error: result.error };

  let count = 0;
  const insertSubject = db.prepare(`
    INSERT OR IGNORE INTO kb_subjects (member_id, subject, synced_at)
    VALUES (?, ?, datetime('now'))
  `);
  const insertTopic = db.prepare(`
    INSERT OR IGNORE INTO kb_topics (member_id, subject, topic, description, source, date_seen, synced_at)
    VALUES (?, ?, ?, ?, 'ecoledirecte', ?, datetime('now'))
  `);

  // Extract subjects from grades
  const subjects = new Set();
  for (const note of (result.notes || [])) {
    if (note.subject) subjects.add(note.subject);
    // Create topics from graded assignments
    if (note.title && note.title.length > 3) {
      insertTopic.run(memberId, note.subject, note.title.slice(0, 80), `${note.title} - ${note.grade}/${note.outOf}`, note.date || null);
      count++;
    }
  }

  for (const subject of subjects) {
    insertSubject.run(memberId, subject);
  }

  db.prepare('INSERT INTO kb_sync_log (member_id, sync_type, items_count) VALUES (?, ?, ?)').run(memberId, 'grades', count);
  return { success: true, synced: count };
}

// Sync timetable from EcoleDirecte into KB
async function syncTimetable(username, studentId, memberId) {
  const now = new Date();
  const monday = new Date(now);
  const day = monday.getDay();
  if (day === 0) monday.setDate(monday.getDate() + 1);
  else if (day === 6) monday.setDate(monday.getDate() + 2);
  else monday.setDate(monday.getDate() - day + 1);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const toStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const result = await ed.getTimetable(username, studentId, toStr(monday), toStr(friday));
  if (!result.success) return { success: false, error: result.error };

  db.prepare('DELETE FROM kb_timetable WHERE member_id = ?').run(memberId);

  let count = 0;
  const insertSlot = db.prepare(`
    INSERT OR IGNORE INTO kb_timetable (member_id, subject, teacher, room, day_of_week, start_time, end_time, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  const insertSubject = db.prepare(`
    INSERT OR IGNORE INTO kb_subjects (member_id, subject, teacher, synced_at)
    VALUES (?, ?, ?, datetime('now'))
  `);

  for (const event of result.timetable) {
    if (event.cancelled || !event.subject) continue;

    const eventDate = (event.start || '').split(' ')[0] || (event.start || '').split('T')[0];
    const dayOfWeek = new Date(eventDate).getDay();
    const startTime = (event.start || '').split(' ')[1]?.slice(0, 5) || (event.start || '').split('T')[1]?.slice(0, 5) || '';
    const endTime = (event.end || '').split(' ')[1]?.slice(0, 5) || (event.end || '').split('T')[1]?.slice(0, 5) || '';

    if (startTime) {
      insertSlot.run(memberId, event.subject, event.teacher || null, event.room || null, dayOfWeek, startTime, endTime);
      insertSubject.run(memberId, event.subject, event.teacher || null);
      count++;
    }
  }

  db.prepare('INSERT INTO kb_sync_log (member_id, sync_type, items_count) VALUES (?, ?, ?)').run(memberId, 'timetable', count);
  return { success: true, synced: count };
}

// Full sync - homework + timetable + grades
async function syncAll(username, studentId, memberId) {
  const hwResult = await syncHomework(username, studentId, memberId);
  const ttResult = await syncTimetable(username, studentId, memberId);
  const grResult = await syncGrades(username, studentId, memberId);

  return { success: true, homework: hwResult, timetable: ttResult, grades: grResult };
}

// Get what a child studied today (for quiz generation)
function getTodayTopics(memberId) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const dayOfWeek = today.getDay();

  const todayClasses = db.prepare(
    'SELECT DISTINCT subject, teacher FROM kb_timetable WHERE member_id = ? AND day_of_week = ? ORDER BY start_time'
  ).all(memberId, dayOfWeek);

  const recentHw = db.prepare(
    'SELECT subject, description FROM kb_homework WHERE member_id = ? AND due_date >= ? ORDER BY due_date ASC LIMIT 10'
  ).all(memberId, todayStr);

  const recentTopics = db.prepare(
    'SELECT subject, topic, description FROM kb_topics WHERE member_id = ? ORDER BY date_seen DESC LIMIT 15'
  ).all(memberId);

  return { todayClasses, recentHomework: recentHw, recentTopics };
}

// Get context for Foxie (homework helper) - what the child is currently working on
function getFoxieContext(memberId, subject) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  // ALL pending homework (not just matching subject) for broader context
  const allPendingHw = db.prepare(
    'SELECT subject, description, due_date FROM kb_homework WHERE member_id = ? AND done = 0 ORDER BY due_date ASC LIMIT 10'
  ).all(memberId);

  // Subject-specific topics
  const topics = db.prepare(
    'SELECT topic, description FROM kb_topics WHERE member_id = ? AND subject LIKE ? ORDER BY date_seen DESC LIMIT 5'
  ).all(memberId, `%${subject}%`);

  // Subject-specific pending homework
  const pendingHw = db.prepare(
    'SELECT description, due_date FROM kb_homework WHERE member_id = ? AND subject LIKE ? AND done = 0 ORDER BY due_date ASC LIMIT 3'
  ).all(memberId, `%${subject}%`);

  // Mastery levels (weak points)
  const mastery = db.prepare(
    'SELECT topic, mastery FROM kb_topics WHERE member_id = ? AND subject LIKE ? AND mastery > 0 ORDER BY mastery ASC LIMIT 5'
  ).all(memberId, `%${subject}%`);

  // Textbook for this subject
  const textbook = db.prepare(
    'SELECT title, publisher, chapters FROM kb_textbooks WHERE member_id = ? AND subject LIKE ?'
  ).get(memberId, `%${subject}%`);

  return { topics, pendingHomework: pendingHw, allPendingHomework: allPendingHw, mastery, textbook };
}

// Get full knowledge base summary for a child
function getChildSummary(memberId) {
  const subjects = db.prepare(
    'SELECT * FROM kb_subjects WHERE member_id = ? ORDER BY subject'
  ).all(memberId);

  const topicCounts = db.prepare(`
    SELECT subject, COUNT(*) as count, AVG(mastery) as avg_mastery
    FROM kb_topics WHERE member_id = ?
    GROUP BY subject ORDER BY subject
  `).all(memberId);

  const pendingHomework = db.prepare(
    'SELECT * FROM kb_homework WHERE member_id = ? AND done = 0 ORDER BY due_date ASC'
  ).all(memberId);

  const timetable = db.prepare(
    'SELECT * FROM kb_timetable WHERE member_id = ? ORDER BY day_of_week, start_time'
  ).all(memberId);

  const lastSync = db.prepare(
    'SELECT * FROM kb_sync_log WHERE member_id = ? ORDER BY synced_at DESC LIMIT 1'
  ).get(memberId);

  return { subjects, topicCounts, pendingHomework, timetable, lastSync };
}

function updateMastery(memberId, subject, topic, mastery) {
  db.prepare(
    'UPDATE kb_topics SET mastery = ? WHERE member_id = ? AND subject = ? AND topic = ?'
  ).run(mastery, memberId, subject, topic);
}

function addTopic(memberId, subject, topic, description) {
  db.prepare(`
    INSERT OR REPLACE INTO kb_topics (member_id, subject, topic, description, source, date_seen, synced_at)
    VALUES (?, ?, ?, ?, 'foxie', date('now'), datetime('now'))
  `).run(memberId, subject, topic, description || null);
}

// Get all children's summaries for quiz context
function getAllChildrenContext() {
  const children = db.prepare("SELECT * FROM members WHERE role = 'child'").all();
  return children.map(child => ({
    ...child,
    ...getTodayTopics(child.id),
  }));
}

module.exports = {
  syncHomework,
  syncTimetable,
  syncGrades,
  syncAll,
  autoSyncAfterLogin,
  getMemberForStudent,
  getAllMappings,
  getTodayTopics,
  getFoxieContext,
  getChildSummary,
  updateMastery,
  addTopic,
  getAllChildrenContext,
};
