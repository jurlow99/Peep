// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const read = vi.hoisted(() => vi.fn());
vi.mock("../supabase", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: read }) }) }) } }));
import { useChannelBlackout } from "./useChannelBlackout";

let host: HTMLDivElement, root: Root;
function Probe() {
  const state = useChannelBlackout(7);
  return createElement("div", null, state.loading ? "checking" : state.message || state.error || "playable");
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-26T22:00:00Z"));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); read.mockReset(); });
describe("watching channel blackout updates", () => {
  it("holds playback for the first check, then applies start/end without another fetch", async () => {
    let resolve: (value: unknown) => void;
    read.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    await act(async () => root.render(createElement(Probe)));
    expect(host.textContent).toBe("checking");
    await act(async () => resolve({ data: { id: 7, blackout_starts_at: "2026-10-26T22:00:01Z", blackout_ends_at: "2026-10-26T22:00:03Z", blackout_message: "Scheduled break" } }));
    expect(host.textContent).toBe("playable");
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(host.textContent).toBe("Scheduled break");
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(host.textContent).toBe("playable");
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("picks up a manual change and retains the last known blackout on a failed refresh", async () => {
    read.mockResolvedValueOnce({ data: { id: 7 } })
      .mockResolvedValueOnce({ data: { id: 7, blackout_enabled: true, blackout_message: "Maintenance" } })
      .mockResolvedValueOnce({ error: { message: "offline" } });
    await act(async () => root.render(createElement(Probe)));
    expect(host.textContent).toBe("playable");
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(host.textContent).toBe("Maintenance");
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(host.textContent).toBe("Maintenance");
  });
  it("does not start playback when the initial availability check fails", async () => {
    read.mockResolvedValue({ error: { message: "offline" } });
    await act(async () => root.render(createElement(Probe)));
    expect(host.textContent).toContain("availability couldn’t be checked");
  });
});
