-- Comment thread on a reviewed file, separate from the single-shot
-- feedback_text on file_reviews.
--
-- file_reviews holds ONE decision per file (pending/approved/feedback/
-- rejected), overwritten each time someone changes their mind. That is
-- right for a decision, but wrong for a conversation: a client leaving a
-- note and a team member replying both need to survive, in order, each
-- attributed to whoever wrote it. This table is that thread, one row per
-- message, following the same shape as the existing per-batch `notes`
-- table rather than inventing a new pattern.
--
-- Run this against an existing database. schema.sql declares the same
-- table, so a database built from scratch already has it.

CREATE TABLE IF NOT EXISTS file_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id TEXT NOT NULL,
  dress_id TEXT NOT NULL,
  release TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  by TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_file_comments_file ON file_comments(file_id);
