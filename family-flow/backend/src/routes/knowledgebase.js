const express = require('express');
const router = express.Router();
const db = require('../db/init');
const kb = require('../services/knowledgebase');
const ed = require('../services/ecoledirecte');
const { generateJSON } = require('../services/claude');

// Spaced repetition intervals in days (2-3-5-7 method extended)
const REVIEW_INTERVALS = [1, 2, 3, 5, 7, 14, 30, 60];

// POST /api/kb/sync - Sync from EcoleDirecte
router.post('/sync', async (req, res) => {
  try {
    const { memberId } = req.body;

    // Get ED connection
    const edSettings = db.prepare('SELECT * FROM ed_settings WHERE connected = 1').get();
    if (!edSettings) {
      return res.status(400).json({ success: false, error: 'EcoleDirecte non connecte' });
    }

    const session = ed.getSession(edSettings.username);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Session EcoleDirecte expiree' });
    }

    // If memberId provided, sync for that member. Otherwise sync for all children
    if (memberId) {
      const result = await kb.syncAll(edSettings.username, edSettings.student_id, memberId);
      return res.json({ success: true, ...result });
    }

    // Sync for all children
    const children = db.prepare("SELECT * FROM members WHERE role = 'child'").all();
    const results = {};
    for (const child of children) {
      results[child.name] = await kb.syncAll(edSettings.username, edSettings.student_id, child.id);
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('KB sync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/kb/homework/:memberId - Get pending homework for dashboard
router.get('/homework/:memberId', (req, res) => {
  const memberId = parseInt(req.params.memberId);
  try {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const homework = db.prepare(
      'SELECT id, subject, description, due_date, done FROM kb_homework WHERE member_id = ? AND done = 0 AND due_date >= ? ORDER BY due_date ASC LIMIT 15'
    ).all(memberId, todayStr);
    res.json({ success: true, homework });
  } catch (err) {
    res.json({ success: true, homework: [] });
  }
});

// GET /api/kb/summary/:memberId - Get child's knowledge summary
router.get('/summary/:memberId', (req, res) => {
  const summary = kb.getChildSummary(parseInt(req.params.memberId));
  res.json({ success: true, ...summary });
});

// GET /api/kb/summary - Get all children summaries
router.get('/summary', (req, res) => {
  const children = db.prepare("SELECT * FROM members WHERE role = 'child'").all();
  const summaries = children.map(child => ({
    member: child,
    ...kb.getChildSummary(child.id),
  }));
  res.json({ success: true, summaries });
});

// GET /api/kb/today/:memberId - What child studied today
router.get('/today/:memberId', (req, res) => {
  const topics = kb.getTodayTopics(parseInt(req.params.memberId));
  res.json({ success: true, ...topics });
});

// GET /api/kb/context/:memberId - Context for Foxie
router.get('/context/:memberId', (req, res) => {
  const { subject } = req.query;
  if (!subject) {
    return res.status(400).json({ success: false, error: 'Subject required' });
  }
  const context = kb.getFoxieContext(parseInt(req.params.memberId), subject);
  res.json({ success: true, ...context });
});

// PUT /api/kb/mastery - Update mastery level
router.put('/mastery', (req, res) => {
  const { memberId, subject, topic, mastery } = req.body;
  kb.updateMastery(memberId, subject, topic, mastery);
  res.json({ success: true });
});

// POST /api/kb/topics - Add a manual topic
router.post('/topics', (req, res) => {
  const { memberId, subject, topic, description } = req.body;
  kb.addTopic(memberId, subject, topic, description);
  res.json({ success: true });
});

// GET /api/kb/quiz-context - Get all children context for quiz generation
router.get('/quiz-context', (req, res) => {
  const context = kb.getAllChildrenContext();
  res.json({ success: true, children: context });
});

// POST /api/kb/homework - Add manual homework entry (for Victoire + others not on EcoleDirecte)
router.post('/homework', (req, res) => {
  const { memberId, subject, description, due_date } = req.body;
  if (!memberId || !subject || !description || !due_date) {
    return res.status(400).json({ success: false, error: 'Champs requis manquants' });
  }
  try {
    db.prepare(
      'INSERT OR IGNORE INTO kb_homework (member_id, subject, description, due_date) VALUES (?, ?, ?, ?)'
    ).run(memberId, subject, description, due_date);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/kb/homework/:id/done - Mark homework as done/undone
router.put('/homework/:id/done', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { done } = req.body; // 1 or 0
    const newDone = done ? 1 : 0;

    const hw = db.prepare('SELECT * FROM kb_homework WHERE id = ?').get(id);
    if (!hw) return res.status(404).json({ success: false, error: 'Devoir non trouvé' });

    db.prepare('UPDATE kb_homework SET done = ? WHERE id = ?').run(newDone, id);

    // Award coins when marking as done (not when un-marking)
    if (newDone === 1) {
      try {
        const { awardCoins } = require('../services/coins');
        awardCoins(hw.member_id, 10, `Devoir terminé : ${hw.subject}`, 'homework_done', id);
      } catch (coinErr) {
        console.warn('[KB] Coin award failed:', coinErr.message);
      }
    }

    res.json({ success: true, done: newDone, coinsAwarded: newDone === 1 ? 10 : 0 });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/kb/homework/:id - Delete a manual homework entry
router.delete('/homework/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM kb_homework WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/kb/sync-status - Get sync log
router.get('/sync-status', (req, res) => {
  const logs = db.prepare(
    'SELECT sl.*, m.name as member_name FROM kb_sync_log sl LEFT JOIN members m ON sl.member_id = m.id ORDER BY sl.synced_at DESC LIMIT 10'
  ).all();
  res.json({ success: true, logs });
});

// ─── SPACED REVIEW ─────────────────────────────────────────────────────────

// GET /api/kb/reviews/due/:memberId - Get topics due for review today
router.get('/reviews/due/:memberId', (req, res) => {
  const memberId = parseInt(req.params.memberId);
  const today = new Date().toISOString().split('T')[0];
  const topics = db.prepare(`
    SELECT * FROM kb_topics
    WHERE member_id = ? AND (next_review_date IS NULL OR next_review_date <= ?)
    ORDER BY COALESCE(next_review_date, date_seen, synced_at) ASC
    LIMIT 20
  `).all(memberId, today);
  res.json({ success: true, topics });
});

// POST /api/kb/reviews/complete - Mark a topic as reviewed, schedule next
router.post('/reviews/complete', (req, res) => {
  const { topicId, rating } = req.body; // rating: 1=hard, 2=ok, 3=easy
  const topic = db.prepare('SELECT * FROM kb_topics WHERE id = ?').get(topicId);
  if (!topic) return res.status(404).json({ success: false, error: 'Topic not found' });

  const now = new Date().toISOString();
  const today = now.split('T')[0];

  // Determine next interval based on rating and current review count
  let reviewCount = (topic.review_count || 0) + 1;
  let intervalIndex;
  if (rating === 1) {
    // Hard: reset to beginning
    reviewCount = 1;
    intervalIndex = 0;
  } else if (rating === 3) {
    // Easy: skip ahead
    intervalIndex = Math.min(reviewCount + 1, REVIEW_INTERVALS.length - 1);
  } else {
    // OK: normal progression
    intervalIndex = Math.min(reviewCount - 1, REVIEW_INTERVALS.length - 1);
  }

  const nextInterval = REVIEW_INTERVALS[intervalIndex];
  const nextDate = new Date(Date.now() + nextInterval * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  db.prepare(`
    UPDATE kb_topics SET review_count = ?, review_interval = ?, next_review_date = ?, last_reviewed_at = ?
    WHERE id = ?
  `).run(reviewCount, nextInterval, nextDate, now, topicId);

  // Award XP
  const xpPoints = rating === 3 ? 15 : rating === 2 ? 10 : 5;
  awardXP(topic.member_id, 'review_complete', xpPoints, `Revision: ${topic.topic}`);

  res.json({ success: true, nextReviewDate: nextDate, nextInterval });
});

// ─── MIND MAPS ─────────────────────────────────────────────────────────────

// POST /api/kb/mindmap/generate - Generate a mind map for a topic
router.post('/mindmap/generate', async (req, res) => {
  const { memberId, subject, topic } = req.body;
  if (!memberId || !subject || !topic) {
    return res.status(400).json({ success: false, error: 'memberId, subject, topic requis' });
  }

  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
  if (!member) return res.status(404).json({ success: false, error: 'Membre introuvable' });

  try {
    const prompt = `Tu es un assistant pedagogique. Genere une carte mentale JSON pour aider ${member.name} (${member.grade}) a memoriser le sujet "${topic}" en ${subject}.

FORMAT JSON strict:
{"central":"${topic}","branches":[{"label":"Branche 1","color":"#7C9082","items":["point a","point b","point c"]},{"label":"Branche 2","color":"#C4A484","items":["point d","point e"]}]}

Regles:
- 4 a 6 branches maximum
- 3 a 5 items par branche, courts (5-10 mots)
- Branches en francais, adapte au niveau ${member.grade}
- Couleurs variees parmi: #7C9082, #C4A484, #2E86AB, #E67E22, #9B59B6, #27AE60
- Reponds UNIQUEMENT avec le JSON`;

    const mapData = await generateJSON(prompt, 'Genere la carte mentale.');

    // Save or update
    const existing = db.prepare('SELECT id FROM kb_mindmaps WHERE member_id = ? AND subject = ? AND topic = ?').get(memberId, subject, topic);
    if (existing) {
      db.prepare("UPDATE kb_mindmaps SET map_data = ?, updated_at = datetime('now') WHERE id = ?")
        .run(JSON.stringify(mapData), existing.id);
    } else {
      db.prepare('INSERT INTO kb_mindmaps (member_id, subject, topic, map_data) VALUES (?, ?, ?, ?)')
        .run(memberId, subject, topic, JSON.stringify(mapData));
    }

    res.json({ success: true, mapData });
  } catch (e) {
    console.error('Mindmap error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/kb/mindmaps/:memberId - List all mind maps for a member
router.get('/mindmaps/:memberId', (req, res) => {
  const mindmaps = db.prepare(`
    SELECT id, subject, topic, created_at, updated_at FROM kb_mindmaps
    WHERE member_id = ? ORDER BY updated_at DESC
  `).all(req.params.memberId);
  res.json({ success: true, mindmaps });
});

// GET /api/kb/mindmap/:id - Get a specific mind map
router.get('/mindmap/:id', (req, res) => {
  const mm = db.prepare('SELECT * FROM kb_mindmaps WHERE id = ?').get(req.params.id);
  if (!mm) return res.status(404).json({ success: false, error: 'Carte mentale introuvable' });
  res.json({ success: true, mindmap: { ...mm, map_data: JSON.parse(mm.map_data) } });
});

// DELETE /api/kb/mindmap/:id
router.delete('/mindmap/:id', (req, res) => {
  db.prepare('DELETE FROM kb_mindmaps WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── FLASHCARDS ────────────────────────────────────────────────────────────

// POST /api/kb/flashcards/extract - Extract flashcards from a course photo (Claude Vision)
router.post('/flashcards/extract', async (req, res) => {
  const { memberId, subject, imageBase64, mediaType } = req.body;
  if (!memberId || !imageBase64) {
    return res.status(400).json({ success: false, error: 'memberId et imageBase64 requis' });
  }

  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
  if (!member) return res.status(404).json({ success: false, error: 'Membre introuvable' });

  try {
    const visionContent = [
      { type: 'image', mediaType: mediaType || 'image/jpeg', data: imageBase64 },
      {
        type: 'text',
        text: `Analyse ce cours de ${subject || 'matiere inconnue'} pour ${member.name} (${member.grade}).
Extrait les concepts cles sous forme de flashcards question/reponse.

FORMAT JSON strict (array):
[{"front":"Question courte ?","back":"Reponse concise","topic":"Sous-theme"}]

Regles:
- 5 a 10 flashcards maximum
- Questions courtes et precises
- Reponses concises (1-2 phrases max)
- Adapte au niveau ${member.grade}
- Reponds UNIQUEMENT avec le JSON array`,
      },
    ];

    let flashcards;
    try {
      flashcards = await generateJSON('', visionContent, 2048, { tier: 'vision' });
    } catch {
      return res.status(500).json({ success: false, error: 'Impossible d\'extraire les flashcards' });
    }

    // Save flashcards
    const today = new Date().toISOString().split('T')[0];
    const insert = db.prepare(
      'INSERT INTO kb_flashcards (member_id, subject, topic, front, back, source, next_review) VALUES (?, ?, ?, ?, ?, "photo", ?)'
    );
    const savedIds = [];
    for (const fc of flashcards) {
      if (!fc.front || !fc.back) continue;
      const r = insert.run(memberId, subject || '', fc.topic || '', fc.front, fc.back, today);
      savedIds.push(r.lastInsertRowid);
    }

    awardXP(memberId, 'flashcards_created', flashcards.length * 5, `${flashcards.length} flashcards extraites`);
    res.json({ success: true, flashcards, savedCount: savedIds.length });
  } catch (e) {
    console.error('Flashcard extract error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/kb/flashcards/:memberId - Get flashcards for a member
router.get('/flashcards/:memberId', (req, res) => {
  const { subject, dueOnly } = req.query;
  const today = new Date().toISOString().split('T')[0];
  let query = 'SELECT * FROM kb_flashcards WHERE member_id = ?';
  const params = [req.params.memberId];
  if (subject) { query += ' AND subject = ?'; params.push(subject); }
  if (dueOnly === 'true') { query += ' AND (next_review IS NULL OR next_review <= ?)'; params.push(today); }
  query += ' ORDER BY created_at DESC';
  const flashcards = db.prepare(query).all(...params);
  res.json({ success: true, flashcards });
});

// POST /api/kb/flashcards/:id/review - Mark flashcard reviewed
router.post('/flashcards/:id/review', (req, res) => {
  const { rating } = req.body; // 1=hard, 2=ok, 3=easy
  const fc = db.prepare('SELECT * FROM kb_flashcards WHERE id = ?').get(req.params.id);
  if (!fc) return res.status(404).json({ success: false, error: 'Flashcard introuvable' });

  let reviewCount = (fc.review_count || 0) + 1;
  let intervalIndex;
  if (rating === 1) { reviewCount = 1; intervalIndex = 0; }
  else if (rating === 3) { intervalIndex = Math.min(reviewCount + 1, REVIEW_INTERVALS.length - 1); }
  else { intervalIndex = Math.min(reviewCount - 1, REVIEW_INTERVALS.length - 1); }

  const nextInterval = REVIEW_INTERVALS[intervalIndex];
  const nextDate = new Date(Date.now() + nextInterval * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const newMastery = Math.min(5, Math.floor(reviewCount / 2));

  db.prepare('UPDATE kb_flashcards SET review_count = ?, review_interval = ?, next_review = ?, mastery = ? WHERE id = ?')
    .run(reviewCount, nextInterval, nextDate, newMastery, fc.id);

  if (rating === 3) awardXP(fc.member_id, 'flashcard_mastered', 10, `Flashcard: ${fc.front.slice(0, 30)}`);

  res.json({ success: true, nextReviewDate: nextDate });
});

// DELETE /api/kb/flashcards/:id
router.delete('/flashcards/:id', (req, res) => {
  db.prepare('DELETE FROM kb_flashcards WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── GRADES ────────────────────────────────────────────────────────────────

// POST /api/kb/grades/sync - Sync grades from EcoleDirecte into kb_grades
router.post('/grades/sync', async (req, res) => {
  const { memberId } = req.body;
  const edSettings = db.prepare('SELECT * FROM ed_settings WHERE connected = 1').get();
  if (!edSettings) return res.status(400).json({ success: false, error: 'EcoleDirecte non connecté' });

  try {
    const result = await ed.getGrades(edSettings.username, edSettings.student_id);
    if (!result.success) return res.status(400).json({ success: false, error: result.error });

    const latestPeriod = result.periods?.find(p => !p.closed) || result.periods?.[0];
    if (latestPeriod?.averages) {
      const upsert = db.prepare(`
        INSERT INTO kb_grades (member_id, subject, student_avg, class_avg, period)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(member_id, subject, period) DO UPDATE SET
          student_avg = excluded.student_avg,
          class_avg = excluded.class_avg,
          synced_at = datetime('now')
      `);
      const mid = memberId || edSettings.member_id;
      for (const avg of latestPeriod.averages) {
        const subject = avg.subject?.trim();
        if (!subject) continue;
        const studentVal = parseFloat((avg.studentAvg || '').toString().replace(',', '.'));
        const classVal = parseFloat((avg.classAvg || '').toString().replace(',', '.'));
        if (isNaN(studentVal)) continue;
        upsert.run(mid, subject, studentVal, isNaN(classVal) ? null : classVal, latestPeriod.label || 'current');
      }
    }
    res.json({ success: true, period: latestPeriod?.label, count: latestPeriod?.averages?.length || 0 });
  } catch (e) {
    console.error('Grades sync error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/kb/grades/:memberId - Get cached grades with weak subject analysis
router.get('/grades/:memberId', (req, res) => {
  const grades = db.prepare(
    'SELECT * FROM kb_grades WHERE member_id = ? ORDER BY student_avg ASC'
  ).all(req.params.memberId);

  const weakSubjects = grades.filter(g => {
    if (!g.student_avg) return false;
    return g.student_avg < 10 || (g.class_avg && g.student_avg < g.class_avg - 2);
  });

  res.json({ success: true, grades, weakSubjects });
});

// ─── HELPER ────────────────────────────────────────────────────────────────

function awardXP(memberId, eventType, points, description) {
  try {
    db.prepare('INSERT INTO xp_events (member_id, event_type, points, description) VALUES (?, ?, ?, ?)')
      .run(memberId, eventType, points, description);
    const existing = db.prepare('SELECT total_xp FROM xp_totals WHERE member_id = ?').get(memberId);
    if (existing) {
      const newTotal = existing.total_xp + points;
      const level = Math.floor(Math.sqrt(newTotal / 50)) + 1;
      db.prepare("UPDATE xp_totals SET total_xp = ?, level = ?, updated_at = datetime('now') WHERE member_id = ?")
        .run(newTotal, level, memberId);
    } else {
      db.prepare('INSERT INTO xp_totals (member_id, total_xp, level) VALUES (?, ?, 1)').run(memberId, points);
    }
  } catch (e) {
    console.error('XP award error:', e);
  }
}

// POST /api/kb/import — reçoit les données EcoleDirecte synchronisées depuis le
// Mac (Option B : le Mac sait parler à EcoleDirecte, il pousse ici devoirs /
// notes / emploi du temps / manuels). Membres résolus par NOM (IDs peuvent différer).
router.post('/import', (req, res) => {
  try {
    const { members } = req.body || {};
    if (!Array.isArray(members)) {
      return res.status(400).json({ success: false, error: 'members[] requis' });
    }
    const findMember = db.prepare('SELECT id FROM members WHERE name = ? LIMIT 1');
    const report = {};
    const tx = db.transaction(() => {
      for (const m of members) {
        const row = m.name ? findMember.get(m.name) : null;
        if (!row) { report[m.name || '?'] = 'membre introuvable'; continue; }
        const id = row.id;
        const counts = { homework: 0, grades: 0, timetable: 0, textbooks: 0 };

        if (Array.isArray(m.homework)) {
          db.prepare('DELETE FROM kb_homework WHERE member_id = ?').run(id);
          const ins = db.prepare('INSERT OR IGNORE INTO kb_homework (member_id, subject, description, due_date, done) VALUES (?,?,?,?,?)');
          for (const h of m.homework) {
            if (!h.subject || !h.description || !h.due_date) continue;
            ins.run(id, h.subject, h.description, h.due_date, h.done ? 1 : 0);
            counts.homework++;
          }
        }
        if (Array.isArray(m.timetable)) {
          db.prepare('DELETE FROM kb_timetable WHERE member_id = ?').run(id);
          const ins = db.prepare('INSERT OR IGNORE INTO kb_timetable (member_id, subject, teacher, room, day_of_week, start_time, end_time) VALUES (?,?,?,?,?,?,?)');
          for (const t of m.timetable) {
            if (!t.subject || t.day_of_week == null || !t.start_time || !t.end_time) continue;
            ins.run(id, t.subject, t.teacher || null, t.room || null, t.day_of_week, t.start_time, t.end_time);
            counts.timetable++;
          }
        }
        if (Array.isArray(m.grades)) {
          db.prepare('DELETE FROM kb_grades WHERE member_id = ?').run(id);
          const ins = db.prepare('INSERT OR REPLACE INTO kb_grades (member_id, subject, student_avg, class_avg, period) VALUES (?,?,?,?,?)');
          for (const g of m.grades) {
            if (!g.subject) continue;
            const v = Number(g.student_avg);
            if (!(v >= 0 && v <= 20)) continue; // ignore notes invalides
            ins.run(id, g.subject, v, g.class_avg ?? null, g.period || null);
            counts.grades++;
          }
        }
        if (Array.isArray(m.textbooks)) {
          const ins = db.prepare('INSERT OR REPLACE INTO kb_textbooks (member_id, subject, title, publisher, isbn, chapters, digital_url) VALUES (?,?,?,?,?,?,?)');
          for (const b of m.textbooks) {
            if (!b.subject || !b.title) continue;
            ins.run(id, b.subject, b.title, b.publisher || null, b.isbn || null, b.chapters || null, b.digital_url || null);
            counts.textbooks++;
          }
        }
        // Notions (kb_topics) : remplacement par les notions PROPRES du Mac
        // (le Mac est la source de vérité ; évite d'accumuler du bruit sur le cloud).
        if (Array.isArray(m.topics)) {
          counts.topics = 0;
          db.prepare('DELETE FROM kb_topics WHERE member_id = ?').run(id);
          const ins = db.prepare("INSERT OR IGNORE INTO kb_topics (member_id, subject, topic, source) VALUES (?,?,?, 'ecoledirecte')");
          for (const t of m.topics) {
            if (!t.subject || !t.topic) continue;
            ins.run(id, t.subject, t.topic);
            counts.topics++;
          }
        }
        // Graph de maîtrise (répétition espacée) — remplacement par la version du Mac
        if (Array.isArray(m.mastery)) {
          counts.mastery = 0;
          db.prepare('DELETE FROM mastery_graph WHERE member_id = ?').run(id);
          const ins = db.prepare('INSERT OR IGNORE INTO mastery_graph (member_id, concept_id, subject, score, attempts, last_seen, next_review) VALUES (?,?,?,?,?,?,?)');
          for (const g of m.mastery) {
            if (!g.concept_id) continue;
            ins.run(id, g.concept_id, g.subject || null, g.score ?? 0, g.attempts ?? 0, g.last_seen || null, g.next_review || null);
            counts.mastery++;
          }
        }
        report[m.name] = counts;
      }
    });
    tx();
    res.json({ success: true, report });
  } catch (e) {
    console.error('KB import error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
