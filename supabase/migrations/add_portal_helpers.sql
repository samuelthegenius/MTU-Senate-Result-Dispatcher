-- Helper functions for portal integration

-- Function to invoke dispatch via pg_net (for async processing)
CREATE OR REPLACE FUNCTION invoke_dispatch(result_id UUID)
RETURNS VOID AS $$
DECLARE
  net_exists BOOLEAN;
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Check if net schema exists
  SELECT EXISTS(
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'net'
  ) INTO net_exists;
  
  IF net_exists THEN
    -- Get Supabase URL from config or use current_setting
    supabase_url := COALESCE(
      current_setting('app.settings.supabase_url', true),
      (SELECT split_part(split_part(current_setting('request.headers', true), 'host": "', 2), '"', 1))
    );
    
    service_key := current_setting('app.settings.service_role_key', true);
    
    -- Make async HTTP request to process-dispatch
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/process-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object('resultId', result_id)
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Alternative trigger for auto-dispatch on portal results
-- This can be used instead of the standard approval trigger for portal-synced results
CREATE OR REPLACE FUNCTION trigger_auto_dispatch_portal_results()
RETURNS TRIGGER AS $$
DECLARE
  net_exists BOOLEAN;
  should_dispatch BOOLEAN := FALSE;
BEGIN
  -- Only trigger for portal results that haven't been auto-dispatched yet
  IF NEW.source = 'portal' AND 
     NEW.is_senate_approved = true AND 
     (OLD IS NULL OR OLD.auto_dispatched_at IS NULL) AND
     NEW.auto_dispatched_at IS NULL THEN
    
    should_dispatch := TRUE;
    
    -- Check if net schema exists
    SELECT EXISTS(
      SELECT 1 FROM information_schema.schemata WHERE schema_name = 'net'
    ) INTO net_exists;
    
    IF net_exists AND should_dispatch THEN
      -- Mark as dispatched immediately to prevent duplicates
      NEW.auto_dispatched_at := NOW();
      
      -- Trigger async dispatch
      PERFORM net.http_post(
        url := COALESCE(
          current_setting('app.settings.supabase_url', true),
          (SELECT split_part(split_part(current_setting('request.headers', true), 'host": "', 2), '"', 1))
        ) || '/functions/v1/process-dispatch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.service_role_key', true), '')
        ),
        body := jsonb_build_object('resultId', NEW.id)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auto-dispatch on portal results
DROP TRIGGER IF EXISTS portal_results_auto_dispatch_trigger ON results;
CREATE TRIGGER portal_results_auto_dispatch_trigger
  BEFORE INSERT OR UPDATE ON results
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auto_dispatch_portal_results();

-- encrypt_credential: replaced weak XOR implementation with a server-only stub.
-- Actual AES-256-GCM encryption is performed in the fetch-portal-data edge function
-- using the Web Crypto API and the PORTAL_ENCRYPTION_KEY environment variable.
-- This SQL function exists only for compatibility; real encryption must happen
-- via the edge function, NOT via this RPC.
--
-- Security: revoke execute from 'authenticated' to prevent any logged-in user from
-- calling this directly. Only service_role (used by edge functions) may call it.
--
-- NOTE: If you have existing rows with XOR-encrypted credentials, they need to be
-- re-encrypted using the edge function before they can be decrypted correctly.

-- Drop the old insecure implementations
DROP FUNCTION IF EXISTS encrypt_credential(TEXT, TEXT);
DROP FUNCTION IF EXISTS decrypt_credential(TEXT, TEXT);

-- Revoke previously granted public execute access
REVOKE EXECUTE ON FUNCTION invoke_dispatch(UUID) FROM authenticated;

-- Restrict invoke_dispatch to service_role only
GRANT EXECUTE ON FUNCTION invoke_dispatch(UUID) TO service_role;

