import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";

const BG = "#0a0a0a";
const YELLOW = "#facc15";
const BORDER = "#1e1e1e";
const CARD = "#111";
const RTMP_BASE = "rtmps://live.cloudflare.com:443/live/";

const CATEGORIES = [
  { value: "general",   label: "General" },
  { value: "gaming",    label: "Gaming" },
  { value: "music",     label: "Music" },
  { value: "talk",      label: "Talk / Podcast" },
  { value: "irl",       label: "IRL" },
  { value: "sports",    label: "Sports" },
  { value: "education", label: "Education" },
  { value: "creative",  label: "Creative" },
];

function Toast({ msg }) {
  return (
    <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 20px", color: "#fff", fontSize: 13, fontWeight: 600, zIndex: 999, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", whiteSpace: "nowrap" }}>
      {msg}
    </div>
  );
}

function SectionCard({ title, children, style = {} }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "24px", marginBottom: 20, ...style }}>
      {title && <p style={{ margin: "0 0 18px", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>{title}</p>}
      {children}
    </div>
  );
}

export function StreamerDashboard() {
  const [user, setUser]               = useState(undefined);
  const [stream, setStream]           = useState(null);
  const [loading, setLoading]         = useState(true);

  // Channel name
  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName]   = useState(false);

  // Stream title + category
  const [streamTitle, setStreamTitle] = useState("");
  const [category, setCategory]       = useState("general");
  const [savingInfo, setSavingInfo]   = useState(false);

  // Stream key
  const [revealKey, setRevealKey]     = useState(false);
  const [rotatingKey, setRotatingKey] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  // Stats
  const [viewers, setViewers]         = useState(0);
  const [followCount, setFollowCount] = useState(0);

  // Schedule
  const [schedule, setSchedule]       = useState([]);
  const [schedTitle, setSchedTitle]   = useState("");
  const [schedDate, setSchedDate]     = useState("");
  const [addingSched, setAddingSched] = useState(false);

  // Chat moderation
  const [bannedWords, setBannedWords] = useState([]);
  const [newWord, setNewWord]         = useState("");
  const [savingWords, setSavingWords] = useState(false);

  const [copied, setCopied]           = useState(null);
  const [toast, setToast]             = useState(null);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }
  function copy(text, which) {
    navigator.clipboard.writeText(text);
    setCopied(which); setTimeout(() => setCopied(null), 2000);
    showToast("Copied!");
  }

  const inp = {
    background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 10,
    padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit", width: "100%",
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadAll(session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadAll(session.user.id);
      else { setStream(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadAll(userId) {
    setLoading(true);
    const { data } = await supabase
      .from("live_streams")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    setStream(data ?? null);
    if (data) {
      setDisplayName(data.channel_name || data.title || "");
      setStreamTitle(data.stream_title || "");
      setCategory(data.category || "general");
      setBannedWords(data.banned_words || []);
      loadFollows(data.id);
      loadSchedule(data.id);
    }
    setLoading(false);
  }

  async function loadFollows(streamId) {
    const { count } = await supabase
      .from("streamer_follows")
      .select("*", { count: "exact", head: true })
      .eq("stream_id", streamId);
    setFollowCount(count ?? 0);
  }

  async function loadSchedule(streamId) {
    const { data } = await supabase
      .from("stream_schedule")
      .select("*")
      .eq("stream_id", streamId)
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at");
    setSchedule(data || []);
  }

  // Realtime is_live
  useEffect(() => {
    if (!stream?.id) return;
    const ch = supabase
      .channel(`streamer-live-${stream.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_streams", filter: `id=eq.${stream.id}` },
        ({ new: row }) => setStream(s => ({ ...s, is_live: row.is_live }))
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [stream?.id]);

  // Viewer count
  useEffect(() => {
    if (!stream?.id) return;
    async function fetchViewers() {
      const cutoff = new Date(Date.now() - 90000).toISOString();
      const { count } = await supabase
        .from("live_viewers")
        .select("*", { count: "exact", head: true })
        .eq("channel_id", stream.id)
        .gte("last_ping", cutoff);
      setViewers(count ?? 0);
    }
    fetchViewers();
    const t = setInterval(fetchViewers, 30000);
    return () => clearInterval(t);
  }, [stream?.id]);

  async function saveName() {
    if (!displayName.trim() || !stream) return;
    setSavingName(true);
    const name = displayName.trim();
    await supabase.from("live_streams").update({ channel_name: name }).eq("id", stream.id);
    setStream(s => ({ ...s, channel_name: name }));
    setSavingName(false);
    showToast("Channel name updated!");
  }

  async function saveStreamInfo() {
    if (!stream) return;
    setSavingInfo(true);
    await supabase.from("live_streams").update({
      stream_title: streamTitle.trim() || null,
      category,
    }).eq("id", stream.id);
    setStream(s => ({ ...s, stream_title: streamTitle.trim() || null, category }));
    setSavingInfo(false);
    showToast("Stream info updated!");
  }

  async function rotateKey() {
    setRotatingKey(true);
    setConfirmRotate(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rotate-stream-key`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setStream(s => ({ ...s, stream_key: json.stream_key, stream_uid: json.stream_uid }));
      setRevealKey(false);
      showToast("Stream key rotated! Update OBS with the new key.");
    } catch (e) {
      showToast("Failed to rotate key: " + e.message);
    }
    setRotatingKey(false);
  }

  async function addSchedule() {
    if (!schedTitle.trim() || !schedDate || !stream || !user) return;
    setAddingSched(true);
    const { data } = await supabase.from("stream_schedule").insert({
      stream_id: stream.id,
      user_id: user.id,
      title: schedTitle.trim(),
      scheduled_at: new Date(schedDate).toISOString(),
    }).select().single();
    if (data) setSchedule(s => [...s, data].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)));
    setSchedTitle(""); setSchedDate("");
    setAddingSched(false);
    showToast("Stream scheduled!");
  }

  async function deleteSchedule(id) {
    await supabase.from("stream_schedule").delete().eq("id", id);
    setSchedule(s => s.filter(x => x.id !== id));
  }

  async function saveBannedWords() {
    if (!stream) return;
    setSavingWords(true);
    await supabase.from("live_streams").update({ banned_words: bannedWords }).eq("id", stream.id);
    setStream(s => ({ ...s, banned_words: bannedWords }));
    setSavingWords(false);
    showToast("Banned words saved!");
  }

  function addBannedWord() {
    const w = newWord.trim().toLowerCase();
    if (!w || bannedWords.includes(w)) return;
    setBannedWords(ws => [...ws, w]);
    setNewWord("");
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (user === undefined || loading) {
    return (
      <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
        <p style={{ color: "#555", fontSize: 14 }}>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 16px", fontFamily: "'Space Grotesk', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
        <a href="/" style={{ textDecoration: "none", marginBottom: 40 }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, color: YELLOW }}>peep.</span>
        </a>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "40px 36px", width: "min(400px,100%)", textAlign: "center" }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 700, color: "#fff" }}>Streamer Dashboard</h2>
          <p style={{ margin: "0 0 28px", fontSize: 14, color: "#555", lineHeight: 1.6 }}>Sign in to access your stream settings and go live.</p>
          <a href="/signin" style={{ display: "block", background: YELLOW, color: "#0a0a0a", fontWeight: 700, fontSize: 14, padding: "13px", borderRadius: 10, textDecoration: "none" }}>Sign In</a>
        </div>
      </div>
    );
  }

  if (!stream) {
    return (
      <div style={{ background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 16px", fontFamily: "'Space Grotesk', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
        <a href="/" style={{ textDecoration: "none", marginBottom: 40 }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, color: YELLOW }}>peep.</span>
        </a>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "40px 36px", width: "min(440px,100%)", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📺</div>
          <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 700, color: "#fff" }}>No stream found</h2>
          <p style={{ margin: "0 0 28px", fontSize: 14, color: "#555", lineHeight: 1.6 }}>Your account isn't linked to a stream yet.</p>
          <a href="/apply-to-stream" style={{ display: "block", background: YELLOW, color: "#0a0a0a", fontWeight: 700, fontSize: 14, padding: "13px", borderRadius: 10, textDecoration: "none", marginBottom: 12 }}>Apply to Stream</a>
          <button onClick={signOut} style={{ background: "none", border: "none", color: "#444", fontSize: 13, cursor: "pointer" }}>Sign out</button>
        </div>
      </div>
    );
  }

  const username = stream.channel_name?.toLowerCase().replace(/[^a-z0-9]/g, "") || stream.id;

  return (
    <div style={{ background: BG, minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes livepulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.3)} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 clamp(16px,5vw,40px)", height: 64, background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${BORDER}` }}>
        <a href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: YELLOW }}>peep.</span>
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/" style={{ color: "#555", fontSize: 13, textDecoration: "none", fontWeight: 500 }}>← Watch Peep</a>
          <button onClick={signOut} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "7px 14px", color: "#888", fontSize: 13, cursor: "pointer" }}>Sign Out</button>
        </div>
      </nav>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px clamp(16px,5vw,40px) 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ margin: "0 0 6px", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>Streamer Dashboard</p>
          <h1 style={{ margin: "0 0 12px", fontSize: "clamp(24px,4vw,36px)", fontWeight: 700, color: "#fff" }}>{stream.channel_name || stream.title}</h1>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#444" }}>
              <strong style={{ color: "#fff" }}>{followCount.toLocaleString()}</strong> follower{followCount !== 1 ? "s" : ""}
            </span>
            {stream.category && stream.category !== "general" && (
              <span style={{ fontSize: 13, color: "#444" }}>
                {CATEGORIES.find(c => c.value === stream.category)?.label}
              </span>
            )}
          </div>
        </div>

        {/* Live status */}
        <SectionCard style={{ border: `1px solid ${stream.is_live ? "rgba(239,68,68,0.4)" : BORDER}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {stream.is_live ? (
                <>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite", flexShrink: 0 }} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#ef4444" }}>You're Live</span>
                </>
              ) : (
                <>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#333", flexShrink: 0 }} />
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#555" }}>Offline</span>
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: stream.is_live ? "#fff" : "#333" }}>{viewers.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: "#444", textTransform: "uppercase", letterSpacing: 0.5 }}>Watching</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{followCount.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: "#444", textTransform: "uppercase", letterSpacing: 0.5 }}>Followers</div>
              </div>
            </div>
          </div>
          {!stream.is_live && (
            <p style={{ margin: "14px 0 0", fontSize: 13, color: "#333" }}>Start streaming in OBS to go live on Peep.</p>
          )}
        </SectionCard>

        {/* Stream Info */}
        <SectionCard title="Stream Info">
          <div style={{ marginBottom: 16 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#666", fontWeight: 600 }}>What are you streaming?</p>
            <input
              value={streamTitle}
              onChange={e => setStreamTitle(e.target.value)}
              placeholder="e.g. Late night gaming session, New album listening party…"
              maxLength={120}
              style={inp}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#666", fontWeight: 600 }}>Category</p>
            <select value={category} onChange={e => setCategory(e.target.value)}
              style={{ ...inp, appearance: "none", cursor: "pointer" }}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <button onClick={saveStreamInfo} disabled={savingInfo}
            style={{ background: YELLOW, border: "none", borderRadius: 10, padding: "11px 22px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: savingInfo ? "wait" : "pointer", opacity: savingInfo ? 0.6 : 1 }}>
            {savingInfo ? "Saving…" : "Save Info"}
          </button>
        </SectionCard>

        {/* Stream Credentials */}
        <SectionCard title="Stream Credentials">
          {/* RTMP Server */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#666", fontWeight: 600 }}>RTMP Server</p>
            <div style={{ display: "flex", gap: 8 }}>
              <code style={{ flex: 1, background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", fontSize: 12, color: YELLOW, wordBreak: "break-all", lineHeight: 1.5 }}>{RTMP_BASE}</code>
              <button onClick={() => copy(RTMP_BASE, "rtmp")} style={{ flexShrink: 0, background: copied === "rtmp" ? "rgba(250,204,21,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${copied === "rtmp" ? "rgba(250,204,21,0.4)" : BORDER}`, borderRadius: 8, padding: "0 16px", color: copied === "rtmp" ? YELLOW : "#888", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
                {copied === "rtmp" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Stream Key */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#666", fontWeight: 600 }}>Stream Key <span style={{ color: "#333", fontWeight: 400 }}>— keep this private</span></p>
              {!confirmRotate ? (
                <button onClick={() => setConfirmRotate(true)}
                  style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 7, padding: "5px 12px", color: "#dc2626", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  Rotate Key
                </button>
              ) : (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#dc2626" }}>Are you sure?</span>
                  <button onClick={rotateKey} disabled={rotatingKey}
                    style={{ background: "#dc2626", border: "none", borderRadius: 6, padding: "5px 12px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {rotatingKey ? "Rotating…" : "Yes, rotate"}
                  </button>
                  <button onClick={() => setConfirmRotate(false)}
                    style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "5px 10px", color: "#666", fontSize: 11, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <code style={{ flex: 1, background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", fontSize: 12, color: YELLOW, wordBreak: "break-all", lineHeight: 1.5, userSelect: revealKey ? "all" : "none" }}>
                {revealKey ? stream.stream_key : "••••••••••••••••••••••••"}
              </code>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                <button onClick={() => setRevealKey(r => !r)} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 14px", color: "#888", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  {revealKey ? "Hide" : "Reveal"}
                </button>
                <button onClick={() => copy(stream.stream_key, "key")} style={{ background: copied === "key" ? "rgba(250,204,21,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${copied === "key" ? "rgba(250,204,21,0.4)" : BORDER}`, borderRadius: 8, padding: "8px 14px", color: copied === "key" ? YELLOW : "#888", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
                  {copied === "key" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            {confirmRotate && (
              <p style={{ margin: "10px 0 0", fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
                Rotating creates a new stream key and deletes the old one. You'll need to update OBS with the new key before you can go live again.
              </p>
            )}
          </div>
        </SectionCard>

        {/* OBS Setup */}
        <SectionCard title="OBS Setup">
          <div style={{ background: "rgba(234,179,8,0.07)", border: "1px solid rgba(234,179,8,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>⚠️</span>
            <p style={{ margin: 0, fontSize: 13, color: "#a16207", lineHeight: 1.5 }}>
              <strong>Skip the Auto-Configuration Wizard.</strong> It only works with Twitch/YouTube and will always fail for Peep. Use the manual steps below.
            </p>
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, color: "#888", fontSize: 14, lineHeight: 2.2 }}>
            <li>Open OBS → <strong style={{ color: "#ccc" }}>Settings → Stream</strong></li>
            <li>Service: <strong style={{ color: "#ccc" }}>Custom...</strong></li>
            <li>Server: paste your <strong style={{ color: YELLOW }}>RTMP Server</strong> above</li>
            <li>Stream Key: paste your <strong style={{ color: YELLOW }}>Stream Key</strong> above</li>
            <li>Recommended: <strong style={{ color: "#ccc" }}>1080p, 6000 kbps, H.264</strong></li>
            <li>Click <strong style={{ color: "#ccc" }}>Start Streaming</strong> — you'll go live on Peep automatically</li>
          </ol>
        </SectionCard>

        {/* Stream Schedule */}
        <SectionCard title="Upcoming Streams">
          {schedule.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              {schedule.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: `1px solid ${BORDER}` }}>
                  <div>
                    <p style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600, color: "#fff" }}>{s.title}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#555" }}>
                      {new Date(s.scheduled_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {" at "}
                      {new Date(s.scheduled_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                    </p>
                  </div>
                  <button onClick={() => deleteSchedule(s.id)}
                    style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "5px 10px", color: "#555", fontSize: 12, cursor: "pointer" }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#444", fontWeight: 600 }}>Add upcoming stream</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input value={schedTitle} onChange={e => setSchedTitle(e.target.value)}
              placeholder="Stream title…" style={{ ...inp, flex: "2 1 160px" }} />
            <input type="datetime-local" value={schedDate} onChange={e => setSchedDate(e.target.value)}
              style={{ ...inp, flex: "1 1 160px", colorScheme: "dark" }} />
            <button onClick={addSchedule} disabled={addingSched || !schedTitle.trim() || !schedDate}
              style={{ flexShrink: 0, background: YELLOW, border: "none", borderRadius: 10, padding: "12px 18px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: !schedTitle.trim() || !schedDate ? 0.4 : 1 }}>
              {addingSched ? "Adding…" : "+ Add"}
            </button>
          </div>
        </SectionCard>

        {/* Chat Moderation */}
        <SectionCard title="Chat Moderation">
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "#444", lineHeight: 1.6 }}>
            Messages containing these words will be automatically blocked.
          </p>
          {bannedWords.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {bannedWords.map(w => (
                <span key={w} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 6, padding: "4px 10px", fontSize: 12, color: "#f87171" }}>
                  {w}
                  <button onClick={() => setBannedWords(ws => ws.filter(x => x !== w))}
                    style={{ background: "none", border: "none", color: "#ef4444", fontSize: 14, cursor: "pointer", padding: 0, lineHeight: 1, display: "flex", alignItems: "center" }}>×</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <input value={newWord} onChange={e => setNewWord(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addBannedWord()}
              placeholder="Add a word or phrase…"
              style={{ ...inp, flex: 1 }} />
            <button onClick={addBannedWord} disabled={!newWord.trim()}
              style={{ flexShrink: 0, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 16px", color: "#888", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: !newWord.trim() ? 0.4 : 1 }}>
              Add
            </button>
          </div>
          <button onClick={saveBannedWords} disabled={savingWords}
            style={{ background: YELLOW, border: "none", borderRadius: 10, padding: "11px 22px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: savingWords ? "wait" : "pointer", opacity: savingWords ? 0.6 : 1 }}>
            {savingWords ? "Saving…" : "Save Banned Words"}
          </button>
        </SectionCard>

        {/* Channel Name */}
        <SectionCard title="Channel Name">
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "#444" }}>This is how your channel appears on Peep.</p>
          <div style={{ display: "flex", gap: 10 }}>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveName()}
              placeholder="Your channel name" maxLength={60} style={{ ...inp, flex: 1 }} />
            <button onClick={saveName}
              disabled={savingName || !displayName.trim() || displayName.trim() === (stream.channel_name || stream.title)}
              style={{ flexShrink: 0, background: YELLOW, border: "none", borderRadius: 10, padding: "12px 20px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: savingName || displayName.trim() === (stream.channel_name || stream.title) ? 0.5 : 1 }}>
              {savingName ? "Saving…" : "Save"}
            </button>
          </div>
        </SectionCard>

        {/* View on Peep */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#fff" }}>Your channel on Peep</p>
            <p style={{ margin: 0, fontSize: 13, color: "#444" }}>watchpeep.tv/stream/{username}</p>
          </div>
          <a href={`/stream/${username}`} style={{ flexShrink: 0, background: "rgba(250,204,21,0.1)", border: "1px solid rgba(250,204,21,0.3)", borderRadius: 9, padding: "10px 18px", color: YELLOW, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
            View Channel →
          </a>
        </div>

      </div>

      {toast && <Toast msg={toast} />}
    </div>
  );
}
