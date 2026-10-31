// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import ChannelBlackoutEditor from "./ChannelBlackoutEditor";
import { blackoutFields } from "../../lib/channelBlackout";

it("lets an admin set a manual blackout, message and local schedule, then clear both", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  let value = { blackout_enabled: false, blackout_message: "", blackout_starts_at: null, blackout_ends_at: null };
  const render = () => root.render(createElement(ChannelBlackoutEditor, { value, onChange: next => { value = next; render(); } }));
  try {
    await act(async () => render());
    const toggles = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    await act(async () => toggles[0].click());
    expect(host.textContent).toContain("Blackout active in this draft");
    await act(async () => toggles[1].click());
    const fields = host.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]');
    expect(fields).toHaveLength(2);
    expect(fields[0].value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(Date.parse(value.blackout_ends_at!)).toBeGreaterThan(Date.parse(value.blackout_starts_at!));
    expect(blackoutFields(value).blackout_enabled).toBe(true);
    expect(host.textContent).toContain("Times use");
    await act(async () => toggles[1].click());
    await act(async () => toggles[0].click());
    expect(blackoutFields(value)).toMatchObject({ blackout_enabled: false, blackout_starts_at: null, blackout_ends_at: null });
    expect(host.textContent).toContain("No blackout");
  } finally { await act(async () => root.unmount()); host.remove(); }
});
