/**
 * Cleanup Agent — Pur SQL, zéro appel API
 *
 * Nettoie l'historique et déduplique les artefacts pour garder
 * l'app légère, rapide et peu coûteuse en stockage.
 *
 * Exécuté toutes les 12h + endpoint manuel.
 */

const db = require('../db/init');

function runCleanup() {
  const start = Date.now();
  const report = {
    sessions_cleaned: 0,
    messages_cleaned: 0,
    fiches_deduped: 0,
    topics_deduped: 0,
    discoveries_cleaned: 0,
    sync_logs_cleaned: 0,
    training_data_cleaned: 0,
    documents_fts_rebuilt: false,
    photos_cleaned: 0,
  };

  try {
    // ─── 1. Sessions vides ou quasi-vides (< 2 messages, > 7 jours) ───
    const oldEmptySessions = db.prepare(`
      SELECT hs.id FROM homework_sessions hs
      LEFT JOIN homework_messages hm ON hs.id = hm.session_id
      WHERE hs.started_at < datetime('now', '-7 days')
      GROUP BY hs.id
      HAVING COUNT(hm.id) < 2
    `).all();

    if (oldEmptySessions.length > 0) {
      const ids = oldEmptySessions.map(s => s.id);
      db.prepare(`DELETE FROM homework_messages WHERE session_id IN (${ids.join(',')})`).run();
      db.prepare(`DELETE FROM homework_sessions WHERE id IN (${ids.join(',')})`).run();
      report.sessions_cleaned = ids.length;
    }

    // ─── 2. Messages trop anciens (> 60 jours, garder les sessions récentes) ───
    const oldMsgResult = db.prepare(`
      DELETE FROM homework_messages
      WHERE session_id IN (
        SELECT id FROM homework_sessions WHERE started_at < datetime('now', '-60 days')
      )
    `).run();
    report.messages_cleaned = oldMsgResult.changes;

    // Sessions orphelines (sans messages restants, > 60 jours)
    db.prepare(`
      DELETE FROM homework_sessions
      WHERE started_at < datetime('now', '-60 days')
      AND id NOT IN (SELECT DISTINCT session_id FROM homework_messages)
    `).run();

    // ─── 3. Dédupliquer les fiches (même member + subject + title + type) ───
    // Garde la plus récente, supprime les doublons
    const dupeFiches = db.prepare(`
      SELECT id FROM kb_fiches
      WHERE id NOT IN (
        SELECT MAX(id) FROM kb_fiches
        GROUP BY member_id, subject, title, type
      )
      AND starred = 0
    `).all();

    if (dupeFiches.length > 0) {
      const ids = dupeFiches.map(f => f.id);
      db.prepare(`DELETE FROM kb_fiches WHERE id IN (${ids.join(',')})`).run();
      report.fiches_deduped = ids.length;
    }

    // ─── 4. Dédupliquer les KB topics (même member + subject + topic) ───
    // Garde celui avec la meilleure mastery ou le plus récent
    const dupeTopics = db.prepare(`
      SELECT id FROM kb_topics
      WHERE id NOT IN (
        SELECT MIN(id) FROM kb_topics
        GROUP BY member_id, subject, topic
      )
    `).all();

    if (dupeTopics.length > 0) {
      const ids = dupeTopics.map(t => t.id);
      // Process in batches of 500 to avoid SQLite limits
      for (let i = 0; i < ids.length; i += 500) {
        const batch = ids.slice(i, i + 500);
        db.prepare(`DELETE FROM kb_topics WHERE id IN (${batch.join(',')})`).run();
      }
      report.topics_deduped = ids.length;
    }

    // ─── 5. Discoveries non sauvées > 14 jours ───
    const discResult = db.prepare(`
      DELETE FROM kb_discoveries
      WHERE saved = 0 AND done = 0 AND created_at < datetime('now', '-14 days')
    `).run();
    report.discoveries_cleaned = discResult.changes;

    // ─── 6. Sync logs anciens (garder 30 derniers jours) ───
    const syncResult = db.prepare(`
      DELETE FROM kb_sync_log WHERE synced_at < datetime('now', '-30 days')
    `).run();
    report.sync_logs_cleaned = syncResult.changes;

    // ─── 7. Training data ancienne (> 90 jours) ───
    try {
      const trainResult = db.prepare(`
        DELETE FROM training_data WHERE created_at < datetime('now', '-90 days')
      `).run();
      report.training_data_cleaned = trainResult.changes;
    } catch {} // Table may not exist

    // ─── 8. Feedback stats anciennes (> 6 mois) ───
    try {
      db.prepare(`
        DELETE FROM feedback_stats WHERE created_at < datetime('now', '-180 days')
      `).run();
    } catch {}

    // ─── 9. Ne pas supprimer automatiquement les photos de cours ───
    // Les photos sont des sources pédagogiques et parfois personnelles. On les
    // archive ou purge uniquement via une action explicite, jamais en tâche de fond.

    // ─── 10. Rebuild FTS si des documents ont été supprimés ───
    try {
      db.prepare("INSERT INTO kb_documents_fts(kb_documents_fts) VALUES('rebuild')").run();
      report.documents_fts_rebuilt = true;
    } catch {} // Ignore if no changes needed

    // ─── 10. SQLite VACUUM pour libérer l'espace disque ───
    // Note: on fait un PRAGMA optimize plutôt que VACUUM (non-blocking)
    db.pragma('optimize');

  } catch (err) {
    console.error('[Cleanup] Error:', err.message);
    report.error = err.message;
  }

  const duration = Date.now() - start;
  report.duration_ms = duration;

  const totalCleaned = report.sessions_cleaned + report.messages_cleaned +
    report.fiches_deduped + report.topics_deduped + report.discoveries_cleaned +
    report.sync_logs_cleaned + report.training_data_cleaned + (report.photos_cleaned || 0);

  console.log(`[Cleanup] Done in ${duration}ms — ${totalCleaned} items cleaned`);
  return report;
}

