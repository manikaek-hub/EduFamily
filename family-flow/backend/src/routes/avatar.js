const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { Communicate } = require('edge-tts-universal');

/**
 * Routes Avatar — Voix naturelle gratuite via Edge-TTS (Microsoft Neural)
 *
 * Foxie parle avec une voix française naturelle et gratuite.
 * Pas de clé API, pas de limite, pas de coût !
 *
 * Endpoints :
 *   POST /api/avatar/speak   — Convertit du texte en audio (MP3)
 *   GET  /api/avatar/voices  — Liste les voix françaises
 *   GET  /api/avatar/status  — Statut du service
 */

// Voix par défaut : plus douce et plus posée que Denise pour les enfants.
// Voix 100 % française. Les voix "Multilingual" détectent la langue par segment
// et prononcent avec un accent anglais tout mot qui y ressemble (Combo, boss...).
const FOXIE_VOICE = process.env.FOXIE_TTS_VOICE || 'fr-FR-DeniseNeural';

// Voix alternatives
const FRENCH_VOICES = [
  { id: 'fr-FR-DeniseNeural', name: 'Denise', gender: 'Female', desc: 'Jeune, dynamique — voix de Foxie' },
  { id: 'fr-FR-VivienneMultilingualNeural', name: 'Vivienne', gender: 'Female', desc: 'Douce — accent anglais sur les mots anglais' },
  { id: 'fr-FR-EloiseNeural', name: 'Eloise', gender: 'Female', desc: 'Chaleureuse' },
  { id: 'fr-FR-HenriNeural', name: 'Henri', gender: 'Male', desc: 'Amical' },
  { id: 'fr-FR-RemyMultilingualNeural', name: 'Remy', gender: 'Male', desc: 'Multilingue' },
];
const ttsCache = new Map();
const TTS_CACHE_MAX = 80;

function cacheKey({ text, voice, rate, pitch }) {
  return crypto.createHash('sha1').update(JSON.stringify({ text, voice, rate, pitch })).digest('hex');
}

function rememberAudio(key, audioBuffer) {
  if (ttsCache.has(key)) ttsCache.delete(key);
  ttsCache.set(key, audioBuffer);
  while (ttsCache.size > TTS_CACHE_MAX) {
    const oldest = ttsCache.keys().next().value;
    ttsCache.delete(oldest);
  }
}

/**
 * GET /api/avatar/status
 * Toujours prêt — Edge-TTS est gratuit et sans clé
 */
router.get('/status', (req, res) => {
  res.json({
    provider: 'edge-tts',
    ready: true,
    voice: FOXIE_VOICE,
    cost: 'gratuit',
  });
});

/**
 * GET /api/avatar/voices
 * Liste les voix françaises disponibles
 */
router.get('/voices', (req, res) => {
  res.json({ voices: FRENCH_VOICES, provider: 'edge-tts' });
});

/**
 * POST /api/avatar/speak
 * Convertit du texte en audio via Edge-TTS (Microsoft Neural)
 *
 * Body: { text, voice?, rate?, pitch? }
 * Returns: audio/mp3 stream
 */
router.post('/speak', async (req, res) => {
  const { text, voice, emotion, rate: requestedRate, pitch: requestedPitch } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'text requis' });
  }

  // Limiter le texte pour garder des réponses courtes
  const cleanText = String(text).replace(/\s+/g, ' ').trim().substring(0, 420);

  // Adapter le débit et le ton selon l'émotion
  let rate = '+0%';
  let pitch = '+0Hz';

  if (emotion === 'excited') {
    rate = '+6%';
    pitch = '+2Hz';
  } else if (emotion === 'encouraging') {
    rate = '+0%';
    pitch = '+1Hz';
  } else if (emotion === 'thinking') {
    rate = '-3%';
    pitch = '+0Hz';
  }

  if (requestedRate) rate = requestedRate;
  if (requestedPitch) pitch = requestedPitch;

  const selectedVoice = voice || FOXIE_VOICE;
  const key = cacheKey({ text: cleanText, voice: selectedVoice, rate, pitch });
  const cached = ttsCache.get(key);
  if (cached) {
    res.set({
      'Content-Type': 'audio/mp3',
      'Content-Length': cached.length,
      'Cache-Control': 'private, max-age=3600',
    });
    return res.send(cached);
  }

  try {
    const comm = new Communicate(cleanText, selectedVoice, { rate, pitch });

    // Collecter les chunks audio
    const audioChunks = [];
    for await (const chunk of comm.stream()) {
      if (chunk.type === 'audio') {
        audioChunks.push(chunk.data);
      }
    }

    const audioBuffer = Buffer.concat(audioChunks);

    if (audioBuffer.length === 0) {
      console.error('Edge-TTS: aucun audio reçu');
      return res.status(500).json({ error: 'Pas d\'audio généré' });
    }
    rememberAudio(key, audioBuffer);

    // Envoyer l'audio MP3
    res.set({
      'Content-Type': 'audio/mp3',
      'Content-Length': audioBuffer.length,
      'Cache-Control': 'no-cache',
    });

    res.send(audioBuffer);
    console.log(`Foxie parle (${cleanText.length} chars, ${audioBuffer.length} bytes) via Edge-TTS`);
  } catch (err) {
    console.error('Erreur Edge-TTS:', err.message);
    res.status(500).json({ error: err.message, fallback: true });
  }
});

module.exports = router;
