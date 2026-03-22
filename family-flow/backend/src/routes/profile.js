const express = require('express');
const router = express.Router();
const { getLearnerProfile, getProgressionData, logEvent } = require('../services/learnerProfile');

// GET /api/profile/:memberId
router.get('/:memberId', (req, res) => {
  const profile = getLearnerProfile(parseInt(req.params.memberId));
  if (!profile) return res.status(404).json({ success: false, error: 'Membre non trouvé' });
  res.json({ success: true, profile });
});

// GET /api/profile/:memberId/progression
router.get('/:memberId/progression', (req, res) => {
  const data = getProgressionData(parseInt(req.params.memberId));
  res.json({ success: true, data });
});

// POST /api/profile/:memberId/event
router.post('/:memberId/event', (req, res) => {
  const { eventType, subject, topic, score, notes } = req.body;
  logEvent(parseInt(req.params.memberId), eventType, subject, topic, score, notes);
  res.json({ success: true });
});

module.exports = router;
