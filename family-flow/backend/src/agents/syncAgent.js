/**
 * Agent de Sync EcoleDirecte — Synchronisation automatique quotidienne
 *
 * Se connecte à EcoleDirecte, récupère devoirs/notes/emploi du temps
 * et met à jour la Knowledge Base pour chaque enfant.
 *
 * Fréquence: toutes les 6h (6h, 12h, 18h, minuit)
 * Fallback: retry après 30min si échec
 */

const db = require('../db/init');
const ed = require('../services/ecoledirecte');
const kb = require('../services/knowledgebase');
const { sendMessage } = require('../services/llm');

const SYNC_INTERVAL = 6 * 60 * 60 * 1000; // 6 heures
const RETRY_DELAY = 30 * 60 * 1000; // 30 min si échec
const MAX_DOUBLE_AUTH_RETRIES = 3;

let syncTimer = null;
let retryTimer = null;

/**
 * Tente une connexion ED et sync complète
 */
async function runSync() {
  console.log('[SyncAgent] Début de synchronisation EcoleDirecte...');

  const username = process.env.ED_USERNAME;
  const password = process.env.ED_PASSWORD;

  if (!username || !password) {
    console.warn('[SyncAgent] ED_USERNAME ou ED_PASSWORD manquant dans .env — sync impossible');
    return { success: false, error: 'Credentials manquants' };
  }

  try {
    // 1. Check if we have an active session
    let session = ed.getSession(username);

    // 2. If no session, re-login
    if (!session) {
      console.log('[SyncAgent] Pas de session active, tentative de login...');
      const loginResult = await ed.login(username, password);

      if (!loginResult.success) {
        if (loginResult.needDoubleAuth) {
          console.log('[SyncAgent] Double auth requise — tentative de résolution automatique...');
          const daResult = await solveDoubleAuth(username, password);
          if (!daResult.success) {
            console.error('[SyncAgent] Double auth échouée:', daResult.error);
            logSync('error', `Double auth échouée: ${daResult.error}`);
            scheduleRetry();
            return { success: false, error: daResult.error };
          }
          console.log('[SyncAgent] Double auth résolue automatiquement ✓');
        } else {
          console.error('[SyncAgent] Login échoué:', loginResult.error);
          logSync('error', loginResult.error);
          scheduleRetry();
          return { success: false, error: loginResult.error };
        }
      } else {
        console.log('[SyncAgent] Login réussi');
      }
      session = ed.getSession(username);
    }

    // 3. Get all connected children
    const children = db.prepare(
      'SELECT * FROM ed_settings WHERE username = ? AND connected = 1'
    ).all(username);

    if (children.length === 0) {
      console.warn('[SyncAgent] Aucun enfant connecté');
      return { success: false, error: 'Aucun enfant connecté' };
    }

    // 4. Sync each child
    const results = {};
    for (const child of children) {
      try {
        console.log(`[SyncAgent] Sync ${child.student_name} (ID: ${child.student_id})...`);
        const member = kb.getMemberForStudent(child.student_id);
        if (!member) {
          console.warn(`[SyncAgent] Pas de membre trouvé pour ${child.student_name}`);
          continue;
        }

        const result = await kb.syncAll(username, child.student_id, member.id);
        results[child.student_name] = result;

        // Update last_sync
        db.prepare("UPDATE ed_settings SET last_sync = datetime('now') WHERE id = ?").run(child.id);

        console.log(`[SyncAgent] ✓ ${child.student_name} synced:`,
          `${result.homework?.synced || 0} devoirs,`,
          `${result.grades?.synced || 0} notes,`,
          `${result.timetable?.synced || 0} cours`
        );
      } catch (err) {
        console.error(`[SyncAgent] Erreur sync ${child.student_name}:`, err.message);
        results[child.student_name] = { error: err.message };
      }
    }

    logSync('success', JSON.stringify(Object.keys(results)));
    console.log('[SyncAgent] Synchronisation terminée avec succès');

    // Option B : pousser vers le cloud (uniquement si PUSH_TO_CLOUD=true, càd sur le Mac)
    try {
      const { pushToCloud, isEnabled } = require('../services/cloudPush');
      if (isEnabled()) {
        const report = await pushToCloud();
        console.log('[SyncAgent] ✓ Devoirs poussés vers le cloud:', JSON.stringify(report));
      }
    } catch (e) {
      console.error('[SyncAgent] Push cloud échoué:', e.message);
    }

    return { success: true, results };

  } catch (err) {
    console.error('[SyncAgent] Erreur générale:', err.message);
    logSync('error', err.message);
    scheduleRetry();
    return { success: false, error: err.message };
  }
}

/**
 * Résout automatiquement la double auth EcoleDirecte (question secrète QCM)
 * Utilise Claude pour comprendre la question et choisir la bonne réponse
 * parmi les propositions, en se basant sur les infos famille connues.
 */
