import { useState, useEffect } from "react";
import { supabase } from "../../supabase";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const EMPTY_FEED = { name: "", source_type: "srt", source_host: "", source_port: "", source_mode: "caller", source_stream_id: "", source_latency: 200, notes: "", enabled: true, passphrase: "" };

const STATUS = {
  live:        { c: "#22c55e", t: "LIVE" },
  available:   { c: "#22c55e", t: "AVAILABLE" },
  connected:   { c: "#22c55e", t: "CONNECTED" },
  running:     { c: "#22c55e", t: "RUNNING" },
  receiving:   { c: "#3b82f6", t: "RECEIVING" },
  created:     { c: "#3b82f6", t: "CREATED" },
  connecting:  { c: "#f59e0b", t: "CONNECTING" },
  ready:       { c: "#f59e0b", t: "READY" },
  offline:     { c: "#6b7280", t: "OFFLINE" },
  stopped:     { c: "#6b7280", t: "STOPPED" },
  unavailable: { c: "#6b7280", t: "UNAVAILABLE" },
  disabled:    { c: "#6b7280", t: "DISABLED" },
  error:       { c: "#ef4444", t: "ERROR" },
  none:        { c: "#cbd5e1", t: "—" },
  unknown:     { c: "#cbd5e1", t: "UNKNOWN" },
};
function Chip({ status }) {
  const s = STATUS[status] || STATUS.unknown;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: s.c }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.c }} />{s.t}
    </span>
  );
}

