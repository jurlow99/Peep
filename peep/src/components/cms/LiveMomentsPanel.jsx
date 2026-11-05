import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase";
import { LIVE_MOMENTS, MOMENT_LABELS, MOMENT_MINUTES } from "../../lib/liveMoments";
import "./AdsPanel.css";

// Live TV → Live moments: press "Halftime now" (etc.) on a channel and viewers watching it
// get one L ad for that moment within about 10 seconds (channel_moments, read in the
// players' channel check). A moment lasts 15 minutes unless ended early.
export default function LiveMomentsPanel({ showToast, logAudit = () => {} }) {
  const [channels, setChannels] = useState([]);
  const [active, setActive] = useState({}); // channel id → current moment row
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(null);
  const [now, setNow] = useState(Date.now());

  async function load() {
    const [ch, mo] = await Promise.all([
      supabase.from("channels").select("id,name,is_active").order("name"),
      supabase.from("channel_moments").select("id,channel_id,moment,started_at,expires_at").gt("expires_at", new Date().toISOString()).order("started_at", { ascending: false }),
    ]);
    if (ch.error || mo.error) { showToast("Couldn't load: " + (ch.error || mo.error).message, "error"); return; }
    setChannels((ch.data || []).filter(c => c.is_active !== false));
    const byChannel = {};
    for (const row of mo.data || []) if (!byChannel[row.channel_id]) byChannel[row.channel_id] = row;
    setActive(byChannel);
  }
  useEffect(() => {
    load();
    const poll = setInterval(load, 15000), clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function start(channel, moment) {
    setBusy(channel.id);
    const expires = new Date(Date.now() + MOMENT_MINUTES * 60000).toISOString();
    const { error } = await supabase.from("channel_moments").insert([{ channel_id: channel.id, moment, expires_at: expires }]);
    setBusy(null);
    if (error) { showToast("Not started: " + error.message, "error"); return; }
    logAudit("create", "channel_moment", channel.id, moment);
    showToast(`${MOMENT_LABELS[moment]} on ${channel.name}`);
    load();
  }
  async function end(channel) {
    const row = active[channel.id]; if (!row) return;
    setBusy(channel.id);
    const { error } = await supabase.from("channel_moments").update({ expires_at: new Date().toISOString() }).eq("id", row.id);
    setBusy(null);
    if (error) { showToast("Couldn't end: " + error.message, "error"); return; }
    logAudit("update", "channel_moment", channel.id, "ended");
    load();
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? channels.filter(c => c.name.toLowerCase().includes(q)) : channels;
    return [...list].sort((a, b) => (active[b.id] ? 1 : 0) - (active[a.id] ? 1 : 0)); // live moments first
  }, [channels, query, active]);
  const left = row => Math.max(0, Math.ceil((new Date(row.expires_at).getTime() - now) / 60000));

  return (
    <div className="ads">
      <div className="ads-header">
        <div><h2>Live moments</h2><p>Press a button when it happens. Viewers on that channel get one L ad for it within about 10 seconds.</p></div>
        <input className="ads-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a channel…" aria-label="Find a channel" />
      </div>
      <div className="ads-table" role="table" aria-label="Channels">
        {shown.map(channel => {
          const row = active[channel.id];
          return (
            <div key={channel.id} className={`ads-moment-row${row ? " is-live" : ""}`} role="row">
              <strong>{channel.name}</strong>
              {row
                ? <span className="ads-moment-now"><span className="ads-dot on" aria-hidden="true" />{MOMENT_LABELS[row.moment]} · {left(row)} min left</span>
                : <span className="ads-muted">—</span>}
              <span className="ads-moment-buttons">
                {LIVE_MOMENTS.map(m => (
                  <button key={m.value} type="button" disabled={!!row || busy === channel.id} onClick={() => start(channel, m.value)}
                    title={row ? "Wait for the current moment to end, or end it" : `Send ${m.label.toLowerCase()} to viewers of ${channel.name}`}>{m.label}</button>
                ))}
                {row && <button type="button" className="ads-danger" disabled={busy === channel.id} onClick={() => end(channel)}>End now</button>}
              </span>
            </div>
          );
        })}
        {shown.length === 0 && <div className="ads-moment-row"><span className="ads-muted">No channels match.</span></div>}
      </div>
    </div>
  );
}
