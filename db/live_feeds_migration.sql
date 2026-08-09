-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 1 — Live SRT Feeds
-- A "Feed" = an incoming broadcast source (e.g. a provider SRT endpoint), relayed
-- by the Raspberry Pi to a Cloudflare Live Input. Feeds exist independently of
-- Channels; a Channel optionally references a Feed for its playback source.
--
-- Safe/additive. Run once in the Supabase SQL editor. If an RLS warning appears,
-- click "Run without RLS".
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Feeds (NO secrets stored here — safe for admin reads / public view)
create table if not exists public.live_feeds (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  source_type               text not null default 'srt',      -- srt (future: rtmp/hls_pull)
  source_host               text,
  source_port               integer,
  source_mode               text default 'caller',            -- caller | listener | rendezvous
  source_stream_id          text,
  source_latency            integer default 200,
  has_passphrase            boolean not null default false,    -- indicator only; secret lives in live_feed_secrets
  cloudflare_live_input_uid text,
  cloudflare_srt_url        text,                              -- DESTINATION ingest (from Cloudflare)
  cloudflare_hls_url        text,
  cloudflare_dash_url       text,
  source_status             text default 'unknown',            -- unknown|connecting|connected|offline|error
  relay_status              text default 'unknown',            -- unknown|running|stopped|error
  cloudflare_status         text default 'unknown',            -- unknown|receiving|live|error
  playback_status           text default 'unknown',            -- unknown|available|unavailable
  enabled                   boolean not null default true,
  notes                     text,
  last_checked_at           timestamptz,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'live_feeds_source_mode_check') then
    alter table public.live_feeds add constraint live_feeds_source_mode_check
      check (source_mode in ('caller','listener','rendezvous'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'live_feeds_source_type_check') then
    alter table public.live_feeds add constraint live_feeds_source_type_check
      check (source_type in ('srt','rtmp','hls_pull'));
  end if;
end $$;

-- 2) Secrets — passphrases ONLY. RLS on with NO policies => only the service_role
--    (edge functions / the Pi via edge functions) can read/write. Never reaches the browser.
create table if not exists public.live_feed_secrets (
  feed_id     uuid primary key references public.live_feeds(id) on delete cascade,
  passphrase  text,
  updated_at  timestamptz default now()
);

-- 3) Channel → Feed link (only the reference; no source details copied into channels)
alter table public.channels
  add column if not exists live_feed_id uuid references public.live_feeds(id) on delete set null;

-- 4) RLS
alter table public.live_feeds        enable row level security;
alter table public.live_feed_secrets enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'live_feeds' and policyname = 'Admin manage feeds') then
    create policy "Admin manage feeds" on public.live_feeds
      for all using (is_admin()) with check (is_admin());
  end if;
end $$;
-- live_feed_secrets: intentionally NO policies → denies anon & authenticated entirely.

-- 5) Public view for viewers: ONLY safe playback fields (no source host/port/etc.),
--    so a Channel linked to a Feed can resolve its HLS URL without exposing anything sensitive.
create or replace view public.public_live_feeds as
  select id, cloudflare_hls_url, playback_status, enabled
  from public.live_feeds
  where enabled = true;

grant select on public.public_live_feeds to anon, authenticated;

-- 6) keep updated_at fresh
create or replace function public.touch_live_feeds_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_live_feeds_updated_at on public.live_feeds;
create trigger trg_live_feeds_updated_at before update on public.live_feeds
  for each row execute function public.touch_live_feeds_updated_at();
