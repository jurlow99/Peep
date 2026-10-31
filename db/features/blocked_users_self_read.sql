-- Blocking only works if the blocked person can see that they're blocked.
-- Until now blocked_users was admin-read only, so useAuth's check always came
-- back empty for the very user it was meant to sign out. Let a signed-in user
-- read the row that matches their own email, and nothing else.
-- Applied to dev 2026-10-31. Prod: not yet.

DROP POLICY IF EXISTS self_read ON public.blocked_users;
CREATE POLICY self_read ON public.blocked_users
  FOR SELECT TO authenticated
  USING (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
