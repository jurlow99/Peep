-- Two-screen default for curated packages; viewers can override during playback.
alter table public.multiview_packages
  add column if not exists two_screen_layout text not null default 'side_by_side'
  check (two_screen_layout in ('side_by_side', 'stacked'));
