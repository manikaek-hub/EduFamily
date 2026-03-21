const express = require('express');
const router = express.Router();
const revision = require('../services/revision');

// POST /api/revision/generate - Generate revision plan
router.post('/generate', async (req, res) => {
  try {
    const { memberId } = req.body;
    if (!memberId) return res.status(400).json({ success: false, error: 'memberId requis' });

    const result = await revision.generatePlan(memberId);
    res.json(result);
  } catch (error) {
    console.error('Revision generate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/revision/plan/:memberId - Get active plan
router.get('/plan/:memberId', (req, res) => {
  const plan = revision.getActivePlan(parseInt(req.params.memberId));
  if (!plan) {
    return res.json({ success: true, plan: null });
  }
  res.json({ success: true, ...plan });
});

// PUT /api/revision/progress - Toggle item completion
router.put('/progress', (req, res) => {
  const { planId, dayIndex, itemIndex } = req.body;
  const result = revision.toggleProgress(planId, dayIndex, itemIndex);
  res.json({ success: true, ...result });
});

module.exports = router;
