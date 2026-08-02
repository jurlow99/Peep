-- ── Peep Premium: mark content as subscriber-only ────────────────────────────
-- Run in the Supabase SQL editor. If prompted about RLS, click "Run without RLS".
-- Adds an is_premium flag to movies, series, episodes, and channels. Safe to re-run.
-- REQUIRED before saving these from the CMS (the forms now send is_premium).
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE videos   ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false;
ALTER TABLE shows    ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false;
