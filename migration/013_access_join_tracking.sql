-- Two things Access could never do before: show someone who had only ever
-- signed in and been defaulted to 'viewer' (there was no row for them at
-- all - see the old getMyRole, which computed the fallback and never wrote
-- it down), and tell an admin that a new person had joined since they last
-- looked. Both need a real join timestamp, which access never had.
--
-- created_at defaults to 0 so every row that already exists (added by hand
-- by an admin, long before this migration) reads as "not new" rather than
-- suddenly flooding the badge with everyone who has ever been granted
-- access - only sign-ins from here on carry a real timestamp.
ALTER TABLE access ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;

-- One row per admin, remembering the last time THEY looked at the Access
-- page - not a single shared "last viewed" that one admin opening the page
-- would clear for every other admin too.
CREATE TABLE IF NOT EXISTS admin_meta (
  admin_email TEXT PRIMARY KEY,
  access_viewed_at INTEGER NOT NULL DEFAULT 0
);
