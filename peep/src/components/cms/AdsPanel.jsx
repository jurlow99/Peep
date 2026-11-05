import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../../supabase";
import { SUPABASE_URL, IS_DEV_DB } from "../../lib/config";
import { TEST_VAST_URL } from "../../lib/ads";
import { DEFAULT_AD_POLICY, loadAdPolicy, saveAdPolicy, parseAdPolicy, midrollCuePoints } from "../../lib/adPolicy";
import { previewAdTag } from "../../lib/adBreak";
import { loadPauseAd } from "../../lib/pauseAd";
import { summarizeAdEvents, PLACEMENT_LABELS, PLATFORM_LABELS } from "../../lib/adsReport";
import { EMPTY_AD, POSITIONS, SCOPES, POSITION_LABELS, scopesForPosition, tagProblem, tagPayload, describeTarget, isUuid } from "../../lib/adsAdmin";
import "./AdsPanel.css";

// Monetization → Ad rules / Ad tags / Ad delivery: one job per page (view).
const IAB_SAMPLE_URL = `${SUPABASE_URL}/functions/v1/iab-vast-sample?variant=wrapper`;
const REPORT_DAYS = 30;
const PLAYERS = [["web", "Browser"], ["tvos", "Apple TV"]];

function Switch({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`ads-switch${on ? " on" : ""}`} onClick={() => onChange(!on)}><span /></button>
  );
}

function Minutes({ value, onChange, min, max, disabled }) {
  return <input className="ads-num" type="number" min={min} max={max} value={value} disabled={disabled} onChange={e => onChange(e.target.value)} />;
}

// One line of Ad rules: switch, name, its settings, which players it applies to.
function RuleRow({ draft, setRule, flag, title, note, children, players = "Browser + Apple TV" }) {
  return (
    <div className={`ads-rule-row${flag && !draft[flag] ? " is-off" : ""}`}>
      {flag ? <Switch on={!!draft[flag]} onChange={on => setRule(flag, on)} label={title} /> : <span className="ads-switch-spacer" />}
      <div className="ads-rule-name"><strong>{title}</strong>{note && <small>{note}</small>}</div>
      <div className="ads-rule-settings">{children}</div>
      <span className="ads-rule-players">{players}</span>
    </div>
  );
}

// "Steep" for Steep's tags, "Peep test" for Peep's sample server, else the host.
function serverName(url) {
  try {
    const host = new URL(url).hostname;
    if (host.startsWith("steep.")) return "Steep";
    if (host.endsWith(".supabase.co")) return "Peep test";
    if (host.includes("doubleclick") || host.includes("googlesyndication") || host.includes("imasdk")) return "Google sample";
    return host.replace(/^www\./, "");
  } catch { return "Unknown"; }
}
// What a tag covers, as a plain label: "Everything", "Live channels", "Full Force".
function ruleTarget(tag, titles) {
  if (tag.content_id) return titles[`${tag.scope}:${tag.content_id}`] || `${SCOPES.find(s => s.value === tag.scope)?.label || tag.scope} #${tag.content_id}`;
  return tag.scope === "global" ? "Everything" : SCOPES.find(s => s.value === tag.scope)?.label || tag.scope;
}
const specificity = tag => (tag.content_id ? 0 : tag.scope === "global" ? 2 : 1);

// Look up titles for the exact-content tags so the list reads "Movies · Alien" not "#4e11…".
async function titlesFor(tags) {
  const by = scope => [...new Set(tags.filter(t => t.scope === scope && t.content_id).map(t => String(t.content_id)))];
  const movies = by("movie").filter(isUuid), episodes = by("episode").filter(id => /^\d+$/.test(id)), channels = by("live").filter(id => /^-?\d+$/.test(id));
  const [m, e, c] = await Promise.all([
    movies.length ? supabase.from("videos").select("id,title").in("id", movies) : { data: [] },
    episodes.length ? supabase.from("episodes").select("id,title,season,episode_number").in("id", episodes) : { data: [] },
    channels.length ? supabase.from("channels").select("id,name").in("id", channels) : { data: [] },
  ]);
  const titles = {};
  (m.data || []).forEach(v => { titles[`movie:${v.id}`] = v.title; });
  (e.data || []).forEach(ep => { titles[`episode:${ep.id}`] = `S${ep.season}E${ep.episode_number} ${ep.title}`; });
  (c.data || []).forEach(ch => { titles[`live:${ch.id}`] = ch.name; });
  return titles;
}

