const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { officialSubjects, toOfficial } = require('../config/subjects');

/**
 * GET /api/progress/:memberId
 * Vue "où en est l'enfant" : niveau/XP + maîtrise PAR MATIÈRE OFFICIELLE
 * (programme Éducation Nationale, selon le cycle de l'enfant).
 * La maîtrise vient des VRAIS signaux (pas des échanges Foxie) :
 *   - notes scolaires valides (EcoleDirecte, /20) — poids fort
 *   - réussite aux quiz — poids moyen
 *   - corrections de Foxie (training_data) — poids faible
 * Pas de signal -> "à évaluer" (null), jamais 5 étoiles par défaut.
 */
router.get('/:memberId', (req, res) => {
  const memberId = req.params.memberId;
  try {
    const member = db.prepare('SELECT grade FROM members WHERE id = ?').get(memberId) || {};
    const officials = officialSubjects(member.grade);

    const totals = db.prepare('SELECT total_xp, level FROM xp_totals WHERE member_id = ?').get(memberId)
      || { total_xp: 0, level: 1 };

    // signaux par matière OFFICIELLE
    const sig = {};
    officials.forEach(s => { sig[s] = { gradeSum: 0, gradeCount: 0, quizTotal: 0, quizOk: 0, trTotal: 0, trScore: 0 }; });
    const add = (raw) => { const off = toOfficial(raw, officials); return off ? sig[off] : null; };

    try {
      for (const r of db.prepare('SELECT subject, student_avg FROM kb_grades WHERE member_id = ?').all(memberId)) {
        const v = Number(r.student_avg);
        const e = add(r.subject);
        if (e && v > 0 && v <= 20) { e.gradeSum += v; e.gradeCount++; }
      }
    } catch {}

    try {
      for (const r of db.prepare(
        `SELECT q.subject AS subject, a.is_correct AS ok
         FROM quiz_answers a JOIN quiz_questions q ON a.question_id = q.id
         WHERE a.member_id = ?`
      ).all(memberId)) {
        const e = add(r.subject);
        if (e) { e.quizTotal++; if (r.ok) e.quizOk++; }
      }
    } catch {}

    try {
      for (const r of db.prepare(
        `SELECT subject, label FROM training_data WHERE member_id = ? AND subject IS NOT NULL`
      ).all(memberId)) {
        const e = add(r.subject);
        if (e) { e.trTotal++; if (r.label === 'correct') e.trScore += 1; else if (r.label === 'partial') e.trScore += 0.5; }
      }
    } catch {}

    const subjects = officials.map(name => {
      const e = sig[name];
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
        subject: name,
        mastery,                                   // 1..5 ou null
        grade: grade != null ? Math.round(grade * 10) / 10 : null,
        evaluated: parts.length > 0,
      };
    });

    res.json({ success: true, level: totals.level || 1, totalXp: totals.total_xp || 0, subjects });
  } catch (e) {
    console.error('progress error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
