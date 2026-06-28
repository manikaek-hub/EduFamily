const express = require('express');
const router = express.Router();
const { checkCode, computeToken, authRequired } = require('../middleware/auth');

// GET /api/auth/status — indique au frontend si un code est requis (public)
router.get('/status', (req, res) => {
  res.json({ success: true, authRequired: authRequired() });
});

// POST /api/auth/login { code } — renvoie un token si le code est correct
router.post('/login', (req, res) => {
  const { code } = req.body || {};
  if (!authRequired()) {
    // Pas de code configuré : connexion ouverte
    return res.json({ success: true, token: computeToken(), authRequired: false });
  }
  if (checkCode(code)) {
    return res.json({ success: true, token: computeToken() });
  }
  return res.status(401).json({ success: false, error: 'Code d\'accès incorrect' });
});

module.exports = router;
