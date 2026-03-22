const db = require('./init');

// ═══════════════════════════════════════════════════════════
// SEED DATA — Famille de Manika
// Gauthier (4ème), Charles (6ème), Victoire (CE1)
// ═══════════════════════════════════════════════════════════

const members = [
  { name: 'Victoire', role: 'child', grade: 'CE1', age: 7, avatar_color: '#E8A0BF' },
  { name: 'Charles', role: 'child', grade: '6eme', age: 11, avatar_color: '#4A90D9' },
  { name: 'Gauthier', role: 'child', grade: '4eme', age: 14, avatar_color: '#7C9082' },
  { name: 'Manika', role: 'parent', grade: null, age: null, avatar_color: '#C4A484' },
];

// ─── 1. Membres de la famille ───
const existing = db.prepare('SELECT COUNT(*) as count FROM members').get();
if (existing.count === 0) {
  const insert = db.prepare(
    'INSERT INTO members (name, role, grade, age, avatar_color) VALUES (?, ?, ?, ?, ?)'
  );
  for (const m of members) {
    insert.run(m.name, m.role, m.grade, m.age, m.avatar_color);
  }
  console.log('Famille seedée : Victoire (CE1), Charles (6ème), Gauthier (4ème), Manika (parent)');
} else {
  console.log(`${existing.count} membres existent déjà, seed ignoré.`);
}

// ─── 2. Activités exemple ───
const activityCount = db.prepare('SELECT COUNT(*) as count FROM activities').get();
if (activityCount.count === 0) {
  const insertActivity = db.prepare(
    'INSERT INTO activities (title, description, category, start_time, end_time, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertMember = db.prepare(
    'INSERT INTO activity_members (activity_id, member_id) VALUES (?, ?)'
  );

  const sampleActivities = [
    { title: 'Cours de piano - Victoire', desc: 'Cours hebdomadaire de piano', cat: 'music', start: '2026-03-23T14:00:00', end: '2026-03-23T15:00:00', by: 4, members: [1] },
    { title: 'Entrainement foot - Charles', desc: 'Entrainement au stade', cat: 'sports', start: '2026-03-24T17:00:00', end: '2026-03-24T18:30:00', by: 4, members: [2] },
    { title: 'Cours de tennis - Gauthier', desc: 'Tennis club', cat: 'sports', start: '2026-03-25T18:00:00', end: '2026-03-25T19:30:00', by: 4, members: [3] },
    { title: 'Sortie famille au parc', desc: 'Pique-nique au parc', cat: 'family', start: '2026-03-22T10:00:00', end: '2026-03-22T16:00:00', by: 4, members: [1, 2, 3, 4] },
    { title: 'Rendez-vous dentiste - Victoire', desc: 'Contrôle annuel', cat: 'medical', start: '2026-03-26T09:00:00', end: '2026-03-26T10:00:00', by: 4, members: [1] },
    { title: 'Réunion parents-profs Charles', desc: 'Réunion 6ème', cat: 'school', start: '2026-03-27T18:00:00', end: '2026-03-27T19:30:00', by: 4, members: [2, 4] },
  ];

  for (const a of sampleActivities) {
    const result = insertActivity.run(a.title, a.desc, a.cat, a.start, a.end, a.by);
    for (const mid of a.members) {
      insertMember.run(result.lastInsertRowid, mid);
    }
  }
  console.log('Activités exemples créées !');
}

// ─── 3. Posts exemple ───
const postCount = db.prepare('SELECT COUNT(*) as count FROM posts').get();
if (postCount.count === 0) {
  const insertPost = db.prepare(
    'INSERT INTO posts (member_id, content, post_type) VALUES (?, ?, ?)'
  );
  insertPost.run(1, 'J\'ai lu tout mon livre de lecture toute seule !', 'achievement');
  insertPost.run(2, 'Match de foot samedi prochain, venez me supporter !', 'announcement');
  insertPost.run(3, 'J\'ai eu 16 en maths au dernier contrôle !', 'achievement');
  insertPost.run(4, 'Bravo à tous pour cette belle semaine ! On est fiers de vous', 'highlight');
  console.log('Posts exemples créés !');
}

