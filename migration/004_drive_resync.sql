-- Lets the board follow changes made directly in Google Drive.
--
-- Run this against an existing database. schema.sql declares the same things,
-- so a database built from scratch already has them.
--
-- WHY `archived` RATHER THAN DELETING THE ROW
--
-- When a folder stops being a dress (renaming "Flat dress v2" to "Flats",
-- say, because it holds flats and not a dress), that batch should stop
-- counting it. Deleting the row would do that, and would also throw away its
-- status, comments, credit spend and revision count, with no way back if the
-- folder gets renamed again tomorrow. So the row is archived instead: hidden
-- from the board and out of every count, but intact.
--
-- Un-archiving is automatic. Rename the folder back and the next resync
-- clears the flag, history and all.

ALTER TABLE dresses ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_dresses_archived ON dresses(archived);

-- When each batch was last reconciled against Drive, so the UI can say how
-- fresh the numbers are instead of leaving people guessing.
CREATE TABLE IF NOT EXISTS release_sync (
  release TEXT PRIMARY KEY,
  synced_at INTEGER NOT NULL,
  synced_by TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT ''
);
