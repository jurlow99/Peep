-- ── Admin audit log ──────────────────────────────────────────────────────────
-- Run in the Supabase SQL editor. If prompted about RLS, click "Run without RLS".
-- Records who did what in the admin CMS (deletes, approvals, comps, flag changes…).
-- Requires the is_admin() helper (from rls_policies.sql). Safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  actor_email text,
  action      text NOT NULL,   -- e.g. "delete", "approve", "reject", "flag.toggle"
  entity      text,            -- e.g. "podcast", "streamer_application", "channel"
  entity_id   text,
  details     jsonb,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read the log and write entries; nobody else can touch it.
DROP POLICY IF EXISTS "Admin read" ON audit_log;
CREATE POLICY "Admin read" ON audit_log FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS "Admin insert" ON audit_log;
CREATE POLICY "Admin insert" ON audit_log FOR INSERT WITH CHECK (is_admin());
