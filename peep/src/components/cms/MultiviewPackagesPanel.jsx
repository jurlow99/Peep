import { packageChannelIDs } from "../../lib/multiview";
import { useEffect, useState, useRef } from "react";
import { supabase } from "../../supabase";

const empty = { two_screen_layout: "side_by_side", title: "", description: "", left_channel_id: "", right_channel_id: "", third_channel_id: null, fourth_channel_id: null, enabled: false, visibility_tier: "production", position: 0 };
const field = { padding: 10, border: "1px solid #cbd5e1", borderRadius: 8, width: "100%", boxSizing: "border-box", background: "white", color: "#111827" };
export default function MultiviewPackagesPanel({ packages, error, reload }) {
  const [channels, setChannels] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const savingRef = useRef(false);
  useEffect(() => { supabase.from("channels").select("id,name,is_active,is_premium,hls_url,stream_uid,live_feed_id").order("name").then(({ data, error }) => {
    if (error) setMessage(error.message); else setChannels(data || []);
  }); }, []);
  const eligible = channels.filter(c => c.is_active && !c.is_premium);
  const streamWarning = c => c && !c.stream_uid && !c.live_feed_id && !/^https:\/\//i.test(c.hls_url || "") ? `${c.name}: Apple TV needs a supported HTTPS stream.` : null;
  const channelKeys = ["left_channel_id", "right_channel_id", ...(form?.channel_count === 4 ? ["third_channel_id", "fourth_channel_id"] : [])];
  async function save(e) {
    e.preventDefault();
    if (savingRef.current) return;
    const ids = channelKeys.map(key => String(form[key] || ""));
    if (!form.title.trim() || new Set(ids).size !== ids.length || ids.some(id => !eligible.some(c => String(c.id) === id))) {
      setMessage(`Choose ${ids.length} different active, free channels and enter a title.`); return;
    }
    savingRef.current = true; setSaving(true); setMessage("");
    try {
      const { id } = form;
      const values = Object.fromEntries(Object.keys(empty).map(key => [key, form[key] ?? empty[key]]));
      const payload = { ...values, two_screen_layout: "side_by_side", third_channel_id: form.channel_count === 4 ? Number(form.third_channel_id) : null, fourth_channel_id: form.channel_count === 4 ? Number(form.fourth_channel_id) : null, title: values.title.trim(), left_channel_id: Number(values.left_channel_id), right_channel_id: Number(values.right_channel_id), position: Number(values.position) || 0 };
      const query = id ? supabase.from("multiview_packages").update(payload).eq("id", id) : supabase.from("multiview_packages").insert(payload);
      const { data, error } = await query.select("id").single();
      if (error || !data) throw error || new Error("Package was not saved.");
      const warnings = ids.map(id => streamWarning(channels.find(c => String(c.id) === id))).filter(Boolean);
      await reload(); setForm(null); setMessage(warnings.length ? `Package saved. ${warnings.join(" ")} The affected tile will be unavailable on Apple TV until its stream is corrected.` : "Package saved. Apple TV updates browsing packages within 15 seconds; reopen an already playing package to use its new layout.");
    } catch (err) { setMessage(err.message); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 28 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><h3 style={{ margin: 0 }}>Multiview channel packages</h3><button type="button" onClick={() => { setForm({ ...empty, channel_count: 2, position: packages.length }); setMessage(""); }}>New package</button></div>
    <p style={{ color: "#64748b", fontSize: 13 }}>Curate two or four channels to watch together. Place packages in Home or Live TV shelves using a Multiview row. Disable a package to remove it from every row.</p>
    {(error || message) && <p role="status">{error || message}</p>}
    {packages.map(pkg => <div key={pkg.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0", borderTop: "1px solid #e2e8f0" }}>
      <div style={{ flex: 1 }}><strong>{pkg.title}</strong> <span style={{ color: "#64748b" }}>{pkg.enabled ? "Enabled" : "Off"}</span><div style={{ fontSize: 12, color: "#64748b" }}>{packageChannelIDs(pkg).map(id => channels.find(c => c.id === id)?.name || "Unavailable channel").join(" + ")}</div></div>
      <button type="button" disabled={saving} onClick={() => { setForm({ ...pkg, channel_count: pkg.third_channel_id != null ? 4 : 2 }); setMessage(""); }}>Edit</button>
    </div>)}
    {!packages.length && !error && <p>No packages yet.</p>}
    {form && <form onSubmit={save} style={{ display: "grid", gap: 12, paddingTop: 16 }}>
      <label>Package title<input required maxLength={120} style={field} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
      <label>Description<input style={field} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      <label>Screens<select style={field} value={form.channel_count} onChange={e => setForm({ ...form, channel_count: Number(e.target.value) })}><option value={2}>2 screens</option><option value={4}>4 screens — 2 × 2 grid</option></select></label>
      <p style={{color:"#64748b",fontSize:13}}>Two-screen packages show complete widescreen feeds side by side on a full-screen Apple TV canvas.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>{channelKeys.map((key, i) => <label key={key}>Screen {i + 1}<select required style={field} value={form[key] ?? ""} onChange={e => setForm({ ...form, [key]: e.target.value })}><option value="">Select a channel</option>{eligible.map(c => <option key={c.id} value={c.id} disabled={channelKeys.some(other => other !== key && String(form[other]) === String(c.id))}>{c.name}</option>)}</select></label>)}</div>

      {channelKeys.map(key => streamWarning(channels.find(c => String(c.id) === String(form[key])))).filter(Boolean).map(message => <p key={message} role="status" style={{color:"#92400e",margin:0}}>{message} The package will save, but this tile cannot play until the stream is fixed.</p>)}
      <label>Order<input type="number" style={field} value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} /></label>
      <label>Visibility<select style={field} value={form.visibility_tier} onChange={e => setForm({ ...form, visibility_tier: e.target.value })}><option value="production">Everyone</option><option value="stage">Stage</option><option value="test">Test</option></select></label>
      <label><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> Enabled</label>
      <div style={{ display: "flex", gap: 12 }}><button disabled={saving} type="submit">{saving ? "Saving…" : "Save package"}</button><button disabled={saving} type="button" onClick={() => setForm(null)}>Cancel</button></div>
    </form>}
  </section>;
}
export function MultiviewRowPicker({ value, onChange, packages }) {
  let picks = []; try { picks = JSON.parse(value || "[]"); } catch { /* invalid saved filter is empty */ }
  if (!Array.isArray(picks)) picks = [];
  const set = next => onChange(JSON.stringify(next));
  return <div style={{ padding: 14, background: "#f8fafc", borderRadius: 8 }}>
    <strong>Which packages?</strong>
    <p>Selected packages appear in click order. Use “All enabled packages” to include every enabled package in its package order.</p>
    <button type="button" onClick={() => onChange("")}>All enabled packages</button>
    {packages.map(pkg => <label key={pkg.id} style={{ display: "block", paddingTop: 10 }}><input type="checkbox" checked={picks.some(p => p.id === pkg.id)} onChange={e => set(e.target.checked ? [...picks, { id: pkg.id, type: "multiview" }] : picks.filter(p => p.id !== pkg.id))} /> {pkg.title}{pkg.enabled ? "" : " (Off)"}</label>)}
    {!packages.length && <p>Create a package above first.</p>}
    <p>{value ? `${picks.length} selected` : "All enabled packages"}</p>
  </div>;
}