async function edgeCall(fn, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export default function FeedsPanel({ showToast }) {
  const [feeds, setFeeds] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FEED);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [clearPass, setClearPass] = useState(false);

  async function load() {
    setLoading(true);
    const [f, c] = await Promise.all([
      supabase.from("live_feeds").select("*").order("created_at", { ascending: false }),
      supabase.from("channels").select("id, name, live_feed_id"),
    ]);
    setFeeds(f.data || []);
    setChannels(c.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const channelFor = feedId => channels.find(c => c.live_feed_id === feedId);

  function openAdd() { setForm(EMPTY_FEED); setEditingId(null); setClearPass(false); setFormOpen(true); }
  function openEdit(feed) {
    setForm({ ...EMPTY_FEED, ...feed, source_port: feed.source_port ?? "", passphrase: "" });
    setEditingId(feed.id); setClearPass(false); setFormOpen(true);
  }

  async function save() {
    if (!form.name.trim()) { showToast("Feed name is required", "error"); return; }
    setSaving(true);
    try {
      await edgeCall("save-feed", { ...form, id: editingId || undefined, clear_passphrase: clearPass });
      showToast(editingId ? "Feed updated" : "Feed created");
      setFormOpen(false); await load();
    } catch (e) { showToast("Save failed: " + e.message, "error"); }
    setSaving(false);
  }

  async function act(feed, fn, body, okMsg) {
    setBusyId(feed.id);
    try { await edgeCall(fn, body); if (okMsg) showToast(okMsg); await load(); }
    catch (e) { showToast(e.message, "error"); }
    setBusyId(null);
  }

  async function testSource(feed) {
    setBusyId(feed.id);
    try {
      const r = await edgeCall("relay-control", { action: "test", feed_id: feed.id });
      if (r.status === "CONNECTED") {
        showToast(`Connected · ${r.video || "?"} ${r.width || "?"}×${r.height || "?"}${r.fps ? " " + r.fps + "fps" : ""} · ${r.audio || "no audio"}${r.bitrate_kbps ? " · " + r.bitrate_kbps + "kbps" : ""}`);
      } else {
        showToast(`Test: ${r.status}${r.detail ? " — " + r.detail : ""}`, "error");
      }
      await load();
    } catch (e) { showToast("Test failed: " + e.message, "error"); }
    setBusyId(null);
  }

  async function refreshStatus(feed) {
    setBusyId(feed.id);
    try {
      await edgeCall("cf-live-input", { action: "status", feed_id: feed.id });
      await edgeCall("relay-control", { action: "status", feed_id: feed.id }).catch(() => {});
      showToast("Status refreshed"); await load();
    } catch (e) { showToast(e.message, "error"); }
    setBusyId(null);
  }

  async function checkRelayServer() {
    try {
      const h = await edgeCall("relay-control", { action: "health" });
      showToast(`Relay ONLINE · FFmpeg ${h.ffmpeg ? "ok" : "missing"} · ${h.activeRelays} active · CPU ${h.cpuLoadPct}% · Mem ${h.memUsedPct}%`);
    } catch (e) { showToast("Relay unreachable: " + e.message, "error"); }
  }

  async function del(feed) {
    if (!confirm(`Delete feed "${feed.name}"? This also removes its Cloudflare Live Input.`)) return;
    setBusyId(feed.id);
    try {
      await edgeCall("cf-live-input", { action: "delete", feed_id: feed.id });
      await supabase.from("live_feeds").delete().eq("id", feed.id);
      showToast("Feed deleted"); await load();
    } catch (e) { showToast(e.message, "error"); }
    setBusyId(null);
  }

  const btn = (bg, color, border) => ({ background: bg, border: `1px solid ${border}`, borderRadius: 7, padding: "7px 12px", color, fontSize: 12, fontWeight: 600, cursor: "pointer" });
  const lbl = { display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5, fontWeight: 600 };
  const inp = { width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "9px 12px", color: "#0f172a", fontSize: 13, outline: "none", boxSizing: "border-box" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Live Feeds ({feeds.length})</h2>
          <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Incoming broadcast sources (SRT). Relayed by the Pi → Cloudflare → your channels.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={checkRelayServer} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 16px", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Check relay server</button>
          <button onClick={openAdd} style={{ background: "#ef4444", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Add Feed</button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: "#6b7280", padding: 40, textAlign: "center" }}>Loading…</div>
      ) : feeds.length === 0 ? (
        <div style={{ color: "#6b7280", padding: 40, textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 10 }}>No feeds yet. Add an SRT source above.</div>
      ) : feeds.map(feed => {
        const ch = channelFor(feed.id);
        const busy = busyId === feed.id;
        return (
          <div key={feed.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{feed.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", background: "#eef2ff", borderRadius: 4, padding: "1px 7px" }}>{feed.source_type}</span>
                  {!feed.enabled && <span style={{ fontSize: 10, fontWeight: 700, color: "#888", background: "#f1f5f9", borderRadius: 4, padding: "1px 7px" }}>DISABLED</span>}
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {feed.source_host ? `srt://${feed.source_host}:${feed.source_port || "?"} · ${feed.source_mode}` : "No source configured"}
                </p>
              </div>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 11 }}>
                <div><div style={{ color: "#9ca3af", fontWeight: 600, marginBottom: 2 }}>SOURCE</div><Chip status={feed.source_status} /></div>
                <div><div style={{ color: "#9ca3af", fontWeight: 600, marginBottom: 2 }}>RELAY</div><Chip status={feed.relay_status} /></div>
                <div><div style={{ color: "#9ca3af", fontWeight: 600, marginBottom: 2 }}>CLOUDFLARE</div><Chip status={feed.cloudflare_status} /></div>
                <div><div style={{ color: "#9ca3af", fontWeight: 600, marginBottom: 2 }}>PLAYBACK</div><Chip status={feed.playback_status} /></div>
                <div><div style={{ color: "#9ca3af", fontWeight: 600, marginBottom: 2 }}>CHANNEL</div><span style={{ fontSize: 11, fontWeight: 600, color: ch ? "#0f172a" : "#cbd5e1" }}>{ch ? ch.name : "None"}</span></div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button disabled={busy} onClick={() => testSource(feed)} style={btn("#f8fafc", "#374151", "#e2e8f0")}>{busy ? "…" : "Test Source"}</button>
              {!feed.cloudflare_live_input_uid ? (
                <button disabled={busy} onClick={() => act(feed, "cf-live-input", { action: "create", feed_id: feed.id }, "Cloudflare input created")} style={btn("rgba(59,130,246,0.08)", "#2563eb", "rgba(59,130,246,0.25)")}>{busy ? "…" : "Create Cloudflare Input"}</button>
              ) : (
                <>
                  {feed.relay_status === "running"
                    ? <button disabled={busy} onClick={() => act(feed, "relay-control", { action: "stop", feed_id: feed.id }, "Relay stopped")} style={btn("rgba(239,68,68,0.08)", "#dc2626", "rgba(239,68,68,0.25)")}>{busy ? "…" : "Stop"}</button>
                    : <button disabled={busy} onClick={() => act(feed, "relay-control", { action: "start", feed_id: feed.id }, "Relay starting…")} style={btn("rgba(34,197,94,0.1)", "#15803d", "rgba(34,197,94,0.3)")}>{busy ? "…" : "Start"}</button>}
                  <button disabled={busy} onClick={() => act(feed, "relay-control", { action: "restart", feed_id: feed.id }, "Relay restarting…")} style={btn("#f8fafc", "#374151", "#e2e8f0")}>Restart</button>
                  <button disabled={busy} onClick={() => refreshStatus(feed)} style={btn("rgba(59,130,246,0.08)", "#2563eb", "rgba(59,130,246,0.25)")}>{busy ? "…" : "Refresh Status"}</button>
                </>
              )}
              <button disabled={busy} onClick={() => openEdit(feed)} style={btn("#f1f5f9", "#374151", "#e2e8f0")}>Edit</button>
              <button disabled={busy} onClick={() => del(feed)} style={btn("rgba(239,68,68,0.07)", "#dc2626", "rgba(239,68,68,0.2)")}>Delete</button>
            </div>
            {feed.cloudflare_hls_url && <p style={{ margin: "10px 0 0", fontSize: 11, color: "#9ca3af", wordBreak: "break-all" }}>HLS: {feed.cloudflare_hls_url}</p>}
          </div>
        );
      })}

      {/* Add / Edit form */}
      {formOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={e => { if (e.target === e.currentTarget) setFormOpen(false); }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", padding: "24px 26px", boxShadow: "0 24px 64px rgba(0,0,0,0.25)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: "#0f172a" }}>{editingId ? "Edit Feed" : "Add SRT Feed"}</h3>
            <p style={{ margin: "0 0 18px", fontSize: 12, color: "#6b7280" }}>The <strong>source</strong> the provider gave you. Cloudflare (destination) is created separately.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={lbl}>Feed name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Provider Sports East" style={inp} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <div><label style={lbl}>Host / IP</label><input value={form.source_host} onChange={e => setForm(f => ({ ...f, source_host: e.target.value }))} placeholder="provider.example.com" style={inp} /></div>
                <div><label style={lbl}>Port</label><input type="number" value={form.source_port} onChange={e => setForm(f => ({ ...f, source_port: e.target.value }))} placeholder="1234" style={inp} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><label style={lbl}>Mode</label>
                  <select value={form.source_mode} onChange={e => setForm(f => ({ ...f, source_mode: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
                    <option value="caller">caller</option><option value="listener">listener</option><option value="rendezvous">rendezvous</option>
                  </select>
                </div>
                <div><label style={lbl}>Latency (ms)</label><input type="number" value={form.source_latency} onChange={e => setForm(f => ({ ...f, source_latency: e.target.value }))} placeholder="200" style={inp} /></div>
              </div>
              <div><label style={lbl}>Stream ID (optional)</label><input value={form.source_stream_id} onChange={e => setForm(f => ({ ...f, source_stream_id: e.target.value }))} placeholder="#!::r=example" style={inp} /></div>
              <div>
                <label style={lbl}>Passphrase (optional)</label>
                <input type="password" value={form.passphrase} onChange={e => setForm(f => ({ ...f, passphrase: e.target.value }))} placeholder={editingId && form.has_passphrase ? "•••••••• CONFIGURED — leave blank to keep" : "AES passphrase"} style={inp} autoComplete="new-password" />
                {editingId && form.has_passphrase && (
                  <label style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, fontSize: 12, color: "#6b7280", cursor: "pointer" }}>
                    <input type="checkbox" checked={clearPass} onChange={e => setClearPass(e.target.checked)} /> Remove saved passphrase
                  </label>
                )}
              </div>
              <div><label style={lbl}>Notes</label><input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Anything useful…" style={inp} /></div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} /> <span style={{ fontSize: 13, color: "#374151" }}>Enabled</span>
              </label>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button onClick={save} disabled={saving} style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: 8, padding: "12px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : editingId ? "Save Feed" : "Create Feed"}</button>
                <button onClick={() => setFormOpen(false)} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 20px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
