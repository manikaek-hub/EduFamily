const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function sendMessage(systemPrompt, messages, maxTokens = 1024) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
  });
  return response.content[0].text;
}

async function generateJSON(systemPrompt, userMessage, maxTokens = 4096) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  const text = response.content[0].text;

  // Strip markdown code blocks if present
  let cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Try parsing directly
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Try extracting JSON object {...}
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch {}
    }
    // Try extracting JSON array [...]
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try { return JSON.parse(arrMatch[0]); } catch {}
    }
    // If JSON is truncated (stop_reason: max_tokens), try to fix it
    if (response.stop_reason === 'max_tokens') {
      console.warn('Claude response was truncated, attempting JSON repair...');
      // Close any open strings, arrays and objects
      let repaired = cleaned;
      // Count open/close braces and brackets
      const openBraces = (repaired.match(/\{/g) || []).length;
      const closeBraces = (repaired.match(/\}/g) || []).length;
      const openBrackets = (repaired.match(/\[/g) || []).length;
      const closeBrackets = (repaired.match(/\]/g) || []).length;
      // Remove any trailing partial value
      repaired = repaired.replace(/,\s*"[^"]*$/, '').replace(/,\s*$/, '');
      // Close open structures
      for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
      for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';
      try { return JSON.parse(repaired); } catch {}
    }
    console.error('Failed to parse JSON from Claude. Raw text:', text.slice(0, 500));
    throw new Error('Reponse IA invalide. Reessayez.');
  }
}

module.exports = { sendMessage, generateJSON };
