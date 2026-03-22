const db = require('../db/init');

// ─── Core: compute competency scores per subject ──────────────────────────────
function computeCompetencies(memberId) {
  const subjectData = db.prepare(`
    SELECT subject, COUNT(*) as topics_count, AVG(mastery) as avg_mastery
    FROM kb_topics WHERE member_id = ?
    GROUP BY subject
  `).all(memberId);

  return subjectData.map(s => {
    const scores = [];

    // 1. KB topics mastery (0-5 → 0-100)
    if (s.avg_mastery > 0) scores.push(s.avg_mastery * 20);

    // 2. Quiz answers (correct rate on this subject)
    try {
      const q = db.prepare(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN qa.is_correct = 1 THEN 1 ELSE 0 END) as correct
        FROM quiz_answers qa
        JOIN quiz_questions qq ON qa.question_id = qq.id
        WHERE qa.member_id = ? AND qq.subject LIKE ?
      `).get(memberId, `%${s.subject}%`);
      if (q?.total > 0) scores.push((q.correct / q.total) * 100);
    } catch {}

    // 3. Chapter quiz results (score/total * 100)
    try {
      const cq = db.prepare(`
        SELECT AVG(CAST(score AS REAL) / CAST(total AS REAL) * 100) as avg_pct
        FROM chapter_quiz_results WHERE member_id = ? AND subject LIKE ?
      `).get(memberId, `%${s.subject}%`);
      if (cq?.avg_pct) scores.push(cq.avg_pct);
    } catch {}

    // 4. School grades (student_avg/20 * 100)
    try {
      const g = db.prepare(`
        SELECT AVG(student_avg) as avg_grade FROM kb_grades
        WHERE member_id = ? AND subject LIKE ?
      `).get(memberId, `%${s.subject}%`);
      if (g?.avg_grade) scores.push(g.avg_grade * 5);
    } catch {}

    const score = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b) / scores.length)
      : Math.round((s.avg_mastery || 0) * 20);

    const weakTopics = db.prepare(`
      SELECT topic FROM kb_topics WHERE member_id = ? AND subject = ? AND mastery < 2
      ORDER BY mastery ASC LIMIT 4
    `).all(memberId, s.subject).map(t => t.topic);

    const strongTopics = db.prepare(`
      SELECT topic FROM kb_topics WHERE member_id = ? AND subject = ? AND mastery >= 4
      ORDER BY mastery DESC LIMIT 3
    `).all(memberId, s.subject).map(t => t.topic);

    return {
      subject: s.subject,
      score,
      topicsCount: s.topics_count,
      weakTopics,
      strongTopics,
      level: score >= 80 ? 'expert' : score >= 60 ? 'bon' : score >= 40 ? 'en progress' : 'à renforcer',
    };
  }).sort((a, b) => b.score - a.score);
}

// ─── Full learner profile ──────────────────────────────────────────────────────
function getLearnerProfile(memberId) {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
  if (!member) return null;

  const competencies = computeCompetencies(memberId);

  const recentEvents = (() => {
    try {
      return db.prepare(
        'SELECT * FROM kb_learning_events WHERE member_id = ? ORDER BY created_at DESC LIMIT 15'
      ).all(memberId);
    } catch { return []; }
  })();

  const stats = {
    topicsCount: db.prepare('SELECT COUNT(*) as c FROM kb_topics WHERE member_id = ?').get(memberId)?.c || 0,
    homeworkSessions: db.prepare('SELECT COUNT(*) as c FROM homework_sessions WHERE member_id = ?').get(memberId)?.c || 0,
    mindmapsCount: db.prepare('SELECT COUNT(*) as c FROM kb_mindmaps WHERE member_id = ?').get(memberId)?.c || 0,
    flashcardsCount: db.prepare('SELECT COUNT(*) as c FROM kb_flashcards WHERE member_id = ?').get(memberId)?.c || 0,
    quizAnswered: db.prepare('SELECT COUNT(*) as c FROM quiz_answers WHERE member_id = ?').get(memberId)?.c || 0,
  };

  const xp = (() => {
    try { return db.prepare('SELECT * FROM xp_totals WHERE member_id = ?').get(memberId); } catch { return null; }
  })();

  const recentTopics = db.prepare(
    'SELECT subject, topic, mastery, date_seen FROM kb_topics WHERE member_id = ? ORDER BY date_seen DESC LIMIT 10'
  ).all(memberId);

  return { member, competencies, recentEvents, stats, xp, recentTopics };
}

// ─── Build Claude context string (injected into ALL prompts) ──────────────────
function buildProfileContext(memberId) {
  const profile = getLearnerProfile(memberId);
  if (!profile?.member) return '';

  const { member, competencies, recentTopics } = profile;

  let ctx = `\n\n[PROFIL APPRENANT: ${member.name}]\n`;
  ctx += `Niveau scolaire: ${member.grade}, ${member.age} ans\n`;

  if (competencies.length > 0) {
    const strong = competencies.filter(c => c.score >= 65);
    const struggling = competencies.filter(c => c.score < 40 && c.topicsCount > 0);
    const progressing = competencies.filter(c => c.score >= 40 && c.score < 65);

    if (strong.length > 0) {
      ctx += `✅ Points forts: ${strong.map(c => `${c.subject} (${c.score}/100)`).join(', ')}\n`;
    }
    if (progressing.length > 0) {
      ctx += `📈 En progression: ${progressing.map(c => c.subject).join(', ')}\n`;
    }
    if (struggling.length > 0) {
      ctx += `⚠️ À renforcer: ${struggling.map(c => `${c.subject} (${c.score}/100)`).join(', ')}\n`;
    }

    const allWeakTopics = competencies
      .flatMap(c => c.weakTopics.map(t => `${c.subject} > ${t}`))
      .slice(0, 6);
    if (allWeakTopics.length > 0) {
      ctx += `🎯 Notions fragiles: ${allWeakTopics.join(' | ')}\n`;
    }
  }

  if (recentTopics.length > 0) {
    const recent = recentTopics.slice(0, 5).map(t => `${t.subject}: ${t.topic}`).join(', ');
    ctx += `📚 Vu récemment: ${recent}\n`;
  }

  ctx += `[FIN PROFIL — utilise ces données pour personnaliser chaque réponse]\n`;
  return ctx;
}

// ─── Log a learning event ─────────────────────────────────────────────────────
function logEvent(memberId, eventType, subject, topic, score, notes) {
  try {
    db.prepare(`
      INSERT INTO kb_learning_events (member_id, event_type, subject, topic, score, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(memberId, eventType, subject || null, topic || null, score ?? null, notes || null);
  } catch {}
}

// ─── Progression over time: events per week for last 8 weeks ──────────────────
function getProgressionData(memberId) {
  try {
    return db.prepare(`
      SELECT strftime('%Y-W%W', created_at) as week,
             COUNT(*) as events,
             SUM(CASE WHEN event_type IN ('quiz_correct','chapter_quiz','topic_added','routine_done') THEN 1 ELSE 0 END) as positive
      FROM kb_learning_events
      WHERE member_id = ? AND created_at >= datetime('now', '-56 days')
      GROUP BY week ORDER BY week ASC
    `).all(memberId);
  } catch { return []; }
}

module.exports = {
  getLearnerProfile,
  buildProfileContext,
  computeCompetencies,
  logEvent,
  getProgressionData,
};