// ─── 4. Progression scolaire (homework_progress) ───
const progressCount = db.prepare('SELECT COUNT(*) as count FROM homework_progress').get();
if (progressCount.count === 0) {
  const insertProgress = db.prepare(
    'INSERT INTO homework_progress (member_id, subject, topic, understanding_level, session_count) VALUES (?, ?, ?, ?, ?)'
  );

  // Victoire (CE1) - id=1
  insertProgress.run(1, 'Français', 'Lecture de syllabes', 4, 3);
  insertProgress.run(1, 'Français', 'Les sons complexes (ou, on, an)', 3, 2);
  insertProgress.run(1, 'Mathématiques', 'Addition sans retenue', 4, 4);
  insertProgress.run(1, 'Mathématiques', 'Les doubles et moitiés', 2, 1);
  insertProgress.run(1, 'Mathématiques', 'Compter jusqu\'à 100', 5, 3);

  // Charles (6ème) - id=2
  insertProgress.run(2, 'Mathématiques', 'Nombres décimaux', 3, 2);
  insertProgress.run(2, 'Mathématiques', 'Fractions', 2, 3);
  insertProgress.run(2, 'Mathématiques', 'Géométrie - Symétrie axiale', 4, 2);
  insertProgress.run(2, 'Français', 'Conjugaison - Passé simple', 2, 2);
  insertProgress.run(2, 'Français', 'Grammaire - COD et COI', 3, 1);
  insertProgress.run(2, 'Histoire', 'Rome antique', 4, 2);
  insertProgress.run(2, 'Anglais', 'Present simple vs continuous', 3, 2);

  // Gauthier (4ème) - id=3
  insertProgress.run(3, 'Mathématiques', 'Théorème de Pythagore', 4, 3);
  insertProgress.run(3, 'Mathématiques', 'Calcul littéral - Développer', 3, 2);
  insertProgress.run(3, 'Mathématiques', 'Équations du premier degré', 2, 1);
  insertProgress.run(3, 'Physique-Chimie', 'Loi d\'Ohm', 3, 2);
  insertProgress.run(3, 'Français', 'Commentaire de texte', 2, 2);
  insertProgress.run(3, 'Histoire', 'La Révolution française', 4, 3);
  insertProgress.run(3, 'Anglais', 'Past perfect', 3, 1);
  insertProgress.run(3, 'SVT', 'Reproduction humaine', 4, 1);

  console.log('Progression scolaire pré-remplie !');
}

// ─── 5. XP totaux ───
const xpCount = db.prepare('SELECT COUNT(*) as count FROM xp_totals').get();
if (xpCount.count === 0) {
  const insertXp = db.prepare(
    'INSERT INTO xp_totals (member_id, total_xp, level) VALUES (?, ?, ?)'
  );
  insertXp.run(1, 250, 3);   // Victoire
  insertXp.run(2, 580, 6);   // Charles
  insertXp.run(3, 720, 8);   // Gauthier

  // Quelques événements XP
  const insertXpEvent = db.prepare(
    'INSERT INTO xp_events (member_id, event_type, points, description) VALUES (?, ?, ?, ?)'
  );
  insertXpEvent.run(1, 'homework_done', 20, 'Exercice de lecture terminé');
  insertXpEvent.run(1, 'quiz_correct', 10, 'Quiz addition réussi');
  insertXpEvent.run(1, 'streak_bonus', 30, 'Série de 3 jours');
  insertXpEvent.run(2, 'homework_done', 25, 'Exercice fractions terminé');
  insertXpEvent.run(2, 'foxie_session', 15, 'Session Foxie en histoire');
  insertXpEvent.run(2, 'quiz_correct', 10, 'Quiz symétrie réussi');
  insertXpEvent.run(3, 'homework_done', 30, 'Exercice Pythagore terminé');
  insertXpEvent.run(3, 'foxie_session', 20, 'Session Foxie en physique');
  insertXpEvent.run(3, 'streak_bonus', 50, 'Série de 5 jours');

  console.log('XP initialisés !');
}

