import type { MarketTick } from "./marketTypes";

/** Fixed cushion on top of measured latency -- see spec §3: the overlay is
 * deliberately a little slow rather than ever ahead of what's on screen. */
export const DEFAULT_JITTER_BUFFER_MS = 250;

/** A real Cloudflare Stream live edge sits 6-18s behind (spec §3). A bad
 * getPlayerLatencyMs reading -- e.g. hls.js reporting a liveSyncPosition
 * against a VOD with no live edge at all -- can produce a delay of any
 * size, holding a tick for what looks like forever with no error anywhere.
 * Capping the total delay means a bad reading costs a late reveal, not a
 * silently stuck one, regardless of what fed it a bad number. */
export const MAX_REVEAL_DELAY_MS = 30_000;

export interface RevealSchedulerOptions {
  /** server_ts - client_ts, in ms. Defaults to 0 until a /v1/time endpoint
   * exists to measure it (see measureClockOffset below). */
  getClockOffsetMs?: () => number;
  /** hls.liveSyncPosition - video.currentTime, in ms. Defaults to 0 until
   * this is wired to a mounted player. */
  getPlayerLatencyMs?: () => number;
  jitterBufferMs?: number;
  /** Injectable clock, epoch ms. Deliberately NOT performance.now() --
   * that's relative to navigation start, not wall-clock time, and ticks
   * carry an origin-stamped eventTs that only makes sense against Date.now(). */
  now?: () => number;
}

export interface RevealScheduler {
  /** Holds `tick` until its reveal time, then calls onReveal. Fires
   * immediately (next microtask) if that time has already passed. */
  schedule: (tick: MarketTick, onReveal: (tick: MarketTick) => void) => void;
  /** Clears every pending reveal without firing them. */
  cancelAll: () => void;
}

export function createRevealScheduler(opts: RevealSchedulerOptions = {}): RevealScheduler {
  const getClockOffsetMs = opts.getClockOffsetMs ?? (() => 0);
  const getPlayerLatencyMs = opts.getPlayerLatencyMs ?? (() => 0);
  const jitterBufferMs = opts.jitterBufferMs ?? DEFAULT_JITTER_BUFFER_MS;
  const now = opts.now ?? Date.now;

  const timers = new Set<ReturnType<typeof setTimeout>>();

  return {
    schedule(tick, onReveal) {
      const revealAt = tick.eventTs + getClockOffsetMs() + getPlayerLatencyMs() + jitterBufferMs;
      const delay = Math.min(MAX_REVEAL_DELAY_MS, Math.max(0, revealAt - now()));
      const timer = setTimeout(() => {
        timers.delete(timer);
        onReveal(tick);
      }, delay);
      timers.add(timer);
    },
    cancelAll() {
      timers.forEach(t => clearTimeout(t));
      timers.clear();
    },
  };
}

/**
 * One clock-offset sample against a `{ serverTs: number }` endpoint. Assumes
 * the server captured its timestamp at the round trip's midpoint -- precise
 * enough for a jitter budget measured in hundreds of ms, not a real NTP
 * implementation. Positive result = server clock is ahead of the client's.
 */
export async function measureClockOffset(
  timeEndpoint: string,
  now: () => number = Date.now
): Promise<number> {
  const sentAt = now();
  const res = await fetch(timeEndpoint);
  const receivedAt = now();
  const { serverTs } = (await res.json()) as { serverTs: number };
  return serverTs - (sentAt + (receivedAt - sentAt) / 2);
}

/** Median of `samples` round trips -- one bad sample (a stalled request,
 * a slow tab) doesn't skew the offset. Matches the 30s re-measure / median-
 * of-5 cadence called out in spec §3. */
export async function measureClockOffsetMedian(
  timeEndpoint: string,
  samples = 5,
  now: () => number = Date.now
): Promise<number> {
  const offsets: number[] = [];
  for (let i = 0; i < samples; i++) {
    offsets.push(await measureClockOffset(timeEndpoint, now));
  }
  offsets.sort((a, b) => a - b);
  return offsets[Math.floor(offsets.length / 2)];
}
