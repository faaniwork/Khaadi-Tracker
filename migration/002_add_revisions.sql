-- Adds the `revisions` column that the dress table's 1-9 stepper writes to.
--
-- This is required, not optional: getBoardData() in lib/db.js selects
-- `revisions` by name, so on a database without the column every board read
-- fails and the app shows nothing.
--
-- schema.sql now declares the column inline, so a database created from
-- scratch already has it and does NOT need this file. Run this only against a
-- database that was created before the column existed.
--
-- Safe to attempt twice: D1 answers "duplicate column name: revisions" and
-- changes nothing, which is the confirmation that the column is already there.
--
-- To check first, without changing anything:
--   SELECT revisions FROM dresses LIMIT 1;
-- An error naming `revisions` means the column is missing; run the ALTER below.

ALTER TABLE dresses ADD COLUMN revisions INTEGER NOT NULL DEFAULT 1;
