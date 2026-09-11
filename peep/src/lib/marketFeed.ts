import { supabase } from "../supabase";
import { createRevealScheduler, type RevealSchedulerOptions } from "./marketScheduler";
import type { MarketStore } from "./marketStore";
import type { MarketTick } from "./marketTypes";

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
