import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { Spinner } from "../ui/Spinner";
import { PAD } from "./constants";

// Storage tab: lists video/audio files in the public "content" bucket and turns
// them into content rows. Owns everything it touches except the content pools,
// which the shell already loads for other tabs, and toast/audit.
export default function StoragePanel({ showToast, logAudit, videosList, showsList, podcastsList }) {
  const [storageFiles, setStorageFiles] = useState([]);
  const [storageLoading, setStorageLoading] = useState(true);
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const [storageFilter, setStorageFilter] = useState("pending");
  const [storageAddModal, setStorageAddModal] = useState(null);
  const [storageAddForm, setStorageAddForm] = useState({ title: "", type: "movie", show_id: "", podcast_id: "", description: "", year: new Date().getFullYear(), genre: "", artist: "", episode_number: 1, season_number: 1, linked_id: "", linked_table: "videos", url: "" });
  const [storageAddSaving, setStorageAddSaving] = useState(false);

  useEffect(() => { loadStorageFiles(); }, []);

  async function loadStorageFiles() {
    setStorageLoading(true);
    const BUCKET = "content";
    const VIDEO_EXTS = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"];
    const AUDIO_EXTS = [".mp3", ".wav", ".aac", ".m4a", ".ogg"];
    const FOLDER_TYPE = { shorts: "short", trailers: "trailer", episodes: "episode", "episodes ": "episode", podcasts: "podcast_episode" };
    const folders = ["shorts", "trailers", "episodes", "episodes ", "podcasts", ""];
    const allFiles = [];
    const scanFolder = async (folder, depth = 0) => {
      const { data } = await supabase.storage.from(BUCKET).list(folder || undefined, { limit: 500, sortBy: { column: "created_at", order: "desc" } });
      const subfolders = [];
      (data || []).forEach(f => {
        if (!f.id) {
          // It's a subfolder — recurse one more level
          if (depth < 2) subfolders.push(folder ? `${folder}/${f.name}` : f.name);
          return;
        }
        const ext = f.name.substring(f.name.lastIndexOf(".")).toLowerCase();
        if (![...VIDEO_EXTS, ...AUDIO_EXTS].includes(ext)) return;
        const path = folder ? `${folder}/${f.name}` : f.name;
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const topFolder = folder ? folder.split("/")[0] : "";
        const typeHint = FOLDER_TYPE[topFolder] ?? (AUDIO_EXTS.includes(ext) ? "podcast_episode" : "movie");
        allFiles.push({ ...f, folder: folder || "root", path, url: urlData?.publicUrl, isVideo: VIDEO_EXTS.includes(ext), isAudio: AUDIO_EXTS.includes(ext), typeHint });
      });
      for (const sub of subfolders) await scanFolder(sub, depth + 1);
    };
    for (const folder of folders) await scanFolder(folder);
    const [movRes, epRes, peRes] = await Promise.all([
      supabase.from("videos").select("url, trailer_url"),
      supabase.from("episodes").select("url"),
      supabase.from("podcast_episodes").select("audio_url"),
    ]);
    const normUrl = url => {
      if (!url) return null;
      return url.split("/").pop()?.toLowerCase() || null;
    };
    const ingestedUrls = new Set([
      ...(movRes.data || []).flatMap(r => [r.url, r.trailer_url]),
      ...(epRes.data || []).map(r => r.url),
      ...(peRes.data || []).map(r => r.audio_url),
    ].filter(Boolean).map(normUrl));
    setStorageFiles(allFiles.map(f => ({ ...f, ingested: ingestedUrls.has(normUrl(f.url)) })));
    setStorageLoading(false);
  }

  async function saveStorageItem() {
    setStorageAddSaving(true);
    const f = storageAddForm;
    const url = f.url.trim() || storageAddModal?.url;
    let error = null;
    if (f.type === "movie") {
      ({ error } = await supabase.from("videos").insert({ title: f.title, url, description: f.description, year: f.year || null, genre: f.genre || null }));
    } else if (f.type === "trailer") {
      const table = f.linked_table;
      const urlCol = "trailer_url";
      ({ error } = await supabase.from(table).update({ [urlCol]: url }).eq("id", f.linked_id));
    } else if (f.type === "episode") {
      ({ error } = await supabase.from("episodes").insert({ title: f.title, url, show_id: f.show_id, episode_number: f.episode_number, season_number: f.season_number, description: f.description }));
    } else if (f.type === "podcast_episode") {
      ({ error } = await supabase.from("podcast_episodes").insert({ title: f.title, audio_url: url, podcast_id: f.podcast_id, description: f.description }));
    }
    setStorageAddSaving(false);
    if (!error) {
      showToast(`"${f.title}" published to Peep`);
      setStorageAddModal(null);
      loadStorageFiles();
    } else {
      showToast("Error: " + error.message);
    }
  }

  // One-click: turn every un-published VIDEO file in the bucket into a Movie entry.
  async function publishAllPending() {
    const pending = storageFiles.filter(f => !f.ingested && (f.typeHint === "movie" || f.typeHint === "short"));
    if (pending.length === 0) { showToast("No new video files to publish", "error"); return; }
    if (!window.confirm(`Publish ${pending.length} file${pending.length !== 1 ? "s" : ""} as Movies? (title comes from the filename — you can rename them after)`)) return;
    setBulkPublishing(true);
    const clean = name => name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    let ok = 0, fail = 0;
    for (const file of pending) {
      const { error } = await supabase.from("videos").insert({ title: clean(file.name) || file.name, url: file.url });
      if (error) { fail++; } else { ok++; logAudit?.("create", "video", null, `bulk-ingested ${file.name}`); }
    }
    setBulkPublishing(false);
    showToast(fail ? `Published ${ok}, ${fail} failed` : `Published ${ok} movie${ok !== 1 ? "s" : ""} ✓`, fail ? "error" : "success");
    loadStorageFiles();
  }

  return (
      <div style={{ maxWidth: 1600, margin: "0 auto", padding: `40px ${PAD} 80px` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: "#0f172a" }}>Uploaded Files</p>
            <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Files in your Supabase bucket. Click "Publish" to make them watchable on Peep.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={publishAllPending} disabled={bulkPublishing} style={{ padding: "10px 18px", background: "#059669", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: bulkPublishing ? "wait" : "pointer", opacity: bulkPublishing ? 0.7 : 1 }}>{bulkPublishing ? "Publishing…" : "↑ Publish all new"}</button>
            <button onClick={() => { setStorageAddForm({ title: "", type: "movie", show_id: "", podcast_id: "", description: "", year: new Date().getFullYear(), genre: "", artist: "", episode_number: 1, season_number: 1, linked_id: "", linked_table: "videos", url: "" }); setStorageAddModal({ name: "External URL", folder: "", url: "" }); }} style={{ padding: "10px 18px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Add from URL</button>
            <button onClick={loadStorageFiles} style={{ padding: "10px 20px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{storageLoading ? "Scanning…" : "Refresh"}</button>
          </div>
        </div>

        {storageLoading && <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner /></div>}

        {!storageLoading && storageFiles.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#9ca3af" }}>
            <p style={{ fontSize: 15, marginBottom: 8 }}>No media files found in the bucket.</p>
            <p style={{ fontSize: 13 }}>Upload video or audio files to Supabase Storage, then click Refresh.</p>
          </div>
        )}

        {!storageLoading && storageFiles.length > 0 && (() => {
          const FOLDER_META = {
            shorts:        { label: "Movies",       color: "#6366f1", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 7h5M17 17h5"/></svg> },
            trailers:      { label: "Trailers",     color: "#f59e0b", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg> },
            episodes:      { label: "Episodes",     color: "#8b5cf6", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg> },
            podcasts:      { label: "Podcasts",     color: "#22d3ee", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> },
            root:          { label: "Unsorted",     color: "#94a3b8", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> },
          };
          const pending = storageFiles.filter(f => !f.ingested);
          const ingested = storageFiles.filter(f => f.ingested);
          const visible = storageFilter === "pending" ? pending : storageFilter === "ingested" ? ingested : storageFiles;
          const folderOrder = ["shorts", "trailers", "episodes", "podcasts", "root"];
          const byFolder = folderOrder.reduce((acc, k) => { acc[k] = visible.filter(f => f.folder === k); return acc; }, {});
          return (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
                {[
                  { key: "pending", label: "Unpublished", count: pending.length, color: "#f59e0b" },
                  { key: "ingested", label: "Published", count: ingested.length, color: "#22c55e" },
                  { key: "all", label: "All", count: storageFiles.length, color: "#6366f1" },
                ].map(({ key, label, count, color }) => (
                  <button key={key} onClick={() => setStorageFilter(key)} style={{ padding: "8px 18px", borderRadius: 8, border: `1.5px solid ${storageFilter === key ? color : "#e2e8f0"}`, background: storageFilter === key ? color : "#fff", color: storageFilter === key ? "#fff" : "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    {label} <span style={{ opacity: 0.8 }}>({count})</span>
                  </button>
                ))}
              </div>

              {visible.length === 0 && (
                <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "40px 0" }}>
                  {storageFilter === "ingested" ? "No files ingested yet." : "All files are already ingested."}
                </p>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                {folderOrder.map(folder => {
                  const files = byFolder[folder];
                  if (!files || files.length === 0) return null;
                  const meta = FOLDER_META[folder];
                  return (
                    <div key={folder}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <span style={{ color: meta.color, display: "flex", alignItems: "center" }}>{meta.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: meta.color, textTransform: "uppercase", letterSpacing: 1 }}>{meta.label}</span>
                        <span style={{ fontSize: 12, color: "#cbd5e1" }}>({files.length})</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {files.map(file => (
                          <div key={file.path} style={{ background: "#fff", border: `1px solid ${file.ingested ? "#dcfce7" : "#e2e8f0"}`, borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 7, background: `${meta.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: meta.color }}>
                              {file.isVideo
                                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                              }
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</p>
                                {file.ingested && <span style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", background: "#dcfce7", borderRadius: 4, padding: "2px 7px", flexShrink: 0 }}>Published</span>}
                              </div>
                              <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>{file.metadata?.size ? `${(file.metadata.size / 1024 / 1024).toFixed(1)} MB` : ""}</p>
                            </div>
                            <a href={file.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#6366f1", textDecoration: "none", flexShrink: 0 }}>Preview</a>
                            {!file.ingested && (
                              <button
                                onClick={() => {
                                  const cleanName = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                                  setStorageAddForm({ title: cleanName, type: file.typeHint, show_id: "", podcast_id: "", description: "", year: new Date().getFullYear(), genre: "", artist: "", episode_number: 1, season_number: 1, linked_id: "", linked_table: "videos", url: file.url });
                                  setStorageAddModal(file);
                                }}
                                style={{ padding: "7px 14px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
                              >Publish</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

        {storageAddModal && (
          <>
            <div onClick={() => setStorageAddModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200 }} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 201, background: "#fff", borderRadius: 16, padding: 32, width: "min(520px, 95vw)", maxHeight: "90vh", overflowY: "auto" }}>
              <p style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Publish to Peep</p>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Video URL *</label>
                <input value={storageAddForm.url} onChange={e => setStorageAddForm(p => ({ ...p, url: e.target.value }))} placeholder="https://archive.org/... or Supabase URL" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, boxSizing: "border-box" }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Content Type</label>
                <select value={storageAddForm.type} onChange={e => setStorageAddForm(p => ({ ...p, type: e.target.value }))} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, background: "#fff", color: "#0f172a" }}>
                  <option value="movie">Short</option>
                  <option value="trailer">Trailer (attach to existing title)</option>
                  <option value="episode">TV Episode</option>
                  <option value="podcast_episode">Podcast Episode</option>
                </select>
              </div>
              {storageAddForm.type === "trailer" && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Attach to</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <button onClick={() => setStorageAddForm(p => ({ ...p, linked_table: "videos", linked_id: "" }))} style={{ flex: 1, padding: "8px", borderRadius: 7, border: `1.5px solid ${storageAddForm.linked_table === "videos" ? "#6366f1" : "#e2e8f0"}`, background: storageAddForm.linked_table === "videos" ? "#eef2ff" : "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: storageAddForm.linked_table === "videos" ? "#6366f1" : "#64748b" }}>Movie</button>
                    <button onClick={() => setStorageAddForm(p => ({ ...p, linked_table: "shows", linked_id: "" }))} style={{ flex: 1, padding: "8px", borderRadius: 7, border: `1.5px solid ${storageAddForm.linked_table === "shows" ? "#6366f1" : "#e2e8f0"}`, background: storageAddForm.linked_table === "shows" ? "#eef2ff" : "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: storageAddForm.linked_table === "shows" ? "#6366f1" : "#64748b" }}>Show</button>
                  </div>
                  <select value={storageAddForm.linked_id} onChange={e => setStorageAddForm(p => ({ ...p, linked_id: e.target.value }))} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, background: "#fff" }}>
                    <option value="">Select title…</option>
                    {(storageAddForm.linked_table === "videos" ? videosList : showsList).map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
                  </select>
                </div>
              )}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Title</label>
                <input value={storageAddForm.title} onChange={e => setStorageAddForm(p => ({ ...p, title: e.target.value }))} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              {storageAddForm.type === "episode" && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Show</label>
                    <select value={storageAddForm.show_id} onChange={e => setStorageAddForm(p => ({ ...p, show_id: e.target.value }))} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, background: "#fff" }}>
                      <option value="">Select a show…</option>
                      {showsList.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Season</label>
                      <input type="number" value={storageAddForm.season_number} onChange={e => setStorageAddForm(p => ({ ...p, season_number: parseInt(e.target.value) || 1 }))} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Episode #</label>
                      <input type="number" value={storageAddForm.episode_number} onChange={e => setStorageAddForm(p => ({ ...p, episode_number: parseInt(e.target.value) || 1 }))} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box" }} />
                    </div>
                  </div>
                </>
              )}
              {storageAddForm.type === "podcast_episode" && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Podcast</label>
                  <select value={storageAddForm.podcast_id} onChange={e => setStorageAddForm(p => ({ ...p, podcast_id: e.target.value }))} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, background: "#fff" }}>
                    <option value="">Select a podcast…</option>
                    {podcastsList.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
              )}
              {storageAddForm.type === "movie" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Year</label>
                    <input type="number" value={storageAddForm.year} onChange={e => setStorageAddForm(p => ({ ...p, year: parseInt(e.target.value) || null }))} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Genre</label>
                    <input value={storageAddForm.genre} onChange={e => setStorageAddForm(p => ({ ...p, genre: e.target.value }))} placeholder="Comedy, Drama…" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Description</label>
                <textarea value={storageAddForm.description} onChange={e => setStorageAddForm(p => ({ ...p, description: e.target.value }))} rows={3} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, resize: "vertical", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStorageAddModal(null)} style={{ flex: 1, padding: "11px 0", background: "#f1f5f9", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#64748b" }}>Cancel</button>
                <button onClick={saveStorageItem} disabled={storageAddSaving || !storageAddForm.title || !storageAddForm.url.trim()} style={{ flex: 2, padding: "11px 0", background: "#0f172a", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#fff", opacity: storageAddSaving || !storageAddForm.title || !storageAddForm.url.trim() ? 0.6 : 1 }}>
                  {storageAddSaving ? "Publishing…" : "Publish to Peep"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
  );
}
