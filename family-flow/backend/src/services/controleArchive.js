const crypto = require('crypto');
const db = require('../db/init');
const { logEvent, updateMasteryGraph } = require('./learnerProfile');

function slugConcept(value) {
  if (!value) return null;
  const slug = String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return slug || null;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeConcepts(concepts) {
  return [...new Set((concepts || [])
    .map(c => normalizeText(c))
    .filter(c => c.length > 2))]
    .slice(0, 12);
}

function normalizeGrade20(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 20) return null;
  return Math.round(n * 10) / 10;
}

function sourceHash({ memberId, subject, grade20, concepts, title, rawText }) {
  const cleanTitle = normalizeText(title).toLowerCase();
  const basis = {
    memberId: Number(memberId),
    subject: normalizeText(subject).toLowerCase(),
    grade20: normalizeGrade20(grade20),
    title: cleanTitle,
    concepts: cleanTitle ? [] : normalizeConcepts(concepts).map(c => c.toLowerCase()).sort(),
    rawHint: cleanTitle ? '' : normalizeText(rawText).toLowerCase().slice(0, 500),
  };
  return crypto.createHash('sha256').update(JSON.stringify(basis)).digest('hex');
}

function saveControleArchive({ memberId, subject, grade20, concepts, title, rawText, gradeComments }) {
  const cleanSubject = normalizeText(subject);
  if (!memberId || !cleanSubject) {
    return { success: false, inserted: false, reason: 'memberId et subject requis' };
  }

  const cleanConcepts = normalizeConcepts(concepts);
  const cleanTitle = normalizeText(title) || 'Controle';
  const safeGrade = normalizeGrade20(grade20);
  const hash = sourceHash({ memberId, subject: cleanSubject, grade20: safeGrade, concepts: cleanConcepts, title: cleanTitle, rawText });
  const period = new Date().toISOString().slice(0, 7);

  const existing = db.prepare('SELECT id FROM kb_documents WHERE source_hash = ? LIMIT 1').get(hash);
  if (existing) {
    return { success: true, inserted: false, documentId: existing.id, grade20: safeGrade, conceptsFed: 0 };
  }

  const tx = db.transaction(() => {
    const doc = db.prepare(`
      INSERT INTO kb_documents
        (member_id, doc_type, subject, title, topics, key_concepts, raw_text, grade, grade_comments, source_hash, doc_date)
      VALUES (?, 'controle', ?, ?, ?, ?, ?, ?, ?, ?, date('now'))
    `).run(
      memberId,
      cleanSubject,
      cleanTitle,
      JSON.stringify(cleanConcepts),
      JSON.stringify(cleanConcepts),
      rawText || null,
      safeGrade != null ? `${safeGrade}/20` : null,
      gradeComments || null,
      hash
    );

    let gradeUpdated = false;
    if (safeGrade != null) {
      const existingGrade = db.prepare('SELECT id, student_avg FROM kb_grades WHERE member_id=? AND subject=? AND period=?')
        .get(memberId, cleanSubject, period);
      if (existingGrade) {
        const avg = Math.max(0, Math.min(20, (Number(existingGrade.student_avg || 0) + safeGrade) / 2));
        db.prepare('UPDATE kb_grades SET student_avg=?, synced_at=datetime(\'now\') WHERE id=?').run(avg, existingGrade.id);
      } else {
        db.prepare('INSERT INTO kb_grades (member_id, subject, student_avg, period) VALUES (?,?,?,?)')
          .run(memberId, cleanSubject, safeGrade, period);
      }
      gradeUpdated = true;
    }

    const wasCorrect = safeGrade != null ? safeGrade >= 11 : true;
    let conceptsFed = 0;
    for (const concept of cleanConcepts) {
      const slug = slugConcept(concept);
      if (!slug) continue;
      try {
        updateMasteryGraph(memberId, slug, cleanSubject, wasCorrect);
        conceptsFed++;
      } catch {}
    }

    logEvent(memberId, 'eval_photo', cleanSubject, cleanTitle, safeGrade, null);
    return { documentId: doc.lastInsertRowid, gradeUpdated, conceptsFed };
  });

  const result = tx();
  return {
    success: true,
    inserted: true,
    documentId: result.documentId,
    grade20: safeGrade,
    conceptsFed: result.conceptsFed,
    gradeUpdated: result.gradeUpdated,
  };
}

module.exports = {
  saveControleArchive,
  normalizeGrade20,
  normalizeConcepts,
  sourceHash,
};
