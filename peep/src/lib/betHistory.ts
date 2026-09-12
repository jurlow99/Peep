// Session-scoped record of settled prediction bets. There is no `place-bet`
// edge function or `market_bets` write yet (see CLAUDE.md's Predictions
// section) -- bets are local UI state, so this is local too: a settled
// result is appended here once, read back by the history panel. It resets
// when the tab closes; that's an accepted limit until real persistence
// exists, not an oversight.
export type BetHistoryEntry = {
  id: string;
  eventTitle?: string | null;
  question: string;
  optionLabel: string;
  stake: number;
  odds: number;
  won: boolean;
  payout: number; // total returned on a win, 0 on a loss (stake is the loss)
  settledAt: number;
};

const STORAGE_KEY = "peep_bet_history_v1";
const MAX_ENTRIES = 30;
const listeners = new Set<() => void>();

function readRaw(): BetHistoryEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let cache: BetHistoryEntry[] = readRaw();

export function getBetHistorySnapshot(): BetHistoryEntry[] {
  return cache;
}

export function subscribeBetHistory(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function recordBetResult(entry: BetHistoryEntry) {
  cache = [entry, ...cache].slice(0, MAX_ENTRIES);
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // storage full or unavailable -- history just won't survive a reload
  }
  listeners.forEach(fn => fn());
}
