/**
 * Moteur d'auto-amélioration — Self-Improving Engine
 *
 * Calibre automatiquement la difficulté, les récompenses, les stratégies
 * et les prompts en fonction des données d'usage réelles.
 */

const db = require('../db/init');
const { generateJSON } = require('./claude');

const LOG_PREFIX = '[Evolution]';
const PROMPT_TYPES = ['homework', 'quiz', 'dictation', 'chapter_quiz', 'mock_oral', 'revision'];
const DIFFICULTY_LEVELS = ['facile', 'moyen', 'difficile'];
const STRATEGIES = ['analogie_concrete', 'visuel_schema', 'textuel_structure', 'exploratoire_defi'];

// ─── Utilitaires ───

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function weekAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}

function getMonday() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split('T')[0];
}

// ─── Calibrage de difficulté ───

/**
 * Calcule le taux de réussite et ajuste la difficulté pour un enfant.
 */
function calibrateDifficulty(memberId, context, subject) {
  const today = todayStr();
  let successRate = null;
  let sampleSize = 0;

  try {
    if (context === 'quiz') {
      // Depuis quiz_answers (correct_answer match)
      const stats = db.prepare(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN qa.selected_index = qq.correct_answer THEN 1 ELSE 0 END) as correct
        FROM quiz_answers qa
        JOIN quiz_questions qq ON qa.question_id = qq.id
        WHERE qa.member_id = ? AND (? IS NULL OR qq.subject = ?)
      `).get(memberId, subject || null, subject || null);
      if (stats && stats.total > 0) {
        sampleSize = stats.total;
        successRate = stats.correct / stats.total;
      }
    } else if (context === 'dictation') {
      // Depuis dictation_sessions
      const stats = db.prepare(`
        SELECT COUNT(*) as total, AVG(score) as avg_score
        FROM dictation_sessions
        WHERE member_id = ? AND score IS NOT NULL
      `).get(memberId);
      if (stats && stats.total > 0) {
        sampleSize = stats.total;
        successRate = (stats.avg_score || 0) / 100;
      }
    } else if (context === 'progress_plan') {
      // Depuis progress_attempts
      const stats = db.prepare(`
        SELECT COUNT(*) as total, SUM(is_correct) as correct
        FROM progress_attempts
        WHERE member_id = ? AND (? IS NULL OR exercise_id IN (
          SELECT pe.id FROM progress_exercises pe
          JOIN progress_objectives po ON pe.objective_id = po.id
          WHERE po.subject = ?
        ))
      `).get(memberId, subject || null, subject || null);
      if (stats && stats.total > 0) {
        sampleSize = stats.total;
        successRate = stats.correct / stats.total;
      }
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur calcul taux réussite:`, err.message);
    return null;
  }

  if (successRate === null) return null;

  // Déterminer le nouveau niveau
  let currentDifficulty = getDifficulty(memberId, context, subject);
  let newDifficulty = currentDifficulty;
  let changed = false;

  // Monter si >90% sur 10+ essais
  if (successRate > 0.9 && sampleSize >= 10) {
    const idx = DIFFICULTY_LEVELS.indexOf(currentDifficulty);
    if (idx < DIFFICULTY_LEVELS.length - 1) {
      newDifficulty = DIFFICULTY_LEVELS[idx + 1];
      changed = true;
    }
  }
  // Descendre si <40% sur 5+ essais
  else if (successRate < 0.4 && sampleSize >= 5) {
    const idx = DIFFICULTY_LEVELS.indexOf(currentDifficulty);
    if (idx > 0) {
      newDifficulty = DIFFICULTY_LEVELS[idx - 1];
      changed = true;
    }
  }

  try {
    // Upsert dans difficulty_calibration
    db.prepare(`
      INSERT INTO difficulty_calibration (member_id, context, subject, difficulty, success_rate, sample_size, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(member_id, context, subject) DO UPDATE SET
        difficulty = excluded.difficulty,
        success_rate = excluded.success_rate,
        sample_size = excluded.sample_size,
        updated_at = datetime('now')
    `).run(memberId, context, subject || '__all__', newDifficulty, successRate, sampleSize);

    // Log si changement
    if (changed) {
      db.prepare(`
        INSERT INTO evolution_log (cycle_date, action_type, target_member, details, auto_applied, status)
        VALUES (?, 'difficulty_adjust', ?, ?, 1, 'applied')
      `).run(today, memberId, JSON.stringify({
        context, subject, from: currentDifficulty, to: newDifficulty,
        successRate: Math.round(successRate * 100), sampleSize
      }));
      console.log(`${LOG_PREFIX} Difficulté ajustée: membre=${memberId} ${context}/${subject || 'all'} ${currentDifficulty}→${newDifficulty}`);
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur upsert difficulté:`, err.message);
  }

  return { memberId, context, subject, difficulty: newDifficulty, successRate, sampleSize, changed };
}

/**
 * Retourne la difficulté courante pour un enfant/contexte, fallback 'moyen'.
 */
function getDifficulty(memberId, context, subject) {
  try {
    const row = db.prepare(`
      SELECT difficulty FROM difficulty_calibration
      WHERE member_id = ? AND context = ? AND subject = ?
    `).get(memberId, context, subject || '__all__');
    return row ? row.difficulty : 'moyen';
  } catch {
    return 'moyen';
  }
}

// ─── Optimisation des récompenses ───

/**
 * Ajuste le montant des récompenses en fonction de l'engagement.
 */
function optimizeRewards(memberId, source) {
  const today = todayStr();

  try {
    // Moyenne engagement des 14 derniers jours
    const engagement = db.prepare(`
      SELECT AVG(score) as avg_score
      FROM engagement_log
      WHERE member_id = ? AND created_at >= datetime('now', '-14 days')
    `).get(memberId);

    const avgEngagement = engagement?.avg_score;
    if (avgEngagement === null || avgEngagement === undefined) return null;

    // Récupérer ou créer calibration
    let cal = null;
    try {
      cal = db.prepare(`
        SELECT * FROM reward_calibration WHERE member_id = ? AND source = ?
      `).get(memberId, source);
    } catch {}

    const baseAmount = 5;
    let currentAmount = cal?.current_amount || baseAmount;
    const minAmount = cal?.min_amount || 1;
    const maxAmount = cal?.max_amount || 30;
    let newAmount = currentAmount;

    // Engagement faible (<40) → augmenter de 20%
    if (avgEngagement < 40) {
      newAmount = Math.min(maxAmount, Math.ceil(currentAmount * 1.2));
    }
    // Engagement élevé (>80) et au-dessus du base → réduire de 10%
    else if (avgEngagement > 80 && currentAmount > baseAmount) {
      newAmount = Math.max(baseAmount, Math.floor(currentAmount * 0.9));
    }

    const changed = newAmount !== currentAmount;

    // Upsert
    db.prepare(`
      INSERT INTO reward_calibration (member_id, source, base_amount, current_amount, min_amount, max_amount, last_engagement_avg, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(member_id, source) DO UPDATE SET
        current_amount = excluded.current_amount,
        last_engagement_avg = excluded.last_engagement_avg,
        updated_at = datetime('now')
    `).run(memberId, source, baseAmount, newAmount, minAmount, maxAmount, avgEngagement);

    if (changed) {
      db.prepare(`
        INSERT INTO evolution_log (cycle_date, action_type, target_member, details, auto_applied, status)
        VALUES (?, 'reward_adjust', ?, ?, 1, 'applied')
      `).run(today, memberId, JSON.stringify({
        source, from: currentAmount, to: newAmount,
        avgEngagement: Math.round(avgEngagement)
      }));
      console.log(`${LOG_PREFIX} Récompense ajustée: membre=${memberId} ${source} ${currentAmount}→${newAmount} coins`);
    }

    return { memberId, source, currentAmount: newAmount, avgEngagement, changed };
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur optimisation récompenses:`, err.message);
    return null;
  }
}

/**
 * Retourne le montant de récompense courant, ou le montant par défaut.
 */
function getRewardAmount(memberId, source, defaultAmount = 5) {
  try {
    const row = db.prepare(`
      SELECT current_amount FROM reward_calibration WHERE member_id = ? AND source = ?
    `).get(memberId, source);
    return row ? row.current_amount : defaultAmount;
  } catch {
    return defaultAmount;
  }
}

// ─── Gestion des stratégies ───

/**
 * Détecte la fatigue de stratégie : si les 10 derniers scores d'engagement < 50.
 */
function detectStrategyFatigue(memberId, subject) {
  try {
    const scores = db.prepare(`
      SELECT el.score FROM engagement_log el
      JOIN homework_sessions hs ON el.session_id = hs.id
      WHERE el.member_id = ? AND hs.subject = ?
      ORDER BY el.created_at DESC LIMIT 10
    `).all(memberId, subject);

    if (scores.length < 5) return { fatigued: false, reason: 'Pas assez de données' };

    const avg = scores.reduce((s, r) => s + r.score, 0) / scores.length;

    if (avg < 50) {
      // Stratégie actuelle
      const current = db.prepare(`
        SELECT preferred_style FROM learning_style_profile
        WHERE member_id = ? AND subject = ?
      `).get(memberId, subject);

      const currentStyle = current?.preferred_style || 'textuel_structure';
      // Suggérer une stratégie différente
      const otherStrategies = STRATEGIES.filter(s => s !== currentStyle);
      const suggestedStrategy = otherStrategies[Math.floor(Math.random() * otherStrategies.length)];

      return { fatigued: true, avgEngagement: Math.round(avg), currentStyle, suggestedStrategy };
    }

    return { fatigued: false, avgEngagement: Math.round(avg) };
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur détection fatigue:`, err.message);
    return { fatigued: false, error: err.message };
  }
}

/**
 * Change la stratégie d'apprentissage pour un enfant/matière.
 */
function switchStrategy(memberId, subject, newStrategy) {
  const today = todayStr();
  try {
    const current = db.prepare(`
      SELECT preferred_style FROM learning_style_profile
      WHERE member_id = ? AND subject = ?
    `).get(memberId, subject);

    const oldStyle = current?.preferred_style || 'aucune';

    db.prepare(`
      INSERT INTO learning_style_profile (member_id, subject, preferred_style, confidence, updated_at)
      VALUES (?, ?, ?, 0.5, datetime('now'))
      ON CONFLICT(member_id, subject) DO UPDATE SET
        preferred_style = excluded.preferred_style,
        confidence = 0.5,
        updated_at = datetime('now')
    `).run(memberId, subject, newStrategy);

    db.prepare(`
      INSERT INTO evolution_log (cycle_date, action_type, target_member, details, auto_applied, status)
      VALUES (?, 'strategy_switch', ?, ?, 1, 'applied')
    `).run(today, memberId, JSON.stringify({
      subject, from: oldStyle, to: newStrategy
    }));

    console.log(`${LOG_PREFIX} Stratégie changée: membre=${memberId} ${subject} ${oldStyle}→${newStrategy}`);
    return { success: true, memberId, subject, from: oldStyle, to: newStrategy };
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur switch stratégie:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── Métriques de prompts ───

/**
 * Calcule les métriques agrégées pour une version de prompt sur une période.
 */
function computePromptMetrics(promptVersionId, periodStart, periodEnd) {
  try {
    // Sessions liées à cette version
    const sessions = db.prepare(`
      SELECT ps.id, ps.member_id, ps.session_id, ps.session_type
      FROM prompt_sessions ps
      WHERE ps.prompt_version_id = ? AND ps.created_at BETWEEN ? AND ?
    `).all(promptVersionId, periodStart, periodEnd);

    const totalSessions = sessions.length;
    if (totalSessions === 0) return null;

    // Engagement moyen
    const sessionIds = sessions.map(s => s.session_id).filter(Boolean);
    let avgEngagement = null;
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => '?').join(',');
      const eng = db.prepare(`
        SELECT AVG(score) as avg FROM engagement_log WHERE session_id IN (${placeholders})
      `).get(...sessionIds);
      avgEngagement = eng?.avg || null;
    }

    // Taux de bonnes réponses (training_data)
    let correctRatio = null;
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => '?').join(',');
      const td = db.prepare(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN label = 'correct' THEN 1 ELSE 0 END) as correct
        FROM training_data WHERE session_id IN (${placeholders})
      `).get(...sessionIds);
      if (td && td.total > 0) {
        correctRatio = td.correct / td.total;
      }
    }

    // Durée moyenne de session
    let avgDuration = null;
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => '?').join(',');
      const dur = db.prepare(`
        SELECT AVG(response_time_ms) as avg FROM training_data WHERE session_id IN (${placeholders}) AND response_time_ms IS NOT NULL
      `).get(...sessionIds);
      avgDuration = dur?.avg ? Math.round(dur.avg) : null;
    }

    // Feedback moyen
    let avgFeedback = null;
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => '?').join(',');
      const fb = db.prepare(`
        SELECT AVG(rating) as avg FROM feedback WHERE session_id IN (${placeholders}) AND rating IS NOT NULL
      `).get(...sessionIds);
      avgFeedback = fb?.avg || null;
    }

    // Upsert métriques
    db.prepare(`
      INSERT INTO prompt_metrics (prompt_version_id, period_start, period_end, total_sessions, avg_engagement, correct_ratio, avg_session_duration_ms, avg_feedback_rating, computed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(prompt_version_id, period_start) DO UPDATE SET
        period_end = excluded.period_end,
        total_sessions = excluded.total_sessions,
        avg_engagement = excluded.avg_engagement,
        correct_ratio = excluded.correct_ratio,
        avg_session_duration_ms = excluded.avg_session_duration_ms,
        avg_feedback_rating = excluded.avg_feedback_rating,
        computed_at = datetime('now')
    `).run(promptVersionId, periodStart, periodEnd, totalSessions, avgEngagement, correctRatio, avgDuration, avgFeedback);

    return { promptVersionId, totalSessions, avgEngagement, correctRatio, avgDuration, avgFeedback };
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur calcul métriques prompt:`, err.message);
    return null;
  }
}

/**
 * Enregistre qu'une session utilise une version de prompt donnée.
 */
function recordPromptSession(promptVersionId, memberId, sessionId, sessionType) {
  try {
    db.prepare(`
      INSERT INTO prompt_sessions (prompt_version_id, member_id, session_id, session_type)
      VALUES (?, ?, ?, ?)
    `).run(promptVersionId, memberId, sessionId, sessionType);
    return { success: true };
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur enregistrement session prompt:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── Évolution des prompts (utilise Claude) ───

/**
 * Génère une variation d'un prompt actif via Claude.
 */
async function generatePromptVariation(promptType) {
  const today = todayStr();

  try {
    // Récupérer le prompt actif
    const active = db.prepare(`
      SELECT * FROM prompt_versions
      WHERE prompt_type = ? AND status = 'active'
      ORDER BY version DESC LIMIT 1
    `).get(promptType);

    if (!active) {
      console.log(`${LOG_PREFIX} Aucun prompt actif pour ${promptType}, skip`);
      return null;
    }

    // Métriques du prompt actif
    const metrics = db.prepare(`
      SELECT * FROM prompt_metrics
      WHERE prompt_version_id = ?
      ORDER BY computed_at DESC LIMIT 1
    `).get(active.id);

    // Feedback récent
    const recentFeedback = db.prepare(`
      SELECT f.type, f.rating, f.comment, f.subject
      FROM feedback f
      JOIN prompt_sessions ps ON f.session_id = ps.session_id
      WHERE ps.prompt_version_id = ? AND f.created_at >= datetime('now', '-14 days')
      ORDER BY f.created_at DESC LIMIT 10
    `).all(active.id);

    const systemPrompt = `Tu es un expert en ingénierie de prompts pour une application éducative française (Family Flow).
