const express = require('express');
const router = express.Router();
const db = require('../db/init');
const kb = require('../services/knowledgebase');
const ed = require('../services/ecoledirecte');

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

module.exports = router;
