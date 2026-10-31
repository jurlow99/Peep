import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../../supabase";
import { SUPABASE_URL, IS_DEV_DB } from "../../lib/config";
import { TEST_VAST_URL } from "../../lib/ads";
import { DEFAULT_AD_POLICY, loadAdPolicy, saveAdPolicy, parseAdPolicy, midrollCuePoints } from "../../lib/adPolicy";
import { previewAdTag } from "../../lib/adBreak";
import { summarizeAdEvents, PLACEMENT_LABELS, PLATFORM_LABELS } from "../../lib/adsReport";
import { EMPTY_AD, POSITIONS, SCOPES, POSITION_LABELS, scopesForPosition, tagProblem, tagPayload, describeTarget, isUuid } from "../../lib/adsAdmin";
import "./AdsPanel.css";

const IAB_SAMPLE_URL = `${SUPABASE_URL}/functions/v1/iab-vast-sample?variant=wrapper`;
const REPORT_DAYS = 30;

function Switch({ on, onChange, label }) {
  return (
    <span className="ads-switch">
      <button type="button" className={on ? "on" : ""} aria-pressed={on} aria-label={label} onClick={() => onChange(!on)}><span /></button>
      {label}
    </span>
  );
}

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

export default function AdsPanel({ showToast, logAudit = () => {} }) {
  const [policy, setPolicy] = useState(DEFAULT_AD_POLICY);
  const [draft, setDraft] = useState(DEFAULT_AD_POLICY);
  const [savingRules, setSavingRules] = useState(false);
  const [tags, setTags] = useState([]);
  const [titles, setTitles] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null); // null = overview, "new" = blank tag, else tag id
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

  function openTag(tag) {
    previewStop.current?.(); setPreview(null); setConfirmDelete(false); setPickerQuery(""); setPickerResults([]);
    if (!tag) { setForm(EMPTY_AD); setSelectedId("new"); return; }
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
    if (!previewVideo.current || !previewSurface.current) return;
    setPreview({ ok: null, text: "Loading the ad SDK…" });
    previewStop.current = previewAdTag({ tagUrl: form.tag_url.trim(), video: previewVideo.current, container: previewSurface.current, onStatus: setPreview });
  }

  const report = useMemo(() => summarizeAdEvents(rows, tags, { days: 14 }), [rows, tags]);
  const rulesDirty = JSON.stringify(parseAdPolicy(draft)) !== JSON.stringify(policy);
  const liveTags = tags.filter(t => t.active && !t.is_test).length;
  const exampleCues = midrollCuePoints(95 * 60, parseAdPolicy(draft));
  const setRule = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  const scope = SCOPES.find(s => s.value === form.scope);

  if (loading) return <div className="ads"><p className="ads-muted">Loading ads…</p></div>;

  // ───────────── One tag, full page ─────────────
  if (selectedId !== null) {
    const isNew = selectedId === "new";
    const problem = tagProblem(form, IS_DEV_DB);
    return (
      <div className="ads">
        <button type="button" className="ads-back" onClick={closeTag}>← All ads</button>
        <div className="ads-header">
          <div>
            <span className="ads-label">{isNew ? "NEW TAG" : `TAG #${selectedId}`}</span>
            <h2>{form.name || "Untitled tag"}</h2>
            <p>A tag is the link your ad server gave you. Peep asks it for an ad at the position you choose; the server decides what plays and keeps the money records.</p>
          </div>
          <div className="ads-actions" style={{ marginTop: 0 }}>
            {!isNew && <span className={`ads-badge ${form.active ? "live" : ""}`}>{form.active ? "ACTIVE" : "PAUSED"}</span>}
            {form.is_test && <span className="ads-badge test">TEST · no earnings</span>}
          </div>
        </div>

        <section className="ads-section">
          <h3>1. What plays</h3>
          <p>Paste the VAST tag URL from your ad server. Keep "Test tag" on until a real, paid tag is in place; test delivery stays out of the normal report.</p>
          <div className="ads-fields">
            <label>Name<input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. House pre-roll — all movies" /></label>
          </div>
          <div className="ads-fields">
            <label>VAST tag URL<input value={form.tag_url} onChange={e => setForm(f => ({ ...f, tag_url: e.target.value }))} placeholder="https://…" spellCheck={false} /></label>
          </div>
          <div className="ads-actions">
            <button type="button" onClick={() => setForm(f => ({ ...f, tag_url: TEST_VAST_URL, is_test: true }))}>Use Google's sample ad</button>
            <button type="button" onClick={() => setForm(f => ({ ...f, tag_url: IAB_SAMPLE_URL, is_test: true }))}>Use Peep's IAB sample ad</button>
            <label className="ads-check"><input type="checkbox" checked={form.is_test !== false} onChange={e => setForm(f => ({ ...f, is_test: e.target.checked }))} />Test tag <small>— sample or trial, excluded from reports</small></label>
          </div>
        </section>

        <section className="ads-section">
          <h3>2. Where it plays</h3>
          <p>Pick the position, then what it applies to. A tag aimed at one exact title beats a type-wide tag, which beats "All content".</p>
          <div className="ads-positions">
            {POSITIONS.map(p => (
              <label key={p.value} className={form.ad_type === p.value ? "selected" : ""}>
                <input type="radio" name="position" checked={form.ad_type === p.value} onChange={() => setForm(f => ({ ...f, ad_type: p.value, scope: scopesForPosition(p.value).some(s => s.value === f.scope) ? f.scope : "global", content_id: "", content_label: "" }))} />
                <div><strong>{p.title}</strong><span>{p.hint}</span></div>
              </label>
            ))}
          </div>
          <div className="ads-fields">
            <label>Applies to
              <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value, content_id: "", content_label: "" }))}>
                {scopesForPosition(form.ad_type).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            {scope?.picker && (
              <label>Only this title <small className="ads-muted" style={{ fontWeight: 400 }}>(optional — blank means every {scope.label.toLowerCase().replace(/s$/, "")})</small>
                {form.content_id ? (
                  <span className="ads-picked"><span>{form.content_label || `#${form.content_id}`}</span><button type="button" className="ads-link" onClick={() => setForm(f => ({ ...f, content_id: "", content_label: "" }))}>Clear</button></span>
                ) : (
                  <span className="ads-picker">
                    <input value={pickerQuery} onChange={e => runPicker(e.target.value)} placeholder={`Search ${scope.label.toLowerCase()} by name…`} />
                    {pickerResults.length > 0 && <ul>{pickerResults.map(item => <li key={item.id}><button type="button" onClick={() => pick(item)}>{item.label}</button></li>)}</ul>}
                  </span>
                )}
              </label>
            )}
          </div>
          <div className="ads-actions">
            <span className="ads-label" style={{ marginBottom: 0 }}>PLAYERS</span>
            {[["web", "Browser"], ["tvos", "Apple TV"]].map(([key, label]) => (
              <label key={key} className="ads-check"><input type="checkbox" checked={(form.platforms || []).includes(key)} onChange={e => setForm(f => ({ ...f, platforms: e.target.checked ? [...new Set([...(f.platforms || []), key])] : (f.platforms || []).filter(p => p !== key) }))} />{label}</label>
            ))}
          </div>
          {problem && <p className="ads-note warn">{problem}</p>}
        </section>

        <section className="ads-section">
          <h3>3. Check it</h3>
          <p>Plays this tag right here through the same Google IMA SDK the website uses. Nothing is recorded. Apple TV uses its own SDK, so test that on the device.</p>
          <div className="ads-actions">
            <button type="button" onClick={runPreview} disabled={!form.tag_url.trim()}>Play this tag</button>
            {preview && <button type="button" onClick={() => previewStop.current?.()}>Stop</button>}
          </div>
          <div className="ads-preview" style={{ display: preview ? "block" : "none" }}>
            <video ref={previewVideo} muted playsInline />
            <div ref={previewSurface} className="ads-preview-surface" />
          </div>
          {preview && <p className={`ads-note ${preview.ok === true ? "ok" : preview.ok === false ? "bad" : ""}`}>{preview.text}</p>}
        </section>

        <section className="ads-section">
          <h3>4. Turn it on</h3>
          <p>Active tags are requested by players right away. Pausing stops new requests; an ad already loading finishes.</p>
          <Switch on={!!form.active} onChange={on => setForm(f => ({ ...f, active: on }))} label={form.active ? "Active — players will request this tag" : "Paused"} />
          <div className="ads-actions">
            <button type="button" className="ads-primary" onClick={saveTag} disabled={saving || !!problem}>{saving ? "Saving…" : isNew ? "Add tag" : "Save tag"}</button>
            {!isNew && !confirmDelete && <button type="button" className="ads-danger" onClick={() => setConfirmDelete(true)}>Delete tag</button>}
            {confirmDelete && <><span className="ads-muted">Delete "{form.name}"? Past delivery rows keep their counts.</span><button type="button" className="ads-danger" onClick={deleteTag}>Yes, delete</button><button type="button" onClick={() => setConfirmDelete(false)}>Keep it</button></>}
          </div>
        </section>
      </div>
    );
  }

  // ───────────── Overview: rules, tags, report ─────────────
  return (
    <div className="ads">
      <div className="ads-header">
        <div>
          <h2>Ads</h2>
          <p>Rules decide <em>when</em> a break plays on every player; tags decide <em>what</em> plays. Peep requests ads through Google IMA and counts delivery; the ad server behind each tag is where the money is tracked and paid.</p>
        </div>
        <div className="ads-actions" style={{ marginTop: 0 }}>
          <button type="button" className="ads-primary" onClick={() => openTag(null)}>+ New tag</button>
        </div>
      </div>

      <section className="ads-section">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div><h3>Ad rules</h3><p style={{ margin: 0 }}>Apply to the browser and Apple TV. Mid- and post-rolls are browser only for now.</p></div>
          <Switch on={!!draft.enabled} onChange={on => setRule("enabled", on)} label={draft.enabled ? "Ads are on" : "Ads are off everywhere"} />
        </div>
        <div className="ads-rules">
          <div className="ads-rule">
            <strong>Space between entry ads</strong>
            <small>An entry ad plays when a movie, episode, channel or multiview starts. After any ad starts, no entry ad plays again on that device for this long. 0 means every start.</small>
            <span className="ads-inline">At least <input type="number" min="0" max="1440" value={draft.min_gap_minutes} onChange={e => setRule("min_gap_minutes", e.target.value)} /> minutes apart</span>
          </div>
          <div className="ads-rule">
            <strong>Live TV</strong>
            <small>Entry ad before joining a channel or opening a multiview package. Ads already inside a channel's own stream are unaffected.</small>
            <label className="ads-check"><input type="checkbox" checked={!!draft.live_entry} onChange={e => setRule("live_entry", e.target.checked)} />Ad before a live channel</label>
            <label className="ads-check"><input type="checkbox" checked={!!draft.multiview_entry} onChange={e => setRule("multiview_entry", e.target.checked)} />Ad before multiview</label>
          </div>
          <div className="ads-rule">
            <strong>Mid-rolls in movies and episodes</strong>
            <small>Breaks inside a title, browser only. Skipping ahead past several break points plays one break, not several.</small>
            <label className="ads-check"><input type="checkbox" checked={!!draft.midroll_enabled} onChange={e => setRule("midroll_enabled", e.target.checked)} />Mid-rolls on</label>
            <span className="ads-inline">Every <input type="number" min="1" max="240" value={draft.midroll_every_minutes} onChange={e => setRule("midroll_every_minutes", e.target.value)} /> minutes</span>
            <span className="ads-inline">Only in titles over <input type="number" min="1" max="600" value={draft.midroll_min_minutes} onChange={e => setRule("midroll_min_minutes", e.target.value)} /> minutes</span>
            <span className="ads-inline">At most <input type="number" min="0" max="20" value={draft.midroll_max_breaks} onChange={e => setRule("midroll_max_breaks", e.target.value)} /> breaks per title</span>
            <small>{draft.enabled && draft.midroll_enabled && exampleCues.length ? `A 95-minute movie gets breaks at ${exampleCues.map(s => Math.round(s / 60)).join(", ")} minutes.` : "A 95-minute movie gets no mid-rolls with these rules."}</small>
          </div>
          <div className="ads-rule">
            <strong>Post-roll</strong>
            <small>One break after a movie or episode ends, before the Up next countdown. Browser only.</small>
            <label className="ads-check"><input type="checkbox" checked={!!draft.postroll_enabled} onChange={e => setRule("postroll_enabled", e.target.checked)} />Post-roll on</label>
          </div>
        </div>
        <div className="ads-actions">
          <button type="button" className="ads-primary" onClick={saveRules} disabled={savingRules || !rulesDirty}>{savingRules ? "Saving…" : "Save rules"}</button>
          {rulesDirty && <button type="button" onClick={() => setDraft(policy)}>Undo changes</button>}
          {!rulesDirty && <span className="ads-muted">Players pick up changes the next time they start a break.</span>}
        </div>
      </section>

      <section className="ads-section">
        <h3>Tags</h3>
        <p>{tags.length === 0 ? "No tags yet." : `${tags.length} tag${tags.length === 1 ? "" : "s"}, ${liveTags} live (active and not a test).`} Players use the most specific active tag for the position and platform; ties go to the oldest tag.</p>
        {tags.length === 0 ? (
          <div className="ads-empty"><h3>Add your first tag</h3><p>Start with a sample tag to see a break play, then replace it with the tag from your ad server.</p><button type="button" className="ads-primary" onClick={() => openTag(null)}>+ New tag</button></div>
        ) : (
          <div className="ads-list">
            {tags.map(tag => {
              const stats = report.byTag[String(tag.id)];
              return (
                <div key={tag.id} className="ads-row">
                  <Switch on={!!tag.active} onChange={() => toggleActive(tag)} label="" />
                  <div><strong>{tag.name}</strong><small title={tag.tag_url}>{tag.tag_url}</small></div>
                  <span className={`ads-badge ${tag.ad_type}`}>{POSITION_LABELS[tag.ad_type] || tag.ad_type}</span>
                  <span className="ads-muted">{describeTarget(tag, titles)}</span>
                  <span className="ads-muted">{(tag.platforms || ["web"]).map(p => PLATFORM_LABELS[p] || p).join(" + ")}</span>
                  <span>{tag.is_test ? <span className="ads-badge test">TEST</span> : <span className="ads-muted">{stats ? `${stats.impressions.toLocaleString()} ads` : "—"}</span>}</span>
                  <button type="button" onClick={() => openTag(tag)}>Open</button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="ads-section">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div><h3>Delivery, last {REPORT_DAYS} days</h3><p style={{ margin: 0 }}>Counted by Peep for signed-in viewers. Your ad server's own report is the one that pays; this one tells you whether breaks are reaching people.</p></div>
          <div className="ads-actions" style={{ marginTop: 0 }}>
            <label className="ads-check"><input type="checkbox" checked={includeTests} onChange={e => setIncludeTests(e.target.checked)} />Include test delivery</label>
            <button type="button" onClick={() => loadReport(includeTests)}>Refresh</button>
            {includeTests && <button type="button" onClick={clearTestHistory}>Clear test history</button>}
            {reportAt && <span className="ads-muted">Updated {reportAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
          </div>
        </div>
        <div className="ads-cards">
          <div className="ads-card"><span className="ads-label">ADS SHOWN</span><strong>{report.impressions.toLocaleString()}</strong><small>Times an ad actually started</small></div>
          <div className="ads-card"><span className="ads-label">VIEWERS</span><strong>{report.uniqueViewers.toLocaleString()}</strong><small>Signed-in people who saw at least one</small></div>
          <div className="ads-card"><span className="ads-label">WATCHED TO THE END</span><strong>{report.completionRate === null ? "—" : report.completionRate + "%"}</strong><small>Completions ÷ ads shown</small></div>
          <div className="ads-card"><span className="ads-label">BREAKS THAT FILLED</span><strong>{report.startRate === null ? "—" : report.startRate + "%"}</strong><small>Requests where an ad started. Low means the server has nothing to sell you yet.</small></div>
          <div className="ads-card"><span className="ads-label">SKIPS / ERRORS</span><strong>{report.skips.toLocaleString()} / {report.errors.toLocaleString()}</strong><small>Skipped by the viewer / failed or timed out</small></div>
        </div>
        {(() => { const max = Math.max(...report.daily.map(d => d.count), 1); return (
          <div className="ads-bars" aria-label="Ads shown per day, last 14 days">
            {report.daily.map(({ date, count }) => <div key={date} title={`${date}: ${count}`}><i className={count ? "" : "zero"} style={{ height: Math.max(count / max * 70, count ? 4 : 2) }} /><b>{new Date(date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</b></div>)}
          </div>
        ); })()}
        <div className="ads-tables">
          <div>
            <table><thead><tr><th>Player</th><th className="num">Shown</th><th className="num">Completed</th><th className="num">Errors</th></tr></thead><tbody>
              {Object.entries(report.byPlatform).map(([key, s]) => <tr key={key}><td>{PLATFORM_LABELS[key] || key}</td><td className="num">{s.impressions.toLocaleString()}</td><td className="num">{s.completes.toLocaleString()}</td><td className="num">{s.errors.toLocaleString()}</td></tr>)}
              {Object.keys(report.byPlatform).length === 0 && <tr><td colSpan={4} className="ads-muted">Nothing yet</td></tr>}
            </tbody></table>
          </div>
          <div>
            <table><thead><tr><th>Position</th><th className="num">Requested</th><th className="num">Shown</th><th className="num">Completed</th></tr></thead><tbody>
              {Object.entries(report.byPlacement).map(([key, s]) => <tr key={key}><td>{PLACEMENT_LABELS[key] || "Deleted tag"}</td><td className="num">{s.requests.toLocaleString()}</td><td className="num">{s.impressions.toLocaleString()}</td><td className="num">{s.completes.toLocaleString()}</td></tr>)}
              {Object.keys(report.byPlacement).length === 0 && <tr><td colSpan={4} className="ads-muted">Nothing yet</td></tr>}
            </tbody></table>
          </div>
        </div>
        {tags.some(t => report.byTag[String(t.id)]) && (
          <div style={{ marginTop: 16 }}>
            <table><thead><tr><th>Tag</th><th className="num">Requested</th><th className="num">Shown</th><th className="num">Completed</th><th className="num">Skipped</th><th className="num">Errors</th></tr></thead><tbody>
              {tags.filter(t => report.byTag[String(t.id)]).map(t => { const s = report.byTag[String(t.id)]; return (
                <tr key={t.id}><td><strong>{t.name}</strong><div className="ads-muted">{POSITION_LABELS[t.ad_type]} · {describeTarget(t, titles)}{t.is_test ? " · test" : ""}</div></td><td className="num">{s.requests.toLocaleString()}</td><td className="num">{s.impressions.toLocaleString()}</td><td className="num">{s.completes.toLocaleString()}</td><td className="num">{s.skips.toLocaleString()}</td><td className="num">{s.errors.toLocaleString()}</td></tr>
              ); })}
            </tbody></table>
          </div>
        )}
      </section>
    </div>
  );
}
