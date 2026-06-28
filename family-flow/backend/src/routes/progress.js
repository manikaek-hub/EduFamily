const express = require('express');
const router = express.Router();
const db = require('../db/init');
const normalizeSubject = require('../utils/normalizeSubject');

/**
 * GET /api/progress/:memberId
 * Vue "où en est l'enfant" : niveau/XP + maîtrise PAR MATIÈRE (matières
 * fusionnées/normalisées), calculée à partir des VRAIS signaux :
 *   - notes scolaires valides (EcoleDirecte, /20)
 *   - réussite aux quiz
 *   - corrections de Foxie (training_data: correct/partial/incorrect)
 * Si aucun signal pour une matière -> maîtrise null ("à évaluer"), pas 5 étoiles.
 */
router.get('/:memberId', (req, res) => {
  const memberId = req.params.memberId;
  try {
    const totals = db.prepare('SELECT total_xp, level FROM xp_totals WHERE member_id = ?').get(memberId)
      || { total_xp: 0, level: 1 };

    // map: subjectCanonique -> { notions, gradeSum, gradeCount, quizTotal, quizOk, trTotal, trScore }
    const map = new Map();
    const get = (s) => {
      const k = normalizeSubject(s || '') || 'Autre';
      if (!map.has(k)) map.set(k, { subject: k, notions: 0, gradeSum: 0, gradeCount: 0, quizTotal: 0, quizOk: 0, trTotal: 0, trScore: 0 });
      return map.get(k);
    };

    // Notions travaillées (kb_topics)
    try {
      for (const r of db.prepare('SELECT subject FROM kb_topics WHERE member_id = ?').all(memberId)) {
        if (r.subject) get(r.subject).notions++;
      }
    } catch {}

    // Notes scolaires valides (0 < avg <= 20)
    try {
      for (const r of db.prepare('SELECT subject, student_avg FROM kb_grades WHERE member_id = ?').all(memberId)) {
        const v = Number(r.student_avg);
        if (r.subject && v > 0 && v <= 20) { const e = get(r.subject); e.gradeSum += v; e.gradeCount++; }
      }
    } catch {}

    // Quiz (réussite par matière)
    try {
      for (const r of db.prepare(
        `SELECT q.subject AS subject, a.is_correct AS ok
         FROM quiz_answers a JOIN quiz_questions q ON a.question_id = q.id
         WHERE a.member_id = ?`
      ).all(memberId)) {
        if (!r.subject) continue;
        const e = get(r.subject); e.quizTotal++; if (r.ok) e.quizOk++;
      }
    } catch {}

    // Corrections de Foxie (training_data)
    try {
      for (const r of db.prepare(
        `SELECT subject, label FROM training_data WHERE member_id = ? AND subject IS NOT NULL`
      ).all(memberId)) {
        const e = get(r.subject);
        e.trTotal++;
        if (r.label === 'correct') e.trScore += 1;
        else if (r.label === 'partial') e.trScore += 0.5;
      }
    } catch {}

    // Matières "parasites" (pas de vraies matières scolaires) à exclure
    const NOISE = new Set(['Foxie', 'Autre', 'Cours', 'Divers', 'Inconnu']);

    const subjects = [...map.values()].map(e => {
      // Moyenne PONDÉRÉE : la note scolaire compte le plus (fiable), le quiz
      // ensuite, les corrections de Foxie le moins (un enfant qui demande de
      // l'aide se trompe forcément un peu, ce n'est pas un manque de maîtrise).
      const parts = [];
      let grade = null;
      if (e.gradeCount > 0) { grade = e.gradeSum / e.gradeCount; parts.push({ v: Math.min(1, grade / 20), w: 3 }); }
      if (e.quizTotal > 0) parts.push({ v: e.quizOk / e.quizTotal, w: 2 });
      if (e.trTotal > 0) parts.push({ v: e.trScore / e.trTotal, w: 1 });
      let mastery = null;
      if (parts.length) {
        const tw = parts.reduce((a, p) => a + p.w, 0);
        const avg = parts.reduce((a, p) => a + p.v * p.w, 0) / tw;
        mastery = Math.max(1, Math.min(5, Math.round(avg * 5)));
      }
      return {
        subject: e.subject,
        notions: e.notions,
        mastery,                                   // 1..5 ou null
        grade: grade != null ? Math.round(grade * 10) / 10 : null,
        evaluated: parts.length > 0,
      };
    })
    // exclure les parasites, garder les matières avec des notions OU une évaluation
    .filter(s => !NOISE.has(s.subject) && (s.notions > 0 || s.evaluated))
    // évaluées d'abord, puis par nom
    .sort((a, b) => (b.evaluated - a.evaluated) || a.subject.localeCompare(b.subject, 'fr'));

    res.json({ success: true, level: totals.level || 1, totalXp: totals.total_xp || 0, subjects });
  } catch (e) {
    console.error('progress error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
