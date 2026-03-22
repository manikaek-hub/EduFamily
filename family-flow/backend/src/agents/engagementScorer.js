/**
 * Agent 5 — Engagement & Motivation
 *
 * Scoring d'engagement purement algorithmique (pas de LLM).
 * Détecte le désengagement AVANT que l'enfant ne décroche.
 *
 * Score de base : 100
 * Pénalités appliquées en fonction des signaux détectés.
 *
 * Seuils :
 *   < 60 → Foxie change d'approche (mini-défi, changement de sujet)
 *   < 30 → alerte désengagement loggée
 */

const db = require('../db/init');

// Patterns de désengagement
const DISENGAGEMENT_PATTERNS = [
  /^(jsais pas|je sais pas|sais pas|ché pas|chais pas|aucune id[ée]e|jcp|jsp)$/i,
  /^(\?+|\.+|idk|non|nan|bof|pfff|osef)$/i,
];

/**
 * Calcule le score d'engagement pour le message actuel.
 * Retourne { score, signals, alert }
 */
function scoreEngagement(memberId, sessionId, currentMessage, messageHistory, responseTimeMs) {
  let score = 100;
  const signals = [];

  const msg = (currentMessage || '').trim();

  // Signal 1 : longueur de réponse très courte
  if (msg.length > 0 && msg.length < 5) {
    score -= 20;
    signals.push({ type: 'short_response', detail: `${msg.length} caractères`, penalty: -20 });
  } else if (msg.length >= 5 && msg.length < 10) {
    score -= 5;
    signals.push({ type: 'brief_response', detail: `${msg.length} caractères`, penalty: -5 });
  }

  // Signal 2 : temps de réponse long (fatigue / distraction)
  if (responseTimeMs) {
    if (responseTimeMs > 60000) {
      score -= 20;
      signals.push({ type: 'very_slow', detail: `${Math.round(responseTimeMs / 1000)}s`, penalty: -20 });
    } else if (responseTimeMs > 30000) {
      score -= 10;
      signals.push({ type: 'slow', detail: `${Math.round(responseTimeMs / 1000)}s`, penalty: -10 });
    }
  }

  // Signal 3 : pattern de désengagement verbal
  for (const pattern of DISENGAGEMENT_PATTERNS) {
    if (pattern.test(msg)) {
      score -= 25;
      signals.push({ type: 'disengagement_phrase', detail: msg, penalty: -25 });
      break;
    }
  }

  // Signal 4 : tendance descendante (3 messages de plus en plus courts)
  if (messageHistory && messageHistory.length >= 2) {
    const recentLengths = messageHistory
      .filter(m => m.role === 'user')
      .slice(-3)
      .map(m => (m.content || '').length);

    if (recentLengths.length >= 2) {
      // Add current message length
      recentLengths.push(msg.length);

      // Check strictly descending
      const isDescending = recentLengths.length >= 3 &&
        recentLengths.every((len, i) => i === 0 || len < recentLengths[i - 1]);

      if (isDescending) {
        score -= 15;
        signals.push({
          type: 'declining_length',
          detail: `${recentLengths.join(' → ')} chars`,
          penalty: -15,
        });
      }
    }
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine alert level
  let alert = null;
  if (score < 30) {
    alert = 'alerte_desengagement';
  } else if (score < 60) {
    alert = 'fatigue_detectee';
  }

  // Store in engagement_log
  try {
    db.prepare(`
      INSERT INTO engagement_log (member_id, session_id, score, signals, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(memberId, sessionId || null, score, JSON.stringify(signals));
  } catch (err) {
    console.error('Agent 5 log error:', err.message);
  }

  if (alert) {
    console.log(`Agent 5: ${alert} for member ${memberId} (score: ${score}, signals: ${signals.map(s => s.type).join(', ')})`);
  }

  return { score, signals, alert };
}

/**
 * Get the latest engagement score for a member's session.
 */
function getLatestEngagement(memberId, sessionId) {
  try {
    const row = db.prepare(`
      SELECT score, signals FROM engagement_log
      WHERE member_id = ? AND (session_id = ? OR session_id IS NULL)
      ORDER BY created_at DESC LIMIT 1
    `).get(memberId, sessionId);

    if (row) {
      return { score: row.score, signals: JSON.parse(row.signals || '[]') };
    }
  } catch {}

  return { score: 100, signals: [] };
}

module.exports = { scoreEngagement, getLatestEngagement };
