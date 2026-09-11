import { useState, useSyncExternalStore } from "react";
import { getOrCreateStore } from "../lib/marketStore";

/**
 * Which market MarketOverlay should currently show for a stream -- the most
 * recently opened one. Returns a primitive (string | null), so unlike a
 * per-market Market object this needs no reference-stability care: it only
 * changes, and only re-renders the overlay root, when a NEW market opens.
 *
 * v1 shows one market at a time. A stream running two concurrent markets
 * (a main line + a side prop) is an explicit non-goal for now -- see the
 * spec's note on this in §2.
 */
export function useLatestMarketId(streamId: string): string | null {
  const [store] = useState(() => getOrCreateStore(streamId));
  return useSyncExternalStore(store.subscribe, () => store.getSnapshot().latestMarketId);
}
