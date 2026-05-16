CREATE TABLE IF NOT EXISTS epg_entries (
  id bigint generated always as identity primary key,
  channel_id bigint references live_streams(id) on delete cascade,
  content_id bigint,
  content_type text,
  title text not null,
  description text,
  thumbnail text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  created_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS epg_channel_time ON epg_entries(channel_id, start_time, end_time);
