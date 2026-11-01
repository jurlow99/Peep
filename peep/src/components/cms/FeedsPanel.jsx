import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { SUPABASE_URL } from "../../lib/config";
import { PUSH_SOURCE_TYPE, isPushFeed, formatPushDetails, SUGGESTED_PUSH_LATENCY_MS } from "../../lib/feedIngest";
import { ARRIVALS, EMPTY_FEED_FORM, feedSteps, sourceProblem, slugify, arrivalLabel } from "../../lib/feedWorkflow";
import ComboInput from "./ComboInput";
import "./FeedsPanel.css";

const STATUS = {
  live: ["#15803d", "LIVE"], available: ["#15803d", "AVAILABLE"], connected: ["#15803d", "CONNECTED"], running: ["#15803d", "RUNNING"],
  receiving: ["#2563eb", "WAITING FOR PROVIDER"], created: ["#2563eb", "CREATED"], connecting: ["#b45309", "CONNECTING"], ready: ["#b45309", "READY"],
  offline: ["#6b7280", "OFFLINE"], stopped: ["#6b7280", "STOPPED"], unavailable: ["#6b7280", "NOT PLAYING"], disabled: ["#6b7280", "DISABLED"],
  error: ["#dc2626", "ERROR"], none: ["#cbd5e1", "—"], unknown: ["#cbd5e1", "UNKNOWN"],
};
function Chip({ status }) {
  const [color, text] = STATUS[status] || STATUS.unknown;
  return <span className="feeds-chip" style={{ color }}>{text}</span>;
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

// One page per feed, no dialogs: source → Cloudflare input → provider or relay → channel.
export default function FeedsPanel({ showToast }) {
  const [feeds, setFeeds] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null); // null = list, "new" = blank page, else feed id
  const [form, setForm] = useState(EMPTY_FEED_FORM);
  const [clearPass, setClearPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pushDetails, setPushDetails] = useState(null); // { feedId, srt, rtmps, state }
  const [copied, setCopied] = useState(false);
  const [attachId, setAttachId] = useState("");
  const [newChannel, setNewChannel] = useState({ name: "", category: "" });

  async function load() {
    setLoading(true);
    const [f, c] = await Promise.all([
      supabase.rpc("admin_live_feeds").order("created_at", { ascending: false }),
      supabase.from("channels").select("id, name, live_feed_id, category").order("name"),
    ]);
    setFeeds(f.data || []);
    setChannels(c.data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const feed = feeds.find(f => f.id === selectedId) || null;
  const channel = feed ? channels.find(c => c.live_feed_id === feed.id) : null;
  const channelFor = id => channels.find(c => c.live_feed_id === id);
  const steps = feedSteps(feed, channel);
  const push = form.source_type === PUSH_SOURCE_TYPE;

  function open(target) {
    setError(""); setPushDetails(null); setCopied(false); setClearPass(false); setAttachId(""); setNewChannel({ name: "", category: "" });
    if (target === "new") { setForm(EMPTY_FEED_FORM); setSelectedId("new"); return; }
    setForm({ ...EMPTY_FEED_FORM, ...target, source_port: target.source_port ?? "", source_latency: target.source_latency ?? 200, passphrase: "" });
    setSelectedId(target.id);
  }
  async function run(label, work) {
    setBusy(true); setError("");
    try { const result = await work(); if (label) showToast(label); await load(); return result; }
    catch (e) { setError(e.message); showToast(e.message, "error"); return null; }
    finally { setBusy(false); }
  }

  async function saveSource() {
    const problem = sourceProblem(form);
    if (problem) { setError(problem); return; }
    const result = await run(feed ? "Feed saved" : "Feed created", () =>
      edgeCall("save-feed", { ...form, id: feed?.id, source_mode: "caller", clear_passphrase: clearPass }));
    if (result?.id) { setSelectedId(result.id); setClearPass(false); setForm(f => ({ ...f, passphrase: "" })); }
  }
  async function createInput() {
    const created = await run("Cloudflare input created", () => edgeCall("cf-live-input", { action: "create", feed_id: feed.id }));
    if (created && isPushFeed(feed)) await fetchPushDetails();
  }
  async function fetchPushDetails() {
    const r = await run(null, () => edgeCall("cf-live-input", { action: "ingest", feed_id: feed.id }));
    if (r) { setPushDetails({ feedId: feed.id, ...r }); setCopied(false); }
  }
  async function copyPushDetails() {
    const text = formatPushDetails({ feedName: feed.name, srt: pushDetails.srt, rtmps: pushDetails.rtmps });
    try { await navigator.clipboard.writeText(text); setCopied(true); showToast("Copied — paste it to the provider"); }
    catch { showToast("Couldn't copy. Click a field and copy it by hand.", "error"); }
  }
  async function refreshStatus() {
    await run("Status refreshed", async () => {
      await edgeCall("cf-live-input", { action: "status", feed_id: feed.id });
      if (!isPushFeed(feed)) await edgeCall("relay-control", { action: "status", feed_id: feed.id }).catch(() => {});
    });
  }
  async function testSource() {
    await run(null, async () => {
      const r = await edgeCall("relay-control", { action: "test", feed_id: feed.id });
      if (r.status === "CONNECTED") showToast(`Connected · ${r.video || "?"} ${r.width || "?"}×${r.height || "?"}${r.fps ? " " + r.fps + "fps" : ""} · ${r.audio || "no audio"}`);
      else throw new Error(`Test: ${r.status}${r.detail ? " — " + r.detail : ""}`);
    });
  }
  async function checkRelayServer() {
    await run(null, async () => {
      const h = await edgeCall("relay-control", { action: "health" });
      showToast(`Relay online · FFmpeg ${h.ffmpeg ? "ok" : "missing"} · ${h.activeRelays} active · CPU ${h.cpuLoadPct}%`);
    });
  }
  async function attachExisting() {
    if (!attachId) { setError("Choose a channel to attach."); return; }
    await run("Channel attached", async () => {
      const { error } = await supabase.from("channels").update({ live_feed_id: feed.id }).eq("id", attachId);
      if (error) throw error;
    });
  }
  async function createChannel() {
    const name = newChannel.name.trim();
    if (!name) { setError("Give the channel a name."); return; }
    await run(`Channel "${name}" created`, async () => {
      const { error } = await supabase.from("channels").insert({ name, slug: slugify(name), category: newChannel.category.trim() || "general", live_feed_id: feed.id, is_active: true });
      if (error) throw error;
    });
  }
  async function detachChannel() {
    await run("Channel detached", async () => {
      const { error } = await supabase.from("channels").update({ live_feed_id: null }).eq("id", channel.id);
      if (error) throw error;
    });
  }
  async function deleteInput() {
    if (!confirm("Remove this feed's Cloudflare input? The provider's push details stop working.")) return;
    setPushDetails(null);
    await run("Cloudflare input removed", () => edgeCall("cf-live-input", { action: "delete", feed_id: feed.id }));
  }
  async function deleteFeed() {
    if (!confirm(`Delete feed "${feed.name}"? This also removes its Cloudflare input and detaches its channel.`)) return;
    const ok = await run("Feed deleted", async () => {
      await edgeCall("cf-live-input", { action: "delete", feed_id: feed.id }).catch(() => {});
      if (channel) await supabase.from("channels").update({ live_feed_id: null }).eq("id", channel.id);
      const { error } = await supabase.from("live_feeds").delete().eq("id", feed.id);
      if (error) throw error;
      return true;
    });
    if (ok) setSelectedId(null);
  }

  if (selectedId === null) {
    return <section className="feeds" aria-label="Live feeds">
      <div className="feeds-header">
        <div><h2>Live feeds</h2><p>A feed is how a provider's live video reaches Peep. If a provider gives you a plain HLS link, you don't need a feed at all; paste it into the channel under Channels &amp; schedules.</p></div>
        <div className="feeds-header-actions"><button disabled={busy} onClick={checkRelayServer}>Check relay server</button><button className="feeds-primary" onClick={() => open("new")}>+ New feed</button></div>
      </div>
      {loading ? <p className="feeds-muted">Loading…</p> : feeds.length === 0 ? (
        <div className="feeds-empty"><h3>No feeds yet</h3><p>Create one when a provider wants to send you a live stream over SRT.</p><button className="feeds-primary" onClick={() => open("new")}>+ New feed</button></div>
      ) : <div className="feeds-list">{feeds.map(f => {
        const ch = channelFor(f.id);
        return <div key={f.id} className="feeds-row">
          <div><strong>{f.name}</strong><small>{arrivalLabel(f)}{!f.enabled ? " · disabled" : ""}</small></div>
          <div><span className="feeds-label">CLOUDFLARE</span><Chip status={f.cloudflare_live_input_uid ? f.cloudflare_status : "none"} /></div>
          <div><span className="feeds-label">PLAYBACK</span><Chip status={f.playback_status} /></div>
          {!isPushFeed(f) ? <div><span className="feeds-label">RELAY</span><Chip status={f.relay_status} /></div> : <div />}
          <div><span className="feeds-label">CHANNEL</span><span className={ch ? "" : "feeds-muted"}>{ch ? ch.name : "None"}</span></div>
          <button onClick={() => open(f)}>Open</button>
        </div>;
      })}</div>}
    </section>;
  }

  const sectionClass = key => `feeds-section${steps.find(s => s.key === key)?.current ? " current" : ""}`;
  const attachable = channels.filter(c => !c.live_feed_id || c.live_feed_id === feed?.id);
  return <section className="feeds" aria-label={feed ? `Feed ${feed.name}` : "New feed"}>
    <button className="feeds-back" onClick={() => setSelectedId(null)}>← All feeds</button>
    <div className="feeds-overview">
      <div>
        <span className="feeds-label">LIVE FEED</span>
        <h2>{feed?.name || form.name || "New feed"}</h2>
        <span className="feeds-badge">{arrivalLabel(feed || form)}</span>
      </div>
      {feed && <div className="feeds-overview-status">
        <div><span className="feeds-label">CLOUDFLARE</span><Chip status={feed.cloudflare_live_input_uid ? feed.cloudflare_status : "none"} /></div>
        <div><span className="feeds-label">PLAYBACK</span><Chip status={feed.playback_status} /></div>
        {!isPushFeed(feed) && <div><span className="feeds-label">RELAY</span><Chip status={feed.relay_status} /></div>}
        <div><span className="feeds-label">CHANNEL</span><span className={channel ? "" : "feeds-muted"}>{channel ? channel.name : "None"}</span></div>
      </div>}
      {feed && <div className="feeds-header-actions"><button disabled={busy} onClick={refreshStatus}>Refresh status</button><button className="feeds-danger" disabled={busy} onClick={deleteFeed}>Delete feed</button></div>}
    </div>
    <ol className="feeds-steps" aria-label="Feed progress">{steps.map((s, i) => <li key={s.key} className={s.done ? "done" : s.current ? "current" : ""} aria-current={s.current ? "step" : undefined}><span>{s.done ? "✓" : i + 1}</span>{s.label}</li>)}</ol>
    {error && <p role="alert" className="feeds-error">{error}</p>}

    <div className={sectionClass("source")}>
      <h3>1. Where the video comes from</h3>
      <p>Ask the provider one question: can they send to us, or do we have to connect to them?</p>
      <label>Feed name<input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Rally TV East" /></label>
      <div className="feeds-arrival">{ARRIVALS.map(a => (
        <label key={a.value} className={form.source_type === a.value ? "selected" : ""}>
          <input type="radio" name="feed-arrival" checked={form.source_type === a.value} onChange={() => setForm(f => ({ ...f, source_type: a.value }))} />
          <div><strong>{a.title}</strong><span>{a.hint}</span></div>
        </label>))}
      </div>
      {!push && <>
        <div className="feeds-fields">
          <label>Host or IP they gave you<input value={form.source_host} onChange={e => setForm(f => ({ ...f, source_host: e.target.value }))} placeholder="srt.provider.com" /></label>
          <label>Port<input type="number" value={form.source_port} onChange={e => setForm(f => ({ ...f, source_port: e.target.value }))} placeholder="9000" /></label>
          <label>Latency (ms)<input type="number" value={form.source_latency} onChange={e => setForm(f => ({ ...f, source_latency: e.target.value }))} placeholder="200" /></label>
          <label>Stream ID · if they gave one<input value={form.source_stream_id} onChange={e => setForm(f => ({ ...f, source_stream_id: e.target.value }))} placeholder="#!::r=example" /></label>
          <label>Passphrase · if they gave one<input type="password" autoComplete="new-password" value={form.passphrase} onChange={e => setForm(f => ({ ...f, passphrase: e.target.value }))} placeholder={feed?.has_passphrase ? "Saved — leave blank to keep" : "AES passphrase"} /></label>
        </div>
        {feed?.has_passphrase && <label className="feeds-check" style={{ marginTop: 12 }}><input type="checkbox" checked={clearPass} onChange={e => setClearPass(e.target.checked)} /> Remove the saved passphrase</label>}
        <p className="feeds-note">Our relay will connect to them as the caller. The relay must be online: use <em>Check relay server</em> on the feeds list.</p>
      </>}
      <div className="feeds-fields">
        <label>Notes<input value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Contact, contract dates, anything useful" /></label>
        <label className="feeds-check" style={{ alignSelf: "end" }}><input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} /> Enabled</label>
      </div>
      <div className="feeds-actions"><button className="feeds-primary" disabled={busy} onClick={saveSource}>{busy ? "Saving…" : feed ? "Save changes" : "Create feed"}</button>{!feed && <span className="feeds-muted">Save first; the next steps unlock after that.</span>}</div>
    </div>

    {feed && <div className={sectionClass("cloudflare")}>
      <h3>2. Cloudflare live input</h3>
      <p>The place the video lands and gets turned into something every TV and browser can play. Recording stays off, so an idle channel costs nothing.</p>
      {feed.cloudflare_live_input_uid ? <>
        <p className="feeds-note ok">Input created. Playback link: <span className="feeds-link">{feed.cloudflare_hls_url}</span></p>
        <div className="feeds-actions"><button disabled={busy} onClick={refreshStatus}>Refresh status</button><button className="feeds-danger" disabled={busy} onClick={deleteInput}>Remove input</button></div>
      </> : <div className="feeds-actions"><button className="feeds-primary" disabled={busy} onClick={createInput}>{busy ? "…" : "Create Cloudflare input"}</button></div>}
    </div>}

    {feed && isPushFeed(feed) && <div className={sectionClass("provider")}>
      <h3>3. Send these to the provider</h3>
      <p>They connect as the caller with the details below. When their stream arrives, the status above turns LIVE.</p>
      {!feed.cloudflare_live_input_uid ? <p className="feeds-note">Create the Cloudflare input first.</p> : pushDetails?.feedId === feed.id ? <>
        {pushDetails.srt ? <div className="feeds-fields">
          {[["SRT address", pushDetails.srt.url], ["Stream ID", pushDetails.srt.streamId], ["Passphrase", pushDetails.srt.passphrase], ["Suggested latency", `${SUGGESTED_PUSH_LATENCY_MS} ms`]].map(([k, v]) => (
            <label key={k}>{k}<input readOnly value={v || ""} onFocus={e => e.target.select()} /></label>))}
        </div> : <p className="feeds-note warn">Cloudflare returned no SRT details for this input.</p>}
        {pushDetails.rtmps && <div className="feeds-fields">
          <label>RTMPS server · alternative<input readOnly value={pushDetails.rtmps.url || ""} onFocus={e => e.target.select()} /></label>
          <label>RTMPS stream key<input readOnly value={pushDetails.rtmps.streamKey || ""} onFocus={e => e.target.select()} /></label>
        </div>}
        <div className="feeds-actions"><button className="feeds-primary" onClick={copyPushDetails}>{copied ? "Copied ✓" : "Copy everything for the provider"}</button><button disabled={busy} onClick={fetchPushDetails}>Reload</button><span className="feeds-muted">Cloudflare state: {pushDetails.state || "unknown"}</span></div>
      </> : <div className="feeds-actions"><button className="feeds-primary" disabled={busy} onClick={fetchPushDetails}>{busy ? "…" : "Show push details"}</button></div>}
    </div>}

    {feed && !isPushFeed(feed) && <div className={sectionClass("relay")}>
      <h3>3. Relay</h3>
      <p>Our relay connects to the provider and forwards the stream into the Cloudflare input.</p>
      {!feed.cloudflare_live_input_uid ? <p className="feeds-note">Create the Cloudflare input first.</p> : <div className="feeds-actions">
        <button disabled={busy} onClick={testSource}>Test connection to provider</button>
        {feed.relay_status === "running"
          ? <button className="feeds-danger" disabled={busy} onClick={() => run("Relay stopped", () => edgeCall("relay-control", { action: "stop", feed_id: feed.id }))}>Stop relay</button>
          : <button className="feeds-primary" disabled={busy} onClick={() => run("Relay starting…", () => edgeCall("relay-control", { action: "start", feed_id: feed.id }))}>Start relay</button>}
        <button disabled={busy} onClick={() => run("Relay restarting…", () => edgeCall("relay-control", { action: "restart", feed_id: feed.id }))}>Restart</button>
        <button disabled={busy} onClick={checkRelayServer}>Check relay server</button>
      </div>}
    </div>}

    {feed && <div className={sectionClass("channel")}>
      <h3>4. Channel</h3>
      <p>Viewers never see a feed, only a channel. Attach this feed to the channel that should play it.</p>
      {channel ? <>
        <p className="feeds-note ok">Playing on <strong>{channel.name}</strong>. Finish artwork, category and the guide under Channels &amp; schedules.</p>
        <div className="feeds-actions"><button className="feeds-danger" disabled={busy} onClick={detachChannel}>Detach</button></div>
      </> : <div className="feeds-fields">
        <div>
          <label>Attach an existing channel<select value={attachId} onChange={e => setAttachId(e.target.value)}><option value="">Choose a channel…</option>{attachable.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <div className="feeds-actions"><button disabled={busy || !attachId} onClick={attachExisting}>Attach</button></div>
        </div>
        <div>
          <label>Or create a new channel<input value={newChannel.name} onChange={e => setNewChannel(c => ({ ...c, name: e.target.value }))} placeholder="Channel name as viewers see it" /></label>
          <label style={{ marginTop: 10 }}>Category<ComboInput options={[...new Set(channels.map(c => c.category).filter(Boolean))]} value={newChannel.category} onChange={v => setNewChannel(c => ({ ...c, category: v }))} placeholder="sports" /></label>
          <div className="feeds-actions"><button className="feeds-primary" disabled={busy || !newChannel.name.trim()} onClick={createChannel}>Create channel &amp; attach</button></div>
        </div>
      </div>}
    </div>}
  </section>;
}
