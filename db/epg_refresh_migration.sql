-- ── EPG auto-refresh: remember each channel's feed URL + XMLTV channel id ────────
-- Run in the Supabase SQL editor. If prompted about RLS, click "Run without RLS".
-- Lets the daily refresh-epg cron re-pull URL-based guide feeds. Safe to re-run.
-- ────────────────────────────────────────────────────────────────────────────────

ALTER TABLE epg_channel_sources ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE epg_channel_sources ADD COLUMN IF NOT EXISTS xmltv_channel_id text;
