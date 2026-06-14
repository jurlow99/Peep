import { useState, useEffect, useRef } from "react";
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

const CSS = `
  @keyframes livepulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.3)} }
  @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
  @keyframes fadeup { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes ringpulse { 0%{box-shadow:0 0 0 0 rgba(239,68,68,0.5)} 70%{box-shadow:0 0 0 6px rgba(239,68,68,0)} 100%{box-shadow:0 0 0 0 rgba(239,68,68,0)} }
  @keyframes btnpop { 0%{transform:scale(1)} 40%{transform:scale(1.14)} 100%{transform:scale(1)} }
  .stream-card { animation: fadeup 0.35s ease both; }
  .follow-pop { animation: btnpop 0.28s ease; }
`;

function viewerStr(n) {
  if (!n) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function Avatar({ stream, size = 38, live = false }) {
  const src = stream.profile_picture || stream.avatar_url;
  const letter = (stream.channel_name || stream.title || "?")[0].toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
      background: "linear-gradient(135deg, #1e1b4b, #4c1d95)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.4), fontWeight: 700, color: "#fff",
      // red ring + pulse only when live
      outline: live ? "2px solid #ef4444" : "none",
      outlineOffset: 2,
      animation: live ? "ringpulse 2s ease-out infinite" : "none",
      transition: "outline 0.3s",
    }}>
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

