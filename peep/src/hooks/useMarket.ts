import { useState, useSyncExternalStore } from "react";
import { getOrCreateStore } from "../lib/marketStore";
import type { Market } from "../lib/marketTypes";

/**
 * Reads one market's live state and re-renders only when THIS market
 * changes -- not on every tick for the whole stream (see marketStore.ts).
 * Call useMarketFeed once per player to connect the feed; this hook only
 * reads from whatever store useMarketFeed is writing into.
 *
 * `streamId` is assumed stable for the component's lifetime, matching how a
 * player is mounted -- switching streams remounts the player rather than
 * handing the same instance a new streamId.
 */
export function useMarket(streamId: string, marketId: string): Market | undefined {
  // Lazy initial state: the React-sanctioned way to touch an external
  // singleton (the store registry) exactly once during render.
  const [store] = useState(() => getOrCreateStore(streamId));
  return useSyncExternalStore(store.subscribe, () => store.getSnapshot().markets[marketId]);
}
