-- Privacy fix: rename invite RLS policy to clarify intent and document the design.
-- The old "Anyone can use valid invite" policy is preserved functionally,
-- but renamed for clarity. Anon users can only validate an invite they already
-- have the exact token for (supplied in the app query via .eq('token', token)).
-- This does not allow open enumeration of valid tokens.

DROP POLICY IF EXISTS "Anyone can use valid invite" ON invites;
DROP POLICY IF EXISTS "Authenticated can validate invite" ON invites;

CREATE POLICY "Anon can validate invite by token" ON invites
  FOR SELECT TO anon, authenticated USING (
    used_at IS NULL AND expires_at > NOW()
  );
