/**
 * Emplacements des données.
 *
 * - En local : DATA_DIR = backend/data (comportement historique)
 * - En ligne : définir DATA_DIR=/data (disque persistant monté par l'hébergeur)
 *   pour que la base SQLite et les photos SURVIVENT aux redéploiements.
 *
 * NB: le curriculum (familyflow_curriculum.json) reste livré AVEC le code dans
 * backend/data/ — il n'est PAS sous DATA_DIR (donnée statique, pas à persister).
 */
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const PHOTOS_DIR = path.join(DATA_DIR, 'photos');

try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
} catch {}

module.exports = { DATA_DIR, PHOTOS_DIR };
