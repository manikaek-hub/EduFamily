/**
 * Configuration LLM multi-providers (no lock-in).
 *
 * Family Flow ne dépend plus d'un seul fournisseur. On définit des "tiers"
 * logiques (capacités) et on les mappe vers un (provider, modèle) concret.
 * Tout est surchargeable par variable d'environnement, donc tu peux changer
 * de modèle ou de fournisseur SANS toucher au code.
 *
 * Providers supportés :
 *   - openai    : GPT (SDK openai)
 *   - deepseek  : DeepSeek (SDK openai, API compatible, baseURL custom)
 *   - anthropic : Claude (SDK @anthropic-ai/sdk)
 *
 * Tiers logiques utilisés dans l'app :
 *   - smart     : défaut général, qualité (chat Foxie, plans, bilans...)
 *   - fast      : tâches simples/volumineuses, où le coût prime
 *   - reasoning : maths/sciences, raisonnement étape par étape
 *   - vision    : analyse d'images (photos scolaires) — jamais DeepSeek
 */

const env = process.env;

// --- Définition des providers ---------------------------------------------
// `kind` indique quel SDK utiliser. openai & deepseek partagent le SDK openai.
const PROVIDERS = {
  openai: {
    kind: 'openai',
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL || undefined, // par défaut: API OpenAI standard
  },
  deepseek: {
    kind: 'openai',
    apiKey: env.DEEPSEEK_API_KEY,
    baseURL: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  },
  anthropic: {
    kind: 'anthropic',
    apiKey: env.ANTHROPIC_API_KEY,
    baseURL: env.ANTHROPIC_BASE_URL || undefined,
  },
};

// Provider par défaut si un tier ne précise rien.
const DEFAULT_PROVIDER = env.LLM_DEFAULT_PROVIDER || 'openai';

// --- IDs de modèles (surchageables par env) -------------------------------
// ⚠️ Mets l'ID EXACT de ton modèle GPT dans OPENAI_MODEL (.env).
// GPT-5.5 en raisonnement "minimal" pour le chat (rapide, fiable) et "medium"
// pour le tier reasoning (maths/sciences). Voir reasoning_effort dans llm.js.
const OPENAI_MODEL = env.OPENAI_MODEL || 'gpt-5.5';
const OPENAI_FAST_MODEL = env.OPENAI_FAST_MODEL || 'gpt-4o-mini';
const OPENAI_REASONING_MODEL = env.OPENAI_REASONING_MODEL || 'gpt-5.5';
const OPENAI_VISION_MODEL = env.OPENAI_VISION_MODEL || 'gpt-4o';

const DEEPSEEK_MODEL = env.DEEPSEEK_MODEL || 'deepseek-chat';
const DEEPSEEK_REASONING_MODEL = env.DEEPSEEK_REASONING_MODEL || 'deepseek-reasoner';

const ANTHROPIC_MODEL = env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const ANTHROPIC_VISION_MODEL = env.ANTHROPIC_VISION_MODEL || 'claude-haiku-4-5-20251001';

/**
 * Parse une surcharge env au format "provider:model" (ex: "deepseek:deepseek-chat").
 * Retourne null si vide / invalide.
 */
function parseOverride(value) {
  if (!value || !value.includes(':')) return null;
  const [provider, ...rest] = value.split(':');
  const model = rest.join(':');
  if (!PROVIDERS[provider] || !model) return null;
  return { provider, model };
}

// --- Mapping tier -> (provider, modèle) -----------------------------------
// Surcharge possible par tier via LLM_TIER_SMART="deepseek:deepseek-chat" etc.
const TIERS = {
  smart:
    parseOverride(env.LLM_TIER_SMART) ||
    { provider: 'openai', model: OPENAI_MODEL },
  fast:
    parseOverride(env.LLM_TIER_FAST) ||
    { provider: 'openai', model: OPENAI_FAST_MODEL },
  reasoning:
    parseOverride(env.LLM_TIER_REASONING) ||
    { provider: 'openai', model: OPENAI_REASONING_MODEL },
  vision:
    parseOverride(env.LLM_TIER_VISION) ||
    { provider: 'openai', model: OPENAI_VISION_MODEL },
};

// Ordre de repli si le provider d'un tier n'a pas de clé API configurée.
// On garde un fournisseur capable de vision en priorité pour le tier vision.
const FALLBACK_ORDER = (env.LLM_FALLBACK_ORDER || 'openai,anthropic,deepseek')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Providers SANS capacité vision : on ne doit jamais y router une image.
const NO_VISION = new Set(['deepseek']);

const DEFAULT_TIER = env.LLM_DEFAULT_TIER || 'smart';

module.exports = {
  PROVIDERS,
  TIERS,
  DEFAULT_PROVIDER,
  DEFAULT_TIER,
  FALLBACK_ORDER,
  NO_VISION,
  // exposés pour debug/tests
  _models: {
    OPENAI_MODEL, OPENAI_FAST_MODEL, OPENAI_REASONING_MODEL, OPENAI_VISION_MODEL,
    DEEPSEEK_MODEL, DEEPSEEK_REASONING_MODEL,
    ANTHROPIC_MODEL, ANTHROPIC_VISION_MODEL,
  },
};
