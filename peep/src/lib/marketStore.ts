import type { Market, MarketOption, MarketTick } from "./marketTypes";

/** All markets for one stream, keyed by market id. */
export interface MarketStoreState {
  markets: Record<string, Market>;
  lastEventAt: number;
  /** Id of the most recently OPENED market -- a string/null primitive, so a
   * selector reading just this field is trivially stable across renders
   * without needing object-reference bookkeeping. See useLatestMarketId. */
  latestMarketId: string | null;
}

const EMPTY_STATE: MarketStoreState = { markets: {}, lastEventAt: 0, latestMarketId: null };

/**
 * Pure reducer: applies one tick to the current market map and returns the
 * next one. Returns the SAME reference when the tick changes nothing, so
 * callers can skip a re-render/notify on a no-op.
 *
 * Seq gating lives here, not in the feed: a tick whose seq doesn't advance
 * the market it targets is dropped, and any tick other than "open" for a
 * market this store hasn't seen yet is dropped too (see spec §3 -- a late
 * joiner reconciles via a snapshot fetch, not by trusting an orphaned tick).
 */
export function applyMarketTick(
  markets: Record<string, Market>,
  tick: MarketTick
): Record<string, Market> {
  const existing = markets[tick.marketId];

  if (tick.type !== "open" && !existing) return markets;
  if (existing && tick.seq <= existing.seq) return markets;

  let next: Market;
  switch (tick.type) {
    case "open":
      next = {
        id: tick.marketId,
        streamId: existing?.streamId ?? "",
        question: tick.question,
        status: "open",
        options: tick.options,
        locksAt: tick.locksAt,
        winningKey: null,
        seq: tick.seq,
      };
      break;
    case "price": {
      const priced = new Map(tick.options.map(o => [o.key, o.odds]));
      next = {
        ...existing!,
        options: existing!.options.map((o: MarketOption) =>
          priced.has(o.key) ? { ...o, odds: priced.get(o.key)! } : o
        ),
        seq: tick.seq,
      };
      break;
    }
    case "lock":
      next = { ...existing!, status: "locked", seq: tick.seq };
      break;
    case "settle":
      next = { ...existing!, status: "settled", winningKey: tick.winningKey, seq: tick.seq };
      break;
  }

  return { ...markets, [tick.marketId]: next };
}

export interface MarketStore {
  getSnapshot: () => MarketStoreState;
  subscribe: (listener: () => void) => () => void;
  applyTick: (tick: MarketTick) => void;
}

export function createMarketStore(streamId: string): MarketStore {
  let state: MarketStoreState = EMPTY_STATE;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    applyTick(tick) {
      const markets = applyMarketTick(state.markets, tick);
      if (markets === state.markets) return; // no-op tick -- don't notify
      state = {
        markets,
        lastEventAt: Date.now(),
        latestMarketId: tick.type === "open" ? tick.marketId : state.latestMarketId,
      };
      listeners.forEach(l => l());
    },
  };
}

// One store per mounted player. A plain Map is fine here -- players are
// disposed explicitly (see disposeStore) rather than garbage-collected.
const registry = new Map<string, MarketStore>();

export function getOrCreateStore(streamId: string): MarketStore {
  let store = registry.get(streamId);
  if (!store) {
    store = createMarketStore(streamId);
    registry.set(streamId, store);
  }
  return store;
}

/** Call on player unmount so a closed stream's store doesn't linger. */
export function disposeStore(streamId: string): void {
  registry.delete(streamId);
}
