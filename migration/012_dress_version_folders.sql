-- Tracks a dress's later reshoot rounds that already live as separate
-- sibling "V2"/"V3" folders in Drive (one level up, alongside the dress
-- folders themselves) - discovered during resync, since the board only
-- ever tracked the first, complete cut (see resyncRelease in
-- lib/driveSync.js) and had no memory of the others at all. Applied by
-- hand via the Cloudflare D1 console, same as every other migration this
-- phase - no local D1 credentials in this environment.

CREATE TABLE IF NOT EXISTS dress_version_folders (
  dress_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  folder_id TEXT NOT NULL,
  folder_name TEXT,
  web_view_link TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (dress_id, version)
);
