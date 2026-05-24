import { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import { supabase } from "../supabase";

const PAD = "clamp(16px, 5vw, 96px)";
const YELLOW = "#facc15";

const CATEGORY_LABELS = {
  general: "General", gaming: "Gaming", music: "Music",
  talk: "Talk", irl: "IRL", sports: "Sports",
  education: "Education", creative: "Creative",
};

function InlinePlayer({ url, title, onClose }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !url) return;
    if (url.includes(".m3u8")) {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(el);
        hls.on(Hls.Events.MANIFEST_PARSED, () => el.play().catch(() => {}));
        hlsRef.current = hls;
      } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
        el.src = url;
        el.play().catch(() => {});
      }
    } else {
      el.src = url;
      el.play().catch(() => {});
    }
    return () => {
      el.pause(); el.src = "";
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
  }, [url]);

  return (
    <div style={{ position: "sticky", top: 60, zIndex: 50, background: "#000", borderBottom: "1px solid #1e1e1e" }}>
      <div style={{ position: "relative", maxWidth: 860, margin: "0 auto" }}>
        <video ref={videoRef} controls style={{ width: "100%", display: "block", maxHeight: "56vw" }} />
        <button onClick={onClose}
          style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.7)", border: "none", borderRadius: "50%", width: 32, height: 32, color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
          ×
        </button>
        {title && <p style={{ margin: 0, padding: "8px 14px", fontSize: 12, color: "#888", background: "#0a0a0a" }}>{title}</p>}
      </div>
    </div>
  );
}

