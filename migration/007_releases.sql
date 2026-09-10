-- Batches created from inside the app, rather than hardcoded in
-- lib/constants.js.
--
-- RELEASE_LINKS maps a batch name to its Drive folder, but it is a constant
-- in the source, so a batch someone creates on the board could never be added
-- to it without a deploy. This table is where those live instead; every
-- lookup checks it first and falls back to the constant, so the five batches
-- that predate it keep working untouched.
--
-- release_date is the real date the batch is for, kept because the ordering
-- used everywhere else is parsed out of the NAME as month*100+day and so has
-- no year in it — fine until a January batch has to sort after a December
-- one. Stored ISO (yyyy-mm-dd) so it sorts as a string.
CREATE TABLE IF NOT EXISTS releases (
  release TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  release_date TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
