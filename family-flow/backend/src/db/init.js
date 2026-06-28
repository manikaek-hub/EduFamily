const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { DATA_DIR } = require('../config/paths');

const DB_PATH = path.join(DATA_DIR, 'familyflow.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
db.exec(schema);

// ─── Tables additionnelles (présentes en local mais hors schema.sql) ───
// Indispensable pour qu'une base NEUVE (ex: hébergement en ligne) ait tout.
// Idempotent : IF NOT EXISTS ne touche pas une base déjà complète.
const extraTables = [
  `CREATE TABLE IF NOT EXISTS ed_double_auth (
    username TEXT PRIMARY KEY,
    cn TEXT NOT NULL,
    cv TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS ed_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    student_id TEXT,
    student_name TEXT,
    student_class TEXT,
    connected INTEGER DEFAULT 0,
    last_sync TEXT,
    UNIQUE(username, student_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ed_sessions_persistent (
    username TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    login_time INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    student_accounts_json TEXT,
    is_parent INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS kb_textbooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES members(id),
    subject TEXT NOT NULL,
    title TEXT NOT NULL,
    publisher TEXT,
    isbn TEXT,
    chapters TEXT,
    digital_url TEXT,
    UNIQUE(member_id, subject, isbn)
  )`,
  // Recherche plein-texte des documents (FTS5). Les tables _data/_idx/etc.
  // sont créées automatiquement par SQLite.
  `CREATE VIRTUAL TABLE IF NOT EXISTS kb_documents_fts USING fts5(
    raw_text, title, topics, key_concepts, subject,
    content='kb_documents',
    content_rowid='id'
  )`,
];
for (const sql of extraTables) {
  try { db.exec(sql); } catch (e) { console.error('[DB] extra table:', e.message); }
}

// Migrations: add columns to existing tables (safe, idempotent)
const migrations = [
  "ALTER TABLE kb_topics ADD COLUMN next_review_date TEXT",
  "ALTER TABLE kb_topics ADD COLUMN review_interval INTEGER DEFAULT 1",
  "ALTER TABLE kb_topics ADD COLUMN review_count INTEGER DEFAULT 0",
  "ALTER TABLE kb_topics ADD COLUMN last_reviewed_at TEXT",
  `CREATE TABLE IF NOT EXISTS kb_grades (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    subject     TEXT NOT NULL,
    student_avg REAL,
    class_avg   REAL,
    period      TEXT,
    synced_at   TEXT DEFAULT (datetime('now')),
    UNIQUE(member_id, subject, period)
  )`,
  // --- Agent 1: Collecteur de Données d'Entraînement ---
  `CREATE TABLE IF NOT EXISTS training_data (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id       INTEGER REFERENCES homework_sessions(id),
    member_id        INTEGER NOT NULL REFERENCES members(id),
    turn_index       INTEGER NOT NULL,
    foxie_message    TEXT NOT NULL,
    child_message    TEXT,
    label            TEXT CHECK(label IN ('correct','partial','incorrect','hors_sujet','abandon')),
    error_type       TEXT,
    response_time_ms INTEGER,
    attempt_number   INTEGER DEFAULT 1,
    foxie_strategy   TEXT,
    strategy_effective INTEGER,
    concept_id       TEXT,
    subject          TEXT,
    created_at       TEXT DEFAULT (datetime('now'))
  )`,
  // --- Agent 2: Planifieur Adaptatif (graphe de maîtrise) ---
  `CREATE TABLE IF NOT EXISTS mastery_graph (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    concept_id  TEXT NOT NULL,
    subject     TEXT NOT NULL,
    score       REAL DEFAULT 0 CHECK(score BETWEEN 0 AND 5),
    attempts    INTEGER DEFAULT 0,
    last_seen   TEXT,
    next_review TEXT,
    UNIQUE(member_id, concept_id)
  )`,
  // --- Agent 5: Engagement & Motivation ---
  `CREATE TABLE IF NOT EXISTS engagement_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    session_id  INTEGER REFERENCES homework_sessions(id),
    score       REAL DEFAULT 100,
    signals     TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  )`,
  // --- Agent 6: Style d'apprentissage ---
  `CREATE TABLE IF NOT EXISTS learning_style_profile (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id       INTEGER NOT NULL REFERENCES members(id),
    subject         TEXT NOT NULL,
    preferred_style TEXT CHECK(preferred_style IN ('analogie_concrete','visuel_schema','textuel_structure','exploratoire_defi')),
    confidence      REAL DEFAULT 0,
    updated_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(member_id, subject)
  )`,
  // --- Agent 7: Coach Parent (bilans) ---
  `CREATE TABLE IF NOT EXISTS parent_reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    report_data TEXT NOT NULL,
    week_start  TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  )`,
  // --- MVP: mémoire pédagogique actionnable ---
  `CREATE TABLE IF NOT EXISTS learning_observations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    session_id  INTEGER REFERENCES homework_sessions(id),
    subject     TEXT,
    concept_id  TEXT,
    status      TEXT CHECK(status IN ('strength','partial','difficulty','engagement','unknown')) DEFAULT 'unknown',
    summary     TEXT NOT NULL,
    evidence    TEXT,
    next_action TEXT,
    confidence  REAL DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  )`,
  // === BOUCLE D'AMELIORATION CONTINUE ===

  // Feedback terrain : ce que remontent les enfants après chaque exercice
  `CREATE TABLE IF NOT EXISTS feedback (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    session_id  INTEGER REFERENCES homework_sessions(id),
    type        TEXT NOT NULL CHECK(type IN ('difficulty','bug','idea','emotion','content')),
    rating      INTEGER CHECK(rating BETWEEN 1 AND 5),
    comment     TEXT,
    context     TEXT,
    subject     TEXT,
    topic       TEXT,
    processed   INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  )`,

  // Propositions d'amélioration générées par l'agent IA
  `CREATE TABLE IF NOT EXISTS improvement_proposals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    category    TEXT NOT NULL CHECK(category IN ('content','difficulty','ux','engagement','new_feature','bug_fix')),
    priority    TEXT NOT NULL CHECK(priority IN ('critical','high','medium','low')),
    evidence    TEXT NOT NULL,
    affected_members TEXT,
    affected_subject TEXT,
    proposed_action TEXT NOT NULL,
    status      TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','deployed')),
    feedback_ids TEXT,
    creator_note TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    decided_at  TEXT,
    deployed_at TEXT
  )`,

  // Récompenses pour les enfants qui donnent du feedback utile
  `CREATE TABLE IF NOT EXISTS feedback_rewards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    feedback_id INTEGER REFERENCES feedback(id),
    reward_type TEXT NOT NULL CHECK(reward_type IN ('foxie_star','badge','credit','title')),
    reward_value TEXT NOT NULL,
    reason      TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  )`,

  // --- Photo KB: documents scannés ---
  `CREATE TABLE IF NOT EXISTS kb_documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    doc_type    TEXT NOT NULL CHECK(doc_type IN ('cours','exercice','controle','devoir','fiche','autre')),
    subject     TEXT NOT NULL,
    title       TEXT,
    topics      TEXT,
    key_concepts TEXT,
    raw_text    TEXT,
    grade       TEXT,
    grade_comments TEXT,
    exercises   TEXT,
    photo_path  TEXT,
    doc_date    TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  )`,
  // FTS5 virtual table for full-text search on documents
  `CREATE VIRTUAL TABLE IF NOT EXISTS kb_documents_fts USING fts5(
    raw_text, title, topics, key_concepts, subject,
    content='kb_documents',
    content_rowid='id'
  )`,

  // --- Fiches de révision & cartes mentales ---
  `CREATE TABLE IF NOT EXISTS kb_fiches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    subject     TEXT NOT NULL,
    chapter     TEXT,
    title       TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'fiche' CHECK(type IN ('fiche','carte_mentale','flashcards')),
    content     TEXT NOT NULL,
    tags        TEXT,
    source      TEXT DEFAULT 'manual',
    starred     INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  )`,

  // --- Découvertes en famille ---
  `CREATE TABLE IF NOT EXISTS kb_discoveries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category    TEXT NOT NULL CHECK(category IN ('theatre','film','expo','livre','activite')),
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    why_relevant TEXT NOT NULL,
    children_concerned TEXT,
    subjects_linked TEXT,
    discussion_questions TEXT,
    search_url  TEXT,
    saved       INTEGER DEFAULT 0,
    done        INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  )`,

  // --- Vocabulaire structuré extrait des documents ---
  `CREATE TABLE IF NOT EXISTS kb_vocabulary (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    document_id INTEGER REFERENCES kb_documents(id),
    word        TEXT NOT NULL,
    subject     TEXT NOT NULL,
    category    TEXT CHECK(category IN ('mot','regle','formule','definition','concept')),
    context     TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(member_id, word, subject)
  )`,

  // --- Dictées adaptatives ---
  `CREATE TABLE IF NOT EXISTS dictation_sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    level       TEXT NOT NULL,
    theme       TEXT,
    source      TEXT DEFAULT 'ai',
    score       REAL,
    total_words INTEGER,
    errors_count INTEGER,
    created_at  TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS dictation_errors (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES dictation_sessions(id),
    word_expected TEXT NOT NULL,
    word_written  TEXT NOT NULL,
    error_category TEXT CHECK(error_category IN ('accent','accord','conjugaison','double_consonne','homophone','orthographe','ponctuation','autre')),
    mastered    INTEGER DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    next_review TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  )`,

  // Stats agrégées pour le dashboard créateur
  `CREATE TABLE IF NOT EXISTS feedback_stats (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    period      TEXT NOT NULL,
    total_feedback INTEGER DEFAULT 0,
    avg_difficulty_rating REAL,
    top_issues  TEXT,
    top_subjects TEXT,
    engagement_trend TEXT,
    proposals_generated INTEGER DEFAULT 0,
    proposals_approved INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now'))
  )`,

  // --- Gamification: Coins & Shop ---
  `CREATE TABLE IF NOT EXISTS coins_balance (
    member_id   INTEGER PRIMARY KEY REFERENCES members(id),
    coins       INTEGER DEFAULT 0,
    total_earned INTEGER DEFAULT 0,
    updated_at  TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS coins_transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    amount      INTEGER NOT NULL,
    reason      TEXT NOT NULL,
    source      TEXT NOT NULL CHECK(source IN ('homework','quiz','dictation','routine','feedback','bonus','purchase')),
    ref_id      INTEGER,
    created_at  TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS shop_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    emoji       TEXT NOT NULL,
    category    TEXT NOT NULL CHECK(category IN ('accessoire','vehicule','maison','tech','animal','special')),
    price       INTEGER NOT NULL,
    description TEXT,
    rarity      TEXT DEFAULT 'common' CHECK(rarity IN ('common','rare','epic','legendary')),
    sort_order  INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS owned_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    item_id     INTEGER NOT NULL REFERENCES shop_items(id),
    equipped    INTEGER DEFAULT 0,
    purchased_at TEXT DEFAULT (datetime('now')),
    UNIQUE(member_id, item_id)
  )`,

  // Ensure unique shop item names (for INSERT OR IGNORE to work)
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_items_name ON shop_items(name)`,

  // === MOTEUR D'AUTO-AMELIORATION (Self-Improving Engine) ===

  // Versions de prompts avec historique et A/B testing
  `CREATE TABLE IF NOT EXISTS prompt_versions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_type    TEXT NOT NULL CHECK(prompt_type IN ('homework','quiz','dictation','chapter_quiz','mock_oral','revision')),
    version        INTEGER NOT NULL DEFAULT 1,
    content        TEXT NOT NULL,
    variables      TEXT,
    status         TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','testing','retired')),
    parent_version INTEGER REFERENCES prompt_versions(id),
    created_at     TEXT DEFAULT (datetime('now')),
    activated_at   TEXT,
    retired_at     TEXT,
    UNIQUE(prompt_type, version)
  )`,

  // Sessions liées à une version de prompt
  `CREATE TABLE IF NOT EXISTS prompt_sessions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_version_id INTEGER NOT NULL REFERENCES prompt_versions(id),
    member_id        INTEGER NOT NULL REFERENCES members(id),
    session_id       INTEGER,
    session_type     TEXT NOT NULL CHECK(session_type IN ('homework','quiz','dictation','chapter_quiz','revision')),
    created_at       TEXT DEFAULT (datetime('now'))
  )`,

  // Métriques agrégées par version de prompt
  `CREATE TABLE IF NOT EXISTS prompt_metrics (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_version_id INTEGER NOT NULL REFERENCES prompt_versions(id),
    period_start      TEXT NOT NULL,
    period_end        TEXT NOT NULL,
    total_sessions    INTEGER DEFAULT 0,
    avg_engagement    REAL,
    correct_ratio     REAL,
    avg_session_duration_ms INTEGER,
    avg_feedback_rating REAL,
    computed_at       TEXT DEFAULT (datetime('now')),
    UNIQUE(prompt_version_id, period_start)
  )`,

  // Calibrage de difficulté par enfant et contexte
  `CREATE TABLE IF NOT EXISTS difficulty_calibration (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    context     TEXT NOT NULL CHECK(context IN ('quiz','dictation','progress_plan')),
    subject     TEXT,
    difficulty  TEXT NOT NULL DEFAULT 'moyen' CHECK(difficulty IN ('facile','moyen','difficile')),
    success_rate REAL,
    sample_size INTEGER DEFAULT 0,
    updated_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(member_id, context, subject)
  )`,

  // Calibrage des récompenses par enfant et source
  `CREATE TABLE IF NOT EXISTS reward_calibration (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    source      TEXT NOT NULL CHECK(source IN ('homework','quiz','dictation','routine','feedback','progress')),
    base_amount INTEGER NOT NULL DEFAULT 5,
    current_amount INTEGER NOT NULL DEFAULT 5,
    min_amount  INTEGER NOT NULL DEFAULT 1,
    max_amount  INTEGER NOT NULL DEFAULT 30,
    last_engagement_avg REAL,
    updated_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(member_id, source)
  )`,

  // Journal des actions d'évolution
  `CREATE TABLE IF NOT EXISTS evolution_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_date    TEXT NOT NULL,
    action_type   TEXT NOT NULL CHECK(action_type IN ('prompt_variation','prompt_promote','difficulty_adjust','strategy_switch','reward_adjust','report_generated')),
    target_member INTEGER REFERENCES members(id),
    details       TEXT NOT NULL,
    auto_applied  INTEGER DEFAULT 0,
    status        TEXT DEFAULT 'applied' CHECK(status IN ('applied','pending_approval','rejected')),
    created_at    TEXT DEFAULT (datetime('now'))
  )`,

  // Rapports hebdomadaires d'évolution
  `CREATE TABLE IF NOT EXISTS evolution_reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start  TEXT NOT NULL,
    report_data TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(week_start)
  )`,

  // --- Plan de Progrès ---
  `CREATE TABLE IF NOT EXISTS progress_plans (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id      INTEGER NOT NULL REFERENCES members(id),
    week_start     TEXT NOT NULL,
    week_end       TEXT NOT NULL,
    status         TEXT DEFAULT 'active' CHECK(status IN ('active','completed','superseded')),
    diagnosis_data TEXT NOT NULL,
    plan_data      TEXT NOT NULL,
    completion_pct REAL DEFAULT 0,
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now')),
    UNIQUE(member_id, week_start)
  )`,
  `CREATE TABLE IF NOT EXISTS progress_objectives (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id        INTEGER NOT NULL REFERENCES progress_plans(id) ON DELETE CASCADE,
    subject        TEXT NOT NULL,
    topic          TEXT NOT NULL,
    description    TEXT NOT NULL,
    priority       TEXT NOT NULL CHECK(priority IN ('haute','moyenne','basse')),
    target_mastery REAL DEFAULT 3.0,
    current_mastery REAL DEFAULT 0,
    status         TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','skipped')),
    sort_order     INTEGER DEFAULT 0,
    created_at     TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS progress_exercises (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    objective_id   INTEGER NOT NULL REFERENCES progress_objectives(id) ON DELETE CASCADE,
    exercise_type  TEXT NOT NULL CHECK(exercise_type IN ('qcm','fill_blank','short_answer','dictation_drill','calculation','true_false')),
    difficulty     TEXT NOT NULL CHECK(difficulty IN ('facile','moyen','difficile')),
    question       TEXT NOT NULL,
    choices        TEXT,
    correct_answer TEXT NOT NULL,
    explanation    TEXT,
    hint           TEXT,
    sort_order     INTEGER DEFAULT 0,
    created_at     TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS progress_attempts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id    INTEGER NOT NULL REFERENCES progress_exercises(id) ON DELETE CASCADE,
    member_id      INTEGER NOT NULL REFERENCES members(id),
    answer         TEXT NOT NULL,
    is_correct     INTEGER NOT NULL,
    time_spent_ms  INTEGER,
    coins_earned   INTEGER DEFAULT 0,
    created_at     TEXT DEFAULT (datetime('now'))
  )`,

  // --- Notifications ---
  `CREATE TABLE IF NOT EXISTS notification_preferences (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL REFERENCES members(id),
    enabled     INTEGER DEFAULT 1,
    homework_reminder INTEGER DEFAULT 1,
    routine_reminder INTEGER DEFAULT 1,
    quiz_reminder INTEGER DEFAULT 1,
    plan_reminder INTEGER DEFAULT 1,
    photo_reminder INTEGER DEFAULT 1,
    quiet_start TEXT DEFAULT '21:00',
    quiet_end   TEXT DEFAULT '07:00',
    updated_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(member_id)
  )`,
  `CREATE TABLE IF NOT EXISTS notification_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT,
    shown_at    TEXT DEFAULT (datetime('now'))
  )`,

  // --- Subject normalization migration ---
  // This is run via JS below (not pure SQL) — see normalizeSubjectsMigration
  '__NORMALIZE_SUBJECTS__',
];

// --- Subject normalization migration (JS-based, not pure SQL) ---
const SUBJECT_NORMALIZATION_MAP = {
  'MATHEMATIQUES': 'Maths',
  'MATHÉMATIQUES': 'Maths',
  'MATHS': 'Maths',
  'FRANCAIS': 'Français',
  'FRANÇAIS': 'Français',
  'HISTOIRE-GEOGRAPHIE': 'Histoire-Géo',
  'HISTOIRE-GÉOGRAPHIE': 'Histoire-Géo',
  'HIST-GEO': 'Histoire-Géo',
  'HIST. & GEO.': 'Histoire-Géo',
  'HIST. & GÉO.': 'Histoire-Géo',
  'HISTOIRE-GEO': 'Histoire-Géo',
  'ANGLAIS LV1': 'Anglais',
  'ANGLAIS': 'Anglais',
  'ESPAGNOL LV2': 'Espagnol',
  'ESPAGNOL': 'Espagnol',
  'PHYSIQUE-CHIMIE': 'Physique-Chimie',
  'PHYSIQUE CHIMIE': 'Physique-Chimie',
  'SC. VIE & TERRE': 'SVT',
  'SCIENCES DE LA VIE ET DE LA TERRE': 'SVT',
  'SVT': 'SVT',
  'TECHNOLOGIE': 'Technologie',
  'ED. MUSICALE': 'Éducation musicale',
  'ÉD. MUSICALE': 'Éducation musicale',
  'EDUCATION MUSICALE': 'Éducation musicale',
  'ARTS PLAST.': 'Arts plastiques',
  'ARTS PLASTIQUES': 'Arts plastiques',
  'ED.PHYSIQUE & SPORT.': 'EPS',
  'ÉD.PHYSIQUE & SPORT.': 'EPS',
  'EPS': 'EPS',
};

const SUBJECT_TABLES = [
  'kb_topics', 'kb_homework', 'kb_documents', 'kb_fiches',
  'kb_grades', 'kb_timetable', 'kb_vocabulary', 'kb_subjects',
  'homework_sessions', 'homework_progress',
  'training_data', 'mastery_graph', 'feedback', 'learning_style_profile',
];

function normalizeSubjectsMigration() {
  // Check if migration already ran (idempotent marker)
  try {
    const marker = db.prepare("SELECT 1 FROM kb_sync_log WHERE sync_type = 'subject_normalization' LIMIT 1").get();
    if (marker) return; // already done
  } catch { /* table might not exist yet, skip */ return; }

  for (const table of SUBJECT_TABLES) {
    try {
      for (const [raw, normalized] of Object.entries(SUBJECT_NORMALIZATION_MAP)) {
        db.prepare(`UPDATE ${table} SET subject = ? WHERE UPPER(subject) = UPPER(?) AND subject != ?`).run(normalized, raw, normalized);
      }
    } catch { /* table might not exist, skip */ }
  }

  try {
    db.prepare("INSERT INTO kb_sync_log (member_id, sync_type, items_count) VALUES (0, 'subject_normalization', 1)").run();
  } catch {}
}

for (const sql of migrations) {
  if (sql === '__NORMALIZE_SUBJECTS__') {
    normalizeSubjectsMigration();
    continue;
  }
  try { db.exec(sql); } catch {}
}

module.exports = db;
