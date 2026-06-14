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

function VideoPlayer({ url, live = false, viewers = 0, style = {} }) {
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
    const h = new Hls({
      enableWorker: true,
      // Buffer — large enough to ride out slow segments without stalling
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      backBufferLength: 0,           // no need to keep past segments in memory for live
      // Live sync — stay ~3 segments behind live edge (~6s on 2s segments).
      // Do NOT use lowLatencyMode; Cloudflare Stream is standard HLS, not LL-HLS.
      lowLatencyMode: false,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10, // allow up to ~20s behind before catch-up
      // Quality — let hls.js pick the best level automatically
      startLevel: -1,
      capLevelToPlayerSize: true,
      // Resilience — retry failed segment/manifest fetches aggressively
      fragLoadingMaxRetry: 6,
      fragLoadingRetryDelay: 1000,
      manifestLoadingMaxRetry: 4,
      levelLoadingMaxRetry: 4,
    });
    h.loadSource(src); h.attachMedia(el);
    h.on(Hls.Events.MANIFEST_PARSED, () => {
      if (!alive.current) return;
      setStarting(false);
      el.play().catch(() => setShowPlay(true));
    });
    h.on(Hls.Events.ERROR, (_, d) => {
      if (!alive.current) return;
      if (d.fatal) {
        h.destroy();
        setStarting(true);
        retryTimer.current = setTimeout(() => attachHls(el, src, attempt + 1), Math.min(4000 + attempt * 2000, 12000));
      } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
        // Non-fatal media errors (buffer stalls, codec glitches) — try to recover in place
        h.recoverMediaError();
      }
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
        <video ref={ref} controls controlsList="nodownload" playsInline style={{ display: "block", width: "100%", height: "100%", background: "#000" }} />
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
          {viewers > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.55)", borderRadius: 4, padding: "3px 8px", backdropFilter: "blur(4px)", flexShrink: 0 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{viewers.toLocaleString()}</span>
            </div>
          )}
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

// Hard-blocked terms — always filtered regardless of channel settings
const HARD_BLOCKED = ["cp", "childporn", "child porn", "loli", "pedo", "jailbait", "underage nude", "minor nude", "csam"];

