/**
 * Authentification simple par "code d'accès familial".
 *
 * - Le code est défini dans .env : FAMILY_ACCESS_CODE
 * - Si FAMILY_ACCESS_CODE est VIDE/absent : l'auth est désactivée (usage local
 *   ouvert, comportement historique). Dès qu'un code est défini (ex: pour
 *   l'hébergement en ligne), toutes les routes /api sont protégées.
 * - Pas de base de sessions : le token est dérivé du code + d'un secret serveur
 *   (HMAC). Le frontend le renvoie dans l'en-tête `x-access-token`.
 */
const crypto = require('crypto');

function accessCode() {
  return process.env.FAMILY_ACCESS_CODE || '';
}

function authSecret() {
  // Secret serveur pour signer le token. Défini en prod via AUTH_SECRET.
  return process.env.AUTH_SECRET || 'familyflow-default-secret-change-me';
}

function authRequired() {
  return !!accessCode();
}

/** Token attendu, dérivé du code + secret (stable, vérifiable sans session). */
function computeToken() {
  return crypto
    .createHmac('sha256', authSecret())
    .update(accessCode())
    .digest('hex');
}

/** Comparaison à temps constant (évite les attaques par timing). */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Vérifie un code soumis à la connexion. */
function checkCode(code) {
  if (!authRequired()) return true;
  return safeEqual(code || '', accessCode());
}

/** Vérifie un token présenté par le frontend. */
function checkToken(token) {
  if (!authRequired()) return true;
  return safeEqual(token || '', computeToken());
}

/** Middleware : protège les routes /api (sauf /auth/* et /health). */
function requireAuth(req, res, next) {
  if (!authRequired()) return next();
  // Routes publiques (chemin relatif quand monté sur '/api')
  if (req.path === '/health' || req.path.startsWith('/auth/')) return next();

  const token =
    req.headers['x-access-token'] ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

  if (checkToken(token)) return next();
  return res.status(401).json({ success: false, error: 'Code d\'accès requis' });
}

module.exports = { requireAuth, checkCode, checkToken, computeToken, authRequired };
