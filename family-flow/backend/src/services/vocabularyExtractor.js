const db = require('../db/init');

/**
 * Extract and store vocabulary from a document's raw_text.
 * Called once at upload time — data lives in kb_vocabulary forever.
 */
function extractAndStore(memberId, documentId, subject, rawText, keyConcepts, topics) {
  const words = new Set();
  const rules = [];

  // 1. Extract "mots à apprendre" sections
  const motsMatch = rawText.match(/mots\s+[àa]\s+apprendre[:\s]*([\s\S]*?)(?:\n\n|\nLes\s|$)/i);
  if (motsMatch) {
    motsMatch[1]
      .split(/[•·,\n]+/)
      .map(m => cleanWord(m))
      .filter(isValidWord)
      .forEach(m => words.add(m));
  }

  // 2. Extract "Les mots" sections (fiches)
  const lesMotsMatch = rawText.match(/Les\s+mots\s*\n([\s\S]*?)(?:\n\n|\nLes\s|$)/i);
  if (lesMotsMatch) {
    lesMotsMatch[1]
      .split(/[•·|\n]+/)
      .map(m => {
        let w = m.trim().replace(/^(une?|le|la|les|l'|du|des|un|il|elle)\s+/i, '');
        return cleanWord(w);
      })
      .filter(isValidWord)
      .forEach(m => words.add(m));
  }

  // 3. Extract key vocabulary from any "vocabulaire" or "définitions" sections
  const vocabMatch = rawText.match(/vocabulaire[:\s]*([\s\S]*?)(?:\n\n|$)/i);
  if (vocabMatch) {
    vocabMatch[1]
      .split(/[•·,;\n]+/)
      .map(m => cleanWord(m))
      .filter(isValidWord)
      .forEach(m => words.add(m));
  }

  // 4. Extract formulas/rules from math/science docs
  const formuleMatch = rawText.match(/(?:formule|règle|propriété|théorème)[s]?\s*[:\n]([\s\S]*?)(?:\n\n|$)/i);
  if (formuleMatch) {
    formuleMatch[1]
      .split(/\n/)
      .map(m => m.trim())
      .filter(m => m.length > 5 && m.length < 200)
      .forEach(m => rules.push(m));
  }

  // 5. Extract definitions
  const defMatch = rawText.match(/(?:définition|retenir)[s]?\s*[:\n]([\s\S]*?)(?:\n\n|$)/i);
  if (defMatch) {
    defMatch[1]
      .split(/\n/)
      .map(m => m.trim())
      .filter(m => m.length > 10 && m.length < 200)
      .forEach(m => rules.push(m));
  }

  // 6. Add key_concepts as concepts
  if (keyConcepts) {
    try {
      const concepts = typeof keyConcepts === 'string' ? JSON.parse(keyConcepts) : keyConcepts;
      concepts.forEach(c => {
        if (c && c.length > 3 && c.length < 100) {
          rules.push(c);
        }
      });
    } catch {}
  }

  // Store in kb_vocabulary
  const insertWord = db.prepare(
    `INSERT OR IGNORE INTO kb_vocabulary (member_id, document_id, word, subject, category, context)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  let count = 0;
  for (const word of words) {
    insertWord.run(memberId, documentId, word, subject, 'mot', null);
    count++;
  }
  for (const rule of rules) {
    insertWord.run(memberId, documentId, rule, subject, 'concept', null);
    count++;
  }

  return count;
}

/**
 * Query vocabulary for a specific child + subject.
 * Used by dictation, quiz, fiches, revision to get targeted content.
 */
function getVocabulary(memberId, subject, limit = 60) {
  return db.prepare(
    `SELECT word, category, COUNT(*) as freq FROM kb_vocabulary
     WHERE member_id = ? AND subject LIKE ? AND category = 'mot'
     GROUP BY word ORDER BY freq DESC, created_at DESC LIMIT ?`
  ).all(memberId, `%${subject}%`, limit);
}

/**
 * Query concepts/rules for a specific child + subject.
 */
function getConcepts(memberId, subject, limit = 20) {
  return db.prepare(
    `SELECT word, category FROM kb_vocabulary
     WHERE member_id = ? AND subject LIKE ? AND category IN ('concept','regle','formule','definition')
     ORDER BY created_at DESC LIMIT ?`
  ).all(memberId, `%${subject}%`, limit);
}

/**
 * Get relevant content for a specific topic using FTS5.
 * Returns document excerpts matching the query.
 */
function searchRelevantContent(memberId, query, limit = 5) {
  try {
    return db.prepare(
      `SELECT d.id, d.subject, d.title, d.doc_type, d.raw_text, d.topics, d.key_concepts, d.grade,
              snippet(kb_documents_fts, 0, '', '', '...', 40) as snippet
       FROM kb_documents_fts f
       JOIN kb_documents d ON d.id = f.rowid
       WHERE kb_documents_fts MATCH ? AND d.member_id = ?
       ORDER BY rank LIMIT ?`
    ).all(query, memberId, limit);
  } catch {
    return [];
  }
}

/**
 * Build a concise context string for prompts — targeted, not everything.
 */
function buildSubjectContext(memberId, subject, topic) {
  const vocab = getVocabulary(memberId, subject, 40);
  const concepts = getConcepts(memberId, subject, 10);

  // If a specific topic is given, search FTS for relevant docs
  let relevantDocs = [];
  if (topic) {
    relevantDocs = searchRelevantContent(memberId, topic, 3);
  }

  let context = '';

  if (vocab.length > 0) {
    context += `\nNOTIONS ÉTUDIÉES EN CLASSE (${vocab.length} mots — pour info seulement, NE PAS faire de dictée) : ${vocab.map(v => v.word).join(', ')}`;
  }

  if (concepts.length > 0) {
    context += `\nCONCEPTS DU PROGRAMME : ${concepts.map(c => c.word).join(' | ')}`;
  }

  if (relevantDocs.length > 0) {
    context += '\nDOCUMENTS PERTINENTS:';
    relevantDocs.forEach(d => {
      context += `\n- ${d.title || d.subject} (${d.doc_type}): ${(d.raw_text || '').substring(0, 150)}`;
    });
  }

  return context;
}

// ─── Helpers ───

function cleanWord(m) {
  return (m || '').trim()
    .replace(/\s*\/\s*.*$/, '')      // "gris/grise" → "gris"
    .replace(/\s*[=→\[\(].*$/, '')   // strip phonetic notations
    .replace(/^[-•·]\s*/, '')        // strip bullets
    .trim();
}

function isValidWord(m) {
  return m.length >= 3
    && m.length < 25
    && /^[a-zàâäéèêëïîôùûüÿçœæ]/i.test(m)
    && !/^[a-z]\s*[+→=]/i.test(m)
    && !/[:;]/.test(m)
    && !/^(pp|ph|ch|bb|dd|oi|or|avm|les|une?)$/i.test(m)
    && !/\d/.test(m);
}

module.exports = {
  extractAndStore,
  getVocabulary,
  getConcepts,
  searchRelevantContent,
  buildSubjectContext,
};
