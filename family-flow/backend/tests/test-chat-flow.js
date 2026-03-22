/**
 * Test du flux complet de chat
 *
 * Simule un échange complet :
 * enfant envoie message → Foxie répond → training_data collecté → mastery mis à jour
 */

const db = require('../src/db/init');
const { updateMasteryGraph, getMasteryProfile } = require('../src/services/learnerProfile');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}`);
    failed++;
  }
}

function setup() {
  db.exec("DELETE FROM training_data WHERE member_id = 998");
  db.exec("DELETE FROM mastery_graph WHERE member_id = 998");
  db.exec("DELETE FROM homework_progress WHERE member_id = 998");
  db.exec("DELETE FROM homework_messages WHERE session_id IN (SELECT id FROM homework_sessions WHERE member_id = 998)");
  db.exec("DELETE FROM homework_sessions WHERE member_id = 998");
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("DELETE FROM members WHERE id = 998");
  db.exec("PRAGMA foreign_keys = ON");

  db.prepare(
    "INSERT INTO members (id, name, role, grade, age, avatar_color) VALUES (998, 'TestChat', 'child', '6eme', 11, '#BBB')"
  ).run();
}

function testFullChatFlow() {
  console.log('\n💬 Flux complet de chat');

  // 1. Créer une session homework
  const sessionResult = db.prepare(
    "INSERT INTO homework_sessions (member_id, subject, topic) VALUES (998, 'Mathématiques', 'Fractions')"
  ).run();
  const sessionId = sessionResult.lastInsertRowid;
  assert(sessionId > 0, 'Session homework créée');

  // 2. Simuler message enfant → réponse Foxie (tour 1)
  db.prepare(
    "INSERT INTO homework_messages (session_id, role, content) VALUES (?, 'user', ?)"
  ).run(sessionId, "C'est quoi une fraction ?");

  db.prepare(
    "INSERT INTO homework_messages (session_id, role, content) VALUES (?, 'assistant', ?)"
  ).run(sessionId, "Super question ! Une fraction, c'est une façon de représenter une partie d'un tout. Par exemple, si tu coupes une pizza en 4 parts et que tu en prends 1, tu as mangé 1/4 de la pizza !");

  // 3. Vérifier que les messages sont stockés
  const messages = db.prepare('SELECT * FROM homework_messages WHERE session_id = ?').all(sessionId);
  assert(messages.length === 2, '2 messages (user + assistant)');
  assert(messages[0].role === 'user', 'Premier message = user');
  assert(messages[1].role === 'assistant', 'Deuxième message = assistant');

  // 4. Simuler la collecte de training_data (comme le fait le middleware)
  db.prepare(`
    INSERT INTO training_data (session_id, member_id, turn_index, foxie_message, child_message, response_time_ms, subject)
    VALUES (?, 998, 0, ?, ?, 2100, 'Mathématiques')
  `).run(sessionId, messages[1].content, messages[0].content);

  const training = db.prepare('SELECT * FROM training_data WHERE session_id = ?').all(sessionId);
  assert(training.length === 1, 'Training data collectée pour ce tour');
  assert(training[0].response_time_ms === 2100, 'Temps de réponse enregistré');

  // 5. Tour 2 : l'enfant répond bien → mastery update
  db.prepare(
    "INSERT INTO homework_messages (session_id, role, content) VALUES (?, 'user', ?)"
  ).run(sessionId, "Ah ok ! Donc 2/4 c'est la moitié ?");

  db.prepare(
    "INSERT INTO homework_messages (session_id, role, content) VALUES (?, 'assistant', ?)"
  ).run(sessionId, "Exactement ! 2/4 = 1/2 = la moitié. Tu as tout compris ! On peut simplifier une fraction quand le numérateur et le dénominateur sont divisibles par le même nombre.");

  // Simuler annotation correcte
  db.prepare(`
    INSERT INTO training_data (session_id, member_id, turn_index, foxie_message, child_message, label, response_time_ms, subject)
    VALUES (?, 998, 1, ?, ?, 'correct', 1800, 'Mathématiques')
  `).run(
    sessionId,
    "Exactement ! 2/4 = 1/2 = la moitié.",
    "Ah ok ! Donc 2/4 c'est la moitié ?"
  );

  // 6. Mastery graph update après réponse correcte
  const masteryResult = updateMasteryGraph(998, 'fractions_concept_base', 'Mathématiques', true);
  assert(masteryResult.isNew === true, 'Concept fractions créé dans mastery graph');
  assert(masteryResult.score > 0, 'Score initial positif');

  // 7. Simuler progression dans homework_progress
  db.prepare(`
    INSERT OR REPLACE INTO homework_progress (member_id, subject, topic, understanding_level, session_count)
    VALUES (998, 'Mathématiques', 'Fractions', 3, 1)
  `).run();

  const progress = db.prepare(
    "SELECT * FROM homework_progress WHERE member_id = 998 AND topic = 'Fractions'"
  ).get();
  assert(progress.understanding_level === 3, 'Niveau de compréhension mis à jour');

  // 8. Vérifier le profil mastery complet
  const profile = getMasteryProfile(998);
  assert(profile.totalConcepts >= 1, 'Au moins 1 concept dans le profil');
}

function testMultiTurnConversation() {
  console.log('\n🔄 Conversation multi-tours');

  const sessionResult = db.prepare(
    "INSERT INTO homework_sessions (member_id, subject, topic) VALUES (998, 'Français', 'Conjugaison')"
  ).run();
  const sessionId = sessionResult.lastInsertRowid;

  // Simuler 5 tours d'échange
  const exchanges = [
    { user: "C'est quoi le passé simple ?", foxie: "Le passé simple est un temps du passé utilisé surtout à l'écrit.", label: null },
    { user: "Comment on conjugue manger ?", foxie: "Je mangeai, tu mangeas, il mangea...", label: 'correct' },
    { user: "Et boire ?", foxie: "Je bus, tu bus, il but... C'est un verbe du 3ème groupe.", label: 'correct' },
    { user: "j'sais pas trop", foxie: "Pas de souci ! On reprend depuis le début ?", label: 'partial' },
    { user: "oui", foxie: "Le passé simple a 4 terminaisons types...", label: null },
  ];

  for (let i = 0; i < exchanges.length; i++) {
    const ex = exchanges[i];
    db.prepare(
      "INSERT INTO homework_messages (session_id, role, content) VALUES (?, 'user', ?)"
    ).run(sessionId, ex.user);
    db.prepare(
      "INSERT INTO homework_messages (session_id, role, content) VALUES (?, 'assistant', ?)"
    ).run(sessionId, ex.foxie);
    db.prepare(`
      INSERT INTO training_data (session_id, member_id, turn_index, foxie_message, child_message, label, subject, attempt_number)
      VALUES (?, 998, ?, ?, ?, ?, 'Français', ?)
    `).run(sessionId, i, ex.foxie, ex.user, ex.label, i + 1);
  }

  const allMessages = db.prepare('SELECT * FROM homework_messages WHERE session_id = ?').all(sessionId);
  assert(allMessages.length === 10, '10 messages (5 tours × 2)');

  const trainingData = db.prepare('SELECT * FROM training_data WHERE session_id = ?').all(sessionId);
  assert(trainingData.length === 5, '5 entrées training_data');

  const labeled = trainingData.filter(t => t.label !== null);
  assert(labeled.length === 3, '3 entrées annotées');

  const correctCount = trainingData.filter(t => t.label === 'correct').length;
  assert(correctCount === 2, '2 réponses correctes');

  const partialCount = trainingData.filter(t => t.label === 'partial').length;
  assert(partialCount === 1, '1 réponse partielle');
}

function cleanup() {
  db.exec("DELETE FROM training_data WHERE member_id = 998");
  db.exec("DELETE FROM mastery_graph WHERE member_id = 998");
  db.exec("DELETE FROM homework_progress WHERE member_id = 998");
  db.exec("DELETE FROM homework_messages WHERE session_id IN (SELECT id FROM homework_sessions WHERE member_id = 998)");
  db.exec("DELETE FROM homework_sessions WHERE member_id = 998");
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("DELETE FROM members WHERE id = 998");
  db.exec("PRAGMA foreign_keys = ON");
}

// ─── Run all ───
console.log('═══════════════════════════════════════════');
console.log('  Tests Flux de Chat — Family Flow');
console.log('═══════════════════════════════════════════');

try {
  setup();
  testFullChatFlow();
  testMultiTurnConversation();
} finally {
  cleanup();
}

console.log('\n═══════════════════════════════════════════');
console.log(`  Résultats : ${passed} passés, ${failed} échoués`);
console.log('═══════════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
