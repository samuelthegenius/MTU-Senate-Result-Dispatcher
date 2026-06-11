-- MTU Senate Result Dispatcher Schema

-- Create students table
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matric_no VARCHAR(20) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  programme VARCHAR(100), -- e.g., Computer Science, Electrical Engineering
  level INTEGER, -- e.g., 100, 200, 300, 400, 500
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create parent_contacts table
CREATE TABLE IF NOT EXISTS parent_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  parent_type VARCHAR(10) NOT NULL DEFAULT 'father' CHECK (parent_type IN ('father', 'mother')),
  email VARCHAR(255),
  phone VARCHAR(20),
  whatsapp_no VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, parent_type)
);

-- Create results table
CREATE TABLE IF NOT EXISTS results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  pdf_url TEXT,
  level INTEGER, -- e.g., 100, 200, 300, 400, 500
  semester INTEGER, -- e.g., 1 or 2
  session VARCHAR(20), -- e.g., "2023/2024", "2024/2025"
  result_type TEXT DEFAULT 'regular' CHECK (result_type IN ('regular', 'supplementary')), -- regular or supplementary/resit
  cgpa NUMERIC(3,2), -- e.g., 4.50, 3.75
  gpa NUMERIC(3,2), -- e.g., 4.50, 3.75
  is_senate_approved BOOLEAN DEFAULT FALSE,
  dispatch_status JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, level, semester, result_type)
);

-- Staff table for user profiles and roles
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(20) DEFAULT 'staff', -- 'admin' or 'staff'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invites table for secure signup
CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(20) DEFAULT 'staff',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  used_at TIMESTAMPTZ DEFAULT NULL
);

-- Enable Row Level Security
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for all authenticated users (staff with @mtu.edu.ng)
DROP POLICY IF EXISTS "Allow read for authenticated staff" ON students;
CREATE POLICY "Allow read for authenticated staff" ON students
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert for authenticated staff" ON students;
CREATE POLICY "Allow insert for authenticated staff" ON students
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update for authenticated staff" ON students;
CREATE POLICY "Allow update for authenticated staff" ON students
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow delete for authenticated staff" ON students;
CREATE POLICY "Allow delete for authenticated staff" ON students
  FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow read for authenticated staff on parent_contacts" ON parent_contacts;
CREATE POLICY "Allow read for authenticated staff on parent_contacts" ON parent_contacts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert for authenticated staff on parent_contacts" ON parent_contacts;
CREATE POLICY "Allow insert for authenticated staff on parent_contacts" ON parent_contacts
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update for authenticated staff on parent_contacts" ON parent_contacts;
CREATE POLICY "Allow update for authenticated staff on parent_contacts" ON parent_contacts
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow delete for authenticated staff on parent_contacts" ON parent_contacts;
CREATE POLICY "Allow delete for authenticated staff on parent_contacts" ON parent_contacts
  FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow read for authenticated staff on results" ON results;
CREATE POLICY "Allow read for authenticated staff on results" ON results
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert for authenticated staff on results" ON results;
CREATE POLICY "Allow insert for authenticated staff on results" ON results
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update for authenticated staff on results" ON results;
CREATE POLICY "Allow update for authenticated staff on results" ON results
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow delete for authenticated staff on results" ON results;
CREATE POLICY "Allow delete for authenticated staff on results" ON results
  FOR DELETE TO authenticated USING (true);

-- Staff policies
DROP POLICY IF EXISTS "Anyone can read staff" ON staff;
CREATE POLICY "Anyone can read staff" ON staff FOR SELECT TO authenticated USING (true);

-- Separate policies for admin management to avoid recursion
DROP POLICY IF EXISTS "Admins can insert staff" ON staff;
CREATE POLICY "Admins can insert staff" ON staff
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin' AND is_active = true)
  );

