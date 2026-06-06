-- Add eligibility_mode to divisions
ALTER TABLE divisions
  ADD COLUMN IF NOT EXISTS eligibility_mode TEXT NOT NULL DEFAULT 'age'
    CHECK (eligibility_mode IN ('age', 'grade', 'either'));