Tu dois créer une VARIATION améliorée d'un prompt existant en te basant sur les métriques et le feedback.
Réponds UNIQUEMENT en JSON valide.`;

    const metricsDesc = metrics
      ? `Métriques actuelles: ${metrics.total_sessions} sessions, engagement=${metrics.avg_engagement?.toFixed(1) || 'N/A'}, correct=${metrics.correct_ratio?.toFixed(2) || 'N/A'}, feedback=${metrics.avg_feedback_rating?.toFixed(1) || 'N/A'}`
      : 'Pas de métriques disponibles.';

    const feedbackDesc = recentFeedback.length > 0
      ? 'Feedback récent:\n' + recentFeedback.map(f => `- [${f.type}] rating=${f.rating || 'N/A'}: ${f.comment || 'pas de commentaire'} (${f.subject || ''})`).join('\n')
      : 'Pas de feedback récent.';

    const userMessage = `Voici le prompt actuel (type: ${promptType}, version ${active.version}):

---
${active.content.slice(0, 3000)}
---

${metricsDesc}
${feedbackDesc}

Crée une variation améliorée. Garde la même structure mais optimise:
- La clarté des instructions
- L'adaptation au niveau de l'enfant
- L'engagement et la motivation
- La qualité pédagogique

Format JSON:
{
  "content": "Le nouveau prompt complet...",
  "variables": ["var1", "var2"],
  "changes_summary": "Résumé des changements en 2-3 phrases"
}`;

    const result = await generateJSON(systemPrompt, userMessage, 8192);

    if (!result.content) {
      console.error(`${LOG_PREFIX} Variation invalide pour ${promptType}`);
      return null;
    }

    // Calculer la prochaine version
    const maxVersion = db.prepare(`
      SELECT MAX(version) as max FROM prompt_versions WHERE prompt_type = ?
    `).get(promptType);
    const nextVersion = (maxVersion?.max || 0) + 1;

    // Insérer comme 'testing'
    const insert = db.prepare(`
      INSERT INTO prompt_versions (prompt_type, version, content, variables, status, parent_version, created_at)
      VALUES (?, ?, ?, ?, 'testing', ?, datetime('now'))
    `).run(
      promptType, nextVersion, result.content,
      result.variables ? JSON.stringify(result.variables) : null,
      active.id
    );

    // Log
    db.prepare(`
      INSERT INTO evolution_log (cycle_date, action_type, details, auto_applied, status)
      VALUES (?, 'prompt_variation', ?, 1, 'applied')
    `).run(today, JSON.stringify({
      promptType, parentVersion: active.version, newVersion: nextVersion,
      changesSummary: result.changes_summary || ''
    }));

    console.log(`${LOG_PREFIX} Variation générée: ${promptType} v${active.version}→v${nextVersion}`);

    return {
      promptType,
      newVersionId: insert.lastInsertRowid,
      newVersion: nextVersion,
      changesSummary: result.changes_summary
    };
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur génération variation ${promptType}:`, err.message);
    return null;
  }
}

