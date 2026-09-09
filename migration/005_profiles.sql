-- Shared profile pictures.
--
-- Run this against an existing database. schema.sql declares the same table,
-- so a database built from scratch already has it.
--
-- WHY THE IMAGE LIVES IN THE DATABASE
--
-- The avatar is stored as a data: URL, not a file in Drive or a bucket. The
-- browser resizes the picture to 160x160 and re-encodes it as JPEG before
-- sending, so what lands here is a few kilobytes of text. That buys a lot:
-- no storage bucket, no new Drive folder to create and share, no signed URLs
-- to expire, and no separate image route to authorise. The resize happens
-- client-side, which also means no image library is needed on the server.
--
-- The server still enforces the size cap, since a client can send anything.
--
-- Everyone who can sign in can READ every profile, which is the point: the
-- picture is meant to be seen by the team on the Activity trail. Writing is
-- restricted to your own row.

CREATE TABLE IF NOT EXISTS profiles (
  email TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',  -- lets Activity match a log entry's author to a face
  avatar TEXT NOT NULL DEFAULT '',        -- data: URL, client-resized, size-capped server-side
  updated_at INTEGER NOT NULL DEFAULT 0
);
