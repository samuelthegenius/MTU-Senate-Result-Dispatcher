-- ============================================================
-- ADMIN ACCOUNT SEED SCRIPT
-- Run this in the Supabase SQL Editor AFTER creating the auth
-- user for chukwuemekaamos@mtu.edu.ng via the Supabase Dashboard.
-- ============================================================

-- Step 1: Confirm the user exists in auth.users and get their UUID.
--         (For verification only — you don't need to run this separately)
-- SELECT id, email FROM auth.users WHERE email = 'chukwuemekaamos@mtu.edu.ng';

-- Step 2: Insert or update the admin staff record.
--         Replace <USER_UUID> with the actual UUID from auth.users.
--         You can copy it from the Supabase Dashboard → Authentication → Users.

INSERT INTO public.staff (user_id, email, full_name, role, is_active)
SELECT
  id,
  'chukwuemekaamos@mtu.edu.ng',
  'Chukwuemeka Amos',
  'admin',
  true
FROM auth.users
WHERE email = 'chukwuemekaamos@mtu.edu.ng'
ON CONFLICT (email) DO UPDATE
  SET
    full_name  = EXCLUDED.full_name,
    role       = 'admin',
    is_active  = true,
    updated_at = NOW();