function FollowButton({ isFollowing, onClick }) {
  const [popping, setPopping] = useState(false);

  function handleClick(e) {
    e.preventDefault(); e.stopPropagation();
    setPopping(true);
    onClick();
  }

  return (
    <button
      onClick={handleClick}
      onAnimationEnd={() => setPopping(false)}
      className={popping ? "follow-pop" : ""}
      style={{
        flexShrink: 0,
        background: isFollowing ? "rgba(250,204,21,0.08)" : "transparent",
        border: `1px solid ${isFollowing ? "rgba(250,204,21,0.3)" : "#2a2a2a"}`,
        borderRadius: 7, padding: "6px 13px",
        color: isFollowing ? "#facc15" : "#555",
        fontSize: 12, fontWeight: 700, cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
        fontFamily: "inherit",
      }}
      onMouseEnter={e => { if (!isFollowing) { e.currentTarget.style.borderColor = "#3a3a3a"; e.currentTarget.style.color = "#aaa"; } }}
      onMouseLeave={e => { if (!isFollowing) { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#555"; } }}
    >
      {isFollowing ? "✓ Following" : "+ Follow"}
    </button>
  );
}

function ThumbnailPlaceholder() {
  return (
    <div style={{
      width: "100%", height: "100%",
      background: "linear-gradient(90deg, #111 25%, #181818 50%, #111 75%)",
      backgroundSize: "800px 100%",
      animation: "shimmer 1.8s infinite linear",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.05)">
        <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>
      </svg>
    </div>
  );
}

function FeaturedStream({ stream, viewers, isFollowing, onToggleFollow, user }) {
  const [hovered, setHovered] = useState(false);
  const [followPopping, setFollowPopping] = useState(false);
  const slug = stream.slug || stream.username || (stream.channel_name || stream.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const count = viewers || 0;
  const channelName = stream.channel_name || stream.title;

  function handleFollow(e) {
    e.preventDefault(); e.stopPropagation();
    setFollowPopping(true);
    onToggleFollow(stream.id);
  }

  return (
    <a href={`/stream/${slug}`} style={{ textDecoration: "none", color: "inherit", display: "block", marginBottom: 40 }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{
        position: "relative", borderRadius: 16, overflow: "hidden",
        background: "#0f0f0f",
        border: "1px solid rgba(239,68,68,0.25)",
        boxShadow: hovered
          ? "0 0 0 1px rgba(239,68,68,0.35), 0 16px 48px rgba(239,68,68,0.1)"
          : "0 0 0 0px transparent, 0 4px 24px rgba(0,0,0,0.4)",
        display: "grid", gridTemplateColumns: "1fr 320px",
        maxHeight: 380,
        transition: "box-shadow 0.25s, transform 0.2s",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
      }}>
        {/* Thumbnail */}
        <div style={{ position: "relative", overflow: "hidden", background: "#111" }}>
          <div style={{ width: "100%", height: "100%", transition: "transform 0.4s ease", transform: hovered ? "scale(1.03)" : "scale(1)" }}>
            {stream.thumbnail || stream.hero_image
              ? <img src={stream.thumbnail || stream.hero_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <ThumbnailPlaceholder />
            }
          </div>
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
              <Avatar stream={stream} size={40} live />
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
              style={{ display: "block", background: "#ef4444", border: "none", borderRadius: 8, padding: "12px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "center", textDecoration: "none", transition: "background 0.15s", boxShadow: "0 4px 16px rgba(239,68,68,0.3)" }}
              onMouseEnter={e => e.currentTarget.style.background = "#dc2626"}
              onMouseLeave={e => e.currentTarget.style.background = "#ef4444"}>
              Watch Live →
            </a>
            {user && user.id !== stream.user_id && (
              <button
                onClick={handleFollow}
                onAnimationEnd={() => setFollowPopping(false)}
                className={followPopping ? "follow-pop" : ""}
                style={{ background: isFollowing ? "rgba(255,255,255,0.05)" : "transparent", border: `1px solid ${isFollowing ? "#2a2a2a" : "#2a2a2a"}`, borderRadius: 8, padding: "11px", color: isFollowing ? "#facc15" : "#888", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit" }}>
                {isFollowing ? "✓ Following" : "+ Follow"}
              </button>
            )}
          </div>
        </div>
      </div>
    </a>
  );
}

function StreamCard({ stream, viewers, isLive, isFollowing, onToggleFollow, user, index = 0 }) {
  const [hovered, setHovered] = useState(false);
  const slug = stream.slug || stream.username || (stream.channel_name || stream.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const count = viewers || 0;
  const channelName = stream.channel_name || stream.title;

  const liveGlow = isLive && hovered
    ? "0 0 0 1px rgba(239,68,68,0.3), 0 8px 28px rgba(239,68,68,0.08)"
    : isLive
      ? "0 0 0 1px rgba(239,68,68,0.12), 0 2px 12px rgba(0,0,0,0.4)"
      : "0 2px 12px rgba(0,0,0,0.3)";

  return (
    <div
      className="stream-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 12, overflow: "hidden", background: "#0f0f0f",
        border: `1px solid ${isLive ? "rgba(239,68,68,0.15)" : "#161616"}`,
        boxShadow: liveGlow,
        transition: "box-shadow 0.2s, transform 0.2s, border-color 0.2s",
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
        animationDelay: `${index * 50}ms`,
      }}
    >
      <a href={`/stream/${slug}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>

        <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", background: "#111" }}>
          <div style={{ width: "100%", height: "100%", transition: "transform 0.35s ease", transform: hovered ? "scale(1.05)" : "scale(1)" }}>
            {stream.thumbnail || stream.hero_image
              ? <img src={stream.thumbnail || stream.hero_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <ThumbnailPlaceholder />
            }
          </div>

          {/* Hover vignette overlay */}
          <div style={{ position: "absolute", inset: 0, background: hovered ? "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)" : "transparent", transition: "background 0.3s", pointerEvents: "none" }} />

          {!isLive && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />}

          <div style={{ position: "absolute", top: 10, left: 10 }}>
            {isLive ? <LiveBadge /> : (
              <div style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", borderRadius: 5, padding: "3px 9px", border: "1px solid rgba(255,255,255,0.07)" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#555", letterSpacing: 0.8 }}>OFFLINE</span>
              </div>
            )}
          </div>

          {isLive && count > 0 && (
            <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", borderRadius: 5, padding: "3px 8px", display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444" }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{viewerStr(count)}</span>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "11px 12px 13px" }}>
          <Avatar stream={stream} size={36} live={isLive} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: isLive ? "#e8e8e8" : "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
              {stream.stream_title || channelName}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "#3a3a3a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {channelName}
            </p>
          </div>
          {user && user.id !== stream.user_id && (
            <FollowButton isFollowing={isFollowing} onClick={() => onToggleFollow(stream.id)} />
          )}
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
  const [searchQuery, setSearchQuery] = useState("");

  const searchFiltered = searchQuery.trim()
    ? streams.filter(s => {
        const q = searchQuery.trim().toLowerCase();
        const name = (s.channel_name || s.title || "").toLowerCase();
        const handle = (s.username || "").toLowerCase();
        return name.includes(q) || handle.includes(q);
      })
    : streams;

  const liveStreams = searchFiltered.filter(s => s.is_live);
  const offlineStreams = searchFiltered.filter(s => !s.is_live);

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

  const sortedLive = [...liveStreams].sort((a, b) => (viewerCounts[b.id] || 0) - (viewerCounts[a.id] || 0));
  const featuredStream = sortedLive[0] || null;
  const remainingLive = filteredLive.filter(s => !featuredStream || s.id !== featuredStream.id || activeTab === "following");

  const cardProps = (s, i) => ({
    stream: s, viewers: viewerCounts[s.id] || 0, index: i,
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
      <style>{CSS}</style>
      <div style={{ padding: `0 ${PAD}` }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(22px, 3vw, 30px)", fontWeight: 700, color: "#fff" }}>Streams</h1>
          {liveStreams.length > 0 && !searchQuery && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 20, padding: "5px 14px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite" }} />
              <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>
                {liveStreams.length} live{totalViewers > 0 ? ` · ${totalViewers >= 1000 ? `${(totalViewers / 1000).toFixed(1)}k` : totalViewers} watching` : ""}
              </span>
            </div>
          )}
          <div style={{ marginLeft: "auto", position: "relative" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search channels…"
              style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 20, padding: "8px 14px 8px 34px", color: "#ccc", fontSize: 13, outline: "none", width: 200, fontFamily: "inherit", transition: "border-color 0.15s" }}
              onFocus={e => e.currentTarget.style.borderColor = "#333"}
              onBlur={e => e.currentTarget.style.borderColor = "#1e1e1e"}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
            )}
          </div>
        </div>
        {searchQuery && (
          <p style={{ margin: "0 0 20px", fontSize: 13, color: "#444" }}>
            {searchFiltered.length === 0 ? `No channels found for "${searchQuery}"` : `${searchFiltered.length} channel${searchFiltered.length !== 1 ? "s" : ""} found`}
          </p>
        )}

        {/* Featured live stream */}
        {activeTab === "all" && featuredStream && filteredLive.length > 0 && (
          <FeaturedStream {...cardProps(featuredStream, 0)} />
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
              {remainingLive.map((s, i) => <StreamCard key={s.id} {...cardProps(s, i)} />)}
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
              {filteredOffline.map((s, i) => <StreamCard key={s.id} {...cardProps(s, i)} />)}
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
