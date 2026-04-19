-- Migration to add parent_type column to existing parent_contacts table
-- Run this in Supabase SQL Editor

-- Add parent_type column with default value
ALTER TABLE parent_contacts 
ADD COLUMN IF NOT EXISTS parent_type VARCHAR(10) NOT NULL DEFAULT 'father' 
CHECK (parent_type IN ('father', 'mother'));

-- Drop the old unique constraint on student_id only
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'parent_contacts_student_id_key' 
    AND conrelid = 'parent_contacts'::regclass
  ) THEN
    ALTER TABLE parent_contacts DROP CONSTRAINT parent_contacts_student_id_key;
  END IF;
END $$;

-- Add new unique constraint on student_id + parent_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'parent_contacts_student_id_parent_type_key' 
    AND conrelid = 'parent_contacts'::regclass
  ) THEN
    ALTER TABLE parent_contacts 
    ADD CONSTRAINT parent_contacts_student_id_parent_type_key 
    UNIQUE (student_id, parent_type);
  END IF;
END $$;
