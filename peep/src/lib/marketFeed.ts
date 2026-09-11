import { supabase } from "../supabase";
import { createRevealScheduler, type RevealSchedulerOptions } from "./marketScheduler";
import type { MarketStore } from "./marketStore";
import type { MarketTick } from "./marketTypes";

/**
 * A viewer who mounts AFTER a market already opened sees nothing without
 * this: Broadcast has no history, so the one-time "open" tick that
 * established it is long gone. This reads the market's current row from
 * the DB and replays it into the store as the same tick types a live feed
 * would send, before any real ticks start arriving -- closing exactly the
 * reconnect gap applyMarketTick's own doc comment named as deferred.
 *
 * Reconstructs seq exactly: each synthetic tick after "open" uses the DB
 * row's real current `seq` (or one less, for an intermediate step), so a
 * genuine live tick published after this -- which always uses
 * market.seq + 1 at publish time -- lands with a strictly greater seq and
 * is never mistaken for a stale replay.
 */
async function seedFromSnapshot(streamId: string, store: MarketStore): Promise<void> {
  const eventId = Number(streamId);
  if (!Number.isFinite(eventId)) return; // not a real event id (e.g. the mock script's dev-stream-1) -- nothing to seed

  const { data: market } = await supabase
    .from("prediction_markets")
    .select("*, market_options(*)")
    .eq("event_id", eventId)
    .neq("status", "void")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!market) return;

  const options = (market.market_options || []).map((o: { key: string; label: string; odds: number }) => ({
    key: o.key, label: o.label, odds: Number(o.odds),
  }));
  const now = Date.now();
  const marketId = String(market.id);

  store.applyTick({
    type: "open", marketId, seq: 1, eventTs: now,
    question: market.question, options,
    locksAt: market.locks_at ? new Date(market.locks_at).getTime() : null,
  });

  if (market.status === "locked" || market.status === "settled") {
    const lockSeq = market.status === "settled" ? Math.max(2, market.seq - 1) : market.seq;
    store.applyTick({ type: "lock", marketId, seq: lockSeq, eventTs: now });
  }
  if (market.status === "settled") {
    const winner = (market.market_options || []).find((o: { id: number }) => o.id === market.winning_option_id);
    if (winner) store.applyTick({ type: "settle", marketId, seq: market.seq, eventTs: now, winningKey: winner.key });
  }
}

/**
 * Subscribes to `market:{streamId}` and pipes ticks through a reveal
 * scheduler into the store -- see spec §3 for why ticks are held rather
 * than applied on arrival. Broadcast, not Postgres Changes: no DB write per
 * tick, matching the ephemeral (never-persisted) nature of a price tick.
 */
export function connectMarketFeed(
  streamId: string,
  store: MarketStore,
  schedulerOpts?: RevealSchedulerOptions
): { disconnect: () => void } {
  const scheduler = createRevealScheduler(schedulerOpts);

  seedFromSnapshot(streamId, store); // fire-and-forget -- live ticks below still apply correctly on top regardless of ordering, via seq gating

  const channel = supabase.channel(`market:${streamId}`, {
    config: { broadcast: { self: false, ack: false } },
  });

  channel.on("broadcast", { event: "tick" }, ({ payload }) => {
    scheduler.schedule(payload as MarketTick, (tick: MarketTick) => store.applyTick(tick));
  });

  channel.subscribe();

  return {
    disconnect() {
      scheduler.cancelAll();
      supabase.removeChannel(channel);
    },
  };
}
