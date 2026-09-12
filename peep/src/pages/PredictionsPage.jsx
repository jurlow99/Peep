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
 * The Predictions tab: an odds-forward ticker of curated, admin-scheduled
 * events -- current prices are visible right in the browse list, no click-
 * through required, same instinct as a sportsbook board rather than a
 * content-browse grid. Each event still opens into its own live-odds
 * overlay (MarketOverlay, via EventPlayer). Deliberately its own content
 * type and its own player -- not a live creator stream, not a FAST channel,
 * so it doesn't inherit either lane's constraints (see CLAUDE.md's
 * lane-separation note).
 */
export function PredictionsPage({ user, onAuthOpen, userTier = "production" }) {
  const [events, setEvents] = useState([]);
  const [marketsByEvent, setMarketsByEvent] = useState({}); // event_id -> open market row w/ market_options
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [noticeDismissed, setNoticeDismissed] = useState(() => {
    try { return sessionStorage.getItem(AGE_NOTICE_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: eventsData } = await supabase.from("prediction_events").select("*").order("starts_at", { ascending: true });
      if (cancelled) return;
      const visible = filterByTier(eventsData || [], userTier);
      setEvents(visible);

      if (visible.length === 0) { setLoading(false); return; }
      const { data: marketsData } = await supabase.from("prediction_markets")
        .select("*, market_options(*)")
        .eq("status", "open")
        .in("event_id", visible.map(e => e.id));
      if (cancelled) return;
      const byEvent = {};
      (marketsData || []).forEach(m => { byEvent[m.event_id] = m; });
      setMarketsByEvent(byEvent);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, userTier]);

  function dismissNotice() {
    setNoticeDismissed(true);
    try { sessionStorage.setItem(AGE_NOTICE_KEY, "1"); } catch { /* ignore */ }
  }

  if (!user) {
    return (
      <div style={{ minHeight: "70vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "80px 24px", gap: 14 }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>
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
        <button onClick={() => setSelectedId(null)} style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, color: "#ddd", cursor: "pointer", marginBottom: 16, fontFamily: "'Space Grotesk', sans-serif" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><polyline points="15 18 9 12 15 6"/></svg>
          All events
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e8d9a0" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16.5" r="0.5" fill="#e8d9a0" stroke="none"/></svg>
          <p style={{ margin: 0, flex: 1, fontSize: 12.5, color: "#e8d9a0", lineHeight: 1.5 }}>
            Prediction markets are for players 18 and up. Age verification is coming soon -- this is an early preview using virtual Points, not real money.
          </p>
          <button onClick={dismissNotice} aria-label="Dismiss" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8d9a0" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.01em" }}>Predictions</h1>
      <p style={{ margin: "0 0 24px", fontSize: 13.5, color: "#888" }}>Live odds, updated in real time.</p>

      {loading ? (
        <div style={{ color: "#888", padding: 60, textAlign: "center" }}>Loading…</div>
      ) : events.length === 0 ? (
        <div style={{ color: "#666", padding: 60, textAlign: "center", border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 12 }}>No events scheduled right now.</div>
      ) : (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "64px 2.2fr 1fr 1fr 100px", gap: 16, padding: "0 18px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span />
            <span style={rowLabelStyle}>Event</span>
            <span style={rowLabelStyle}>Market</span>
            <span style={rowLabelStyle}>Odds</span>
            <span />
          </div>
          {events.map(ev => (
            <EventRow key={ev.id} event={ev} market={marketsByEvent[ev.id]} onClick={() => setSelectedId(ev.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

const rowLabelStyle = { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#666" };

function EventRow({ event, market, onClick }) {
  const isLive = event.status === "live";
  const hasMarket = !!market;
  const options = (market?.market_options || []).slice(0, 2);

  return (
    <button onClick={onClick} style={{ width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", padding: 0, opacity: hasMarket ? 1 : 0.55 }}>
      <div style={{ display: "grid", gridTemplateColumns: "64px 2.2fr 1fr 1fr 100px", gap: 16, alignItems: "center", padding: "16px 18px" }}>
        <div style={{ width: 56, aspectRatio: "16/9", borderRadius: 6, background: event.thumbnail ? `#000 url(${event.thumbnail}) center/cover` : "linear-gradient(150deg,#232016,#141309 70%)" }} />

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
            {isLive && (
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: "#fff", background: "rgba(180,35,24,0.92)", padding: "3px 7px 3px 6px", borderRadius: 99 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }} /> LIVE
              </span>
            )}
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13.5, fontWeight: 600, color: "#fff" }}>{event.title}</span>
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#888" }}>
            {event.starts_at ? new Date(event.starts_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Schedule TBA"}
          </span>
        </div>

        <span style={{ fontSize: 13, color: hasMarket ? "#ddd" : "#999" }}>{market?.question ?? "—"}</span>

        {hasMarket ? (
          <div style={{ display: "flex", gap: 6 }}>
            {options.map(o => (
              <div key={o.id} style={{ flex: 1, textAlign: "center", padding: "7px 0", borderRadius: 6, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.16)" }}>
                <span style={{ display: "block", fontSize: 9.5, color: "#999" }}>{o.label}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: "#e9e6d6" }}>{Number(o.odds).toFixed(2)}×</span>
              </div>
            ))}
          </div>
        ) : (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#666" }}>Opens at post time</span>
        )}

        <div style={{ textAlign: "center", fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, fontWeight: 700, padding: "9px 0", borderRadius: 6, background: hasMarket ? YELLOW : "rgba(255,255,255,0.06)", border: hasMarket ? "none" : "1px solid rgba(255,255,255,0.14)", color: hasMarket ? "#171712" : "#ccc" }}>
          {hasMarket ? "Watch" : "Remind me"}
        </div>
      </div>
    </button>
  );
}
