import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { SUPABASE_URL } from "../../lib/config";
import { getAdminToken } from "./adminAuth";
import { Spinner } from "../ui/Spinner";
import { PAD } from "./constants";

// Creators > Review Queue: episodes creators have uploaded, awaiting approval.
// The shell keeps the pending count (its settings card and sub-tab label both
// show it), so approvals report the change up rather than holding the number.
export default function ReviewPanel({ showToast, onPendingCount, onBack }) {
  const [reviewEpisodes, setReviewEpisodes] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectNote, setRejectNote] = useState("");

  // Loads once when the tab opens. Approve/reject update the list in place
  // rather than refetching, so there is no other caller.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: eps } = await supabase.from("episodes").select("*, shows(title, thumbnail)").eq("status", "pending").order("created_at", { ascending: false });
      if (cancelled) return;
      if (!eps?.length) { setReviewEpisodes([]); setReviewLoading(false); return; }

      // Look up creator for each show
      const showIds = [...new Set(eps.map(e => String(e.show_id)))];
      const { data: links } = await supabase.from("content_creators").select("content_id, creators(name, email)").eq("content_type", "show").in("content_id", showIds);
      const creatorByShow = {};
      (links || []).forEach(l => { creatorByShow[l.content_id] = l.creators; });

      if (cancelled) return;
      setReviewEpisodes(eps.map(ep => ({ ...ep, showTitle: ep.shows?.title, showThumb: ep.shows?.thumbnail, creator: creatorByShow[String(ep.show_id)] || null })));
      setReviewLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  async function approveEpisode(ep) {
    await supabase.from("episodes").update({ status: "approved" }).eq("id", ep.id);
    setReviewEpisodes(prev => prev.filter(e => e.id !== ep.id));
    onPendingCount(c => Math.max(0, c - 1));
    showToast("Episode approved — it's now live");
    const token = await getAdminToken();
    fetch(`${SUPABASE_URL}/functions/v1/notify-episode-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ type: "approved", episode_id: ep.id }),
    });
  }

  async function rejectEpisode(ep, note) {
    await supabase.from("episodes").update({ status: "rejected", rejection_note: note || null }).eq("id", ep.id);
    setReviewEpisodes(prev => prev.filter(e => e.id !== ep.id));
    onPendingCount(c => Math.max(0, c - 1));
    setRejectModal(null);
    setRejectNote("");
    showToast("Episode rejected — creator notified");
    const token = await getAdminToken();
    fetch(`${SUPABASE_URL}/functions/v1/notify-episode-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ type: "rejected", episode_id: ep.id, rejection_note: note || null }),
    });
  }

  return (
    <>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: `40px ${PAD} 80px` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
          <button onClick={() => onBack()} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#374151", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>← Back</button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Review Queue</h2>
          {reviewEpisodes.length > 0 && <span style={{ fontSize: 13, color: "#9ca3af" }}>{reviewEpisodes.length} pending</span>}
        </div>

        {reviewLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner /></div>
        ) : reviewEpisodes.length === 0 ? (
          <div style={{ textAlign: "center", padding: 80, color: "#9ca3af" }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>✓</p>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#374151", marginBottom: 8 }}>All clear</p>
            <p style={{ fontSize: 13 }}>No episodes waiting for review.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {reviewEpisodes.map(ep => (
              <div key={ep.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden" }}>
                {/* Episode header */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px", borderBottom: "1px solid #f1f5f9", flexWrap: "wrap" }}>
                  {ep.showThumb && <img src={ep.showThumb} alt="" style={{ width: 64, height: 42, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{ep.showTitle}</p>
                    <p style={{ margin: "0 0 2px", fontSize: 13, color: "#475569" }}>S{ep.season}E{ep.episode_number} — {ep.title}</p>
                    <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>
                      {ep.creator ? `${ep.creator.name} · ${ep.creator.email}` : "Unknown creator"} · {new Date(ep.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>

                {/* Video preview */}
                {ep.url && (
                  <div style={{ padding: "16px 22px", borderBottom: "1px solid #f1f5f9", background: "#fafafa" }}>
                    <video controls src={ep.url} style={{ width: "100%", maxHeight: 280, borderRadius: 8, background: "#000" }} />
                  </div>
                )}

                {/* Description */}
                {ep.description && (
                  <div style={{ padding: "14px 22px", borderBottom: "1px solid #f1f5f9" }}>
                    <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{ep.description}</p>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 10, padding: "14px 22px" }}>
                  <button onClick={() => approveEpisode(ep)}
                    style={{ flex: 1, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: "11px", color: "#16a34a", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    ✓ Approve — Go Live
                  </button>
                  <button onClick={() => { setRejectModal(ep); setRejectNote(""); }}
                    style={{ flex: 1, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "11px", color: "#ef4444", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    ✕ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {rejectModal && (
        <div onClick={e => { if (e.target === e.currentTarget) { setRejectModal(null); setRejectNote(""); } }} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: "32px 36px", width: "min(480px,94vw)" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#0f172a" }}>Reject Episode</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280" }}>
              S{rejectModal.season}E{rejectModal.episode_number} — {rejectModal.title}
            </p>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Rejection Note (sent to creator)</label>
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={4} placeholder="Tell the creator why this was rejected and what they can fix…"
              style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#0f172a", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => { setRejectModal(null); setRejectNote(""); }} style={{ flex: 1, background: "#f1f5f9", border: "none", borderRadius: 8, padding: "11px", fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer" }}>Cancel</button>
              <button onClick={() => rejectEpisode(rejectModal, rejectNote)} style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: 8, padding: "11px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>Reject & Notify Partner</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
