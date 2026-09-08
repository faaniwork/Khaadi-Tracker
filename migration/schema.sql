-- Khaadi Production Tracker — Cloudflare D1 schema
-- Mirrors the old Tracker/Costs/Notes/Access/Log Google Sheet tabs.

CREATE TABLE IF NOT EXISTS dresses (
  id TEXT PRIMARY KEY,           -- Google Drive folder id (stable row identity)
  release TEXT NOT NULL,
  collection TEXT NOT NULL,
  dress TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Not Started',
  files INTEGER,
  comments TEXT NOT NULL DEFAULT '',
  credits INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS costs (
  scope TEXT NOT NULL,           -- 'release' | 'collection'
  key TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, key)
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  release TEXT NOT NULL,
  text TEXT NOT NULL,
  by TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS access (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'viewer',   -- 'admin' | 'editor' | 'viewer'
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,            -- epoch millis
  by TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT
);

CREATE INDEX IF NOT EXISTS idx_dresses_release ON dresses(release);
CREATE INDEX IF NOT EXISTS idx_dresses_collection ON dresses(collection);
CREATE INDEX IF NOT EXISTS idx_log_scope ON log(scope);
