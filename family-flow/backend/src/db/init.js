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
];
for (const sql of migrations) {
  try { db.exec(sql); } catch {}
}

module.exports = db;
