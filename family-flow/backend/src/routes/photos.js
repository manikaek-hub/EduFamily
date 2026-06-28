const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { processImage } = require('../services/claude');
const { logEvent } = require('../services/learnerProfile');
const { extractAndStore } = require('../services/vocabularyExtractor');
const fs = require('fs');
const path = require('path');
const { PHOTOS_DIR } = require('../config/paths');
if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });

// POST /api/photos/upload — process a photo with Haiku Vision
router.post('/upload', async (req, res) => {
  try {
    const { memberId, imageData, mediaType = 'image/jpeg' } = req.body;

    if (!memberId || !imageData) {
      return res.status(400).json({ success: false, error: 'memberId et imageData requis' });
    }

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    if (!member) return res.status(404).json({ success: false, error: 'Membre non trouvé' });

    // Strip data URL prefix if present
    const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');

    // Process with Haiku Vision
    const memberContext = `${member.name}, ${member.age} ans, ${member.grade}`;
    const extracted = await processImage(base64, mediaType, memberContext);

    // Save photo to disk
    const filename = `${memberId}_${Date.now()}.jpg`;
    const photoPath = path.join(PHOTOS_DIR, filename);
    fs.writeFileSync(photoPath, Buffer.from(base64, 'base64'));

    // Insert into kb_documents
    const result = db.prepare(`
      INSERT INTO kb_documents (member_id, doc_type, subject, title, topics, key_concepts, raw_text, grade, grade_comments, exercises, photo_path, doc_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      memberId,
      extracted.doc_type || 'autre',
      extracted.subject || 'Inconnu',
      extracted.title || null,
      JSON.stringify(extracted.topics || []),
      JSON.stringify(extracted.key_concepts || []),
      extracted.raw_text || '',
      extracted.grade || null,
      extracted.grade_comments || null,
      JSON.stringify(extracted.exercises || []),
      filename,
      extracted.date || new Date().toISOString().split('T')[0]
    );

    const docId = result.lastInsertRowid;

    // Update FTS index
    db.prepare(`
      INSERT INTO kb_documents_fts (rowid, raw_text, title, topics, key_concepts, subject)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(docId, extracted.raw_text || '', extracted.title || '', JSON.stringify(extracted.topics || []), JSON.stringify(extracted.key_concepts || []), extracted.subject || '');

    // Feed into existing KB tables
    const topicsAdded = feedKnowledgeBase(memberId, extracted);

    // Extract structured vocabulary into kb_vocabulary
    try {
      extractAndStore(memberId, docId, extracted.subject || 'Inconnu', extracted.raw_text || '', extracted.key_concepts, extracted.topics);
    } catch (err) {
      console.warn('Vocabulary extraction warning:', err.message);
    }

    // Log learning event
    const eventType = extracted.doc_type === 'controle' ? 'eval_photo' : 'course_photo';
    logEvent(memberId, eventType, extracted.subject, extracted.title, extracted.grade ? parseFloat(extracted.grade) : null, null);

    // Update mastery if it's a graded test
    if (extracted.grade && extracted.doc_type === 'controle') {
      updateGradeFromPhoto(memberId, extracted);
    }

    // Detect level mismatch — warn if content doesn't match child's grade
    let levelWarning = null;
    const contentText = (extracted.title || '') + ' ' + (extracted.raw_text || '');
    const gradePatterns = {
      'CE2': /CE2|cours élémentaire/i,
      'CM1': /CM1/i,
      'CM2': /CM2/i,
      '6eme': /6[èe]me|sixi[èe]me|6e\b/i,
      '5eme': /5[èe]me|cinqu[ièe]me|5e\b/i,
      '4eme': /4[èe]me|quatri[èe]me|4e\b/i,
      '3eme': /3[èe]me|troisi[èe]me|3e\b/i,
    };
    for (const [grade, pattern] of Object.entries(gradePatterns)) {
      if (pattern.test(contentText) && grade !== member.grade) {
        // Find which child this might belong to
        const rightChild = db.prepare('SELECT name, grade FROM members WHERE grade = ? AND role = ?').get(grade, 'child');
        levelWarning = {
          detectedGrade: grade,
          childGrade: member.grade,
          suggestedChild: rightChild ? rightChild.name : null,
          message: rightChild
            ? `Ce document semble être de niveau ${grade} (${rightChild.name}), mais tu l'importes pour ${member.name} (${member.grade}).`
            : `Ce document semble être de niveau ${grade}, mais ${member.name} est en ${member.grade}.`,
        };
        break;
      }
    }

    res.json({
      success: true,
      document: {
        id: docId,
        doc_type: extracted.doc_type,
        subject: extracted.subject,
        title: extracted.title,
        topics: extracted.topics,
        grade: extracted.grade,
        topicsAdded,
      },
      levelWarning,
    });
  } catch (err) {
    console.error('Photo processing error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/photos/batch — process multiple photos at once (same course)
router.post('/batch', async (req, res) => {
  try {
    const { memberId, images } = req.body;
    if (!memberId || !images?.length) {
      return res.status(400).json({ success: false, error: 'memberId et images[] requis' });
    }

    const results = [];
    for (const img of images) {
      try {
        const response = await new Promise((resolve) => {
          const fakeReq = { body: { memberId, imageData: img.data, mediaType: img.mediaType || 'image/jpeg' } };
          const fakeRes = {
            json: (data) => resolve(data),
            status: () => ({ json: (data) => resolve(data) }),
          };
          router.handle(Object.assign(fakeReq, { method: 'POST', url: '/upload' }), fakeRes, () => {});
        });
        results.push(response);
      } catch (err) {
        results.push({ success: false, error: err.message });
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/photos/documents/:memberId — list all documents for a child
router.get('/documents/:memberId', (req, res) => {
  const docs = db.prepare(`
    SELECT id, doc_type, subject, title, topics, grade, doc_date, created_at
    FROM kb_documents WHERE member_id = ?
    ORDER BY created_at DESC
  `).all(parseInt(req.params.memberId));

  docs.forEach(d => { try { d.topics = JSON.parse(d.topics); } catch { d.topics = []; } });
  res.json({ success: true, documents: docs });
});

// GET /api/photos/search/:memberId?q=keyword — full-text search
router.get('/search/:memberId', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ success: true, results: [] });

  const memberId = parseInt(req.params.memberId);
  const results = db.prepare(`
    SELECT d.id, d.doc_type, d.subject, d.title, d.topics, d.grade, d.doc_date,
           snippet(kb_documents_fts, 0, '<b>', '</b>', '...', 30) as snippet
    FROM kb_documents_fts f
    JOIN kb_documents d ON d.id = f.rowid
    WHERE kb_documents_fts MATCH ? AND d.member_id = ?
    ORDER BY rank
    LIMIT 20
  `).all(q, memberId);

  results.forEach(r => { try { r.topics = JSON.parse(r.topics); } catch { r.topics = []; } });
  res.json({ success: true, results });
});

// GET /api/photos/document/:id — get full document detail
router.get('/document/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM kb_documents WHERE id = ?').get(parseInt(req.params.id));
  if (!doc) return res.status(404).json({ success: false, error: 'Document non trouvé' });

  try { doc.topics = JSON.parse(doc.topics); } catch { doc.topics = []; }
  try { doc.key_concepts = JSON.parse(doc.key_concepts); } catch { doc.key_concepts = []; }
  try { doc.exercises = JSON.parse(doc.exercises); } catch { doc.exercises = []; }

  res.json({ success: true, document: doc });
});

// POST /api/photos/move — move a document to another child's profile
router.post('/move', (req, res) => {
  try {
    const { documentId, toMemberId } = req.body;
    if (!documentId || !toMemberId) {
      return res.status(400).json({ success: false, error: 'documentId et toMemberId requis' });
    }

    const doc = db.prepare('SELECT * FROM kb_documents WHERE id = ?').get(documentId);
    if (!doc) return res.status(404).json({ success: false, error: 'Document non trouvé' });

    const toMember = db.prepare('SELECT * FROM members WHERE id = ?').get(toMemberId);
    if (!toMember) return res.status(404).json({ success: false, error: 'Membre cible non trouvé' });

    const fromMemberId = doc.member_id;

    // Move document
    db.prepare('UPDATE kb_documents SET member_id = ? WHERE id = ?').run(toMemberId, documentId);

    // Move vocabulary (delete duplicates)
    try {
      db.prepare('DELETE FROM kb_vocabulary WHERE document_id = ? AND member_id = ?').run(documentId, fromMemberId);
    } catch {}

    // Move associated topics (best effort)
    try {
      const topics = JSON.parse(doc.topics || '[]');
      for (const topic of topics) {
        try {
          db.prepare('UPDATE kb_topics SET member_id = ? WHERE member_id = ? AND topic = ?').run(toMemberId, fromMemberId, topic);
        } catch {} // skip if duplicate
      }
    } catch {}

    res.json({ success: true, message: `Document déplacé vers ${toMember.name}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Helper: Feed extracted data into existing KB tables ───
function feedKnowledgeBase(memberId, extracted) {
  let count = 0;
  const subject = extracted.subject || 'Inconnu';

  // Ensure subject exists
  db.prepare('INSERT OR IGNORE INTO kb_subjects (member_id, subject) VALUES (?, ?)').run(memberId, subject);

  // Add topics
  const insertTopic = db.prepare(`
    INSERT OR IGNORE INTO kb_topics (member_id, subject, topic, description, source, date_seen)
    VALUES (?, ?, ?, ?, 'foxie', date('now'))
  `);

  for (const topic of (extracted.topics || [])) {
    if (topic.length > 3) {
      insertTopic.run(memberId, subject, topic.slice(0, 100), extracted.title || '');
      count++;
    }
  }

  // Add key concepts as topics too
  for (const concept of (extracted.key_concepts || [])) {
    if (concept.length > 3) {
      insertTopic.run(memberId, subject, concept.slice(0, 100), 'Concept clé');
      count++;
    }
  }

  return count;
}

// ─── Helper: Update grades from photo ───
function updateGradeFromPhoto(memberId, extracted) {
  const match = (extracted.grade || '').match(/([\d.]+)\s*\/\s*([\d.]+)/);
  if (!match) return;

  const score = parseFloat(match[1]);
  const outOf = parseFloat(match[2]);
  if (isNaN(score) || isNaN(outOf) || outOf === 0) return;
  // Garde-fou : note mal lue (ex: "37/20" ou barème farfelu) -> on ignore.
  if (score < 0 || score > outOf || outOf > 100) return;

  const normalizedScore = Math.max(0, Math.min(20, (score / outOf) * 20)); // /20, borné

  // Update kb_grades
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM
  const existing = db.prepare('SELECT * FROM kb_grades WHERE member_id = ? AND subject = ? AND period = ?')
    .get(memberId, extracted.subject, period);

  if (existing) {
    // Moyenne avec l'existant, bornée /20
    const newAvg = Math.max(0, Math.min(20, (existing.student_avg + normalizedScore) / 2));
    db.prepare('UPDATE kb_grades SET student_avg = ? WHERE id = ?').run(newAvg, existing.id);
  } else {
    db.prepare('INSERT INTO kb_grades (member_id, subject, student_avg, period) VALUES (?, ?, ?, ?)')
      .run(memberId, extracted.subject, normalizedScore, period);
  }

  // Update mastery for weak topics if grade is low
  if (normalizedScore < 10 && extracted.topics?.length > 0) {
    for (const topic of extracted.topics) {
      db.prepare(`
        UPDATE kb_topics SET mastery = MIN(mastery, 1)
        WHERE member_id = ? AND subject = ? AND topic = ?
      `).run(memberId, extracted.subject, topic);
    }
  }
}

module.exports = router;
