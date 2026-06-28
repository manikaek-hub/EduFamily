/**
 * Agent 1 — Collecteur de Données d'Entraînement
 *
 * Annote automatiquement chaque échange Foxie ↔ enfant via Claude.
 * Classification : correct / partial / incorrect / hors_sujet
 * Type d'erreur : erreur_conceptuelle / erreur_calcul / erreur_lecture_enonce / inattention / vocabulaire
 *
 * Fonctionne de manière ASYNCHRONE — ne bloque jamais le chat.
 */

const { generateJSON } = require('../services/llm');
const db = require('../db/init');
const { updateMasteryGraph, recordLearningObservation } = require('../services/learnerProfile');

const ANNOTATION_PROMPT = `Tu es un annotateur pédagogique. Analyse cet échange entre un tuteur (Foxie) et un enfant.

ÉCHANGE :
Dernier message de Foxie : "{foxie}"
Réaction de l'enfant : "{child}"
Matière : {subject}
Concept : {concept}

CLASSIFIE la réaction de l'enfant au dernier message de Foxie :
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
{
  "label":"correct|partial|incorrect|hors_sujet",
  "error_type":"null|erreur_conceptuelle|erreur_calcul|erreur_lecture_enonce|inattention|vocabulaire",
  "concept_id":"concept_court_en_snake_case_ou_null",
  "observation_status":"strength|partial|difficulty|engagement|unknown",
  "observation":"phrase courte utile pour Foxie la prochaine fois",
  "next_action":"action pédagogique concrète à tenter ensuite",
  "confidence":0.85
}`;

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
    const parsed = await generateJSON('', prompt, 150, { tier: 'fast' });
    return {
      label: parsed.label || null,
      error_type: parsed.error_type === 'null' ? null : (parsed.error_type || null),
      concept_id: parsed.concept_id === 'null' ? null : (parsed.concept_id || null),
      observation_status: parsed.observation_status || null,
      observation: parsed.observation || null,
      next_action: parsed.next_action || null,
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
async function annotateAndStore(trainingDataId, memberId, foxieMessage, childMessage, subject, concept, sessionId = null) {
  try {
    const annotation = await annotateResponse(foxieMessage, childMessage, subject, concept);

    if (annotation.label) {
      // 1. Update training_data
      db.prepare(`
        UPDATE training_data SET label = ?, error_type = ?, concept_id = ? WHERE id = ?
      `).run(annotation.label, annotation.error_type, annotation.concept_id || concept || null, trainingDataId);

      // 2. Update mastery_graph if we have a concept
      const conceptId = annotation.concept_id || concept || (subject ? `${subject.toLowerCase().replace(/\s+/g, '_')}_general` : null);
      if (conceptId) {
        const wasCorrect = annotation.label === 'correct' || annotation.label === 'partial';
        updateMasteryGraph(memberId, conceptId, subject || 'Général', wasCorrect);
      }

      // 3. Store a short reusable memory for Foxie and the parent view
      if (annotation.observation) {
        recordLearningObservation({
          memberId,
          sessionId,
          subject,
          conceptId,
          status: annotation.observation_status || (
            annotation.label === 'correct' ? 'strength' :
            annotation.label === 'partial' ? 'partial' :
            annotation.label === 'incorrect' ? 'difficulty' : 'unknown'
          ),
          summary: annotation.observation,
          evidence: childMessage,
          nextAction: annotation.next_action,
          confidence: annotation.confidence,
        });
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
