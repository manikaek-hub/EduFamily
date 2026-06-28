/**
 * Option B — Envoi des données EcoleDirecte (synchronisées en local) vers le
 * serveur cloud. Utilisé par scripts/push-to-cloud.js (manuel) ET par le
 * syncAgent (automatique après chaque synchro, si PUSH_TO_CLOUD=true).
 *
 * IMPORTANT : ne s'active QUE si l'env PUSH_TO_CLOUD=true (mis sur le Mac
 * uniquement, JAMAIS sur le serveur cloud, sinon il se pousserait lui-même).
 */
const db = require('../db/init');

function rows(sql, id) {
  try { return db.prepare(sql).all(id); } catch { return []; }
}

function isEnabled() {
  return String(process.env.PUSH_TO_CLOUD || '').toLowerCase() === 'true';
}

async function pushToCloud() {
  const CLOUD_URL = (process.env.CLOUD_URL || 'https://edufamily-production.up.railway.app').replace(/\/$/, '');
  const CLOUD_CODE = process.env.CLOUD_CODE || process.env.FAMILY_ACCESS_CODE || 'famille2026';

  const children = db.prepare("SELECT id, name FROM members WHERE role = 'child'").all();
  const members = children.map(c => ({
    name: c.name,
    homework: rows('SELECT subject, description, due_date, done FROM kb_homework WHERE member_id = ?', c.id),
    timetable: rows('SELECT subject, teacher, room, day_of_week, start_time, end_time FROM kb_timetable WHERE member_id = ?', c.id),
    grades: rows('SELECT subject, student_avg, class_avg, period FROM kb_grades WHERE member_id = ?', c.id),
    textbooks: rows('SELECT subject, title, publisher, isbn, chapters, digital_url FROM kb_textbooks WHERE member_id = ?', c.id),
  }));

  const loginRes = await fetch(`${CLOUD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: CLOUD_CODE }),
  });
  const loginJson = await loginRes.json().catch(() => ({}));
  if (!loginJson.token) throw new Error('Connexion cloud échouée (code familial ?)');

  const res = await fetch(`${CLOUD_URL}/api/kb/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-access-token': loginJson.token },
    body: JSON.stringify({ members }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.success) throw new Error('Import refusé : ' + JSON.stringify(json));
  return json.report;
}

module.exports = { pushToCloud, isEnabled };
