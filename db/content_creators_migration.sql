create table if not exists content_creators (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators(id) on delete cascade,
  content_id text not null,
  content_type text not null check (content_type in ('show', 'movie', 'music_video', 'podcast', 'episode', 'podcast_episode')),
  created_at timestamptz default now(),
  unique(creator_id, content_id, content_type)
);
