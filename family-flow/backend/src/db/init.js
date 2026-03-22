const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'familyflow.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
db.exec(schema);

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
];
for (const sql of migrations) {
  try { db.exec(sql); } catch {}
}

module.exports = db;
