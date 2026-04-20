-- Migration to add programme and level columns to students table
-- Run this in Supabase SQL Editor

-- Add programme column (VARCHAR 100 for full names like "Computer Science", "Electrical Engineering")
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS programme VARCHAR(100);

-- Add level column (INTEGER for levels like 100, 200, 300, 400, 500)
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS level INTEGER;
