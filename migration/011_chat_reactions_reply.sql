-- Reactions and reply-to for chat, applied by hand via the Cloudflare D1
-- console (see migration/009_chat.sql and 010_chat_images.sql for the same
-- pattern - no local D1 credentials in this environment).

ALTER TABLE chat_messages ADD COLUMN reply_to_id INTEGER;

CREATE TABLE IF NOT EXISTS chat_reactions (
  message_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  emoji TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (message_id, email, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON chat_reactions(message_id);