function deleteAll(table) {
  try {
    return db.prepare(`DELETE FROM ${table}`).run().changes;
  } catch {
    return 0;
  }
}

function runMvpDataReset() {
  const report = {};

  const tx = db.transaction(() => {
    for (const table of [
      'feedback_rewards',
      'feedback_stats',
      'improvement_proposals',
      'feedback',
      'progress_attempts',
      'progress_exercises',
      'progress_objectives',
      'progress_plans',
      'revision_progress',
      'revision_plans',
      'evolution_log',
      'evolution_reports',
      'notification_log',
      'coins_transactions',
      'owned_items',
      'coins_balance',
      'xp_events',
      'xp_totals',
      'engagement_log',
      'parent_reports',
      'learning_observations',
      'training_data',
      'homework_messages',
      'homework_sessions',
      'homework_progress',
      'quiz_answers',
      'quiz_questions',
      'quiz_sessions',
      'quiz_streaks',
      'post_reactions',
      'posts',
      'activity_members',
      'activities',
      'kb_learning_events',
      'kb_mindmaps',
      'kb_flashcards',
      'chapter_quiz_results',
    ]) {
      report[table] = deleteAll(table);
    }

    try {
      report.kb_sync_log = db.prepare(`
        DELETE FROM kb_sync_log
        WHERE sync_type != 'subject_normalization'
      `).run().changes;
    } catch {
      report.kb_sync_log = 0;
    }

    report.shop_items = deleteAll('shop_items');
  });

  tx();
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch {}
  db.pragma('optimize');

  return report;
}

// Get current DB stats (for the admin/profil page)
function getDbStats() {
  const stats = {};
  const tables = [
    { name: 'homework_sessions', label: 'Sessions devoirs' },
    { name: 'homework_messages', label: 'Messages' },
    { name: 'kb_fiches', label: 'Fiches' },
    { name: 'kb_topics', label: 'Topics KB' },
    { name: 'kb_homework', label: 'Devoirs KB' },
    { name: 'kb_documents', label: 'Documents photos' },
    { name: 'kb_discoveries', label: 'Découvertes' },
    { name: 'kb_timetable', label: 'Emploi du temps' },
  ];

  for (const t of tables) {
    try {
      const row = db.prepare(`SELECT COUNT(*) as count FROM ${t.name}`).get();
      stats[t.name] = { label: t.label, count: row.count };
    } catch { stats[t.name] = { label: t.label, count: 0 }; }
  }

  // DB file size
  try {
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.join(__dirname, '..', '..', 'data', 'familyflow.db');
    const s = fs.statSync(dbPath);
    stats._db_size_mb = (s.size / 1024 / 1024).toFixed(2);
  } catch {}

  // Duplicate counts (for info)
  try {
    const dupeFiches = db.prepare(`
      SELECT COUNT(*) - COUNT(DISTINCT member_id || subject || title || type) as dupes
      FROM kb_fiches WHERE starred = 0
    `).get();
    stats._duplicate_fiches = dupeFiches.dupes;
  } catch {}

  try {
    const dupeTopics = db.prepare(`
      SELECT COUNT(*) - COUNT(DISTINCT member_id || subject || topic) as dupes
      FROM kb_topics
    `).get();
    stats._duplicate_topics = dupeTopics.dupes;
  } catch {}

  return stats;
}

// Auto-start: run every 12h
let cleanupInterval = null;
function startCleanupAgent() {
  // Run once at startup (delayed 30s to not slow boot)
  setTimeout(() => {
    console.log('[Cleanup] Initial cleanup...');
    runCleanup();
  }, 30000);

  // Then every 12h
  cleanupInterval = setInterval(() => {
    console.log('[Cleanup] Scheduled cleanup...');
    runCleanup();
  }, 12 * 60 * 60 * 1000);
}

module.exports = { runCleanup, runMvpDataReset, getDbStats, startCleanupAgent };
