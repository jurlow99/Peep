import { supabase } from "../supabase";
import { SUPABASE_URL } from "./config";

// League name -> the ESPN path segment the sports-scoreboard edge function
// allowlists. Keep this in sync with ALLOWED_LEAGUES server-side.
export const LEAGUES: Record<string, string> = {
  NFL: "football/nfl",
  NBA: "basketball/nba",
  MLB: "baseball/mlb",
  NHL: "hockey/nhl",
  "Premier League": "soccer/eng.1",
};

export type ScoreboardState = "pre" | "in" | "post";

export interface ScoreboardTeam {
  name: string;
  abbrev: string;
  score: string | null;
}

export interface ScoreboardEvent {
  id: string;
  name: string;
  date: string;
  state: ScoreboardState;
  detail: string; // e.g. "Q3 4:12", "Final", "8:20 PM"
  completed: boolean;
  home: ScoreboardTeam;
  away: ScoreboardTeam;
}

async function callScoreboard(league: string): Promise<ScoreboardEvent[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/sports-scoreboard?league=${encodeURIComponent(league)}`, {
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
  return json.events || [];
}

// Today's scoreboard for a league, filtered client-side by team name --
// there's no dedicated search endpoint, and a day's slate is small enough
// that filtering the same list is simpler than a second server-side route.
export async function searchLiveEvents(league: string, query: string): Promise<ScoreboardEvent[]> {
  const events = await callScoreboard(league);
  const q = query.trim().toLowerCase();
  if (!q) return events;
  return events.filter(e =>
    e.name.toLowerCase().includes(q) ||
    e.home.name.toLowerCase().includes(q) ||
    e.away.name.toLowerCase().includes(q)
  );
}

// Current status of an already-linked event -- same endpoint, since ESPN's
// scoreboard has no single-event route cheaper than refetching the day's board.
export async function fetchEventStatus(league: string, eventId: string): Promise<ScoreboardEvent | null> {
  const events = await callScoreboard(league);
  return events.find(e => e.id === eventId) ?? null;
}
