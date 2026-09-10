-- Lets a chat message carry one image, uploaded straight to Drive through
-- the same shared uploader account everything else uses (see
-- lib/googleUserToken.js) into a "Chat uploads" folder next to the shoot's
-- own Output folder.
ALTER TABLE chat_messages ADD COLUMN image_id TEXT;
ALTER TABLE chat_messages ADD COLUMN image_name TEXT;
