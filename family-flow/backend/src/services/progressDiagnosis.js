/**
 * Service de diagnostic de progrès — identifie les points faibles par enfant
 *
 * Agrège TOUTES les sources de données (notes, KB, mastery, dictées, quiz, training)
 * pour produire un diagnostic sans appel LLM.
 */

const db = require('../db/init');
const normalizeSubject = require('../utils/normalizeSubject');

/**
 * Diagnose weak areas for a given child.
 * @param {number} memberId
 * @returns {{ weakAreas: Array, stats: Object }}
 */
function diagnose(memberId) {
  const weakMap = {}; // key = "subject::topic" → aggregated data

  function addEvidence(rawSubject, topic, source, mastery, exerciseTypes) {
    const subject = normalizeSubject(rawSubject) || rawSubject;
    const key = `${subject}::${topic}`;
    if (!weakMap[key]) {
      weakMap[key] = {
        subject,
        topic,
        sources: [],
        masteryValues: [],
        suggestedExerciseTypes: new Set(),
      };
    }
    weakMap[key].sources.push(source);
    if (mastery !== null && mastery !== undefined) {
      weakMap[key].masteryValues.push(mastery);
    }
    if (exerciseTypes) {
      exerciseTypes.forEach(t => weakMap[key].suggestedExerciseTypes.add(t));
    }
  }

  // 1. kb_grades: subjects where student_avg < class_avg - 2 OR student_avg < 10
  try {
    const grades = db.prepare(`
      SELECT subject, student_avg, class_avg, period
      FROM kb_grades
      WHERE member_id = ?
        AND student_avg BETWEEN 0 AND 20
        AND (student_avg < 10 OR (class_avg IS NOT NULL AND student_avg < class_avg - 2))
      ORDER BY student_avg ASC
    `).all(memberId);

    for (const g of grades) {
      const mastery = (g.student_avg / 20) * 5; // convert /20 to /5
      addEvidence(
        g.subject,
        g.subject, // topic = subject level for grades
        `Notes: ${g.student_avg}/20 (classe: ${g.class_avg || '?'}/20)`,
        mastery,
        ['qcm', 'short_answer']
      );
    }
  } catch {}

  // 2. kb_topics: topics where mastery < 2.5
  try {
    const topics = db.prepare(`
      SELECT subject, name, mastery
      FROM kb_topics
      WHERE member_id = ? AND mastery < 2.5
      ORDER BY mastery ASC
    `).all(memberId);

    for (const t of topics) {
      addEvidence(
        t.subject,
        t.name,
        `KB Mastery: ${t.mastery}/5`,
        t.mastery,
        ['qcm', 'fill_blank']
      );
    }
  } catch {}

  // 3. mastery_graph: concepts where score < 2.0
  try {
    const concepts = db.prepare(`
      SELECT subject, concept_id, score
      FROM mastery_graph
      WHERE member_id = ? AND score < 2.0
      ORDER BY score ASC
    `).all(memberId);

    for (const c of concepts) {
      addEvidence(
        c.subject,
        c.concept_id,
        `Mastery: ${c.score}/5`,
        c.score,
        ['qcm', 'calculation']
      );
    }
  } catch {}

  // 4. dictation_errors: group by error_category where mastered = 0, count >= 3
  try {
    const errors = db.prepare(`
      SELECT de.error_category, COUNT(*) as cnt
      FROM dictation_errors de
      JOIN dictation_sessions ds ON de.session_id = ds.id
      WHERE ds.member_id = ? AND de.mastered = 0
      GROUP BY de.error_category
      HAVING cnt >= 3
      ORDER BY cnt DESC
    `).all(memberId);

    for (const e of errors) {
      addEvidence(
        'Français',
        `Orthographe: ${e.error_category}`,
        `Dictées: ${e.cnt} erreurs non maîtrisées`,
        1.0,
        ['dictation_drill', 'fill_blank']
      );
    }
  } catch {}

  // 5. chapter_quiz_results: topics where score/total < 0.5 in last 30 days
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const quizResults = db.prepare(`
      SELECT subject, chapter, score, total
      FROM chapter_quiz_results
      WHERE member_id = ? AND created_at >= ? AND total > 0
        AND CAST(score AS REAL) / CAST(total AS REAL) < 0.5
      ORDER BY CAST(score AS REAL) / CAST(total AS REAL) ASC
    `).all(memberId, thirtyDaysAgo);

    for (const q of quizResults) {
      const pct = Math.round((q.score / q.total) * 100);
      const mastery = (q.score / q.total) * 5;
      addEvidence(
        q.subject,
        q.chapter || q.subject,
        `Quiz chapitre: ${pct}% (${q.score}/${q.total})`,
        mastery,
        ['qcm', 'true_false']
      );
    }
  } catch {}

  // 6. quiz_answers + quiz_questions: subjects with < 50% correct in last 30 days
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const quizStats = db.prepare(`
      SELECT qq.subject,
             COUNT(*) as total,
             SUM(CASE WHEN qa.is_correct = 1 THEN 1 ELSE 0 END) as correct
      FROM quiz_answers qa
      JOIN quiz_questions qq ON qa.question_id = qq.id
      WHERE qa.member_id = ? AND qa.answered_at >= ?
        AND qq.subject IS NOT NULL
      GROUP BY qq.subject
      HAVING CAST(correct AS REAL) / CAST(total AS REAL) < 0.5
    `).all(memberId, thirtyDaysAgo);

    for (const s of quizStats) {
      const pct = Math.round((s.correct / s.total) * 100);
      addEvidence(
        s.subject,
        s.subject,
        `Quiz: ${pct}% correct (${s.correct}/${s.total})`,
        (s.correct / s.total) * 5,
        ['qcm', 'true_false']
      );
    }
  } catch {}

  // 7. training_data: subjects with more 'incorrect' than 'correct' in last 14 days
  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const training = db.prepare(`
      SELECT subject,
             SUM(CASE WHEN label = 'correct' THEN 1 ELSE 0 END) as correct,
             SUM(CASE WHEN label = 'incorrect' THEN 1 ELSE 0 END) as incorrect
      FROM training_data
      WHERE member_id = ? AND created_at >= ?
        AND subject IS NOT NULL
      GROUP BY subject
      HAVING incorrect > correct
    `).all(memberId, fourteenDaysAgo);

    for (const t of training) {
      addEvidence(
        t.subject,
        t.subject,
        `Entraînement: ${t.incorrect} erreurs vs ${t.correct} réussites`,
        1.5,
        ['qcm', 'short_answer']
      );
    }
  } catch {}

  // Build weak areas array with priority
  const weakAreas = Object.values(weakMap).map(w => {
    const sourceCount = w.sources.length;
    const priority = sourceCount >= 3 ? 'haute' : sourceCount >= 2 ? 'moyenne' : 'basse';
    const avgMastery = w.masteryValues.length > 0
      ? w.masteryValues.reduce((a, b) => a + b, 0) / w.masteryValues.length
      : 0;

    return {
      subject: w.subject,
      topic: w.topic,
      priority,
      currentMastery: Math.round(avgMastery * 10) / 10,
      evidenceSources: w.sources,
      suggestedExerciseTypes: [...w.suggestedExerciseTypes],
    };
  });

  // Sort by priority (haute first), then by lowest mastery
  const priorityOrder = { haute: 0, moyenne: 1, basse: 2 };
  weakAreas.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    return a.currentMastery - b.currentMastery;
  });

  // Limit to top 5
  const topWeakAreas = weakAreas.slice(0, 5);

  // Basic stats
  const stats = {
    totalWeakAreas: weakAreas.length,
    returned: topWeakAreas.length,
    byPriority: {
      haute: weakAreas.filter(w => w.priority === 'haute').length,
      moyenne: weakAreas.filter(w => w.priority === 'moyenne').length,
      basse: weakAreas.filter(w => w.priority === 'basse').length,
    },
  };

  return { weakAreas: topWeakAreas, stats };
}

module.exports = { diagnose };
