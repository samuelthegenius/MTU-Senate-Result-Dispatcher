-- Migration to rename course column to programme and increase size for full names
-- Run this in Supabase SQL Editor if you have an existing database with the old schema

-- Rename course column to programme and change to VARCHAR(100) for full names like "Computer Science"
ALTER TABLE students 
RENAME COLUMN course TO programme;

-- Alter the column type to support full programme names
ALTER TABLE students 
ALTER COLUMN programme TYPE VARCHAR(100);
