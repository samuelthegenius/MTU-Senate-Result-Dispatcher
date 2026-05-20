-- Migration to fix unique constraint on results table
-- Allows multiple results per student (for different levels/semesters)
-- Fixes: Only one result per student limitation

-- Step 1: Drop the existing unique constraint on student_id
-- This constraint only allowed one result per student
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'results_student_id_key' 
    AND conrelid = 'results'::regclass
  ) THEN
    ALTER TABLE results 
    DROP CONSTRAINT results_student_id_key;
  END IF;
END $$;

-- Also try to drop any other unique constraint on student_id if it exists with different name
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint 
  WHERE conname LIKE '%student_id%' 
  AND contype = 'u'
  AND conrelid = 'results'::regclass
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE results DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

-- Step 2: Add composite unique INDEX on (student_id, level, semester, result_type)
-- Uses a unique index instead of a constraint because COALESCE() expressions
-- are only supported in CREATE UNIQUE INDEX, not ADD CONSTRAINT UNIQUE.
-- This allows one result per student per level-semester-result_type combination.
-- A student can have both a 'regular' and 'supplementary' result for the same level/semester.
-- NULL semester values are treated as 0 for uniqueness purposes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'results_student_level_semester_type_key'
    AND tablename = 'results'
  ) THEN
    CREATE UNIQUE INDEX results_student_level_semester_type_key
    ON results (student_id, level, COALESCE(semester, 0), result_type);
  END IF;
END $$;

-- Add comment to document the index
COMMENT ON INDEX results_student_level_semester_type_key IS 
  'Allows multiple results per student (one per level-semester-result_type combination)';
