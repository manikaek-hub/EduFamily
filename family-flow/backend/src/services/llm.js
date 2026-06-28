/**
 * Couche LLM agnostique (no lock-in).
 *
 * Expose 3 fonctions stables, identiques à l'ancien service Claude :
 *   - sendMessage(systemPrompt, messages, maxTokens, options)
 *   - generateJSON(systemPrompt, userMessage, maxTokens, options)
 *   - processImage(base64Image, mediaType, memberContext)
 *
 * Le provider/modèle est choisi par "tier" logique (voir config/models.js).
 * Providers: openai (GPT), deepseek (compatible openai), anthropic (Claude).
 *
 * Format de contenu NEUTRE accepté partout :
 *   - une string                       -> texte simple
 *   - [{ type:'text', text }, { type:'image', mediaType, data }]  -> multimodal
 * La conversion vers le format natif de chaque provider est faite ici.
 */

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const cfg = require('../config/models');

// --- Clients (lazy + cache) -----------------------------------------------
const clientCache = new Map();

function getClient(providerName) {
  if (clientCache.has(providerName)) return clientCache.get(providerName);
  const p = cfg.PROVIDERS[providerName];
  if (!p) throw new Error(`Provider LLM inconnu: ${providerName}`);
  if (!p.apiKey) throw new Error(`Clé API manquante pour le provider "${providerName}"`);

  let client;
  if (p.kind === 'anthropic') {
    client = new Anthropic({ apiKey: p.apiKey, ...(p.baseURL ? { baseURL: p.baseURL } : {}) });
  } else if (p.kind === 'openai') {
    client = new OpenAI({ apiKey: p.apiKey, ...(p.baseURL ? { baseURL: p.baseURL } : {}) });
  } else {
    throw new Error(`Type de provider non supporté: ${p.kind}`);
  }
  clientCache.set(providerName, client);
  return client;
}

function hasKey(providerName) {
  const p = cfg.PROVIDERS[providerName];
  return !!(p && p.apiKey);
}

/**
 * Résout un tier en (provider, model) concret, avec repli automatique :
 *  - si le provider du tier n'a pas de clé -> on suit FALLBACK_ORDER
 *  - si needsVision -> on saute les providers sans vision (ex: DeepSeek)
 */
function resolve(tier, { needsVision = false } = {}) {
  const wanted = cfg.TIERS[tier] || cfg.TIERS[cfg.DEFAULT_TIER];
  const candidates = [];

  // 1) le provider demandé par le tier (si compatible vision)
  if (wanted && (!needsVision || !cfg.NO_VISION.has(wanted.provider))) {
    candidates.push(wanted);
  }
  // 2) repli : ordre configuré, en réutilisant le modèle "vision"/"smart" connu
  for (const prov of cfg.FALLBACK_ORDER) {
    if (needsVision && cfg.NO_VISION.has(prov)) continue;
    const fallbackTier = needsVision ? cfg.TIERS.vision : (cfg.TIERS.smart || wanted);
    const model = fallbackTier && fallbackTier.provider === prov
      ? fallbackTier.model
      : defaultModelFor(prov, needsVision);
    candidates.push({ provider: prov, model });
  }

  for (const c of candidates) {
    if (c && hasKey(c.provider)) return c;
  }
  throw new Error(
    `Aucun provider LLM disponible pour le tier "${tier}"${needsVision ? ' (vision)' : ''}. ` +
    `Vérifie tes clés API (.env).`
  );
}

function defaultModelFor(provider, needsVision) {
  const m = cfg._models;
  if (provider === 'openai') return needsVision ? m.OPENAI_VISION_MODEL : m.OPENAI_MODEL;
  if (provider === 'anthropic') return needsVision ? m.ANTHROPIC_VISION_MODEL : m.ANTHROPIC_MODEL;
  if (provider === 'deepseek') return m.DEEPSEEK_MODEL;
  return undefined;
}

// --- Détection de contenu image -------------------------------------------
function contentHasImage(content) {
  return Array.isArray(content) && content.some(b => b && b.type === 'image');
}

function messagesHaveImage(messages) {
  return Array.isArray(messages) && messages.some(m => contentHasImage(m.content));
}

// --- Conversion contenu neutre -> format provider --------------------------
function toAnthropicContent(content) {
  if (typeof content === 'string') return content;
  return content.map(block => {
    if (block.type === 'image') {
      return {
        type: 'image',
        source: { type: 'base64', media_type: block.mediaType || 'image/jpeg', data: block.data },
      };
    }
    return { type: 'text', text: block.text || '' };
  });
}

