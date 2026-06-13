# Security Notes

## Admin authorization

- **Canonical field:** `profiles.role = 'admin'`
- **Legacy:** `profiles.is_admin = true` (kept in sync via migration `003_align_admin_role.sql`)
- RLS helper `is_admin()` accepts either flag.

## Subscription gating

Paywall is enforced in the client (`App.jsx` + `PaywallPage`). Postgres RLS currently allows authenticated users to read content metadata rows.

**Playback URL exposure:** browse queries use `contentSelect.videosBrowse` (no `url` column). Full URLs are fetched only when opening the player.

For stricter server-side gating later:

- Use `has_active_subscription()` (added in migration 003/004)
- Or serve signed playback URLs via an edge function

## Error reporting

Frontend: `src/lib/observability.ts` — set `window.__peepReportError` to wire Sentry or similar.

## Edge functions

Shared auth helpers live in `supabase/functions/_shared/`. Prefer `requireUser` / `requireAdmin` over duplicating JWT checks.
