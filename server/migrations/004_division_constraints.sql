ALTER TABLE divisions
  ADD COLUMN IF NOT EXISTS age_constraint TEXT NOT NULL DEFAULT 'max_only'
    CHECK (age_constraint IN ('max_only', 'range')),
  ADD COLUMN IF NOT EXISTS grade_constraint TEXT NOT NULL DEFAULT 'exact'
    CHECK (grade_constraint IN ('exact', 'not_exceed'));
