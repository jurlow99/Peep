-- Channel-wide app playback blackouts. FARRIS dev first; deploy before the admin UI.
-- Existing channels RLS continues to allow only admins to change these settings.
alter table public.channels
  add column if not exists blackout_enabled boolean not null default false,
  add column if not exists blackout_message text not null default '',
  add column if not exists blackout_starts_at timestamptz,
  add column if not exists blackout_ends_at timestamptz;

alter table public.channels
  add constraint channels_blackout_message_length check (char_length(blackout_message) <= 500),
  add constraint channels_blackout_window check (
    (blackout_starts_at is null and blackout_ends_at is null)
    or (blackout_starts_at is not null and blackout_ends_at is not null and blackout_ends_at > blackout_starts_at)
  );

comment on column public.channels.blackout_enabled is 'Manual blackout until an admin turns it off; overrides the scheduled end.';
comment on column public.channels.blackout_message is 'Public viewer message during a manual or scheduled blackout; blank uses the app default.';
comment on column public.channels.blackout_starts_at is 'Inclusive UTC start of the optional scheduled blackout.';
comment on column public.channels.blackout_ends_at is 'Exclusive UTC end of the optional scheduled blackout.';
