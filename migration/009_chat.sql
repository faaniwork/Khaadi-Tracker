-- A single board-wide chat channel, for the team and clients to talk in one
-- place instead of over email/WhatsApp - see lib/db.js's "team/client chat"
-- section and components/chat/chat-widget.jsx.
--
-- Not gated by the usual admin/editor/viewer/client roles: an admin or
-- editor always has it (they're "the team"), but a viewer or client only
-- gets in once an admin grants it explicitly via chat_access, so a random
-- person who merely has view access to the board cannot read or join a
-- conversation meant for the team and a specific client.
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_at ON chat_messages (at);

-- status is 'pending' (asked to join, not yet approved) or 'granted'. A row
-- existing at all means "has asked at least once" - there is no 'denied'
-- state, an admin simply never grants it and the row sits pending.
CREATE TABLE IF NOT EXISTS chat_access (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at INTEGER NOT NULL DEFAULT 0,
  granted_at INTEGER,
  granted_by TEXT
);
