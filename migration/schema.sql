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
  revisions INTEGER NOT NULL DEFAULT 1,   -- 1-9, see migration/002_add_revisions.sql
  archived INTEGER NOT NULL DEFAULT 0,    -- 1 = folder is no longer a dress; hidden but kept
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- Shared profile pictures, readable by everyone who can sign in. The avatar
-- is a client-resized data: URL a few kilobytes long, not a file reference.
-- See migration/005_profiles.sql for why.
CREATE TABLE IF NOT EXISTS profiles (
  email TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- When each batch was last reconciled against Drive.
CREATE TABLE IF NOT EXISTS release_sync (
  release TEXT PRIMARY KEY,
  synced_at INTEGER NOT NULL,
  synced_by TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT ''
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

-- Review state for Drive files. Drive itself stays the source of truth for
-- which files exist; this stores only the decision, keyed by Drive file id.
-- A file with no row here is pending. See migration/003_drive_review.sql for
-- why this is not a full mirror of Drive.
CREATE TABLE IF NOT EXISTS file_reviews (
  file_id TEXT PRIMARY KEY,                       -- Drive file id
  dress_id TEXT NOT NULL,                         -- dresses.id, itself a Drive folder id
  release TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  review_status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | feedback | rejected
  feedback_reason TEXT,                           -- accuracy | pose | other | NULL
  feedback_text TEXT,
  reviewed_by TEXT NOT NULL DEFAULT '',
  reviewed_at INTEGER NOT NULL DEFAULT 0
);

-- One shareable client review link per batch. The token is the credential.
-- Retired (see migration/006_file_comments.sql's sibling removal in the app
-- code) but left declared here so an old database's rows are not orphaned
-- and a fresh install's schema still matches.
CREATE TABLE IF NOT EXISTS review_links (
  token TEXT PRIMARY KEY,
  release TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  revoked_at INTEGER NOT NULL DEFAULT 0           -- 0 = live
);

-- The comment thread on a file, independent of its current review decision.
-- See migration/006_file_comments.sql for why this is a separate table
-- rather than another column on file_reviews.
CREATE TABLE IF NOT EXISTS file_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id TEXT NOT NULL,
  dress_id TEXT NOT NULL,
  release TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  by TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dresses_release ON dresses(release);
CREATE INDEX IF NOT EXISTS idx_dresses_collection ON dresses(collection);
CREATE INDEX IF NOT EXISTS idx_dresses_archived ON dresses(archived);
CREATE INDEX IF NOT EXISTS idx_log_scope ON log(scope);
CREATE INDEX IF NOT EXISTS idx_file_reviews_dress ON file_reviews(dress_id);
CREATE INDEX IF NOT EXISTS idx_file_reviews_release ON file_reviews(release);
CREATE INDEX IF NOT EXISTS idx_review_links_release ON review_links(release);
CREATE INDEX IF NOT EXISTS idx_file_comments_file ON file_comments(file_id);