/**
 * Évalue un A/B test entre la version active et la version testing.
 */
function evaluateABTest(promptType) {
  const today = todayStr();

  try {
    const active = db.prepare(`
      SELECT pv.*, pm.avg_engagement as m_engagement, pm.correct_ratio as m_correct,
             pm.avg_feedback_rating as m_feedback, pm.total_sessions as m_sessions
      FROM prompt_versions pv
      LEFT JOIN prompt_metrics pm ON pm.prompt_version_id = pv.id
      WHERE pv.prompt_type = ? AND pv.status = 'active'
      ORDER BY pm.computed_at DESC LIMIT 1
    `).get(promptType);

    const testing = db.prepare(`
      SELECT pv.*, pm.avg_engagement as m_engagement, pm.correct_ratio as m_correct,
             pm.avg_feedback_rating as m_feedback, pm.total_sessions as m_sessions
      FROM prompt_versions pv
      LEFT JOIN prompt_metrics pm ON pm.prompt_version_id = pv.id
      WHERE pv.prompt_type = ? AND pv.status = 'testing'
      ORDER BY pm.computed_at DESC LIMIT 1
    `).get(promptType);

    if (!active || !testing) return null;

    // Besoin de 20+ sessions sur testing
    if (!testing.m_sessions || testing.m_sessions < 20) {
      return { status: 'insufficient_data', testingSessions: testing.m_sessions || 0, needed: 20 };
    }

    // Comparer — score composite
    function compositeScore(row) {
      let score = 0;
      let factors = 0;
      if (row.m_engagement != null) { score += row.m_engagement / 100; factors++; }
      if (row.m_correct != null) { score += row.m_correct; factors++; }
      if (row.m_feedback != null) { score += row.m_feedback / 5; factors++; }
      return factors > 0 ? score / factors : 0;
    }

    const activeScore = compositeScore(active);
    const testingScore = compositeScore(testing);
    const testingWins = testingScore > activeScore;

    const promote = db.transaction(() => {
      if (testingWins) {
        // Promouvoir testing → active, retirer l'ancien
        db.prepare(`UPDATE prompt_versions SET status = 'retired', retired_at = datetime('now') WHERE id = ?`).run(active.id);
        db.prepare(`UPDATE prompt_versions SET status = 'active', activated_at = datetime('now') WHERE id = ?`).run(testing.id);
      } else {
        // Retirer testing
        db.prepare(`UPDATE prompt_versions SET status = 'retired', retired_at = datetime('now') WHERE id = ?`).run(testing.id);
      }

      db.prepare(`
        INSERT INTO evolution_log (cycle_date, action_type, details, auto_applied, status)
        VALUES (?, 'prompt_promote', ?, 1, 'applied')
      `).run(today, JSON.stringify({
        promptType,
        winner: testingWins ? 'testing' : 'active',
        activeVersion: active.version, activeScore: Math.round(activeScore * 100),
        testingVersion: testing.version, testingScore: Math.round(testingScore * 100)
      }));
    });

    promote();

    const decision = testingWins ? 'promoted' : 'retired';
    console.log(`${LOG_PREFIX} A/B test ${promptType}: testing v${testing.version} ${decision} (${Math.round(testingScore * 100)} vs ${Math.round(activeScore * 100)})`);

    return {
      promptType, decision,
      activeVersion: active.version, activeScore: Math.round(activeScore * 100),
      testingVersion: testing.version, testingScore: Math.round(testingScore * 100)
    };
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur évaluation A/B ${promptType}:`, err.message);
    return null;
  }
}

// ─── Cycle hebdomadaire ───

/**
 * Exécute le cycle complet d'auto-amélioration.
 */
async function runWeeklyCycle() {
  console.log(`${LOG_PREFIX} Démarrage du cycle hebdomadaire...`);
  const results = { difficulty: [], strategy: [], rewards: [], metrics: [], abTests: [], variation: null, report: null };

  try {
    // Récupérer les enfants
    const children = db.prepare("SELECT id, name FROM members WHERE role = 'child'").all();
    const weekStart = getMonday();
    const weekEnd = todayStr();

    // 1. Calibrer la difficulté pour chaque enfant
    for (const child of children) {
      for (const ctx of ['quiz', 'dictation', 'progress_plan']) {
        try {
          const r = calibrateDifficulty(child.id, ctx, null);
          if (r) results.difficulty.push(r);
        } catch (err) {
          console.error(`${LOG_PREFIX} Erreur calibrage ${child.name}/${ctx}:`, err.message);
        }
      }
    }

    // 2. Détecter fatigue de stratégie
    for (const child of children) {
      try {
        // Récupérer les matières étudiées
        const subjects = db.prepare(`
          SELECT DISTINCT subject FROM kb_topics WHERE member_id = ? AND subject IS NOT NULL
        `).all(child.id);

        for (const { subject } of subjects) {
          const fatigue = detectStrategyFatigue(child.id, subject);
          if (fatigue.fatigued) {
            const switched = switchStrategy(child.id, subject, fatigue.suggestedStrategy);
            results.strategy.push({ child: child.name, subject, ...switched });
          }
        }
      } catch (err) {
        console.error(`${LOG_PREFIX} Erreur détection fatigue ${child.name}:`, err.message);
      }
    }

    // 3. Optimiser les récompenses
    const rewardSources = ['homework', 'quiz', 'dictation', 'routine', 'feedback', 'progress'];
    for (const child of children) {
      for (const source of rewardSources) {
        try {
          const r = optimizeRewards(child.id, source);
          if (r) results.rewards.push(r);
        } catch (err) {
          console.error(`${LOG_PREFIX} Erreur optimisation récompenses ${child.name}/${source}:`, err.message);
        }
      }
    }

    // 4. Calculer les métriques pour chaque type de prompt
    for (const promptType of PROMPT_TYPES) {
      try {
        const versions = db.prepare(`
          SELECT id FROM prompt_versions WHERE prompt_type = ? AND status IN ('active', 'testing')
        `).all(promptType);
        for (const v of versions) {
          const m = computePromptMetrics(v.id, weekStart, weekEnd);
          if (m) results.metrics.push(m);
        }
      } catch (err) {
        console.error(`${LOG_PREFIX} Erreur métriques ${promptType}:`, err.message);
      }
    }

    // 5. Évaluer les A/B tests en cours
    for (const promptType of PROMPT_TYPES) {
      try {
        const testing = db.prepare(`
          SELECT 1 FROM prompt_versions WHERE prompt_type = ? AND status = 'testing' LIMIT 1
        `).get(promptType);
        if (testing) {
          const r = evaluateABTest(promptType);
          if (r) results.abTests.push(r);
        }
      } catch (err) {
        console.error(`${LOG_PREFIX} Erreur A/B test ${promptType}:`, err.message);
      }
    }

    // 6. Générer une variation (round-robin sur les types de prompt)
    try {
      // Déterminer quel type de prompt faire varier (round-robin par semaine)
      const weekNumber = Math.floor((new Date() - new Date('2024-01-01')) / (7 * 24 * 60 * 60 * 1000));
      const targetType = PROMPT_TYPES[weekNumber % PROMPT_TYPES.length];

      // Vérifier qu'il n'y a pas déjà une version en testing
      const existingTest = db.prepare(`
        SELECT 1 FROM prompt_versions WHERE prompt_type = ? AND status = 'testing' LIMIT 1
      `).get(targetType);

      if (!existingTest) {
        results.variation = await generatePromptVariation(targetType);
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} Erreur génération variation:`, err.message);
    }

    // 7. Générer le rapport d'évolution
    try {
      results.report = generateEvolutionReport(weekStart);
    } catch (err) {
      console.error(`${LOG_PREFIX} Erreur génération rapport:`, err.message);
    }

    console.log(`${LOG_PREFIX} Cycle hebdomadaire terminé.`);
    return { success: true, results };
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur cycle hebdomadaire:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Génère un rapport d'évolution pour la semaine.
 */
