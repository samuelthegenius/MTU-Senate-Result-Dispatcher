-- Fix duplicate portal_config rows
-- Delete all existing rows and insert one clean default

DELETE FROM portal_config;

INSERT INTO portal_config (
  id,
  base_url,
  api_endpoint,
  encrypted_username,
  encrypted_password,
  api_key,
  sync_enabled,
  sync_interval_minutes,
  last_sync_at,
  last_sync_status,
  last_sync_message,
  auto_dispatch_enabled,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'https://studentportal.mtu.edu.ng',
  '/api/results',
  NULL,
  NULL,
  NULL,
  FALSE,
  60,
  NULL,
  NULL,
  NULL,
  TRUE,
  NOW(),
  NOW()
);

-- Add constraint to enforce only one row in portal_config
-- This creates a singleton table pattern
DO $$
BEGIN
  -- Add singleton column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'portal_config' AND column_name = '_singleton') THEN
    ALTER TABLE portal_config ADD COLUMN _singleton BOOLEAN DEFAULT TRUE;
  END IF;
  
  -- Add unique constraint on the singleton column
  IF NOT EXISTS (SELECT 1 FROM pg_constraint 
                 WHERE conname = 'portal_config_single_row') THEN
    ALTER TABLE portal_config ADD CONSTRAINT portal_config_single_row 
      UNIQUE (_singleton);
  END IF;
END $$;

-- Update existing row to have the singleton flag
UPDATE portal_config SET _singleton = TRUE;
