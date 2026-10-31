import { useCallback, useEffect, useState } from "react";
import LiveTVMetricDetails from "./LiveTVMetricDetails";
import { supabase } from "../../supabase";
const panel = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 20 };
const format = n => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
export default function LiveTVViewingDashboard({ compact = false }) {
  const [includeTests, setIncludeTests] = useState(false);
  const [detail, setDetail] = useState(null);
  const [days, setDays] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const query = useCallback(() => supabase.rpc("live_tv_dashboard_filtered", { p_include_test: includeTests, p_since: new Date(Date.now() - days * 86400000).toISOString() }), [days, includeTests]);
  const apply = useCallback(result => {
    setError(result.error?.message || "");
    if (!result.error) setData(result.data);
    setLoading(false);
  }, []);
  useEffect(() => {
    let active = true;
    const receive = result => { if (active) apply(result); };
    query().then(receive);
    const timer = setInterval(() => query().then(receive), 30000);
    return () => { active = false; clearInterval(timer); };
  }, [query, apply]);
  return <section style={panel} aria-label="Live TV viewing dashboard">
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <h2 style={{ margin: 0, fontSize: 20, color: "#111827" }}>Live TV viewing</h2>
      <select aria-label="Live TV reporting period" value={days} onChange={e => { setDetail(null); setDays(Number(e.target.value)); setData(null); setLoading(true); }}><option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select>
      <label style={{ fontSize: 13, color: "#475569" }}><input type="checkbox" checked={includeTests} onChange={e => { setIncludeTests(e.target.checked); setData(null); setLoading(true); }} /> Include simulator tests</label>
      <button type="button" disabled={loading} onClick={() => { setLoading(true); query().then(apply); }}>{loading ? "Loading…" : "Refresh"}</button>
      {data && <span style={{ marginLeft: "auto", color: "#64748b", fontSize: 12 }}>Updated {new Date(data.updated_at).toLocaleTimeString()} · refreshes every 30s</span>}
    </div>
    <p style={{ color: "#64748b", fontSize: 13 }}>Real playback activity from Apple TV and browser. Viewers now counts active devices once; multiview adds one active stream per playing channel.</p>
    <p style={{ color: "#64748b", fontSize: 12 }}>{includeTests ? "Including simulator test activity in all totals and details." : "Simulator test activity is excluded from all totals and details."}</p>
    {error && <p role="alert" style={{ color: "#b91c1c" }}>Couldn’t load Live TV viewing: {error}</p>}
    {!data && !error && <p role="status">Loading viewing activity…</p>}
    {data && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 22 }}>{[
        ["Viewers now", "viewers_now"], ["Active streams", "streams_now"], ["Channel watch hours", "watch_hours"],
        ["Viewing sessions", "sessions"], ["Unique devices", "unique_devices"], ["Avg. session minutes", "average_minutes"],
      ].map(([label,key]) => <button type="button" key={key} aria-expanded={detail === key} aria-controls="live-tv-metric-details" onClick={() => setDetail(detail === key ? null : key)} style={{ padding: 16, background: detail === key ? "#e2e8f0" : "#f8fafc", border: detail === key ? "1px solid #64748b" : "1px solid transparent", textAlign: "left", cursor: "pointer", borderRadius: 9 }}><div style={{ color: "#64748b", fontSize: 12 }}>{label}</div><strong style={{ display: "block", color: "#111827", fontSize: 28, paddingTop: 8 }}>{format(data[key])}</strong><span style={{ display: "block", fontSize: 11, color: "#475569", marginTop: 8 }}>View details →</span></button>)}</div>
      {detail && <div id="live-tv-metric-details"><LiveTVMetricDetails key={`${detail}:${days}:${includeTests}`} includeTests={includeTests} metric={detail} days={days} value={data[detail]} onClose={() => { setDetail(null); document.querySelector(`[aria-controls="live-tv-metric-details"][aria-expanded="true"]`)?.focus(); }} /></div>}
      {data.sessions === 0 && <p style={{ color: "#64748b" }}>No viewing activity recorded in this period yet. Playback tracking starts with the updated clients; earlier viewing history is unavailable.</p>}
      <h3 style={{ fontSize: 15 }}>Top channels</h3>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}><thead><tr>{["Channel","Watching now","Sessions","Watch hours"].map(label => <th key={label} style={{ padding: 10, color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{label}</th>)}</tr></thead><tbody>{(compact ? data.channels.slice(0,5) : data.channels).map(channel => <tr key={channel.id ?? channel.name}><td style={{ padding: 10 }}>{channel.name}</td><td>{format(channel.now)}</td><td>{format(channel.sessions)}</td><td>{format(channel.hours)}</td></tr>)}</tbody></table></div>
      {!compact && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24, marginTop: 24 }}>
        <div><h3 style={{ fontSize: 15 }}>Platforms</h3>{data.platforms.map(p => <div key={p.platform} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #e2e8f0" }}><span>{{ tvos: "Apple TV", web: "Browser", mobile_web: "Mobile browser" }[p.platform] || p.platform}</span><span>{format(p.sessions)} sessions · {format(p.hours)} h</span></div>)}</div>
        <div><h3 style={{ fontSize: 15 }}>Daily channel watch hours (UTC)</h3>{data.daily.map(day => <div key={day.day} style={{ marginBottom: 12 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span>{day.day}</span><span>{format(day.hours)} h</span></div><div style={{ background: "#e2e8f0", height: 7, marginTop: 6, borderRadius: 4 }}><div style={{ background: "#475569", height: "100%", borderRadius: 4, width: `${Math.max(0, Number(day.hours) / Math.max(...data.daily.map(d => Number(d.hours)), 0.01) * 100)}%` }} /></div></div>)}</div>
      </div>}
      <p style={{ color: "#64748b", fontSize: 11, marginBottom: 0 }}>Now = a playback heartbeat within 45 seconds. Period metrics cover sessions started in the selected window. Watch hours sum channel playback, so four-screen multiview can add four channel-hours per hour. Paused and buffering time is excluded. Unique devices are estimates, not unique people.</p>
    </>}
  </section>;
}
