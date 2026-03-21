const express = require('express');
const router = express.Router();
const db = require('../db/init');

// GET /api/family/members
router.get('/members', (req, res) => {
  const members = db.prepare('SELECT * FROM members ORDER BY id').all();
  res.json({ success: true, members });
});

// GET /api/family/members/:id
router.get('/members/:id', (req, res) => {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) {
    return res.status(404).json({ success: false, error: 'Membre non trouve' });
  }
  res.json({ success: true, member });
});

module.exports = router;
