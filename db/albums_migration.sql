-- Albums table
create table if not exists albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null default '',
  artwork_url text,
  year integer,
  description text default '',
  tags text default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Add album_id FK to songs table (nullable)
alter table songs
  add column if not exists album_id uuid references albums(id) on delete set null;

-- Index for album lookups
create index if not exists songs_album_id_idx on songs(album_id);
