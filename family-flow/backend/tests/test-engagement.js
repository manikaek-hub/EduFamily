/**
 * Test Agent 5 — Engagement & Motivation
 *
 * Simule un enfant qui se désengage progressivement :
 * - Temps de réponse qui augmente
 * - Réponses de plus en plus courtes
 * - Taux de réponses correctes qui baisse
 *
 * Vérifie que le score d'engagement baisse et que
 * les signaux de désengagement sont détectés.
 */

const db = require('../src/db/init');

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

// ─── Scoring d'engagement simplifié ───
// Calcule un score 0-100 basé sur les signaux d'un tour
function computeEngagementScore(signals) {
  let score = 100;

  // Temps de réponse (rapide = engagé, lent = désengagé)
  if (signals.responseTimeMs > 30000) score -= 30;       // > 30s : très lent
  else if (signals.responseTimeMs > 15000) score -= 15;  // > 15s : lent
  else if (signals.responseTimeMs > 8000) score -= 5;    // > 8s : normal
  // < 8s : pas de pénalité

  // Longueur du message (court = désengagé)
  if (signals.messageLength < 5) score -= 25;            // < 5 chars : minimal
  else if (signals.messageLength < 15) score -= 10;      // < 15 chars : court
  // > 15 chars : pas de pénalité

  // Taux de réponses correctes
  if (signals.isCorrect === false) score -= 15;
  if (signals.isCorrect === true) score += 5;

  // Messages hors-sujet
  if (signals.isOffTopic) score -= 20;

  // Mots de désengagement
  if (signals.hasDisengagementWords) score -= 20;

  return Math.max(0, Math.min(100, score));
}

// ─── Détection de mots de désengagement ───
function detectDisengagement(message) {
  const patterns = [
    /j'?sais pas/i, /j'?en sais rien/i, /je sais pas/i,
    /c'est nul/i, /j'?ai pas envie/i, /ennui/i, /boring/i,
    /je veux arrêter/i, /j'?arrête/i, /laisse tomber/i,
    /pff+/i, /bof/i, /mouais/i, /meh/i,
    /^ok$/i, /^oui$/i, /^non$/i, /^\.+$/,
  ];
  return patterns.some(p => p.test(message.trim()));
}

// ─── Recommandation Foxie basée sur l'engagement ───
function getFoxieStrategy(currentScore, trend) {
  if (currentScore >= 80) return 'continuer';
  if (currentScore >= 50 && trend === 'stable') return 'encourager';
  if (currentScore >= 50 && trend === 'baisse') return 'changer_approche';
  if (currentScore < 30) return 'proposer_arret';
  if (currentScore < 50 && trend === 'baisse') return 'pause_jeu';
  return 'encourager';
}

function setup() {
  db.exec("DELETE FROM engagement_log WHERE member_id = 997");
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("DELETE FROM members WHERE id = 997");
  db.exec("PRAGMA foreign_keys = ON");

  db.prepare(
    "INSERT INTO members (id, name, role, grade, age, avatar_color) VALUES (997, 'TestEngagement', 'child', 'CM1', 9, '#CCC')"
  ).run();
}

function testProgressiveDisengagement() {
  console.log('\n📉 Simulation de désengagement progressif');

  // Simuler 8 tours avec un enfant qui se désengage
  const turns = [
    { msg: "Oui je suis prêt pour les maths !", responseMs: 2000, correct: true },
    { msg: "C'est 3/4 parce que 3 sur 4 parts", responseMs: 4000, correct: true },
    { msg: "Hmm je crois que c'est 5/8", responseMs: 8000, correct: true },
    { msg: "Euh... 2/3 ?", responseMs: 12000, correct: false },
    { msg: "je sais pas", responseMs: 18000, correct: false },
    { msg: "bof", responseMs: 25000, correct: false },
    { msg: "ok", responseMs: 35000, correct: false },
    { msg: "...", responseMs: 45000, correct: false },
  ];

  const scores = [];

  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const signals = {
      responseTimeMs: t.responseMs,
      messageLength: t.msg.length,
      isCorrect: t.correct,
      isOffTopic: false,
      hasDisengagementWords: detectDisengagement(t.msg),
    };

    const score = computeEngagementScore(signals);
    scores.push(score);

    db.prepare(
      'INSERT INTO engagement_log (member_id, score, signals) VALUES (997, ?, ?)'
    ).run(score, JSON.stringify(signals));
  }

  // Vérifications
  assert(scores[0] >= 80, `Tour 1 : score élevé (${scores[0]}) — enfant engagé`);
  assert(scores[3] < scores[0], `Tour 4 : score baisse (${scores[3]}) après erreur`);
  assert(scores[5] < 60, `Tour 6 : score < 60 (${scores[5]}) — "bof" détecté`);
  assert(scores[7] < 30, `Tour 8 : score très bas (${scores[7]}) — désengagement total`);

  // Tendance globale
  const firstHalf = scores.slice(0, 4).reduce((a, b) => a + b) / 4;
  const secondHalf = scores.slice(4).reduce((a, b) => a + b) / 4;
  assert(secondHalf < firstHalf, `Tendance baissière confirmée (${Math.round(firstHalf)} → ${Math.round(secondHalf)})`);
}

