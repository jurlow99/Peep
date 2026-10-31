import { channelBlackout, DEFAULT_BLACKOUT_MESSAGE, localDateTimeValue } from "../../lib/channelBlackout";

export default function ChannelBlackoutEditor({ value, onChange }) {
  const set = patch => onChange({ ...value, ...patch });
  const scheduled = !!(value.blackout_starts_at || value.blackout_ends_at);
  const active = !!channelBlackout(value);
  const input = { width: "100%", boxSizing: "border-box", padding: 10, border: "1px solid #cbd5e1", borderRadius: 7, background: "white", color: "#0f172a", fontSize: 13 };
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <fieldset style={{ margin: "8px 0", padding: 16, border: "1px solid #cbd5e1", borderRadius: 10, color: "#0f172a" }}>
    <legend style={{ fontWeight: 700, fontSize: 14 }}>Channel blackout</legend>
    <p style={{ margin: "0 0 12px", fontSize: 12, color: "#475569" }}>Keep the channel listed and show a message instead of video on Apple TV, browser and mobile. Changes apply after saving.</p>
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}><input type="checkbox" checked={!!value.blackout_enabled} onChange={e => set({ blackout_enabled: e.target.checked })} />Black out now (until manually turned off)</label>
    <label style={{ display: "block", marginTop: 14, fontSize: 12 }}>Message viewers see
      <textarea maxLength={500} rows={3} value={value.blackout_message || ""} onChange={e => set({ blackout_message: e.target.value })} placeholder={DEFAULT_BLACKOUT_MESSAGE} style={{ ...input, marginTop: 6, resize: "vertical" }} />
    </label>
    <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 13, fontWeight: 600 }}><input type="checkbox" checked={scheduled} onChange={e => set(e.target.checked
      ? { blackout_starts_at: new Date().toISOString(), blackout_ends_at: new Date(Date.now() + 3600000).toISOString() }
      : { blackout_starts_at: null, blackout_ends_at: null })} />Schedule a blackout</label>
    {scheduled && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 12 }}>
      {[["Starts", "blackout_starts_at"], ["Ends", "blackout_ends_at"]].map(([label, key]) => <label key={key} style={{ fontSize: 12 }}>{label}
        <input type="datetime-local" value={localDateTimeValue(value[key])} onChange={e => set({ [key]: e.target.value ? new Date(e.target.value).toISOString() : null })} style={{ ...input, marginTop: 6 }} />
      </label>)}
    </div>}
    <p style={{ margin: "10px 0 0", fontSize: 12, color: "#475569" }}>Times use {timezone}. The scheduled blackout ends automatically. “Black out now” stays on even after the schedule ends.</p>
    <div role="status" style={{ marginTop: 12, padding: 12, background: "#f1f5f9", borderRadius: 7, fontSize: 12 }}><strong>{active ? "Blackout active in this draft" : scheduled ? "Schedule saved when you save the channel" : "No blackout"}</strong>{active && <p style={{ margin: "6px 0 0" }}>{channelBlackout(value)}</p>}</div>
  </fieldset>;
}
