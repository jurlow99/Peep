-- Align admin authorization: profiles.role is canonical; is_admin kept for legacy RLS.

UPDATE profiles SET role = 'admin' WHERE is_admin = true AND role = 'viewer';
UPDATE profiles SET is_admin = true WHERE role = 'admin' AND COALESCE(is_admin, false) = false;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND (role = 'admin' OR is_admin = true)
  );
$$;

-- Subscription helper for future RLS / edge functions
CREATE OR REPLACE FUNCTION has_active_subscription(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE user_id = check_user_id
      AND status = 'active'
  );
$$;