async function solveDoubleAuth(username, password) {
  for (let attempt = 1; attempt <= MAX_DOUBLE_AUTH_RETRIES; attempt++) {
    console.log(`[SyncAgent] Double auth — tentative ${attempt}/${MAX_DOUBLE_AUTH_RETRIES}`);

    // 1. Récupérer la question QCM
    const qResult = await ed.getDoubleAuthQuestion(username);
    if (!qResult.success) {
      return { success: false, error: qResult.error };
    }

    console.log(`[SyncAgent] Question: "${qResult.question}"`);
    console.log(`[SyncAgent] Propositions:`, qResult.propositions);

    // 2. Chercher les infos famille dans la DB pour aider Claude
    const familyInfo = getFamilyContext();

    // 3. Demander à Claude de choisir la bonne réponse
    const chosenAnswer = await askClaudeForAnswer(qResult.question, qResult.propositions, qResult.rawPropositions, familyInfo);

    if (!chosenAnswer) {
      console.warn('[SyncAgent] Claude n\'a pas pu déterminer la réponse');
      continue;
    }

    console.log(`[SyncAgent] Réponse choisie: "${chosenAnswer.display}"`);

    // 4. Soumettre la réponse
    const submitResult = await ed.submitDoubleAuthAnswer(username, password, chosenAnswer.raw);
    if (submitResult.success) {
      return { success: true };
    }

    console.warn(`[SyncAgent] Mauvaise réponse (tentative ${attempt}), on réessaie...`);
    // Attendre un peu avant de réessayer (nouvelle question)
    await new Promise(r => setTimeout(r, 2000));

    // Re-login pour obtenir un nouveau code 250
    const retryLogin = await ed.login(username, password);
    if (!retryLogin.needDoubleAuth) {
      // Soit le login a réussi, soit autre erreur
      return retryLogin.success
        ? { success: true }
        : { success: false, error: retryLogin.error || 'Login échoué après retry' };
    }
  }

  return { success: false, error: `Échec après ${MAX_DOUBLE_AUTH_RETRIES} tentatives de double auth` };
}

/**
 * Récupère le contexte familial depuis la DB pour aider à répondre aux questions
 */
function getFamilyContext() {
  try {
    const members = db.prepare('SELECT name, role, grade, age, birthdate, school, city FROM members').all();
    const edSettings = db.prepare('SELECT student_name, username FROM ed_settings').all();

    const memberDetails = members.map(m => {
      let info = `${m.name} (${m.role}`;
      if (m.grade) info += `, ${m.grade}`;
      if (m.age) info += `, ${m.age} ans`;
      if (m.birthdate) info += `, né(e) le ${m.birthdate.split('-').reverse().join('/')}`;
      if (m.school) info += `, école: ${m.school}`;
      if (m.city) info += `, ville: ${m.city}`;
      info += ')';
      return info;
    }).join('\n- ');

    return {
      members: memberDetails,
      edAccounts: edSettings.map(s => `${s.student_name} (compte: ${s.username})`).join(', '),
      parentEmail: process.env.ED_USERNAME || '',
      familyName: 'GIMENEZ / EK',
      city: members[0]?.city || '',
      school: members.find(m => m.school)?.school || '',
    };
  } catch {
    return { members: '', edAccounts: '', parentEmail: '', familyName: '', city: '', school: '' };
  }
}

/**
 * Utilise Claude pour analyser la question QCM et choisir la bonne réponse
 */
async function askClaudeForAnswer(question, propositions, rawPropositions, familyInfo) {
  try {
    const prompt = `Tu es un assistant qui aide à résoudre une question de sécurité EcoleDirecte (portail scolaire français).

CONTEXTE FAMILLE COMPLET:
- ${familyInfo.members}
- Comptes EcoleDirecte: ${familyInfo.edAccounts}
- Email parent: ${familyInfo.parentEmail}
- Nom de famille: ${familyInfo.familyName}
- Ville: ${familyInfo.city}
- Établissement scolaire: ${familyInfo.school}

QUESTION DE SÉCURITÉ:
"${question}"

PROPOSITIONS:
${propositions.map((p, i) => `${i + 1}. ${p}`).join('\n')}

INSTRUCTION: Réponds UNIQUEMENT avec le NUMÉRO (1, 2, 3, etc.) de la bonne proposition.
Ces questions portent sur: prénom d'un enfant, date de naissance, classe, nom de l'établissement, ville, code postal, etc.
Utilise les informations famille ci-dessus pour trouver la bonne réponse.

RÉPONSE (juste le numéro):`;

    const answer = (await sendMessage('', [{ role: 'user', content: prompt }], 10, { tier: 'fast' })).trim();
    const index = parseInt(answer) - 1;

    if (index >= 0 && index < propositions.length) {
      return {
        display: propositions[index],
        raw: rawPropositions[index],
      };
    }

    console.warn(`[SyncAgent] Claude a répondu "${answer}" — pas un index valide`);
    return null;
  } catch (err) {
    console.error('[SyncAgent] Erreur Claude pour double auth:', err.message);
    return null;
  }
}

function logSync(status, details) {
  try {
    db.prepare(
      'INSERT INTO kb_sync_log (member_id, source, status, details) VALUES (?, ?, ?, ?)'
    ).run(0, 'sync_agent', status, details);
  } catch {}
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  console.log('[SyncAgent] Retry dans 30 minutes...');
  retryTimer = setTimeout(() => {
    retryTimer = null;
    runSync();
  }, RETRY_DELAY);
}

/**
 * Démarre l'agent de sync automatique
 */
function startSyncAgent() {
  const username = process.env.ED_USERNAME;
  const password = process.env.ED_PASSWORD;

  if (!username || !password) {
    console.log('[SyncAgent] ED_USERNAME/ED_PASSWORD non configurés — agent désactivé');
    console.log('[SyncAgent] Pour activer: ajoutez ED_USERNAME et ED_PASSWORD dans .env');
    return;
  }

  console.log('[SyncAgent] Agent de sync EcoleDirecte activé (toutes les 6h)');

  // Sync immédiate au démarrage (avec délai de 10s pour laisser le serveur démarrer)
  setTimeout(() => runSync(), 10000);

  // Puis toutes les 6 heures
  syncTimer = setInterval(() => runSync(), SYNC_INTERVAL);
}

/**
 * Arrête l'agent
 */
function stopSyncAgent() {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  console.log('[SyncAgent] Agent arrêté');
}

module.exports = { startSyncAgent, stopSyncAgent, runSync };
