const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { sendMessage } = require('../services/claude');
const { searchCurriculum, detectSubject } = require('../services/curriculum');
const { buildHomeworkPrompt, buildMockOralPrompt } = require('../services/prompts');

// In-memory cache of attachments per session, so Foxie keeps "seeing" the document
// across the whole conversation (the DB only stores `has_image` flag, not the binary).
// TTL: 2 hours of inactivity. Evicted on backend restart (fine for a small family app).
const sessionAttachments = new Map(); // sessionId -> { items: [{kind:'pdf'|'image', data:base64}], ts:number, count:number }
const ATTACHMENT_TTL_MS = 2 * 60 * 60 * 1000;

function cacheAttachments(sessionId, items) {
  if (!sessionId || !items?.length) return;
  sessionAttachments.set(sessionId, {
    items,
    ts: Date.now(),
    count: (sessionAttachments.get(sessionId)?.count || 0) + 1,
  });
}

function getCachedAttachment(sessionId) {
  if (!sessionId) return null;
  const entry = sessionAttachments.get(sessionId);
  if (!entry) return null;
  if (Date.now() - entry.ts > ATTACHMENT_TTL_MS) {
    sessionAttachments.delete(sessionId);
    return null;
  }
  return entry;
}

// Periodic cleanup of stale entries to bound memory usage
setInterval(() => {
  const now = Date.now();
  for (const [sid, entry] of sessionAttachments.entries()) {
    if (now - entry.ts > ATTACHMENT_TTL_MS) sessionAttachments.delete(sid);
  }
}, 15 * 60 * 1000).unref?.();
const kb = require('../services/knowledgebase');
const { buildProfileContext, logEvent } = require('../services/learnerProfile');
const { annotateAndStore } = require('../agents/dataCollector');
const { scoreEngagement, getLatestEngagement } = require('../agents/engagementScorer');
const { getStyle, detectStyle, buildStyleInstruction } = require('../agents/learningStyleDetector');
const { awardCoins } = require('../services/coins');

