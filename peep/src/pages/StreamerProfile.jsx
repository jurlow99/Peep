import { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import { supabase } from "../supabase";

const YELLOW = "#facc15";
const CHAT_WIDTH = 320;

const CATEGORY_LABELS = {
  general: "General", gaming: "Gaming",
  talk: "Talk", irl: "IRL", sports: "Sports",
  education: "Education", creative: "Creative",
};

function VideoPlayer({ url, live = false, style = {} }) {
  const containerRef = useRef(null);
  const ref = useRef(null);
  const hlsRef = useRef(null);
  const retryTimer = useRef(null);
  const hideTimer = useRef(null);
  const alive = useRef(true);
  const fsRef = useRef(false);

  const [showPlay, setShowPlay] = useState(false);
  const [starting, setStarting] = useState(false);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [ctrlVisible, setCtrlVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onPlay = () => { setPaused(false); setShowPlay(false); };
    const onPause = () => setPaused(true);
    const onVolume = () => setMuted(el.muted);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("volumechange", onVolume);
    return () => { el.removeEventListener("play", onPlay); el.removeEventListener("pause", onPause); el.removeEventListener("volumechange", onVolume); };
  }, []);

  useEffect(() => {
    const onChange = () => {
      const fs = !!document.fullscreenElement;
      fsRef.current = fs;
      setIsFullscreen(fs);
      setCtrlVisible(true);
      clearTimeout(hideTimer.current);
      if (!fs) hideTimer.current = setTimeout(() => setCtrlVisible(false), 3000);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function attachHls(el, src, attempt = 0) {
    if (!alive.current) return;
    hlsRef.current?.destroy();
    const h = new Hls({ startLevel: -1, capLevelToPlayerSize: false, autoLevelCapping: -1 });
    h.loadSource(src); h.attachMedia(el);
    h.on(Hls.Events.MANIFEST_PARSED, () => {
      if (!alive.current) return;
      setStarting(false);
      el.play().catch(() => setShowPlay(true));
    });
    h.on(Hls.Events.ERROR, (_, d) => {
      if (!alive.current || !d.fatal) return;
      h.destroy();
      setStarting(true);
      retryTimer.current = setTimeout(() => attachHls(el, src, attempt + 1), Math.min(5000 + attempt * 3000, 15000));
    });
    hlsRef.current = h;
  }

  useEffect(() => {
    alive.current = true;
    const el = ref.current;
    if (!el || !url) return;
    setShowPlay(false); setStarting(false);
    clearTimeout(retryTimer.current);
    if (url.includes(".m3u8")) {
      if (Hls.isSupported()) attachHls(el, url);
      else if (el.canPlayType("application/vnd.apple.mpegurl")) { el.src = url; el.play().catch(() => setShowPlay(true)); }
    } else {
      el.src = url; el.play().catch(() => setShowPlay(true));
    }
    return () => {
      alive.current = false;
      clearTimeout(retryTimer.current);
      clearTimeout(hideTimer.current);
      el.pause(); el.src = "";
      hlsRef.current?.destroy(); hlsRef.current = null;
    };
  }, [url]);

  function nudgeControls() {
    setCtrlVisible(true);
    clearTimeout(hideTimer.current);
    if (!fsRef.current) hideTimer.current = setTimeout(() => setCtrlVisible(false), 3000);
  }

  function togglePlay() { const el = ref.current; if (!el) return; el.paused ? el.play().catch(() => {}) : el.pause(); }
  function toggleMute() { const el = ref.current; if (el) el.muted = !el.muted; }
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current?.requestFullscreen().catch(() => {});
  }

  const overlays = (
    <>
      {starting && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3, pointerEvents: "none" }}>
          <p style={{ margin: 0, color: "#555", fontSize: 13, fontFamily: "'Space Grotesk', sans-serif" }}>Connecting to stream…</p>
        </div>
      )}
      {showPlay && !starting && (
        <div onClick={e => { e.stopPropagation(); ref.current?.play().then(() => setShowPlay(false)).catch(() => {}); }}
          style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 3 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
          </div>
        </div>
      )}
    </>
  );

  if (!live) {
    return (
      <div style={{ position: "relative", background: "#000", ...style }}>
        <video ref={ref} controls style={{ display: "block", width: "100%", height: "100%", background: "#000" }} />
        {overlays}
      </div>
    );
  }

  const btnStyle = { background: "none", border: "none", color: "#fff", cursor: "pointer", padding: "7px 9px", display: "flex", alignItems: "center", flexShrink: 0, opacity: 0.85, transition: "opacity 0.15s" };

  return (
    <div
      ref={containerRef}
      onMouseMove={nudgeControls}
      onMouseEnter={nudgeControls}
      onMouseLeave={() => { if (!fsRef.current) { clearTimeout(hideTimer.current); setCtrlVisible(false); } }}
      onClick={togglePlay}
      style={{ position: "relative", background: "#000", cursor: ctrlVisible || paused ? "default" : "none", userSelect: "none", ...style }}>
      <video ref={ref} style={{ display: "block", width: "100%", height: "100%", background: "#000", objectFit: "contain" }} />

      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", opacity: ctrlVisible || paused ? 1 : 0, transition: "opacity 0.3s", pointerEvents: ctrlVisible || paused ? "auto" : "none" }}>
        <div style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.88))", padding: "56px 14px 12px", display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={e => { e.stopPropagation(); togglePlay(); }} style={btnStyle}>
            {paused
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            }
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#ef4444", borderRadius: 4, padding: "3px 9px", flexShrink: 0 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite" }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", letterSpacing: 0.8 }}>LIVE</span>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={e => { e.stopPropagation(); toggleMute(); }} style={btnStyle}>
            {muted
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54,8.46a5,5,0,0,1,0,7.07"/><path d="M19.07,4.93a10,10,0,0,1,0,14.14"/></svg>
            }
          </button>
          <button onClick={e => { e.stopPropagation(); toggleFullscreen(); }} style={btnStyle}>
            {isFullscreen
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M8 3v5H3"/><path d="M21 8h-5V3"/><path d="M3 16h5v5"/><path d="M16 21v-5h5"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
            }
          </button>
        </div>
      </div>

      {overlays}
    </div>
  );
}

