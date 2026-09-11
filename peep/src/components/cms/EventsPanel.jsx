import { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabase";
import Drawer from "./Drawer";
import { OddsOption } from "../player/MarketOverlay";
import { CARD_STYLE } from "../player/marketCardStyle";

const EMPTY_EVENT = { title: "", description: "", thumbnail: "", hero_url: "", stream_url: "", stream_uid: "", starts_at: "", status: "scheduled" };
const EMPTY_OPTIONS = [{ label: "Yes", odds: "2.00" }, { label: "No", odds: "1.80" }];

// The client matches ticks to options by a short internal "key" (see
// marketFeed.ts), but there's no reason to make an admin invent one --
// it's derived from the label they already typed, with a numeric suffix
// if two labels collide (e.g. two blank rows both becoming "option_1").
function slugifyKey(label, fallbackIndex) {
  const base = (label || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || `option_${fallbackIndex + 1}`;
}
function keyOptionRows(options) {
  const used = new Set();
  return options.map((o, i) => {
    let key = slugifyKey(o.label, i);
    while (used.has(key)) key = `${key}_2`;
    used.add(key);
    return { ...o, key };
  });
}

const STATUS_COLOR = { scheduled: "#818cf8", live: "#22c55e", ended: "#9ca3af" };
const MARKET_STATUS_COLOR = { open: "#22c55e", locked: "#f59e0b", settled: "#818cf8", void: "#9ca3af" };

/**
 * Curated prediction events -- the content type this admin's markets attach
 * to (not a live creator stream or a FAST channel; see the Predictions tab
 * on the viewer side). Manages the event itself plus each market's full
 * lifecycle: create+open, reprice, lock, settle -- publishing the same
 * Broadcast ticks the client's marketFeed/mock script expect on
 * `market:{eventId}`, and persisting the market/options/resolution rows
 * that back them (the tick stream itself is never persisted).
 */
export default function EventsPanel({ showToast, logAudit }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_EVENT);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const [expandedId, setExpandedId] = useState(null);
  const [marketsByEvent, setMarketsByEvent] = useState({});
  const [marketQuestion, setMarketQuestion] = useState("");
  const [marketOptions, setMarketOptions] = useState(EMPTY_OPTIONS);
  const [marketSaving, setMarketSaving] = useState(false);

  const channelsRef = useRef(new Map()); // eventId -> subscribed RealtimeChannel, reused across actions

  useEffect(() => { loadEvents(); }, []);
  useEffect(() => {
    const channels = channelsRef.current;
    return () => { channels.forEach(ch => supabase.removeChannel(ch)); channels.clear(); };
  }, []);

  async function loadEvents() {
    setLoading(true);
    const { data } = await supabase.from("prediction_events").select("*").order("starts_at", { ascending: false });
    setEvents(data || []);
    setLoading(false);
  }

  function startEdit(ev) {
    setEditingId(ev.id);
    setForm({
      title: ev.title ?? "", description: ev.description ?? "", thumbnail: ev.thumbnail ?? "",
      hero_url: ev.hero_url ?? "", stream_url: ev.stream_url ?? "", stream_uid: ev.stream_uid ?? "",
      starts_at: ev.starts_at ? ev.starts_at.slice(0, 16) : "", status: ev.status ?? "scheduled",
    });
    setDrawerOpen(true);
  }

  async function saveEvent() {
    setSaving(true);
    const payload = { ...form, starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null };
    const { error } = editingId
      ? await supabase.from("prediction_events").update(payload).eq("id", editingId)
      : await supabase.from("prediction_events").insert(payload);
    setSaving(false);
    if (error) { showToast("Error: " + error.message, "error"); return; }
    logAudit?.(editingId ? "update" : "create", "prediction_event", editingId, form.title);
    showToast(editingId ? "Event updated" : "Event created");
    setDrawerOpen(false);
    setEditingId(null);
    setForm(EMPTY_EVENT);
    loadEvents();
  }

  async function deleteEvent(id) {
    await supabase.from("prediction_events").delete().eq("id", id);
    setDeleteConfirm(null);
    showToast("Event deleted");
    loadEvents();
  }

  async function toggleExpand(eventId) {
    if (expandedId === eventId) { setExpandedId(null); return; }
    setExpandedId(eventId);
    if (!marketsByEvent[eventId]) await loadMarkets(eventId);
  }

  async function loadMarkets(eventId) {
    const { data } = await supabase.from("prediction_markets")
      .select("*, market_options(*)").eq("event_id", eventId).order("created_at", { ascending: false });
    setMarketsByEvent(prev => ({ ...prev, [eventId]: data || [] }));
  }

  // One subscribed channel per event, created on first use and reused --
  // matches the mock script's subscribe-then-send shape (marketFeed.ts §3).
  async function getEventChannel(eventId) {
    const existing = channelsRef.current.get(eventId);
    if (existing) return existing;
    const channel = supabase.channel(`market:${eventId}`, { config: { broadcast: { self: false, ack: false } } });
    await new Promise((resolve, reject) => {
      channel.subscribe(status => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(status));
      });
    });
    channelsRef.current.set(eventId, channel);
    return channel;
  }

  async function publishTick(eventId, payload) {
    const channel = await getEventChannel(eventId);
    await channel.send({ type: "broadcast", event: "tick", payload: { ...payload, eventTs: Date.now() } });
  }

  function updateMarketOption(i, field, value) {
    setMarketOptions(opts => opts.map((o, idx) => (idx === i ? { ...o, [field]: value } : o)));
  }

  // Creating a market and opening it are the same action -- there's no
  // "draft" state; a market only exists once viewers can see it.
  async function createAndOpenMarket(eventId) {
    if (!marketQuestion.trim() || marketOptions.some(o => !o.label.trim() || !(Number(o.odds) > 0))) {
      showToast("Question needs a label and a payout for every option", "error");
      return;
    }
    setMarketSaving(true);
    const { data: market, error } = await supabase.from("prediction_markets")
      .insert({ event_id: eventId, question: marketQuestion.trim(), status: "open", seq: 1 })
      .select().single();
    if (error) { showToast("Error: " + error.message, "error"); setMarketSaving(false); return; }

    const optionRows = keyOptionRows(marketOptions).map((o, i) => ({
      market_id: market.id, key: o.key, label: o.label.trim(), odds: Number(o.odds) || 1, sort_order: i,
    }));
    const { data: savedOptions } = await supabase.from("market_options").insert(optionRows).select();

    await publishTick(eventId, {
      type: "open", marketId: String(market.id), seq: 1,
      question: market.question,
      options: (savedOptions || optionRows).map(o => ({ key: o.key, label: o.label, odds: Number(o.odds) })),
      locksAt: null,
    });

    logAudit?.("create", "prediction_market", market.id, market.question);
    showToast("Market opened");
    setMarketQuestion(""); setMarketOptions(EMPTY_OPTIONS); setMarketSaving(false);
    loadMarkets(eventId);
  }

  async function repriceOption(eventId, market, option, newOdds) {
    const odds = Number(newOdds);
    if (!odds || odds <= 0) return;
    await supabase.from("market_options").update({ odds }).eq("id", option.id);
    const seq = market.seq + 1;
    await supabase.from("prediction_markets").update({ seq }).eq("id", market.id);
    await publishTick(eventId, { type: "price", marketId: String(market.id), seq, options: [{ key: option.key, odds }] });
    loadMarkets(eventId);
  }

  async function lockMarket(eventId, market) {
    const seq = market.seq + 1;
    await supabase.from("prediction_markets").update({ status: "locked", seq }).eq("id", market.id);
    await publishTick(eventId, { type: "lock", marketId: String(market.id), seq });
    logAudit?.("update", "prediction_market", market.id, "locked");
    showToast("Market locked");
    loadMarkets(eventId);
  }

  async function settleMarket(eventId, market, winningOption) {
    if (!window.confirm(`Settle "${market.question}" with "${winningOption.label}" as the winner? This can't be undone.`)) return;
    const seq = market.seq + 1;
    await supabase.from("prediction_markets").update({ status: "settled", winning_option_id: winningOption.id, seq }).eq("id", market.id);
    await supabase.from("market_resolutions").insert({ market_id: market.id, winning_option_id: winningOption.id });
    await publishTick(eventId, { type: "settle", marketId: String(market.id), seq, winningKey: winningOption.key });
    logAudit?.("update", "prediction_market", market.id, `settled -> ${winningOption.label}`);
    showToast("Market settled");
    loadMarkets(eventId);
  }

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Prediction Events</h2>
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Curated broadcasts markets attach to -- create an event, then open/lock/settle markets against it.</p>
        </div>
        <button onClick={() => { setEditingId(null); setForm(EMPTY_EVENT); setDrawerOpen(true); }}
          style={{ padding: "10px 18px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          + New Event
        </button>
      </div>

      {loading ? (
        <div style={{ color: "#6b7280", padding: 40, textAlign: "center" }}>Loading…</div>
      ) : events.length === 0 ? (
        <div style={{ color: "#9ca3af", padding: 40, textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 10 }}>No events yet.</div>
      ) : events.map(ev => (
        <div key={ev.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => toggleExpand(ev.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#6b7280", padding: 4 }}>
              {expandedId === ev.id ? "▾" : "▸"}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{ev.title}</p>
              <p style={{ margin: 0, fontSize: 11.5, color: "#9ca3af" }}>{ev.starts_at ? new Date(ev.starts_at).toLocaleString() : "No schedule set"}</p>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: STATUS_COLOR[ev.status] ?? "#6b7280", background: `${STATUS_COLOR[ev.status] ?? "#6b7280"}18`, padding: "3px 8px", borderRadius: 99 }}>{ev.status}</span>
            <button onClick={() => startEdit(ev)} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer" }}>Edit</button>
            {deleteConfirm === ev.id ? (
              <button onClick={() => deleteEvent(ev.id)} style={{ background: "#dc2626", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer" }}>Confirm</button>
            ) : (
              <button onClick={() => setDeleteConfirm(ev.id)} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#dc2626", cursor: "pointer" }}>Delete</button>
            )}
          </div>

          {expandedId === ev.id && (
            <div style={{ borderTop: "1px solid #e2e8f0", background: "#f8fafc", padding: "14px 16px" }}>
              {(marketsByEvent[ev.id] || []).map(m => (
                <div key={m.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <p style={{ margin: 0, flex: 1, fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{m.question}</p>
                    <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MARKET_STATUS_COLOR[m.status], background: `${MARKET_STATUS_COLOR[m.status]}18`, padding: "3px 7px", borderRadius: 99 }}>{m.status}</span>
                    {m.status === "open" && <button onClick={() => lockMarket(ev.id, m)} style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600, color: "#92400e", cursor: "pointer" }}>Lock</button>}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(m.market_options || []).map(o => (
                      <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 8px" }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: m.winning_option_id === o.id ? "#16a34a" : "#374151" }}>{o.label}{m.winning_option_id === o.id ? " ✓" : ""}</span>
                        {m.status === "open" ? (
                          <input type="number" step="0.01" defaultValue={o.odds} onBlur={e => e.target.value !== String(o.odds) && repriceOption(ev.id, m, o, e.target.value)}
                            style={{ width: 52, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, padding: "2px 5px", fontSize: 11, color: "#0f172a", textAlign: "center" }} />
                        ) : (
                          <span style={{ fontSize: 11, color: "#9ca3af" }}>{Number(o.odds).toFixed(2)}×</span>
                        )}
                        {m.status === "locked" && (
                          <button onClick={() => settleMarket(ev.id, m, o)} style={{ background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 4, padding: "2px 7px", fontSize: 10.5, fontWeight: 600, color: "#166534", cursor: "pointer" }}>Settle: wins</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div style={{ background: "#fff", border: "1px dashed #cbd5e1", borderRadius: 8, padding: "12px 14px", display: "flex", gap: 20, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 280px", minWidth: 260 }}>
                  <p style={{ margin: "0 0 8px", fontSize: 11.5, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>New market</p>

                  <MiniLabel>Question — what viewers are predicting</MiniLabel>
                  <input value={marketQuestion} onChange={e => setMarketQuestion(e.target.value)} placeholder="Next play: 10+ yard gain?"
                    style={{ width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, padding: "8px 10px", fontSize: 12.5, color: "#0f172a", marginBottom: 12, boxSizing: "border-box" }} />

                  <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                    <MiniLabel style={{ width: 146 }}>Option text</MiniLabel>
                    <MiniLabel style={{ width: 72 }}>Payout ×</MiniLabel>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                    {marketOptions.map((o, i) => (
                      <div key={i} style={{ display: "flex", gap: 4 }}>
                        <input value={o.label} onChange={e => updateMarketOption(i, "label", e.target.value)} placeholder={`Option ${i + 1}, e.g. "Yes"`}
                          style={{ width: 146, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 8px", fontSize: 11.5, color: "#0f172a", boxSizing: "border-box" }} />
                        <input value={o.odds} onChange={e => updateMarketOption(i, "odds", e.target.value)} placeholder="2.00" type="number" step="0.01"
                          title="A 50-Point bet at 2.00x pays 100 back if this option wins"
                          style={{ width: 72, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 8px", fontSize: 11.5, color: "#0f172a", boxSizing: "border-box" }} />
                      </div>
                    ))}
                    {marketOptions.length < 4 && (
                      <button onClick={() => setMarketOptions(opts => [...opts, { label: "", odds: "" }])}
                        style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#374151", cursor: "pointer" }}>+ Option</button>
                    )}
                  </div>
                  <button onClick={() => createAndOpenMarket(ev.id)} disabled={marketSaving}
                    style={{ background: "#059669", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer", opacity: marketSaving ? 0.6 : 1 }}>
                    {marketSaving ? "Opening…" : "Create & Open"}
                  </button>
                </div>

                <div style={{ flex: "0 0 260px" }}>
                  <MiniLabel>Preview — what viewers see over the video</MiniLabel>
                  <MarketPreview question={marketQuestion} options={marketOptions} />
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {drawerOpen && (
        <Drawer onClose={() => setDrawerOpen(false)} title={editingId ? "Edit Event" : "New Event"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Title"><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Description"><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} /></Field>
            <Field label="Thumbnail URL"><input value={form.thumbnail} onChange={e => setForm(f => ({ ...f, thumbnail: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Hero image URL"><input value={form.hero_url} onChange={e => setForm(f => ({ ...f, hero_url: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Stream URL (HLS)"><input value={form.stream_url} onChange={e => setForm(f => ({ ...f, stream_url: e.target.value }))} placeholder="https://.../manifest/video.m3u8" style={inputStyle} /></Field>
            <Field label="or Cloudflare stream UID"><input value={form.stream_uid} onChange={e => setForm(f => ({ ...f, stream_uid: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Starts at"><input type="datetime-local" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Status">
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
                <option value="scheduled">Scheduled</option>
                <option value="live">Live</option>
                <option value="ended">Ended</option>
              </select>
            </Field>
            <button onClick={saveEvent} disabled={saving || !form.title.trim()}
              style={{ marginTop: 4, background: "#0f172a", border: "none", borderRadius: 8, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: saving || !form.title.trim() ? 0.6 : 1 }}>
              {saving ? "Saving…" : editingId ? "Save Changes" : "Create Event"}
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
}

// Renders with MarketOverlay's real CARD_STYLE/OddsOption, not a copy --
// so this is a true preview, not a mockup that can drift from what ships.
// Un-set fields fall back to a placeholder so it never renders blank.
function MarketPreview({ question, options }) {
  return (
    <div style={{ background: "linear-gradient(160deg,#2a2618,#121108 70%)", borderRadius: 10, padding: 16, minHeight: 150, display: "flex", alignItems: "flex-end" }}>
      <div style={{ ...CARD_STYLE, width: "100%", boxSizing: "border-box" }}>
        <p style={{ fontSize: 13.5, fontWeight: 600, margin: "0 0 3px" }}>{question || "Your question appears here"}</p>
        <p style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 10, color: "#d7cf9e", margin: "0 0 11px" }}>Locks in 0:30</p>
        <div style={{ display: "flex", gap: 8 }}>
          {options.map((o, i) => {
            const hasOdds = Number(o.odds) > 0;
            // Dimmed rather than showing a made-up number -- an unfilled
            // option should visibly look unfilled, not like real data.
            const filledIn = !!o.label.trim() && hasOdds;
            return (
              <div key={i} style={{ flex: 1, display: "flex", opacity: filledIn ? 1 : 0.35 }}>
                <OddsOption
                  option={{ key: `opt${i}`, label: o.label.trim() || `Option ${i + 1}`, odds: hasOdds ? Number(o.odds) : 0 }}
                  selected={false} disabled onClick={() => {}}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#0f172a", outline: "none", boxSizing: "border-box" };

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  );
}

// Bare label text, no wrapping <label>/input pairing -- for a caption above
// a single field (full-width) or a column header above a row of them
// (narrow, via the style override), like the market option key/label/odds row.
function MiniLabel({ children, style }) {
  return <span style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5, ...style }}>{children}</span>;
}
