/**
 * Option B — Pousse les données EcoleDirecte synchronisées EN LOCAL vers le
 * serveur cloud (Railway). À lancer depuis le Mac (qui, lui, sait parler à
 * EcoleDirecte). Foxie en ligne verra alors les devoirs, même Mac éteint ensuite.
 *
 * Usage :
 *   cd family-flow/backend && node scripts/push-to-cloud.js
 *
 * Variables (optionnelles, sinon valeurs par défaut) :
 *   CLOUD_URL   (def: https://edufamily-production.up.railway.app)
 *   CLOUD_CODE  (def: FAMILY_ACCESS_CODE du .env, sinon "famille2026")
 */
require('dotenv').config();
const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'db', 'init'));

const CLOUD_URL = (process.env.CLOUD_URL || 'https://edufamily-production.up.railway.app').replace(/\/$/, '');
const CLOUD_CODE = process.env.CLOUD_CODE || process.env.FAMILY_ACCESS_CODE || 'famille2026';

function rows(sql, id) {
  try { return db.prepare(sql).all(id); } catch { return []; }
}

async function main() {
  const children = db.prepare("SELECT id, name FROM members WHERE role = 'child'").all();
  const members = children.map(c => ({
    name: c.name,
    homework: rows('SELECT subject, description, due_date, done FROM kb_homework WHERE member_id = ?', c.id),
    timetable: rows('SELECT subject, teacher, room, day_of_week, start_time, end_time FROM kb_timetable WHERE member_id = ?', c.id),
    grades: rows('SELECT subject, student_avg, class_avg, period FROM kb_grades WHERE member_id = ?', c.id),
    textbooks: rows('SELECT subject, title, publisher, isbn, chapters, digital_url FROM kb_textbooks WHERE member_id = ?', c.id),
  }));

  const totalHw = members.reduce((s, m) => s + m.homework.length, 0);
  console.log(`Lecture locale : ${members.length} enfants, ${totalHw} devoirs au total.`);

  // 1) Connexion au cloud (code familial) pour obtenir le token
  const loginRes = await fetch(`${CLOUD_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: CLOUD_CODE }),
  });
  const loginJson = await loginRes.json().catch(() => ({}));
  if (!loginJson.token) {
    throw new Error('Connexion cloud échouée (code familial ?) : ' + JSON.stringify(loginJson));
  }

  // 2) Envoi des données
  const res = await fetch(`${CLOUD_URL}/api/kb/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-access-token': loginJson.token },
    body: JSON.stringify({ members }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.success) throw new Error('Import refusé : ' + JSON.stringify(json));
  console.log('✅ Données envoyées au cloud :');
  console.log(JSON.stringify(json.report, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error('❌ Erreur push-to-cloud :', err.message); process.exit(1); });
