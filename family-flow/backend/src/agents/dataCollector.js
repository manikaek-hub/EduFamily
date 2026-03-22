/**
 * Agent 1 — Collecteur de Données d'Entraînement
 *
 * Annote automatiquement chaque échange Foxie ↔ enfant via Claude.
 * Classification : correct / partial / incorrect / hors_sujet
 * Type d'erreur : erreur_conceptuelle / erreur_calcul / erreur_lecture_enonce / inattention / vocabulaire
 *
 * Fonctionne de manière ASYNCHRONE — ne bloque jamais le chat.
 */

const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db/init');
const { updateMasteryGraph } = require('../services/learnerProfile');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANNOTATION_PROMPT = `Tu es un annotateur pédagogique. Analyse cet échange entre un tuteur (Foxie) et un enfant.

ÉCHANGE :
Foxie : "{foxie}"
Enfant : "{child}"
Matière : {subject}
Concept : {concept}

CLASSIFIE la réponse de l'enfant :
- "correct" : l'enfant a compris et répond juste
- "partial" : réponse partiellement correcte ou raisonnement bon mais résultat faux
- "incorrect" : réponse fausse
- "hors_sujet" : l'enfant ne répond pas à la question (bavardage, changement de sujet)

Si "incorrect" ou "partial", identifie le TYPE D'ERREUR :
- "erreur_conceptuelle" : ne comprend pas le concept sous-jacent
- "erreur_calcul" : comprend le concept mais se trompe dans le calcul
- "erreur_lecture_enonce" : n'a pas compris ce qu'on lui demandait
- "inattention" : erreur bête, l'enfant sait probablement faire
- "vocabulaire" : ne connaît pas un mot clé de la question

Réponds UNIQUEMENT en JSON :
{"label":"correct|partial|incorrect|hors_sujet","error_type":"null|erreur_conceptuelle|erreur_calcul|erreur_lecture_enonce|inattention|vocabulaire","confidence":0.85}`;

/**
 * Annote une réponse enfant via Claude (async, ne bloque pas).
 * Retourne { label, error_type, confidence }
 */
async function annotateResponse(foxieMessage, childMessage, subject, concept) {
  if (!childMessage || childMessage.trim().length < 2) {
    return { label: null, error_type: null, confidence: 0 };
  }

  const prompt = ANNOTATION_PROMPT
    .replace('{foxie}', foxieMessage.slice(0, 300))
    .replace('{child}', childMessage.slice(0, 300))
    .replace('{subject}', subject || 'inconnu')
    .replace('{concept}', concept || 'inconnu');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text.trim();
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Agent 1: no JSON in annotation response');
      return { label: null, error_type: null, confidence: 0 };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      label: parsed.label || null,
      error_type: parsed.error_type === 'null' ? null : (parsed.error_type || null),
      confidence: parsed.confidence || 0.5,
    };
  } catch (err) {
    console.error('Agent 1 annotation error:', err.message);
    return { label: null, error_type: null, confidence: 0 };
  }
}

/**
 * Annote et met à jour la base de données en arrière-plan.
 * - Met à jour training_data avec le label et error_type
 * - Met à jour mastery_graph via SM-2
 *
 * Appelé de manière async après la réponse de Foxie.
 */
async function annotateAndStore(trainingDataId, memberId, foxieMessage, childMessage, subject, concept) {
  try {
    const annotation = await annotateResponse(foxieMessage, childMessage, subject, concept);

    if (annotation.label) {
      // 1. Update training_data
      db.prepare(`
        UPDATE training_data SET label = ?, error_type = ? WHERE id = ?
      `).run(annotation.label, annotation.error_type, trainingDataId);

      // 2. Update mastery_graph if we have a concept
      const conceptId = concept || (subject ? `${subject.toLowerCase().replace(/\s+/g, '_')}_general` : null);
      if (conceptId) {
        const wasCorrect = annotation.label === 'correct' || annotation.label === 'partial';
        updateMasteryGraph(memberId, conceptId, subject || 'Général', wasCorrect);
      }

      console.log(`Agent 1: annotated [${annotation.label}] ${annotation.error_type || '-'} (confidence: ${annotation.confidence})`);
    }

    return annotation;
  } catch (err) {
    console.error('Agent 1 store error:', err.message);
    return { label: null, error_type: null, confidence: 0 };
  }
}

module.exports = { annotateResponse, annotateAndStore };
