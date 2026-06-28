const express = require('express');
const router = express.Router();
const llm = require('../services/llm');

// GET /api/llm/status — quel provider/modèle est actif par tier (sans clés)
router.get('/status', (req, res) => {
  try {
    res.json({ success: true, ...llm.status() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/llm/ping?tier=smart — petit appel réel pour valider un tier
router.get('/ping', async (req, res) => {
  const tier = req.query.tier || 'smart';
  const t0 = Date.now();
  try {
    const text = await llm.sendMessage(
      'Réponds en un seul mot.',
      [{ role: 'user', content: 'Dis OK.' }],
      20,
      { tier }
    );
    const resolved = llm.resolve(tier, { needsVision: tier === 'vision' });
    res.json({
      success: true,
      tier,
      provider: resolved.provider,
      model: resolved.model,
      ms: Date.now() - t0,
      reply: (text || '').trim(),
    });
  } catch (e) {
    res.status(500).json({ success: false, tier, error: e.message, ms: Date.now() - t0 });
  }
});

module.exports = router;
