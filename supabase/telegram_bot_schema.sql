-- Telegram Bot Schema Migration for MTU Result System
-- Run this in Supabase SQL Editor to add required columns

-- Add verification_token column for deep link onboarding
ALTER TABLE parent_contacts 
ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255) UNIQUE;

-- Add telegram_chat_id column to store the chat ID from Telegram
ALTER TABLE parent_contacts 
ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(100);

-- Create index for faster lookups by verification_token
CREATE INDEX IF NOT EXISTS idx_parent_contacts_verification_token 
ON parent_contacts(verification_token);

-- Create index for faster lookups by telegram_chat_id
CREATE INDEX IF NOT EXISTS idx_parent_contacts_telegram_chat_id 
ON parent_contacts(telegram_chat_id);

-- Create index for phone lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_parent_contacts_phone 
ON parent_contacts(phone);

-- Function to generate unique verification token
CREATE OR REPLACE FUNCTION generate_verification_token()
RETURNS VARCHAR(255) AS $$
DECLARE
    token VARCHAR(255);
    exists_check BOOLEAN;
BEGIN
    LOOP
        -- Generate a random token (32 hex characters)
        token := encode(gen_random_bytes(16), 'hex');
        
        -- Check if token already exists
        SELECT EXISTS(
            SELECT 1 FROM parent_contacts WHERE verification_token = token
        ) INTO exists_check;
        
        EXIT WHEN NOT exists_check;
    END LOOP;
    
    RETURN token;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to auto-generate token for new parent contacts
CREATE OR REPLACE FUNCTION auto_generate_parent_token()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.verification_token IS NULL THEN
        NEW.verification_token := generate_verification_token();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate token on insert
DROP TRIGGER IF EXISTS generate_parent_token_trigger ON parent_contacts;
CREATE TRIGGER generate_parent_token_trigger
    BEFORE INSERT ON parent_contacts
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_parent_token();

-- Update existing rows to have tokens
UPDATE parent_contacts 
SET verification_token = generate_verification_token()
WHERE verification_token IS NULL;

-- Verify columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'parent_contacts'
ORDER BY ordinal_position;
