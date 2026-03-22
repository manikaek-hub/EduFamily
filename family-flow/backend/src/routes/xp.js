const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/xp/leaderboard - Get XP leaderboard for all members
router.get('/leaderboard', (req, res) => {
  const rows = db.prepare(`
    SELECT xt.*, m.name, m.avatar_color, m.role
    FROM xp_totals xt
    JOIN members m ON xt.member_id = m.id
    ORDER BY xt.total_xp DESC
  `).all();

  // Also include members with 0 XP
  const allMembers = db.prepare('SELECT * FROM members').all();
  const leaderboard = allMembers.map(m => {
    const xp = rows.find(r => r.member_id === m.id);
    return {
      member_id: m.id,
      name: m.name,
      avatar_color: m.avatar_color,
      role: m.role,
      total_xp: xp?.total_xp || 0,
      level: xp?.level || 1,
    };
  }).sort((a, b) => b.total_xp - a.total_xp);

  res.json({ success: true, leaderboard });
});

// POST /api/xp/award - Award XP to a member
router.post('/award', (req, res) => {
  const { memberId, eventType, points, description } = req.body;
  if (!memberId || !eventType || !points) {
    return res.status(400).json({ success: false, error: 'memberId, eventType, points requis' });
  }

  db.prepare('INSERT INTO xp_events (member_id, event_type, points, description) VALUES (?, ?, ?, ?)')
    .run(memberId, eventType, points, description || '');

  const existing = db.prepare('SELECT total_xp FROM xp_totals WHERE member_id = ?').get(memberId);
  let newTotal, level;
  if (existing) {
    newTotal = existing.total_xp + points;
    level = Math.floor(Math.sqrt(newTotal / 50)) + 1;
    db.prepare('UPDATE xp_totals SET total_xp = ?, level = ?, updated_at = datetime("now") WHERE member_id = ?')
      .run(newTotal, level, memberId);
  } else {
    newTotal = points;
    level = 1;
    db.prepare('INSERT INTO xp_totals (member_id, total_xp, level) VALUES (?, ?, 1)').run(memberId, newTotal);
  }

  res.json({ success: true, totalXp: newTotal, level });
});

// GET /api/xp/member/:memberId - Get XP history for a member
router.get('/member/:memberId', (req, res) => {
  const events = db.prepare(
    'SELECT * FROM xp_events WHERE member_id = ? ORDER BY created_at DESC LIMIT 20'
  ).all(req.params.memberId);
  const totals = db.prepare('SELECT * FROM xp_totals WHERE member_id = ?').get(req.params.memberId);
  res.json({ success: true, events, totals: totals || { total_xp: 0, level: 1 } });
});

module.exports = router;
