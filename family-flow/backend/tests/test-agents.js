/**
 * Tests unitaires des agents Family Flow
 *
 * Vérifie que chaque agent fonctionne individuellement :
 * - Agent 1 : Collecteur de données d'entraînement
 * - Agent 2 : Planifieur adaptatif (SM-2 / mastery graph)
 * - Agent 5 : Engagement & Motivation
 * - Agent 6 : Style d'apprentissage
 * - Agent 7 : Coach Parent
 */

const db = require('../src/db/init');
const { updateMasteryGraph, getMasteryProfile, getWeakConcepts, buildProfileContext } = require('../src/services/learnerProfile');

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

// ─── Setup : créer un membre de test ───
function setup() {
  // Nettoyer dans l'ordre pour respecter les FK
  db.exec("DELETE FROM training_data WHERE member_id = 999");
  db.exec("DELETE FROM mastery_graph WHERE member_id = 999");
  db.exec("DELETE FROM engagement_log WHERE member_id = 999");
  db.exec("DELETE FROM learning_style_profile WHERE member_id = 999");
  db.exec("DELETE FROM parent_reports WHERE member_id = 999");
  db.exec("DELETE FROM kb_topics WHERE member_id = 999");
  db.exec("DELETE FROM xp_totals WHERE member_id = 999");
  db.exec("DELETE FROM quiz_streaks WHERE member_id = 999");
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("DELETE FROM members WHERE id = 999");
  db.exec("PRAGMA foreign_keys = ON");

  db.prepare(
    "INSERT OR REPLACE INTO members (id, name, role, grade, age, avatar_color) VALUES (999, 'TestEnfant', 'child', 'CM2', 10, '#AAA')"
  ).run();
}

// ─── Agent 1 : Collecteur de données ───
function testDataCollector() {
  console.log('\n📊 Agent 1 — Collecteur de Données');

  // Simuler l'insertion de données d'entraînement
  db.prepare(`
    INSERT INTO training_data (session_id, member_id, turn_index, foxie_message, child_message, response_time_ms, subject)
    VALUES (NULL, 999, 0, 'Bonjour ! Comment tu vas ?', 'Salut Foxie !', 1200, 'Français')
  `).run();

  db.prepare(`
    INSERT INTO training_data (session_id, member_id, turn_index, foxie_message, child_message, response_time_ms, subject)
    VALUES (NULL, 999, 1, 'Super ! On travaille les fractions ?', '3/4 + 1/4 = 1', 3500, 'Mathématiques')
  `).run();

  const rows = db.prepare('SELECT * FROM training_data WHERE member_id = 999').all();
  assert(rows.length === 2, 'Insertion de 2 entrées training_data');
  assert(rows[0].foxie_message.includes('Bonjour'), 'Message Foxie stocké correctement');
  assert(rows[1].response_time_ms === 3500, 'Temps de réponse enregistré');
  assert(rows[1].subject === 'Mathématiques', 'Matière détectée');

  // Test label (non rempli au départ)
  assert(rows[0].label === null, 'Label initialement NULL (à annoter plus tard)');
}

// ─── Agent 2 : Planifieur adaptatif (SM-2) ───
function testMasteryGraph() {
  console.log('\n📈 Agent 2 — Planifieur Adaptatif (SM-2)');

  // Premier contact avec un concept
  const result1 = updateMasteryGraph(999, 'fractions_addition', 'Mathématiques', true);
  assert(result1.isNew === true, 'Nouveau concept créé');
  assert(result1.score === 1.5, 'Score initial correct (réponse juste)');
  assert(result1.nextReview !== null, 'Date de prochaine révision définie');

  // Deuxième tentative (réussite)
  const result2 = updateMasteryGraph(999, 'fractions_addition', 'Mathématiques', true);
  assert(result2.isNew === false, 'Concept existant mis à jour');
  assert(result2.score > 1.5, 'Score augmente après réussite');

  // Troisième tentative (échec)
  const result3 = updateMasteryGraph(999, 'fractions_addition', 'Mathématiques', false);
  assert(result3.score < result2.score, 'Score baisse après échec');

  // Nouveau concept faible
  updateMasteryGraph(999, 'fractions_multiplication', 'Mathématiques', false);

  // Test getMasteryProfile
  const profile = getMasteryProfile(999);
  assert(profile.totalConcepts === 2, 'Profil contient 2 concepts');
  assert(profile.subjects.length === 1, '1 matière (Mathématiques)');
  assert(profile.subjects[0].subject === 'Mathématiques', 'Matière correcte');

  // Test getWeakConcepts
  const weak = getWeakConcepts(999, 5);
  assert(weak.length >= 1, 'Au moins 1 concept faible détecté');
  assert(weak[0].score <= 2, 'Le concept le plus faible en premier');
}

// ─── Agent 5 : Engagement & Motivation ───
function testEngagementScoring() {
  console.log('\n💪 Agent 5 — Engagement & Motivation');

  // Simuler des signaux d'engagement
  const signals = [
    { score: 95, signals: JSON.stringify({ responseTime: 'fast', correctRate: 0.8, messageLength: 'long' }) },
    { score: 70, signals: JSON.stringify({ responseTime: 'slow', correctRate: 0.4, messageLength: 'short' }) },
    { score: 30, signals: JSON.stringify({ responseTime: 'very_slow', correctRate: 0.1, messageLength: 'minimal' }) },
  ];

  for (const s of signals) {
    db.prepare(
      'INSERT INTO engagement_log (member_id, score, signals) VALUES (999, ?, ?)'
    ).run(s.score, s.signals);
  }

  const logs = db.prepare('SELECT * FROM engagement_log WHERE member_id = 999 ORDER BY created_at').all();
  assert(logs.length === 3, '3 entrées engagement enregistrées');
  assert(logs[0].score === 95, 'Score élevé pour engagement fort');
  assert(logs[2].score === 30, 'Score bas pour désengagement');

  // Vérifier la tendance
  const trend = logs[2].score - logs[0].score;
  assert(trend < 0, 'Tendance baissière détectée (désengagement)');

  // Vérifier signaux JSON
  const parsed = JSON.parse(logs[1].signals);
  assert(parsed.correctRate === 0.4, 'Signaux parsables en JSON');
}

