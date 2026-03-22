const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { sendMessage } = require('../services/claude');
const { searchCurriculum, detectSubject } = require('../services/curriculum');
const { buildHomeworkPrompt, buildMockOralPrompt } = require('../services/prompts');
const kb = require('../services/knowledgebase');
const { buildProfileContext, logEvent } = require('../services/learnerProfile');
const { annotateAndStore } = require('../agents/dataCollector');
const { scoreEngagement, getLatestEngagement } = require('../agents/engagementScorer');
const { getStyle, detectStyle, buildStyleInstruction } = require('../agents/learningStyleDetector');

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
      `SELECT hs.*, COUNT(hm.id) as message_count
       FROM homework_sessions hs
       LEFT JOIN homework_messages hm ON hs.id = hm.session_id
       WHERE hs.member_id = ?
       GROUP BY hs.id
       ORDER BY hs.started_at DESC`
    ).all(memberId);
  } else {
    sessions = db.prepare(
      `SELECT hs.*, COUNT(hm.id) as message_count
       FROM homework_sessions hs
       LEFT JOIN homework_messages hm ON hs.id = hm.session_id
       GROUP BY hs.id
       ORDER BY hs.started_at DESC`
    ).all();
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
  req._requestStartTime = Date.now();
  try {
    const { memberId, message, sessionId, image, subject, mode } = req.body;

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

    // Agent 5: Check engagement BEFORE calling Claude
    const engagement = getLatestEngagement(memberId, sessionId);
    let engagementHint = '';
    if (engagement.score < 60) {
      engagementHint = `\n\n[ALERTE ENGAGEMENT: score ${engagement.score}/100]
L'enfant montre des signes de fatigue ou de désengagement.
Propose un mini-défi amusant ou change de sujet. Sois encourageant.
Ne pose PAS de question difficile maintenant — redonne-lui confiance d'abord.\n`;
    }

    // Agent 6: Get learning style for this subject
    const styleProfile = getStyle(memberId, detectedSubject);
    const styleInstruction = buildStyleInstruction(styleProfile);

    // Recent errors context (last 5 errors from training_data)
    let recentErrorsHint = '';
    try {
      const recentErrors = db.prepare(`
        SELECT subject, error_type, substr(child_message, 1, 60) as msg
        FROM training_data
        WHERE member_id = ? AND label IN ('incorrect','partial') AND error_type IS NOT NULL
        ORDER BY created_at DESC LIMIT 5
      `).all(memberId);
      if (recentErrors.length > 0) {
        recentErrorsHint = '\n\n[ERREURS RECENTES de cet enfant]\n';
        recentErrors.forEach(e => {
          recentErrorsHint += `- ${e.subject}: ${e.error_type} ("${e.msg}")\n`;
        });
        recentErrorsHint += 'Tiens compte de ces erreurs pour anticiper ses difficultés.\n';
      }
    } catch {}

    const child = { name: member.name, age: member.age, grade: member.grade };
    let systemPrompt;
    if (mode === 'oral') {
      systemPrompt = buildMockOralPrompt(child);
    } else {
      const profileCtx = buildProfileContext(memberId);
      const styleSection = styleInstruction ? `\n\n[STYLE D'APPRENTISSAGE]\n${styleInstruction}\n` : '';
      systemPrompt = buildHomeworkPrompt(child, fiches, kbContext, profileCtx) + styleSection + engagementHint + recentErrorsHint;
    }
    const response = await sendMessage(systemPrompt, history, 350);

    // Auto-add topic to KB from this conversation
    if (detectedSubject && message.length > 10) {
      kb.addTopic(memberId, detectedSubject, message.slice(0, 80), message);
    }

    // Log learning event
    logEvent(memberId, 'foxie_session', detectedSubject, message.slice(0, 60));

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

    res.json({ success: true, response, fichesUsed: fiches.length, engagement: engagement.score });

    // ─── ASYNC POST-PROCESSING (ne bloque pas la réponse) ───
    // Agent 5: Score engagement for this message
    const engResult = scoreEngagement(memberId, sessionId, message, history, req._requestStartTime ? Date.now() - req._requestStartTime : null);

    // Agent 1: Annotate the exchange and update mastery graph
    // Find the training_data row just inserted by the middleware
    const latestTD = db.prepare(
      'SELECT id FROM training_data WHERE member_id = ? ORDER BY id DESC LIMIT 1'
    ).get(memberId);

    if (latestTD) {
      annotateAndStore(latestTD.id, memberId, response, message, detectedSubject, null)
        .catch(err => console.error('Agent 1 async error:', err.message));
    }

    // Agent 6: Update learning style detection periodically (every 5 messages)
    try {
      const msgCount = db.prepare('SELECT COUNT(*) as c FROM training_data WHERE member_id = ? AND subject LIKE ?')
        .get(memberId, `%${detectedSubject || ''}%`);
      if (msgCount?.c > 0 && msgCount.c % 5 === 0 && detectedSubject) {
        detectStyle(memberId, detectedSubject);
      }
    } catch {}
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