// ─── 6. Knowledge Base — Matières par enfant ───
const kbCount = db.prepare('SELECT COUNT(*) as count FROM kb_subjects').get();
if (kbCount.count === 0) {
  const insertSubject = db.prepare(
    'INSERT INTO kb_subjects (member_id, subject, code) VALUES (?, ?, ?)'
  );
  const insertTopic = db.prepare(
    'INSERT INTO kb_topics (member_id, subject, topic, mastery, source) VALUES (?, ?, ?, ?, ?)'
  );

  // Victoire (CE1)
  insertSubject.run(1, 'Français', 'FR');
  insertSubject.run(1, 'Mathématiques', 'MATH');
  insertSubject.run(1, 'Questionner le monde', 'QLM');
  insertTopic.run(1, 'Français', 'Sons complexes (ou, on, an, in)', 3, 'manual');
  insertTopic.run(1, 'Français', 'Lecture fluide', 4, 'manual');
  insertTopic.run(1, 'Mathématiques', 'Addition et soustraction', 4, 'manual');
  insertTopic.run(1, 'Mathématiques', 'Formes géométriques', 3, 'manual');

  // Charles (6ème)
  insertSubject.run(2, 'Français', 'FR');
  insertSubject.run(2, 'Mathématiques', 'MATH');
  insertSubject.run(2, 'Histoire-Géographie', 'HG');
  insertSubject.run(2, 'Anglais', 'ANG');
  insertSubject.run(2, 'SVT', 'SVT');
  insertTopic.run(2, 'Mathématiques', 'Nombres décimaux', 3, 'manual');
  insertTopic.run(2, 'Mathématiques', 'Fractions', 2, 'manual');
  insertTopic.run(2, 'Français', 'Passé simple', 2, 'manual');
  insertTopic.run(2, 'Histoire-Géographie', 'Rome antique', 4, 'manual');
  insertTopic.run(2, 'Anglais', 'Present tenses', 3, 'manual');

  // Gauthier (4ème)
  insertSubject.run(3, 'Français', 'FR');
  insertSubject.run(3, 'Mathématiques', 'MATH');
  insertSubject.run(3, 'Physique-Chimie', 'PC');
  insertSubject.run(3, 'Histoire-Géographie', 'HG');
  insertSubject.run(3, 'Anglais', 'ANG');
  insertSubject.run(3, 'SVT', 'SVT');
  insertSubject.run(3, 'Espagnol', 'ESP');
  insertTopic.run(3, 'Mathématiques', 'Pythagore', 4, 'manual');
  insertTopic.run(3, 'Mathématiques', 'Calcul littéral', 3, 'manual');
  insertTopic.run(3, 'Mathématiques', 'Équations', 2, 'manual');
  insertTopic.run(3, 'Physique-Chimie', 'Loi d\'Ohm', 3, 'manual');
  insertTopic.run(3, 'Français', 'Commentaire de texte', 2, 'manual');
  insertTopic.run(3, 'Histoire-Géographie', 'Révolution française', 4, 'manual');

  console.log('Knowledge base pré-remplie !');
}

// ─── 7. Quiz streaks ───
const streakCount = db.prepare('SELECT COUNT(*) as count FROM quiz_streaks').get();
if (streakCount.count === 0) {
  const insertStreak = db.prepare(
    'INSERT INTO quiz_streaks (member_id, current_streak, best_streak, last_played) VALUES (?, ?, ?, ?)'
  );
  insertStreak.run(1, 2, 3, '2026-03-21');
  insertStreak.run(2, 4, 7, '2026-03-21');
  insertStreak.run(3, 1, 5, '2026-03-20');
  console.log('Streaks quiz initialisés !');
}

console.log('Seed terminé !');
process.exit(0);
