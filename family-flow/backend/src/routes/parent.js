const express = require('express');
const router = express.Router();
const { generateWeeklyReport, getLatestReport } = require('../agents/parentCoach');

// GET /api/parent/report/:memberId - Get latest report
router.get('/report/:memberId', (req, res) => {
  const result = getLatestReport(parseInt(req.params.memberId));
  res.json(result);
});

// POST /api/parent/report/:memberId - Generate a new report
router.post('/report/:memberId', async (req, res) => {
  try {
    const result = await generateWeeklyReport(parseInt(req.params.memberId));
    res.json(result);
  } catch (error) {
    console.error('Parent report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