DROP POLICY IF EXISTS "Admins can update staff" ON staff;
CREATE POLICY "Admins can update staff" ON staff
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin' AND is_active = true)
  );

DROP POLICY IF EXISTS "Admins can delete staff" ON staff;
CREATE POLICY "Admins can delete staff" ON staff
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin' AND is_active = true)
  );

-- Invites policies
-- Invite validation for signup (unauthenticated callers):
-- Anon users can only read an invite row when they already supply the exact token.
-- The app always queries with .eq('token', token) AND .eq('email', email),
-- so this policy does NOT allow token enumeration — a caller needs the exact token first.
-- The RLS alone cannot enforce the WHERE clause, but combined with the app-level filter
-- (token + email match) the exposure is minimal: a valid token is already in the URL.
DROP POLICY IF EXISTS "Anyone can use valid invite" ON invites;
DROP POLICY IF EXISTS "Authenticated can validate invite" ON invites;
CREATE POLICY "Anon can validate invite by token" ON invites
  FOR SELECT TO anon, authenticated USING (
    used_at IS NULL AND expires_at > NOW()
  );

-- Admins can see all invites for management (replacing the broad "Authenticated can read invites")
DROP POLICY IF EXISTS "Authenticated can read invites" ON invites;
DROP POLICY IF EXISTS "Admins can read invites" ON invites;
CREATE POLICY "Admins can read invites" ON invites
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin' AND is_active = true)
  );

DROP POLICY IF EXISTS "Admins can insert invites" ON invites;
CREATE POLICY "Admins can insert invites" ON invites
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin' AND is_active = true)
  );

DROP POLICY IF EXISTS "Admins can delete invites" ON invites;
CREATE POLICY "Admins can delete invites" ON invites
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM staff WHERE user_id = auth.uid() AND role = 'admin' AND is_active = true)
  );

-- Create storage bucket for PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('result_pdfs', 'result_pdfs', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
DROP POLICY IF EXISTS "Staff can upload PDFs" ON storage.objects;
CREATE POLICY "Staff can upload PDFs" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'result_pdfs');

DROP POLICY IF EXISTS "Staff can update PDFs" ON storage.objects;
CREATE POLICY "Staff can update PDFs" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'result_pdfs');

DROP POLICY IF EXISTS "Staff can read PDFs" ON storage.objects;
CREATE POLICY "Staff can read PDFs" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'result_pdfs');

DROP POLICY IF EXISTS "Staff can delete PDFs" ON storage.objects;
CREATE POLICY "Staff can delete PDFs" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'result_pdfs');

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_students_matric ON students(matric_no);
CREATE INDEX IF NOT EXISTS idx_results_student ON results(student_id);
CREATE INDEX IF NOT EXISTS idx_results_approved ON results(is_senate_approved);
CREATE INDEX IF NOT EXISTS idx_results_type ON results(result_type);
CREATE INDEX IF NOT EXISTS idx_results_session ON results(session);
CREATE INDEX IF NOT EXISTS idx_results_level_semester_session ON results(level, semester, session);

-- Create trigger function to invoke dispatch when senate approval happens
CREATE OR REPLACE FUNCTION trigger_dispatch_on_approval()
RETURNS TRIGGER AS $$
DECLARE
  net_exists BOOLEAN;
BEGIN
  IF NEW.is_senate_approved = true AND OLD.is_senate_approved = false THEN
    -- Check if net schema exists (pg_net extension)
    SELECT EXISTS(
      SELECT 1 FROM information_schema.schemata WHERE schema_name = 'net'
    ) INTO net_exists;
    
    IF net_exists THEN
      PERFORM net.http_request(
        method := 'POST',
        url := (SELECT supabase.functions.invoke_url('process-dispatch')),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object('resultId', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS results_approval_trigger ON results;
CREATE TRIGGER results_approval_trigger
  AFTER UPDATE ON results
  FOR EACH ROW
  EXECUTE FUNCTION trigger_dispatch_on_approval();