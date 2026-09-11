import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRevealScheduler, measureClockOffset, measureClockOffsetMedian, DEFAULT_JITTER_BUFFER_MS, MAX_REVEAL_DELAY_MS } from "./marketScheduler";
import type { MarketTick } from "./marketTypes";

const tick: MarketTick = { type: "lock", marketId: "m1", seq: 1, eventTs: 1_000_000 };

describe("createRevealScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("holds a tick until eventTs + offset + latency + jitter has passed", () => {
    const scheduler = createRevealScheduler({
      getClockOffsetMs: () => 200,
      getPlayerLatencyMs: () => 8000,
      jitterBufferMs: 250,
      now: () => 1_000_000, // frozen "now" at eventTs
    });
    const onReveal = vi.fn();
    scheduler.schedule(tick, onReveal);

    // total delay = 200 + 8000 + 250 = 8450ms
    vi.advanceTimersByTime(8449);
    expect(onReveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onReveal).toHaveBeenCalledWith(tick);
  });

  it("uses the default jitter buffer when none is given", () => {
    const scheduler = createRevealScheduler({ now: () => 1_000_000 });
    const onReveal = vi.fn();
    scheduler.schedule(tick, onReveal);

    vi.advanceTimersByTime(DEFAULT_JITTER_BUFFER_MS - 1);
    expect(onReveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onReveal).toHaveBeenCalledOnce();
  });

  it("fires immediately (delay clamped to 0) when the reveal time has already passed", () => {
    const scheduler = createRevealScheduler({ now: () => 2_000_000, jitterBufferMs: 0 }); // now is way past eventTs
    const onReveal = vi.fn();
    scheduler.schedule(tick, onReveal);

    vi.advanceTimersByTime(0);
    expect(onReveal).toHaveBeenCalledWith(tick);
  });

  it("caps the delay so a bad latency reading can't hold a tick indefinitely", () => {
    // A real bug this guards against: hls.js reporting a liveSyncPosition
    // against a VOD test stream produced a computed latency over 10
    // minutes long -- nothing was broken, it was just scheduled correctly
    // for a nonsense delay. This proves that can't happen regardless of
    // how bad the input is.
    const scheduler = createRevealScheduler({
      getPlayerLatencyMs: () => 600_000_000, // absurd, e.g. a VOD misreported as live
      now: () => 1_000_000,
    });
    const onReveal = vi.fn();
    scheduler.schedule(tick, onReveal);

    vi.advanceTimersByTime(MAX_REVEAL_DELAY_MS - 1);
    expect(onReveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onReveal).toHaveBeenCalledWith(tick);
  });

  it("cancelAll clears pending reveals without firing them", () => {
    const scheduler = createRevealScheduler({ now: () => 1_000_000, jitterBufferMs: 100 });
    const onReveal = vi.fn();
    scheduler.schedule(tick, onReveal);
    scheduler.cancelAll();

    vi.advanceTimersByTime(10_000);
    expect(onReveal).not.toHaveBeenCalled();
  });
});

describe("measureClockOffset", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("estimates offset assuming the server timestamp lands at the round trip's midpoint", async () => {
    // client sends at 1000, server reports 1050, client receives at 1020 -> RT 20, midpoint 1010
    // offset = 1050 - 1010 = 40
    const clock = [1000, 1020];
    const now = () => clock.shift()!;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ serverTs: 1050 }) }));

    const offset = await measureClockOffset("/v1/time", now);
    expect(offset).toBe(40);
  });
});

describe("measureClockOffsetMedian", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("picks the median sample so one outlier does not skew the result", async () => {
    let call = 0;
    const serverTimes = [100, 500, 110, 105, 95]; // 500 is a stalled-request outlier
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      const serverTs = serverTimes[call++];
      return Promise.resolve({ json: async () => ({ serverTs }) });
    }));

    const offset = await measureClockOffsetMedian("/v1/time", 5, () => 0);
    // with now() pinned at 0, offset === serverTs for each sample; median of [95,100,105,110,500] is 105
    expect(offset).toBe(105);
  });
});
