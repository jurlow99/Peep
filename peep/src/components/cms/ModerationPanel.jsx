import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { SUPABASE_URL } from "../../lib/config";
import Drawer from "./Drawer";

// Moderation tab: content reports and the global banned-word list. Self-contained,
// including its own report-detail drawer. The one thing the shell needs back is
// the pending count for its nav badge, which this reports up as reports change.
export default function ModerationPanel({ onPendingCount }) {
  const [contentReports, setContentReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsFilter, setReportsFilter] = useState("pending");
  const [globalBannedWords, setGlobalBannedWords] = useState([]);
  const [bannedWordInput, setBannedWordInput] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportNotes, setReportNotes] = useState("");
  const [reporterProfile, setReporterProfile] = useState(null);
  const [notesSaving, setNotesSaving] = useState(false);
  const [reportVods, setReportVods] = useState([]);
  const [reportVodsLoading, setReportVodsLoading] = useState(false);
  const [reportPlayingVod, setReportPlayingVod] = useState(null);

  useEffect(() => { loadContentReports(); }, []);

  // Keep the shell's nav badge in step without giving it the reports themselves.
  useEffect(() => {
    onPendingCount?.(contentReports.filter(r => r.status === "pending").length);
  }, [contentReports, onPendingCount]);

  async function loadContentReports() {
    setReportsLoading(true);
    const { data } = await supabase.from("content_reports").select("*").order("created_at", { ascending: false }).limit(200);
    setContentReports(data || []);
    const { data: setting } = await supabase.from("app_settings").select("value").eq("key", "global_banned_words").maybeSingle();
    if (setting?.value) { try { setGlobalBannedWords(JSON.parse(setting.value)); } catch {} }
    setReportsLoading(false);
  }

  async function updateReportStatus(id, status) {
    await supabase.from("content_reports").update({ status, reviewed_at: new Date().toISOString() }).eq("id", id);
    setContentReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    if (selectedReport?.id === id) setSelectedReport(prev => ({ ...prev, status }));
  }

  async function deleteReport(id) {
    await supabase.from("content_reports").delete().eq("id", id);
    setContentReports(prev => prev.filter(r => r.id !== id));
    if (selectedReport?.id === id) setSelectedReport(null);
  }

  async function openReportDrawer(report) {
    setSelectedReport(report);
    setReportNotes(report.notes || "");
    setReporterProfile(null);
    setReportVods([]);
    setReportPlayingVod(null);
    

    // Load reporter profile and all streams in parallel
    const [profileRes, streamsRes] = await Promise.all([
      report.reporter_id
        ? supabase.from("profiles").select("username, full_name, avatar_url").eq("id", report.reporter_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("live_streams").select("*"),
    ]);
    setReporterProfile(profileRes.data ?? false);

    // Match using the same slug logic as StreamerProfile
    const matchedStream = (streamsRes.data || []).find(s => {
      const slug = s.slug || s.username || (s.channel_name || s.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return slug === report.content_id;
    });
    const streamUid = matchedStream?.stream_uid;
    if (streamUid) {
      setReportVodsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
        const prevUids = matchedStream?.previous_stream_uids;
        const prevParam = Array.isArray(prevUids) && prevUids.length
          ? `&previous_uids=${prevUids.join(",")}`
          : "";
        const res = await fetch(`${SUPABASE_URL}/functions/v1/get-vods?stream_uid=${streamUid}${prevParam}`, {
          headers: { "Authorization": `Bearer ${token}` },
        });
        const json = await res.json();
        setReportVods(json.vods || []);
      } catch (_) {}
      setReportVodsLoading(false);
    }
  }

  async function saveReportNotes() {
    if (!selectedReport) return;
    setNotesSaving(true);
    await supabase.from("content_reports").update({ notes: reportNotes }).eq("id", selectedReport.id);
    setContentReports(prev => prev.map(r => r.id === selectedReport.id ? { ...r, notes: reportNotes } : r));
    setNotesSaving(false);
  }

  async function saveGlobalBannedWords(words) {
    await supabase.from("app_settings").upsert({ key: "global_banned_words", value: JSON.stringify(words), updated_at: new Date().toISOString() }, { onConflict: "key" });
    setGlobalBannedWords(words);
  }
  return (
    <>
      <div style={{ maxWidth: 900 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Moderation</h2>
            <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Content reports and global word filter.</p>
          </div>
          <button onClick={loadContentReports} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 16px", fontSize: 13, color: "#374151", cursor: "pointer", fontWeight: 500 }}>Refresh</button>
        </div>

        {/* Global banned words */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Global Word Filter</h3>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6b7280" }}>Blocked in all live chat, site-wide. Applies on top of each channel's own banned words.</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input value={bannedWordInput} onChange={e => setBannedWordInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && bannedWordInput.trim()) { const w = bannedWordInput.trim().toLowerCase(); if (!globalBannedWords.includes(w)) saveGlobalBannedWords([...globalBannedWords, w]); setBannedWordInput(""); }}} placeholder="Add a word or phrase…" style={{ flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#0f172a", outline: "none" }} />
            <button onClick={() => { const w = bannedWordInput.trim().toLowerCase(); if (w && !globalBannedWords.includes(w)) { saveGlobalBannedWords([...globalBannedWords, w]); setBannedWordInput(""); }}} style={{ background: "#0f172a", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add</button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {globalBannedWords.length === 0 && <span style={{ fontSize: 13, color: "#9ca3af" }}>No words added yet.</span>}
            {globalBannedWords.map(w => (
              <span key={w} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 10px", fontSize: 13, color: "#dc2626", fontWeight: 500 }}>
                {w}
                <button onClick={() => saveGlobalBannedWords(globalBannedWords.filter(x => x !== w))} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            ))}
          </div>
        </div>

        {/* Reports queue */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0" }}>
            {[
              { value: "pending", label: "Pending" },
              { value: "actioned", label: "Resolved" },
              { value: "dismissed", label: "Dismissed" },
              { value: "all", label: "All" },
            ].map(({ value: f, label }) => {
              const count = f === "all" ? contentReports.length : contentReports.filter(r => r.status === f).length;
              return (
                <button key={f} onClick={() => setReportsFilter(f)} style={{ flex: 1, background: reportsFilter === f ? "#f8fafc" : "transparent", border: "none", borderBottom: reportsFilter === f ? "2px solid #fb923c" : "none", padding: "12px 8px", fontSize: 13, fontWeight: reportsFilter === f ? 600 : 400, color: reportsFilter === f ? "#0f172a" : "#6b7280", cursor: "pointer" }}>
                  {label} {count > 0 && <span style={{ background: f === "pending" ? "#fef2f2" : "#f1f5f9", color: f === "pending" ? "#dc2626" : "#6b7280", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{count}</span>}
                </button>
              );
            })}
          </div>

          {reportsLoading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>Loading…</div>
          ) : (() => {
            const visible = reportsFilter === "all" ? contentReports : contentReports.filter(r => r.status === reportsFilter);
            if (visible.length === 0) return <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>No {reportsFilter} reports.</div>;
            return (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    {["Channel", "Reason", "Status", "Reported", "Actions"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#6b7280", textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map(r => {
                    const statusLabel = r.status === "actioned" ? "Resolved" : r.status === "pending" ? "Pending" : "Dismissed";
                    const statusColor = r.status === "pending" ? "#dc2626" : r.status === "actioned" ? "#16a34a" : "#6b7280";
                    const statusBg = r.status === "pending" ? "#fef2f2" : r.status === "actioned" ? "#f0fdf4" : "#f1f5f9";
                    return (
                      <tr key={r.id} onClick={() => openReportDrawer(r)} style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer", transition: "background 0.1s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: "#0f172a", fontWeight: 600 }}>
                          {r.channel_name || r.content_id}
                          {r.notes && <span title="Has investigation notes" style={{ marginLeft: 6, fontSize: 10, color: "#fb923c" }}>●</span>}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: "#374151", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reason}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ display: "inline-block", background: statusBg, color: statusColor, borderRadius: 6, padding: "2px 9px", fontSize: 12, fontWeight: 600 }}>{statusLabel}</span>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: "#9ca3af" }}>{new Date(r.created_at).toLocaleDateString()}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={e => { e.stopPropagation(); openReportDrawer(r); }}
                              style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 12px", fontSize: 12, color: "#374151", fontWeight: 600, cursor: "pointer" }}>
                              Review →
                            </button>
                            <button onClick={e => { e.stopPropagation(); if (window.confirm("Delete this report permanently?")) deleteReport(r.id); }}
                              style={{ background: "none", border: "1px solid #fecaca", borderRadius: 6, padding: "5px 10px", fontSize: 12, color: "#dc2626", fontWeight: 600, cursor: "pointer" }}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>

      {selectedReport && (
        <Drawer onClose={() => setSelectedReport(null)} title="Report Details">
          {(() => {
            const r = selectedReport;
            const statusColor = r.status === "pending" ? "#dc2626" : r.status === "actioned" ? "#16a34a" : "#6b7280";
            const statusBg = r.status === "pending" ? "#fef2f2" : r.status === "actioned" ? "#f0fdf4" : "#f1f5f9";
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Status + Channel */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ background: statusBg, color: statusColor, borderRadius: 6, padding: "3px 11px", fontSize: 12, fontWeight: 700, textTransform: "capitalize" }}>{r.status}</span>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>{new Date(r.created_at).toLocaleString()}</span>
                </div>

                {/* Channel */}
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
                  <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>Reported Channel</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{r.channel_name || r.content_id}</p>
                    <a href={`/stream/${r.content_id}`} target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#0f172a", color: "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      Visit
                    </a>
                  </div>
                </div>

                {/* Reason */}
                <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: 16 }}>
                  <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>Reported For</p>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#7c2d12" }}>{r.reason}</p>
                </div>

                {/* Reporter */}
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
                  <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>Reporter</p>
                  {!r.reporter_id ? (
                    <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Anonymous (not signed in)</p>
                  ) : reporterProfile === null ? (
                    <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Loading…</p>
                  ) : reporterProfile === false ? (
                    <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Profile not found</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{reporterProfile?.full_name || reporterProfile?.username || "—"}</p>
                      {reporterProfile?.username && <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>@{reporterProfile.username}</p>}
                      <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{r.reporter_id}</p>
                    </div>
                  )}
                </div>

                {/* VODs */}
                <div>
                  <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Channel VODs
                    {r.status === "pending"
                      ? <span style={{ marginLeft: 6, color: "#ef4444", fontWeight: 500, fontSize: 10, textTransform: "none", letterSpacing: 0 }}>⚠ Locked from deletion</span>
                      : <span style={{ marginLeft: 6, color: "#16a34a", fontWeight: 500, fontSize: 10, textTransform: "none", letterSpacing: 0 }}>✓ Deletion unlocked</span>
                    }
                  </p>
                  {reportVodsLoading ? (
                    <p style={{ fontSize: 13, color: "#9ca3af" }}>Loading recordings…</p>
                  ) : reportVods.length === 0 ? (
                    <p style={{ fontSize: 13, color: "#9ca3af" }}>No recordings found for this channel.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {reportPlayingVod && (
                        <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #e2e8f0", marginBottom: 4 }}>
                          <iframe
                            src={`https://iframe.cloudflarestream.com/${reportPlayingVod}`}
                            style={{ width: "100%", aspectRatio: "16/9", border: "none", display: "block" }}
                            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                            allowFullScreen
                          />
                          <button onClick={() => setReportPlayingVod(null)}
                            style={{ width: "100%", background: "#f8fafc", border: "none", borderTop: "1px solid #e2e8f0", padding: "8px", fontSize: 12, color: "#6b7280", cursor: "pointer" }}>
                            Close player ×
                          </button>
                        </div>
                      )}
                      {reportVods.map(v => {
                        const title = (v.meta?.name && !/peep live/i.test(v.meta.name))
                          ? v.meta.name
                          : new Date(v.created).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
                        const dur = v.duration
                          ? `${Math.floor(v.duration / 3600) > 0 ? Math.floor(v.duration / 3600) + "h " : ""}${Math.floor((v.duration % 3600) / 60)}m`
                          : null;
                        const playing = reportPlayingVod === v.uid;
                        return (
                          <div key={v.uid} style={{ display: "flex", alignItems: "center", gap: 10, background: playing ? "#f0fdf4" : "#f8fafc", border: `1px solid ${playing ? "#bbf7d0" : "#e2e8f0"}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", transition: "all 0.1s" }}
                            onClick={() => setReportPlayingVod(playing ? null : v.uid)}>
                            <div style={{ width: 64, height: 36, borderRadius: 5, overflow: "hidden", flexShrink: 0, background: "#e2e8f0", position: "relative" }}>
                              {v.thumbnail
                                ? <img src={v.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#9ca3af"><polygon points="5,3 19,12 5,21"/></svg>
                                  </div>
                              }
                              {!playing && (
                                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.3)" }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
                                </div>
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</p>
                              {dur && <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>{dur}</p>}
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 600, color: playing ? "#16a34a" : "#6b7280", flexShrink: 0 }}>{playing ? "Playing" : "Play"}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Admin notes */}
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Investigation Notes</label>
                  <textarea
                    value={reportNotes}
                    onChange={e => setReportNotes(e.target.value)}
                    placeholder="Add notes about what you found, actions taken, etc…"
                    rows={5}
                    style={{ width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#0f172a", outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
                    onFocus={e => e.target.style.borderColor = "#fb923c"}
                    onBlur={e => e.target.style.borderColor = "#e2e8f0"}
                  />
                  <button onClick={saveReportNotes} disabled={notesSaving}
                    style={{ marginTop: 8, background: "#0f172a", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: notesSaving ? 0.6 : 1 }}>
                    {notesSaving ? "Saving…" : "Save Notes"}
                  </button>
                </div>

                {/* Actions */}
                <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                  {r.status === "pending" ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => updateReportStatus(r.id, "actioned")}
                        style={{ flex: 1, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "11px", fontSize: 13, color: "#16a34a", fontWeight: 700, cursor: "pointer" }}>
                        ✓ Mark Resolved
                      </button>
                      <button onClick={() => updateReportStatus(r.id, "dismissed")}
                        style={{ flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "11px", fontSize: 13, color: "#6b7280", fontWeight: 700, cursor: "pointer" }}>
                        Dismiss
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => updateReportStatus(r.id, "pending")}
                      style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "9px", fontSize: 13, color: "#ea580c", fontWeight: 600, cursor: "pointer" }}>
                      Re-open as Pending
                    </button>
                  )}
                  <button onClick={() => { if (window.confirm("Delete this report permanently? The VOD lock will be lifted immediately.")) deleteReport(r.id); }}
                    style={{ background: "none", border: "1px solid #fecaca", borderRadius: 8, padding: "9px", fontSize: 13, color: "#dc2626", fontWeight: 600, cursor: "pointer" }}>
                    Delete Report Permanently
                  </button>
                </div>
              </div>
            );
          })()}
        </Drawer>
      )}
    </>
  );
}
