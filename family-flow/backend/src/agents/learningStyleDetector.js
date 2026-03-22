/**
 * Agent 6 — Détecteur de Style d'Apprentissage
 *
 * Analyse les interactions passées pour déterminer comment chaque enfant
 * apprend le mieux, par matière.
 *
 * Styles :
 *   - analogie_concrete : "Imagine que tu as 3 gâteaux..."
 *   - visuel_schema : schémas, dessins ASCII, tableaux
 *   - textuel_structure : étapes numérotées, listes
 *   - exploratoire_defi : "Et si je te posais le problème autrement..."
 *
 * Méthode : analyse les foxie_strategy des training_data
 * et corrèle avec strategy_effective pour trouver le style dominant.
 */

const db = require('../db/init');

// Map foxie_strategy values to learning styles
const STRATEGY_TO_STYLE = {
  // Analogie concrète
  analogie_concrete: 'analogie_concrete',
  exemple_concret: 'analogie_concrete',
  comparaison: 'analogie_concrete',
  metaphore: 'analogie_concrete',
  vie_quotidienne: 'analogie_concrete',

  // Visuel / schéma
  visuel_schema: 'visuel_schema',
  schema: 'visuel_schema',
  dessin: 'visuel_schema',
  tableau: 'visuel_schema',
  diagramme: 'visuel_schema',

  // Textuel structuré
  textuel_structure: 'textuel_structure',
  etapes: 'textuel_structure',
  socratique_micro_etapes: 'textuel_structure',
  regle_formule: 'textuel_structure',
  definition: 'textuel_structure',

  // Exploratoire / défi
  exploratoire_defi: 'exploratoire_defi',
  defi: 'exploratoire_defi',
  question_ouverte: 'exploratoire_defi',
  reformulation: 'exploratoire_defi',
  contre_exemple: 'exploratoire_defi',
};

const STYLES = ['analogie_concrete', 'visuel_schema', 'textuel_structure', 'exploratoire_defi'];

/**
 * Détecte le style d'apprentissage dominant d'un enfant pour une matière.
 * Analyse les 20 dernières interactions avec strategy_effective.
 */
function detectStyle(memberId, subject) {
  // Get recent training data with strategy info
  const rows = db.prepare(`
    SELECT foxie_strategy, strategy_effective, label
    FROM training_data
    WHERE member_id = ? AND subject LIKE ? AND foxie_strategy IS NOT NULL
    ORDER BY created_at DESC LIMIT 20
  `).all(memberId, subject ? `%${subject}%` : '%');

  if (rows.length < 3) {
    // Not enough data — return null (no preference detected yet)
    return null;
  }

  // Count effective strategies per style
  const styleScores = {};
  for (const style of STYLES) styleScores[style] = { effective: 0, total: 0 };

  for (const row of rows) {
    const strategy = (row.foxie_strategy || '').toLowerCase().replace(/\s+/g, '_');
    const style = STRATEGY_TO_STYLE[strategy];
    if (!style) continue;

    styleScores[style].total++;
    if (row.strategy_effective === 1 || row.label === 'correct') {
      styleScores[style].effective++;
    }
  }

  // Calculate effectiveness rate per style
  let bestStyle = null;
  let bestRate = -1;
  let totalWithData = 0;

  for (const [style, data] of Object.entries(styleScores)) {
    if (data.total === 0) continue;
    totalWithData += data.total;
    const rate = data.effective / data.total;
    if (rate > bestRate || (rate === bestRate && data.total > (styleScores[bestStyle]?.total || 0))) {
      bestRate = rate;
      bestStyle = style;
    }
  }

  if (!bestStyle || totalWithData < 3) return null;

  const confidence = Math.min(0.95, bestRate * (totalWithData / 20));

  // Save to DB
  db.prepare(`
    INSERT INTO learning_style_profile (member_id, subject, preferred_style, confidence, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(member_id, subject) DO UPDATE SET
      preferred_style = excluded.preferred_style,
      confidence = excluded.confidence,
      updated_at = datetime('now')
  `).run(memberId, subject || 'general', bestStyle, Math.round(confidence * 100) / 100);

  return { style: bestStyle, confidence, basedOn: totalWithData };
}

/**
 * Get the stored learning style for a child + subject.
 * Falls back to 'general' if no subject-specific style.
 */
function getStyle(memberId, subject) {
  // Try subject-specific first
  if (subject) {
    const specific = db.prepare(
      'SELECT * FROM learning_style_profile WHERE member_id = ? AND subject LIKE ? ORDER BY confidence DESC LIMIT 1'
    ).get(memberId, `%${subject}%`);
    if (specific) return specific;
  }

  // Fallback to general
  const general = db.prepare(
    'SELECT * FROM learning_style_profile WHERE member_id = ? ORDER BY confidence DESC LIMIT 1'
  ).get(memberId);

  return general || null;
}

/**
 * Get all learning styles for a child (all subjects).
 */
function getAllStyles(memberId) {
  return db.prepare(
    'SELECT * FROM learning_style_profile WHERE member_id = ? ORDER BY subject'
  ).all(memberId);
}

/**
 * Build a prompt instruction string based on the detected style.
 */
function buildStyleInstruction(styleProfile) {
  if (!styleProfile) return '';

  const instructions = {
    analogie_concrete: `STYLE PREFERE: Analogie concrète (confiance: ${styleProfile.confidence})
- Utilise des comparaisons avec la vie quotidienne : nourriture, sport, jeux
- "Imagine que tu as 3 gâteaux...", "C'est comme quand tu..."
- Exemples concrets AVANT la règle abstraite
- Connecte chaque notion a quelque chose que l'enfant connaît`,

    visuel_schema: `STYLE PREFERE: Visuel / Schéma (confiance: ${styleProfile.confidence})
- Décris ou dessine des schémas en ASCII quand c'est possible
- Utilise des tableaux, des flèches, des diagrammes
- "Regarde ce schéma :", "Si on dessine ça..."
- Structure visuellement : encadrés, colonnes, arbres`,

    textuel_structure: `STYLE PREFERE: Textuel structuré (confiance: ${styleProfile.confidence})
- Structure TOUJOURS en étapes numérotées : 1. 2. 3.
- Donne la règle claire et concise d'abord
- Formules encadrées, définitions précises
- "Voici la méthode en 3 étapes :"`,

    exploratoire_defi: `STYLE PREFERE: Exploratoire / Défi (confiance: ${styleProfile.confidence})
- Pose des défis : "Et si le nombre était négatif ?"
- Reformule les problèmes sous un angle surprenant
- Encourage l'expérimentation : "Essaie avec un autre exemple"
- "Qu'est-ce qui se passerait si..." — stimule la curiosité`,
  };

  return instructions[styleProfile.preferred_style] || '';
}

module.exports = { detectStyle, getStyle, getAllStyles, buildStyleInstruction };
