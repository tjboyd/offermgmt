-- Add season_start_date to seasons
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS season_start_date DATE;

-- Create divisions table
CREATE TABLE IF NOT EXISTS divisions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id        UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  min_age_years    SMALLINT,
  max_age_years    SMALLINT,
  allowed_grades   TEXT[],
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS divisions_season_idx ON divisions(season_id);

-- Add division_id to teams
ALTER TABLE teams ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES divisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS teams_division_idx ON teams(division_id);
