import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const PAD = "clamp(16px, 5vw, 96px)";

const CATEGORIES = [
  { value: "all",       label: "All" },
  { value: "gaming",    label: "Gaming" },
  { value: "talk",      label: "Talk" },
  { value: "irl",       label: "IRL" },
  { value: "sports",    label: "Sports" },
  { value: "education", label: "Education" },
  { value: "creative",  label: "Creative" },
];

const CATEGORY_LABELS = {
  general: "General", gaming: "Gaming",
  talk: "Talk", irl: "IRL", sports: "Sports",
  education: "Education", creative: "Creative",
};

function viewerStr(n) {
  if (!n) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function Avatar({ stream, size = 38 }) {
  const src = stream.profile_picture || stream.avatar_url;
  const letter = (stream.channel_name || stream.title || "?")[0].toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: "linear-gradient(135deg, #1e1b4b, #4c1d95)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.4), fontWeight: 700, color: "#fff" }}>
      {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : letter}
    </div>
  );
}

function LiveBadge({ size = "sm" }) {
  const pad = size === "lg" ? "5px 12px" : "3px 9px";
  const dot = size === "lg" ? 7 : 5;
  const fs = size === "lg" ? 11 : 10;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#ef4444", borderRadius: 5, padding: pad }}>
      <div style={{ width: dot, height: dot, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite", flexShrink: 0 }} />
      <span style={{ fontSize: fs, fontWeight: 800, color: "#fff", letterSpacing: 0.8 }}>LIVE</span>
    </div>
  );
}

function FeaturedStream({ stream, viewers, isFollowing, onToggleFollow, user }) {
  const slug = stream.slug || stream.username || (stream.channel_name || stream.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const count = viewers || 0;
  const channelName = stream.channel_name || stream.title;

  return (
    <a href={`/stream/${slug}`} style={{ textDecoration: "none", color: "inherit", display: "block", marginBottom: 40 }}>
      <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "#0f0f0f", border: "1px solid #1e1e1e", display: "grid", gridTemplateColumns: "1fr 320px" }}>
        {/* Thumbnail */}
        <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", background: "#111" }}>
          {stream.thumbnail || stream.hero_image
            ? <img src={stream.thumbnail || stream.hero_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="rgba(255,255,255,0.07)"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>
              </div>
          }
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent 70%, rgba(0,0,0,0.4))" }} />
          <div style={{ position: "absolute", top: 14, left: 14 }}>
            <LiveBadge size="lg" />
          </div>
          {count > 0 && (
            <div style={{ position: "absolute", bottom: 14, left: 14, display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)", borderRadius: 6, padding: "5px 10px" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444" }} />
              <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>{viewerStr(count)} watching</span>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={{ padding: "28px 24px", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0d0d0d" }}>
          <div>
            <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "#ef4444", letterSpacing: "0.1em", textTransform: "uppercase" }}>Featured Stream</p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <Avatar stream={stream} size={40} />
              <div>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{channelName}</p>
                {stream.category && stream.category !== "general" && (
                  <p style={{ margin: "3px 0 0", fontSize: 11, color: "#555" }}>{CATEGORY_LABELS[stream.category] || stream.category}</p>
                )}
              </div>
            </div>
            {stream.stream_title && (
              <p style={{ margin: "0 0 14px", fontSize: 14, color: "#888", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{stream.stream_title}</p>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <a href={`/stream/${slug}`}
              style={{ display: "block", background: "#ef4444", border: "none", borderRadius: 8, padding: "12px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "center", textDecoration: "none" }}>
              Watch Live →
            </a>
            {user && user.id !== stream.user_id && (
              <button onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFollow(stream.id); }}
                style={{ background: isFollowing ? "rgba(255,255,255,0.05)" : "transparent", border: `1px solid ${isFollowing ? "#2a2a2a" : "#2a2a2a"}`, borderRadius: 8, padding: "11px", color: isFollowing ? "#555" : "#888", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
                {isFollowing ? "Following ✓" : "+ Follow"}
              </button>
            )}
          </div>
        </div>
      </div>
    </a>
  );
}

function StreamCard({ stream, viewers, isLive, isFollowing, onToggleFollow, user }) {
  const [hovered, setHovered] = useState(false);
  const slug = stream.slug || stream.username || (stream.channel_name || stream.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const count = viewers || 0;
  const channelName = stream.channel_name || stream.title;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderRadius: 12, overflow: "hidden", background: "#0f0f0f", border: `1px solid ${hovered ? "#2a2a2a" : "#161616"}`, transition: "border-color 0.15s, transform 0.15s", transform: hovered ? "translateY(-2px)" : "translateY(0)" }}
    >
      <a href={`/stream/${slug}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>

        <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", background: "#111" }}>
          <div style={{ width: "100%", height: "100%", transition: "transform 0.3s ease", transform: hovered ? "scale(1.04)" : "scale(1)" }}>
            {stream.thumbnail || stream.hero_image
              ? <img src={stream.thumbnail || stream.hero_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.08)"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>
                </div>
            }
          </div>

          {!isLive && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />}

          <div style={{ position: "absolute", top: 10, left: 10 }}>
            {isLive ? <LiveBadge /> : (
              <div style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", borderRadius: 5, padding: "3px 9px", border: "1px solid rgba(255,255,255,0.07)" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#555", letterSpacing: 0.8 }}>OFFLINE</span>
              </div>
            )}
          </div>

          {user && user.id !== stream.user_id && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFollow(stream.id); }}
              style={{
                position: "absolute", top: 10, right: 10,
                background: isFollowing ? "rgba(250,204,21,0.9)" : "rgba(0,0,0,0.65)",
                backdropFilter: "blur(6px)",
                border: `1px solid ${isFollowing ? "transparent" : "rgba(255,255,255,0.12)"}`,
                borderRadius: 6, padding: "4px 12px",
                color: isFollowing ? "#0a0a0a" : "#ddd",
                fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
              }}
            >
              {isFollowing ? "Following" : "+ Follow"}
            </button>
          )}

          {isLive && count > 0 && (
            <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", borderRadius: 5, padding: "3px 8px", display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444" }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{viewerStr(count)}</span>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px 14px" }}>
          <Avatar stream={stream} size={36} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: isLive ? "#fff" : "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
              {stream.stream_title || channelName}
            </p>
            <p style={{ margin: "0 0 5px", fontSize: 12, color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {channelName}
            </p>
            {stream.category && stream.category !== "general" && (
              <span style={{ fontSize: 11, color: "#555", background: "rgba(255,255,255,0.04)", border: "1px solid #1e1e1e", borderRadius: 4, padding: "2px 7px" }}>
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
  const [viewerCounts, setViewerCounts] = useState({});
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeTab, setActiveTab] = useState("all");
  const [schedule, setSchedule] = useState([]);
  const [followedIds, setFollowedIds] = useState(new Set());

  const liveStreams = streams.filter(s => s.is_live);
  const offlineStreams = streams.filter(s => !s.is_live);

  useEffect(() => {
    supabase.from("stream_schedule")
      .select("*, live_streams(id, channel_name, title)")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at").limit(8)
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
      await supabase.from("streamer_follows").delete().eq("stream_id", streamId).eq("follower_id", user.id);
      setFollowedIds(prev => { const n = new Set(prev); n.delete(streamId); return n; });
    } else {
      await supabase.from("streamer_follows").insert({ stream_id: streamId, follower_id: user.id });
      setFollowedIds(prev => new Set([...prev, streamId]));
    }
  }

  const usedCategories = new Set(liveStreams.map(s => s.category || "general"));
  const applyCategory = list => activeCategory === "all" ? list : list.filter(s => (s.category || "general") === activeCategory);

  const filteredLive = activeTab === "following"
    ? liveStreams.filter(s => followedIds.has(s.id))
    : applyCategory(liveStreams);

  const filteredOffline = activeTab === "following"
    ? offlineStreams.filter(s => followedIds.has(s.id))
    : applyCategory(offlineStreams);

  const totalViewers = Object.values(viewerCounts).reduce((a, b) => a + b, 0);
  const followingCount = streams.filter(s => followedIds.has(s.id)).length;

  // Pick featured stream: live, sorted by viewer count
  const sortedLive = [...liveStreams].sort((a, b) => (viewerCounts[b.id] || 0) - (viewerCounts[a.id] || 0));
  const featuredStream = sortedLive[0] || null;
  const remainingLive = filteredLive.filter(s => !featuredStream || s.id !== featuredStream.id || activeTab === "following");

  const cardProps = s => ({
    stream: s, viewers: viewerCounts[s.id] || 0,
    isLive: s.is_live, isFollowing: followedIds.has(s.id),
    onToggleFollow: toggleFollow, user,
  });

  if (streamsLoading) return <div style={{ paddingTop: 90, minHeight: "100vh" }} />;

  if (streams.length === 0) {
    return (
      <div style={{ paddingTop: 90, paddingBottom: 80, minHeight: "100vh" }}>
        <div style={{ padding: `clamp(80px,12vw,140px) ${PAD}`, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: 22, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5"><path d="M15 10l4.553-2.07A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
          </div>
          <h2 style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 700, color: "#fff" }}>No channels yet</h2>
          <p style={{ margin: 0, fontSize: 14, color: "#555", maxWidth: 340, lineHeight: 1.7 }}>Channels will appear here once creators go live.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 90, paddingBottom: 80, minHeight: "100vh" }}>
      <style>{`@keyframes livepulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.3)}}`}</style>
      <div style={{ padding: `0 ${PAD}` }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: "clamp(22px, 3vw, 30px)", fontWeight: 700, color: "#fff" }}>Streams</h1>
          {liveStreams.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 20, padding: "5px 14px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite" }} />
              <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>
                {liveStreams.length} live{totalViewers > 0 ? ` · ${totalViewers >= 1000 ? `${(totalViewers / 1000).toFixed(1)}k` : totalViewers} watching` : ""}
              </span>
            </div>
          )}
        </div>

        {/* Featured live stream */}
        {activeTab === "all" && featuredStream && filteredLive.length > 0 && (
          <FeaturedStream {...cardProps(featuredStream)} />
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {[{ id: "all", label: "All Channels" }, { id: "following", label: `Following${followingCount > 0 ? ` (${followingCount})` : ""}` }].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ background: activeTab === t.id ? "#fff" : "rgba(255,255,255,0.05)", border: `1px solid ${activeTab === t.id ? "#fff" : "rgba(255,255,255,0.1)"}`, borderRadius: 20, padding: "7px 20px", color: activeTab === t.id ? "#0a0a0a" : "#666", fontSize: 13, fontWeight: activeTab === t.id ? 700 : 400, cursor: "pointer", transition: "all 0.15s" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Category pills */}
        {activeTab === "all" && usedCategories.size > 1 && (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 28 }}>
            {CATEGORIES.filter(c => c.value === "all" || usedCategories.has(c.value)).map(c => (
              <button key={c.value} onClick={() => setActiveCategory(c.value)}
                style={{ background: activeCategory === c.value ? "#facc15" : "rgba(255,255,255,0.05)", border: `1px solid ${activeCategory === c.value ? "#facc15" : "rgba(255,255,255,0.08)"}`, borderRadius: 20, padding: "5px 16px", color: activeCategory === c.value ? "#0a0a0a" : "#666", fontSize: 12, fontWeight: activeCategory === c.value ? 700 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                {c.label}
              </button>
            ))}
          </div>
        )}

        {/* Following empty state */}
        {activeTab === "following" && followingCount === 0 && (
          <div style={{ padding: "72px 0", textAlign: "center" }}>
            <p style={{ color: "#444", fontSize: 15, margin: "0 0 8px" }}>You're not following anyone yet.</p>
            <p style={{ color: "#333", fontSize: 13, margin: "0 0 24px" }}>Hit "+ Follow" on any channel to see them here.</p>
            <button onClick={() => setActiveTab("all")} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 24px", color: "#bbb", fontSize: 13, cursor: "pointer" }}>Browse channels</button>
          </div>
        )}

        {/* Live Now */}
        {remainingLive.length > 0 && (
          <div style={{ marginBottom: 52 }}>
            {(activeTab === "all" && offlineStreams.length > 0) || activeTab === "following" ? (
              <p style={{ margin: "0 0 18px", fontSize: 11, fontWeight: 700, color: "#ef4444", letterSpacing: "0.12em", textTransform: "uppercase" }}>Live Now</p>
            ) : null}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
              {remainingLive.map(s => <StreamCard key={s.id} {...cardProps(s)} />)}
            </div>
          </div>
        )}

        {activeTab === "all" && filteredLive.length === 0 && liveStreams.length > 0 && activeCategory !== "all" && (
          <p style={{ color: "#333", fontSize: 14, marginBottom: 32 }}>No live streams in this category right now.</p>
        )}

        {/* Offline channels */}
        {filteredOffline.length > 0 && (
          <div>
            <p style={{ margin: "0 0 18px", fontSize: 11, fontWeight: 700, color: "#444", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {liveStreams.length > 0 ? "Other Channels" : "All Channels"}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
              {filteredOffline.map(s => <StreamCard key={s.id} {...cardProps(s)} />)}
            </div>
          </div>
        )}

        {/* Schedule */}
        {schedule.length > 0 && (
          <div style={{ marginTop: 72 }}>
            <p style={{ margin: "0 0 18px", fontSize: 11, fontWeight: 700, color: "#444", letterSpacing: "0.12em", textTransform: "uppercase" }}>Coming Up</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
              {schedule.map(s => {
                const d = new Date(s.scheduled_at);
                const name = s.live_streams?.channel_name || s.live_streams?.title || "Unknown";
                return (
                  <div key={s.id} style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 10, padding: "16px 18px" }}>
                    <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: "#fff" }}>{s.title}</p>
                    <p style={{ margin: "0 0 8px", fontSize: 12, color: "#555" }}>{name}</p>
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
