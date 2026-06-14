import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { uploadVideo } from "../lib/storageUtils";
import { VideoUploader } from "../components/VideoUploader";

const SUPABASE_URL = "https://iuozujwtuzuwubhsnhix.supabase.co";

const STATUS_BADGE = {
  approved: { label: "Live", bg: "rgba(74,222,128,0.1)", color: "#4ade80", border: "rgba(74,222,128,0.2)" },
  pending:  { label: "Pending Review", bg: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "rgba(251,191,36,0.2)" },
  rejected: { label: "Rejected", bg: "rgba(248,113,113,0.1)", color: "#f87171", border: "rgba(248,113,113,0.2)" },
};

export function CreatorDashboard({ user, onSignOut }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploadModal, setUploadModal] = useState(null); // { showId, showTitle }
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => { loadDashboard(); }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-creator-dashboard`, {
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  const creator = data?.creator;
  const contentList = data?.contentList || [];
  const episodesByShow = data?.episodesByShow || {};
  const payouts = data?.payouts || [];
  const stats = data?.currentMonth;

  const paidPayouts = payouts.filter(p => p.status === "paid");
  const totalEarned = paidPayouts.reduce((s, p) => s + (p.payout_amount || 0), 0);
  const latestUnpaid = payouts.find(p => p.status !== "paid");

  const myShows = contentList.filter(c => c.content_type === "show");

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>

      {/* Nav */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, display: "flex", alignItems: "center", padding: "0 clamp(16px,5vw,64px)", height: 64, gap: 16, background: "rgba(10,10,10,0.95)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: "#facc15" }}>peep.</span>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.18)", borderRadius: 100, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: "#facc15", letterSpacing: 0.5 }}>
          <span style={{ width: 5, height: 5, background: "#facc15", borderRadius: "50%", boxShadow: "0 0 6px #facc15" }} />
          CREATOR
        </div>
        <div style={{ flex: 1 }} />
        {creator && <span style={{ fontSize: 13, color: "#666" }}>{creator.name}</span>}
        <button onClick={onSignOut} style={{ background: "transparent", border: "1px solid #2a2a2a", borderRadius: 8, padding: "7px 14px", color: "#666", fontSize: 13, cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "#444"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "#666"; e.currentTarget.style.borderColor = "#2a2a2a"; }}>
          Sign Out
        </button>
      </nav>

      <div style={{ paddingTop: 64 + 48, paddingBottom: 100, paddingLeft: "clamp(16px,5vw,64px)", paddingRight: "clamp(16px,5vw,64px)", maxWidth: 900, margin: "0 auto" }}>

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 100 }}>
            <div style={{ width: 32, height: 32, border: "3px solid #1a1a1a", borderTopColor: "#facc15", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        )}

        {error && (
          <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 12, padding: "20px 24px", color: "#f87171", fontSize: 14 }}>
            {error}
          </div>
        )}

        {!loading && !error && creator && (
          <>
            {/* Header */}
            <div style={{ marginBottom: 36 }}>
              <h1 style={{ margin: "0 0 6px", fontSize: 30, fontWeight: 700, letterSpacing: "-0.5px" }}>Creator Dashboard</h1>
              <p style={{ margin: 0, fontSize: 13, color: "#444" }}>{creator.email}</p>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 32 }}>
              {[
                { label: "Watch Mins This Month", value: stats ? stats.watchMins.toLocaleString() : "—" },
                { label: "Platform Share", value: stats ? `${stats.share}%` : "—" },
                { label: "Est. Next Payout", value: latestUnpaid ? `$${(latestUnpaid.payout_amount || 0).toFixed(2)}` : "—" },
                { label: "Total Earned", value: `$${totalEarned.toFixed(2)}` },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "18px 20px" }}>
                  <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#444", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</p>
                  <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#facc15", letterSpacing: "-0.5px" }}>{value}</p>
                </div>
              ))}
            </div>

            {/* My Shows */}
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700 }}>My Shows</h2>
              {myShows.length === 0 ? (
                <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "40px 24px", textAlign: "center", color: "#444", fontSize: 14 }}>
                  No shows linked yet. Contact us to get your content attributed.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {myShows.map(show => {
                    const eps = episodesByShow[show.content_id] || [];
                    return (
                      <div key={show.id} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 16, overflow: "hidden" }}>
                        {/* Show header */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: eps.length > 0 ? "1px solid #1a1a1a" : "none" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            {show.thumbnail && (
                              <img src={show.thumbnail} alt="" style={{ width: 56, height: 38, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                            )}
                            <div>
                              <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 700 }}>{show.title}</p>
                              <p style={{ margin: 0, fontSize: 12, color: "#555" }}>{eps.length} episode{eps.length !== 1 ? "s" : ""}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setUploadModal({ showId: show.content_id, showTitle: show.title })}
                            style={{ background: "#facc15", border: "none", borderRadius: 10, padding: "9px 18px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                            + Upload Episode
                          </button>
                        </div>

                        {/* Episode list */}
                        {eps.length > 0 && (
                          <div>
                            {eps.map((ep, i) => {
                              const badge = STATUS_BADGE[ep.status] || STATUS_BADGE.pending;
                              return (
                                <div key={ep.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 22px", borderBottom: i < eps.length - 1 ? "1px solid #141414" : "none", flexWrap: "wrap", gap: 8 }}>
                                  <div>
                                    <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#e5e5e5" }}>
                                      S{ep.season}E{ep.episode_number} — {ep.title}
                                    </p>
                                    {ep.rejection_note && ep.status === "rejected" && (
                                      <p style={{ margin: "4px 0 0", fontSize: 11, color: "#f87171" }}>Note: {ep.rejection_note}</p>
                                    )}
                                  </div>
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, whiteSpace: "nowrap" }}>
                                    {badge.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Payout history */}
            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 16, overflow: "hidden" }}>
              <button
                onClick={() => setHistoryOpen(v => !v)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", background: "transparent", border: "none", cursor: "pointer", color: "#fff", textAlign: "left" }}>
                <div>
                  <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 700 }}>Payout History</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#555" }}>{paidPayouts.length} payment{paidPayouts.length !== 1 ? "s" : ""} · ${totalEarned.toFixed(2)} total</p>
                </div>
                <span style={{ fontSize: 18, color: "#444", transform: historyOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
              </button>
              {historyOpen && (
                <div style={{ borderTop: "1px solid #1a1a1a" }}>
                  {payouts.length === 0 ? (
                    <p style={{ margin: 0, padding: "24px 22px", fontSize: 14, color: "#444" }}>No payouts yet.</p>
                  ) : (
                    payouts.map((p, i) => {
                      const monthStr = new Date(p.month + "-02").toLocaleDateString("en-US", { month: "long", year: "numeric" });
                      return (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", borderBottom: i < payouts.length - 1 ? "1px solid #141414" : "none", flexWrap: "wrap", gap: 8 }}>
                          <div>
                            <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600 }}>{monthStr}</p>
                            {p.paid_at && <p style={{ margin: 0, fontSize: 11, color: "#444" }}>Paid {new Date(p.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 18, fontWeight: 700, color: p.status === "paid" ? "#facc15" : "#555" }}>${(p.payout_amount || 0).toFixed(2)}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: p.status === "paid" ? "rgba(74,222,128,0.1)" : "rgba(100,100,100,0.1)", color: p.status === "paid" ? "#4ade80" : "#666", border: `1px solid ${p.status === "paid" ? "rgba(74,222,128,0.2)" : "#2a2a2a"}` }}>
                              {p.status === "paid" ? "PAID" : "PENDING"}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <p style={{ textAlign: "center", fontSize: 12, color: "#222", marginTop: 40 }}>
              Questions? <span style={{ color: "#333" }}>creators@watchpeep.tv</span>
            </p>
          </>
        )}
      </div>

      {/* Upload Modal */}
      {uploadModal && (
        <UploadModal
          user={user}
          showId={uploadModal.showId}
          showTitle={uploadModal.showTitle}
          creatorId={creator?.id}
          onClose={() => setUploadModal(null)}
          onSuccess={() => { setUploadModal(null); loadDashboard(); }}
        />
      )}
    </div>
  );
}

function UploadModal({ user, showId, showTitle, creatorId, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({ title: "", episode_number: "", season: "1", description: "" });
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const valid = file && form.title.trim() && form.episode_number;

  async function handleSubmit() {
    if (!valid || uploading) return;
    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      const epNum = parseInt(form.episode_number, 10);
      const season = parseInt(form.season, 10) || 1;
      const safeName = file.name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");
      const path = `episodes/${creatorId}/${showId}/s${season}-ep${epNum}-${Date.now()}-${safeName}`;

      const { url, error: uploadErr } = await uploadVideo(file, path, setProgress);
      if (uploadErr) throw new Error(uploadErr);

      const { data: insertedEp, error: dbErr } = await supabase.from("episodes").insert({
        show_id: showId,
        title: form.title.trim(),
        episode_number: epNum,
        season,
        description: form.description.trim(),
        url,
        status: "pending",
      }).select("id").single();
      if (dbErr) throw new Error(dbErr.message);

      // Notify admin
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
      fetch(`${SUPABASE_URL}/functions/v1/notify-episode-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ type: "new_upload", episode_id: insertedEp.id }),
      });

      onSuccess();
    } catch (err) {
      setError(err.message);
      setUploading(false);
    }
  }

  const inp = { width: "100%", background: "#0d0d0d", border: "1px solid #222", borderRadius: 10, padding: "11px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 20, padding: "32px 36px", width: "min(560px,96vw)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>Upload Episode</h2>
            <p style={{ margin: 0, fontSize: 13, color: "#555" }}>{showTitle}</p>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#555", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <VideoUploader onFile={setFile} disabled={uploading} />

        {/* Progress bar */}
        {uploading && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "#888" }}>{progress < 100 ? "Uploading…" : "Processing…"}</span>
              <span style={{ fontSize: 12, color: "#888" }}>{progress}%</span>
            </div>
            <div style={{ height: 4, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "#facc15", borderRadius: 2, transition: "width 0.3s" }} />
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Episode Title *</label>
            <input style={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. The Pilot" disabled={uploading} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Episode Number *</label>
              <input style={inp} type="number" min="1" value={form.episode_number} onChange={e => setForm(f => ({ ...f, episode_number: e.target.value }))} placeholder="1" disabled={uploading} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Season</label>
              <input style={inp} type="number" min="1" value={form.season} onChange={e => setForm(f => ({ ...f, season: e.target.value }))} placeholder="1" disabled={uploading} />
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Description</label>
            <textarea style={{ ...inp, resize: "vertical" }} rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What's this episode about?" disabled={uploading} />
          </div>
        </div>

        {error && <p style={{ margin: "14px 0 0", fontSize: 13, color: "#f87171" }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button onClick={onClose} disabled={uploading}
            style={{ flex: 1, background: "transparent", border: "1px solid #2a2a2a", borderRadius: 12, padding: "13px", color: "#666", fontSize: 14, fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer" }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!valid || uploading}
            style={{ flex: 2, background: valid && !uploading ? "#facc15" : "#1a1a1a", border: "none", borderRadius: 12, padding: "13px", color: valid && !uploading ? "#0a0a0a" : "#444", fontSize: 14, fontWeight: 700, cursor: valid && !uploading ? "pointer" : "not-allowed" }}>
            {uploading ? `Uploading ${progress}%…` : "Submit for Review"}
          </button>
        </div>
      </div>
    </div>
  );
}
