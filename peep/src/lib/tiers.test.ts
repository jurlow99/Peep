import { describe, it, expect, vi, afterEach } from "vitest";

// tiers.js reads IS_DEV_DB from ./config at module load, and the whole point of
// the module is that it behaves differently on dev. So load it fresh per mode
// rather than testing only whichever environment the suite happens to run in.
async function loadTiers(isDevDb: boolean) {
  vi.resetModules();
  vi.doMock("./config", () => ({
    IS_DEV_DB: isDevDb,
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
  }));
  return await import("./tiers");
}

afterEach(() => { vi.doUnmock("./config"); });

describe("tiers on prod (gating active)", () => {
  it("ranks production below stage below test", async () => {
    const { tierLevel } = await loadTiers(false);
    expect(tierLevel("production")).toBe(0);
    expect(tierLevel("stage")).toBe(1);
    expect(tierLevel("test")).toBe(2);
  });

  it("treats an unknown or missing tier as production", async () => {
    const { tierLevel, canSeeTier } = await loadTiers(false);
    expect(tierLevel("nonsense")).toBe(0);
    expect(tierLevel(undefined)).toBe(0);
    expect(canSeeTier(null, null)).toBe(true);
  });

  it("lets a viewer see their own tier and everything below", async () => {
    const { canSeeTier } = await loadTiers(false);
    expect(canSeeTier("test", "test")).toBe(true);
    expect(canSeeTier("stage", "test")).toBe(true);
    expect(canSeeTier("production", "test")).toBe(true);
    expect(canSeeTier("stage", "stage")).toBe(true);
    expect(canSeeTier("production", "stage")).toBe(true);
    expect(canSeeTier("production", "production")).toBe(true);
  });

  it("hides content above the viewer's tier", async () => {
    const { canSeeTier } = await loadTiers(false);
    expect(canSeeTier("test", "production")).toBe(false);
    expect(canSeeTier("stage", "production")).toBe(false);
    expect(canSeeTier("test", "stage")).toBe(false);
  });

  it("filters a list by visibility_tier", async () => {
    const { filterByTier } = await loadTiers(false);
    const items = [
      { id: 1, visibility_tier: "production" },
      { id: 2, visibility_tier: "test" },
      { id: 3 },
    ];
    expect(filterByTier(items, "production").map((i: { id: number }) => i.id)).toEqual([1, 3]);
    expect(filterByTier(items, "test").map((i: { id: number }) => i.id)).toEqual([1, 2, 3]);
  });

  it("honours a custom tier key", async () => {
    const { filterByTier } = await loadTiers(false);
    const items = [{ id: 1, tier: "test" }, { id: 2, tier: "production" }];
    expect(filterByTier(items, "production", "tier").map((i: { id: number }) => i.id)).toEqual([2]);
  });

  it("passes non-arrays through untouched", async () => {
    const { filterByTier } = await loadTiers(false);
    expect(filterByTier(null, "production")).toBe(null);
    expect(filterByTier(undefined, "production")).toBe(undefined);
  });
});

describe("tiers on dev (gating disabled)", () => {
  it("shows every tier regardless of the viewer", async () => {
    const { canSeeTier } = await loadTiers(true);
    expect(canSeeTier("test", "production")).toBe(true);
    expect(canSeeTier("stage", "production")).toBe(true);
  });

  it("returns the list unfiltered, as the same reference", async () => {
    const { filterByTier } = await loadTiers(true);
    const items = [{ id: 1, visibility_tier: "test" }];
    expect(filterByTier(items, "production")).toBe(items);
  });
});
