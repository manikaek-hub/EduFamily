const db = require('./init');

const members = [
  { name: 'Victoire', role: 'child', grade: 'CE2', age: 8, avatar_color: '#E8A0BF' },
  { name: 'Charles', role: 'child', grade: '6eme', age: 11, avatar_color: '#4A90D9' },
  { name: 'Gauthier', role: 'child', grade: '4eme', age: 14, avatar_color: '#7C9082' },
  { name: 'Maman', role: 'parent', grade: null, age: null, avatar_color: '#C4A484' },
  { name: 'Papa', role: 'parent', grade: null, age: null, avatar_color: '#8B7355' },
];

const existing = db.prepare('SELECT COUNT(*) as count FROM members').get();
if (existing.count === 0) {
  const insert = db.prepare(
    'INSERT INTO members (name, role, grade, age, avatar_color) VALUES (?, ?, ?, ?, ?)'
  );
  for (const m of members) {
    insert.run(m.name, m.role, m.grade, m.age, m.avatar_color);
  }
  console.log('Famille seedee avec succes ! 5 membres crees.');
} else {
  console.log(`${existing.count} membres existent deja, seed ignore.`);
}

// Seed sample activities
const activityCount = db.prepare('SELECT COUNT(*) as count FROM activities').get();
if (activityCount.count === 0) {
  const insertActivity = db.prepare(
    'INSERT INTO activities (title, description, category, start_time, end_time, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertMember = db.prepare(
    'INSERT INTO activity_members (activity_id, member_id) VALUES (?, ?)'
  );

  const sampleActivities = [
    { title: 'Cours de piano', desc: 'Cours hebdomadaire de piano', cat: 'music', start: '2026-03-23T14:00:00', end: '2026-03-23T15:00:00', by: 1, members: [1] },
    { title: 'Entrainement foot', desc: 'Entrainement au stade', cat: 'sports', start: '2026-03-24T17:00:00', end: '2026-03-24T18:30:00', by: 2, members: [2] },
    { title: 'Sortie famille au parc', desc: 'Pique-nique au parc', cat: 'family', start: '2026-03-22T10:00:00', end: '2026-03-22T16:00:00', by: 4, members: [1, 2, 3, 4, 5] },
    { title: 'Rendez-vous dentiste', desc: 'Controle annuel', cat: 'medical', start: '2026-03-25T09:00:00', end: '2026-03-25T10:00:00', by: 4, members: [3] },
  ];

  for (const a of sampleActivities) {
    const result = insertActivity.run(a.title, a.desc, a.cat, a.start, a.end, a.by);
    for (const mid of a.members) {
      insertMember.run(result.lastInsertRowid, mid);
    }
  }
  console.log('Activites exemples creees !');
}

// Seed sample posts
const postCount = db.prepare('SELECT COUNT(*) as count FROM posts').get();
if (postCount.count === 0) {
  const insertPost = db.prepare(
    'INSERT INTO posts (member_id, content, post_type) VALUES (?, ?, ?)'
  );
  insertPost.run(1, 'J\'ai eu 18/20 en dictee aujourd\'hui ! 🎉', 'achievement');
  insertPost.run(2, 'Match de foot samedi prochain, venez me supporter !', 'announcement');
  insertPost.run(4, 'Bravo a tous pour cette belle semaine ! On est fiers de vous ❤️', 'highlight');
  console.log('Posts exemples crees !');
}

console.log('Seed termine !');
process.exit(0);
