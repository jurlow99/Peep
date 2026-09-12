// Session-scoped record of prediction bets -- placed AND settled. There is
// no `place-bet` edge function or `market_bets` write yet (see CLAUDE.md's
// Predictions section) -- bets are local UI state, so this is local too:
// a bet is appended the instant it's placed (status "pending") and the
// same entry is updated in place once its market settles. It resets when
// the tab closes; that's an accepted limit until real persistence exists,
// not an oversight.
export type BetStatus = "pending" | "won" | "lost";

export type BetHistoryEntry = {
  id: string;
  eventTitle?: string | null;
  question: string;
  optionLabel: string;
  stake: number;
  odds: number;
  status: BetStatus;
  payout: number; // total returned on a win, 0 while pending or on a loss
  placedAt: number;
  settledAt?: number;
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

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // storage full or unavailable -- history just won't survive a reload
  }
  listeners.forEach(fn => fn());
}

export function getBetHistorySnapshot(): BetHistoryEntry[] {
  return cache;
}

export function subscribeBetHistory(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

// Called the moment a bet is placed -- shows up in the panel immediately,
// as "pending", rather than waiting for the market to settle.
export function recordBetPlaced(entry: Omit<BetHistoryEntry, "status" | "payout">) {
  cache = [{ ...entry, status: "pending" as BetStatus, payout: 0 }, ...cache].slice(0, MAX_ENTRIES);
  persist();
}

// Called once the same bet's market settles -- updates the existing entry
// in place (matched by id) rather than adding a second row for one bet.
export function resolveBetResult(id: string, result: { won: boolean; payout: number; settledAt: number }) {
  cache = cache.map(e => e.id === id
    ? { ...e, status: (result.won ? "won" : "lost") as BetStatus, payout: result.payout, settledAt: result.settledAt }
    : e);
  persist();
}