function generateEvolutionReport(weekStart) {
  const today = todayStr();

  try {
    // Récupérer les actions de la semaine
    const logs = db.prepare(`
      SELECT el.*, m.name as member_name
      FROM evolution_log el
      LEFT JOIN members m ON el.target_member = m.id
      WHERE el.cycle_date >= ? AND el.cycle_date <= ?
      ORDER BY el.created_at
    `).all(weekStart, today);

    // Regrouper par enfant
    const byMember = {};
    const global = [];
    for (const log of logs) {
      const details = JSON.parse(log.details || '{}');
      const entry = { action: log.action_type, ...details, date: log.cycle_date, status: log.status };

      if (log.member_name) {
        if (!byMember[log.member_name]) byMember[log.member_name] = [];
        byMember[log.member_name].push(entry);
      } else {
        global.push(entry);
      }
    }

    const reportData = {
      weekStart,
      generatedAt: today,
      totalActions: logs.length,
      byMember,
      global,
      summary: {
        difficultyAdjustments: logs.filter(l => l.action_type === 'difficulty_adjust').length,
        strategySwitches: logs.filter(l => l.action_type === 'strategy_switch').length,
        rewardAdjustments: logs.filter(l => l.action_type === 'reward_adjust').length,
        promptVariations: logs.filter(l => l.action_type === 'prompt_variation').length,
        promptPromotions: logs.filter(l => l.action_type === 'prompt_promote').length,
      }
    };

    // Sauvegarder le rapport
    db.prepare(`
      INSERT INTO evolution_reports (week_start, report_data, created_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(week_start) DO UPDATE SET
        report_data = excluded.report_data,
        created_at = datetime('now')
    `).run(weekStart, JSON.stringify(reportData));

    // Log la génération du rapport
    db.prepare(`
      INSERT INTO evolution_log (cycle_date, action_type, details, auto_applied, status)
      VALUES (?, 'report_generated', ?, 1, 'applied')
    `).run(today, JSON.stringify({ weekStart, totalActions: logs.length }));

    console.log(`${LOG_PREFIX} Rapport généré pour semaine du ${weekStart}: ${logs.length} actions`);
    return reportData;
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur génération rapport:`, err.message);
    return null;
  }
}

module.exports = {
  // Difficulté
  calibrateDifficulty,
  getDifficulty,
  // Récompenses
  optimizeRewards,
  getRewardAmount,
  // Stratégies
  detectStrategyFatigue,
  switchStrategy,
  // Métriques prompts
  computePromptMetrics,
  recordPromptSession,
  // Évolution prompts
  generatePromptVariation,
  evaluateABTest,
  // Cycle
  runWeeklyCycle,
  generateEvolutionReport,
};