function toOpenAIContent(content) {
  if (typeof content === 'string') return content;
  return content.map(block => {
    if (block.type === 'image') {
      const mt = block.mediaType || 'image/jpeg';
      return { type: 'image_url', image_url: { url: `data:${mt};base64,${block.data}` } };
    }
    return { type: 'text', text: block.text || '' };
  });
}

// --- Appels bas niveau par provider ---------------------------------------
async function callAnthropic({ model, systemPrompt, messages, maxTokens, json, thinking }) {
  const params = {
    model,
    max_tokens: maxTokens,
    messages: messages.map(m => ({ role: m.role, content: toAnthropicContent(m.content) })),
  };
  if (systemPrompt) params.system = systemPrompt;
  if (thinking) {
    params.thinking = { type: 'enabled', budget_tokens: 2000 };
    params.max_tokens = Math.max(maxTokens, 4000);
  }
  const resp = await getClient('anthropic').messages.create(params);
  const textBlock = resp.content.find(b => b.type === 'text');
  return { text: textBlock ? textBlock.text : (resp.content[0] && resp.content[0].text) || '', raw: resp };
}

async function callOpenAICompatible(providerName, { model, systemPrompt, messages, maxTokens, json, reasoning }) {
  const oaMessages = [];
  if (systemPrompt) oaMessages.push({ role: 'system', content: systemPrompt });
  for (const m of messages) oaMessages.push({ role: m.role, content: toOpenAIContent(m.content) });

  // Modèle de raisonnement OpenAI ? (gpt-5*, o1/o3/o4) — hors variantes "chat".
  const isReasoningModel =
    providerName === 'openai' && /^(gpt-5|o[134])/.test(model) && !/chat/.test(model);

  // Ces modèles consomment des tokens en réflexion AVANT la réponse : sans
  // réserve, la sortie peut être vide/tronquée. On garantit un plancher.
  let effectiveMax = maxTokens;
  if (reasoning) effectiveMax = Math.max(maxTokens, 4000);
  else if (isReasoningModel) effectiveMax = Math.max(maxTokens, 1024);

  const params = { model, messages: oaMessages };
  // GPT-5+ utilise max_completion_tokens ; DeepSeek garde max_tokens.
  if (providerName === 'openai') params.max_completion_tokens = effectiveMax;
  else params.max_tokens = effectiveMax;
  // reasoning_effort : seulement pour les modèles de raisonnement OpenAI.
  // 'none' hors tier reasoning -> rapide & prévisible (chat). Sinon medium.
  if (isReasoningModel) {
    params.reasoning_effort = reasoning ? (process.env.OPENAI_REASONING_EFFORT || 'medium') : 'none';
  }
  // NB: on NE force PAS response_format=json_object — ça obligerait à renvoyer un
  // OBJET (casse les prompts qui veulent un tableau). Le parsing robuste
  // (parseJSONLoose) gère objets ET tableaux, comme le faisait l'ancien code.

  const client = getClient(providerName);
  let resp;
  try {
    resp = await client.chat.completions.create(params);
  } catch (err) {
    const msg = err.message || '';
    // Certains modèles refusent reasoning_effort : on retente sans.
    if (/reasoning_effort/i.test(msg)) {
      delete params.reasoning_effort;
      resp = await client.chat.completions.create(params);
    } else {
      throw err;
    }
  }
  const choice = resp.choices && resp.choices[0];
  return { text: (choice && choice.message && choice.message.content) || '', raw: resp };
}

async function dispatch({ tier, systemPrompt, messages, maxTokens, json, thinking, needsVision }) {
  const { provider, model } = resolve(tier, { needsVision });
  const kind = cfg.PROVIDERS[provider].kind;
  const reasoning = tier === 'reasoning' || !!thinking;
  if (kind === 'anthropic') {
    return callAnthropic({ model, systemPrompt, messages, maxTokens, json, thinking });
  }
  return callOpenAICompatible(provider, { model, systemPrompt, messages, maxTokens, json, reasoning });
}

// --- Parsing JSON robuste (réutilisé de l'ancien service) ------------------
function parseJSONLoose(text, stopReason) {
  let cleaned = (text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch {} }
    if (stopReason === 'max_tokens' || stopReason === 'length') {
      console.warn('Réponse LLM tronquée, tentative de réparation JSON...');
      let repaired = cleaned;
      const openBraces = (repaired.match(/\{/g) || []).length;
      const closeBraces = (repaired.match(/\}/g) || []).length;
      const openBrackets = (repaired.match(/\[/g) || []).length;
      const closeBrackets = (repaired.match(/\]/g) || []).length;
      repaired = repaired.replace(/,\s*"[^"]*$/, '').replace(/,\s*$/, '');
      for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
      for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';
      try { return JSON.parse(repaired); } catch {}
    }
    console.error('Échec parsing JSON LLM. Texte brut:', (text || '').slice(0, 500));
    throw new Error('Reponse IA invalide. Reessayez.');
  }
}

