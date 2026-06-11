-- Add gpa column to results table to store the current semester's GPA

ALTER TABLE results ADD COLUMN IF NOT EXISTS gpa NUMERIC(3,2);
