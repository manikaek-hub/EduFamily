const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { generateJSON } = require('../services/claude');

// ─── POST /api/discoveries/generate — Generate family activity suggestions ───
router.post('/generate', async (req, res) => {
  try {
    // Gather all children's current study topics
    const children = db.prepare("SELECT * FROM members WHERE role = 'child'").all();

    const childContexts = children.map(child => {
      // Recent topics
      const topics = db.prepare(
        'SELECT subject, topic FROM kb_topics WHERE member_id = ? ORDER BY date_seen DESC LIMIT 15'
      ).all(child.id);

      // Pending homework
      const homework = db.prepare(
        'SELECT subject, description FROM kb_homework WHERE member_id = ? AND done = 0 ORDER BY due_date ASC LIMIT 8'
      ).all(child.id);

      // Recent photo documents
      let docs = [];
      try {
        docs = db.prepare(
          'SELECT subject, title, topics FROM kb_documents WHERE member_id = ? ORDER BY created_at DESC LIMIT 5'
        ).all(child.id);
        docs.forEach(d => { try { d.topics = JSON.parse(d.topics); } catch { d.topics = []; } });
      } catch {}

      return {
        name: child.name,
        age: child.age,
        grade: child.grade,
        topics: topics.map(t => `${t.subject}: ${t.topic}`),
        homework: homework.map(h => `${h.subject}: ${h.description.slice(0, 80)}`),
        documents: docs.map(d => `${d.subject}: ${d.title || ''} (${(d.topics || []).join(', ')})`),
      };
    });

    const systemPrompt = `Tu es un conseiller culturel familial. La famille habite à Rueil-Malmaison (92), près de Paris.

Analyse ce que les enfants étudient à l'école et propose des SORTIES ET ACTIVITÉS EN FAMILLE qui font le lien entre l'école et le plaisir.

L'objectif: transformer les devoirs en expériences mémorables, créer des moments famille autour de la culture.

Format JSON EXACT attendu:
{
  "suggestions": [
    {
      "category": "theatre" | "film" | "expo" | "livre" | "activite",
      "title": "Titre de la suggestion",
      "description": "Description courte et enthousiaste (2-3 phrases)",
      "why_relevant": "Lien précis avec ce que les enfants étudient — cite les matières et notions",
      "children_concerned": ["Prénom1", "Prénom2"],
      "subjects_linked": ["Français", "Histoire"],
      "discussion_questions": [
        "Question de discussion pour le trajet retour",
        "Question qui challenge les connaissances acquises"
      ],
      "search_query": "requête Google pour trouver l'événement/lieu"
    }
  ]
}

Règles:
- 5 à 8 suggestions variées (mix de catégories)
- Privilégie les suggestions qui touchent PLUSIEURS enfants (différents âges)
- Inclus des suggestions gratuites ou peu chères
- Les questions de discussion doivent provoquer la réflexion, pas juste vérifier un savoir
- Pour les films/théâtre, vérifie que c'est adapté à l'âge des enfants
- Mentionne des lieux/événements réels de la région parisienne quand pertinent
- Si un enfant étudie une oeuvre littéraire, propose de la voir en spectacle
- Pense aussi aux musées (Louvre, Orsay, Sciences, etc.), aux documentaires, aux balades historiques`;

    // Fetch existing discoveries to avoid duplicates
    const existingDiscoveries = db.prepare(
      'SELECT title, category FROM kb_discoveries WHERE saved = 1 OR done = 1 ORDER BY created_at DESC LIMIT 20'
    ).all();
    let avoidSection = '';
    if (existingDiscoveries.length > 0) {
      avoidSection = `\n\nSUGGESTIONS DÉJÀ FAITES OU SAUVEGARDÉES (NE PAS RE-PROPOSER) :\n`;
      existingDiscoveries.forEach(d => { avoidSection += `- [${d.category}] ${d.title}\n`; });
      avoidSection += 'Propose des idées DIFFÉRENTES de celles ci-dessus.\n';
    }

    const childInfo = childContexts.map(c => {
      let info = `\n${c.name} (${c.age} ans, ${c.grade}):`;
      if (c.topics.length) info += `\n  Notions étudiées: ${c.topics.join('; ')}`;
      if (c.homework.length) info += `\n  Devoirs: ${c.homework.join('; ')}`;
      if (c.documents.length) info += `\n  Cours scannés: ${c.documents.join('; ')}`;
      if (!c.topics.length && !c.homework.length && !c.documents.length) info += '\n  (pas encore de données scolaires)';
      return info;
    }).join('\n');

    const userMessage = `Voici ce que les enfants de la famille étudient en ce moment:\n${childInfo}${avoidSection}\n\nPropose des sorties et activités en famille qui font le lien avec leurs cours.`;

    const result = await generateJSON(systemPrompt, userMessage, 3000);
    const suggestions = result.suggestions || [];

    // Save to DB
    const insert = db.prepare(`
      INSERT INTO kb_discoveries (category, title, description, why_relevant, children_concerned, subjects_linked, discussion_questions, search_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Clear old unsaved suggestions
    db.prepare('DELETE FROM kb_discoveries WHERE saved = 0 AND done = 0').run();

    const saved = [];
    for (const s of suggestions) {
      const searchUrl = s.search_query
        ? `https://www.google.com/search?q=${encodeURIComponent(s.search_query + ' Paris')}`
        : null;

      const r = insert.run(
        s.category || 'activite',
        s.title,
        s.description,
        s.why_relevant,
        JSON.stringify(s.children_concerned || []),
        JSON.stringify(s.subjects_linked || []),
        JSON.stringify(s.discussion_questions || []),
        searchUrl
      );
      saved.push({ id: r.lastInsertRowid, ...s, search_url: searchUrl });
    }

    res.json({ success: true, suggestions: saved });
  } catch (err) {
    console.error('Discovery generation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/discoveries — List all discoveries ───
router.get('/', (req, res) => {
  const { saved_only } = req.query;
  let sql = 'SELECT * FROM kb_discoveries';
  if (saved_only === '1') sql += ' WHERE saved = 1';
  sql += ' ORDER BY saved DESC, created_at DESC';

  const discoveries = db.prepare(sql).all();
  discoveries.forEach(d => {
    try { d.children_concerned = JSON.parse(d.children_concerned); } catch { d.children_concerned = []; }
    try { d.subjects_linked = JSON.parse(d.subjects_linked); } catch { d.subjects_linked = []; }
    try { d.discussion_questions = JSON.parse(d.discussion_questions); } catch { d.discussion_questions = []; }
  });

  res.json({ success: true, discoveries });
});

// ─── PUT /api/discoveries/:id/save — Toggle save ───
router.put('/:id/save', (req, res) => {
  const d = db.prepare('SELECT saved FROM kb_discoveries WHERE id = ?').get(parseInt(req.params.id));
  if (!d) return res.status(404).json({ success: false });
  db.prepare('UPDATE kb_discoveries SET saved = ? WHERE id = ?').run(d.saved ? 0 : 1, parseInt(req.params.id));
  res.json({ success: true, saved: !d.saved });
});

// ─── PUT /api/discoveries/:id/done — Mark as done ───
router.put('/:id/done', (req, res) => {
  db.prepare('UPDATE kb_discoveries SET done = 1 WHERE id = ?').run(parseInt(req.params.id));
  res.json({ success: true });
});

// ─── DELETE /api/discoveries/:id ───
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM kb_discoveries WHERE id = ?').run(parseInt(req.params.id));
  res.json({ success: true });
});

module.exports = router;
