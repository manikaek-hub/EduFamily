/**
 * Agent 7 — Coach Parent
 *
 * Génère des bilans hebdomadaires personnalisés pour les parents.
 * Traduit les données des autres agents en conseils actionnables.
 */

const db = require('../db/init');
const { generateJSON } = require('../services/claude');
const { getMasteryProfile } = require('../services/learnerProfile');
const { getAllStyles } = require('../agents/learningStyleDetector');

/**
 * Collecte toutes les données de la semaine pour un enfant.
 */
function collectWeekData(memberId) {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
  if (!member) return null;

  // Sessions this week
  const sessions = db.prepare(`
    SELECT hs.*, COUNT(hm.id) as msg_count
    FROM homework_sessions hs
    LEFT JOIN homework_messages hm ON hs.id = hm.session_id
    WHERE hs.member_id = ? AND hs.started_at >= ?
    GROUP BY hs.id ORDER BY hs.started_at DESC
  `).all(memberId, weekAgo);

  // Training data summary
  const trainingStats = db.prepare(`
    SELECT
      COUNT(*) as total_exchanges,
      SUM(CASE WHEN label = 'correct' THEN 1 ELSE 0 END) as correct,
      SUM(CASE WHEN label = 'partial' THEN 1 ELSE 0 END) as partial,
      SUM(CASE WHEN label = 'incorrect' THEN 1 ELSE 0 END) as incorrect,
      SUM(CASE WHEN label = 'hors_sujet' THEN 1 ELSE 0 END) as hors_sujet,
      AVG(response_time_ms) as avg_response_time
    FROM training_data WHERE member_id = ? AND created_at >= ?
  `).get(memberId, weekAgo);

  // Common errors this week
  const commonErrors = db.prepare(`
    SELECT error_type, subject, COUNT(*) as count
    FROM training_data
    WHERE member_id = ? AND created_at >= ? AND error_type IS NOT NULL
    GROUP BY error_type, subject ORDER BY count DESC LIMIT 5
  `).all(memberId, weekAgo);

  // Engagement scores this week
  const engagementData = db.prepare(`
    SELECT AVG(score) as avg_score, MIN(score) as min_score, MAX(score) as max_score,
      COUNT(*) as readings
    FROM engagement_log WHERE member_id = ? AND created_at >= ?
  `).get(memberId, weekAgo);

  // Mastery graph
  const mastery = getMasteryProfile(memberId);

  // Learning styles
  const styles = getAllStyles(memberId);

  // School grades
  let grades = [];
  try {
    grades = db.prepare(
      'SELECT subject, student_avg, class_avg FROM kb_grades WHERE member_id = ? ORDER BY student_avg ASC'
    ).all(memberId);
  } catch {}

  // Upcoming homework
  const todayStr = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const upcomingHw = db.prepare(
    'SELECT subject, description, due_date FROM kb_homework WHERE member_id = ? AND done = 0 AND due_date BETWEEN ? AND ? ORDER BY due_date ASC'
  ).all(memberId, todayStr, nextWeek);

  // XP
  let xp = null;
  try { xp = db.prepare('SELECT * FROM xp_totals WHERE member_id = ?').get(memberId); } catch {}

  // Quiz streak
  let streak = null;
  try { streak = db.prepare('SELECT * FROM quiz_streaks WHERE member_id = ?').get(memberId); } catch {}

  return {
    member,
    sessions,
    trainingStats,
    commonErrors,
    engagementData,
    mastery,
    styles,
    grades,
    upcomingHw,
    xp,
    streak,
  };
}

/**
 * Génère un bilan hebdomadaire pour un enfant via Claude.
 */