function testDisengagementDetection() {
  console.log('\n🔍 Détection de mots de désengagement');

  assert(detectDisengagement("j'sais pas") === true, '"j\'sais pas" détecté');
  assert(detectDisengagement("bof") === true, '"bof" détecté');
  assert(detectDisengagement("ok") === true, '"ok" seul détecté');
  assert(detectDisengagement("...") === true, '"..." détecté');
  assert(detectDisengagement("je veux arrêter") === true, '"je veux arrêter" détecté');
  assert(detectDisengagement("laisse tomber") === true, '"laisse tomber" détecté');

  assert(detectDisengagement("C'est 3/4 !") === false, 'Réponse normale non détectée');
  assert(detectDisengagement("Je crois que c'est la bonne réponse") === false, 'Réponse engagée non détectée');
  assert(detectDisengagement("Ok j'ai compris, c'est le numérateur !") === false, 'Réponse longue avec "ok" non détectée');
}

function testFoxieStrategyAdaptation() {
  console.log('\n🦊 Adaptation de la stratégie Foxie');

  assert(getFoxieStrategy(90, 'stable') === 'continuer', 'Score élevé + stable → continuer');
  assert(getFoxieStrategy(60, 'stable') === 'encourager', 'Score moyen + stable → encourager');
  assert(getFoxieStrategy(55, 'baisse') === 'changer_approche', 'Score moyen + baisse → changer approche');
  assert(getFoxieStrategy(40, 'baisse') === 'pause_jeu', 'Score bas + baisse → pause/jeu');
  assert(getFoxieStrategy(20, 'baisse') === 'proposer_arret', 'Score très bas → proposer arrêt');
}

function testEngagementRecovery() {
  console.log('\n🔄 Récupération après encouragement');

  // Simuler un rebond : l'enfant se réengage après que Foxie change d'approche
  const recoveryTurns = [
    { msg: "meh", responseMs: 20000, correct: false },  // Bas
    { msg: "ok on essaie un jeu ?", responseMs: 3000, correct: true },  // Rebond !
    { msg: "Oh c'est cool ça ! 4/6 ?", responseMs: 4000, correct: true },  // Engagé
  ];

  const recoveryScores = recoveryTurns.map(t => {
    const signals = {
      responseTimeMs: t.responseMs,
      messageLength: t.msg.length,
      isCorrect: t.correct,
      isOffTopic: false,
      hasDisengagementWords: detectDisengagement(t.msg),
    };
    return computeEngagementScore(signals);
  });

  assert(recoveryScores[0] < 50, `Phase basse (${recoveryScores[0]})`);
  assert(recoveryScores[2] > recoveryScores[0], `Rebond après changement (${recoveryScores[0]} → ${recoveryScores[2]})`);
  assert(recoveryScores[2] >= 70, `Score remonté (${recoveryScores[2]})`);
}

function cleanup() {
  db.exec("DELETE FROM engagement_log WHERE member_id = 997");
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("DELETE FROM members WHERE id = 997");
  db.exec("PRAGMA foreign_keys = ON");
}

// ─── Run all ───
console.log('═══════════════════════════════════════════');
console.log('  Tests Engagement — Family Flow');
console.log('═══════════════════════════════════════════');

try {
  setup();
  testProgressiveDisengagement();
  testDisengagementDetection();
  testFoxieStrategyAdaptation();
  testEngagementRecovery();
} finally {
  cleanup();
}

console.log('\n═══════════════════════════════════════════');
console.log(`  Résultats : ${passed} passés, ${failed} échoués`);
console.log('═══════════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
