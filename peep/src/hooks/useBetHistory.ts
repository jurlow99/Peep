import { useSyncExternalStore } from "react";
import { getBetHistorySnapshot, subscribeBetHistory, type BetHistoryEntry } from "../lib/betHistory";

export function useBetHistory(): BetHistoryEntry[] {
  return useSyncExternalStore(subscribeBetHistory, getBetHistorySnapshot);
}
