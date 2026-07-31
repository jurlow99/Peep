-- ── Live TV: channels + EPG tables ─────────────────────────────────────────────
-- Run this in the Supabase SQL editor. If prompted about RLS, click "Run without RLS".
-- Idempotent: safe to run more than once. Existing tables are left untouched
-- (CREATE TABLE IF NOT EXISTS skips them); policies are dropped + recreated cleanly.
-- Requires the is_admin() helper (already present from rls_policies.sql).
-- ────────────────────────────────────────────────────────────────────────────────

-- 1. Channels — Fast/linear TV channels shown on the Live TV tab
CREATE TABLE IF NOT EXISTS channels (
  id          bigint generated always as identity primary key,
  name        text not null,
  slug        text,
  description text,
  logo_url    text,
  hero_url    text,
  category    text default 'general',
  ingest_type text default 'hls',
  hls_url     text,
  stream_uid  text,
  is_active   boolean default true,
  sort_order  integer default 0,
  created_at  timestamptz default now()
);

-- 2. EPG entries — the program guide; channel_id references channels.id
CREATE TABLE IF NOT EXISTS epg_entries (
  id           bigint generated always as identity primary key,
  channel_id   bigint,
  content_id   bigint,
  content_type text,
  title        text,
  description  text,
  thumbnail    text,
  start_time   timestamptz,
  end_time     timestamptz,
  created_at   timestamptz default now()
);
CREATE INDEX IF NOT EXISTS epg_entries_channel_time_idx ON epg_entries (channel_id, start_time);

-- 3. EPG source tracking — one row per channel, records the last XMLTV import
CREATE TABLE IF NOT EXISTS epg_channel_sources (
  channel_id    bigint primary key,
  source_name   text,
  imported_at   timestamptz,
  program_count integer,
  xml_content   text
);

-- ── Row Level Security ───────────────────────────────────────────────────────────
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE epg_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE epg_channel_sources ENABLE ROW LEVEL SECURITY;

-- Channels + EPG entries: everyone can read (viewers, incl. guests); only admins write
DROP POLICY IF EXISTS "Public read" ON channels;
CREATE POLICY "Public read" ON channels FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin write" ON channels;
CREATE POLICY "Admin write" ON channels FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Public read" ON epg_entries;
CREATE POLICY "Public read" ON epg_entries FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin write" ON epg_entries;
CREATE POLICY "Admin write" ON epg_entries FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Source records hold raw XML — admin only
DROP POLICY IF EXISTS "Admin all" ON epg_channel_sources;
CREATE POLICY "Admin all" ON epg_channel_sources FOR ALL USING (is_admin()) WITH CHECK (is_admin());
