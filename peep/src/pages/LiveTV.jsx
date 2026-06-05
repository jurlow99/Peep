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

function StreamCard({ stream, viewers, isLive, isFollowing, onToggleFollow, user }) {
  const [hovered, setHovered] = useState(false);
  const slug = stream.username || (stream.channel_name || stream.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const count = viewers || 0;
  const viewerLabel = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
  const avatar = stream.profile_picture || stream.avatar_url;
  const initial = (stream.channel_name || stream.title || "?")[0].toUpperCase();

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderRadius: 12, overflow: "hidden", background: "#0f0f0f", border: `1px solid ${hovered ? "#2a2a2a" : "#161616"}`, transition: "border-color 0.15s" }}
    >
      <a href={`/stream/${slug}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>

        {/* Thumbnail */}
        <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", background: "#111" }}>
          <div style={{ width: "100%", height: "100%", transition: "transform 0.25s ease", transform: hovered ? "scale(1.03)" : "scale(1)" }}>
            {stream.thumbnail || stream.hero_image
              ? <img src={stream.thumbnail || stream.hero_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="rgba(255,255,255,0.1)"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>
                </div>
            }
          </div>

          {!isLive && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />}

          {/* Status badge */}
          {isLive ? (
            <div style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 5, background: "#ef4444", borderRadius: 5, padding: "3px 9px" }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite" }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", letterSpacing: 0.8 }}>LIVE</span>
            </div>
          ) : (
            <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", borderRadius: 5, padding: "3px 9px", border: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#666", letterSpacing: 0.8 }}>OFFLINE</span>
            </div>
          )}

          {/* Follow button — inside thumbnail, top right */}
          {user && user.id !== stream.user_id && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFollow(stream.id); }}
              style={{
                position: "absolute", top: 10, right: 10,
                background: isFollowing ? "rgba(250,204,21,0.85)" : "rgba(0,0,0,0.6)",
                backdropFilter: "blur(6px)",
                border: `1px solid ${isFollowing ? "transparent" : "rgba(255,255,255,0.15)"}`,
                borderRadius: 6, padding: "4px 11px",
                color: isFollowing ? "#0a0a0a" : "#ddd",
                fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
            >
              {isFollowing ? "Following" : "+ Follow"}
            </button>
          )}

          {/* Viewer count */}
          {isLive && count > 0 && (
            <div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", borderRadius: 5, padding: "3px 8px", display: "flex", alignItems: "center", gap: 4 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="rgba(255,255,255,0.6)"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5z"/></svg>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{viewerLabel}</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "12px 14px 14px" }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: "linear-gradient(135deg, #1e1b4b, #4c1d95)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#fff" }}>
            {avatar ? <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initial}
          </div>
          <div style={{ minWidth: 0, flex: 1, paddingTop: 1 }}>
            <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: isLive ? "#fff" : "#777", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
              {stream.stream_title || stream.channel_name || stream.title}
            </p>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {stream.channel_name || stream.title}
            </p>
            {stream.category && stream.category !== "general" && (
              <span style={{ fontSize: 11, color: "#666", background: "rgba(255,255,255,0.05)", border: "1px solid #222", borderRadius: 4, padding: "2px 8px" }}>
                {CATEGORY_LABELS[stream.category] || stream.category}
              </span>
            )}
          </div>
        </div>
      </a>
    </div>
  );
}

export function LiveTVPage({ streams, user, streamsLoading }) {
  const [viewerCounts, setViewerCounts]   = useState({});
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeTab, setActiveTab]         = useState("all"); // "all" | "following"
  const [schedule, setSchedule]           = useState([]);
  const [followedIds, setFollowedIds]     = useState(new Set());

  const liveStreams = streams.filter(s => s.is_live);
  const offlineStreams = streams.filter(s => !s.is_live);

  useEffect(() => {
    supabase.from("stream_schedule")
      .select("*, live_streams(id, channel_name, title)")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at")
      .limit(8)
      .then(({ data }) => setSchedule(data || []));
  }, []);

  useEffect(() => {
    if (!user) { setFollowedIds(new Set()); return; }
    supabase.from("streamer_follows").select("stream_id").eq("follower_id", user.id)
      .then(({ data }) => setFollowedIds(new Set((data || []).map(r => r.stream_id))));
  }, [user?.id]);

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

  async function toggleFollow(streamId) {
    if (!user) { window.location.href = "/signin"; return; }
    const isFollowing = followedIds.has(streamId);
    if (isFollowing) {
      await supabase.from("streamer_follows").delete()
        .eq("stream_id", streamId).eq("follower_id", user.id);
      setFollowedIds(prev => { const next = new Set(prev); next.delete(streamId); return next; });
    } else {
      await supabase.from("streamer_follows").insert({ stream_id: streamId, follower_id: user.id });
      setFollowedIds(prev => new Set([...prev, streamId]));
    }
  }

  const usedCategories = new Set(liveStreams.map(s => s.category || "general"));

  const applyCategory = (list) => activeCategory === "all"
    ? list
    : list.filter(s => (s.category || "general") === activeCategory);

  const filteredLive = activeTab === "following"
    ? liveStreams.filter(s => followedIds.has(s.id))
    : applyCategory(liveStreams);

  const filteredOffline = activeTab === "following"
    ? offlineStreams.filter(s => followedIds.has(s.id))
    : applyCategory(offlineStreams);

  const totalViewers = Object.values(viewerCounts).reduce((a, b) => a + b, 0);
  const followingCount = [...streams].filter(s => followedIds.has(s.id)).length;

  const cardProps = (s) => ({
    stream: s,
    viewers: viewerCounts[s.id] || 0,
    isLive: s.is_live,
    isFollowing: followedIds.has(s.id),
    onToggleFollow: toggleFollow,
    user,
  });

  if (streamsLoading) {
    return <div style={{ paddingTop: 90, minHeight: "100vh" }} />;
  }

  if (streams.length === 0) {
    return (
      <div style={{ paddingTop: 90, paddingBottom: 80, minHeight: "100vh" }}>
        <div style={{ padding: `clamp(60px,10vw,120px) ${PAD}`, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5"><path d="M15 10l4.553-2.07A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
          </div>
          <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 700, color: "#fff" }}>No channels yet</h2>
          <p style={{ margin: "0 0 28px", fontSize: 14, color: "#555", maxWidth: 360, lineHeight: 1.7 }}>
            Check back soon, or apply to stream on peep.
          </p>
          <a href="/apply-to-stream" style={{ background: "#ef4444", color: "#fff", fontWeight: 700, fontSize: 14, padding: "12px 28px", borderRadius: 10, textDecoration: "none" }}>
            Apply to Stream →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 90, paddingBottom: 80, minHeight: "100vh" }}>
      <div style={{ padding: `0 ${PAD}` }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 700, color: "#fff" }}>Streams</h1>
          {liveStreams.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 20, padding: "4px 12px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite" }} />
              <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>
                {liveStreams.length} live{totalViewers > 0 ? ` · ${totalViewers >= 1000 ? `${(totalViewers/1000).toFixed(1)}k` : totalViewers} watching` : ""}
              </span>
            </div>
          )}
        </div>

        {/* Tab filter: All / Following */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[{ id: "all", label: "All Channels" }, { id: "following", label: `Following${followingCount > 0 ? ` (${followingCount})` : ""}` }].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ background: activeTab === t.id ? "#fff" : "rgba(255,255,255,0.05)", border: `1px solid ${activeTab === t.id ? "#fff" : "rgba(255,255,255,0.1)"}`, borderRadius: 20, padding: "6px 18px", color: activeTab === t.id ? "#0a0a0a" : "#666", fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400, cursor: "pointer", transition: "all 0.15s" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Category filter (only in All tab when there are live streams) */}
        {activeTab === "all" && usedCategories.size > 1 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
            {CATEGORIES.filter(c => c.value === "all" || usedCategories.has(c.value)).map(c => (
              <button key={c.value} onClick={() => setActiveCategory(c.value)}
                style={{ background: activeCategory === c.value ? "#facc15" : "rgba(255,255,255,0.05)", border: `1px solid ${activeCategory === c.value ? "#facc15" : "rgba(255,255,255,0.1)"}`, borderRadius: 20, padding: "5px 14px", color: activeCategory === c.value ? "#0a0a0a" : "#666", fontSize: 12, fontWeight: activeCategory === c.value ? 600 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                {c.label}
              </button>
            ))}
          </div>
        )}

        {/* Following tab empty state */}
        {activeTab === "following" && followingCount === 0 && (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <p style={{ color: "#444", fontSize: 15, marginBottom: 8 }}>You're not following anyone yet.</p>
            <p style={{ color: "#333", fontSize: 13 }}>Hit "+ Follow" on any channel to add them here.</p>
            <button onClick={() => setActiveTab("all")} style={{ marginTop: 20, background: "rgba(255,255,255,0.06)", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 22px", color: "#ccc", fontSize: 13, cursor: "pointer" }}>Browse channels</button>
          </div>
        )}

        {/* Live now section */}
        {filteredLive.length > 0 && (
          <div style={{ marginBottom: 48 }}>
            {activeTab === "all" && offlineStreams.length > 0 && (
              <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: "#ef4444", letterSpacing: "0.12em", textTransform: "uppercase" }}>Live Now</p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 24 }}>
              {filteredLive.map(s => (
                <StreamCard key={s.id} {...cardProps(s)} />
              ))}
            </div>
          </div>
        )}

        {/* Live empty within category */}
        {activeTab === "all" && filteredLive.length === 0 && liveStreams.length > 0 && activeCategory !== "all" && (
          <p style={{ color: "#333", fontSize: 14, marginBottom: 32 }}>No live streams in this category right now.</p>
        )}

        {/* Offline channels section */}
        {filteredOffline.length > 0 && (
          <div>
            <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: "#555", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {liveStreams.length > 0 ? "Other Channels" : "All Channels"}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 24 }}>
              {filteredOffline.map(s => (
                <StreamCard key={s.id} {...cardProps(s)} />
              ))}
            </div>
          </div>
        )}

        {/* Upcoming schedule */}
        {schedule.length > 0 && (
          <div style={{ marginTop: 64 }}>
            <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: "#555", letterSpacing: "0.12em", textTransform: "uppercase" }}>Coming Up</p>
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
    </div>
  );
}