export function StreamerProfile() {
  const username = window.location.pathname.replace("/stream/", "").replace(/\/$/, "").toLowerCase();

  const [stream, setStream]               = useState(null);
  const [loading, setLoading]             = useState(true);
  const [vodPlaying, setVodPlaying]       = useState(null);
  const [isFollowing, setIsFollowing]     = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followers, setFollowers]         = useState(0);
  const [viewers, setViewers]             = useState(0);
  const [vods, setVods]                   = useState([]);
  const [vodsLoading, setVodsLoading]     = useState(false);
  const [schedule, setSchedule]           = useState([]);
  const [currentUser, setCurrentUser]     = useState(null);
  const [chatMessages, setChatMessages]   = useState([]);
  const [chatInput, setChatInput]         = useState("");
  const [chatSending, setChatSending]     = useState(false);
  const [streamEnded, setStreamEnded]     = useState(false);
  const [copied, setCopied]               = useState(false);
  const chatBottomRef = useRef(null);
  const prevIsLiveRef = useRef(null);

  useEffect(() => {
    loadStream();
    supabase.auth.getSession().then(({ data: { session } }) => setCurrentUser(session?.user ?? null));
  }, []);

  useEffect(() => {
    if (stream === null) return;
    if (prevIsLiveRef.current === true && stream.is_live === false) setStreamEnded(true);
    prevIsLiveRef.current = stream.is_live;
  }, [stream?.is_live]);

  useEffect(() => {
    if (!stream?.id) return;
    const ch = supabase.channel(`stream-status-${stream.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_streams", filter: `id=eq.${stream.id}` },
        ({ new: updated }) => setStream(prev => ({ ...prev, ...updated })))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [stream?.id]);

  useEffect(() => {
    if (!stream?.id || !stream?.stream_uid) return;
    const check = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-live-status?stream_uid=${stream.stream_uid}&stream_id=${stream.id}`, {
          headers: { "Authorization": `Bearer ${token}` },
        });
        const json = await res.json();
        if (typeof json.is_live === "boolean") setStream(prev => ({ ...prev, is_live: json.is_live }));
      } catch (_) {
        const { data } = await supabase.from("live_streams").select("is_live").eq("id", stream.id).single();
        if (data && typeof data.is_live === "boolean") setStream(prev => ({ ...prev, is_live: data.is_live }));
      }
    };
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, [stream?.id, stream?.stream_uid]);

  async function loadStream() {
    const { data: streams } = await supabase.from("live_streams").select("*").order("id");
    const match = streams?.find(s => {
      const slug = s.slug || s.username || (s.channel_name || s.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
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

  useEffect(() => {
    if (!stream?.is_live || !stream?.id) return;
    const sid = Math.random().toString(36).slice(2);
    const ping = () => supabase.from("live_viewers").upsert(
      { session_id: sid, channel_id: stream.id, last_ping: new Date().toISOString() },
      { onConflict: "session_id" }
    );
    ping();
    const t = setInterval(ping, 30000);
    return () => { clearInterval(t); supabase.from("live_viewers").delete().eq("session_id", sid); };
  }, [stream?.id, stream?.is_live]);

  useEffect(() => {
    if (!stream?.id || !stream?.is_live) return;
    const t = setInterval(() => loadViewers(stream.id), 30000);
    return () => clearInterval(t);
  }, [stream?.id, stream?.is_live]);

  useEffect(() => {
    if (!stream?.is_live || !stream?.id) { setChatMessages([]); return; }
    supabase.from("stream_chat")
      .select("id, message, user_id, display_name, created_at")
      .eq("stream_id", stream.id).order("created_at", { ascending: true }).limit(200)
      .then(({ data }) => { if (data) setChatMessages(data); });
    const ch = supabase.channel(`chat-${stream.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stream_chat", filter: `stream_id=eq.${stream.id}` },
        ({ new: msg }) => {
          setChatMessages(prev => [...prev, msg]);
          setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [stream?.id, stream?.is_live]);

  async function sendChat() {
    if (!chatInput.trim() || !currentUser || chatSending) return;
    const msg = chatInput.trim();
    const banned = stream?.banned_words || [];
    if (banned.length > 0 && banned.some(w => msg.toLowerCase().includes(w.toLowerCase()))) {
      setChatInput(""); return;
    }
    setChatSending(true); setChatInput("");
    await supabase.from("stream_chat").insert({
      stream_id: stream.id, user_id: currentUser.id,
      display_name: currentUser.user_metadata?.full_name || currentUser.email?.split("@")[0] || "Viewer",
      message: msg,
    });
    setChatSending(false);
  }

  async function loadFollowers(streamId) {
    const { count } = await supabase.from("streamer_follows").select("*", { count: "exact", head: true }).eq("stream_id", streamId);
    setFollowers(count ?? 0);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data } = await supabase.from("streamer_follows").select("id").eq("stream_id", streamId).eq("follower_id", session.user.id).maybeSingle();
      setIsFollowing(!!data);
    }
  }

  async function loadViewers(streamId) {
    const cutoff = new Date(Date.now() - 90000).toISOString();
    const { count } = await supabase.from("live_viewers").select("*", { count: "exact", head: true }).eq("channel_id", streamId).gte("last_ping", cutoff);
    setViewers(count ?? 0);
  }

  async function loadSchedule(streamId) {
    const { data } = await supabase.from("stream_schedule").select("*").eq("stream_id", streamId).gte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(5);
    setSchedule(data || []);
  }

  async function loadVods(streamId, streamUid) {
    if (!streamUid) return;
    setVodsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-vods?stream_uid=${streamUid}`, {
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
      });
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
      await supabase.from("streamer_follows").delete().eq("stream_id", stream.id).eq("follower_id", session.user.id);
      setIsFollowing(false); setFollowers(f => Math.max(0, f - 1));
    } else {
      await supabase.from("streamer_follows").insert({ stream_id: stream.id, follower_id: session.user.id });
      setIsFollowing(true); setFollowers(f => f + 1);
      const actorName = session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "Someone";
      supabase.from("streamer_notifications").insert({ stream_id: stream.id, type: "follow", actor_name: actorName });
    }
    setFollowLoading(false);
  }

  // ─── Loading / not found ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#333", fontSize: 14, fontFamily: "'Space Grotesk', sans-serif" }}>Loading…</p>
      </div>
    );
  }

  if (!stream) {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", padding: "40px 16px" }}>
        <a href="/" style={{ textDecoration: "none", marginBottom: 36 }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: YELLOW }}>peep.</span>
        </a>
        <p style={{ color: "#444", fontSize: 15, margin: "0 0 20px" }}>Channel not found.</p>
        <a href="/" style={{ color: YELLOW, fontSize: 13, textDecoration: "none" }}>← Back to Peep</a>
      </div>
    );
  }

  const channelName = stream.channel_name || stream.title || "Unnamed Channel";
  const avatarLetter = channelName[0]?.toUpperCase() || "?";
  const isLive = stream.is_live && !streamEnded;

  // ─── Shared sub-components ─────────────────────────────────────────────────

  const Avatar = ({ size = 48 }) => (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg, #312e81, #6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.36), fontWeight: 700, color: "#fff", flexShrink: 0, overflow: "hidden", border: size >= 60 ? "3px solid #0a0a0a" : "none" }}>
      {stream.avatar_url ? <img src={stream.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : avatarLetter}
    </div>
  );

  const FollowBtn = ({ size = "md" }) => {
    const lg = size === "lg";
    return (
      <button onClick={toggleFollow} disabled={followLoading}
        style={{ background: isFollowing ? "rgba(255,255,255,0.06)" : YELLOW, border: isFollowing ? "1px solid #2a2a2a" : "none", borderRadius: lg ? 10 : 8, padding: lg ? "11px 28px" : "9px 20px", color: isFollowing ? "#777" : "#0a0a0a", fontSize: lg ? 15 : 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s", flexShrink: 0, fontFamily: "inherit" }}>
        {followLoading ? "…" : isFollowing ? "Following ✓" : "+ Follow"}
      </button>
    );
  };

  const ShareBtn = () => (
    <button
      onClick={() => { navigator.clipboard.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.05)", border: `1px solid ${copied ? "#facc15" : "#2a2a2a"}`, borderRadius: 8, padding: "9px 16px", color: copied ? YELLOW : "#888", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0, transition: "all 0.15s", fontFamily: "inherit" }}>
      {copied
        ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> Copied!</>
        : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> Share</>
      }
    </button>
  );

  const SupportBtn = () => stream.donation_link ? (
    <a href={stream.donation_link} target="_blank" rel="noopener noreferrer"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.05)", border: "1px solid #2a2a2a", borderRadius: 8, padding: "9px 16px", color: "#888", fontSize: 13, fontWeight: 600, textDecoration: "none", flexShrink: 0, transition: "all 0.15s" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#3a3a3a"; e.currentTarget.style.color = "#fff"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#888"; }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      Support
    </a>
  ) : null;

  // ─── VOD grid shared between live + offline ────────────────────────────────

  const VodGrid = () => (
    <div id="past-streams">
      <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: "#333", letterSpacing: "0.12em", textTransform: "uppercase" }}>Past Streams</p>
      {vodsLoading ? (
        <p style={{ color: "#333", fontSize: 13 }}>Loading…</p>
      ) : vods.length === 0 ? (
        <p style={{ color: "#222", fontSize: 13 }}>No past streams yet.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {vods.map(v => (
            <div key={v.uid}
              onClick={() => !stream.is_live && setVodPlaying({ url: v.playback?.hls, title: v.meta?.name || "Past Stream" })}
              style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 10, overflow: "hidden", cursor: stream.is_live ? "default" : "pointer", transition: "transform 0.15s, border-color 0.15s" }}
              onMouseEnter={e => { if (!stream.is_live) { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; } }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"; }}>
              <div style={{ position: "relative", aspectRatio: "16/9", background: "#090910" }}>
                {v.thumbnail
                  ? <img src={v.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.07)"><polygon points="5,3 19,12 5,21"/></svg>
                    </div>
                }
                {v.duration && (
                  <div style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.82)", borderRadius: 4, padding: "2px 7px", fontSize: 10, color: "#ddd", fontWeight: 600 }}>
                    {Math.floor(v.duration / 3600) > 0 ? `${Math.floor(v.duration / 3600)}h ` : ""}{Math.floor((v.duration % 3600) / 60)}m
                  </div>
                )}
              </div>
              <div style={{ padding: "10px 12px 13px" }}>
                <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {v.meta?.name || channelName}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "#444" }}>
                  {new Date(v.created).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>
      <style>{`
        @keyframes livepulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.3)}}
        .chat-msg:hover { background: rgba(255,255,255,0.02); }
      `}</style>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, height: 50, display: "flex", alignItems: "center", padding: "0 16px", background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)", justifyContent: "space-between" }}>
        <a href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: YELLOW }}>peep.</span>
        </a>
        <a href="/?nav=Streams" style={{ display: "flex", alignItems: "center", gap: 6, color: "#555", fontSize: 13, textDecoration: "none", transition: "color 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.color = "#888"}
          onMouseLeave={e => e.currentTarget.style.color = "#555"}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Streams
        </a>
      </nav>

      {(stream.is_live || streamEnded) ? (
        /* ══════════════ LIVE / ENDED ══════════════ */
        <>
          <style>{`
            @media (max-width: 640px) {
              .live-layout { flex-direction: column !important; height: auto !important; }
              .live-player { height: 56vw !important; }
              .live-chat { width: 100% !important; height: 340px !important; border-left: none !important; border-top: 1px solid #111; }
            }
          `}</style>
          {/* Player + Chat */}
          <div className="live-layout" style={{ display: "flex", background: "#000", height: `min(64vh, calc((100vw - ${CHAT_WIDTH}px) * 9 / 16))` }}>

            {/* Player */}
            <div className="live-player" style={{ flex: 1, minWidth: 0, position: "relative" }}>
              {streamEnded ? (
                <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#050505", position: "relative", overflow: "hidden" }}>
                  {(stream.hero_image || stream.thumbnail) && (
                    <img src={stream.hero_image || stream.thumbnail} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.1) blur(10px)", transform: "scale(1.06)" }} />
                  )}
                  <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "0 24px", textAlign: "center" }}>
                    <Avatar size={56} />
                    <div>
                      <p style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#fff" }}>{channelName}</p>
                      <p style={{ margin: 0, fontSize: 13, color: "#555" }}>Thanks for watching — the stream has ended.</p>
                    </div>
                    {vods.length > 0 && (
                      <button onClick={() => { setStreamEnded(false); document.getElementById("past-streams")?.scrollIntoView({ behavior: "smooth" }); }}
                        style={{ marginTop: 4, background: "rgba(255,255,255,0.07)", border: "1px solid #2a2a2a", borderRadius: 8, padding: "9px 22px", color: "#ccc", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                        Watch past streams
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <VideoPlayer key={stream.stream_url} url={stream.stream_url} live style={{ width: "100%", height: "100%" }} />
              )}
            </div>

            {/* Chat */}
            <div className="live-chat" style={{ width: CHAT_WIDTH, flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid #111", background: "#080808" }}>
              {/* Chat header */}
              <div style={{ padding: "0 14px", height: 44, display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #111", flexShrink: 0 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: streamEnded ? "#333" : "#ef4444", animation: streamEnded ? "none" : "livepulse 1.5s infinite", flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: streamEnded ? "#333" : "#e0e0e0", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {streamEnded ? "Stream Ended" : "Live Chat"}
                </span>
                {!streamEnded && viewers > 0 && (
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#444", fontWeight: 500 }}>{viewers.toLocaleString()} watching</span>
                )}
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "10px 0", display: "flex", flexDirection: "column", gap: 1 }}>
                {chatMessages.length === 0
                  ? <p style={{ color: "#222", fontSize: 12, margin: "auto 0", textAlign: "center" }}>No messages yet</p>
                  : chatMessages.map(m => (
                    <div key={m.id} className="chat-msg" style={{ fontSize: 13, lineHeight: 1.55, wordBreak: "break-word", padding: "3px 14px", borderRadius: 4 }}>
                      <span style={{ color: YELLOW, fontWeight: 700, marginRight: 5, fontSize: 12 }}>{m.display_name}</span>
                      <span style={{ color: "#999" }}>{m.message}</span>
                    </div>
                  ))
                }
                <div ref={chatBottomRef} />
              </div>

              {/* Input */}
              <div style={{ padding: "10px 12px", borderTop: "1px solid #111", flexShrink: 0 }}>
                {streamEnded ? (
                  <p style={{ margin: 0, textAlign: "center", color: "#2a2a2a", fontSize: 12, padding: "4px 0" }}>Chat is closed</p>
                ) : currentUser ? (
                  <div style={{ display: "flex", gap: 7 }}>
                    <input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat()}
                      placeholder="Say something…"
                      maxLength={300}
                      style={{ flex: 1, background: "#111", border: "1px solid #1a1a1a", borderRadius: 7, padding: "8px 11px", color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", minWidth: 0 }}
                    />
                    <button onClick={sendChat} disabled={!chatInput.trim() || chatSending}
                      style={{ background: chatInput.trim() ? YELLOW : "#111", border: "none", borderRadius: 7, padding: "8px 13px", color: chatInput.trim() ? "#0a0a0a" : "#333", fontSize: 12, fontWeight: 700, cursor: !chatInput.trim() || chatSending ? "not-allowed" : "pointer", flexShrink: 0, transition: "all 0.15s", fontFamily: "inherit" }}>
                      ↑
                    </button>
                  </div>
                ) : (
                  <a href="/signin" style={{ display: "block", textAlign: "center", color: "#444", fontSize: 12, textDecoration: "none", padding: "4px 0" }}>
                    <span style={{ color: YELLOW }}>Sign in</span> to chat
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Channel info bar */}
          <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid #111", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: "#0a0a0a" }}>
            <Avatar size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#fff" }}>{channelName}</h1>
                {isLive && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 5, padding: "2px 9px" }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite" }} />
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#ef4444", letterSpacing: 0.8 }}>LIVE</span>
                    {viewers > 0 && <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 600 }}>· {viewers.toLocaleString()}</span>}
                  </div>
                )}
                {streamEnded && <span style={{ fontSize: 11, color: "#444", background: "#111", border: "1px solid #1e1e1e", borderRadius: 4, padding: "2px 9px" }}>Ended</span>}
                {stream.category && stream.category !== "general" && (
                  <span style={{ fontSize: 11, color: "#555", background: "#111", border: "1px solid #1a1a1a", borderRadius: 4, padding: "2px 9px" }}>
                    {CATEGORY_LABELS[stream.category] || stream.category}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                {stream.stream_title && <span style={{ fontSize: 13, color: "#666" }}>{stream.stream_title}</span>}
                <span style={{ fontSize: 13, color: "#444" }}><strong style={{ color: "#888", fontWeight: 600 }}>{followers.toLocaleString()}</strong> followers</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
              <ShareBtn />
              <SupportBtn />
              <FollowBtn />
            </div>
          </div>

          {/* Content below player */}
          <div style={{ padding: "32px 22px 80px", maxWidth: 1200 }}>
            {schedule.length > 0 && (
              <div style={{ marginBottom: 44 }}>
                <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#333", letterSpacing: "0.12em", textTransform: "uppercase" }}>Upcoming</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {schedule.map(s => {
                    const d = new Date(s.scheduled_at);
                    return (
                      <div key={s.id} style={{ background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                        <div>
                          <p style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600, color: "#fff" }}>{s.title}</p>
                          <p style={{ margin: 0, fontSize: 12, color: "#555" }}>
                            {d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at {d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </p>
                        </div>
                        <div style={{ background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.12)", borderRadius: 6, padding: "4px 12px", fontSize: 11, color: "#a16207", fontWeight: 600 }}>Scheduled</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <VodGrid />
          </div>
        </>

      ) : (
        /* ══════════════ OFFLINE CHANNEL PAGE ══════════════ */
        <>
          {/* Banner */}
          <div style={{ position: "relative", height: "clamp(200px, 28vw, 380px)", overflow: "hidden", background: stream.hero_image ? "#0a0a0a" : "linear-gradient(135deg, #1a1730 0%, #252040 50%, #1a1730 100%)" }}>
            {stream.hero_image && (
              <img src={stream.hero_image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
            )}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0.3) 40%, rgba(10,10,10,0.1) 100%)" }} />
          </div>

          {/* Profile header — avatar overlaps banner */}
          <div style={{ padding: "0 24px 24px", borderBottom: "1px solid #111", marginTop: -44, position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
              <Avatar size={80} />
              <div style={{ display: "flex", gap: 8, paddingBottom: 4, flexShrink: 0 }}>
                <ShareBtn />
                <SupportBtn />
                <FollowBtn size="lg" />
              </div>
            </div>

            <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{channelName}</h1>
            {stream.slug && <p style={{ margin: "0 0 10px", fontSize: 13, color: "#3a3a3a" }}>/{stream.slug}</p>}

            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: stream.bio ? 14 : 0 }}>
              <span style={{ fontSize: 13, color: "#555" }}><strong style={{ color: "#888", fontWeight: 600 }}>{followers.toLocaleString()}</strong> followers</span>
              {stream.category && stream.category !== "general" && (
                <span style={{ fontSize: 12, color: "#444", background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 5, padding: "3px 10px" }}>
                  {CATEGORY_LABELS[stream.category] || stream.category}
                </span>
              )}
              <span style={{ fontSize: 12, color: "#2e2e2e", background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 5, padding: "3px 10px" }}>Offline</span>
            </div>

            {stream.bio && (
              <p style={{ margin: 0, fontSize: 14, color: "#777", lineHeight: 1.7, maxWidth: 620 }}>{stream.bio}</p>
            )}
          </div>

          {/* VOD player */}
          {vodPlaying && (
            <div style={{ position: "relative", background: "#000", borderBottom: "1px solid #111" }}>
              <VideoPlayer key={vodPlaying.url} url={vodPlaying.url} style={{ width: "100%", maxHeight: "60vh" }} />
              <button onClick={() => setVodPlaying(null)}
                style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.8)", border: "none", borderRadius: "50%", width: 34, height: 34, color: "#fff", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, backdropFilter: "blur(6px)" }}>×</button>
              {vodPlaying.title && (
                <p style={{ margin: 0, padding: "8px 18px", fontSize: 12, color: "#555", background: "#0a0a0a", borderBottom: "1px solid #111" }}>{vodPlaying.title}</p>
              )}
            </div>
          )}

          {/* Upcoming schedule */}
          {schedule.length > 0 && (
            <div style={{ padding: "28px 24px 0", borderBottom: "1px solid #111" }}>
              <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#333", letterSpacing: "0.12em", textTransform: "uppercase" }}>Upcoming</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 28 }}>
                {schedule.map(s => {
                  const d = new Date(s.scheduled_at);
                  return (
                    <div key={s.id} style={{ background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                      <div>
                        <p style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600, color: "#fff" }}>{s.title}</p>
                        <p style={{ margin: 0, fontSize: 12, color: "#555" }}>
                          {d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at {d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                      <div style={{ background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.12)", borderRadius: 6, padding: "4px 12px", fontSize: 11, color: "#a16207", fontWeight: 600 }}>Scheduled</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Past streams */}
          <div style={{ padding: "32px 24px 80px" }}>
            <VodGrid />
          </div>
        </>
      )}
    </div>
  );
}
