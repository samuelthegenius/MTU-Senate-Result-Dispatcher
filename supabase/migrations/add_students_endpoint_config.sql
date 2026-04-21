-- Add configurable students endpoint to portal_config
ALTER TABLE portal_config ADD COLUMN IF NOT EXISTS students_endpoint TEXT DEFAULT '/api/students';

-- Update existing rows to have the default value
UPDATE portal_config SET students_endpoint = '/api/students' WHERE students_endpoint IS NULL;
