const crypto = require('crypto');
const db = require('../db/init');
const normalizeSubject = require('../utils/normalizeSubject');

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeList(values) {
  return [...new Set((values || []).map(clean).filter(v => v.length > 2))].slice(0, 12);
}

function hashPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function documentHash({ memberId, docType, subject, title, rawText, concepts }) {
  const cleanTitle = clean(title).toLowerCase();
  const rawHint = clean(rawText).toLowerCase().slice(0, 700);
  return hashPayload({
    memberId: Number(memberId),
    docType: clean(docType).toLowerCase(),
    subject: clean(subject).toLowerCase(),
    title: cleanTitle,
    concepts: cleanTitle ? [] : normalizeList(concepts).map(c => c.toLowerCase()).sort(),
    rawHint: cleanTitle ? rawHint.slice(0, 160) : rawHint,
  });
}

function findSimilarHomework(memberId, subject, dueDate, description) {
  const rows = db.prepare(`
    SELECT id, description FROM kb_homework
    WHERE member_id = ? AND subject = ? AND due_date = ?
    ORDER BY LENGTH(description) DESC
  `).all(memberId, subject, dueDate);

  const normalized = clean(description).toLowerCase();
  return rows.find(row => {
    const existing = clean(row.description).toLowerCase();
    return existing === normalized || existing.includes(normalized) || normalized.includes(existing);
  }) || null;
}

function upsertHomework({ memberId, subject, description, dueDate }) {
  const desc = clean(description);
  const date = clean(dueDate) || new Date().toISOString().split('T')[0];
  if (!memberId || !subject || desc.length < 3) return { inserted: false, reason: 'missing_fields' };

  const existing = findSimilarHomework(memberId, subject, date, desc);
  if (existing) {
    if (desc.length > clean(existing.description).length) {
      db.prepare('UPDATE kb_homework SET description = ?, synced_at = datetime(\'now\') WHERE id = ?').run(desc, existing.id);
    } else {
      db.prepare('UPDATE kb_homework SET synced_at = datetime(\'now\') WHERE id = ?').run(existing.id);
    }
    return { inserted: false, homeworkId: existing.id };
  }

  const result = db.prepare(`
    INSERT OR IGNORE INTO kb_homework (member_id, subject, description, due_date, done, synced_at)
    VALUES (?, ?, ?, ?, 0, datetime('now'))
  `).run(memberId, subject, desc, date);

  return { inserted: result.changes > 0, homeworkId: result.lastInsertRowid || null };
}

function archiveSchoolDocument({ memberId, extracted, fallbackSubject }) {
  if (!memberId || !extracted) return { success: false, inserted: false };

  const docType = clean(extracted.doc_type || 'autre').toLowerCase();
  const allowed = new Set(['cours', 'exercice', 'controle', 'devoir', 'fiche', 'autre']);
  const safeDocType = allowed.has(docType) ? docType : 'autre';
  const subject = normalizeSubject(extracted.subject || fallbackSubject || 'Inconnu');
  const concepts = normalizeList([...(extracted.key_concepts || []), ...(extracted.topics || [])]);
  const title = clean(extracted.title) || (safeDocType === 'devoir' ? 'Devoir scanne' : 'Document scanne');
  const rawText = clean(extracted.raw_text);
  const sourceHash = documentHash({ memberId, docType: safeDocType, subject, title, rawText, concepts });

  const existing = db.prepare('SELECT id FROM kb_documents WHERE source_hash = ? LIMIT 1').get(sourceHash);
  let documentId = existing?.id || null;
  let inserted = false;

  if (!existing) {
    const result = db.prepare(`
      INSERT INTO kb_documents
        (member_id, doc_type, subject, title, topics, key_concepts, raw_text, grade, grade_comments, exercises, source_hash, doc_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      memberId,
      safeDocType,
      subject,
      title,
      JSON.stringify(extracted.topics || []),
      JSON.stringify(extracted.key_concepts || []),
      rawText || null,
      extracted.grade || null,
      extracted.grade_comments || null,
      extracted.exercises ? JSON.stringify(extracted.exercises) : null,
      sourceHash,
      extracted.date || new Date().toISOString().split('T')[0]
    );
    documentId = result.lastInsertRowid;
    inserted = true;
  }

  let homework = null;
  if (safeDocType === 'devoir' || safeDocType === 'exercice') {
    const description = rawText || title || (extracted.exercises || []).join(' ');
    homework = upsertHomework({
      memberId,
      subject,
      description,
      dueDate: extracted.date || new Date().toISOString().split('T')[0],
    });
  }

  return { success: true, inserted, documentId, homework };
}

module.exports = {
  archiveSchoolDocument,
  upsertHomework,
  documentHash,
};