export function StreamerProfile() {
  const username = window.location.pathname.replace("/stream/", "").replace(/\/$/, "").toLowerCase();

  const [stream, setStream]               = useState(null);
  const [loading, setLoading]             = useState(true);
  const [vodPlaying, setVodPlaying]       = useState(null);
  const [vodExpanded, setVodExpanded]     = useState(false);
  const [comments, setComments]           = useState([]);
  const [commentInput, setCommentInput]   = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [userProfile, setUserProfile]     = useState(null);
  const [isFollowing, setIsFollowing]     = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followers, setFollowers]         = useState(0);
  const [viewers, setViewers]             = useState(0);
  const [vods, setVods]                   = useState([]);
  const [channelVideos, setChannelVideos] = useState([]);
  const [vodsLoading, setVodsLoading]     = useState(false);
  const [schedule, setSchedule]           = useState([]);
  const [currentUser, setCurrentUser]     = useState(null);
  const [chatMessages, setChatMessages]   = useState([]);
  const [chatInput, setChatInput]         = useState("");
  const [chatSending, setChatSending]     = useState(false);
  const [streamEnded, setStreamEnded]     = useState(false);
  const [copied, setCopied]               = useState(false);
  const [globalBanned, setGlobalBanned]   = useState([]);
  const [reportOpen, setReportOpen]       = useState(false);
  const [reportReason, setReportReason]   = useState("");
  const [reportSent, setReportSent]       = useState(false);
  const chatBottomRef = useRef(null);
  const commentsEndRef = useRef(null);
  const prevIsLiveRef = useRef(null);

  useEffect(() => {
    loadStream();
    supabase.auth.getSession().then(({ data: { session } }) => setCurrentUser(session?.user ?? null));
    supabase.from("app_settings").select("value").eq("key", "global_banned_words").maybeSingle()
      .then(({ data }) => { if (data?.value) { try { setGlobalBanned(JSON.parse(data.value)); } catch {} } });
  }, []);

  useEffect(() => {
    if (stream === null) return;
    if (prevIsLiveRef.current === true && stream.is_live === false) setStreamEnded(true);
    prevIsLiveRef.current = stream.is_live;
  }, [stream?.is_live]);

  useEffect(() => {
    if (!currentUser) { setUserProfile(null); return; }
    supabase.from("profiles").select("username, full_name, avatar_url").eq("id", currentUser.id).maybeSingle()
      .then(({ data }) => setUserProfile(data ?? null));
  }, [currentUser?.id]);

  useEffect(() => {
    if (!vodPlaying?.uid) { setComments([]); return; }
    loadComments(vodPlaying.uid);
  }, [vodPlaying?.uid]);

  async function loadComments(uid) {
    setCommentsLoading(true);
    const { data } = await supabase.from("vod_comments").select("*").eq("vod_uid", uid).order("created_at", { ascending: true }).limit(100);
    setComments(data || []);
    setCommentsLoading(false);
  }

  async function postComment() {
    if (!commentInput.trim() || !currentUser || postingComment || !vodPlaying?.uid) return;
    setPostingComment(true);
    const displayName = userProfile?.username || userProfile?.full_name || currentUser.user_metadata?.full_name || currentUser.email?.split("@")[0] || "Viewer";
    const { data, error } = await supabase.from("vod_comments").insert({
      vod_uid: vodPlaying.uid,
      stream_id: stream.id,
      user_id: currentUser.id,
      username: displayName,
      avatar_url: userProfile?.avatar_url || null,
      body: commentInput.trim(),
    }).select().single();
    if (!error && data) {
      setComments(c => [...c, data]);
      setCommentInput("");
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
    setPostingComment(false);
  }

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
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-live-status?stream_uid=${stream.stream_uid}&stream_id=${stream.id}`);
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
    try {
      const { data: streams } = await supabase.from("live_streams").select("*").order("id");
      const match = streams?.find(s => {
        const slug = s.slug || s.username || (s.channel_name || s.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        return slug === username;
      });
      setStream(match ?? null);
      if (match) {
        loadFollowers(match.id);
        loadViewers(match.id);
        loadSchedule(match.id);
        loadVods(match.id, match.stream_uid, match.previous_stream_uids || []);
        supabase.from("streamer_videos").select("*").eq("stream_id", match.id).order("created_at", { ascending: false })
          .then(({ data }) => setChannelVideos(data || []));
      }
    } catch (_) {
      setStream(null);
    } finally {
      setLoading(false);
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
    supabase.from("live_chat")
      .select("id, message, user_id, profile_name, created_at")
      .eq("channel_id", stream.id).order("created_at", { ascending: true }).limit(200)
      .then(({ data }) => { if (data) setChatMessages(data); });
    const ch = supabase.channel(`chat-${stream.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_chat", filter: `channel_id=eq.${stream.id}` },
        ({ new: msg }) => {
          setChatMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [stream?.id, stream?.is_live]);

  async function sendChat() {
    if (!chatInput.trim() || !currentUser || chatSending) return;
    const msg = chatInput.trim();
    const lower = msg.toLowerCase().replace(/\s+/g, " ");
    const allBanned = [...HARD_BLOCKED, ...globalBanned, ...(stream?.banned_words || [])];
    if (allBanned.some(w => lower.includes(w.toLowerCase()))) {
      setChatInput(""); return;
    }
    setChatSending(true); setChatInput("");
    const { data } = await supabase.from("live_chat").insert({
      channel_id: stream.id, user_id: currentUser.id,
      profile_name: currentUser.user_metadata?.full_name || currentUser.email?.split("@")[0] || "Viewer",
      message: msg,
    }).select().single();
    if (data) {
      setChatMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data]);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
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

  async function loadVods(streamId, streamUid, previousUids = []) {
    if (!streamUid) return;
    setVodsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
      const prevParam = previousUids.length ? `&previous_uids=${previousUids.join(",")}` : "";
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-vods?stream_uid=${streamUid}${prevParam}`, {
        headers: { "Authorization": `Bearer ${token}` },
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
        <div style={{ width: 28, height: 28, border: "2px solid #222", borderTopColor: "#facc15", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!stream) {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", padding: "40px 16px" }}>
        <a href="/" style={{ textDecoration: "none", marginBottom: 36 }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: YELLOW }}>peep.</span>
        </a>
        <p style={{ color: "#aaa", fontSize: 15, margin: "0 0 20px" }}>Channel not found.</p>
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

  async function submitReport() {
    if (!reportReason.trim()) return;
    const slug = stream.username || (stream.channel_name || stream.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    await supabase.from("content_reports").insert({
      reporter_id: currentUser?.id ?? null,
      content_type: "stream",
      content_id: slug,
      channel_name: stream.channel_name || stream.title,
      reason: reportReason.trim(),
      status: "pending",
    });
    setReportSent(true);
    setTimeout(() => { setReportOpen(false); setReportSent(false); setReportReason(""); }, 2000);
  }

  const ReportBtn = () => (
    <button onClick={() => setReportOpen(true)}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.04)", border: "1px solid #2a2a2a", borderRadius: 8, padding: "9px 14px", color: "#555", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0, fontFamily: "inherit" }}
      title="Report this stream">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
      Report
    </button>
  );

  const ReportModal = () => reportOpen ? (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000 }} onClick={e => { if (e.target === e.currentTarget) setReportOpen(false); }}>
      <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: 28, width: "min(400px, 90vw)", fontFamily: "inherit" }}>
        {reportSent ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>✓</div>
            <p style={{ color: "#fff", fontWeight: 700, margin: "0 0 6px" }}>Report submitted</p>
            <p style={{ color: "#555", fontSize: 13, margin: 0 }}>Our moderation team will review it.</p>
          </div>
        ) : (
          <>
            <p style={{ margin: "0 0 16px", fontWeight: 700, color: "#fff", fontSize: 16 }}>Report Stream</p>
            <p style={{ margin: "0 0 14px", color: "#666", fontSize: 13 }}>What's the issue with this stream?</p>
            {["Illegal content (CSAM / exploitation)", "Violence or graphic content", "Hate speech or harassment", "Spam or scam", "Other"].map(r => (
              <label key={r} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", cursor: "pointer", borderBottom: "1px solid #1a1a1a" }}>
                <input type="radio" name="report" value={r} checked={reportReason === r} onChange={() => setReportReason(r)} style={{ accentColor: "#ef4444" }} />
                <span style={{ fontSize: 13, color: reportReason === r ? "#fff" : "#888" }}>{r}</span>
              </label>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button onClick={submitReport} disabled={!reportReason} style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: 9, padding: "10px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: !reportReason ? 0.4 : 1 }}>Submit Report</button>
              <button onClick={() => setReportOpen(false)} style={{ background: "transparent", border: "1px solid #2a2a2a", borderRadius: 9, padding: "10px 16px", color: "#555", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  const SupportBtn = () => stream.donation_link ? (
    <a href={stream.donation_link} target="_blank" rel="noopener noreferrer"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#facc15", border: "none", borderRadius: 8, padding: "9px 16px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, textDecoration: "none", flexShrink: 0, transition: "background 0.15s" }}
      onMouseEnter={e => { e.currentTarget.style.background = "#fde047"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "#facc15"; }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      Support
    </a>
  ) : null;

  const socialLinks = [
    { key: "twitter_url", label: "Twitter", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
    { key: "youtube_url", label: "YouTube", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> },
    { key: "tiktok_url", label: "TikTok", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg> },
    { key: "discord_url", label: "Discord", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.102 18.08.114 18.1.134 18.11a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg> },
    { key: "instagram_url", label: "Instagram", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg> },
  ].filter(({ key }) => stream[key]);

  const SocialLinksRow = () => socialLinks.length === 0 ? null : (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {socialLinks.map(({ key, label, icon }) => (
        <a key={key} href={stream[key]} target="_blank" rel="noopener noreferrer" title={label}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid #2a2a2a", color: "#666", textDecoration: "none", transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#ccc"; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#666"; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}>
          {icon}
        </a>
      ))}
    </div>
  );

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
          {vods.map(v => {
            const metaName = v.meta?.name || "";
            const isAutoGenerated = !metaName || /peep live/i.test(metaName);
            const vodTitle = isAutoGenerated
              ? (stream?.stream_title || new Date(v.created).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }))
              : metaName;
            return (
            <div key={v.uid}
              onClick={() => !stream.is_live && setVodPlaying({ url: v.playback?.hls, title: vodTitle, uid: v.uid })}
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
                  {vodTitle}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: "#444" }}>
                  {new Date(v.created).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>
      <ReportModal />
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
              .live-player { height: 56.25vw !important; }
              .mobile-channel-strip { display: flex !important; }
              .live-chat {
                width: 100% !important;
                height: calc(100svh - 50px - 56.25vw - 46px) !important;
                min-height: 240px !important;
                border-left: none !important;
                border-top: none !important;
              }
              .live-channel-bar { display: none !important; }
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
                <VideoPlayer key={stream.stream_url} url={stream.stream_url} live viewers={viewers} style={{ width: "100%", height: "100%" }} />
              )}
            </div>

            {/* Mobile-only compact channel strip — shown between player and chat on mobile */}
            <div className="mobile-channel-strip" style={{ display: "none", alignItems: "center", gap: 10, padding: "6px 12px 6px 14px", background: "#0a0a0a", borderBottom: "1px solid #111", flexShrink: 0 }}>
              <Avatar size={30} />
              <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 7, overflow: "hidden" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{channelName}</span>
                {isLive && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 4, padding: "2px 7px", flexShrink: 0 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite" }} />
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#ef4444", letterSpacing: 0.8 }}>LIVE</span>
                  </div>
                )}
                {isLive && viewers > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#111", border: "1px solid #222", borderRadius: 4, padding: "2px 7px", flexShrink: 0 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#888" }}>{viewers.toLocaleString()}</span>
                  </div>
                )}
              </div>
              <FollowBtn />
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
                      <span style={{ color: YELLOW, fontWeight: 700, marginRight: 5, fontSize: 12 }}>{m.profile_name}</span>
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
          <div className="live-channel-bar" style={{ padding: "16px 20px 14px", borderBottom: "1px solid #111", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: "#0a0a0a" }}>
            <Avatar size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#fff" }}>{channelName}</h1>
                {isLive && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 5, padding: "2px 9px" }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite" }} />
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#ef4444", letterSpacing: 0.8 }}>LIVE</span>
                  </div>
                )}
                {isLive && viewers > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#111", border: "1px solid #222", borderRadius: 5, padding: "3px 9px" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#aaa" }}>{viewers.toLocaleString()}</span>
                  </div>
                )}
                {streamEnded && <span style={{ fontSize: 11, color: "#444", background: "#111", border: "1px solid #1e1e1e", borderRadius: 4, padding: "2px 9px" }}>Ended</span>}
                {stream.category && stream.category !== "general" && (
                  <span style={{ fontSize: 11, color: "#555", background: "#111", border: "1px solid #1a1a1a", borderRadius: 4, padding: "2px 9px" }}>
                    {CATEGORY_LABELS[stream.category] || stream.category}
                  </span>
                )}
              </div>
              <div className="channel-sub-row" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                {stream.stream_title && <span style={{ fontSize: 13, color: "#666" }}>{stream.stream_title}</span>}
                <span style={{ fontSize: 13, color: "#444" }}><strong style={{ color: "#888", fontWeight: 600 }}>{followers.toLocaleString()}</strong> followers</span>
              </div>
              {socialLinks.length > 0 && <div style={{ marginTop: 6 }}><SocialLinksRow /></div>}
            </div>
            <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
              <ShareBtn />
              <SupportBtn />
              <ReportBtn />
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
            {channelVideos.length > 0 && (
              <div style={{ marginTop: 44 }}>
                <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: "#333", letterSpacing: "0.12em", textTransform: "uppercase" }}>Videos</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
                  {channelVideos.map(v => (
                    <div key={v.id} style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ position: "relative", aspectRatio: "16/9", background: "#090910" }}>
                        {v.thumbnail_url ? <img src={v.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.07)"><polygon points="5,3 19,12 5,21"/></svg></div>}
                      </div>
                      <div style={{ padding: "10px 12px" }}>
                        <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.title}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "#333" }}>{new Date(v.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                <ReportBtn />
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
              <p style={{ margin: "0 0 14px", fontSize: 14, color: "#777", lineHeight: 1.7, maxWidth: 620 }}>{stream.bio}</p>
            )}
            <SocialLinksRow />
          </div>

          {/* Inline VOD player + comments */}
          {vodPlaying && (
            <div style={{ borderBottom: "1px solid #111" }}>
              {/* Fullscreen overlay */}
              {vodExpanded && (
                <div onClick={() => setVodExpanded(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                  <div onClick={e => e.stopPropagation()} style={{ width: "min(900px, calc(100vw - 48px))", background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.9)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid #1e1e1e" }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>{vodPlaying.title || "Past Stream"}</p>
                      <button onClick={() => setVodExpanded(false)} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 5, width: 28, height: 28, color: "#aaa", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                    </div>
                    <VideoPlayer key={vodPlaying.url + "-fs"} url={vodPlaying.url} style={{ width: "100%", aspectRatio: "16/9" }} />
                  </div>
                </div>
              )}

              {/* Inline player */}
              <div style={{ padding: "20px 24px 0" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 12 }}>{vodPlaying.title || "Past Stream"}</p>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setVodExpanded(true)} title="Fullscreen" style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 6, width: 28, height: 28, color: "#777", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                    </button>
                    <button onClick={() => { setVodPlaying(null); setComments([]); }} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 6, width: 28, height: 28, color: "#777", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                </div>
                <div style={{ borderRadius: 12, overflow: "hidden", background: "#000", aspectRatio: "16/9", maxHeight: "60vh" }}>
                  <VideoPlayer key={vodPlaying.url} url={vodPlaying.url} style={{ width: "100%", height: "100%" }} />
                </div>
              </div>

              {/* Comments */}
              <div style={{ padding: "24px 24px 32px" }}>
                <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: "#333", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  Comments{comments.length > 0 ? ` (${comments.length})` : ""}
                </p>

                {currentUser ? (
                  <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                    <input
                      value={commentInput}
                      onChange={e => setCommentInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && postComment()}
                      placeholder="Add a comment…"
                      maxLength={500}
                      style={{ flex: 1, background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 9, padding: "10px 13px", color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                    />
                    <button onClick={postComment} disabled={postingComment || !commentInput.trim()}
                      style={{ background: "#facc15", border: "none", borderRadius: 9, padding: "0 18px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: postingComment || !commentInput.trim() ? 0.4 : 1, flexShrink: 0 }}>
                      {postingComment ? "…" : "Post"}
                    </button>
                  </div>
                ) : (
                  <p style={{ margin: "0 0 20px", fontSize: 13, color: "#444" }}>
                    <a href="/signin" style={{ color: "#facc15", textDecoration: "none" }}>Sign in</a> to comment.
                  </p>
                )}

                {commentsLoading ? (
                  <p style={{ color: "#333", fontSize: 13 }}>Loading…</p>
                ) : comments.length === 0 ? (
                  <p style={{ color: "#2a2a2a", fontSize: 13 }}>No comments yet. Be the first.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {comments.map(c => (
                      <div key={c.id} style={{ display: "flex", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #1e1b4b, #4c1d95)", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>
                          {c.avatar_url ? <img src={c.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (c.username || "?")[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#ccc" }}>{c.username}</span>
                            <span style={{ fontSize: 11, color: "#2a2a2a" }}>
                              {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: 14, color: "#777", lineHeight: 1.6, wordBreak: "break-word" }}>{c.body}</p>
                        </div>
                        {currentUser?.id === c.user_id && (
                          <button
                            onClick={async () => { await supabase.from("vod_comments").delete().eq("id", c.id); setComments(prev => prev.filter(x => x.id !== c.id)); }}
                            style={{ background: "none", border: "none", color: "#2a2a2a", cursor: "pointer", fontSize: 18, flexShrink: 0, alignSelf: "flex-start", lineHeight: 1, padding: "0 4px" }}
                            title="Delete">×</button>
                        )}
                      </div>
                    ))}
                    <div ref={commentsEndRef} />
                  </div>
                )}
              </div>
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

          {/* Uploaded Videos */}
          {channelVideos.length > 0 && (
            <div style={{ padding: "32px 24px 0" }}>
              <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: "#333", letterSpacing: "0.12em", textTransform: "uppercase" }}>Videos</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
                {channelVideos.map(v => (
                  <div key={v.id}
                    onClick={() => setVodPlaying({ url: v.hls_url, title: v.title, uid: v.cloudflare_uid })}
                    style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 10, overflow: "hidden", cursor: "pointer", transition: "transform 0.15s, border-color 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"; }}>
                    <div style={{ position: "relative", aspectRatio: "16/9", background: "#090910" }}>
                      {v.thumbnail_url
                        ? <img src={v.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.07)"><polygon points="5,3 19,12 5,21"/></svg>
                          </div>
                      }
                    </div>
                    <div style={{ padding: "10px 12px" }}>
                      <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 600, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.title}</p>
                      {v.description && <p style={{ margin: "0 0 3px", fontSize: 12, color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.description}</p>}
                      <p style={{ margin: 0, fontSize: 11, color: "#2a2a2a" }}>{new Date(v.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                    </div>
                  </div>
                ))}
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
