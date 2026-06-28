/**
 * Test de la couche LLM multi-providers.
 * Lance: node tests/test-llm-providers.js
 *
 * Affiche le routing tier->provider/modèle (avec fallback selon les clés
 * présentes), puis fait 2 petits appels réels (sendMessage + generateJSON).
 */
require('dotenv').config({ override: true });

const llm = require('../src/services/llm');
const cfg = require('../src/config/models');

function keyState(name) {
  return cfg.PROVIDERS[name] && cfg.PROVIDERS[name].apiKey ? '✅ clé' : '❌ pas de clé';
}

(async () => {
  console.log('=== Providers configurés ===');
  for (const name of Object.keys(cfg.PROVIDERS)) {
    console.log(`  ${name.padEnd(10)} ${keyState(name)}`);
  }

  console.log('\n=== Résolution des tiers (provider réellement utilisé) ===');
  for (const tier of ['smart', 'fast', 'reasoning', 'vision']) {
    try {
      const r = llm.resolve(tier, { needsVision: tier === 'vision' });
      console.log(`  ${tier.padEnd(10)} -> ${r.provider} / ${r.model}`);
    } catch (e) {
      console.log(`  ${tier.padEnd(10)} -> ⚠️  ${e.message}`);
    }
  }

  console.log('\n=== Appel réel : sendMessage (tier smart) ===');
  try {
    const txt = await llm.sendMessage(
      'Tu réponds en un seul mot.',
      [{ role: 'user', content: 'Dis bonjour.' }],
      20
    );
    console.log('  Réponse:', JSON.stringify(txt));
  } catch (e) {
    console.log('  ⚠️ ', e.message);
  }

  console.log('\n=== Appel réel : generateJSON (tier fast) ===');
  try {
    const obj = await llm.generateJSON(
      'Réponds uniquement en JSON.',
      'Donne {"ok": true, "ville": "Paris"} exactement.',
      100,
      { tier: 'fast' }
    );
    console.log('  Objet:', obj);
  } catch (e) {
    console.log('  ⚠️ ', e.message);
  }

  console.log('\nTerminé.');
})();
