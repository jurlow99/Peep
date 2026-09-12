-- ── Prediction Markets: link a market to a real live game ────────────────────────
-- Run this in the Supabase SQL editor (dev now, prod when this ships). If
-- prompted about RLS, click "Run without RLS". Idempotent: ADD COLUMN IF NOT
-- EXISTS is safe to run more than once.
--
-- Lets the CMS (EventsPanel) attach a market to a real game from the
-- sports-scoreboard edge function (ESPN's public scoreboard, no API key),
-- so the market row can show a live score/status and prompt an admin to
-- confirm-settle once that feed reports a final. No auto-settle write
-- happens from this alone -- it's just enough to know which game a market
-- is watching; the confirm step still lives entirely client-side in the CMS.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE prediction_markets
  ADD COLUMN IF NOT EXISTS linked_league text,     -- e.g. "football/nfl" -- see lib/sportsScoreboard.ts's LEAGUES map
  ADD COLUMN IF NOT EXISTS linked_event_id text;    -- the scoreboard's event id for this game
