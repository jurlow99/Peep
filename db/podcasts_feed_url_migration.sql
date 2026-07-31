-- ── Podcasts: store the source RSS feed URL for one-click re-sync ──────────────
--
-- Run this in the Supabase SQL editor.
-- If prompted about RLS, click "Run without RLS".
--
-- Optional but recommended: without this column, RSS import still works — you just
-- have to paste the feed URL each time you Sync. With it, the Sync button on each
-- podcast is prefilled automatically.
-- ───────────────────────────────────────────────────────────────────────────────

ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS feed_url text;
