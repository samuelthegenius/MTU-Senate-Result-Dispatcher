-- Fix for results approval trigger causing 400 errors
-- The trigger uses net.http_request() which requires the net extension
-- Since the Dashboard already manually calls process-dispatch, we can drop the trigger

-- Drop the trigger that's causing 400 errors
DROP TRIGGER IF EXISTS results_approval_trigger ON results;

-- Optionally drop the function too (it won't work without net extension)
-- DROP FUNCTION IF EXISTS trigger_dispatch_on_approval();

-- Verify trigger is removed
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'results';
