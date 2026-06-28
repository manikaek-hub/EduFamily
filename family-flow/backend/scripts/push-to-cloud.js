/**
 * Option B — Envoi MANUEL des devoirs EcoleDirecte (synchronisés en local) vers
 * le serveur cloud. À lancer depuis le Mac :
 *   cd family-flow/backend && node scripts/push-to-cloud.js
 *
 * (L'envoi AUTOMATIQUE après chaque synchro est géré par le syncAgent quand
 *  PUSH_TO_CLOUD=true dans le .env — ce script reste utile pour forcer à la main.)
 *
 * Variables (optionnelles) : CLOUD_URL, CLOUD_CODE (def: FAMILY_ACCESS_CODE).
 */
require('dotenv').config();
const path = require('path');
const { pushToCloud } = require(path.join(__dirname, '..', 'src', 'services', 'cloudPush'));

pushToCloud()
  .then(report => {
    console.log('✅ Données envoyées au cloud :');
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  })
  .catch(err => { console.error('❌ Erreur push-to-cloud :', err.message); process.exit(1); });
