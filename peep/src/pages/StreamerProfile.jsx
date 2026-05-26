import { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import { supabase } from "../supabase";

const YELLOW = "#facc15";
const CHAT_WIDTH = 340;

const CATEGORY_LABELS = {
  general: "General", gaming: "Gaming", music: "Music",
  talk: "Talk", irl: "IRL", sports: "Sports",
  education: "Education", creative: "Creative",
};

function VideoPlayer({ url, style = {} }) {
  const ref = useRef(null);
  const hlsRef = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !url) return;
    if (url.includes(".m3u8")) {
      if (Hls.isSupported()) {
        const h = new Hls({ startLevel: -1, abrEwmaDefaultEstimate: 8000000, capLevelToPlayerSize: false });
        h.loadSource(url); h.attachMedia(el);
        h.on(Hls.Events.MANIFEST_PARSED, () => {
          h.currentLevel = h.levels.length - 1;
          el.play().catch(() => {});
        });
        hlsRef.current = h;
      } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
        el.src = url; el.play().catch(() => {});
      }
    } else {
      el.src = url; el.play().catch(() => {});
    }
    return () => {
      el.pause(); el.src = "";
      hlsRef.current?.destroy(); hlsRef.current = null;
    };
  }, [url]);
  return <video ref={ref} controls style={{ display: "block", background: "#000", ...style }} />;
}

