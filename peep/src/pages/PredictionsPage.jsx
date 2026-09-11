import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { filterByTier } from "../lib/tiers";
import { EventPlayer } from "../components/player/EventPlayer";

const PAD = "clamp(16px, 5vw, 96px)";
const YELLOW = "#facc15";
const AGE_NOTICE_KEY = "predictions_age_notice_dismissed";

function eventStreamUrl(ev) {
  if (ev.stream_url) return ev.stream_url;
  if (ev.stream_uid) return `https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com/${ev.stream_uid}/manifest/video.m3u8`;
  return "";
}

/**
 * The Predictions tab: a browse grid of curated, admin-scheduled events,
 * each with its own live-odds overlay (MarketOverlay, via EventPlayer).
 * Deliberately its own content type and its own player -- not a live
 * creator stream, not a FAST channel, so it doesn't inherit either lane's
 * constraints (see CLAUDE.md's lane-separation note).
 */
export function PredictionsPage({ user, onAuthOpen, userTier = "production" }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [noticeDismissed, setNoticeDismissed] = useState(() => {
    try { return sessionStorage.getItem(AGE_NOTICE_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (!user) return;
    supabase.from("prediction_events").select("*").order("starts_at", { ascending: true })
      .then(({ data }) => { setEvents(filterByTier(data || [], userTier)); setLoading(false); });
  }, [user, userTier]);

  function dismissNotice() {
    setNoticeDismissed(true);
    try { sessionStorage.setItem(AGE_NOTICE_KEY, "1"); } catch { /* ignore */ }
  }

  if (!user) {
    return (
      <div style={{ minHeight: "70vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "80px 24px", gap: 14 }}>
        <div style={{ fontSize: 44 }}>🎯</div>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>Predictions is for members</h2>
        <p style={{ margin: 0, fontSize: 14, color: "#888", maxWidth: 380, lineHeight: 1.6 }}>Create a free Peep account to follow live-odds events and place predictions.</p>
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button onClick={() => onAuthOpen?.()} style={{ background: YELLOW, border: "none", borderRadius: 10, padding: "12px 24px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Sign up free →</button>
          <button onClick={() => onAuthOpen?.()} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "12px 22px", color: "#ddd", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Sign in</button>
        </div>
      </div>
    );
  }

  const selected = events.find(e => e.id === selectedId);
  if (selected) {
    return (
      <div style={{ padding: `24px ${PAD} 80px` }}>
        <button onClick={() => setSelectedId(null)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, color: "#ddd", cursor: "pointer", marginBottom: 16 }}>
            ← All events
          </button>
        <div style={{ maxWidth: 900 }}>
          <EventPlayer url={eventStreamUrl(selected)} streamId={String(selected.id)} />
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, color: "#fff", margin: "18px 0 6px", letterSpacing: "-0.01em" }}>{selected.title}</h1>
          {selected.description && <p style={{ margin: 0, fontSize: 14, color: "#9ca3af", lineHeight: 1.6, maxWidth: 640 }}>{selected.description}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: `24px ${PAD} 80px` }}>
      {!noticeDismissed && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.25)", borderRadius: 10, padding: "12px 16px", marginBottom: 22 }}>
          <span style={{ fontSize: 18 }}>🔞</span>
          <p style={{ margin: 0, flex: 1, fontSize: 12.5, color: "#e8d9a0", lineHeight: 1.5 }}>
            Prediction markets are for players 18 and up. Age verification is coming soon -- this is an early preview using virtual Points, not real money.
          </p>
          <button onClick={dismissNotice} aria-label="Dismiss" style={{ background: "none", border: "none", color: "#e8d9a0", fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 4 }}>×</button>
        </div>
      )}

      <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.01em" }}>Predictions</h1>
      <p style={{ margin: "0 0 24px", fontSize: 13.5, color: "#888" }}>Live-odds events, curated by Peep.</p>

      {loading ? (
        <div style={{ color: "#888", padding: 60, textAlign: "center" }}>Loading…</div>
      ) : events.length === 0 ? (
        <div style={{ color: "#666", padding: 60, textAlign: "center", border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 12 }}>No events scheduled right now.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
          {events.map(ev => (
            <EventCard key={ev.id} event={ev} onClick={() => setSelectedId(ev.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({ event, onClick }) {
  const isLive = event.status === "live";
  return (
    <button onClick={onClick} style={{ textAlign: "left", background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden", cursor: "pointer", padding: 0 }}>
      <div style={{ position: "relative", aspectRatio: "16/9", background: event.thumbnail ? `#000 url(${event.thumbnail}) center/cover` : "linear-gradient(160deg,#232016,#141309)" }}>
        {isLive && (
          <span style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 5, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#fff", background: "rgba(180,35,24,0.92)", padding: "4px 8px 4px 6px", borderRadius: 99 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} /> LIVE
          </span>
        )}
      </div>
      <div style={{ padding: "12px 14px" }}>
        <p style={{ margin: "0 0 4px", fontSize: 13.5, fontWeight: 600, color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>{event.title}</p>
        <p style={{ margin: 0, fontSize: 11.5, color: "#888", fontFamily: "'JetBrains Mono', monospace" }}>
          {isLive ? "Happening now" : event.starts_at ? new Date(event.starts_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Schedule TBA"}
        </p>
      </div>
    </button>
  );
}