function stopReasonOf(raw) {
  if (!raw) return undefined;
  if (raw.stop_reason) return raw.stop_reason;            // anthropic
  if (raw.choices && raw.choices[0]) return raw.choices[0].finish_reason; // openai
  return undefined;
}

// ==========================================================================
// API PUBLIQUE (compatible avec l'ancien services/claude.js)
// ==========================================================================

/**
 * Envoie une conversation et renvoie le texte de la réponse.
 * options: { tier, thinking, model? }  (model = override ponctuel "provider:model")
 */
async function sendMessage(systemPrompt, messages, maxTokens = 1024, options = {}) {
  const needsVision = messagesHaveImage(messages);
  // rétro-compat: options.thinking -> tier reasoning
  let tier = options.tier || (options.thinking ? 'reasoning' : cfg.DEFAULT_TIER);
  if (needsVision) tier = 'vision';
  const thinking = !!options.thinking;
  const { text } = await dispatch({
    tier, systemPrompt, messages, maxTokens, json: false, thinking, needsVision,
  });
  return text;
}

/**
 * Génère un objet JSON. `userMessage` peut être une string OU un tableau de
 * blocs neutres (texte + images) pour le multimodal.
 * options: { tier }
 */
async function generateJSON(systemPrompt, userMessage, maxTokens = 4096, options = {}) {
  const needsVision = contentHasImage(userMessage);
  let tier = options.tier || (needsVision ? 'vision' : cfg.DEFAULT_TIER);
  if (needsVision) tier = 'vision';
  const messages = [{ role: 'user', content: userMessage }];
  const { text, raw } = await dispatch({
    tier, systemPrompt, messages, maxTokens, json: true, needsVision,
  });
  return parseJSONLoose(text, stopReasonOf(raw));
}

/**
 * Analyse une image scolaire et renvoie un JSON structuré.
 * Route toujours vers le tier "vision" (fallback auto vers un provider capable).
 */
async function processImage(base64Image, mediaType, memberContext) {
  const prompt = `Analyse cette photo scolaire pour ${memberContext}.

Extrais les informations suivantes en JSON :
{
  "doc_type": "cours" | "exercice" | "controle" | "devoir" | "fiche" | "autre",
  "subject": "MATHS" | "FRANCAIS" | "HISTOIRE-GEOGRAPHIE" | "PHYSIQUE-CHIMIE" | "SVT" | "ANGLAIS" | "ESPAGNOL" | etc.,
  "title": "titre ou sujet principal",
  "topics": ["notion 1", "notion 2"],
  "key_concepts": ["concept ou formule cle 1", "concept 2"],
  "raw_text": "tout le texte lisible de la photo",
  "grade": "14/20" ou null si pas de note,
  "grade_comments": "commentaires du prof" ou null,
  "exercises": ["exercice 1 resume", "exercice 2 resume"] ou null,
  "date": "YYYY-MM-DD" ou null si visible
}

Regles :
- Detecte automatiquement la matiere et le type de document
- Extrais TOUT le texte lisible (meme manuscrit)
- Les topics doivent etre des notions pedagogiques precises
- Si c'est un controle, extrais la note et les commentaires du prof
- Reponds UNIQUEMENT avec le JSON`;

  const content = [
    { type: 'image', mediaType: mediaType || 'image/jpeg', data: base64Image },
    { type: 'text', text: prompt },
  ];
  return generateJSON('', content, 1024, { tier: 'vision' });
}

/**
 * État de la config LLM : quel provider/modèle est réellement utilisé par tier
 * (après fallback), et quelles clés API sont présentes. Aucune clé n'est exposée.
 */
function status() {
  const providers = {};
  for (const name of Object.keys(cfg.PROVIDERS)) {
    providers[name] = { configured: !!cfg.PROVIDERS[name].apiKey };
  }
  const tiers = {};
  for (const tier of ['smart', 'fast', 'reasoning', 'vision']) {
    try {
      tiers[tier] = resolve(tier, { needsVision: tier === 'vision' });
    } catch (e) {
      tiers[tier] = { error: e.message };
    }
  }
  return {
    defaultProvider: cfg.DEFAULT_PROVIDER,
    defaultTier: cfg.DEFAULT_TIER,
    fallbackOrder: cfg.FALLBACK_ORDER,
    providers,
    tiers,
  };
}

module.exports = { sendMessage, generateJSON, processImage, resolve, status, _cfg: cfg };
