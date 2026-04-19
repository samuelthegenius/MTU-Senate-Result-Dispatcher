-- Cleanup functions for MTU Senate Result Dispatcher

-- Function to delete PDF from storage when result is deleted
CREATE OR REPLACE FUNCTION delete_result_pdf_on_delete()
RETURNS TRIGGER AS $$
DECLARE
    bucket_path TEXT;
    storage_response JSONB;
    net_exists BOOLEAN;
BEGIN
    -- Extract bucket path from pdf_url if it exists
    IF OLD.pdf_url IS NOT NULL AND OLD.pdf_url LIKE '%/result_pdfs/%' THEN
        bucket_path := split_part(OLD.pdf_url, '/result_pdfs/', 2);
        
        -- Delete from storage using supabase storage API via pg_net
        -- Only if pg_net extension is available
        IF bucket_path IS NOT NULL AND bucket_path != '' THEN
            -- Check if net schema exists
            SELECT EXISTS(
                SELECT 1 FROM information_schema.schemata WHERE schema_name = 'net'
            ) INTO net_exists;
            
            IF net_exists THEN
                -- Try to delete via storage API
                PERFORM net.http_request(
                    method := 'DELETE',
                    url := (current_setting('app.settings.supabase_url', true) || '/storage/v1/object/result_pdfs/' || bucket_path),
                    headers := jsonb_build_object(
                        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
                    )
                );
            END IF;
        END IF;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-delete PDF when result is deleted
DROP TRIGGER IF EXISTS delete_result_pdf_trigger ON results;
CREATE TRIGGER delete_result_pdf_trigger
    BEFORE DELETE ON results
    FOR EACH ROW
    EXECUTE FUNCTION delete_result_pdf_on_delete();

-- Alternative: Function to clean up orphaned PDFs via scheduled job
CREATE OR REPLACE FUNCTION cleanup_orphaned_pdfs()
RETURNS TABLE(deleted_count INTEGER, errors TEXT[]) AS $$
DECLARE
    pdf_record RECORD;
    orphaned_paths TEXT[] := ARRAY[]::TEXT[];
    error_messages TEXT[] := ARRAY[]::TEXT[];
    deleted INTEGER := 0;
BEGIN
    -- Find all PDFs in storage that don't have corresponding results
    -- This would need to be run via a scheduled function or edge function
    -- that can actually list storage objects
    
    RETURN QUERY SELECT deleted, error_messages;
END;
$$ LANGUAGE plpgsql;
