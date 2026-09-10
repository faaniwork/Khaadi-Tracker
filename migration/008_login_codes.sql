-- One-time codes for the email-only sign-in flow (see auth.js and
-- lib/db.js). This replaces Google OAuth for the board's own sign-in
-- entirely: nobody needs to be added as a Google "test user" or wait on
-- Google's app-verification review just to open the board. Anyone can type
-- their email, get a code, and sign in - they land as 'viewer' by default
-- (see getMyRole) until an admin changes their role from the Access page,
-- exactly as before.
--
-- A code is single-use and short-lived (10 minutes, see CODE_TTL_MS in
-- lib/db.js) and capped at a handful of wrong guesses before it is
-- invalidated outright. Expired/used rows are deleted as part of issuing or
-- checking the next one for that email, rather than needing a cron to sweep
-- them.
CREATE TABLE IF NOT EXISTS login_codes (
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_login_codes_email ON login_codes (email);