export function StreamerProfile() {
  const username = window.location.pathname.replace("/stream/", "").replace(/\/$/, "").toLowerCase();

  const [stream, setStream]           = useState(null);
  const [loading, setLoading]         = useState(true);
  const [vodPlaying, setVodPlaying]   = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followers, setFollowers]     = useState(0);
  const [viewers, setViewers]         = useState(0);
  const [vods, setVods]               = useState([]);
  const [vodsLoading, setVodsLoading] = useState(false);
  const [schedule, setSchedule]       = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput]     = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [streamEnded, setStreamEnded] = useState(false);
  const chatBottomRef = useRef(null);
  const prevIsLiveRef = useRef(null);

  useEffect(() => {
    loadStream();
    supabase.auth.getSession().then(({ data: { session } }) => setCurrentUser(session?.user ?? null));
  }, []);

  // Detect live → offline transition via ref (avoids calling setState inside updater)
  useEffect(() => {
    if (stream === null) return;
    if (prevIsLiveRef.current === true && stream.is_live === false) {
      setStreamEnded(true);
    }
    prevIsLiveRef.current = stream.is_live;
  }, [stream?.is_live]);

  // Realtime: update stream record when is_live or other fields change
  useEffect(() => {
    if (!stream?.id) return;
    const ch = supabase.channel(`stream-status-${stream.id}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "live_streams",
        filter: `id=eq.${stream.id}`,
      }, ({ new: updated }) => {
        setStream(prev => ({ ...prev, ...updated }));
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [stream?.id]);

  // Polling fallback — if Realtime misses the update, catch it here
  useEffect(() => {
    if (!stream?.id || !stream?.is_live) return;
    const t = setInterval(async () => {
      const { data } = await supabase.from("live_streams").select("is_live").eq("id", stream.id).single();
      if (data && data.is_live === false) {
        setStream(prev => ({ ...prev, is_live: false }));
      }
    }, 10000);
    return () => clearInterval(t);
  }, [stream?.id, stream?.is_live]);

  async function loadStream() {
    const { data: streams } = await supabase.from("live_streams").select("*").order("id");
    const match = streams?.find(s => {
      const slug = s.username || (s.channel_name || s.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
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

  // Heartbeat — count everyone viewing the page while live
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

  // Refresh viewer count
  useEffect(() => {
    if (!stream?.id || !stream?.is_live) return;
    const t = setInterval(() => loadViewers(stream.id), 30000);
    return () => clearInterval(t);
  }, [stream?.id, stream?.is_live]);

  // Chat subscription
  useEffect(() => {
    if (!stream?.is_live || !stream?.id) { setChatMessages([]); return; }
    supabase.from("stream_chat")
      .select("id, message, user_id, display_name, created_at")
      .eq("stream_id", stream.id)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => { if (data) setChatMessages(data); });
    const ch = supabase.channel(`chat-${stream.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stream_chat", filter: `stream_id=eq.${stream.id}` },
        ({ new: msg }) => {
          setChatMessages(prev => [...prev, msg]);
          setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      ).subscribe();
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
    const { count } = await supabase.from("streamer_follows")
      .select("*", { count: "exact", head: true }).eq("stream_id", streamId);
    setFollowers(count ?? 0);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data } = await supabase.from("streamer_follows").select("id")
        .eq("stream_id", streamId).eq("follower_id", session.user.id).maybeSingle();
      setIsFollowing(!!data);
    }
  }

  async function loadViewers(streamId) {
    const cutoff = new Date(Date.now() - 90000).toISOString();
    const { count } = await supabase.from("live_viewers")
      .select("*", { count: "exact", head: true })
      .eq("channel_id", streamId).gte("last_ping", cutoff);
    setViewers(count ?? 0);
  }

  async function loadSchedule(streamId) {
    const { data } = await supabase.from("stream_schedule").select("*")
      .eq("stream_id", streamId).gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at").limit(5);
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
      await supabase.from("streamer_follows").delete()
        .eq("stream_id", stream.id).eq("follower_id", session.user.id);
      setIsFollowing(false); setFollowers(f => Math.max(0, f - 1));
    } else {
      await supabase.from("streamer_follows").insert({ stream_id: stream.id, follower_id: session.user.id });
      setIsFollowing(true); setFollowers(f => f + 1);
    }
    setFollowLoading(false);
  }

  if (loading) {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#555", fontSize: 14, fontFamily: "'Space Grotesk', sans-serif" }}>Loading…</p>
      </div>
    );
  }

  if (!stream) {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", padding: "40px 16px" }}>
        <a href="/" style={{ textDecoration: "none", marginBottom: 32 }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: YELLOW }}>peep.</span>
        </a>
        <p style={{ color: "#555", fontSize: 15 }}>Streamer not found.</p>
        <a href="/" style={{ marginTop: 20, color: YELLOW, fontSize: 13, textDecoration: "none" }}>← Back to Peep</a>
      </div>
    );
  }

  const channelName = stream.channel_name || stream.title;
  const avatarLetter = channelName[0]?.toUpperCase() || "?";

  const FollowBtn = () => (
    <button onClick={toggleFollow} disabled={followLoading}
      style={{ background: isFollowing ? "rgba(255,255,255,0.06)" : YELLOW, border: isFollowing ? "1px solid #282828" : "none", borderRadius: 8, padding: "9px 22px", color: isFollowing ? "#888" : "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.15s", flexShrink: 0 }}>
      {followLoading ? "…" : isFollowing ? "Following" : "+ Follow"}
    </button>
  );

  const DonateBtn = () => stream.donation_link ? (
    <a href={stream.donation_link} target="_blank" rel="noopener noreferrer"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.05)", border: "1px solid #282828", borderRadius: 8, padding: "9px 18px", color: "#aaa", fontSize: 14, fontWeight: 600, textDecoration: "none", flexShrink: 0, transition: "all 0.15s" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#3a3a3a"; e.currentTarget.style.color = "#fff"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#282828"; e.currentTarget.style.color = "#aaa"; }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      Support
    </a>
  ) : null;

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>
      <style>{`@keyframes livepulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.3)}}`}</style>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, height: 52, display: "flex", alignItems: "center", padding: "0 18px", background: "#0a0a0a", borderBottom: "1px solid #1a1a1a", justifyContent: "space-between" }}>
        <a href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: YELLOW }}>peep.</span>
        </a>
        <a href="/?nav=Streams" style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>← Streams</a>
      </nav>

      {(stream.is_live || streamEnded) ? (
        /* ── LIVE / ENDED LAYOUT ── */
        <>
          {/* Player + Chat side by side */}
          <div style={{ display: "flex", background: "#000", borderBottom: "1px solid #1a1a1a" }}>
            {/* Video or "stream ended" */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {streamEnded ? (
                <div style={{ width: "100%", aspectRatio: "16/9", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#050505", gap: 12, padding: "0 24px", textAlign: "center", position: "relative", overflow: "hidden" }}>
                  {(stream.hero_image || stream.thumbnail) && (
                    <img src={stream.hero_image || stream.thumbnail} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.12) blur(8px)", transform: "scale(1.05)" }} />
                  )}
                  <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #312e81, #6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#fff" }}>
                      {channelName[0]?.toUpperCase()}
                    </div>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff" }}>{channelName}</p>
                    <p style={{ margin: 0, fontSize: 13, color: "#666" }}>Thanks for watching — the stream has ended.</p>
                    {vods.length > 0 && (
                      <button onClick={() => { setStreamEnded(false); document.getElementById("past-streams")?.scrollIntoView({ behavior: "smooth" }); }}
                        style={{ marginTop: 4, background: "rgba(255,255,255,0.07)", border: "1px solid #2a2a2a", borderRadius: 8, padding: "8px 20px", color: "#ccc", fontSize: 13, cursor: "pointer" }}>
                        Watch past streams
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <VideoPlayer
                  key={stream.stream_url}
                  url={stream.stream_url}
                  style={{ width: "100%", aspectRatio: "16/9" }}
                />
              )}
            </div>

            {/* Chat sidebar */}
            <div style={{ width: CHAT_WIDTH, flexShrink: 0, display: "flex", flexDirection: "column", borderLeft: "1px solid #1a1a1a", background: "#0d0d0d" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: streamEnded ? "#444" : "#ef4444", animation: streamEnded ? "none" : "livepulse 1.5s infinite", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: streamEnded ? "#444" : "#fff", letterSpacing: 0.5 }}>{streamEnded ? "STREAM ENDED" : "LIVE CHAT"}</span>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
                {chatMessages.length === 0
                  ? <p style={{ color: "#282828", fontSize: 12, margin: "auto 0", textAlign: "center" }}>No messages yet</p>
                  : chatMessages.map(m => (
                    <div key={m.id} style={{ fontSize: 13, lineHeight: 1.55, wordBreak: "break-word" }}>
                      <span style={{ color: YELLOW, fontWeight: 600, marginRight: 5 }}>{m.display_name}:</span>
                      <span style={{ color: "#ccc" }}>{m.message}</span>
                    </div>
                  ))
                }
                <div ref={chatBottomRef} />
              </div>

              <div style={{ padding: "10px 12px", borderTop: "1px solid #1a1a1a" }}>
                {streamEnded ? (
                  <p style={{ margin: 0, textAlign: "center", color: "#333", fontSize: 12, padding: "4px 0" }}>Chat is closed</p>
                ) : currentUser ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat()}
                      placeholder="Say something…"
                      maxLength={300}
                      style={{ flex: 1, background: "#111", border: "1px solid #1e1e1e", borderRadius: 6, padding: "8px 10px", color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", minWidth: 0 }}
                    />
                    <button onClick={sendChat} disabled={!chatInput.trim() || chatSending}
                      style={{ background: YELLOW, border: "none", borderRadius: 6, padding: "8px 12px", color: "#0a0a0a", fontSize: 12, fontWeight: 700, cursor: !chatInput.trim() || chatSending ? "not-allowed" : "pointer", opacity: !chatInput.trim() || chatSending ? 0.5 : 1, flexShrink: 0 }}>
                      Send
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
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: "linear-gradient(135deg, #312e81, #6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
              {avatarLetter}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff" }}>{channelName}</h1>
                {stream.category && stream.category !== "general" && (
                  <span style={{ fontSize: 11, color: "#666", background: "#111", border: "1px solid #1e1e1e", borderRadius: 4, padding: "2px 8px" }}>
                    {CATEGORY_LABELS[stream.category] || stream.category}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {stream.stream_title && (
                  <span style={{ fontSize: 13, color: "#888" }}>{stream.stream_title}</span>
                )}
                <span style={{ fontSize: 13, color: "#555" }}>
                  <strong style={{ color: "#ddd" }}>{followers.toLocaleString()}</strong> followers
                </span>
                {!streamEnded && viewers > 0 && (
                  <span style={{ fontSize: 13, color: "#555" }}>
                    <strong style={{ color: "#ef4444" }}>{viewers.toLocaleString()}</strong> watching
                  </span>
                )}
                {streamEnded && (
                  <span style={{ fontSize: 12, color: "#444", background: "#111", border: "1px solid #1e1e1e", borderRadius: 4, padding: "2px 8px" }}>Stream ended</span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <DonateBtn />
              <FollowBtn />
            </div>
          </div>
        </>
      ) : (
        /* ── OFFLINE LAYOUT ── */
        <>
          {/* Hero — only render if there's an actual image */}
          {(stream.hero_image || stream.thumbnail) && (
            <div style={{ position: "relative", height: "clamp(140px, 18vw, 220px)", background: "#0e0e0e", overflow: "hidden", borderBottom: "1px solid #1a1a1a" }}>
              <img src={stream.hero_image || stream.thumbnail} alt=""
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.3)" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0a0a0a 0%, transparent 70%)" }} />
            </div>
          )}

          {/* Channel info */}
          <div style={{ padding: "18px 22px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", position: "relative", zIndex: 2 }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #312e81, #6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#fff", flexShrink: 0, border: "3px solid #0a0a0a" }}>
              {avatarLetter}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#fff" }}>{channelName}</h1>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: stream.bio ? 8 : 0 }}>
                <span style={{ fontSize: 13, color: "#555" }}>
                  <strong style={{ color: "#ddd" }}>{followers.toLocaleString()}</strong> followers
                </span>
                {stream.category && stream.category !== "general" && (
                  <span style={{ fontSize: 13, color: "#555" }}>{CATEGORY_LABELS[stream.category] || stream.category}</span>
                )}
                <span style={{ fontSize: 13, color: "#333" }}>Offline</span>
              </div>
              {stream.bio && (
                <p style={{ margin: 0, fontSize: 13, color: "#666", lineHeight: 1.6, maxWidth: 560 }}>{stream.bio}</p>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0, alignSelf: "flex-start" }}>
              <DonateBtn />
              <FollowBtn />
            </div>
          </div>
        </>
      )}

      {/* VOD player (offline only) */}
      {vodPlaying && !stream.is_live && (
        <div style={{ position: "relative", background: "#000", borderBottom: "1px solid #1a1a1a" }}>
          <VideoPlayer key={vodPlaying.url} url={vodPlaying.url} style={{ width: "100%", maxHeight: "60vh" }} />
          <button onClick={() => setVodPlaying(null)}
            style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.75)", border: "none", borderRadius: "50%", width: 32, height: 32, color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>×</button>
          {vodPlaying.title && (
            <p style={{ margin: 0, padding: "8px 16px", fontSize: 12, color: "#555", background: "#0a0a0a", borderBottom: "1px solid #1a1a1a" }}>{vodPlaying.title}</p>
          )}
        </div>
      )}

      {/* Content */}
      <div style={{ padding: "28px 22px 80px" }}>

        {/* Upcoming schedule */}
        {schedule.length > 0 && (
          <div style={{ marginBottom: 44 }}>
            <p style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, color: "#333", letterSpacing: "0.12em", textTransform: "uppercase" }}>Upcoming</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {schedule.map(s => {
                const d = new Date(s.scheduled_at);
                return (
                  <div key={s.id} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div>
                      <p style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600, color: "#fff" }}>{s.title}</p>
                      <p style={{ margin: 0, fontSize: 12, color: "#555" }}>
                        {d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at {d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                    <div style={{ background: "rgba(250,204,21,0.07)", border: "1px solid rgba(250,204,21,0.15)", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#a16207", fontWeight: 600 }}>Scheduled</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Past streams */}
        <div id="past-streams">
          <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#333", letterSpacing: "0.12em", textTransform: "uppercase" }}>Past Streams</p>
          {vodsLoading ? (
            <p style={{ color: "#333", fontSize: 13 }}>Loading…</p>
          ) : vods.length === 0 ? (
            <p style={{ color: "#222", fontSize: 13 }}>No past streams yet.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
              {vods.map(v => (
                <div key={v.uid}
                  onClick={() => !stream.is_live && setVodPlaying({ url: v.playback?.hls, title: v.meta?.name || "Past Stream" })}
                  style={{ background: "#0e0e11", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, overflow: "hidden", cursor: stream.is_live ? "default" : "pointer", transition: "transform 0.15s" }}
                  onMouseEnter={e => { if (!stream.is_live) e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
                  <div style={{ position: "relative", aspectRatio: "16/9", background: "#090910" }}>
                    {v.thumbnail
                      ? <img src={v.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.08)"><polygon points="5,3 19,12 5,21" /></svg>
                        </div>
                    }
                    {v.duration && (
                      <div style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.8)", borderRadius: 4, padding: "2px 6px", fontSize: 10, color: "#fff", fontWeight: 600 }}>
                        {Math.floor(v.duration / 3600) > 0 ? `${Math.floor(v.duration / 3600)}h ` : ""}{Math.floor((v.duration % 3600) / 60)}m
                      </div>
                    )}
                  </div>
                  <div style={{ padding: "10px 12px 12px" }}>
                    <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {stream.stream_title || channelName}
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
      </div>
    </div>
  );
}
