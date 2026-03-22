const express = require('express');
const router = express.Router();
const db = require('../db/init');

/**
 * Routes Feedback — Boucle d'amélioration continue
 *
 * Les enfants remontent du terrain → l'agent analyse → propose des améliorations
 * → Manika valide → déployé instantanément
 *
 * Endpoints :
 *   POST /api/feedback              — Soumettre un feedback (enfant)
 *   GET  /api/feedback/member/:id   — Feedbacks d'un enfant
 *   GET  /api/feedback/stats        — Stats agrégées
 *   GET  /api/feedback/proposals    — Propositions d'amélioration
 *   POST /api/feedback/proposals/:id/decide — Valider ou rejeter (créateur)
 *   GET  /api/feedback/rewards/:memberId — Récompenses d'un enfant
 */

// ─── SOUMISSION DE FEEDBACK (enfant) ───
router.post('/', (req, res) => {
  const { memberId, sessionId, type, rating, comment, context, subject, topic } = req.body;

  if (!memberId || !type) {
    return res.status(400).json({ error: 'memberId et type requis' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO feedback (member_id, session_id, type, rating, comment, context, subject, topic)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(memberId, sessionId || null, type, rating || null, comment || null, context || null, subject || null, topic || null);

    // Récompenser le feedback
    const rewardStmt = db.prepare(`
      INSERT INTO feedback_rewards (member_id, feedback_id, reward_type, reward_value, reason)
      VALUES (?, ?, 'foxie_star', '1', ?)
    `);
    const reason = comment && comment.length > 20 ? 'Feedback détaillé' : 'Feedback partagé';
    rewardStmt.run(memberId, result.lastInsertRowid, reason);

    // Bonus : feedback détaillé = plus de récompenses
    if (comment && comment.length > 50) {
      const bonusStmt = db.prepare(`
        INSERT INTO feedback_rewards (member_id, feedback_id, reward_type, reward_value, reason)
        VALUES (?, ?, 'foxie_star', '2', 'Feedback super détaillé — merci !')
      `);
      bonusStmt.run(memberId, result.lastInsertRowid);
    }

    // Aussi donner du XP pour le feedback
    try {
      const xpStmt = db.prepare(`
        INSERT INTO xp_events (member_id, event_type, xp_amount, details)
        VALUES (?, 'feedback', ?, ?)
      `);
      const xpAmount = comment && comment.length > 50 ? 15 : 5;
      xpStmt.run(memberId, xpAmount, JSON.stringify({ feedbackId: result.lastInsertRowid, type }));

      // Mettre à jour xp_totals
      db.prepare(`
        INSERT INTO xp_totals (member_id, total_xp, level)
        VALUES (?, ?, 1)
        ON CONFLICT(member_id) DO UPDATE SET
          total_xp = total_xp + ?,
          level = CAST(sqrt((total_xp + ?) / 50.0) + 1 AS INTEGER)
      `).run(memberId, xpAmount, xpAmount, xpAmount);
    } catch (e) {
      // XP tables might not exist yet, continue
    }

    res.json({
      id: result.lastInsertRowid,
      message: 'Merci pour ton retour !',
      starsEarned: comment && comment.length > 50 ? 3 : 1,
      xpEarned: comment && comment.length > 50 ? 15 : 5,
    });
  } catch (err) {
    console.error('Erreur feedback:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── FEEDBACKS D'UN ENFANT ───
router.get('/member/:memberId', (req, res) => {
  try {
    const feedbacks = db.prepare(`
      SELECT f.*, m.name as member_name
      FROM feedback f
      JOIN members m ON f.member_id = m.id
      WHERE f.member_id = ?
      ORDER BY f.created_at DESC
      LIMIT 50
    `).all(req.params.memberId);

    res.json({ feedbacks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── STATS AGREGEES (dashboard créateur) ───
router.get('/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM feedback').get();
    const byType = db.prepare(`
      SELECT type, COUNT(*) as count, AVG(rating) as avg_rating
      FROM feedback GROUP BY type ORDER BY count DESC
    `).all();
    const bySubject = db.prepare(`
      SELECT subject, COUNT(*) as count, AVG(rating) as avg_rating
      FROM feedback WHERE subject IS NOT NULL
      GROUP BY subject ORDER BY count DESC
    `).all();
    const byMember = db.prepare(`
      SELECT m.name, m.id as member_id, COUNT(f.id) as feedback_count,
             (SELECT COUNT(*) FROM feedback_rewards WHERE member_id = m.id) as rewards_count
      FROM feedback f JOIN members m ON f.member_id = m.id
      GROUP BY m.id ORDER BY feedback_count DESC
    `).all();
    const recent = db.prepare(`
      SELECT f.*, m.name as member_name
      FROM feedback f JOIN members m ON f.member_id = m.id
      ORDER BY f.created_at DESC LIMIT 20
    `).all();
    const proposals = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM improvement_proposals
      GROUP BY status
    `).all();

    // Difficultés signalées (rating <= 2)
    const painPoints = db.prepare(`
      SELECT subject, topic, AVG(rating) as avg_rating, COUNT(*) as count,
             GROUP_CONCAT(comment, ' | ') as comments
      FROM feedback
      WHERE rating <= 2 AND rating IS NOT NULL
      GROUP BY subject, topic
      ORDER BY count DESC LIMIT 10
    `).all();

    res.json({
      total: total.count,
      byType,
      bySubject,
      byMember,
      recent,
      proposals,
      painPoints,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PROPOSITIONS D'AMELIORATION ───
router.get('/proposals', (req, res) => {
  const status = req.query.status || 'pending';
  try {
    const proposals = db.prepare(`
      SELECT * FROM improvement_proposals
      WHERE status = ?
      ORDER BY
        CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        created_at DESC
    `).all(status);

    res.json({ proposals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── TOUTES LES PROPOSITIONS (pour le dashboard) ───
router.get('/proposals/all', (req, res) => {
  try {
    const proposals = db.prepare(`
      SELECT * FROM improvement_proposals
      ORDER BY created_at DESC
      LIMIT 100
    `).all();

    res.json({ proposals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DECISION DU CREATEUR (valider / rejeter) ───
router.post('/proposals/:id/decide', (req, res) => {
  const { decision, note } = req.body;

  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'decision doit être approved ou rejected' });
  }

  try {
    db.prepare(`
      UPDATE improvement_proposals
      SET status = ?, creator_note = ?, decided_at = datetime('now')
      WHERE id = ?
    `).run(decision, note || null, req.params.id);

    // Si approuvé, marquer comme déployé immédiatement
    if (decision === 'approved') {
      db.prepare(`
        UPDATE improvement_proposals
        SET status = 'deployed', deployed_at = datetime('now')
        WHERE id = ?
      `).run(req.params.id);
    }

    res.json({
      message: decision === 'approved' ? 'Déployé !' : 'Rejeté',
      status: decision === 'approved' ? 'deployed' : 'rejected',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── RECOMPENSES D'UN ENFANT ───
router.get('/rewards/:memberId', (req, res) => {
  try {
    const rewards = db.prepare(`
      SELECT fr.*, f.type as feedback_type, f.comment as feedback_comment
      FROM feedback_rewards fr
      LEFT JOIN feedback f ON fr.feedback_id = f.id
      WHERE fr.member_id = ?
      ORDER BY fr.created_at DESC
    `).all(req.params.memberId);

    const totalStars = db.prepare(`
      SELECT COALESCE(SUM(CAST(reward_value AS INTEGER)), 0) as total
      FROM feedback_rewards
      WHERE member_id = ? AND reward_type = 'foxie_star'
    `).get(req.params.memberId);

    const badges = db.prepare(`
      SELECT reward_value, reason, created_at
      FROM feedback_rewards
      WHERE member_id = ? AND reward_type = 'badge'
      ORDER BY created_at DESC
    `).all(req.params.memberId);

    res.json({
      rewards,
      totalStars: totalStars.total,
      badges,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
