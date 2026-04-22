-- Migration: Add session and cgpa columns to results table
-- Created: April 22, 2026

-- Add session column for academic session tracking (e.g., "2023/2024")
ALTER TABLE results ADD COLUMN IF NOT EXISTS session VARCHAR(20);

-- Add cgpa column for storing cumulative grade point average (e.g., 4.50)
ALTER TABLE results ADD COLUMN IF NOT EXISTS cgpa NUMERIC(3,2);

-- Drop old unique constraint and create new one including session
-- This allows students to have multiple results for same level/semester across different sessions
ALTER TABLE results DROP CONSTRAINT IF EXISTS results_student_id_level_semester_result_type_key;
ALTER TABLE results ADD CONSTRAINT results_student_id_level_semester_session_result_type_key 
  UNIQUE (student_id, level, semester, session, result_type);

-- Add indexes for better query performance on new columns
CREATE INDEX IF NOT EXISTS idx_results_session ON results(session);
CREATE INDEX IF NOT EXISTS idx_results_level_semester_session ON results(level, semester, session);

-- Add comment explaining the columns
COMMENT ON COLUMN results.session IS 'Academic session (e.g., 2023/2024, 2024/2025)';
COMMENT ON COLUMN results.cgpa IS 'Cumulative Grade Point Average (e.g., 4.50, 3.75)';
