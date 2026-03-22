const db = require('../db/init');
const { generateJSON } = require('../services/claude');

/**
 * Agent d'Amélioration Continue — Le coeur de la boucle terrain → app
 *
 * Cet agent analyse :
 *   1. Les feedbacks des enfants (difficultés, idées, émotions)
 *   2. Les scores et patterns d'apprentissage
 *   3. Les taux d'engagement et d'abandon
 *   4. Les données de mastery et progression
 *
 * Il génère des propositions d'amélioration concrètes
 * que Manika peut valider en un clic.
 */

const ANALYSIS_PROMPT = `Tu es l'Agent d'Amélioration Continue de Family Flow, une app éducative pour enfants.

Tu analyses les données terrain (feedbacks, scores, engagement) et tu proposes des améliorations CONCRETES et ACTIONNABLES.

REGLES :
- Chaque proposition doit être spécifique (pas de "améliorer le contenu" mais "raccourcir les exercices de conjugaison CE1 de 10 à 5 questions")
- Priorise par impact : ce qui touche le plus d'enfants en premier
- Donne des preuves chiffrées (X enfants concernés, score moyen de Y)
- Propose une action technique précise (ce qu'il faut changer dans l'app)
- Catégorise : content, difficulty, ux, engagement, new_feature, bug_fix

FORMAT JSON ATTENDU :
{
  "proposals": [
    {
      "title": "Titre court de la proposition",
      "description": "Explication détaillée du problème identifié",
      "category": "content|difficulty|ux|engagement|new_feature|bug_fix",
      "priority": "critical|high|medium|low",
      "evidence": "Données chiffrées qui justifient la proposition",
      "affected_subject": "Matière concernée ou null",
      "proposed_action": "Action technique précise à réaliser"
    }
  ]
}`;

/**
 * Analyse les feedbacks non traités et les données de performance
 * pour générer des propositions d'amélioration
 */
