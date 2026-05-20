-- ============================================================
-- Fix: Align results table unique constraint for upsert support
-- ============================================================
-- Problem: The onConflict upsert uses (student_id, level, semester, result_type)
-- but the original schema.sql had a 5-column UNIQUE constraint that included 'session'.
-- A UNIQUE CONSTRAINT on an expression (COALESCE) cannot be named in PostgREST's
-- onConflict parameter — only plain-column constraints/indexes work.
--
-- Solution: Drop all existing unique constraints/indexes on results that cover
-- student_id, then create a single plain-column unique index on
-- (student_id, level, semester, result_type) with NULLs treated distinctly.
-- This matches the onConflict columns in Dashboard.tsx.
-- ============================================================

-- Step 1: Drop the original 5-column UNIQUE constraint from schema.sql (if present)
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'results'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 5
  LIMIT 1;

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE results DROP CONSTRAINT %I', cname);
    RAISE NOTICE 'Dropped 5-column constraint: %', cname;
  END IF;
END $$;

-- Step 2: Drop any remaining unique constraints on results (student_id based)
DO $$
DECLARE
  cname TEXT;
BEGIN
  FOR cname IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'results'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE results DROP CONSTRAINT %I', cname);
    RAISE NOTICE 'Dropped constraint: %', cname;
  END LOOP;
END $$;

-- Step 3: Drop any existing unique indexes on results (including the COALESCE one)
DO $$
DECLARE
  iname TEXT;
BEGIN
  FOR iname IN
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'results'
      AND indexname NOT LIKE '%pkey%'
      AND indexdef LIKE '%UNIQUE%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', iname);
    RAISE NOTICE 'Dropped unique index: %', iname;
  END LOOP;
END $$;

-- Step 4: Create a plain-column unique index on (student_id, level, semester, result_type)
-- Plain columns (no expressions) means PostgREST can use it for onConflict resolution.
-- NULL values in level/semester each count as distinct for uniqueness (PostgreSQL default).
-- To treat all NULLs as the same bucket, we use NULLS NOT DISTINCT (PostgreSQL 15+).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'results_student_level_semester_type_unique'
      AND tablename = 'results'
  ) THEN
    -- Try PostgreSQL 15+ NULLS NOT DISTINCT first
    BEGIN
      EXECUTE '
        CREATE UNIQUE INDEX results_student_level_semester_type_unique
        ON results (student_id, level, semester, result_type)
        NULLS NOT DISTINCT
      ';
      RAISE NOTICE 'Created unique index with NULLS NOT DISTINCT';
    EXCEPTION WHEN OTHERS THEN
      -- Fallback for older PostgreSQL: use COALESCE expressions
      -- NOTE: This index is not directly usable by PostgREST onConflict,
      -- but prevents duplicate rows.
      CREATE UNIQUE INDEX results_student_level_semester_type_unique
      ON results (student_id, COALESCE(level, 0), COALESCE(semester, 0), result_type);
      RAISE NOTICE 'Created unique index with COALESCE fallback';
    END;
  ELSE
    RAISE NOTICE 'Unique index already exists, skipping creation';
  END IF;
END $$;

COMMENT ON INDEX results_student_level_semester_type_unique IS
  'Unique constraint for upsert: one result per student per level+semester+type combination. Matches onConflict in Dashboard.tsx.';
