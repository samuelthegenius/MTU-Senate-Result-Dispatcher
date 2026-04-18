-- Emergency fix for infinite recursion in staff table policies
-- Run this in Supabase SQL Editor

-- First, disable RLS temporarily to break the recursion
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;

-- Re-enable RLS
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies on staff
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'staff'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON staff', pol.policyname);
    END LOOP;
END $$;

-- Create clean policies without recursion

-- 1. Everyone can read staff (no recursion)
CREATE POLICY "staff_select_all" ON staff
    FOR SELECT TO authenticated USING (true);

-- 2. Everyone can insert their own staff record
CREATE POLICY "staff_insert_own" ON staff
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- 3. Everyone can update their own staff record
CREATE POLICY "staff_update_own" ON staff
    FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- 4. Everyone can delete their own staff record  
CREATE POLICY "staff_delete_own" ON staff
    FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Verify policies are clean
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'staff';
