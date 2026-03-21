const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { sendMessage } = require('../services/claude');
const { searchCurriculum, detectSubject } = require('../services/curriculum');
const { buildHomeworkPrompt } = require('../services/prompts');
const kb = require('../services/knowledgebase');

// POST /api/homework/sessions - Create a new session
router.post('/sessions', (req, res) => {
  const { memberId, subject, topic } = req.body;
  const result = db.prepare(
    'INSERT INTO homework_sessions (member_id, subject, topic) VALUES (?, ?, ?)'
  ).run(memberId, subject, topic || null);
  res.json({ success: true, sessionId: result.lastInsertRowid });
});

// GET /api/homework/sessions?memberId=X
router.get('/sessions', (req, res) => {
  const { memberId } = req.query;
  let sessions;
  if (memberId) {
    sessions = db.prepare(
      'SELECT * FROM homework_sessions WHERE member_id = ? ORDER BY started_at DESC'
    ).all(memberId);
  } else {
    sessions = db.prepare('SELECT * FROM homework_sessions ORDER BY started_at DESC').all();
  }
  res.json({ success: true, sessions });
});

// GET /api/homework/sessions/:id/messages
router.get('/sessions/:id/messages', (req, res) => {
  const messages = db.prepare(
    'SELECT * FROM homework_messages WHERE session_id = ? ORDER BY created_at ASC'
  ).all(req.params.id);
  res.json({ success: true, messages });
});

// POST /api/homework/chat - Chat with Foxie
router.post('/chat', async (req, res) => {
  try {
    const { memberId, message, sessionId, image, subject } = req.body;

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    if (!member) {
      return res.status(404).json({ success: false, error: 'Membre non trouve' });
    }

    // Detect subject from message
    const detectedSubject = subject || detectSubject(message);

    // Search curriculum for relevant context
    let fiches = [];
    if (member.grade) {
      const niveau = member.grade;
      fiches = searchCurriculum(message, niveau, detectedSubject);
    }

    // Build conversation history from session
    let history = [];
    if (sessionId) {
      const dbMessages = db.prepare(
        'SELECT role, content FROM homework_messages WHERE session_id = ? ORDER BY created_at ASC'
      ).all(sessionId);
      history = dbMessages.map(m => ({ role: m.role, content: m.content }));
    }

    // Add current message
    if (image) {
      history.push({
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: message || "Voici mon exercice. Peux-tu m'aider ?" },
        ],
      });
    } else {
      history.push({ role: 'user', content: message });
    }

    // Get KB context for this child's subject
    let kbContext = null;
    if (detectedSubject) {
      kbContext = kb.getFoxieContext(memberId, detectedSubject);
    }

    const child = { name: member.name, age: member.age, grade: member.grade };
    const systemPrompt = buildHomeworkPrompt(child, fiches, kbContext);
    const response = await sendMessage(systemPrompt, history);

    // Auto-add topic to KB from this conversation
    if (detectedSubject && message.length > 10) {
      kb.addTopic(memberId, detectedSubject, message.slice(0, 80), message);
    }

    // Save messages to DB
    if (sessionId) {
      const insertMsg = db.prepare(
        'INSERT INTO homework_messages (session_id, role, content, has_image) VALUES (?, ?, ?, ?)'
      );
      insertMsg.run(sessionId, 'user', message, image ? 1 : 0);
      insertMsg.run(sessionId, 'assistant', response, 0);
    }

    // Update progress
    if (sessionId && detectedSubject && member.grade) {
      const topic = detectedSubject;
      const existing = db.prepare(
        'SELECT * FROM homework_progress WHERE member_id = ? AND subject = ? AND topic = ?'
      ).get(memberId, detectedSubject, topic);

      if (existing) {
        db.prepare(
          'UPDATE homework_progress SET session_count = session_count + 1, last_practiced = datetime(\'now\') WHERE id = ?'
        ).run(existing.id);
      } else {
        db.prepare(
          'INSERT INTO homework_progress (member_id, subject, topic) VALUES (?, ?, ?)'
        ).run(memberId, detectedSubject, topic);
      }
    }

    res.json({ success: true, response, fichesUsed: fiches.length });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/homework/progress/:memberId
router.get('/progress/:memberId', (req, res) => {
  const progress = db.prepare(
    'SELECT * FROM homework_progress WHERE member_id = ? ORDER BY last_practiced DESC'
  ).all(req.params.memberId);
  res.json({ success: true, progress });
});

module.exports = router;
