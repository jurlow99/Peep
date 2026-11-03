-- Ad breaks per title: seconds from the start where a mid-roll may play.
-- `ad_breaks` is the approved list the players use; empty or null means fall
-- back to the Ad rules timing (every N minutes). `suggested_ad_breaks` is what
-- the Mac break scanner found (black frames + silence) and waits for an admin
-- to accept in Content → Movies / Manage series.
-- Applied to dev (cuwdyedmmnpklufduaho) by hand on 2026-11-03.
alter table public.videos
  add column if not exists ad_breaks integer[] check (ad_breaks is null or 0 <= all(ad_breaks)),
  add column if not exists suggested_ad_breaks integer[],
  add column if not exists ad_breaks_scanned_at timestamptz;
alter table public.episodes
  add column if not exists ad_breaks integer[] check (ad_breaks is null or 0 <= all(ad_breaks)),
  add column if not exists suggested_ad_breaks integer[],
  add column if not exists ad_breaks_scanned_at timestamptz;
