import { useEffect } from "react";
import { getOrCreateStore, disposeStore } from "../lib/marketStore";
import { connectMarketFeed, seedFromSnapshot } from "../lib/marketFeed";
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

    // A backgrounded tab can have its WebSocket activity throttled by the
    // browser -- a tick that arrives during that window is lost outright,
    // since Broadcast has no replay. Re-reading current truth the moment
    // the tab is looked at again is the only way to catch back up.
    function onVisible() {
      if (document.visibilityState === "visible") seedFromSnapshot(streamId, store);
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      disconnect();
      disposeStore(streamId);
    };
    // schedulerOpts is expected to come in stable (created once by the
    // caller, e.g. via useRef) -- recreating it every render would thrash
    // the feed connection, so it's intentionally left out of the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId]);
}
