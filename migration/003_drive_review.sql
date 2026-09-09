-- Drive file browser + client review workflow.
--
-- Run this against an existing database. schema.sql declares the same two
-- tables, so a database built from scratch already has them.
--
-- A NOTE ON THE DESIGN, because it differs from the original plan.
--
-- The plan called for a `dress_files` table with one row per Drive file,
-- inserted on upload. That mirrors Drive into D1, and mirrors drift: the team
-- adds and removes files directly in Drive constantly, so anything added
-- outside the app would be invisible here, and anything deleted in Drive
-- would leave an orphan row that the UI still lists. Reconciling that needs a
-- sync job nobody asked for.
--
-- So Drive stays the single source of truth for WHICH FILES EXIST, and these
-- tables store only what Drive cannot: the review decision. Listing a folder
-- reads Drive and left-joins whatever review rows exist. A file with no row
-- is simply pending. Nothing to reconcile, and files added straight to Drive
-- show up and are reviewable with no extra step.

CREATE TABLE IF NOT EXISTS file_reviews (
  file_id TEXT PRIMARY KEY,                       -- Drive file id
  dress_id TEXT NOT NULL,                         -- dresses.id, itself a Drive folder id
  release TEXT NOT NULL DEFAULT '',               -- denormalised so a token can be scoped cheaply
  file_name TEXT NOT NULL DEFAULT '',             -- cached for readable activity entries
  review_status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  feedback_reason TEXT,                           -- accuracy | pose | other | NULL
  feedback_text TEXT,                             -- free text, required when reason = other
  reviewed_by TEXT NOT NULL DEFAULT '',
  reviewed_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_file_reviews_dress ON file_reviews(dress_id);
CREATE INDEX IF NOT EXISTS idx_file_reviews_release ON file_reviews(release);

-- One shareable review link per batch. The token is the whole credential, so
-- it is generated server-side from crypto.randomUUID-grade randomness and is
-- never derived from the release name.
CREATE TABLE IF NOT EXISTS review_links (
  token TEXT PRIMARY KEY,
  release TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',        -- e.g. "Khaadi merch team"
  created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  revoked_at INTEGER NOT NULL DEFAULT 0  -- 0 = live; non-zero = revoked, keeps the audit trail
);

CREATE INDEX IF NOT EXISTS idx_review_links_release ON review_links(release);
