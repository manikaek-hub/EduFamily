-- Family members (children + parents)
CREATE TABLE IF NOT EXISTS members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK(role IN ('child','parent')),
  grade       TEXT,
  age         INTEGER,
  avatar_color TEXT DEFAULT '#7C9082',
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Homework chat sessions
CREATE TABLE IF NOT EXISTS homework_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  subject     TEXT NOT NULL,
  topic       TEXT,
  started_at  TEXT DEFAULT (datetime('now')),
  ended_at    TEXT
);

-- Chat messages within a session
CREATE TABLE IF NOT EXISTS homework_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES homework_sessions(id),
  role        TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content     TEXT NOT NULL,
  has_image   INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Progress tracking per child per subject
CREATE TABLE IF NOT EXISTS homework_progress (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id           INTEGER NOT NULL REFERENCES members(id),
  subject             TEXT NOT NULL,
  topic               TEXT NOT NULL,
  understanding_level INTEGER DEFAULT 0 CHECK(understanding_level BETWEEN 0 AND 5),
  session_count       INTEGER DEFAULT 1,
  last_practiced      TEXT DEFAULT (datetime('now')),
  UNIQUE(member_id, subject, topic)
);

-- Calendar activities
CREATE TABLE IF NOT EXISTS activities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL CHECK(category IN ('school','sports','music','family','medical','other')),
  start_time  TEXT NOT NULL,
  end_time    TEXT,
  all_day     INTEGER DEFAULT 0,
  recurrence  TEXT,
  created_by  INTEGER REFERENCES members(id),
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Activity-member association
CREATE TABLE IF NOT EXISTS activity_members (
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  PRIMARY KEY (activity_id, member_id)
);

-- News board posts
CREATE TABLE IF NOT EXISTS posts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  content     TEXT NOT NULL,
  post_type   TEXT DEFAULT 'update' CHECK(post_type IN ('update','achievement','announcement','highlight')),
  image_data  TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Post reactions
CREATE TABLE IF NOT EXISTS post_reactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  emoji       TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(post_id, member_id, emoji)
);

-- Quiz sessions
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  date          TEXT NOT NULL DEFAULT (date('now')),
  generated_at  TEXT DEFAULT (datetime('now'))
);

-- Quiz questions
CREATE TABLE IF NOT EXISTS quiz_questions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_session_id INTEGER NOT NULL REFERENCES quiz_sessions(id),
  target_member   INTEGER REFERENCES members(id),
  question_text   TEXT NOT NULL,
  choices         TEXT,
  correct_answer  INTEGER,
  difficulty      TEXT CHECK(difficulty IN ('easy','medium','hard')),
  subject         TEXT,
  explanation     TEXT
);

-- Quiz answers
CREATE TABLE IF NOT EXISTS quiz_answers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES quiz_questions(id),
  member_id   INTEGER NOT NULL REFERENCES members(id),
  answer      INTEGER,
  is_correct  INTEGER,
  answered_at TEXT DEFAULT (datetime('now'))
);

-- Quiz streaks
CREATE TABLE IF NOT EXISTS quiz_streaks (
  member_id       INTEGER PRIMARY KEY REFERENCES members(id),
  current_streak  INTEGER DEFAULT 0,
  best_streak     INTEGER DEFAULT 0,
  last_played     TEXT
);

-- Knowledge Base: school subjects being studied
CREATE TABLE IF NOT EXISTS kb_subjects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  subject     TEXT NOT NULL,
  code        TEXT,
  teacher     TEXT,
  synced_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(member_id, subject)
);

-- Knowledge Base: topics/chapters per subject
CREATE TABLE IF NOT EXISTS kb_topics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  subject     TEXT NOT NULL,
  topic       TEXT NOT NULL,
  description TEXT,
  source      TEXT DEFAULT 'ecoledirecte' CHECK(source IN ('ecoledirecte','manual','foxie')),
  date_seen   TEXT,
  mastery     INTEGER DEFAULT 0 CHECK(mastery BETWEEN 0 AND 5),
  synced_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(member_id, subject, topic)
);

-- Knowledge Base: homework items synced from EcoleDirecte
CREATE TABLE IF NOT EXISTS kb_homework (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  subject     TEXT NOT NULL,
  description TEXT NOT NULL,
  due_date    TEXT NOT NULL,
  done        INTEGER DEFAULT 0,
  synced_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(member_id, subject, due_date, description)
);

-- Knowledge Base: timetable slots synced from EcoleDirecte
CREATE TABLE IF NOT EXISTS kb_timetable (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  subject     TEXT NOT NULL,
  teacher     TEXT,
  room        TEXT,
  day_of_week INTEGER NOT NULL,
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  synced_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(member_id, subject, day_of_week, start_time)
);

-- Knowledge Base: sync log
CREATE TABLE IF NOT EXISTS kb_sync_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER,
  sync_type   TEXT NOT NULL,
  items_count INTEGER DEFAULT 0,
  synced_at   TEXT DEFAULT (datetime('now'))
);

-- Revision plans generated by Claude
CREATE TABLE IF NOT EXISTS revision_plans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  plan_data   TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  valid_until TEXT
);

-- Revision progress tracking
CREATE TABLE IF NOT EXISTS revision_progress (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id     INTEGER NOT NULL REFERENCES revision_plans(id) ON DELETE CASCADE,
  day_index   INTEGER NOT NULL,
  item_index  INTEGER NOT NULL,
  done        INTEGER DEFAULT 0,
  done_at     TEXT,
  UNIQUE(plan_id, day_index, item_index)
);

-- Mind maps for annual bilan (stored as JSON)
CREATE TABLE IF NOT EXISTS kb_mindmaps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  subject     TEXT NOT NULL,
  topic       TEXT NOT NULL,
  map_data    TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- Flashcards extracted from course photos (or created manually)
CREATE TABLE IF NOT EXISTS kb_flashcards (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id       INTEGER NOT NULL REFERENCES members(id),
  subject         TEXT,
  topic           TEXT,
  front           TEXT NOT NULL,
  back            TEXT NOT NULL,
  source          TEXT DEFAULT 'photo',
  next_review     TEXT,
  review_interval INTEGER DEFAULT 1,
  review_count    INTEGER DEFAULT 0,
  mastery         INTEGER DEFAULT 0 CHECK(mastery BETWEEN 0 AND 5),
  created_at      TEXT DEFAULT (datetime('now'))
);

-- Chapter (quick 5-question) quiz results
CREATE TABLE IF NOT EXISTS chapter_quiz_results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  subject     TEXT NOT NULL,
  topic       TEXT NOT NULL,
  score       INTEGER DEFAULT 0,
  total       INTEGER DEFAULT 5,
  taken_at    TEXT DEFAULT (datetime('now'))
);

-- XP events log
CREATE TABLE IF NOT EXISTS xp_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  event_type  TEXT NOT NULL,
  points      INTEGER NOT NULL,
  description TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- XP totals per member
CREATE TABLE IF NOT EXISTS xp_totals (
  member_id   INTEGER PRIMARY KEY REFERENCES members(id),
  total_xp    INTEGER DEFAULT 0,
  level       INTEGER DEFAULT 1,
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- Learning events timeline (auto-logged from all interactions)
CREATE TABLE IF NOT EXISTS kb_learning_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id),
  event_type  TEXT NOT NULL CHECK(event_type IN (
    'course_photo','eval_photo','foxie_session','quiz_correct','quiz_wrong',
    'chapter_quiz','topic_added','routine_done','homework_done'
  )),
  subject     TEXT,
  topic       TEXT,
  score       INTEGER,
  notes       TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);
