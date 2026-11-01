-- Skip intro: a series carries a default intro window (seconds from the start),
-- an episode can override it. Null = no skip button. Viewers' players show
-- "Skip intro" while playback is inside the window and jump to its end.
-- Applied to dev (cuwdyedmmnpklufduaho) by hand on 2026-11-01.
alter table public.shows
  add column if not exists intro_start_seconds integer check (intro_start_seconds >= 0),
  add column if not exists intro_end_seconds integer check (intro_end_seconds > 0);
alter table public.episodes
  add column if not exists intro_start_seconds integer check (intro_start_seconds >= 0),
  add column if not exists intro_end_seconds integer check (intro_end_seconds > 0);
