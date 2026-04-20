-- Migration to add level and semester columns to results table
-- Fixes: PGRST204 error - 'Could not find the level column of results in the schema cache'

-- Add level column (INTEGER for levels like 100, 200, 300, 400, 500)
ALTER TABLE results 
ADD COLUMN IF NOT EXISTS level INTEGER;

-- Add semester column (INTEGER for semesters 1 or 2)
ALTER TABLE results 
ADD COLUMN IF NOT EXISTS semester INTEGER;

-- Add comment to document the columns
COMMENT ON COLUMN results.level IS 'Student level at time of result (100, 200, 300, 400, 500)';
COMMENT ON COLUMN results.semester IS 'Semester number (1 or 2)';