async function analyzeAndPropose() {
  console.log('🔄 Agent Amélioration : analyse en cours...');

  // 1. Collecter les feedbacks non traités
  const unprocessedFeedback = db.prepare(`
    SELECT f.*, m.name, m.grade
    FROM feedback f
    JOIN members m ON f.member_id = m.id
    WHERE f.processed = 0
    ORDER BY f.created_at DESC
    LIMIT 50
  `).all();

  // 2. Collecter les pain points (rating <= 2)
  const painPoints = db.prepare(`
    SELECT subject, topic, AVG(rating) as avg_rating, COUNT(*) as count,
           GROUP_CONCAT(DISTINCT comment) as comments
    FROM feedback
    WHERE rating IS NOT NULL AND rating <= 2
    AND created_at > datetime('now', '-7 days')
    GROUP BY subject, topic
    ORDER BY count DESC
    LIMIT 10
  `).all();

  // 3. Sujets avec faible maîtrise
  const lowMastery = db.prepare(`
    SELECT kt.subject, kt.name as topic, kt.mastery, m.name as member_name, m.grade
    FROM kb_topics kt
    JOIN members m ON kt.member_id = m.id
    WHERE kt.mastery <= 2
    ORDER BY kt.mastery ASC
    LIMIT 20
  `).all();

  // 4. Sessions avec faible engagement
  const lowEngagement = db.prepare(`
    SELECT el.score, el.signals, m.name, m.grade,
           hs.subject, hs.topic
    FROM engagement_log el
    JOIN members m ON el.member_id = m.id
    LEFT JOIN homework_sessions hs ON el.session_id = hs.id
    WHERE el.score < 50
    AND el.created_at > datetime('now', '-7 days')
    ORDER BY el.score ASC
    LIMIT 20
  `).all();

  // 5. Quiz avec mauvais scores
  const lowQuizScores = db.prepare(`
    SELECT qq.subject, qq.difficulty,
           COUNT(*) as total,
           SUM(CASE WHEN qa.is_correct = 1 THEN 1 ELSE 0 END) as correct,
           ROUND(100.0 * SUM(CASE WHEN qa.is_correct = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) as success_rate
    FROM quiz_answers qa
    JOIN quiz_questions qq ON qa.question_id = qq.id
    WHERE qa.created_at > datetime('now', '-7 days')
    GROUP BY qq.subject, qq.difficulty
    HAVING success_rate < 50
    ORDER BY success_rate ASC
  `).all();

  // Si pas assez de données, ne rien proposer
  if (unprocessedFeedback.length === 0 && painPoints.length === 0
      && lowMastery.length === 0 && lowEngagement.length === 0) {
    console.log('🔄 Agent Amélioration : pas assez de données pour proposer');
    return { proposals: [], message: 'Pas assez de données terrain' };
  }

  // Construire le contexte pour Claude
  const dataContext = `
DONNEES TERRAIN (derniers 7 jours) :

FEEDBACKS NON TRAITES (${unprocessedFeedback.length}) :
${unprocessedFeedback.map(f => `- ${f.name} (${f.grade}) : [${f.type}] rating=${f.rating || '?'} "${f.comment || 'pas de commentaire'}" (sujet: ${f.subject || '?'}, topic: ${f.topic || '?'})`).join('\n')}

POINTS DE DOULEUR (sujets avec rating <= 2) :
${painPoints.map(p => `- ${p.subject}/${p.topic} : note moyenne ${p.avg_rating?.toFixed(1)}/5, ${p.count} signalements. Commentaires: "${p.comments || ''}"`).join('\n') || 'Aucun'}

FAIBLE MAITRISE :
${lowMastery.map(m => `- ${m.member_name} (${m.grade}) : ${m.subject}/${m.topic} — maîtrise ${m.mastery}/5`).join('\n') || 'Aucun'}

FAIBLE ENGAGEMENT :
${lowEngagement.map(e => `- ${e.name} (${e.grade}) : score ${e.score}/100 en ${e.subject || '?'}/${e.topic || '?'} — signaux: ${e.signals || '?'}`).join('\n') || 'Aucun'}

QUIZ AVEC FAIBLE REUSSITE :
${lowQuizScores.map(q => `- ${q.subject} (difficulté ${q.difficulty}) : ${q.success_rate}% de réussite (${q.correct}/${q.total})`).join('\n') || 'Aucun'}

Génère entre 1 et 5 propositions d'amélioration CONCRETES basées sur ces données.
`;

  try {
    const result = await generateJSON(ANALYSIS_PROMPT, dataContext, 2048);
    const proposals = result.proposals || [];

    // Insérer les propositions dans la base
    const insertProposal = db.prepare(`
      INSERT INTO improvement_proposals
        (title, description, category, priority, evidence, affected_subject, proposed_action, feedback_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const feedbackIds = unprocessedFeedback.map(f => f.id).join(',');

    for (const p of proposals) {
      insertProposal.run(
        p.title,
        p.description,
        p.category || 'content',
        p.priority || 'medium',
        p.evidence || '',
        p.affected_subject || null,
        p.proposed_action || '',
        feedbackIds
      );
    }

    // Marquer les feedbacks comme traités
    if (unprocessedFeedback.length > 0) {
      const ids = unprocessedFeedback.map(f => f.id);
      db.prepare(`UPDATE feedback SET processed = 1 WHERE id IN (${ids.join(',')})`).run();
    }

    console.log(`🔄 Agent Amélioration : ${proposals.length} propositions générées`);
    return { proposals, message: `${proposals.length} propositions générées` };
  } catch (err) {
    console.error('Erreur agent amélioration:', err.message);
    return { proposals: [], error: err.message };
  }
}

/**
 * Déclencher l'analyse manuellement ou via cron
 */
async function runAnalysis() {
  return analyzeAndPropose();
}

/**
 * Obtenir un résumé rapide des tendances
 */
function getTrends() {
  const weekFeedback = db.prepare(`
    SELECT COUNT(*) as count FROM feedback
    WHERE created_at > datetime('now', '-7 days')
  `).get();

  const pendingProposals = db.prepare(`
    SELECT COUNT(*) as count FROM improvement_proposals WHERE status = 'pending'
  `).get();

  const deployedThisWeek = db.prepare(`
    SELECT COUNT(*) as count FROM improvement_proposals
    WHERE status = 'deployed' AND deployed_at > datetime('now', '-7 days')
  `).get();

  const topContributors = db.prepare(`
    SELECT m.name, COUNT(f.id) as feedback_count,
           COALESCE(SUM(CAST(fr.reward_value AS INTEGER)), 0) as total_stars
    FROM members m
    LEFT JOIN feedback f ON m.id = f.member_id AND f.created_at > datetime('now', '-7 days')
    LEFT JOIN feedback_rewards fr ON m.id = fr.member_id AND fr.reward_type = 'foxie_star'
    WHERE m.role = 'child'
    GROUP BY m.id
    ORDER BY feedback_count DESC
  `).all();

  return {
    weekFeedbackCount: weekFeedback.count,
    pendingProposals: pendingProposals.count,
    deployedThisWeek: deployedThisWeek.count,
    topContributors,
  };
}

module.exports = { runAnalysis, getTrends };
