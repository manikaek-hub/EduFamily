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
];
for (const sql of migrations) {
  try { db.exec(sql); } catch {}
}

module.exports = db;
