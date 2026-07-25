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
const { officialSubjects, toOfficial } = require('../config/subjects');

const ANNOTATION_PROMPT = `Tu es un annotateur pédagogique. Analyse cet échange entre un tuteur (Foxie) et un enfant de {grade}.

ÉCHANGE :
Dernier message de Foxie : "{foxie}"
Réaction de l'enfant : "{child}"
Ce que Foxie a répondu ensuite : "{foxieReply}"
Matière : {subject}
Concept : {concept}

FIABILITÉ : la réponse de Foxie qui suit est ta source la plus fiable pour juger si l'enfant a bon ou faux (Foxie a déjà vérifié). Si Foxie confirme ("oui", "exact", "bravo") → label "correct". Si Foxie corrige → "incorrect" ou "partial". Ne contredis Foxie que si c'est évident.

CLASSIFIE la réaction de l'enfant au dernier message de Foxie :
- "correct" : l'enfant a compris et répond juste
- "partial" : réponse partiellement correcte ou raisonnement bon mais résultat faux
- "incorrect" : réponse fausse
- "hors_sujet" : l'enfant ne répond pas à la question (bavardage, changement de sujet)

IMPORTANT : si la réponse de l'enfant contient un calcul, REFAIS le calcul toi-même chiffre par chiffre AVANT de juger (ex: 47+36 → 7+6=13, 40+30+10=80, total 83). Ne juge jamais un calcul de tête. Si tu n'es pas sûr → "confidence" basse et error_type null.

Si "incorrect" ou "partial", identifie le TYPE D'ERREUR :
- "erreur_conceptuelle" : ne comprend pas le concept sous-jacent
- "erreur_calcul" : comprend le concept mais se trompe dans le calcul
- "erreur_lecture_enonce" : n'a pas compris ce qu'on lui demandait
- "inattention" : erreur bête, l'enfant sait probablement faire
- "vocabulaire" : ne connaît pas un mot clé de la question

CONCEPT (règles STRICTES) :
- "concept_id" = la notion du programme scolaire de {grade} travaillée dans l'échange, en snake_case (ex: addition_avec_retenue, tables_multiplication, passe_compose, fractions_addition, symetrie_axiale).
- Nomme la notion dès qu'elle est identifiable dans les calculs ou questions échangés, même si personne ne la nomme explicitement (ex: l'enfant calcule 63+19 → addition_avec_retenue).
- null SEULEMENT si l'échange est du bavardage ou une pure activité sans notion (dire bonjour, envoyer une photo, organiser son travail).
- INTERDIT : concepts méta ou d'activité (comprehension_consignes, correction_exercices, partage_documents, revision_general, entrainement...) → null.
- Utilise le nom STANDARD et COURT de la notion (pas de variante: proportionnalite et non proportionnalite_rapports ou test_proportionnalite).
- "subject" = la matière officielle parmi : {subjects}. Si aucune ne correspond → null.

Réponds UNIQUEMENT en JSON :
{
  "label":"correct|partial|incorrect|hors_sujet",
  "error_type":"null|erreur_conceptuelle|erreur_calcul|erreur_lecture_enonce|inattention|vocabulaire",
  "concept_id":"notion_du_programme_ou_null",
  "subject":"matière officielle ou null",
  "observation_status":"strength|partial|difficulty|engagement|unknown",
  "observation":"phrase courte utile pour Foxie la prochaine fois",
  "next_action":"action pédagogique concrète à tenter ensuite",
  "confidence":0.85
}`;

/**
 * Annote une réponse enfant via Claude (async, ne bloque pas).
 * Retourne { label, error_type, confidence }
 */
async function annotateResponse(foxieMessage, childMessage, subject, concept, grade = null, foxieReply = null) {
  if (!childMessage || childMessage.trim().length < 2) {
    return { label: null, error_type: null, confidence: 0 };
  }

  const subjectList = officialSubjects(grade || '6eme');
  const prompt = ANNOTATION_PROMPT
    .replace(/\{grade\}/g, grade || 'niveau inconnu')
    .replace('{subjects}', subjectList.join(', '))
    .replace('{foxie}', foxieMessage.slice(0, 300))
    .replace('{child}', childMessage.slice(0, 300))
    .replace('{foxieReply}', (foxieReply || 'non disponible').slice(0, 300))
    .replace('{subject}', subject || 'inconnu')
    .replace('{concept}', concept || 'inconnu');

  try {
    const parsed = await generateJSON('', prompt, 200, { tier: 'fast' });
    return {
      label: parsed.label || null,
      error_type: parsed.error_type === 'null' ? null : (parsed.error_type || null),
      concept_id: parsed.concept_id === 'null' ? null : (parsed.concept_id || null),
      subject: parsed.subject === 'null' ? null : (parsed.subject || null),
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
async function annotateAndStore(trainingDataId, memberId, foxieMessage, childMessage, subject, concept, sessionId = null, foxieReply = null) {
  try {
    const member = db.prepare('SELECT grade FROM members WHERE id = ?').get(memberId);
    const grade = member?.grade || null;
    const annotation = await annotateResponse(foxieMessage, childMessage, subject, concept, grade, foxieReply);

    if (annotation.label) {
      // 1. Update training_data
      db.prepare(`
        UPDATE training_data SET label = ?, error_type = ?, concept_id = ? WHERE id = ?
      `).run(annotation.label, annotation.error_type, annotation.concept_id || concept || null, trainingDataId);

      // 2. Update mastery_graph — UNIQUEMENT si vraie notion + matière officielle + réponse évaluable.
      //    Pas de fallback "_general" : mieux vaut aucun signal qu'un signal pollué.
      const conceptId = annotation.concept_id || concept || null;
      const officialList = officialSubjects(grade || '6eme');
      const officialSubject = toOfficial(annotation.subject || subject, officialList);
      const isEvaluable = annotation.label === 'correct' || annotation.label === 'partial' || annotation.label === 'incorrect';
      if (conceptId && officialSubject && isEvaluable) {
        const wasCorrect = annotation.label === 'correct' || annotation.label === 'partial';
        updateMasteryGraph(memberId, conceptId, officialSubject, wasCorrect);
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
