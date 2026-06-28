/**
 * Compat: ce fichier ne fait plus que ré-exporter la couche LLM agnostique.
 *
 * Historiquement, tout passait par Claude (Anthropic). L'app est désormais
 * multi-providers (OpenAI/GPT, DeepSeek, Anthropic) via services/llm.js.
 * On garde ce point d'entrée pour ne pas casser les imports existants
 * (`require('../services/claude')`). Les nouvelles features devraient
 * importer directement `services/llm`.
 */

module.exports = require('./llm');
