const express = require('express');
const router = express.Router();
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

// Voix françaises disponibles — Denise est parfaite pour Foxie (jeune, dynamique)
const FOXIE_VOICE = 'fr-FR-DeniseNeural';

// Voix alternatives
const FRENCH_VOICES = [
  { id: 'fr-FR-DeniseNeural', name: 'Denise', gender: 'Female', desc: 'Jeune, dynamique — voix de Foxie' },
  { id: 'fr-FR-VivienneMultilingualNeural', name: 'Vivienne', gender: 'Female', desc: 'Douce, multilingue' },
  { id: 'fr-FR-EloiseNeural', name: 'Eloise', gender: 'Female', desc: 'Chaleureuse' },
  { id: 'fr-FR-HenriNeural', name: 'Henri', gender: 'Male', desc: 'Amical' },
  { id: 'fr-FR-RemyMultilingualNeural', name: 'Remy', gender: 'Male', desc: 'Multilingue' },
];

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
  const { text, voice, emotion } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'text requis' });
  }

  // Limiter le texte pour garder des réponses courtes
  const cleanText = text.substring(0, 500);

  // Adapter le débit et le ton selon l'émotion
  let rate = '+10%';   // Un peu plus rapide que normal = plus dynamique
  let pitch = '+5Hz';  // Légèrement plus aigu = plus jeune

  if (emotion === 'excited') {
    rate = '+18%';
    pitch = '+12Hz';
  } else if (emotion === 'encouraging') {
    rate = '+5%';
    pitch = '+8Hz';
  } else if (emotion === 'thinking') {
    rate = '-5%';
    pitch = '+0Hz';
  }

  const selectedVoice = voice || FOXIE_VOICE;

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

    // Envoyer l'audio MP3
    res.set({
      'Content-Type': 'audio/mp3',
      'Content-Length': audioBuffer.length,
      'Cache-Control': 'no-cache',
    });

    res.send(audioBuffer);
    console.log(`🦊 Foxie parle (${cleanText.length} chars, ${audioBuffer.length} bytes) via Edge-TTS`);
  } catch (err) {
    console.error('Erreur Edge-TTS:', err.message);
    res.status(500).json({ error: err.message, fallback: true });
  }
});

module.exports = router;