// POST /api/homework/sessions - Find recent session or create new one
router.post('/sessions', (req, res) => {
  const { memberId, subject, topic } = req.body;

  // Look for an existing session today with messages (reuse it)
  const existing = db.prepare(`
    SELECT hs.id FROM homework_sessions hs
    INNER JOIN homework_messages hm ON hs.id = hm.session_id
    WHERE hs.member_id = ? AND hs.subject = ?
      AND hs.started_at > datetime('now', '-24 hours')
    GROUP BY hs.id
    HAVING COUNT(hm.id) >= 1
    ORDER BY hs.started_at DESC
    LIMIT 1
  `).get(memberId, subject);

  if (existing) {
    return res.json({ success: true, sessionId: existing.id, resumed: true });
  }

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
    const { memberId, message, sessionId, image, images, pdf, pdfs, subject, mode } = req.body;

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
    let previousAssistantMessage = null;
    if (sessionId) {
      const dbMessages = db.prepare(
        'SELECT role, content FROM homework_messages WHERE session_id = ? ORDER BY created_at ASC'
      ).all(sessionId);
      history = dbMessages.map(m => ({ role: m.role, content: m.content }));
      previousAssistantMessage = [...dbMessages].reverse().find(m => m.role === 'assistant')?.content || null;
    }

    const freshAttachments = [];
    if (pdf) freshAttachments.push({ kind: 'pdf', data: pdf });
    if (Array.isArray(pdfs)) {
      pdfs.filter(Boolean).forEach(item => {
        freshAttachments.push({ kind: 'pdf', data: typeof item === 'string' ? item : item.base64 || item.data });
      });
    }
    if (image) freshAttachments.push({ kind: 'image', data: image });
    if (Array.isArray(images)) {
      images.filter(Boolean).forEach(item => {
        freshAttachments.push({ kind: 'image', data: typeof item === 'string' ? item : item.base64 || item.data });
      });
    }

    // Cache the new attachments if any, so subsequent turns keep "seeing" them
    if (freshAttachments.length > 0) cacheAttachments(sessionId, freshAttachments);

    // Resolve which attachment Claude should see for THIS turn:
    // - Use the freshly uploaded ones if present
    // - Otherwise fall back to the cached one from earlier in the same session
    const cached = freshAttachments.length === 0 ? getCachedAttachment(sessionId) : null;
    const effectiveAttachments = freshAttachments.length > 0 ? freshAttachments : (cached?.items || []);

    // Add current message
    if (effectiveAttachments.length > 0) {
      const content = effectiveAttachments
        .filter(att => att.data)
        .map(att => att.kind === 'pdf'
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: att.data } }
          : { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: att.data } }
        );
      content.push({ type: 'text', text: message || "Voici mon document. Peux-tu m'aider ?" });
      history.push({
        role: 'user',
        content,
      });
    } else {
      history.push({ role: 'user', content: message });
    }

    // Get KB context — TOUJOURS chargé (même sans matière détectée) pour que
    // Foxie voie les devoirs EcoleDirecte + l'emploi du temps. Indispensable
    // pour répondre à "qu'est-ce que j'ai pour demain ?" / "fais-moi un plan".
    let kbContext = null;
    try {
      kbContext = kb.getFoxieContext(memberId, detectedSubject || '');
    } catch (e) {
      console.error('getFoxieContext error:', e.message);
    }

    // Agent 5: Check engagement BEFORE calling Claude
    const engagement = getLatestEngagement(memberId, sessionId);
    let engagementHint = '';
    if (engagement.score < 30) {
      engagementHint = `\n\n[ALERTE ENGAGEMENT CRITIQUE: score ${engagement.score}/100]
L'enfant est très découragé ou fatigué. PRIORITÉ ABSOLUE: redonner confiance.
- Arrête les questions, donne directement les explications clés
- Propose de faire une PAUSE ou de changer complètement de sujet
- Dis quelque chose comme "Eh, on a bien bossé ! On fait un truc plus fun ?"
- Si l'enfant persiste, simplifie au maximum et valorise chaque micro-progrès
- Ne pose PAS de question — explique, montre, rassure\n`;
    } else if (engagement.score < 60) {
      engagementHint = `\n\n[ALERTE ENGAGEMENT: score ${engagement.score}/100]
L'enfant montre des signes de fatigue ou de désengagement.
- Commence par récapituler ce qu'il a BIEN compris (valoriser)
- Propose un mini-défi amusant ou un exemple concret de la vie quotidienne
- Réduis la difficulté — donne des indices plus directs
- Sois plus chaleureux que d'habitude, encourage davantage\n`;
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
      systemPrompt = buildHomeworkPrompt(child, fiches, kbContext, profileCtx, mode) + styleSection + engagementHint + recentErrorsHint;
    }
    // Use Sonnet for accuracy + extended thinking for math/science to avoid calculation errors
    const isMathOrScience = detectedSubject && /math|science|physiq|chimie|svt/i.test(detectedSubject);
    const response = await sendMessage(systemPrompt, history, 800, {
      thinking: isMathOrScience,
    });

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
      insertMsg.run(sessionId, 'user', message, freshAttachments.length > 0 ? 1 : 0);
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

    // Award coins for homework effort (every 5 messages in a session = 5 coins)
    let coinsEarned = 0;
    try {
      if (sessionId) {
        const msgCount = db.prepare('SELECT COUNT(*) as c FROM homework_messages WHERE session_id = ? AND role = ?').get(sessionId, 'user');
        if (msgCount && msgCount.c > 0 && msgCount.c % 5 === 0) {
          coinsEarned = 5;
          awardCoins(memberId, coinsEarned, `Session devoirs: ${detectedSubject || 'cours'} (${msgCount.c} messages)`, 'homework', sessionId);
        }
      }
    } catch (e) { console.error('Coins award error (homework):', e.message); }

    res.json({ success: true, response, fichesUsed: fiches.length, engagement: engagement.score, coinsEarned });

    // ─── ASYNC POST-PROCESSING (ne bloque pas la réponse) ───
    // Agent 5: Score engagement for this message
    const engResult = scoreEngagement(memberId, sessionId, message, history, req._requestStartTime ? Date.now() - req._requestStartTime : null);

    // Agent 1: annotate the child's reaction to Foxie's previous message.
    // If this was the first message, do not pretend the child answered Foxie's new response.
    const latestTD = db.prepare(
      `SELECT id FROM training_data
       WHERE member_id = ? AND (? IS NULL OR session_id = ?)
       ORDER BY id DESC LIMIT 1`
    ).get(memberId, sessionId || null, sessionId || null);

    if (latestTD && previousAssistantMessage) {
      annotateAndStore(latestTD.id, memberId, previousAssistantMessage, message, detectedSubject, null, sessionId)
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