export function StreamerProfile() {
  const username = window.location.pathname.replace("/stream/", "").replace(/\/$/, "").toLowerCase();

  const [stream, setStream]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [activeVideo, setActiveVideo] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [viewers, setViewers]     = useState(0);
  const [vods, setVods]           = useState([]);
  const [vodsLoading, setVodsLoading] = useState(false);
  const [schedule, setSchedule]   = useState([]);

  useEffect(() => {
    loadStream();
  }, []);

  async function loadStream() {
    // Match by channel_name slug
    const { data: streams } = await supabase
      .from("live_streams")
      .select("*")
      .order("id");

    const match = streams?.find(s => {
      const slug = (s.channel_name || s.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return slug === username;
    });

    setStream(match ?? null);
    setLoading(false);

    if (match) {
      loadFollowers(match.id);
      loadViewers(match.id);
      loadSchedule(match.id);
      loadVods(match.id, match.stream_uid);
    }
  }

  async function loadFollowers(streamId) {
    const { count } = await supabase
      .from("streamer_follows")
      .select("*", { count: "exact", head: true })
      .eq("stream_id", streamId);
    setFollowers(count ?? 0);

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data } = await supabase
        .from("streamer_follows")
        .select("id")
        .eq("stream_id", streamId)
        .eq("follower_id", session.user.id)
        .maybeSingle();
      setIsFollowing(!!data);
    }
  }

  async function loadViewers(streamId) {
    const cutoff = new Date(Date.now() - 90000).toISOString();
    const { count } = await supabase
      .from("live_viewers")
      .select("*", { count: "exact", head: true })
      .eq("channel_id", streamId)
      .gte("last_ping", cutoff);
    setViewers(count ?? 0);
  }

  async function loadSchedule(streamId) {
    const { data } = await supabase
      .from("stream_schedule")
      .select("*")
      .eq("stream_id", streamId)
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at")
      .limit(5);
    setSchedule(data || []);
  }

  async function loadVods(streamId, streamUid) {
    if (!streamUid) return;
    setVodsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-vods?stream_uid=${streamUid}`,
        { headers: token ? { "Authorization": `Bearer ${token}` } : {} }
      );
      const json = await res.json();
      setVods(json.vods || []);
    } catch (_) {}
    setVodsLoading(false);
  }

  async function toggleFollow() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { window.location.href = "/signin"; return; }
    if (session.user.id === stream?.user_id) return;

    setFollowLoading(true);
    if (isFollowing) {
      await supabase.from("streamer_follows")
        .delete()
        .eq("stream_id", stream.id)
        .eq("follower_id", session.user.id);
      setIsFollowing(false);
      setFollowers(f => Math.max(0, f - 1));
    } else {
      await supabase.from("streamer_follows")
        .insert({ stream_id: stream.id, follower_id: session.user.id });
      setIsFollowing(true);
      setFollowers(f => f + 1);
    }
    setFollowLoading(false);
  }

  if (loading) {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
        <p style={{ color: "#555", fontSize: 14, fontFamily: "'Space Grotesk', sans-serif" }}>Loading…</p>
      </div>
    );
  }

  if (!stream) {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", padding: "40px 16px" }}>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
        <a href="/" style={{ textDecoration: "none", marginBottom: 32 }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: YELLOW }}>peep.</span>
        </a>
        <p style={{ color: "#555", fontSize: 15 }}>Streamer not found.</p>
        <a href="/" style={{ marginTop: 20, color: YELLOW, fontSize: 13, textDecoration: "none" }}>← Back to Peep</a>
      </div>
    );
  }

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes livepulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.3)} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, height: 60, display: "flex", alignItems: "center", padding: `0 ${PAD}`, background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid #1e1e1e", justifyContent: "space-between" }}>
        <a href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: YELLOW }}>peep.</span>
        </a>
        <a href="/?nav=Streams" style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>← Streams</a>
      </nav>

      {activeVideo && (
        <InlinePlayer url={activeVideo.url} title={activeVideo.title} onClose={() => setActiveVideo(null)} />
      )}

      {/* Hero banner */}
      <div style={{ position: "relative", height: "clamp(180px, 28vw, 320px)", background: stream.hero_image || stream.thumbnail ? "none" : "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #0f172a 100%)", overflow: "hidden" }}>
        {(stream.hero_image || stream.thumbnail) && (
          <img src={stream.hero_image || stream.thumbnail} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.4) saturate(1.1)" }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0a0a0a 0%, transparent 60%)" }} />
        {stream.is_live && (
          <div style={{ position: "absolute", top: 20, left: PAD, display: "flex", alignItems: "center", gap: 6, background: "rgba(239,68,68,0.9)", borderRadius: 6, padding: "5px 12px" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", letterSpacing: 1 }}>LIVE NOW</span>
          </div>
        )}
      </div>

      {/* Profile info */}
      <div style={{ padding: `0 ${PAD}`, marginTop: -60, position: "relative", zIndex: 2, marginBottom: 48 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: "0 0 8px", fontSize: "clamp(24px, 4vw, 42px)", fontFamily: "'DM Serif Display', serif", fontWeight: 400, color: "#fff", lineHeight: 1 }}>
              {stream.channel_name || stream.title}
            </h1>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "#555" }}>
                <strong style={{ color: "#fff" }}>{followers.toLocaleString()}</strong> followers
              </span>
              {stream.is_live && viewers > 0 && (
                <span style={{ fontSize: 13, color: "#555" }}>
                  <strong style={{ color: "#ef4444" }}>{viewers.toLocaleString()}</strong> watching now
                </span>
              )}
              {stream.category && stream.category !== "general" && (
                <span style={{ fontSize: 13, color: "#555" }}>{CATEGORY_LABELS[stream.category] || stream.category}</span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {stream.is_live && (
              <button onClick={() => setActiveVideo({ url: stream.stream_url, title: `${stream.channel_name || stream.title} — Live` })}
                style={{ background: "#ef4444", border: "none", borderRadius: 10, padding: "11px 22px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                ▶ Watch Live
              </button>
            )}
            <button onClick={toggleFollow} disabled={followLoading}
              style={{ background: isFollowing ? "rgba(255,255,255,0.07)" : YELLOW, border: isFollowing ? "1px solid #333" : "none", borderRadius: 10, padding: "11px 22px", color: isFollowing ? "#888" : "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}>
              {followLoading ? "…" : isFollowing ? "Following" : "+ Follow"}
            </button>
          </div>
        </div>

        {stream.stream_title && stream.is_live && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: "1px solid #1e1e1e", borderRadius: 8, padding: "8px 14px" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite" }} />
            <span style={{ fontSize: 13, color: "#ccc" }}>{stream.stream_title}</span>
          </div>
        )}
      </div>

      <div style={{ padding: `0 ${PAD} 80px` }}>

        {/* Upcoming schedule */}
        {schedule.length > 0 && (
          <div style={{ marginBottom: 52 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#3a3a4a", letterSpacing: "0.12em", textTransform: "uppercase" }}>Upcoming</p>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.04)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {schedule.map(s => {
                const d = new Date(s.scheduled_at);
                return (
                  <div key={s.id} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div>
                      <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "#fff" }}>{s.title}</p>
                      <p style={{ margin: 0, fontSize: 12, color: "#555" }}>
                        {d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                        {" at "}
                        {d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                      </p>
                    </div>
                    <div style={{ background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.15)", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#a16207", fontWeight: 600 }}>
                      Scheduled
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Past streams / VODs */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#3a3a4a", letterSpacing: "0.12em", textTransform: "uppercase" }}>Past Streams</p>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.04)" }} />
          </div>

          {vodsLoading ? (
            <p style={{ color: "#333", fontSize: 13 }}>Loading past streams…</p>
          ) : vods.length === 0 ? (
            <p style={{ color: "#252525", fontSize: 13 }}>No past streams yet.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
              {vods.map(v => (
                <div key={v.uid} onClick={() => setActiveVideo({ url: v.playback?.hls, title: v.meta?.name || "Past Stream" })}
                  style={{ background: "#0e0e11", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, overflow: "hidden", cursor: "pointer" }}>
                  <div style={{ position: "relative", aspectRatio: "16/9", background: "#090910" }}>
                    {v.thumbnail
                      ? <img src={v.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.1)"><polygon points="5,3 19,12 5,21" /></svg>
                        </div>
                    }
                    {v.duration && (
                      <div style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.8)", borderRadius: 4, padding: "2px 6px", fontSize: 10, color: "#fff", fontWeight: 600 }}>
                        {Math.floor(v.duration / 3600) > 0 ? `${Math.floor(v.duration / 3600)}h ` : ""}{Math.floor((v.duration % 3600) / 60)}m
                      </div>
                    )}
                  </div>
                  <div style={{ padding: "10px 12px 12px" }}>
                    <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#e5e5e5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.meta?.name || "Past Stream"}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: "#444" }}>
                      {new Date(v.created).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