async function searchContent(picker, query) {
  const q = `%${query.trim()}%`;
  if (picker === "movie") { const { data } = await supabase.from("videos").select("id,title,year").ilike("title", q).order("title").limit(8); return (data || []).map(v => ({ id: v.id, label: v.year ? `${v.title} (${v.year})` : v.title })); }
  if (picker === "episode") { const { data } = await supabase.from("episodes").select("id,title,season,episode_number,shows(title)").ilike("title", q).order("id", { ascending: false }).limit(8); return (data || []).map(ep => ({ id: ep.id, label: `${ep.shows?.title ? ep.shows.title + " · " : ""}S${ep.season}E${ep.episode_number} ${ep.title}` })); }
  const { data } = await supabase.from("channels").select("id,name").ilike("name", q).order("name").limit(8);
  return (data || []).map(ch => ({ id: ch.id, label: ch.name }));
}

export default function AdsPanel({ view = "rules", showToast, logAudit = () => {} }) {
  const [policy, setPolicy] = useState(DEFAULT_AD_POLICY);
  const [draft, setDraft] = useState(DEFAULT_AD_POLICY);
  const [savingRules, setSavingRules] = useState(false);
  const [tags, setTags] = useState([]);
  const [titles, setTitles] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null); // null = tag list, "new" = blank tag, else tag id
  const [openType, setOpenType] = useState(null); // the Ad tags card that's open
  const [form, setForm] = useState(EMPTY_AD);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rows, setRows] = useState([]);
  const [includeTests, setIncludeTests] = useState(false);
  const [reportAt, setReportAt] = useState(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerResults, setPickerResults] = useState([]);
  const [preview, setPreview] = useState(null); // { ok, text }
  const previewVideo = useRef(null), previewSurface = useRef(null), previewStop = useRef(null), reportGen = useRef(0);

  useEffect(() => { loadAll(); return () => previewStop.current?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadReport(includeTests); }, [includeTests]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { closeTag(); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    setLoading(true);
    const [rules] = await Promise.all([loadAdPolicy(), loadTags()]);
    setPolicy(rules); setDraft(rules);
    setLoading(false);
  }
  async function loadTags() {
    const { data, error } = await supabase.from("vast_tags").select("*").order("id");
    if (error) { showToast("Ad tags could not load: " + error.message, "error"); return; }
    setTags(data || []);
    setTitles(await titlesFor(data || []));
  }
  async function loadReport(withTests) {
    const generation = ++reportGen.current;
    const since = new Date(Date.now() - REPORT_DAYS * 86400000).toISOString();
    let request = supabase.from("ad_impressions").select("vast_tag_id,event,created_at,user_id,session_id,is_test,platform").gte("created_at", since).order("created_at", { ascending: false });
    if (!withTests) request = request.eq("is_test", false);
    const all = [];
    for (let page = 0; ; page++) {
      const result = await request.range(page * 1000, page * 1000 + 999);
      if (result.error) { showToast("Ad report could not load: " + result.error.message, "error"); return; }
      all.push(...(result.data || []));
      if ((result.data || []).length < 1000) break;
    }
    if (generation !== reportGen.current) return;
    setRows(all); setReportAt(new Date());
  }

  async function saveRules() {
    setSavingRules(true);
    const { error, policy: clean } = await saveAdPolicy(draft);
    if (error) showToast("Rules not saved: " + error.message, "error");
    else { setPolicy(clean); setDraft(clean); logAudit("update", "ads_policy", "rules"); showToast(clean.enabled ? "Ad rules saved" : "Ad rules saved — ads are off everywhere"); }
    setSavingRules(false);
  }

  function openTag(tag, adType = EMPTY_AD.ad_type) {
    previewStop.current?.(); setPreview(null); setConfirmDelete(false); setPickerQuery(""); setPickerResults([]);
    if (!tag) { setForm({ ...EMPTY_AD, ad_type: adType, is_test: false }); setSelectedId("new"); return; }
    setForm({ ...EMPTY_AD, ...tag, content_id: tag.content_id ?? "", content_label: titles[`${tag.scope}:${tag.content_id}`] || "" });
    setSelectedId(tag.id);
  }
  function closeTag() { previewStop.current?.(); setPreview(null); setSelectedId(null); }

  async function saveTag() {
    const problem = tagProblem(form, IS_DEV_DB);
    if (problem) { showToast(problem, "error"); return; }
    setSaving(true);
    const payload = tagPayload(form);
    const result = selectedId === "new" ? await supabase.from("vast_tags").insert([payload]).select().single() : await supabase.from("vast_tags").update(payload).eq("id", selectedId).select().single();
    setSaving(false);
    if (result.error) { showToast("Save failed: " + result.error.message, "error"); return; }
    logAudit(selectedId === "new" ? "create" : "update", "vast_tag", result.data.id, payload.name);
    showToast(selectedId === "new" ? "Tag added" : "Tag saved");
    await loadTags();
    setSelectedId(result.data.id);
    setForm(f => ({ ...f, ...result.data, content_id: result.data.content_id ?? "" }));
  }
  async function toggleActive(tag) {
    const { error } = await supabase.from("vast_tags").update({ active: !tag.active }).eq("id", tag.id);
    if (error) showToast("Update failed: " + error.message, "error");
    else { logAudit("update", "vast_tag", tag.id, tag.active ? "paused" : "activated"); await loadTags(); if (selectedId === tag.id) setForm(f => ({ ...f, active: !tag.active })); }
  }
  async function deleteTag() {
    const { error } = await supabase.from("vast_tags").delete().eq("id", selectedId);
    if (error) { showToast("Delete failed: " + error.message, "error"); return; }
    logAudit("delete", "vast_tag", selectedId, form.name);
    showToast("Tag deleted"); setConfirmDelete(false); closeTag(); await loadTags();
  }
  async function clearTestHistory() {
    if (!window.confirm("Delete all TEST ad delivery rows? Real delivery rows stay.")) return;
    const { error, count } = await supabase.from("ad_impressions").delete({ count: "exact" }).eq("is_test", true);
    if (error) showToast("Could not clear: " + error.message, "error");
    else { showToast(`Removed ${count ?? 0} test rows`); loadReport(includeTests); }
  }

  async function runPicker(query) {
    setPickerQuery(query);
    const scope = SCOPES.find(s => s.value === form.scope);
    if (!scope?.picker || query.trim().length < 2) { setPickerResults([]); return; }
    setPickerResults(await searchContent(scope.picker, query));
  }
  function pick(item) { setForm(f => ({ ...f, content_id: String(item.id), content_label: item.label })); setPickerQuery(""); setPickerResults([]); }

  function runPreview() {
    previewStop.current?.();
    const problem = tagProblem({ ...form, platforms: form.platforms?.length ? form.platforms : ["web"] }, IS_DEV_DB);
    if (problem && !/Apple TV|Browser|at least one/.test(problem)) { showToast(problem, "error"); return; }
    if (form.ad_type === "pause" || form.ad_type === "squeeze") {
      // A pause or L ad is one picture, not a video: fetch it and show it here.
      setPreview({ ok: null, text: "Asking the ad server…" });
      loadPauseAd(form.tag_url.trim(), { show: "Preview" }).then(ad => setPreview(ad
        ? { ok: true, text: `Picture found: ${ad.title}.${form.ad_type === "squeeze" ? ` Up for ${Math.round(ad.duration || 15)} seconds.` : ""}`, image: ad.image }
        : { ok: false, text: "No picture came back. Normal when no campaign targets \"Preview\"." }));
      return;
    }
    if (!previewVideo.current || !previewSurface.current) return;
    setPreview({ ok: null, text: "Loading the ad…" });
    previewStop.current = previewAdTag({ tagUrl: form.tag_url.trim(), video: previewVideo.current, container: previewSurface.current, onStatus: setPreview });
  }

  const report = useMemo(() => summarizeAdEvents(rows, tags, { days: 14 }), [rows, tags]);
  const rulesDirty = JSON.stringify(parseAdPolicy(draft)) !== JSON.stringify(policy);
  const setRule = (key, value) => setDraft(d => ({ ...d, [key]: value }));

  if (loading) return <div className="ads"><p className="ads-muted">Loading ads…</p></div>;

  // ───────────── Ad rules ─────────────
  if (view === "rules") {
    const off = !draft.enabled;
    const cues = midrollCuePoints(95 * 60, parseAdPolicy(draft));
    return (
      <div className="ads">
        <div className="ads-header">
          <div><h2>Ad rules</h2><p>When ads play. Every player follows these.</p></div>
          <div className="ads-master"><span>{draft.enabled ? "Ads on" : "Ads off everywhere"}</span><Switch on={!!draft.enabled} onChange={on => setRule("enabled", on)} label="All ads" /></div>
        </div>
        <div className={`ads-rule-list${off ? " all-off" : ""}`}>
          <h3 className="ads-group">Starting something</h3>
          <RuleRow draft={draft} setRule={setRule} title="Space between start ads" note="Before a title, channel or multiview.">
            at least <Minutes value={draft.min_gap_minutes} min={0} max={1440} onChange={v => setRule("min_gap_minutes", v)} /> min apart
          </RuleRow>
          <RuleRow draft={draft} setRule={setRule} flag="live_entry" title="Before a live channel" note="Can't be skipped." />
          <RuleRow draft={draft} setRule={setRule} flag="multiview_entry" title="Before multiview" note="Can't be skipped." players="Apple TV" />

          <h3 className="ads-group">Breaks</h3>
          <RuleRow draft={draft} setRule={setRule} flag="midroll_enabled" title="Breaks in movies & episodes" note={draft.midroll_enabled && cues.length ? `A 95-min movie: ${cues.map(s => Math.round(s / 60)).join(", ")} min` : "A 95-min movie gets none."}>
            every <Minutes value={draft.midroll_every_minutes} min={1} max={240} disabled={!draft.midroll_enabled} onChange={v => setRule("midroll_every_minutes", v)} /> min
            <span className="ads-sep" />titles over <Minutes value={draft.midroll_min_minutes} min={1} max={600} disabled={!draft.midroll_enabled} onChange={v => setRule("midroll_min_minutes", v)} /> min
            <span className="ads-sep" />max <Minutes value={draft.midroll_max_breaks} min={0} max={20} disabled={!draft.midroll_enabled} onChange={v => setRule("midroll_max_breaks", v)} />
          </RuleRow>
          <RuleRow draft={draft} setRule={setRule} flag="live_breaks" title="Live channel breaks" note="In the channel's own marked breaks. Can't be skipped." />
          <RuleRow draft={draft} setRule={setRule} flag="postroll_enabled" title="After movies & episodes" note="One break before Up next." />

          <h3 className="ads-group">Pictures</h3>
          <RuleRow draft={draft} setRule={setRule} flag="pause_enabled" title="Pause ads" note="2 s after the viewer pauses." />
          <RuleRow draft={draft} setRule={setRule} flag="squeeze_enabled" title="L ads" note="The show shrinks to the corner, about 15 s.">
            live: <Minutes value={draft.squeeze_live_after_break_minutes} min={1} max={30} disabled={!draft.squeeze_enabled} onChange={v => setRule("squeeze_live_after_break_minutes", v)} /> min after a break
            <span className="ads-sep" />titles: every <Minutes value={draft.squeeze_every_minutes} min={1} max={240} disabled={!draft.squeeze_enabled} onChange={v => setRule("squeeze_every_minutes", v)} /> min
          </RuleRow>
        </div>
        {rulesDirty && (
          <div className="ads-savebar">
            <span>Unsaved changes</span>
            <button type="button" onClick={() => setDraft(policy)}>Undo</button>
            <button type="button" className="ads-primary" onClick={saveRules} disabled={savingRules}>{savingRules ? "Saving…" : "Save rules"}</button>
          </div>
        )}
      </div>
    );
  }

  // ───────────── Ad delivery ─────────────
  if (view === "delivery") {
    const max = Math.max(...report.daily.map(d => d.count), 1);
    const n = value => (value || 0).toLocaleString();
    const tagRows = tags.filter(t => report.byTag[String(t.id)]);
    return (
      <div className="ads">
        <div className="ads-header">
          <div><h2>Ad delivery</h2><p>Last {REPORT_DAYS} days, counted by Peep. Your ad server's report is the one that pays.</p></div>
          <div className="ads-toolbar">
            <label className="ads-check"><input type="checkbox" checked={includeTests} onChange={e => setIncludeTests(e.target.checked)} />Include tests</label>
            {includeTests && <button type="button" className="ads-danger" onClick={clearTestHistory}>Clear test history</button>}
            <button type="button" onClick={() => loadReport(includeTests)}>Refresh</button>
          </div>
        </div>
        <div className="ads-tiles">
          <div className="ads-tile"><span>Ads shown</span><strong>{n(report.impressions)}</strong></div>
          <div className="ads-tile"><span>Breaks filled</span><strong>{report.startRate === null ? "—" : report.startRate + "%"}</strong></div>
          <div className="ads-tile"><span>Watched to the end</span><strong>{report.completionRate === null ? "—" : report.completionRate + "%"}</strong></div>
          <div className="ads-tile"><span>Viewers</span><strong>{n(report.uniqueViewers)}</strong></div>
          <div className="ads-tile"><span>Skipped</span><strong>{n(report.skips)}</strong></div>
          <div className="ads-tile" title="No ad came back, or it failed to play"><span>No ad / failed</span><strong>{n(report.errors)}</strong></div>
        </div>
        <div className="ads-card-box">
          <div className="ads-box-head"><h3>Ads shown per day</h3>{reportAt && <span className="ads-muted">Updated {reportAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}</div>
          <div className="ads-bars" aria-label="Ads shown per day, last 14 days">
            {report.daily.map(({ date, count }) => {
              const label = new Date(date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
              return <div key={date} title={`${label}: ${count.toLocaleString()} shown`}><em>{count || ""}</em><i className={count ? "" : "zero"} style={{ height: Math.max(count / max * 100, count ? 4 : 2) }} /><b>{label}</b></div>;
            })}
          </div>
        </div>
        <div className="ads-two">
          <div className="ads-card-box">
            <h3>By ad type</h3>
            <table><thead><tr><th>Type</th><th className="num">Asked</th><th className="num">Shown</th><th className="num">Finished</th></tr></thead><tbody>
              {Object.entries(report.byPlacement).map(([key, s]) => <tr key={key}><td>{PLACEMENT_LABELS[key] || "Deleted tag"}</td><td className="num">{s.requests ? n(s.requests) : "—"}</td><td className="num">{n(s.impressions)}</td><td className="num">{["pause", "squeeze"].includes(key) ? "—" : n(s.completes)}</td></tr>)}
              {Object.keys(report.byPlacement).length === 0 && <tr><td colSpan={4} className="ads-muted">Nothing yet</td></tr>}
            </tbody></table>
          </div>
          <div className="ads-card-box">
            <h3>By player</h3>
            <table><thead><tr><th>Player</th><th className="num">Shown</th><th className="num">Finished</th><th className="num">Failed</th></tr></thead><tbody>
              {Object.entries(report.byPlatform).map(([key, s]) => <tr key={key}><td>{PLATFORM_LABELS[key] || key}</td><td className="num">{n(s.impressions)}</td><td className="num">{n(s.completes)}</td><td className="num">{n(s.errors)}</td></tr>)}
              {Object.keys(report.byPlatform).length === 0 && <tr><td colSpan={4} className="ads-muted">Nothing yet</td></tr>}
            </tbody></table>
          </div>
        </div>
        <div className="ads-card-box">
          <h3>By tag</h3>
          <table><thead><tr><th>Tag</th><th className="num">Asked</th><th className="num">Shown</th><th className="num">Finished</th><th className="num">Skipped</th><th className="num">Failed</th></tr></thead><tbody>
            {tagRows.map(t => { const s = report.byTag[String(t.id)]; return (
              <tr key={t.id}><td><strong>{t.name}</strong><div className="ads-muted">{POSITION_LABELS[t.ad_type]} · {describeTarget(t, titles)}{t.is_test ? " · test" : ""}</div></td><td className="num">{s.requests ? n(s.requests) : "—"}</td><td className="num">{n(s.impressions)}</td><td className="num">{n(s.completes)}</td><td className="num">{n(s.skips)}</td><td className="num">{n(s.errors)}</td></tr>
            ); })}
            {tagRows.length === 0 && <tr><td colSpan={6} className="ads-muted">Nothing yet</td></tr>}
          </tbody></table>
        </div>
      </div>
    );
  }

  // ───────────── Ad tags: one tag ─────────────
  if (selectedId !== null) {
    const isNew = selectedId === "new";
    const problem = tagProblem(form, IS_DEV_DB);
    const scope = SCOPES.find(s => s.value === form.scope);
    const set = patch => setForm(f => ({ ...f, ...patch }));
    return (
      <div className="ads ads-editor">
        <button type="button" className="ads-back" onClick={closeTag}>← Ad tags</button>
        <div className="ads-header">
          <div><h2>{isNew ? "New tag" : form.name || "Untitled tag"}</h2><p>The link your ad server gave you, and where Peep uses it.</p></div>
          <div className="ads-master"><span>{form.active ? "On" : "Off"}</span><Switch on={!!form.active} onChange={on => set({ active: on })} label="Tag on" /></div>
        </div>

        <section className="ads-card-box ads-form">
          <label>Name<input value={form.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Steep — pre-roll, everything" /></label>
          <label>Tag URL<input value={form.tag_url} onChange={e => set({ tag_url: e.target.value })} placeholder="https://…" spellCheck={false} /></label>
          <div className="ads-inline-row">
            <label className="ads-check"><input type="checkbox" checked={form.is_test !== false} onChange={e => set({ is_test: e.target.checked })} />Test tag <small>(kept out of reports)</small></label>
            <span className="ads-muted">Try a sample:</span>
            <button type="button" className="ads-link" onClick={() => set({ tag_url: TEST_VAST_URL, is_test: true })}>Google</button>
            <button type="button" className="ads-link" onClick={() => set({ tag_url: IAB_SAMPLE_URL, is_test: true })}>Peep</button>
          </div>
          <details className="ads-help"><summary>Values Peep fills in</summary>[BREAK_SECONDS] [BREAK_MS] [CHANNEL] [SHOW] [GENRE] [DEVICE] [DEVICE_ID] [IFA] [LMT] [SKIPPABLE] [CT]</details>
        </section>

        <section className="ads-card-box ads-form">
          <span className="ads-field-label">Type</span>
          <div className="ads-segments" role="radiogroup" aria-label="Ad type">
            {POSITIONS.map(p => (
              <button key={p.value} type="button" role="radio" aria-checked={form.ad_type === p.value} className={form.ad_type === p.value ? "selected" : ""} title={p.hint}
                onClick={() => set({ ad_type: p.value, scope: scopesForPosition(p.value).some(s => s.value === form.scope) ? form.scope : "global", content_id: "", content_label: "" })}>
                {form.ad_type === p.value && <span aria-hidden="true">✓ </span>}{p.title}
              </button>
            ))}
          </div>
          <small className="ads-muted">{POSITIONS.find(p => p.value === form.ad_type)?.hint}</small>
          <div className="ads-fields">
            <label>Plays on
              <select value={form.scope} onChange={e => set({ scope: e.target.value, content_id: "", content_label: "" })}>
                {scopesForPosition(form.ad_type).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            {scope?.picker && (
              <label>Only this one <small className="ads-muted">(optional)</small>
                {form.content_id ? (
                  <span className="ads-picked"><span>{form.content_label || `#${form.content_id}`}</span><button type="button" className="ads-link" onClick={() => set({ content_id: "", content_label: "" })}>Clear</button></span>
                ) : (
                  <span className="ads-picker">
                    <input value={pickerQuery} onChange={e => runPicker(e.target.value)} placeholder={`Search ${scope.label.toLowerCase()}…`} />
                    {pickerResults.length > 0 && <ul>{pickerResults.map(item => <li key={item.id}><button type="button" onClick={() => pick(item)}>{item.label}</button></li>)}</ul>}
                  </span>
                )}
              </label>
            )}
          </div>
          <div className="ads-inline-row">
            <span className="ads-field-label" style={{ margin: 0 }}>Players</span>
            {PLAYERS.map(([key, label]) => (
              <label key={key} className="ads-check"><input type="checkbox" checked={(form.platforms || []).includes(key)} onChange={e => set({ platforms: e.target.checked ? [...new Set([...(form.platforms || []), key])] : (form.platforms || []).filter(p => p !== key) })} />{label}</label>
            ))}
          </div>
        </section>

        <section className="ads-card-box">
          <div className="ads-box-head"><h3>Try it</h3>
            <div className="ads-toolbar">
              {preview && <button type="button" onClick={() => { previewStop.current?.(); setPreview(null); }}>Stop</button>}
              <button type="button" onClick={runPreview} disabled={!form.tag_url.trim()}>Play this tag</button>
            </div>
          </div>
          <small className="ads-muted">Plays here like the website would. Nothing is counted.</small>
          {preview?.image && <img className="ads-preview-image" src={preview.image} alt="Ad preview" />}
          <div className="ads-preview" style={{ display: preview && !["pause", "squeeze"].includes(form.ad_type) ? "block" : "none" }}>
            <video ref={previewVideo} muted playsInline />
            <div ref={previewSurface} className="ads-preview-surface" />
          </div>
          {preview && <p className={`ads-note ${preview.ok === true ? "ok" : preview.ok === false ? "bad" : ""}`}>{preview.text}</p>}
        </section>

        {!isNew && (
          <div className="ads-delete">
            {!confirmDelete
              ? <button type="button" className="ads-danger" onClick={() => setConfirmDelete(true)}>Delete tag</button>
              : <><span className="ads-muted">Delete "{form.name}"? Past counts stay.</span><button type="button" className="ads-danger" onClick={deleteTag}>Yes, delete</button><button type="button" onClick={() => setConfirmDelete(false)}>Keep it</button></>}
          </div>
        )}
        <div className="ads-savebar">
          {problem ? <span className="ads-warn">{problem}</span> : <span>{form.is_test !== false ? "Test tag" : "Live tag"} · {POSITION_LABELS[form.ad_type]} · {describeTarget({ ...form, content_id: form.content_id || null }, { [`${form.scope}:${form.content_id}`]: form.content_label })}</span>}
          <button type="button" onClick={closeTag}>Cancel</button>
          <button type="button" className="ads-primary" onClick={saveTag} disabled={saving || !!problem}>{saving ? "Saving…" : isNew ? "Add tag" : "Save tag"}</button>
        </div>
      </div>
    );
  }

  // ───────────── Ad tags: one card per ad type ─────────────
  const real = tags.filter(t => !t.is_test), testing = tags.filter(t => t.is_test);
  const shownFor = list => list.reduce((sum, t) => sum + (report.byTag[String(t.id)]?.impressions || 0), 0);
  const TagLine = ({ tag, showType }) => {
    const stats = report.byTag[String(tag.id)];
    return (
      <div className={`ads-tagline${tag.active ? "" : " is-off"}`}>
        <Switch on={!!tag.active} onChange={() => toggleActive(tag)} label={`${tag.name} on`} />
        <div className="ads-tagline-text">
          <strong>{showType ? `${POSITION_LABELS[tag.ad_type] || tag.ad_type} · ` : ""}{ruleTarget(tag, titles)}</strong>
          <span>uses {serverName(tag.tag_url)} <em title={tag.name}>· {tag.name}</em></span>
        </div>
        <span className="ads-muted">{(tag.platforms || ["web"]).map(p => PLATFORM_LABELS[p] || p).join(" + ")}</span>
        <span className="ads-muted num">{stats ? `${stats.impressions.toLocaleString()} shown` : "—"}</span>
        <button type="button" onClick={() => openTag(tag)}>Edit</button>
      </div>
    );
  };
  return (
    <div className="ads">
      <div className="ads-header">
        <div><h2>Ad tags</h2><p>Where each kind of ad comes from.</p></div>
        <button type="button" className="ads-primary" onClick={() => openTag(null)}>+ Add tag</button>
      </div>
      <div className="ads-typecards">
        {POSITIONS.map(p => {
          const list = real.filter(t => t.ad_type === p.value).sort((a, b) => specificity(a) - specificity(b) || a.id - b.id);
          const on = list.filter(t => t.active);
          const open = openType === p.value;
          const servers = [...new Set(on.map(t => serverName(t.tag_url)))];
          const devices = [...new Set(on.flatMap(t => t.platforms || ["web"]))].map(d => PLATFORM_LABELS[d] || d).join(" + ");
          return (
            <section key={p.value} className={`ads-typecard${on.length ? "" : " is-off"}${open ? " open" : ""}`}>
              <button type="button" className="ads-typecard-head" aria-expanded={open} onClick={() => setOpenType(open ? null : p.value)}>
                <span className={`ads-dot${on.length ? " on" : ""}`} aria-hidden="true" />
                <span className="ads-typecard-title"><strong>{p.title}</strong><small>{p.hint}</small></span>
                <span className="ads-typecard-facts">
                  <span>{on.length ? servers.join(", ") : list.length ? "Off" : "Not set up"}</span>
                  <span className="ads-muted">{on.length ? devices : ""}</span>
                  <span className="ads-muted num">{list.length ? `${shownFor(list).toLocaleString()} shown` : ""}</span>
                </span>
                <span className="ads-chev" aria-hidden="true">{open ? "▾" : "▸"}</span>
              </button>
              {open && (
                <div className="ads-typecard-body">
                  {list.length === 0 && <p className="ads-muted">No ad server for {p.title.toLowerCase()}s yet.</p>}
                  {list.map(tag => <TagLine key={tag.id} tag={tag} />)}
                  {list.length > 1 && <p className="ads-muted">The most specific rule wins: one title beats a type, a type beats everything.</p>}
                  <button type="button" className="ads-link" onClick={() => openTag(null, p.value)}>+ Add a {p.title.toLowerCase()} rule</button>
                </div>
              )}
            </section>
          );
        })}
      </div>
      {testing.length > 0 && (
        <details className="ads-testing">
          <summary>Testing <b>{testing.length}</b> <span className="ads-muted">{testing.filter(t => t.active).length ? `${testing.filter(t => t.active).length} on` : "all off"}</span></summary>
          <p className="ads-muted">Test tags are kept out of reports. Turn one on only to try something.</p>
          {testing.map(tag => <TagLine key={tag.id} tag={tag} showType />)}
        </details>
      )}
    </div>
  );
}
