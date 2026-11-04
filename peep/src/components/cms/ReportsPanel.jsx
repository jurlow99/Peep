import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase";
import {
  PERIODS, periodRange, monthRange, monthKey, localTimeZone, change, formatNumber, formatDuration,
  hourLabel, PLATFORM_LABELS, KIND_LABELS, toCSV, downloadCSV, fillDays,
} from "../../lib/reports";

// Reports → Overview / Channels / MOU. One page per job; numbers from the
// platform_report, channel_report and mou_report RPCs (db/features/reporting.sql).
const panel = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 20 };
const muted = { color: "#64748b", fontSize: 12 };
const th = { padding: "8px 10px", color: "#64748b", fontWeight: 600, fontSize: 12, borderBottom: "1px solid #e2e8f0", textAlign: "left", whiteSpace: "nowrap" };
const td = { padding: "8px 10px", borderBottom: "1px solid #f1f5f9", fontSize: 13, color: "#0f172a" };
const num = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const primary = { background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const secondary = { background: "#fff", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer" };
// Categorical slots 1 and 2 (dataviz reference palette): live = blue, on-demand = orange.
const LIVE = "#2a78d6", VOD = "#eb6834";

function useReport(rpc, args) {
  const [state, setState] = useState({ data: null, error: "", loading: true });
  const key = JSON.stringify(args);
  const load = useCallback(() => {
    setState(s => ({ ...s, loading: true }));
    return supabase.rpc(rpc, JSON.parse(key)).then(({ data, error }) =>
      setState(s => ({ data: error ? s.data : data, error: error?.message || "", loading: false })));
  }, [rpc, key]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

function Toolbar({ title, period, setPeriod, includeTests, setIncludeTests, loading, reload, updatedAt, action, children }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
    <h2 style={{ margin: 0, fontSize: 20, color: "#0f172a" }}>{title}</h2>
    {setPeriod && <select aria-label="Reporting period" value={period} onChange={e => setPeriod(e.target.value)} style={secondary}>
      {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
    </select>}
    {children}
    <label style={{ fontSize: 13, color: "#475569" }}><input type="checkbox" checked={includeTests} onChange={e => setIncludeTests(e.target.checked)} /> Include tests</label>
    <button type="button" style={secondary} disabled={loading} onClick={reload}>{loading ? "Loading…" : "Refresh"}</button>
    {action}
    {updatedAt && <span style={{ ...muted, marginLeft: "auto" }}>Updated {new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
  </div>;
}

function Tile({ label, value, delta, hint }) {
  return <div style={{ background: "#f8fafc", borderRadius: 10, padding: "14px 16px" }} title={hint}>
    <div style={muted}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 700, color: "#0f172a", paddingTop: 6 }}>{value}</div>
    {delta !== undefined && <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
      {delta === null ? "No earlier data" : `${delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} ${Math.abs(delta)}% vs previous`}
    </div>}
  </div>;
}

// Bar chart: one bar per entry, optionally stacked. Hover shows the exact values.
function Bars({ items, series, label, height = 140, ariaLabel }) {
  const [hover, setHover] = useState(null);
  const total = i => series.reduce((s, k) => s + Number(i[k.key] || 0), 0);
  const max = Math.max(1, ...items.map(total));
  return <div aria-label={ariaLabel} role="img" style={{ position: "relative" }}>
    {series.length > 1 && <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
      {series.map(s => <span key={s.key} style={{ fontSize: 12, color: "#475569", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />{s.label}</span>)}
    </div>}
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height, borderBottom: "1px solid #cbd5e1" }}>
      {items.map((item, i) => <div key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
        style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column-reverse", cursor: "default", minWidth: 2 }}>
        {series.map((s, j) => { const v = Number(item[s.key] || 0); return v > 0 && <div key={s.key} style={{
          height: `${v / max * 100}%`, background: s.color, opacity: hover === null || hover === i ? 1 : 0.55,
          borderRadius: j === series.length - 1 || series.slice(j + 1).every(n => !Number(item[n.key])) ? "4px 4px 0 0" : 0,
          marginTop: j > 0 ? 2 : 0 }} />; })}
      </div>)}
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", ...muted, fontSize: 11, marginTop: 4 }}>
      <span>{items.length ? label(items[0]) : ""}</span><span>{items.length ? label(items[items.length - 1]) : ""}</span>
    </div>
    {hover !== null && items[hover] && <div role="tooltip" style={{ position: "absolute", top: 0, right: 0, background: "#0f172a", color: "#fff", borderRadius: 8, padding: "6px 10px", fontSize: 12, pointerEvents: "none" }}>
      <strong>{label(items[hover])}</strong>
      {series.map(s => <div key={s.key}>{s.label}: {formatNumber(items[hover][s.key])} min</div>)}
    </div>}
  </div>;
}

function Table({ columns, rows, empty = "Nothing watched in this period yet.", rowKey, onRow, expanded, renderExpanded }) {
  return <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
    <thead><tr>{columns.map(c => <th key={c.label} style={{ ...th, textAlign: c.num ? "right" : "left" }}>{c.label}</th>)}</tr></thead>
    <tbody>{rows.length ? rows.map(r => <Fragment key={rowKey(r)}>
      <tr onClick={onRow ? () => onRow(r) : undefined} style={{ cursor: onRow ? "pointer" : "default", background: expanded === rowKey(r) ? "#eef2ff" : undefined }}>
        {columns.map(c => <td key={c.label} style={c.num ? num : td}>{c.render ? c.render(r) : r[c.key]}</td>)}
      </tr>
      {expanded === rowKey(r) && renderExpanded && <tr><td colSpan={columns.length} style={{ padding: 16, background: "#f8fafc" }}>{renderExpanded(r)}</td></tr>}
    </Fragment>) : <tr><td colSpan={columns.length} style={{ ...td, color: "#94a3b8", textAlign: "center", padding: 24 }}>{empty}</td></tr>}</tbody>
  </table></div>;
}

const dayLabel = d => new Date(`${d.day}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });

function Overview() {
  const [period, setPeriod] = useState("30d");
  const [includeTests, setIncludeTests] = useState(false);
  const range = useMemo(() => periodRange(period), [period]);
  const { data, error, loading, reload } = useReport("platform_report", { p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_include_test: includeTests, p_tz: localTimeZone() });
  const t = data?.totals, p = data?.previous;
  const days = useMemo(() => data ? fillDays(data.daily, range.from, range.to) : [], [data, range]);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, h) => data?.hours.find(x => x.hour === h) || { hour: h }), [data]);
  const platformTotal = Math.max(1, (data?.platforms || []).reduce((s, x) => s + Number(x.minutes), 0));
  return <section style={panel} aria-label="Platform overview">
    <Toolbar title="Overview" {...{ period, setPeriod, includeTests, setIncludeTests, loading, reload }} updatedAt={data?.updated_at} />
    {error && <p role="alert" style={{ color: "#b91c1c" }}>Couldn’t load the report: {error}</p>}
    {!data && !error && <p role="status">Loading…</p>}
    {data && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        <Tile label="Minutes watched (MOU)" value={formatNumber(t.minutes)} delta={change(t.minutes, p.minutes)} hint="Live + on-demand minutes actually played. Ads, pauses and buffering don't count." />
        <Tile label="Live TV minutes" value={formatNumber(t.live_minutes)} />
        <Tile label="On-demand minutes" value={formatNumber(t.vod_minutes)} />
        <Tile label="Devices" value={formatNumber(t.devices)} delta={change(t.devices, p.devices)} hint="Distinct Apple TVs and browsers that watched." />
        <Tile label="Signed-in viewers" value={formatNumber(t.viewers)} delta={change(t.viewers, p.viewers)} />
        <Tile label="Time per device" value={formatDuration(t.minutes_per_device)} />
        <Tile label="Plays" value={formatNumber(t.sessions)} delta={change(t.sessions, p.sessions)} />
        <Tile label="New sign-ups" value={formatNumber(data.signups)} />
        <Tile label="Ad impressions" value={formatNumber(data.ad_impressions)} />
      </div>
      <h3 style={{ fontSize: 15, margin: "0 0 10px" }}>Minutes watched per day</h3>
      <Bars ariaLabel="Minutes watched per day, live and on-demand" items={days} label={dayLabel}
        series={[{ key: "live_minutes", label: "Live TV", color: LIVE }, { key: "vod_minutes", label: "On-demand", color: VOD }]} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 28, marginTop: 28 }}>
        <div>
          <h3 style={{ fontSize: 15, margin: "0 0 10px" }}>When people watch</h3>
          <Bars ariaLabel="Minutes watched by hour of day" items={hours} label={h => hourLabel(h.hour)} height={100} series={[{ key: "minutes", label: "Minutes", color: LIVE }]} />
        </div>
        <div>
          <h3 style={{ fontSize: 15, margin: "0 0 10px" }}>Devices</h3>
          {data.platforms.length ? data.platforms.map(x => <div key={x.platform} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>{PLATFORM_LABELS[x.platform] || x.platform}</span>
              <span style={{ color: "#475569" }}>{formatNumber(x.minutes)} min · {formatNumber(x.devices)} devices</span></div>
            <div style={{ background: "#e2e8f0", height: 6, borderRadius: 3, marginTop: 6 }}><div style={{ width: `${x.minutes / platformTotal * 100}%`, background: LIVE, height: "100%", borderRadius: 3 }} /></div>
          </div>) : <p style={muted}>No plays yet.</p>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 28, marginTop: 28 }}>
        {[["Top channels", data.top_channels], ["Top titles", data.top_titles]].map(([heading, rows]) => <div key={heading}>
          <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>{heading}</h3>
          <Table rowKey={r => `${r.kind}:${r.item_id}`} rows={rows} columns={[
            { label: "Name", render: r => <>{r.name}{r.kind !== "channel" && <span style={{ ...muted, marginLeft: 6 }}>{KIND_LABELS[r.kind]}</span>}</> },
            { label: "Minutes", num: true, render: r => formatNumber(r.minutes) },
            { label: "Devices", num: true, render: r => formatNumber(r.devices) },
          ]} />
        </div>)}
      </div>
    </>}
  </section>;
}

const CHANNEL_COLUMNS = [
  { key: "name", label: "Channel" },
  { key: "minutes", label: "Minutes (MOU)", num: true, render: r => formatNumber(r.minutes) },
  { key: "share", label: "Share", num: true, render: r => `${formatNumber(r.share)}%` },
  { key: "devices", label: "Devices", num: true, render: r => formatNumber(r.devices) },
  { key: "minutes_per_device", label: "Min / device", num: true, render: r => formatNumber(r.minutes_per_device) },
  { key: "minutes_per_session", label: "Min / play", num: true, render: r => formatNumber(r.minutes_per_session) },
  { key: "ama", label: "Avg. audience", num: true, render: r => formatNumber(r.ama) },
  { key: "peak_hour", label: "Busiest hour", render: r => hourLabel(r.peak_hour) },
];

function Channels() {
  const [period, setPeriod] = useState("30d");
  const [includeTests, setIncludeTests] = useState(false);
  const [open, setOpen] = useState(null);
  const [showIdle, setShowIdle] = useState(false);
  const range = useMemo(() => periodRange(period), [period]);
  const { data, error, loading, reload } = useReport("channel_report", { p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_include_test: includeTests, p_tz: localTimeZone() });
  const all = data?.channels || [];
  const rows = showIdle ? all : all.filter(c => Number(c.minutes) > 0);
  const exportCSV = () => downloadCSV(`peep-channels-${range.from.toISOString().slice(0, 10)}.csv`, toCSV(all, [
    { key: "id", label: "Channel ID" }, ...CHANNEL_COLUMNS.map(c => ({ key: c.key, label: c.label })),
    { key: "sessions", label: "Plays" }, { key: "viewers", label: "Signed-in viewers" },
    ...Object.entries(PLATFORM_LABELS).map(([k, label]) => ({ label: `${label} minutes`, value: r => r.platforms?.[k] || 0 })),
  ]));
  return <section style={panel} aria-label="Channel stats">
    <Toolbar title="Channels" {...{ period, setPeriod, includeTests, setIncludeTests, loading, reload }} updatedAt={data?.updated_at}
      action={<button type="button" style={primary} disabled={!data} onClick={exportCSV}>Download CSV</button>} />
    {error && <p role="alert" style={{ color: "#b91c1c" }}>Couldn’t load the report: {error}</p>}
    {!data && !error && <p role="status">Loading…</p>}
    {data && <>
      <Table rows={rows} rowKey={r => String(r.id)} columns={CHANNEL_COLUMNS} expanded={open} onRow={r => setOpen(open === String(r.id) ? null : String(r.id))}
        renderExpanded={r => <div>
          <Bars ariaLabel={`${r.name} minutes per day`} items={fillDays(r.daily, range.from, range.to)} label={dayLabel} height={90} series={[{ key: "minutes", label: "Minutes", color: LIVE }]} />
          <p style={{ ...muted, marginBottom: 0 }}>{formatNumber(r.sessions)} plays · {formatNumber(r.viewers)} signed-in viewers · {Object.entries(r.platforms || {}).map(([k, v]) => `${PLATFORM_LABELS[k] || k} ${formatNumber(v)} min`).join(" · ") || "no plays"}</p>
        </div>} />
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
        <label style={{ fontSize: 13, color: "#475569" }}><input type="checkbox" checked={showIdle} onChange={e => setShowIdle(e.target.checked)} /> Show channels nobody watched ({all.length - all.filter(c => Number(c.minutes) > 0).length})</label>
      </div>
      <details style={{ ...muted, marginTop: 12 }}><summary style={{ cursor: "pointer" }}>What these mean</summary>
        <p>Minutes are live playback actually watched; ads, pauses and buffering don't count. Share is the channel's part of all Live TV minutes. Avg. audience is how many devices were watching at an average moment (minutes ÷ minutes in the period). Busiest hour is in your time zone. Click a channel for its daily minutes.</p>
      </details>
    </>}
  </section>;
}

function MOU() {
  const [month, setMonth] = useState(() => monthKey());
  const [includeTests, setIncludeTests] = useState(false);
  const [kind, setKind] = useState("all");
  const [byPartner, setByPartner] = useState(false);
  const range = useMemo(() => monthRange(month), [month]);
  const { data, error, loading, reload } = useReport("mou_report", { p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_include_test: includeTests });
  const rows = (data?.rows || []).filter(r => kind === "all" || r.kind === kind);
  const partners = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const name = r.partner || "No partner";
      const p = map.get(name) || { partner: name, minutes: 0, items: 0 };
      p.minutes += Number(r.minutes); p.items += 1; map.set(name, p);
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }, [rows]);
  const total = rows.reduce((s, r) => s + Number(r.minutes), 0);
  const exportCSV = () => downloadCSV(`peep-mou-${month}.csv`, byPartner
    ? toCSV(partners, [{ label: "Month", value: () => month }, { key: "partner", label: "Partner" }, { key: "items", label: "Titles and channels" }, { key: "minutes", label: "Minutes (MOU)" }, { label: "Hours", value: r => (r.minutes / 60).toFixed(1) }])
    : toCSV(rows, [{ label: "Month", value: () => month }, { label: "Type", value: r => KIND_LABELS[r.kind] }, { key: "id", label: "ID" }, { key: "name", label: "Name" },
      { key: "partner", label: "Partner" }, { key: "minutes", label: "Minutes (MOU)" }, { label: "Hours", value: r => (r.minutes / 60).toFixed(1) },
      { key: "sessions", label: "Plays" }, { key: "devices", label: "Devices" }, { key: "viewers", label: "Signed-in viewers" }]));
  return <section style={panel} aria-label="Minutes of usage">
    <Toolbar title="MOU" {...{ includeTests, setIncludeTests, loading, reload }} updatedAt={data?.updated_at}
      action={<button type="button" style={primary} disabled={!data} onClick={exportCSV}>Download CSV</button>}>
      <input type="month" aria-label="Month" value={month} max={monthKey()} onChange={e => e.target.value && setMonth(e.target.value)} style={{ ...secondary, width: 150 }} />
      <select aria-label="Show" value={kind} onChange={e => setKind(e.target.value)} style={secondary}>
        <option value="all">Everything</option><option value="channel">Channels</option><option value="movie">Movies</option><option value="series">Series</option>
      </select>
      <label style={{ fontSize: 13, color: "#475569" }}><input type="checkbox" checked={byPartner} onChange={e => setByPartner(e.target.checked)} /> By partner</label>
    </Toolbar>
    {error && <p role="alert" style={{ color: "#b91c1c" }}>Couldn’t load the report: {error}</p>}
    {!data && !error && <p role="status">Loading…</p>}
    {data && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        <Tile label="Minutes (MOU)" value={formatNumber(total)} />
        <Tile label="Hours" value={formatNumber(total / 60)} />
        <Tile label={byPartner ? "Partners" : "Titles and channels"} value={formatNumber(byPartner ? partners.length : rows.length)} />
      </div>
      {byPartner
        ? <Table rows={partners} rowKey={r => r.partner} columns={[
            { key: "partner", label: "Partner" }, { label: "Titles and channels", num: true, render: r => formatNumber(r.items) },
            { label: "Minutes (MOU)", num: true, render: r => formatNumber(r.minutes) }, { label: "Share", num: true, render: r => `${total ? formatNumber(r.minutes / total * 100) : 0}%` }]} />
        : <Table rows={rows} rowKey={r => `${r.kind}:${r.id}`} columns={[
            { label: "Name", render: r => r.name }, { label: "Type", render: r => KIND_LABELS[r.kind] }, { label: "Partner", render: r => r.partner || <span style={{ color: "#94a3b8" }}>—</span> },
            { label: "Minutes (MOU)", num: true, render: r => formatNumber(r.minutes) }, { label: "Devices", num: true, render: r => formatNumber(r.devices) },
            { label: "Plays", num: true, render: r => formatNumber(r.sessions) }]} />}
      <p style={{ ...muted, marginTop: 12, marginBottom: 0 }}>Minutes actually played in {new Date(range.from).toLocaleDateString([], { month: "long", year: "numeric" })}, your time zone. Episodes count under their series. Partners come from Provider deliveries.</p>
    </>}
  </section>;
}

export default function ReportsPanel({ view }) {
  if (view === "channels") return <Channels />;
  if (view === "mou") return <MOU />;
  return <Overview />;
}
