import { useEffect } from "react";
import { getOrCreateStore, disposeStore } from "../lib/marketStore";
import { connectMarketFeed } from "../lib/marketFeed";
import type { RevealSchedulerOptions } from "../lib/marketScheduler";

/**
 * Connects the `market:{streamId}` Broadcast feed and tears it down on
 * unmount. Call this ONCE per mounted player -- individual chips/cards read
 * state with useMarket instead of calling this again.
 */
export function useMarketFeed(streamId: string, schedulerOpts?: RevealSchedulerOptions): void {
  useEffect(() => {
    const store = getOrCreateStore(streamId);
    const { disconnect } = connectMarketFeed(streamId, store, schedulerOpts);
    return () => {
      disconnect();
      disposeStore(streamId);
    };
    // schedulerOpts is expected to come in stable (created once by the
    // caller, e.g. via useRef) -- recreating it every render would thrash
    // the feed connection, so it's intentionally left out of the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId]);
}