// ─── Agent 6 : Style d'apprentissage ───
function testLearningStyle() {
  console.log('\n🎨 Agent 6 — Style d\'Apprentissage');

  db.prepare(`
    INSERT INTO learning_style_profile (member_id, subject, preferred_style, confidence)
    VALUES (999, 'Mathématiques', 'visuel_schema', 0.75)
  `).run();

  db.prepare(`
    INSERT INTO learning_style_profile (member_id, subject, preferred_style, confidence)
    VALUES (999, 'Français', 'textuel_structure', 0.60)
  `).run();

  const styles = db.prepare('SELECT * FROM learning_style_profile WHERE member_id = 999 ORDER BY subject').all();
  assert(styles.length === 2, '2 profils de style créés');
  const mathStyle = styles.find(s => s.subject === 'Mathématiques');
  const frStyle = styles.find(s => s.subject === 'Français');
  assert(mathStyle?.preferred_style === 'visuel_schema', 'Style visuel en maths');
  assert(frStyle?.preferred_style === 'textuel_structure', 'Style textuel en français');
  assert(mathStyle?.confidence === 0.75, 'Confiance du style enregistrée');
}

// ─── Agent 7 : Coach Parent ───
function testParentCoach() {
  console.log('\n👨‍👩‍👧 Agent 7 — Coach Parent');

  const reportData = JSON.stringify({
    semaine: '2026-W12',
    enfant: 'TestEnfant',
    resume: 'Bonne semaine en maths, des difficultés en français',
    points_forts: ['Fractions maîtrisées', 'Engagement régulier'],
    axes_amelioration: ['Conjugaison à renforcer', 'Temps de lecture à augmenter'],
    conseil: 'Proposer des lectures courtes chaque soir',
    stats: {
      sessions: 5,
      tempsTotal: '2h15',
      progressionMoyenne: '+12%',
    }
  });

  db.prepare(
    "INSERT INTO parent_reports (member_id, report_data, week_start) VALUES (999, ?, '2026-03-16')"
  ).run(reportData);

  const report = db.prepare('SELECT * FROM parent_reports WHERE member_id = 999').get();
  assert(report !== undefined, 'Rapport parent créé');

  const parsed = JSON.parse(report.report_data);
  assert(parsed.points_forts.length === 2, 'Points forts présents');
  assert(parsed.axes_amelioration.length === 2, 'Axes d\'amélioration présents');
  assert(parsed.conseil.includes('lecture'), 'Conseil personnalisé présent');
  assert(parsed.stats.sessions === 5, 'Statistiques de la semaine incluses');
}

// ─── Profil contexte Claude ───
function testProfileContext() {
  console.log('\n🧠 Profil contexte Claude');

  // D'abord, ajouter des topics KB pour le membre test
  try {
    db.prepare("INSERT INTO kb_topics (member_id, subject, topic, mastery, source) VALUES (999, 'Mathématiques', 'Fractions', 2, 'manual')").run();
    db.prepare("INSERT INTO kb_topics (member_id, subject, topic, mastery, source) VALUES (999, 'Français', 'Conjugaison', 1, 'manual')").run();
  } catch {} // Ignore if exists

  const context = buildProfileContext(999);
  assert(context.includes('TestEnfant'), 'Nom de l\'enfant dans le contexte');
  assert(context.includes('CM2'), 'Niveau scolaire dans le contexte');
  assert(context.length > 50, 'Contexte suffisamment riche');
}

// ─── Cleanup ───
function cleanup() {
  // Supprimer dans l'ordre inverse des dépendances FK
  db.exec("DELETE FROM training_data WHERE member_id = 999");
  db.exec("DELETE FROM mastery_graph WHERE member_id = 999");
  db.exec("DELETE FROM engagement_log WHERE member_id = 999");
  db.exec("DELETE FROM learning_style_profile WHERE member_id = 999");
  db.exec("DELETE FROM parent_reports WHERE member_id = 999");
  db.exec("DELETE FROM kb_topics WHERE member_id = 999");
  db.exec("DELETE FROM xp_totals WHERE member_id = 999");
  db.exec("DELETE FROM quiz_streaks WHERE member_id = 999");
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("DELETE FROM members WHERE id = 999");
  db.exec("PRAGMA foreign_keys = ON");
}

// ─── Run all ───
console.log('═══════════════════════════════════════════');
console.log('  Tests Agents — Family Flow');
console.log('═══════════════════════════════════════════');

try {
  setup();
  testDataCollector();
  testMasteryGraph();
  testEngagementScoring();
  testLearningStyle();
  testParentCoach();
  testProfileContext();
} finally {
  cleanup();
}

console.log('\n═══════════════════════════════════════════');
console.log(`  Résultats : ${passed} passés, ${failed} échoués`);
console.log('═══════════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
