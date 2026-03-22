/**
 * Agent 1 — Collecteur de Données d'Entraînement
 *
 * Middleware Express qui intercepte POST /api/homework/chat
 * et enregistre chaque paire (foxie_message, child_message) dans training_data.
 *
 * Le champ "label" reste NULL — il sera rempli plus tard par l'Agent 1
 * (classification automatique via Claude ou annotation manuelle).
 */

const db = require('../db/init');

// Track request start times for response_time_ms
const requestTimestamps = new Map();

/**
 * Pre-handler: record the timestamp when the request arrives.
 * Must be mounted BEFORE the route handler.
 */
function preCollector(req, res, next) {
  if (req.method === 'POST' && req.path === '/chat') {
    requestTimestamps.set(req, Date.now());
  }
  next();
}

/**
 * Post-handler: intercept the response JSON to capture foxie's reply.
 * Wraps res.json() so we can read the response body before it's sent.
 */
function postCollector(req, res, next) {
  if (req.method !== 'POST' || req.path !== '/chat') {
    return next();
  }

  const originalJson = res.json.bind(res);

  res.json = function (body) {
    // Only collect if the chat was successful
    if (body && body.success && body.response) {
      try {
        collectTrainingData(req, body);
      } catch (err) {
        // Never block the response if collection fails
        console.error('Training collector error:', err.message);
      }
    }
    return originalJson(body);
  };

  next();
}

/**
 * Extract and store training data from the chat exchange.
 */
function collectTrainingData(req, responseBody) {
  const { memberId, message, sessionId, subject } = req.body;
  const foxieResponse = responseBody.response;

  if (!memberId || !foxieResponse) return;

  const startTime = requestTimestamps.get(req);
  const responseTimeMs = startTime ? Date.now() - startTime : null;
  requestTimestamps.delete(req);

  // Count existing turns in this session to determine turn_index
  let turnIndex = 0;
  if (sessionId) {
    const row = db.prepare(
      'SELECT COUNT(*) as count FROM training_data WHERE session_id = ?'
    ).get(sessionId);
    turnIndex = row ? row.count : 0;
  }

  // Detect subject from request or existing session
  const detectedSubject = subject || detectSubjectFromMessage(message);

  // Determine attempt number (how many messages the child sent in this session)
  let attemptNumber = 1;
  if (sessionId) {
    const row = db.prepare(
      'SELECT COUNT(*) as count FROM training_data WHERE session_id = ? AND member_id = ?'
    ).get(sessionId, memberId);
    attemptNumber = row ? row.count + 1 : 1;
  }

  db.prepare(`
    INSERT INTO training_data (
      session_id, member_id, turn_index, foxie_message, child_message,
      response_time_ms, attempt_number, subject, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    sessionId || null,
    memberId,
    turnIndex,
    foxieResponse,
    message || null,
    responseTimeMs,
    attemptNumber,
    detectedSubject
  );
}

/**
 * Basic subject detection from message content.
 * Returns null if no clear subject detected.
 */
function detectSubjectFromMessage(message) {
  if (!message) return null;
  const msg = message.toLowerCase();

  const subjectPatterns = [
    { pattern: /math|calcul|nombre|fraction|equation|geometr/i, subject: 'Mathématiques' },
    { pattern: /fran[cç]|conjug|grammair|orthograph|dict[ée]|verb|phrase/i, subject: 'Français' },
    { pattern: /histoir|guerre|r[ée]volution|roi|empire|antiquit/i, subject: 'Histoire' },
    { pattern: /g[ée]ograph|carte|pays|continent|climat/i, subject: 'Géographie' },
    { pattern: /scienc|physiq|chimie|svt|biolog|cellule|atome/i, subject: 'Sciences' },
    { pattern: /angl|english|vocabulary|grammar/i, subject: 'Anglais' },
  ];

  for (const { pattern, subject } of subjectPatterns) {
    if (pattern.test(msg)) return subject;
  }
  return null;
}

module.exports = { preCollector, postCollector };
