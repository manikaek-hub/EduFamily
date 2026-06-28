const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { generateJSON, sendMessage } = require('../services/claude');
const { getVocabulary, getConcepts } = require('../services/vocabularyExtractor');
const { awardCoins } = require('../services/coins');

// ─── GET /api/dictation/lesson-words/:memberId — Recent lesson vocabulary for dictation ───
router.get('/lesson-words/:memberId', (req, res) => {
  const memberId = parseInt(req.params.memberId);
  try {
    // Get recent French vocabulary from KB (words extracted from photos/docs)
    const vocabWords = getVocabulary(memberId, 'FRAN', 40);
    const concepts = getConcepts(memberId, 'FRAN', 10);

    // Get recent French homework descriptions for word extraction
    const recentHw = db.prepare(
      `SELECT subject, description FROM kb_homework
       WHERE member_id = ? AND (subject LIKE '%fran%' OR subject LIKE '%FRAN%' OR subject LIKE '%Fran%')
       ORDER BY due_date DESC LIMIT 5`
    ).all(memberId);

    // Get recent French documents (lessons, exercises)
    let recentDocs = [];
    try {
      recentDocs = db.prepare(
        `SELECT title, subject, doc_type, key_concepts, created_at FROM kb_documents
         WHERE member_id = ? AND (subject LIKE '%FRAN%' OR subject LIKE '%fran%' OR subject LIKE '%Fran%')
         ORDER BY created_at DESC LIMIT 8`
      ).all(memberId);
    } catch {}

    // Get manual word lists if any
    let manualWords = [];
    try {
      manualWords = db.prepare(
        `SELECT word FROM kb_vocabulary
         WHERE member_id = ? AND subject LIKE '%dictee%'
         ORDER BY created_at DESC LIMIT 30`
      ).all(memberId).map(r => r.word);
    } catch {}

    res.json({
      success: true,
      vocabulary: vocabWords.map(v => v.word),
      concepts: concepts.map(c => c.word),
      recentHomework: recentHw,
      recentDocs: recentDocs.map(d => ({
        title: d.title,
        type: d.doc_type,
        concepts: (() => { try { return JSON.parse(d.key_concepts || '[]'); } catch { return []; } })(),
        date: d.created_at,
      })),
      manualWords,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/dictation/save-words — Save manual word list for dictation ───
router.post('/save-words', (req, res) => {
  try {
    const { memberId, words } = req.body;
    if (!memberId || !words?.length) return res.status(400).json({ success: false, error: 'memberId et words requis' });

    const insert = db.prepare(
      `INSERT OR IGNORE INTO kb_vocabulary (member_id, subject, word, category, source_doc_id)
       VALUES (?, 'dictee_mots', ?, 'mot', NULL)`
    );

    const tx = db.transaction(() => {
      for (const word of words) {
        if (word.trim()) insert.run(memberId, word.trim().toLowerCase());
      }
    });
    tx();

    res.json({ success: true, saved: words.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/dictation/stats/:memberId — Error stats & progress ───
router.get('/stats/:memberId', (req, res) => {
  const memberId = parseInt(req.params.memberId);
  try {
    const sessions = db.prepare(
      `SELECT COUNT(*) as total, AVG(score) as avg_score, SUM(errors_count) as total_errors
       FROM dictation_sessions WHERE member_id = ?`
    ).get(memberId);

    // Most common error categories
    const errorCategories = db.prepare(
      `SELECT de.error_category, COUNT(*) as count
       FROM dictation_errors de
       JOIN dictation_sessions ds ON de.session_id = ds.id
       WHERE ds.member_id = ? AND de.mastered = 0
       GROUP BY de.error_category ORDER BY count DESC LIMIT 5`
    ).all(memberId);

    // Words to review (not mastered, due for review)
    const wordsToReview = db.prepare(
      `SELECT de.word_expected, de.error_category, de.review_count
       FROM dictation_errors de
       JOIN dictation_sessions ds ON de.session_id = ds.id
       WHERE ds.member_id = ? AND de.mastered = 0
       AND (de.next_review IS NULL OR de.next_review <= datetime('now'))
       ORDER BY de.review_count ASC, de.created_at DESC LIMIT 20`
    ).all(memberId);

    // Recent sessions
    const recentSessions = db.prepare(
      `SELECT id, level, theme, score, total_words, errors_count, created_at
       FROM dictation_sessions WHERE member_id = ?
       ORDER BY created_at DESC LIMIT 10`
    ).all(memberId);

    res.json({
      success: true,
      stats: {
        totalSessions: sessions.total || 0,
        avgScore: sessions.avg_score ? Math.round(sessions.avg_score) : null,
        totalErrors: sessions.total_errors || 0,
        errorCategories,
        wordsToReview,
        recentSessions,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Helper: extract "mots à apprendre" from document raw_text ───
function extractLessonWords(rawText) {
  const words = new Set();

  // "Les mots à apprendre" or "mots à apprendre" sections
  const patterns = [
    /(?:les\s+)?mots?\s+[àa]\s+apprendre\s*[:\n]([\s\S]*?)(?:\n\n|\n[A-ZÉÈÊ]|$)/i,
    /(?:les\s+)?mots?\s+de\s+la\s+leçon\s*[:\n]([\s\S]*?)(?:\n\n|\n[A-ZÉÈÊ]|$)/i,
    /liste\s+de\s+mots?\s*[:\n]([\s\S]*?)(?:\n\n|\n[A-ZÉÈÊ]|$)/i,
  ];

  for (const pat of patterns) {
    const m = rawText.match(pat);
    if (m) {
      m[1]
        .split(/[•·|\n,;]+/)
        .map(w => w.trim()
          .replace(/\s*\/\s*.*$/, '')   // gris/grise → gris
          .replace(/^[-•·\[\]]\s*/, '') // strip bullets
          .replace(/^\([^)]+\)\s*/, '') // strip phonetics
          .trim()
        )
        .filter(w => w.length >= 2 && w.length < 30 && /^[a-zàâäéèêëïîôùûüÿçœæA-Z]/i.test(w) && !/\d/.test(w))
        .forEach(w => words.add(w));
    }
  }
  return [...words];
}

// ─── POST /api/dictation/generate — Generate an adaptive dictation ───
router.post('/generate', async (req, res) => {
  try {
    const { memberId, theme } = req.body;
    if (!memberId) return res.status(400).json({ success: false, error: 'memberId requis' });

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    if (!member) return res.status(404).json({ success: false, error: 'Membre non trouvé' });

    // Gather past errors (not yet mastered)
    const pastErrors = db.prepare(
      `SELECT de.word_expected, de.error_category, de.review_count
       FROM dictation_errors de
       JOIN dictation_sessions ds ON de.session_id = ds.id
       WHERE ds.member_id = ? AND de.mastered = 0
       ORDER BY de.review_count ASC LIMIT 15`
    ).all(memberId);

    // ── Extract lesson words directly from recent French documents (source of truth) ──
    const recentDictationDocs = db.prepare(
      `SELECT title, raw_text, created_at FROM kb_documents
       WHERE member_id = ? AND (subject LIKE '%Fran%' OR subject LIKE '%FRAN%')
       ORDER BY created_at DESC LIMIT 5`
    ).all(memberId);

    let lessonWords = [];
    let docTitles = [];
    for (const doc of recentDictationDocs) {
      const extracted = extractLessonWords(doc.raw_text || '');
      if (extracted.length > 0) {
        lessonWords.push(...extracted);
        docTitles.push(doc.title || 'leçon');
      }
    }
    lessonWords = [...new Set(lessonWords)]; // deduplicate

    // ── Also get manually saved dictation words ──
    let manualWords = [];
    try {
      manualWords = db.prepare(
        `SELECT word FROM kb_vocabulary
         WHERE member_id = ? AND subject LIKE '%dictee%'
         ORDER BY created_at DESC LIMIT 30`
      ).all(memberId).map(r => r.word);
    } catch {}

    // Mandatory words = manual (most recent intent) first, then lesson words
    const mandatoryWords = [...new Set([...manualWords, ...lessonWords])].slice(0, 20);

    // Get error categories stats for focus
    const weakCategories = db.prepare(
      `SELECT de.error_category, COUNT(*) as count
       FROM dictation_errors de
       JOIN dictation_sessions ds ON de.session_id = ds.id
       WHERE ds.member_id = ? AND de.mastered = 0
       GROUP BY de.error_category ORDER BY count DESC LIMIT 3`
    ).all(memberId);

    // Build prompt
    const levelMap = {
      'CE1': 'CE1 (7 ans)', 'CE2': 'CE2 (8 ans)', 'CM1': 'CM1 (9 ans)', 'CM2': 'CM2 (10 ans)',
      '6eme': '6ème (11 ans)', '5eme': '5ème (12 ans)', '4eme': '4ème (13 ans)', '3eme': '3ème (14 ans)',
    };
    const level = levelMap[member.grade] || member.grade;

    let focusSection = '';

    // ── PRIORITY 1: Lesson words are MANDATORY ──
    if (mandatoryWords.length > 0) {
      focusSection += `\n\n⭐ MOTS DE LA LEÇON — TU DOIS INCLURE UN MAXIMUM DE CES MOTS DANS LA DICTÉE (c'est leur liste d'apprentissage) :\n${mandatoryWords.join(', ')}`;
      if (docTitles.length > 0) {
        focusSection += `\n(extraits de : ${[...new Set(docTitles)].slice(0, 3).join(', ')})`;
      }
    }

    // ── PRIORITY 2: Reinforce past errors ──
    if (pastErrors.length > 0) {
      focusSection += `\n\nMOTS À RÉINTRODUIRE (erreurs passées non maîtrisées — intègre les si possible) :\n`;
      focusSection += pastErrors.map(e => `- "${e.word_expected}" (catégorie: ${e.error_category})`).join('\n');
    }

    if (weakCategories.length > 0) {
      focusSection += `\n\nCATÉGORIES D'ERREURS À CIBLER :\n`;
      focusSection += weakCategories.map(c => `- ${c.error_category}: ${c.count} erreurs`).join('\n');
    }

    const systemPrompt = `Tu es un professeur de français expert en orthographe et dictée pour enfants.
Génère une dictée adaptée au niveau ${level}.

RÈGLES ABSOLUES :
- La dictée fait 3 à 5 phrases courtes (niveau ${level})
- Vocabulaire simple, adapté à l'âge
- Les phrases forment un petit texte cohérent et amusant
- Tu DOIS utiliser les mots de la leçon listés ci-dessous — c'est leur liste d'apprentissage de la semaine
- Ne mélange pas avec d'autres matières : cette dictée est UNIQUEMENT de français
${theme ? `- Thème demandé : ${theme}` : '- Choisis un thème proche des mots à apprendre (animaux, nature, quotidien...)'}
${focusSection}

Format JSON EXACT :
{
  "title": "Titre de la dictée",
  "theme": "thème choisi",
  "level": "${member.grade}",
  "sentences": ["Phrase 1.", "Phrase 2.", "Phrase 3."],
  "full_text": "Texte complet de la dictée",
  "word_count": 30,
  "difficulty_words": ["mot1", "mot2"],
  "targeted_rules": ["accord adjectif", "accent circonflexe"],
  "hints": ["Indice 1 pour aider", "Indice 2"]
}`;

    const generated = await generateJSON(systemPrompt, `Génère une dictée pour ${member.name}, ${level}.`, 1024);

    res.json({ success: true, dictation: generated });
  } catch (err) {
    console.error('Dictation generate error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/dictation/check — Check a dictation attempt ───
router.post('/check', async (req, res) => {
  try {
    const { memberId, dictation, transcription } = req.body;
    if (!memberId || !dictation || !transcription) {
      return res.status(400).json({ success: false, error: 'memberId, dictation et transcription requis' });
    }

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    if (!member) return res.status(404).json({ success: false, error: 'Membre non trouvé' });

    const systemPrompt = `Tu es un professeur de français qui corrige une dictée.
L'enfant est en ${member.grade} (${member.age} ans, ${member.name}).

Compare le texte original avec ce que l'enfant a écrit. Identifie CHAQUE erreur.

IMPORTANT :
- Sois précis : compare mot à mot
- Ignore la casse en début de phrase et la ponctuation finale
- Classe chaque erreur dans une catégorie
- Donne un encouragement adapté au score
- Si l'enfant a fait peu d'erreurs, félicite chaleureusement

Format JSON EXACT :
{
  "score": 85,
  "total_words": 42,
  "correct_words": 36,
  "errors": [
    {
      "expected": "mot correct",
      "written": "mot ecrit par l'enfant",
      "category": "accent|accord|conjugaison|double_consonne|homophone|orthographe|ponctuation|autre",
      "explanation": "Explication courte et pédagogique"
    }
  ],
  "corrected_text": "Le texte corrigé avec les corrections en gras",
  "encouragement": "Message d'encouragement personnalisé",
  "tips": ["Conseil 1 pour s'améliorer", "Conseil 2"]
}`;

    const userMessage = `TEXTE ORIGINAL :\n${dictation.full_text}\n\nTEXTE DE L'ENFANT :\n${transcription}`;
    const result = await generateJSON(systemPrompt, userMessage, 1500);

    // Save session
    const session = db.prepare(
      `INSERT INTO dictation_sessions (member_id, level, theme, score, total_words, errors_count)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(memberId, member.grade, dictation.theme || null, result.score, result.total_words, (result.errors || []).length);

    // Save individual errors for spaced repetition
    const insertError = db.prepare(
      `INSERT INTO dictation_errors (session_id, word_expected, word_written, error_category, next_review)
       VALUES (?, ?, ?, ?, datetime('now', '+1 day'))`
    );

    for (const err of (result.errors || [])) {
      insertError.run(session.lastInsertRowid, err.expected, err.written, err.category);

      // If the word was a past error and child got it right this time → mark progress
      // (it's in the errors list so they got it wrong again — increase review interval)
    }

    // Check if any past error words were correctly written this time → mark mastered
    const pastErrorWords = db.prepare(
      `SELECT DISTINCT de.id, de.word_expected, de.review_count
       FROM dictation_errors de
       JOIN dictation_sessions ds ON de.session_id = ds.id
       WHERE ds.member_id = ? AND de.mastered = 0`
    ).all(memberId);

    const errorWordsSet = new Set((result.errors || []).map(e => e.expected.toLowerCase()));
    let masteredCount = 0;
    for (const past of pastErrorWords) {
      if (!errorWordsSet.has(past.word_expected.toLowerCase())) {
        // Word was in dictation vocabulary but not in errors → child got it right!
        // Check if the word was actually in this dictation
        if (dictation.full_text.toLowerCase().includes(past.word_expected.toLowerCase())) {
          if (past.review_count >= 2) {
            // Mastered after 3+ correct reviews
            db.prepare('UPDATE dictation_errors SET mastered = 1 WHERE id = ?').run(past.id);
            masteredCount++;
          } else {
            db.prepare('UPDATE dictation_errors SET review_count = review_count + 1, next_review = datetime("now", "+" || (review_count + 2) || " days") WHERE id = ?').run(past.id);
          }
        }
      }
    }

    result.sessionId = session.lastInsertRowid;
    result.masteredWords = masteredCount;

    // Award coins based on dictation score
    let coinsEarned = 0;
    try {
      const score = result.score || 0;
      if (score >= 90) coinsEarned = 25;
      else if (score >= 75) coinsEarned = 15;
      else if (score >= 50) coinsEarned = 10;
      else coinsEarned = 5; // participation
      // Bonus for mastered words
      coinsEarned += masteredCount * 3;
      awardCoins(memberId, coinsEarned, `Dictée: ${score}% (${masteredCount} mots maîtrisés)`, 'dictation', session.lastInsertRowid);
      result.coinsEarned = coinsEarned;
    } catch (e) { console.error('Coins award error (dictation):', e.message); }

    res.json({ success: true, result });
  } catch (err) {
    console.error('Dictation check error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
