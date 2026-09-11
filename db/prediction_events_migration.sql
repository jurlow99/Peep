-- ── Prediction Markets: curated events ───────────────────────────────────────────
-- Run this in the Supabase SQL editor. If prompted about RLS, click "Run without RLS".
-- Idempotent: safe to run more than once. Existing tables are left untouched
-- (CREATE TABLE IF NOT EXISTS skips them); policies are dropped + recreated cleanly.
-- Requires the is_admin() helper (already present from rls_policies.sql).
--
-- Events are curated/admin-scheduled -- NOT tied to a live creator stream or a
-- FAST channel. An admin creates an event (its own HLS source + schedule),
-- then opens/prices/locks/settles markets against it from the CMS. The tick
-- stream itself is never persisted (see the client's Broadcast feed); only
-- the market, its options, and the resulting bets are.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Events — the curated broadcast a market is attached to
CREATE TABLE IF NOT EXISTS prediction_events (
  id              bigint generated always as identity primary key,
  title           text not null,
  description     text,
  thumbnail       text,
  hero_url        text,
  stream_url      text,   -- direct HLS/manifest URL
  stream_uid      text,   -- or a Cloudflare Stream live input UID, same split as channels
  status          text default 'scheduled',   -- scheduled | live | ended
  starts_at       timestamptz,
  visibility_tier text default 'production',  -- same preview-ring convention as other content
  created_at      timestamptz default now()
);

-- 2. Markets — one open question at a time within an event
CREATE TABLE IF NOT EXISTS prediction_markets (
  id                 bigint generated always as identity primary key,
  event_id           bigint references prediction_events(id) on delete cascade,
  question           text not null,
  status             text default 'open',  -- open | locked | settled | void
  locks_at           timestamptz,
  winning_option_id  bigint,  -- denormalized pointer for quick reads; market_resolutions is the audit record
  seq                integer default 0,  -- server-authoritative tick counter the CMS increments when publishing
  created_at         timestamptz default now()
);
CREATE INDEX IF NOT EXISTS prediction_markets_event_idx ON prediction_markets (event_id);

-- 3. Options — 2-4 per market
CREATE TABLE IF NOT EXISTS market_options (
  id          bigint generated always as identity primary key,
  market_id   bigint references prediction_markets(id) on delete cascade,
  key         text not null,   -- stable short key, e.g. "yes" / "home" -- matches the client's MarketOption.key
  label       text not null,
  odds        numeric(6,2) not null default 1.00,
  sort_order  integer default 0
);
CREATE INDEX IF NOT EXISTS market_options_market_idx ON market_options (market_id);

-- 4. Bets — placed by viewers. No place-bet edge function writes here yet;
-- the table exists so RLS and the schema are ready when that lands.
CREATE TABLE IF NOT EXISTS market_bets (
  id            bigint generated always as identity primary key,
  market_id     bigint references prediction_markets(id) on delete cascade,
  option_id     bigint references market_options(id),
  user_id       uuid references profiles(id),
  stake         integer not null,
  odds_at_bet   numeric(6,2) not null,   -- pinned at confirm time, not the live price
  payout        integer,                 -- null until settled
  created_at    timestamptz default now()
);
CREATE INDEX IF NOT EXISTS market_bets_market_idx ON market_bets (market_id);
CREATE INDEX IF NOT EXISTS market_bets_user_idx ON market_bets (user_id);

-- 5. Resolutions — written once at settlement, immutable audit trail
CREATE TABLE IF NOT EXISTS market_resolutions (
  id                 bigint generated always as identity primary key,
  market_id          bigint unique references prediction_markets(id) on delete cascade,
  winning_option_id  bigint references market_options(id),
  settled_at         timestamptz default now(),
  settled_by         uuid references profiles(id)
);

-- ── Row Level Security ───────────────────────────────────────────────────────────
ALTER TABLE prediction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_resolutions ENABLE ROW LEVEL SECURITY;

-- Events, markets, options: everyone can read (viewers, incl. guests); only admins write
DROP POLICY IF EXISTS "Public read" ON prediction_events;
CREATE POLICY "Public read" ON prediction_events FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin write" ON prediction_events;
CREATE POLICY "Admin write" ON prediction_events FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Public read" ON prediction_markets;
CREATE POLICY "Public read" ON prediction_markets FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin write" ON prediction_markets;
CREATE POLICY "Admin write" ON prediction_markets FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Public read" ON market_options;
CREATE POLICY "Public read" ON market_options FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin write" ON market_options;
CREATE POLICY "Admin write" ON market_options FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Resolutions: public read too -- viewers should be able to see who won
-- without an admin login, same as they can see the market that resolved it.
DROP POLICY IF EXISTS "Public read" ON market_resolutions;
CREATE POLICY "Public read" ON market_resolutions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin write" ON market_resolutions;
CREATE POLICY "Admin write" ON market_resolutions FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Bets: a user reads/inserts only their own; admins see and manage all
DROP POLICY IF EXISTS "Users read own" ON market_bets;
CREATE POLICY "Users read own" ON market_bets FOR SELECT USING (auth.uid() = user_id OR is_admin());
DROP POLICY IF EXISTS "Users insert own" ON market_bets;
CREATE POLICY "Users insert own" ON market_bets FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admin write" ON market_bets;
CREATE POLICY "Admin write" ON market_bets FOR ALL USING (is_admin()) WITH CHECK (is_admin());
