const express = require('express');
const router = express.Router();
const revision = require('../services/revision');
const planner = require('../agents/revisionPlanner');

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

// ─── Agent 2: Algorithmic priority plan (no LLM) ─────────────────────────────

// GET /api/revision/priority/:memberId - Get priority-based revision plan
router.get('/priority/:memberId', (req, res) => {
  try {
    const result = planner.generatePlan(parseInt(req.params.memberId));
    res.json(result);
  } catch (error) {
    console.error('Priority plan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/revision/next/:memberId - Get the single next concept to work on
router.get('/next/:memberId', (req, res) => {
  const next = planner.getNextConcept(parseInt(req.params.memberId));
  res.json({ success: true, next });
});

module.exports = router;
