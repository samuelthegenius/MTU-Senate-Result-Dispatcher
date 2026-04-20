-- MTU Portal Integration Schema

-- Portal configuration table (single row, stores encrypted credentials)
CREATE TABLE IF NOT EXISTS portal_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_url TEXT NOT NULL DEFAULT 'https://student.mtu.edu.ng',
  api_endpoint TEXT NOT NULL DEFAULT '/api/results',
  -- Credentials are encrypted at application level before storage
  encrypted_username TEXT,
  encrypted_password TEXT,
  api_key TEXT,
  -- Sync settings
  sync_enabled BOOLEAN DEFAULT FALSE,
  sync_interval_minutes INTEGER DEFAULT 60,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT, -- 'success', 'error', 'running'
  last_sync_message TEXT,
  -- Auto-dispatch settings
  auto_dispatch_enabled BOOLEAN DEFAULT TRUE, -- Auto dispatch when new results found
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Portal sync log for tracking each sync operation
CREATE TABLE IF NOT EXISTS portal_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL, -- 'running', 'success', 'partial', 'error'
  students_fetched INTEGER DEFAULT 0,
  results_fetched INTEGER DEFAULT 0,
  results_new INTEGER DEFAULT 0,
  results_dispatched INTEGER DEFAULT 0,
  errors TEXT,
  details JSONB DEFAULT '{}'
);

-- Track portal result sources (to distinguish from manual uploads)
ALTER TABLE results ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'; -- 'manual', 'portal'
ALTER TABLE results ADD COLUMN IF NOT EXISTS portal_result_id TEXT; -- ID from portal system
ALTER TABLE results ADD COLUMN IF NOT EXISTS portal_sync_id UUID REFERENCES portal_sync_logs(id);

-- Track when results were fetched from portal and dispatched
ALTER TABLE results ADD COLUMN IF NOT EXISTS portal_fetched_at TIMESTAMPTZ;
ALTER TABLE results ADD COLUMN IF NOT EXISTS auto_dispatched_at TIMESTAMPTZ;
ALTER TABLE results ADD COLUMN IF NOT EXISTS auto_dispatch_status JSONB DEFAULT NULL;

-- Enable RLS
ALTER TABLE portal_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_sync_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can manage portal config
CREATE POLICY "Admins can manage portal config" ON portal_config
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin' AND is_active = true)
  );

-- All staff can view portal config (read-only)
CREATE POLICY "Staff can view portal config" ON portal_config
  FOR SELECT TO authenticated USING (true);

-- All staff can view sync logs
CREATE POLICY "Staff can view sync logs" ON portal_sync_logs
  FOR SELECT TO authenticated USING (true);

-- Only admins can insert/update sync logs (edge function will use service role)
CREATE POLICY "Admins can manage sync logs" ON portal_sync_logs
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin' AND is_active = true)
  );

-- Insert default config if not exists
INSERT INTO portal_config (id, sync_enabled, auto_dispatch_enabled)
VALUES (gen_random_uuid(), FALSE, TRUE)
ON CONFLICT DO NOTHING;

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_results_source ON results(source);
CREATE INDEX IF NOT EXISTS idx_results_portal_sync ON results(portal_sync_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON portal_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started ON portal_sync_logs(started_at);
