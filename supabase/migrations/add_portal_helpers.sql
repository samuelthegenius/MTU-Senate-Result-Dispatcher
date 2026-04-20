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

-- Function to encrypt credentials (basic XOR for demo - use proper encryption in production)
CREATE OR REPLACE FUNCTION encrypt_credential(credential TEXT, key TEXT)
RETURNS TEXT AS $$
DECLARE
  result TEXT := '';
  i INTEGER;
BEGIN
  IF credential IS NULL THEN
    RETURN NULL;
  END IF;
  
  FOR i IN 1..length(credential) LOOP
    result := result || chr(ascii(substring(credential from i for 1)) # ascii(substring(key from (i % length(key)) + 1 for 1)));
  END LOOP;
  
  RETURN encode(result::bytea, 'base64');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to decrypt credentials
CREATE OR REPLACE FUNCTION decrypt_credential(encrypted TEXT, key TEXT)
RETURNS TEXT AS $$
DECLARE
  result TEXT := '';
  decoded BYTEA;
  i INTEGER;
  cred TEXT;
BEGIN
  IF encrypted IS NULL THEN
    RETURN NULL;
  END IF;
  
  decoded := decode(encrypted, 'base64');
  cred := convert_from(decoded, 'UTF8');
  
  FOR i IN 1..length(cred) LOOP
    result := result || chr(ascii(substring(cred from i for 1)) # ascii(substring(key from (i % length(key)) + 1 for 1)));
  END LOOP;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION invoke_dispatch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION encrypt_credential(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION decrypt_credential(TEXT, TEXT) TO authenticated;
