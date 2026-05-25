import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const PAD = "clamp(16px, 5vw, 96px)";

const CATEGORIES = [
  { value: "all",       label: "All" },
  { value: "gaming",    label: "Gaming" },
  { value: "music",     label: "Music" },
  { value: "talk",      label: "Talk" },
  { value: "irl",       label: "IRL" },
  { value: "sports",    label: "Sports" },
  { value: "education", label: "Education" },
  { value: "creative",  label: "Creative" },
];

const CATEGORY_LABELS = {
  general: "General", gaming: "Gaming", music: "Music",
  talk: "Talk", irl: "IRL", sports: "Sports",
  education: "Education", creative: "Creative",
};

function StreamCard({ stream, viewers }) {
  const slug = (stream.channel_name || stream.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const count = viewers || 0;
  const viewerLabel = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);

  return (
    <a href={`/stream/${slug}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}
      onMouseEnter={e => e.currentTarget.querySelector(".card-thumb").style.transform = "scale(1.03)"}
      onMouseLeave={e => e.currentTarget.querySelector(".card-thumb").style.transform = "scale(1)"}>

      {/* Thumbnail */}
      <div style={{ position: "relative", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", background: "#111", marginBottom: 10 }}>
        <div className="card-thumb" style={{ width: "100%", height: "100%", transition: "transform 0.2s ease" }}>
          {stream.thumbnail || stream.hero_image
            ? <img src={stream.thumbnail || stream.hero_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.15)"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>
              </div>
          }
        </div>

        {/* Live badge */}
        <div style={{ position: "absolute", top: 8, left: 8, display: "flex", alignItems: "center", gap: 5, background: "#ef4444", borderRadius: 5, padding: "3px 8px" }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite" }} />
          <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", letterSpacing: 0.8 }}>LIVE</span>
        </div>

        {/* Viewer count */}
        {count > 0 && (
          <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.75)", borderRadius: 5, padding: "3px 8px", display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5z"/></svg>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>{viewerLabel}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ display: "flex", gap: 10 }}>
        {/* Avatar placeholder */}
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #312e81, #6d28d9)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff" }}>
          {(stream.channel_name || stream.title || "?")[0].toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {stream.stream_title || stream.channel_name || stream.title}
          </p>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {stream.channel_name || stream.title}
          </p>
          {stream.category && stream.category !== "general" && (
            <span style={{ fontSize: 11, color: "#555", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 4, padding: "2px 7px" }}>
              {CATEGORY_LABELS[stream.category] || stream.category}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

export function LiveTVPage({ streams }) {
  const [viewerCounts, setViewerCounts]   = useState({});
  const [activeCategory, setActiveCategory] = useState("all");
  const [schedule, setSchedule]           = useState([]);

  useEffect(() => {
    supabase.from("stream_schedule")
      .select("*, live_streams(id, channel_name, title)")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at")
      .limit(8)
      .then(({ data }) => setSchedule(data || []));
  }, []);

  useEffect(() => {
    async function loadViewers() {
      const cutoff = new Date(Date.now() - 90000).toISOString();
      const { data } = await supabase.from("live_viewers").select("channel_id").gte("last_ping", cutoff);
      if (!data) return;
      const counts = {};
      data.forEach(r => { counts[r.channel_id] = (counts[r.channel_id] || 0) + 1; });
      setViewerCounts(counts);
    }
    loadViewers();
    const t = setInterval(loadViewers, 30000);
    return () => clearInterval(t);
  }, []);

  const usedCategories = new Set(streams.map(s => s.category || "general"));
  const filtered = activeCategory === "all"
    ? streams
    : streams.filter(s => (s.category || "general") === activeCategory);

  const totalViewers = Object.values(viewerCounts).reduce((a, b) => a + b, 0);

  return (
    <div style={{ paddingTop: 90, paddingBottom: 80, minHeight: "100vh" }}>

      {streams.length === 0 ? (
        /* Empty state */
        <div style={{ padding: `clamp(60px,10vw,120px) ${PAD}`, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5"><path d="M15 10l4.553-2.07A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
          </div>
          <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 700, color: "#fff" }}>Nobody's live right now</h2>
          <p style={{ margin: "0 0 28px", fontSize: 14, color: "#555", maxWidth: 360, lineHeight: 1.7 }}>
            Check back soon, or follow your favourite streamers to get notified the moment they go live.
          </p>
          <a href="/apply-to-stream" style={{ background: "#ef4444", color: "#fff", fontWeight: 700, fontSize: 14, padding: "12px 28px", borderRadius: 10, textDecoration: "none" }}>
            Apply to Stream →
          </a>

          {schedule.length > 0 && (
            <div style={{ marginTop: 56, width: "100%", maxWidth: 560, textAlign: "left" }}>
              <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#3a3a4a", letterSpacing: "0.12em", textTransform: "uppercase" }}>Coming Up</p>
              {schedule.map(s => {
                const d = new Date(s.scheduled_at);
                const name = s.live_streams?.channel_name || s.live_streams?.title || "Unknown";
                return (
                  <div key={s.id} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "12px 16px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div>
                      <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#fff" }}>{s.title}</p>
                      <p style={{ margin: 0, fontSize: 11, color: "#555" }}>{name}</p>
                    </div>
                    <p style={{ margin: 0, fontSize: 11, color: "#555", flexShrink: 0 }}>
                      {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div style={{ padding: `0 ${PAD}` }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
            <h1 style={{ margin: 0, fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 700, color: "#fff" }}>Live</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 20, padding: "4px 12px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite" }} />
              <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>
                {filtered.length} live{totalViewers > 0 ? ` · ${totalViewers >= 1000 ? `${(totalViewers/1000).toFixed(1)}k` : totalViewers} watching` : ""}
              </span>
            </div>
          </div>

          {/* Category filter */}
          {usedCategories.size > 1 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
              {CATEGORIES.filter(c => c.value === "all" || usedCategories.has(c.value)).map(c => (
                <button key={c.value} onClick={() => setActiveCategory(c.value)}
                  style={{ background: activeCategory === c.value ? "#fff" : "rgba(255,255,255,0.05)", border: `1px solid ${activeCategory === c.value ? "#fff" : "rgba(255,255,255,0.1)"}`, borderRadius: 20, padding: "6px 16px", color: activeCategory === c.value ? "#0a0a0a" : "#666", fontSize: 13, fontWeight: activeCategory === c.value ? 600 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {/* Stream grid */}
          {filtered.length === 0 ? (
            <p style={{ color: "#333", fontSize: 14, marginTop: 40 }}>No streams in this category right now.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 24 }}>
              {filtered.map(s => (
                <StreamCard key={s.id} stream={s} viewers={viewerCounts[s.id] || 0} />
              ))}
            </div>
          )}

          {/* Upcoming schedule */}
          {schedule.length > 0 && (
            <div style={{ marginTop: 64 }}>
              <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: "#3a3a4a", letterSpacing: "0.12em", textTransform: "uppercase" }}>Coming Up</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                {schedule.map(s => {
                  const d = new Date(s.scheduled_at);
                  const name = s.live_streams?.channel_name || s.live_streams?.title || "Unknown";
                  return (
                    <div key={s.id} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "14px 16px" }}>
                      <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 600, color: "#fff" }}>{s.title}</p>
                      <p style={{ margin: "0 0 6px", fontSize: 12, color: "#666" }}>{name}</p>
                      <p style={{ margin: 0, fontSize: 11, color: "#444" }}>
                        {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
