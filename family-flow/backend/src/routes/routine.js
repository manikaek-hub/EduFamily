const express = require('express');
const router = express.Router();
const db = require('../db/init');
const Anthropic = require('@anthropic-ai/sdk');
const { logEvent } = require('../services/learnerProfile');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/routine/analyze
router.post('/analyze', async (req, res) => {
  try {
    const { memberId, coursPhotos = [], evalPhotos = [] } = req.body;

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    if (!member) return res.status(404).json({ success: false, error: 'Membre non trouvé' });

    // Tomorrow's timetable
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    // Skip weekend: if tomorrow is Saturday (6) → Monday (1), if Sunday (0) → Monday (1)
    let tomorrowDow = tomorrow.getDay();
    if (tomorrowDow === 0) tomorrowDow = 1;
    if (tomorrowDow === 6) tomorrowDow = 1;

    const tomorrowClasses = db.prepare(
      'SELECT * FROM kb_timetable WHERE member_id = ? AND day_of_week = ? ORDER BY start_time'
    ).all(memberId, tomorrowDow);

    // Pending homework
    const today = new Date().toISOString().split('T')[0];
    const pendingHomework = db.prepare(
      'SELECT * FROM kb_homework WHERE member_id = ? AND done = 0 AND due_date >= ? ORDER BY due_date LIMIT 8'
    ).all(memberId, today);

    // If no photos at all, return quick plan from DB only (no Claude call)
    if (coursPhotos.length === 0 && evalPhotos.length === 0) {
      return res.json({
        success: true,
        plan: {
          topicsToday: [],
          evalErrors: [],
          tomorrowPrep: tomorrowClasses.map(c => ({ subject: c.subject, keyPoints: [], tip: `Cours de ${c.subject} demain à ${c.start_time}` })),
          eveningMessage: `Bonsoir ${member.name} ! Commence par tes devoirs, puis révise les cours de demain. Courage ! 🦊`,
          pendingHomework,
          tomorrowClasses,
        },
      });
    }

    // Build context for Claude
    let contextSection = `ÉLÈVE: ${member.name}, ${member.age} ans, ${member.grade}\n`;

    if (tomorrowClasses.length > 0) {
      contextSection += `\nCOURS DE DEMAIN:\n`;
      tomorrowClasses.forEach(c => { contextSection += `- ${c.subject} (${c.start_time}-${c.end_time})\n`; });
    } else {
      contextSection += `\nCOURS DE DEMAIN: non renseignés dans l'emploi du temps\n`;
    }

    if (pendingHomework.length > 0) {
      contextSection += `\nDEVOIRS EN ATTENTE:\n`;
      pendingHomework.forEach(hw => {
        contextSection += `- ${hw.subject}: ${hw.description.slice(0, 100)} (pour le ${hw.due_date})\n`;
      });
    }

    // Build multimodal content
    const messageContent = [];

    if (coursPhotos.length > 0) {
      messageContent.push({ type: 'text', text: `Voici ${coursPhotos.length} photo(s) des cours du jour :` });
      coursPhotos.forEach(b64 => {
        messageContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
      });
    }

    if (evalPhotos.length > 0) {
      messageContent.push({ type: 'text', text: `Voici ${evalPhotos.length} photo(s) des évaluations/exercices corrigés du jour :` });
      evalPhotos.forEach(b64 => {
        messageContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
      });
    }

    messageContent.push({ type: 'text', text: 'Génère le plan du soir en JSON.' });

    const systemPrompt = buildRoutinePrompt(member, contextSection);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }],
    });

    const text = response.content[0].text;
    let plan;

    try {
      let cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      plan = JSON.parse(objMatch ? objMatch[0] : cleaned);
    } catch {
      return res.status(500).json({ success: false, error: 'Analyse impossible, réessaie.' });
    }

    // Auto-save extracted topics to KB
    if (plan.topicsToday && plan.topicsToday.length > 0) {
      const insertTopic = db.prepare(`
        INSERT INTO kb_topics (member_id, subject, topic, description, source, date_seen)
        VALUES (?, ?, ?, ?, 'manual', date('now'))
        ON CONFLICT(member_id, subject, topic) DO UPDATE SET
          description = excluded.description,
          date_seen = excluded.date_seen
      `);
      for (const t of plan.topicsToday) {
        try {
          insertTopic.run(memberId, t.subject || 'Cours', t.topic, (t.keyPoints || []).join(' | ').slice(0, 200));
        } catch {}
      }
    }

    plan.pendingHomework = pendingHomework;
    plan.tomorrowClasses = tomorrowClasses;

    // Log events
    logEvent(memberId, 'routine_done', null, null, null,
      `${coursPhotos.length} cours, ${evalPhotos.length} évals`);
    if (coursPhotos.length > 0) logEvent(memberId, 'course_photo', null, null, coursPhotos.length);
    if (evalPhotos.length > 0) logEvent(memberId, 'eval_photo', null, null, evalPhotos.length);

    res.json({ success: true, plan });
  } catch (error) {
    console.error('Routine analyze error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function buildRoutinePrompt(member, contextSection) {
  return `Tu es l'assistant "Routine du Soir" de Family Flow pour ${member.name} (${member.grade}).
${contextSection}

MISSION: Analyser les photos de cours et évaluations, puis générer un plan du soir structuré.

INSTRUCTIONS:
1. Pour chaque COURS: identifie matière, sujet principal, 3-4 points clés, la règle/formule essentielle
2. Pour chaque ÉVALUATION corrigée: identifie les erreurs, les notions à renforcer
3. Génère des conseils de préparation pour demain basés sur les cours de demain listés

FORMAT JSON STRICT:
{
  "topicsToday": [
    {
      "subject": "Maths",
      "topic": "Les fractions",
      "keyPoints": ["numérateur = partie / total", "1/2 = 0,5", "pour additionner: même dénominateur"],
      "toRetain": "La règle la plus importante à retenir ce soir"
    }
  ],
  "evalErrors": [
    {
      "subject": "Français",
      "errors": ["accord sujet-verbe manqué sur 'ils mangent'", "..."],
      "toWork": "Ce qu'il faut retravailler en priorité"
    }
  ],
  "tomorrowPrep": [
    {
      "subject": "Histoire",
      "keyPoints": ["point clé 1 à connaître", "date importante"],
      "tip": "Pour demain: relis la leçon sur..."
    }
  ],
  "eveningMessage": "Un message court d'encouragement fun pour ${member.name} (2 phrases max, avec emoji)"
}

RÈGLES:
- keyPoints: max 4 items, 15 mots max chacun
- Si aucune photo de cours → topicsToday = []
- Si aucune évaluation → evalErrors = []
- tomorrowPrep: basé STRICTEMENT sur les cours de demain listés dans le contexte
- Adapté à l'âge de ${member.age} ans (${member.grade})
- Réponds UNIQUEMENT avec le JSON valide, rien d'autre`;
}

module.exports = router;
