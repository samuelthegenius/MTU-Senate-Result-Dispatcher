-- Set up pg_cron scheduled job for portal sync
-- This creates a cron job that calls the scheduled-portal-sync Edge Function every 30 minutes

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function that calls the Edge Function via pg_net
CREATE OR REPLACE FUNCTION invoke_scheduled_portal_sync()
RETURNS VOID AS $$
DECLARE
    net_exists BOOLEAN;
    supabase_url TEXT;
    cron_secret TEXT;
BEGIN
    -- Check if pg_net extension exists
    SELECT EXISTS(
        SELECT 1 FROM information_schema.schemata WHERE schema_name = 'net'
    ) INTO net_exists;
    
    IF NOT net_exists THEN
        RAISE EXCEPTION 'pg_net extension is required for cron jobs. Run: CREATE EXTENSION pg_net;';
    END IF;
    
    -- Get Supabase URL
    supabase_url := COALESCE(
        current_setting('app.settings.supabase_url', true),
        (SELECT 'https://' || split_part(split_part(current_setting('request.headers', true), 'host": "', 2), '"', 1))
    );
    
    -- Get CRON_SECRET from app settings
    cron_secret := current_setting('app.settings.cron_secret', true);
    
    IF cron_secret IS NULL OR cron_secret = '' THEN
        RAISE WARNING 'CRON_SECRET not set. Cron job will fail authentication. Set it via: ALTER DATABASE <db> SET app.settings.cron_secret = ''your_secret'';';
    END IF;
    
    -- Make HTTP request to the Edge Function
    PERFORM net.http_post(
        url := supabase_url || '/functions/v1/scheduled-portal-sync',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', COALESCE(cron_secret, '')
        ),
        body := '{}'::jsonb
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the cron job to run every 30 minutes
-- You can adjust the schedule by changing the cron expression
SELECT cron.schedule(
    'portal-sync-job',           -- job name
    '*/30 * * * *',             -- every 30 minutes (cron expression)
    'SELECT invoke_scheduled_portal_sync();'  -- SQL to execute
);

-- Alternative schedules (uncomment the one you want):
-- Every hour: '0 * * * *'
-- Every 2 hours: '0 */2 * * *'
-- Every day at 8am: '0 8 * * *'

-- To check if the job was created:
-- SELECT * FROM cron.job;

-- To check job run history:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- To unschedule the job:
-- SELECT cron.unschedule('portal-sync-job');
