const express = require('express');
const router = express.Router();
const db = require('../db/init');

/**
 * GET /api/elevenlabs/context/:memberId
 * Retourne le contexte complet d'un enfant pour l'agent ElevenLabs Foxie.
 * Ce contexte est injecté comme dynamic-variables dans le widget.
 */
router.get('/context/:memberId', (req, res) => {
  try {
    const memberId = req.params.memberId;
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);

    if (!member) {
      return res.status(404).json({ success: false, error: 'Membre non trouvé' });
    }

    // ─── Devoirs à venir (prochains 7 jours) ───
    const today = new Date().toISOString().split('T')[0];
    const in7days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const homework = db.prepare(`
      SELECT subject, description, due_date, done
      FROM kb_homework
      WHERE member_id = ? AND due_date >= ? AND due_date <= ? AND done = 0
      ORDER BY due_date ASC
      LIMIT 10
    `).all(memberId, today, in7days);

    const homeworkSummary = homework.length > 0
      ? homework.map(h => {
          const diff = Math.ceil((new Date(h.due_date) - new Date()) / 86400000);
          const urgence = diff <= 1 ? '⚠️ URGENT' : diff <= 2 ? '🔶 bientôt' : '';
          return `- ${h.subject}: ${h.description} (dans ${diff}j) ${urgence}`;
        }).join('\n')
      : 'Aucun devoir en attente cette semaine.';

    // ─── Matières étudiées ───
    const subjects = db.prepare(`
      SELECT DISTINCT subject FROM kb_subjects WHERE member_id = ?
    `).all(memberId).map(s => s.subject);

    // ─── Derniers sujets travaillés avec Foxie ───
    const recentTopics = db.prepare(`
      SELECT subject, topic, understanding_level, last_practiced
      FROM homework_progress
      WHERE member_id = ?
      ORDER BY last_practiced DESC
      LIMIT 5
    `).all(memberId);

    const recentTopicsSummary = recentTopics.length > 0
      ? recentTopics.map(t => {
          const level = ['❌ pas compris', '🟠 début', '🟡 en cours', '🟢 ok', '✅ bien', '⭐ maîtrisé'][t.understanding_level] || '?';
          return `- ${t.subject}: ${t.topic} (${level})`;
        }).join('\n')
      : 'Pas encore de sujets travaillés.';

    // ─── Erreurs récentes (difficultés identifiées) ───
    const recentErrors = db.prepare(`
      SELECT subject, error_type, substr(child_message, 1, 80) as msg
      FROM training_data
      WHERE member_id = ? AND label IN ('incorrect','partial') AND error_type IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 5
    `).all(memberId);

    const difficultiesSummary = recentErrors.length > 0
      ? recentErrors.map(e => `- ${e.subject}: ${e.error_type}`).join('\n')
      : 'Aucune difficulté récente identifiée.';

    // ─── Engagement récent ───
    let engagementScore = null;
    try {
      const eng = db.prepare(`
        SELECT score FROM engagement_log
        WHERE member_id = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(memberId);
      engagementScore = eng?.score || null;
    } catch {}

    // ─── XP et niveau ───
    let xpInfo = { total_xp: 0, level: 1 };
    try {
      const xp = db.prepare('SELECT * FROM xp_totals WHERE member_id = ?').get(memberId);
      if (xp) xpInfo = xp;
    } catch {}

    // ─── Style d'apprentissage ───
    let learningStyle = null;
    try {
      const style = db.prepare(`
        SELECT preferred_style FROM learning_style_profile
        WHERE member_id = ?
        ORDER BY updated_at DESC LIMIT 1
      `).get(memberId);
      learningStyle = style?.preferred_style || null;
    } catch {}

    // ─── Emploi du temps aujourd'hui ───
    const dayOfWeek = new Date().getDay(); // 0=dim, 1=lun...
    const timetableToday = db.prepare(`
      SELECT subject, start_time, end_time
      FROM kb_timetable
      WHERE member_id = ? AND day_of_week = ?
      ORDER BY start_time ASC
    `).all(memberId, dayOfWeek);

    const timetableSummary = timetableToday.length > 0
      ? timetableToday.map(t => `- ${t.start_time}-${t.end_time}: ${t.subject}`).join('\n')
      : "Pas de cours aujourd'hui (ou emploi du temps non synchronisé).";

    // ─── Construire les dynamic variables pour ElevenLabs ───
    const dynamicVariables = {
      child_name: member.name,
      child_age: String(member.age || ''),
      child_grade: member.grade || '',
      child_role: member.role,
      homework_summary: homeworkSummary,
      subjects_list: subjects.join(', ') || 'Non renseignées',
      recent_topics: recentTopicsSummary,
      difficulties: difficultiesSummary,
      engagement_score: engagementScore !== null ? String(engagementScore) : 'Non mesuré',
      xp_total: String(xpInfo.total_xp),
      xp_level: String(xpInfo.level),
      learning_style: learningStyle || 'Non encore identifié',
      timetable_today: timetableSummary,
      current_date: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      current_time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    };

    res.json({
      success: true,
      member: { id: member.id, name: member.name, role: member.role, grade: member.grade, age: member.age },
      dynamicVariables,
    });
  } catch (error) {
    console.error('ElevenLabs context error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/elevenlabs/signed-url
 * Génère une URL signée pour démarrer une session sécurisée.
 * Utile pour éviter d'exposer l'agent-id côté client.
 */
router.post('/signed-url', async (req, res) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'ELEVENLABS_API_KEY non configurée' });
    }

    const agentId = 'agent_9401kmb634qsexnr5hvwwghnhtdm';

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      {
        method: 'GET',
        headers: { 'xi-api-key': apiKey },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ success: false, error: `ElevenLabs API: ${text}` });
    }

    const data = await response.json();
    res.json({ success: true, signedUrl: data.signed_url });
  } catch (error) {
    console.error('Signed URL error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
