const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { generateJSON } = require('../services/claude');
const kb = require('../services/knowledgebase');
const normalizeSubject = require('../utils/normalizeSubject');

// ─── POST /api/fiches/generate — Generate a fiche or mind map via Claude ───
router.post('/generate', async (req, res) => {
  try {
    const { memberId, subject: rawSubject, topic, type = 'fiche', chapter } = req.body;
    const subject = normalizeSubject(rawSubject);

    if (!memberId || !subject) {
      return res.status(400).json({ success: false, error: 'memberId et subject requis' });
    }

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    if (!member) return res.status(404).json({ success: false, error: 'Membre non trouvé' });

    // Check for existing similar fiche to avoid duplicates
    if (topic) {
      const existing = db.prepare(
        `SELECT id, title FROM kb_fiches WHERE member_id = ? AND subject = ? AND type = ? AND title LIKE ? LIMIT 1`
      ).get(memberId, subject, type, `%${topic.slice(0, 30)}%`);
      if (existing) {
        return res.json({ success: true, fiche: existing, alreadyExists: true,
          message: `Une fiche "${existing.title}" existe déjà sur ce sujet.` });
      }
    }

    // Gather context from KB
    const kbContext = kb.getFoxieContext(memberId, subject);

    // Get structured vocabulary and concepts from kb_vocabulary (scalable)
    const { buildSubjectContext, searchRelevantContent } = require('../services/vocabularyExtractor');
    const vocabContext = buildSubjectContext(memberId, subject, topic);

    // If specific topic, also search FTS for matching document excerpts
    let topicContent = '';
    if (topic) {
      const relevant = searchRelevantContent(memberId, topic, 2);
      relevant.forEach(d => {
        if (d.raw_text) topicContent += `\nExtrait pertinent (${d.title}): ${d.raw_text.substring(0, 250)}`;
      });
    }

    // Build context section
    let contextInfo = `Élève: ${member.name}, ${member.age} ans, ${member.grade}\nMatière: ${subject}`;
    if (topic) contextInfo += `\nSujet spécifique: ${topic}`;
    if (chapter) contextInfo += `\nChapitre: ${chapter}`;
    if (kbContext?.pendingHomework?.length > 0) {
      contextInfo += '\nDevoirs en cours: ' + kbContext.pendingHomework.map(h => h.description.slice(0, 80)).join(' | ');
    }
    if (kbContext?.topics?.length > 0) {
      contextInfo += '\nNotions étudiées: ' + kbContext.topics.map(t => t.topic).join(', ');
    }
    if (vocabContext) {
      contextInfo += '\n' + vocabContext;
    }
    if (topicContent) {
      contextInfo += '\n\nContenu de cours pertinent:' + topicContent;
    }

    let systemPrompt, userMessage;

    if (type === 'carte_mentale') {
      systemPrompt = `Tu es un expert pédagogique. Génère une carte mentale structurée en JSON pour un enfant de ${member.age} ans en ${member.grade}.
La carte doit être visuelle, colorée, et aider à mémoriser les concepts clés.

Format JSON EXACT attendu:
{
  "title": "Titre de la carte",
  "central": "Concept central",
  "branches": [
    {
      "label": "Branche 1",
      "color": "#4A90D9",
      "items": ["élément 1", "élément 2", "élément 3"]
    }
  ],
  "summary": "Phrase résumé pour mémoriser l'essentiel"
}

Règles:
- 3 à 6 branches maximum
- 2 à 5 items par branche
- Couleurs variées et vives (#4A90D9, #E67E22, #27AE60, #9B59B6, #E74C3C, #F39C12)
- Langage adapté à l'âge de l'enfant
- Concepts clés bien hiérarchisés`;

      userMessage = `${contextInfo}\n\nCrée une carte mentale sur: ${topic || subject}`;
    } else if (type === 'flashcards') {
      systemPrompt = `Tu es un expert pédagogique. Génère des flashcards de révision en JSON pour un enfant de ${member.age} ans en ${member.grade}.

Format JSON EXACT attendu:
{
  "title": "Titre du paquet",
  "cards": [
    {
      "question": "Question recto",
      "answer": "Réponse verso",
      "hint": "Indice optionnel"
    }
  ],
  "summary": "Ce que ces cartes permettent de réviser"
}

Règles:
- 5 à 10 cartes
- Questions claires et précises
- Réponses courtes et mémorisables
- Indices pour aider sans donner la réponse
- Adapté au niveau de l'enfant`;

      userMessage = `${contextInfo}\n\nCrée des flashcards sur: ${topic || subject}`;
    } else {
      // Fiche de révision
      systemPrompt = `Tu es un expert pédagogique. Génère une fiche de révision structurée en JSON pour un enfant de ${member.age} ans en ${member.grade}.
La fiche doit être claire, visuelle avec des emojis, et aider à retenir l'essentiel.

Format JSON EXACT attendu:
{
  "title": "Titre de la fiche",
  "objective": "Ce que tu vas savoir après cette fiche",
  "sections": [
    {
      "heading": "📌 Titre de section",
      "points": ["Point clé 1", "Point clé 2"],
      "example": "Exemple concret (optionnel)",
      "tip": "Astuce pour retenir (optionnel)"
    }
  ],
  "key_formulas": ["Formule ou règle importante"],
  "mistakes_to_avoid": ["Erreur fréquente à éviter"],
  "summary": "Résumé en 2-3 phrases de l'essentiel à retenir",
  "quiz_yourself": ["Question pour se tester"]
}

Règles:
- 3 à 5 sections maximum
- Langage simple adapté à l'âge
- Exemples concrets du quotidien quand possible
- Emojis pour rendre la fiche attractive
- Les "quiz_yourself" sont des questions ouvertes pour vérifier qu'on a compris`;

      userMessage = `${contextInfo}\n\nCrée une fiche de révision sur: ${topic || subject}`;
    }

    const generated = await generateJSON(systemPrompt, userMessage, 2048);

    // Save to DB
    const result = db.prepare(`
      INSERT INTO kb_fiches (member_id, subject, chapter, title, type, content, tags, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ai')
    `).run(
      memberId,
      subject,
      chapter || null,
      generated.title || topic || subject,
      type,
      JSON.stringify(generated),
      JSON.stringify(topic ? [topic] : [])
    );

    res.json({
      success: true,
      fiche: {
        id: result.lastInsertRowid,
        title: generated.title || topic || subject,
        type,
        subject,
        chapter,
        content: generated,
      }
    });
  } catch (err) {
    console.error('Fiche generation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/fiches/:memberId — List all fiches for a child ───
router.get('/:memberId', (req, res) => {
  const memberId = parseInt(req.params.memberId);
  const { subject, type } = req.query;

  let sql = 'SELECT id, subject, chapter, title, type, tags, starred, source, created_at FROM kb_fiches WHERE member_id = ?';
  const params = [memberId];

  if (subject) { sql += ' AND subject LIKE ?'; params.push(`%${subject}%`); }
  if (type) { sql += ' AND type = ?'; params.push(type); }

  sql += ' ORDER BY starred DESC, created_at DESC';

  const fiches = db.prepare(sql).all(...params);
  fiches.forEach(f => { try { f.tags = JSON.parse(f.tags); } catch { f.tags = []; } });

  // Group by subject
  const bySubject = {};
  fiches.forEach(f => {
    if (!bySubject[f.subject]) bySubject[f.subject] = [];
    bySubject[f.subject].push(f);
  });

  res.json({ success: true, fiches, bySubject });
});

// ─── GET /api/fiches/detail/:id — Get full fiche content ───
router.get('/detail/:id', (req, res) => {
  const fiche = db.prepare('SELECT * FROM kb_fiches WHERE id = ?').get(parseInt(req.params.id));
  if (!fiche) return res.status(404).json({ success: false, error: 'Fiche non trouvée' });

  try { fiche.content = JSON.parse(fiche.content); } catch {}
  try { fiche.tags = JSON.parse(fiche.tags); } catch { fiche.tags = []; }

  res.json({ success: true, fiche });
});

// ─── PUT /api/fiches/:id/star — Toggle star ───
router.put('/:id/star', (req, res) => {
  const fiche = db.prepare('SELECT starred FROM kb_fiches WHERE id = ?').get(parseInt(req.params.id));
  if (!fiche) return res.status(404).json({ success: false, error: 'Fiche non trouvée' });

  const newVal = fiche.starred ? 0 : 1;
  db.prepare('UPDATE kb_fiches SET starred = ? WHERE id = ?').run(newVal, parseInt(req.params.id));
  res.json({ success: true, starred: newVal });
});

// ─── DELETE /api/fiches/:id ───
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM kb_fiches WHERE id = ?').run(parseInt(req.params.id));
  res.json({ success: true });
});

// ─── POST /api/fiches/:id/exercises — Generate targeted exercises from fiche content ───
router.post('/:id/exercises', async (req, res) => {
  try {
    const ficheRow = db.prepare('SELECT * FROM kb_fiches WHERE id = ?').get(parseInt(req.params.id));
    if (!ficheRow) return res.status(404).json({ success: false, error: 'Fiche non trouvée' });

    const { memberId } = req.body;
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    if (!member) return res.status(404).json({ success: false, error: 'Membre non trouvé' });

    const content = JSON.parse(ficheRow.content);

    // Build a detailed content summary for the exercise generator
    let ficheText = `Titre: ${content.title || ficheRow.title}\nMatière: ${ficheRow.subject}\n`;
    if (content.objective) ficheText += `Objectif: ${content.objective}\n`;
    if (content.sections) {
      content.sections.forEach(s => {
        ficheText += `\n## ${s.heading}\n`;
        s.points?.forEach(p => { ficheText += `- ${p}\n`; });
        if (s.example) ficheText += `Exemple: ${s.example}\n`;
      });
    }
    if (content.branches) {
      content.branches.forEach(b => {
        ficheText += `\n## ${b.label}\n`;
        (b.items || b.sub_branches || []).forEach(item => {
          ficheText += `- ${typeof item === 'string' ? item : item.label}\n`;
        });
      });
    }
    if (content.key_formulas) ficheText += `\nFormules: ${content.key_formulas.join(' | ')}\n`;
    if (content.mistakes_to_avoid) ficheText += `\nErreurs fréquentes: ${content.mistakes_to_avoid.join(' | ')}\n`;

    const levelMap = { 'CE2': 'CE2 (8 ans)', '6eme': '6ème (11 ans)', '4eme': '4ème (14 ans)' };
    const level = levelMap[member.grade] || member.grade;

    const exercises = await generateJSON(
      `Tu es un professeur expert. Génère exactement 5 exercices variés et CIBLÉS basés sur le contenu de cette fiche de révision.

ÉLÈVE: ${member.name}, ${level}
MATIÈRE: ${ficheRow.subject}

CONTENU DE LA FICHE:
${ficheText}

RÈGLES CRITIQUES:
- Chaque exercice DOIT porter sur un point PRÉCIS de la fiche (pas de questions génériques)
- Varie OBLIGATOIREMENT les types d'exercices parmi ceux listés ci-dessous
- Les QCM ont exactement 4 choix avec UNE seule bonne réponse
- Niveau adapté à ${level}
- Les réponses doivent être VÉRIFIABLES et CORRECTES
- VÉRIFIE chaque réponse 2 fois avant de la donner

TYPES D'EXERCICES DISPONIBLES:
- "qcm" : question à choix multiples (4 options, 1 bonne)
- "vrai_faux" : affirmer si un énoncé est vrai ou faux
- "application" : exercice d'application directe (l'enfant écrit sa réponse — calcul, formule, conjugaison, date...)
- "situation" : problème en contexte (mise en situation concrète, énoncé type problème)
- "erreur" : trouver et corriger l'erreur dans un énoncé/calcul donné
- "completement" : compléter une phrase, formule, ou schéma à trous

Format JSON EXACT:
{
  "exercises": [
    {
      "type": "qcm",
      "question": "question précise liée au contenu de la fiche",
      "choices": ["A", "B", "C", "D"],
      "answer": "B",
      "explanation": "explication claire de pourquoi c'est la bonne réponse",
      "fiche_section": "nom de la section de la fiche concernée"
    },
    {
      "type": "vrai_faux",
      "question": "affirmation à évaluer",
      "answer": "vrai",
      "explanation": "pourquoi",
      "fiche_section": "section"
    },
    {
      "type": "application",
      "question": "Calcule: -2/3 + 5/6. Détaille les étapes.",
      "answer": "1/6",
      "explanation": "étapes détaillées du raisonnement",
      "hint": "indice optionnel",
      "fiche_section": "section"
    },
    {
      "type": "situation",
      "question": "Un terrain rectangulaire mesure 6m et 8m. Quelle est la longueur de sa diagonale ?",
      "answer": "10m",
      "explanation": "On applique Pythagore: 6²+8²=100, √100=10",
      "fiche_section": "section"
    },
    {
      "type": "erreur",
      "question": "Trouve l'erreur: 2/3 + 1/4 = 3/7",
      "answer": "11/12",
      "explanation": "On ne peut pas additionner les numérateurs et dénominateurs séparément. Il faut un dénominateur commun: 8/12 + 3/12 = 11/12",
      "fiche_section": "section"
    }
  ]
}`,
      `Génère 5 exercices variés et ciblés pour cette fiche: "${content.title || ficheRow.title}"`,
      4096
    );

    res.json({ success: true, exercises: exercises.exercises || exercises });
  } catch (err) {
    console.error('Exercise generation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/fiches/check-answer — Check a free-text answer via Claude ───
router.post('/check-answer', async (req, res) => {
  try {
    const { question, userAnswer, correctAnswer, acceptKeywords, exerciseType } = req.body;

    if (exerciseType === 'qcm' || exerciseType === 'vrai_faux') {
      // Direct string match
      const isCorrect = userAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
      return res.json({ success: true, isCorrect, explanation: '' });
    }

    // For calcul and texte_court, use Claude to evaluate
    const result = await generateJSON(
      `Tu évalues la réponse d'un enfant à un exercice scolaire. Sois JUSTE mais BIENVEILLANT.

Question: ${question}
Réponse attendue: ${correctAnswer}
${acceptKeywords?.length ? `Mots-clés acceptables: ${acceptKeywords.join(', ')}` : ''}
Réponse de l'enfant: ${userAnswer}

Évalue si la réponse est correcte, partiellement correcte, ou incorrecte.
Pour les calculs: le résultat numérique doit être exact.
Pour les textes: accepte les formulations différentes si le sens est correct.

JSON:
{
  "isCorrect": true/false,
  "isPartial": true/false,
  "explanation": "explication courte et encourageante"
}`,
      `Évalue: "${userAnswer}"`,
      500
    );

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