async function generateWeeklyReport(memberId) {
  const data = collectWeekData(memberId);
  if (!data) return { success: false, error: 'Enfant introuvable' };

  const { member, sessions, trainingStats, commonErrors, engagementData, mastery, styles, grades, upcomingHw, xp, streak } = data;

  // Build context for Claude
  let context = `ENFANT: ${member.name}, ${member.age} ans, ${member.grade}\n\n`;

  // Sessions
  context += `ACTIVITE CETTE SEMAINE:\n`;
  context += `- ${sessions.length} sessions Foxie (${sessions.reduce((a, s) => a + s.msg_count, 0)} messages echanges)\n`;
  if (trainingStats) {
    context += `- ${trainingStats.total_exchanges} echanges annotes: ${trainingStats.correct || 0} corrects, ${trainingStats.partial || 0} partiels, ${trainingStats.incorrect || 0} incorrects\n`;
    const successRate = trainingStats.total_exchanges > 0
      ? Math.round(((trainingStats.correct || 0) + (trainingStats.partial || 0)) / trainingStats.total_exchanges * 100)
      : 0;
    context += `- Taux de reussite: ${successRate}%\n`;
    if (trainingStats.avg_response_time) {
      context += `- Temps de reponse moyen: ${Math.round(trainingStats.avg_response_time / 1000)}s\n`;
    }
  }
  if (xp) context += `- XP total: ${xp.total_xp}, Niveau: ${xp.level}\n`;
  if (streak) context += `- Streak quiz: ${streak.current_streak} jours (record: ${streak.best_streak})\n`;

  // Errors
  if (commonErrors.length > 0) {
    context += `\nERREURS FREQUENTES:\n`;
    commonErrors.forEach(e => {
      context += `- ${e.subject}: ${e.error_type} (${e.count} fois)\n`;
    });
  }

  // Engagement
  if (engagementData?.readings > 0) {
    context += `\nENGAGEMENT:\n`;
    context += `- Score moyen: ${Math.round(engagementData.avg_score)}/100\n`;
    context += `- Score min: ${Math.round(engagementData.min_score)}, max: ${Math.round(engagementData.max_score)}\n`;
  }

  // Mastery
  if (mastery.subjects.length > 0) {
    context += `\nMAITRISE PAR MATIERE:\n`;
    mastery.subjects.forEach(s => {
      context += `- ${s.subject}: ${s.avgScore}/5 (${s.weakCount} faibles, ${s.strongCount} forts)\n`;
    });
  }

  // Styles
  if (styles.length > 0) {
    context += `\nSTYLE D'APPRENTISSAGE:\n`;
    styles.forEach(s => {
      context += `- ${s.subject}: ${s.preferred_style} (confiance: ${s.confidence})\n`;
    });
  }

  // Grades
  if (grades.length > 0) {
    context += `\nNOTES SCOLAIRES:\n`;
    grades.forEach(g => {
      const vs = g.class_avg ? ` (classe: ${g.class_avg})` : '';
      context += `- ${g.subject}: ${g.student_avg}/20${vs}\n`;
    });
  }

  // Upcoming
  if (upcomingHw.length > 0) {
    context += `\nDEVOIRS A VENIR:\n`;
    upcomingHw.forEach(hw => {
      context += `- ${hw.subject}: ${hw.description.slice(0, 60)} (${hw.due_date})\n`;
    });
  }

  const prompt = `Tu es le Coach Parent de Family Flow. Tu produis un bilan hebdomadaire pour aider les parents a accompagner leur enfant.

${context}

Genere un bilan JSON avec ces sections:
{
  "resume": "2-3 phrases de synthese de la semaine",
  "progres": ["progres notable 1", "progres notable 2"],
  "attention": [{"sujet": "matiere", "probleme": "description courte", "cause": "cause probable"}],
  "conseil": "1 action concrete et specifique pour le parent cette semaine",
  "previsions": "Ce qu'il faudra surveiller la semaine prochaine (1-2 phrases)"
}

REGLES:
- Sois bienveillant mais honnete
- Le conseil doit etre ACTIONNABLE (pas vague comme "encouragez-le")
- Si les donnees sont insuffisantes, dis-le clairement
- Les progres doivent etre concrets (pas "il progresse bien")
- Maximum 3 points d'attention
- En francais, ton chaleureux

Reponds UNIQUEMENT avec le JSON.`;

  try {
    const report = await generateJSON(prompt, `Genere le bilan hebdomadaire pour ${member.name}.`);

    // Store in DB
    db.prepare(`
      INSERT INTO parent_reports (member_id, report_data, week_start)
      VALUES (?, ?, ?)
    `).run(memberId, JSON.stringify(report), new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]);

    return { success: true, report, child: member.name, grade: member.grade };
  } catch (err) {
    console.error('Agent 7 report error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get the latest report for a child.
 */
function getLatestReport(memberId) {
  try {
    const row = db.prepare(
      'SELECT * FROM parent_reports WHERE member_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(memberId);
    if (row) {
      return { success: true, report: JSON.parse(row.report_data), createdAt: row.created_at, weekStart: row.week_start };
    }
  } catch {}
  return { success: true, report: null };
}

module.exports = { generateWeeklyReport, getLatestReport, collectWeekData };
