import { describe, it, expect } from "vitest";
import { applyMarketTick, createMarketStore, getOrCreateStore, disposeStore } from "./marketStore";
import type { MarketTick } from "./marketTypes";

const open: MarketTick = {
  type: "open",
  marketId: "m1",
  seq: 1,
  eventTs: 1000,
  question: "10+ yard gain?",
  options: [
    { key: "yes", label: "Yes", odds: 2.1 },
    { key: "no", label: "No", odds: 1.74 },
  ],
  locksAt: 30000,
};

describe("applyMarketTick", () => {
  it("creates a market from an open tick", () => {
    const markets = applyMarketTick({}, open);
    expect(markets.m1).toMatchObject({ status: "open", question: open.question, seq: 1 });
    expect(markets.m1.options).toHaveLength(2);
  });

  it("updates only the priced options on a price tick", () => {
    const afterOpen = applyMarketTick({}, open);
    const priced = applyMarketTick(afterOpen, {
      type: "price", marketId: "m1", seq: 2, eventTs: 1100,
      options: [{ key: "yes", odds: 2.35 }],
    });
    expect(priced.m1.options.find(o => o.key === "yes")?.odds).toBe(2.35);
    expect(priced.m1.options.find(o => o.key === "no")?.odds).toBe(1.74); // untouched
    expect(priced.m1.seq).toBe(2);
  });

  it("locks and settles in sequence", () => {
    let markets = applyMarketTick({}, open);
    markets = applyMarketTick(markets, { type: "lock", marketId: "m1", seq: 2, eventTs: 1200 });
    expect(markets.m1.status).toBe("locked");

    markets = applyMarketTick(markets, { type: "settle", marketId: "m1", seq: 3, eventTs: 1300, winningKey: "yes" });
    expect(markets.m1.status).toBe("settled");
    expect(markets.m1.winningKey).toBe("yes");
  });

  it("drops a tick for a market it has never seen (anything but open)", () => {
    const markets = applyMarketTick({}, { type: "lock", marketId: "ghost", seq: 1, eventTs: 1000 });
    expect(markets).toEqual({});
  });

  it("drops a stale or duplicate seq, returning the same reference", () => {
    const afterOpen = applyMarketTick({}, open);
    const replay = applyMarketTick(afterOpen, { ...open, seq: 1 }); // same seq, replayed
    expect(replay).toBe(afterOpen); // reference equality -- no-op, not just equal

    const behind = applyMarketTick(afterOpen, { type: "lock", marketId: "m1", seq: 0, eventTs: 999 });
    expect(behind).toBe(afterOpen);
  });

  it("leaves markets for other ids untouched (top-level spread preserves identity)", () => {
    const withM1 = applyMarketTick({}, open);
    const withBoth = applyMarketTick(withM1, { ...open, marketId: "m2" });
    expect(withBoth.m1).toBe(withM1.m1); // same object reference, not just equal
  });
});

describe("createMarketStore", () => {
  it("notifies subscribers on a real change and updates the snapshot", () => {
    const store = createMarketStore("s1");
    let notified = 0;
    store.subscribe(() => { notified += 1; });

    store.applyTick(open);
    expect(notified).toBe(1);
    expect(store.getSnapshot().markets.m1.status).toBe("open");
  });

  it("does not notify on a dropped (no-op) tick", () => {
    const store = createMarketStore("s1");
    store.applyTick(open);
    let notified = 0;
    store.subscribe(() => { notified += 1; });

    store.applyTick({ ...open, seq: 1 }); // replay, same seq
    expect(notified).toBe(0);
  });

  it("tracks latestMarketId on open, and leaves it alone for price/lock/settle", () => {
    const store = createMarketStore("s1");
    expect(store.getSnapshot().latestMarketId).toBeNull();

    store.applyTick(open);
    expect(store.getSnapshot().latestMarketId).toBe("m1");

    store.applyTick({ type: "price", marketId: "m1", seq: 2, eventTs: 1100, options: [{ key: "yes", odds: 2.2 }] });
    expect(store.getSnapshot().latestMarketId).toBe("m1");

    store.applyTick({ ...open, marketId: "m2", seq: 1 });
    expect(store.getSnapshot().latestMarketId).toBe("m2"); // a newer market takes over

    store.applyTick({ type: "lock", marketId: "m1", seq: 3, eventTs: 1200 });
    expect(store.getSnapshot().latestMarketId).toBe("m2"); // locking m1 doesn't reclaim it
  });

  it("does not update latestMarketId for a dropped (no-op) open", () => {
    const store = createMarketStore("s1");
    store.applyTick(open);
    store.applyTick({ ...open, marketId: "m2", seq: 1 });
    expect(store.getSnapshot().latestMarketId).toBe("m2");

    store.applyTick({ ...open, seq: 1 }); // replaying m1's open, same seq -- dropped
    expect(store.getSnapshot().latestMarketId).toBe("m2");
  });

  it("unsubscribe stops further notifications", () => {
    const store = createMarketStore("s1");
    let notified = 0;
    const unsubscribe = store.subscribe(() => { notified += 1; });
    unsubscribe();

    store.applyTick(open);
    expect(notified).toBe(0);
  });
});

describe("store registry", () => {
  it("returns the same instance for the same streamId", () => {
    expect(getOrCreateStore("reg-1")).toBe(getOrCreateStore("reg-1"));
  });

  it("disposeStore drops state so the next getOrCreateStore starts fresh", () => {
    const first = getOrCreateStore("reg-2");
    first.applyTick(open);
    expect(first.getSnapshot().markets.m1).toBeDefined();

    disposeStore("reg-2");
    const second = getOrCreateStore("reg-2");
    expect(second).not.toBe(first);
    expect(second.getSnapshot().markets.m1).toBeUndefined();
  });
});
