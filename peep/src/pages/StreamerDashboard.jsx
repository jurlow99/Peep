import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const BG = "#0a0a0a";
const YELLOW = "#facc15";
const BORDER = "#1e1e1e";
const CARD = "#111";
const RTMP_BASE = "rtmps://live.cloudflare.com:443/live/";

function Toast({ msg }) {
  return (
    <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 20px", color: "#fff", fontSize: 13, fontWeight: 600, zIndex: 999, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", whiteSpace: "nowrap" }}>
      {msg}
    </div>
  );
}

export function StreamerDashboard() {
  const [user, setUser]           = useState(undefined); // undefined = loading
  const [stream, setStream]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName]   = useState(false);
  const [revealKey, setRevealKey] = useState(false);
  const [viewers, setViewers]     = useState(0);
  const [copied, setCopied]       = useState(null);
  const [toast, setToast]         = useState(null);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function copy(text, which) {
    navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
    showToast("Copied!");
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadStream(session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadStream(session.user.id);
      else { setStream(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadStream(userId) {
    setLoading(true);
    const { data } = await supabase
      .from("live_streams")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    setStream(data ?? null);
    if (data) setDisplayName(data.channel_name || data.title || "");
    setLoading(false);
  }

  // Realtime: watch is_live changes
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

  // Viewer count — poll every 30s
  useEffect(() => {
    if (!stream?.id) return;
    async function fetch() {
      const cutoff = new Date(Date.now() - 90000).toISOString();
      const { count } = await supabase
        .from("live_viewers")
        .select("*", { count: "exact", head: true })
        .eq("channel_id", stream.id)
        .gte("last_ping", cutoff);
      setViewers(count ?? 0);
    }
    fetch();
    const t = setInterval(fetch, 30000);
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

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const inp = {
    width: "100%", background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 10,
    padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box",
    fontFamily: "inherit",
  };

  // Loading
  if (user === undefined || loading) {
    return (
      <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
        <p style={{ color: "#555", fontSize: 14 }}>Loading…</p>
      </div>
    );
  }

  // Not signed in
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

  // Signed in but no stream
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
          <p style={{ margin: "0 0 28px", fontSize: 14, color: "#555", lineHeight: 1.6 }}>
            Your account isn't linked to a stream yet. Apply to become a streamer on Peep.
          </p>
          <a href="/apply-to-stream" style={{ display: "block", background: YELLOW, color: "#0a0a0a", fontWeight: 700, fontSize: 14, padding: "13px", borderRadius: 10, textDecoration: "none", marginBottom: 12 }}>Apply to Stream</a>
          <button onClick={signOut} style={{ background: "none", border: "none", color: "#444", fontSize: 13, cursor: "pointer" }}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <style>{`@keyframes livepulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.3)} }`}</style>

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
        <div style={{ marginBottom: 36 }}>
          <p style={{ margin: "0 0 6px", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>Streamer Dashboard</p>
          <h1 style={{ margin: 0, fontSize: "clamp(24px,4vw,32px)", fontWeight: 700, color: "#fff" }}>{stream.title}</h1>
        </div>

        {/* Live status card */}
        <div style={{ background: CARD, border: `1px solid ${stream.is_live ? "rgba(239,68,68,0.4)" : BORDER}`, borderRadius: 14, padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
          {stream.is_live && viewers > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#9ca3af" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
              <strong style={{ color: "#fff" }}>{viewers.toLocaleString()}</strong> watching now
            </div>
          )}
          {!stream.is_live && (
            <p style={{ margin: 0, fontSize: 13, color: "#444" }}>Start streaming in OBS to go live on Peep.</p>
          )}
        </div>

        {/* Stream credentials */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "24px", marginBottom: 20 }}>
          <p style={{ margin: "0 0 20px", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>Stream Credentials</p>

          {/* RTMP Server */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#666", fontWeight: 600 }}>RTMP Server</p>
            <div style={{ display: "flex", gap: 8 }}>
              <code style={{ flex: 1, background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "11px 14px", fontSize: 12, color: YELLOW, wordBreak: "break-all", lineHeight: 1.5 }}>
                {RTMP_BASE}
              </code>
              <button onClick={() => copy(RTMP_BASE, "rtmp")} style={{ flexShrink: 0, background: copied === "rtmp" ? "rgba(250,204,21,0.15)" : "rgba(255,255,255,0.05)", border: `1px solid ${copied === "rtmp" ? "rgba(250,204,21,0.4)" : BORDER}`, borderRadius: 8, padding: "0 16px", color: copied === "rtmp" ? YELLOW : "#888", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
                {copied === "rtmp" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Stream Key */}
          <div>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#666", fontWeight: 600 }}>Stream Key <span style={{ color: "#333", fontWeight: 400 }}>— keep this private</span></p>
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
          </div>
        </div>

        {/* OBS setup */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "24px", marginBottom: 20 }}>
          <p style={{ margin: "0 0 16px", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>OBS Setup</p>
          <ol style={{ margin: 0, paddingLeft: 18, color: "#888", fontSize: 14, lineHeight: 2.2 }}>
            <li>Open OBS → <strong style={{ color: "#ccc" }}>Settings → Stream</strong></li>
            <li>Service: <strong style={{ color: "#ccc" }}>Custom</strong></li>
            <li>Server: paste your <strong style={{ color: YELLOW }}>RTMP Server</strong> above</li>
            <li>Stream Key: paste your <strong style={{ color: YELLOW }}>Stream Key</strong> above</li>
            <li>Recommended: <strong style={{ color: "#ccc" }}>1080p, 6000 kbps, H.264</strong></li>
            <li>Click <strong style={{ color: "#ccc" }}>Start Streaming</strong> — you'll go live on Peep automatically</li>
          </ol>
        </div>

        {/* Display name */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "24px", marginBottom: 20 }}>
          <p style={{ margin: "0 0 6px", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>Channel Name</p>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "#444" }}>This is how your stream appears on Peep.</p>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveName()}
              placeholder="Your channel name"
              maxLength={60}
              style={{ ...inp, flex: 1 }}
            />
            <button
              onClick={saveName}
              disabled={savingName || !displayName.trim() || displayName.trim() === (stream.channel_name || stream.title)}
              style={{ flexShrink: 0, background: YELLOW, border: "none", borderRadius: 10, padding: "12px 20px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: savingName || !displayName.trim() || displayName.trim() === stream.title ? 0.5 : 1 }}>
              {savingName ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {/* Stream link */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#fff" }}>Your stream on Peep</p>
            <p style={{ margin: 0, fontSize: 13, color: "#444" }}>Viewers can find you in the Live TV section.</p>
          </div>
          <a href="/" style={{ flexShrink: 0, background: "rgba(250,204,21,0.1)", border: "1px solid rgba(250,204,21,0.3)", borderRadius: 9, padding: "10px 18px", color: YELLOW, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
            View on Peep →
          </a>
        </div>

      </div>

      {toast && <Toast msg={toast} />}
    </div>
  );
}
