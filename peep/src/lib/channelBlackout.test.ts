import { describe, expect, it } from "vitest";
import { blackoutFields, channelBlackout, DEFAULT_BLACKOUT_MESSAGE, localDateTimeValue } from "./channelBlackout";

const schedule = { blackout_starts_at: "2026-10-26T18:00:00-04:00", blackout_ends_at: "2026-10-26T19:00:00-04:00", blackout_message: "Game unavailable" };
describe("channel blackout", () => {
  it("keeps old channels playable and uses a fallback for blank messages", () => {
    expect(channelBlackout({})).toBeNull();
    expect(channelBlackout({ blackout_enabled: true, blackout_message: "  " })).toBe(DEFAULT_BLACKOUT_MESSAGE);
  });
  it("uses absolute times, including start and excluding end", () => {
    expect(channelBlackout(schedule, Date.parse("2026-10-26T21:59:59Z"))).toBeNull();
    expect(channelBlackout(schedule, Date.parse("2026-10-26T22:00:00Z"))).toBe("Game unavailable");
    expect(channelBlackout(schedule, Date.parse("2026-10-26T23:00:00Z"))).toBeNull();
  });
  it("keeps the manual override active after a schedule ends", () => {
    expect(channelBlackout({ ...schedule, blackout_enabled: true }, Date.parse("2026-10-27T00:00:00Z"))).toBe("Game unavailable");
    expect(channelBlackout({ ...schedule, blackout_enabled: false }, Date.parse("2026-10-26T22:30:00Z"))).toBe("Game unavailable");
  });
  it("does not treat partial or reversed schedules as active", () => {
    expect(channelBlackout({ blackout_starts_at: schedule.blackout_starts_at })).toBeNull();
    expect(channelBlackout({ ...schedule, blackout_ends_at: schedule.blackout_starts_at }, Date.parse("2026-10-26T22:00:00Z"))).toBeNull();
  });
  it("rejects incomplete windows, invalid dates and oversized messages before save", () => {
    expect(() => blackoutFields({ blackout_starts_at: schedule.blackout_starts_at })).toThrow(/end after/);
    expect(() => blackoutFields({ ...schedule, blackout_ends_at: schedule.blackout_starts_at })).toThrow();
    expect(() => blackoutFields({ ...schedule, blackout_starts_at: "bad" })).toThrow();
    expect(() => blackoutFields({ blackout_message: "a".repeat(501) })).toThrow(/500/);
  });
  it("normalizes dates to UTC and clears disabled schedules to null", () => {
    expect(blackoutFields(schedule)).toEqual({ blackout_enabled: false, blackout_message: "Game unavailable", blackout_starts_at: "2026-10-26T22:00:00.000Z", blackout_ends_at: "2026-10-26T23:00:00.000Z" });
    expect(blackoutFields({})).toEqual({ blackout_enabled: false, blackout_message: "", blackout_starts_at: null, blackout_ends_at: null });
    expect(localDateTimeValue(null)).toBe("");
  });
});
