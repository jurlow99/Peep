-- ── Carousel shelf presentation ──────────────────────────────────────────────
-- Run in the Supabase SQL editor. If prompted about RLS, click "Run without RLS".
-- Adds a per-shelf presentation style (standard | top10 | spotlight). Safe to re-run.
-- REQUIRED before saving carousels from the CMS once the Presentation picker ships.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE carousels ADD COLUMN IF NOT EXISTS layout text DEFAULT 'standard';
