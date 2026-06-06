-- Migration: rename players.se_id → players.profile_id
-- and add seasons.se_registration_id
--
-- Run this BEFORE `npm run db:push` to preserve existing se_id data.
-- db:push will then see the schema is already in sync and make no destructive changes.

ALTER TABLE players RENAME COLUMN se_id TO profile_id;

DROP INDEX IF EXISTS players_se_id_idx;
CREATE INDEX IF NOT EXISTS players_profile_id_idx ON players(profile_id);

ALTER TABLE seasons ADD COLUMN IF NOT EXISTS se_registration_id text;
