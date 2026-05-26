import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const BG = "#0a0a0a";
const YELLOW = "#facc15";
const BORDER = "#1e1e1e";
const CARD = "#111";
const RTMP_BASE = "rtmps://live.cloudflare.com/live/";

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
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, marginBottom: 16, overflow: "hidden", ...style }}>
      {title && <div style={{ padding: "20px 24px 0" }}><p style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: "#fff" }}>{title}</p></div>}
      <div style={{ padding: title ? "0 24px 24px" : "24px" }}>
        {children}
      </div>
    </div>
  );
}

export function StreamerDashboard() {
  const [user, setUser]               = useState(undefined);
  const [stream, setStream]           = useState(null);
  const [loading, setLoading]         = useState(true);

  // Channel name + handle
  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName]   = useState(false);
  const [handle, setHandle]           = useState("");
  const [savingHandle, setSavingHandle] = useState(false);

  // Stream title + category + bio + donation
  const [streamTitle, setStreamTitle]     = useState("");
  const [category, setCategory]           = useState("general");
  const [bio, setBio]                     = useState("");
  const [donationLink, setDonationLink]   = useState("");
  const [savingInfo, setSavingInfo]       = useState(false);

  // Channel art
  const [uploadingThumb, setUploadingThumb]   = useState(false);
  const [uploadingHero, setUploadingHero]     = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pendingFiles, setPendingFiles]       = useState({ thumbnail: null, hero: null, avatar: null });

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
      setHandle(data.username || "");
      setStreamTitle(data.stream_title || "");
      setCategory(data.category || "general");
      setBio(data.bio || "");
      setDonationLink(data.donation_link || "");
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

  // Realtime is_live + polling fallback
  useEffect(() => {
    if (!stream?.id) return;
    const ch = supabase
      .channel(`streamer-live-${stream.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_streams", filter: `id=eq.${stream.id}` },
        ({ new: row }) => setStream(s => ({ ...s, is_live: row.is_live }))
      )
      .subscribe();

    // Poll Cloudflare directly every 8s — more reliable than waiting for webhook
    async function pollLive() {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-live-status?stream_uid=${stream.stream_uid}&stream_id=${stream.id}`
        );
        const json = await res.json();
        if (typeof json.is_live === "boolean") {
          setStream(s => s.is_live !== json.is_live ? { ...s, is_live: json.is_live } : s);
        }
      } catch {}
    }
    pollLive(); // check immediately on load
    const t = setInterval(pollLive, 8000);

    return () => { supabase.removeChannel(ch); clearInterval(t); };
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

  async function saveHandle() {
    if (!handle.trim() || !stream || stream.username) return;
    const cleaned = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!cleaned) return;
    setSavingHandle(true);
    const { error } = await supabase.from("live_streams").update({ username: cleaned }).eq("id", stream.id);
    if (error) {
      showToast(error.code === "23505" ? "That handle is already taken." : "Failed to save handle.");
    } else {
      setStream(s => ({ ...s, username: cleaned }));
      setHandle(cleaned);
      showToast("Handle set! Your channel URL is now /stream/" + cleaned);
    }
    setSavingHandle(false);
  }

  async function saveStreamInfo() {
    if (!stream) return;
    setSavingInfo(true);
    const cleanDonation = donationLink.trim();
    await supabase.from("live_streams").update({
      stream_title: streamTitle.trim() || null,
      category,
      bio: bio.trim() || null,
      donation_link: cleanDonation || null,
    }).eq("id", stream.id);
    setStream(s => ({ ...s, stream_title: streamTitle.trim() || null, category, bio: bio.trim() || null, donation_link: cleanDonation || null }));
    setSavingInfo(false);
    showToast("Channel info updated!");
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

  async function uploadChannelImage(file, field) {
    const ext = file.name.split(".").pop().toLowerCase() || "jpg";
    const path = `stream-profiles/${stream.id}/${field}.${ext}`;
    const { error } = await supabase.storage.from("peep-media").upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from("peep-media").getPublicUrl(path);
    return `${publicUrl}?t=${Date.now()}`;
  }

  function handleImagePick(e, key) {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setPendingFiles(p => ({ ...p, [key]: { file, previewUrl } }));
    e.target.value = "";
  }

  function cancelPending(key) {
    if (pendingFiles[key]) URL.revokeObjectURL(pendingFiles[key].previewUrl);
    setPendingFiles(p => ({ ...p, [key]: null }));
  }

  async function saveImage(key, dbField, setUploading, toastMsg) {
    const pending = pendingFiles[key];
    if (!pending) return;
    setUploading(true);
    try {
      const url = await uploadChannelImage(pending.file, key);
      await supabase.from("live_streams").update({ [dbField]: url }).eq("id", stream.id);
      setStream(s => ({ ...s, [dbField]: url }));
      URL.revokeObjectURL(pending.previewUrl);
      setPendingFiles(p => ({ ...p, [key]: null }));
      showToast(toastMsg);
    } catch (err) {
      showToast("Upload failed: " + err.message);
    }
    setUploading(false);
  }

  async function clearImage(field) {
    await supabase.from("live_streams").update({ [field]: null }).eq("id", stream.id);
    setStream(s => ({ ...s, [field]: null }));
    showToast("Image removed.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (user === undefined || loading) {
    return (
      <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif" }}>
        <p style={{ color: "#555", fontSize: 14 }}>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 16px", fontFamily: "'Space Grotesk', sans-serif" }}>
        <a href="/" style={{ textDecoration: "none", marginBottom: 40 }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, color: YELLOW }}>peep.</span>
        </a>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "40px 36px", width: "min(400px,100%)", textAlign: "center" }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 700, color: "#fff" }}>Streamer Dashboard</h2>
          <p style={{ margin: "0 0 28px", fontSize: 14, color: "#555", lineHeight: 1.6 }}>Sign in to access your stream settings and go live.</p>
          <a href="/signin?redirect=/streamer" style={{ display: "block", background: YELLOW, color: "#0a0a0a", fontWeight: 700, fontSize: 14, padding: "13px", borderRadius: 10, textDecoration: "none" }}>Sign In</a>
        </div>
      </div>
    );
  }

  if (!stream) {
    return (
      <div style={{ background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 16px", fontFamily: "'Space Grotesk', sans-serif" }}>
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

  const username = stream.username || stream.channel_name?.toLowerCase().replace(/[^a-z0-9]/g, "") || stream.id;
  const PAD = "clamp(16px,4vw,48px)";

  // Reusable field label
  const Label = ({ children }) => (
    <p style={{ margin: "0 0 7px", fontSize: 12, color: "#666", fontWeight: 600, letterSpacing: 0.2 }}>{children}</p>
  );

  return (
    <div style={{ background: BG, minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>
      <style>{`
        @keyframes livepulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.3)} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${PAD}`, height: 58, background: "rgba(10,10,10,0.97)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <a href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: YELLOW }}>peep.</span>
          </a>
          <span style={{ color: "#2a2a2a", fontSize: 16 }}>|</span>
          <span style={{ fontSize: 13, color: "#555", fontWeight: 600 }}>Creator Studio</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href={`/stream/${username}`} target="_blank" rel="noopener noreferrer" style={{ color: "#555", fontSize: 13, textDecoration: "none", fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            My Channel
          </a>
          <a href="/?watch=1" style={{ color: "#555", fontSize: 13, textDecoration: "none", fontWeight: 500 }}>← Watch Peep</a>
          <button onClick={signOut} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 14px", color: "#666", fontSize: 12, cursor: "pointer" }}>Sign Out</button>
        </div>
      </nav>

      {/* Status bar */}
      <div style={{ padding: `20px ${PAD}`, borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap", background: stream.is_live ? "rgba(239,68,68,0.04)" : "transparent" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {stream.is_live
            ? <><div style={{ width: 9, height: 9, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite" }} /><span style={{ fontSize: 14, fontWeight: 700, color: "#ef4444" }}>Live</span></>
            : <><div style={{ width: 9, height: 9, borderRadius: "50%", background: "#333" }} /><span style={{ fontSize: 14, fontWeight: 600, color: "#444" }}>Offline</span></>
          }
        </div>
        <div style={{ height: 20, width: 1, background: BORDER }} />
        <span style={{ fontSize: 13, color: "#555" }}><strong style={{ color: stream.is_live ? "#fff" : "#555" }}>{viewers}</strong> watching</span>
        <span style={{ fontSize: 13, color: "#555" }}><strong style={{ color: "#fff" }}>{followCount}</strong> followers</span>
        <div style={{ flex: 1 }} />
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#fff" }}>{stream.channel_name || stream.title}</h2>
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, padding: `24px ${PAD} 80px`, alignItems: "start" }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Channel Info */}
          <SectionCard title="Channel Info">
            <div style={{ marginBottom: 16 }}>
              <Label>Channel Name</Label>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveName()}
                  placeholder="Your channel name" maxLength={60} style={{ ...inp, flex: 1 }} />
                <button onClick={saveName}
                  disabled={savingName || !displayName.trim() || displayName.trim() === (stream.channel_name || stream.title)}
                  style={{ flexShrink: 0, background: YELLOW, border: "none", borderRadius: 10, padding: "0 18px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: savingName || displayName.trim() === (stream.channel_name || stream.title) ? 0.45 : 1 }}>
                  {savingName ? "…" : "Save"}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <Label>Handle <span style={{ color: "#2a2a2a", fontWeight: 400 }}>— your channel URL, set once</span></Label>
              {stream.username ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ ...inp, flex: 1, color: "#555", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "#333" }}>@</span>
                    <span>{stream.username}</span>
                  </div>
                  <div style={{ flexShrink: 0, background: "#111", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "0 14px", height: 44, display: "flex", alignItems: "center", color: "#333", fontSize: 12 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
                    <span style={{ padding: "0 10px", color: "#444", fontSize: 14, flexShrink: 0 }}>@</span>
                    <input value={handle} onChange={e => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                      onKeyDown={e => e.key === "Enter" && saveHandle()}
                      placeholder="yourchannel" maxLength={30}
                      style={{ ...inp, border: "none", borderRadius: 0, paddingLeft: 0, flex: 1 }} />
                  </div>
                  <button onClick={saveHandle} disabled={savingHandle || !handle.trim()}
                    style={{ flexShrink: 0, background: YELLOW, border: "none", borderRadius: 10, padding: "0 18px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: !handle.trim() ? 0.45 : 1 }}>
                    {savingHandle ? "…" : "Set"}
                  </button>
                </div>
              )}
              {!stream.username && <p style={{ margin: "4px 0 0", fontSize: 11, color: "#333" }}>Can't be changed after — choose carefully.</p>}
            </div>

            <div style={{ borderTop: `1px solid ${BORDER}`, margin: "16px 0" }} />

            <div style={{ marginBottom: 14 }}>
              <Label>Stream Title</Label>
              <input value={streamTitle} onChange={e => setStreamTitle(e.target.value)}
                placeholder="e.g. Late night gaming, album listening party…"
                maxLength={120} style={inp} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <Label>Category</Label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                style={{ ...inp, appearance: "none", cursor: "pointer" }}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <Label>Bio</Label>
              <textarea value={bio} onChange={e => setBio(e.target.value)}
                placeholder="Tell viewers about your channel…"
                maxLength={300} rows={3}
                style={{ ...inp, resize: "vertical", lineHeight: 1.6 }} />
              <p style={{ margin: "3px 0 0", fontSize: 11, color: "#333", textAlign: "right" }}>{bio.length}/300</p>
            </div>
            <div style={{ marginBottom: 18 }}>
              <Label>Donation Link <span style={{ color: "#2a2a2a", fontWeight: 400 }}>— Ko-fi, PayPal, Streamlabs…</span></Label>
              <input value={donationLink} onChange={e => setDonationLink(e.target.value)}
                placeholder="https://ko-fi.com/yourchannel" type="url" style={inp} />
            </div>
            <button onClick={saveStreamInfo} disabled={savingInfo}
              style={{ background: YELLOW, border: "none", borderRadius: 10, padding: "11px 22px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: savingInfo ? "wait" : "pointer", opacity: savingInfo ? 0.6 : 1 }}>
              {savingInfo ? "Saving…" : "Save"}
            </button>
          </SectionCard>

          {/* Channel Art */}
          <SectionCard title="Channel Art">
            <p style={{ margin: "0 0 18px", fontSize: 13, color: "#444" }}>Shown on your profile page and stream cards.</p>

            {/* Avatar */}
            <div style={{ marginBottom: 20 }}>
              <Label>Profile Picture <span style={{ color: "#2a2a2a", fontWeight: 400 }}>— circle</span></Label>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, #312e81, #6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, color: "#fff", flexShrink: 0, overflow: "hidden", border: `2px solid ${pendingFiles.avatar ? YELLOW : BORDER}` }}>
                  {pendingFiles.avatar
                    ? <img src={pendingFiles.avatar.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : stream.avatar_url
                      ? <img src={stream.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span>{(stream.channel_name || stream.title || "?")[0].toUpperCase()}</span>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {pendingFiles.avatar ? (
                    <>
                      <button onClick={() => saveImage("avatar", "avatar_url", setUploadingAvatar, "Profile picture updated!")} disabled={uploadingAvatar}
                        style={{ background: YELLOW, border: "none", borderRadius: 8, padding: "8px 16px", color: "#0a0a0a", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: uploadingAvatar ? 0.6 : 1 }}>
                        {uploadingAvatar ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => cancelPending("avatar")} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", color: "#666", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <label style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 16px", color: "#bbb", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        <input type="file" accept="image/*" onChange={e => handleImagePick(e, "avatar")} style={{ display: "none" }} />
                        Choose Image
                      </label>
                      {stream.avatar_url && (
                        <button onClick={() => clearImage("avatar_url")} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", color: "#444", fontSize: 11, cursor: "pointer" }}>Remove</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${BORDER}`, margin: "0 0 18px" }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                { label: "Stream Thumbnail", hint: "16:9", pendingKey: "thumbnail", dbField: "thumbnail", uploading: uploadingThumb, setUploading: setUploadingThumb, toastMsg: "Thumbnail updated!", current: stream.thumbnail },
                { label: "Profile Banner", hint: "wide", pendingKey: "hero", dbField: "hero_image", uploading: uploadingHero, setUploading: setUploadingHero, toastMsg: "Banner updated!", current: stream.hero_image },
              ].map(({ label, hint, pendingKey, dbField, uploading, setUploading, toastMsg, current }) => {
                const pending = pendingFiles[pendingKey];
                const preview = pending?.previewUrl || current;
                return (
                  <div key={pendingKey}>
                    <Label>{label} <span style={{ color: "#2a2a2a", fontWeight: 400 }}>{hint}</span></Label>
                    <div style={{ aspectRatio: "16/9", background: "#0d0d0d", border: `1px solid ${pending ? YELLOW : BORDER}`, borderRadius: 10, overflow: "hidden", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {preview
                        ? <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2a2a2a" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      }
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {pending ? (
                        <>
                          <button onClick={() => saveImage(pendingKey, dbField, setUploading, toastMsg)} disabled={uploading}
                            style={{ flex: 1, background: YELLOW, border: "none", borderRadius: 8, padding: "8px 0", color: "#0a0a0a", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: uploading ? 0.6 : 1 }}>
                            {uploading ? "Saving…" : "Save"}
                          </button>
                          <button onClick={() => cancelPending(pendingKey)} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px", color: "#666", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <label style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 0", color: "#bbb", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center" }}>
                            <input type="file" accept="image/*" onChange={e => handleImagePick(e, pendingKey)} style={{ display: "none" }} />
                            Choose Image
                          </label>
                          {current && (
                            <button onClick={() => clearImage(dbField)} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 10px", color: "#444", fontSize: 11, cursor: "pointer" }}>Remove</button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {/* Schedule */}
          <SectionCard title="Upcoming Streams">
            {schedule.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                {schedule.map(s => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 0", borderBottom: `1px solid ${BORDER}` }}>
                    <div>
                      <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#fff" }}>{s.title}</p>
                      <p style={{ margin: 0, fontSize: 11, color: "#555" }}>
                        {new Date(s.scheduled_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at {new Date(s.scheduled_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                    <button onClick={() => deleteSchedule(s.id)}
                      style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "4px 10px", color: "#444", fontSize: 11, cursor: "pointer" }}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            {schedule.length === 0 && <p style={{ margin: "0 0 14px", fontSize: 13, color: "#333" }}>No upcoming streams scheduled.</p>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={schedTitle} onChange={e => setSchedTitle(e.target.value)}
                placeholder="Stream title…" style={{ ...inp, flex: "2 1 120px" }} />
              <input type="datetime-local" value={schedDate} onChange={e => setSchedDate(e.target.value)}
                style={{ ...inp, flex: "1 1 140px", colorScheme: "dark" }} />
              <button onClick={addSchedule} disabled={addingSched || !schedTitle.trim() || !schedDate}
                style={{ flexShrink: 0, background: YELLOW, border: "none", borderRadius: 10, padding: "12px 16px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: !schedTitle.trim() || !schedDate ? 0.4 : 1 }}>
                {addingSched ? "…" : "+ Add"}
              </button>
            </div>
          </SectionCard>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Go Live */}
          <SectionCard title="Go Live">
            <div style={{ marginBottom: 18 }}>
              <Label>RTMP Server</Label>
              <div style={{ display: "flex", gap: 8 }}>
                <code style={{ flex: 1, background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", fontSize: 11, color: YELLOW, wordBreak: "break-all", lineHeight: 1.5 }}>{RTMP_BASE}</code>
                <button onClick={() => copy(RTMP_BASE, "rtmp")} style={{ flexShrink: 0, background: copied === "rtmp" ? "rgba(250,204,21,0.12)" : "rgba(255,255,255,0.05)", border: `1px solid ${copied === "rtmp" ? "rgba(250,204,21,0.4)" : BORDER}`, borderRadius: 8, padding: "0 14px", color: copied === "rtmp" ? YELLOW : "#888", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
                  {copied === "rtmp" ? "✓" : "Copy"}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7, gap: 8, flexWrap: "wrap" }}>
                <Label>Stream Key <span style={{ color: "#2a2a2a", fontWeight: 400 }}>— keep private</span></Label>
                {!confirmRotate
                  ? <button onClick={() => setConfirmRotate(true)} style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 6, padding: "3px 10px", color: "#dc2626", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Rotate</button>
                  : <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#dc2626" }}>Sure?</span>
                      <button onClick={rotateKey} disabled={rotatingKey} style={{ background: "#dc2626", border: "none", borderRadius: 6, padding: "3px 10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{rotatingKey ? "…" : "Yes"}</button>
                      <button onClick={() => setConfirmRotate(false)} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "3px 8px", color: "#666", fontSize: 11, cursor: "pointer" }}>No</button>
                    </div>
                }
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <code style={{ flex: 1, background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", fontSize: 11, color: YELLOW, wordBreak: "break-all", lineHeight: 1.5, userSelect: revealKey ? "all" : "none" }}>
                  {revealKey ? stream.stream_key : "••••••••••••••••••••••••"}
                </code>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setRevealKey(r => !r)} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 12px", color: "#888", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{revealKey ? "Hide" : "Show"}</button>
                  <button onClick={() => copy(stream.stream_key, "key")} style={{ background: copied === "key" ? "rgba(250,204,21,0.12)" : "rgba(255,255,255,0.05)", border: `1px solid ${copied === "key" ? "rgba(250,204,21,0.4)" : BORDER}`, borderRadius: 8, padding: "7px 12px", color: copied === "key" ? YELLOW : "#888", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>{copied === "key" ? "✓" : "Copy"}</button>
                </div>
              </div>
              {confirmRotate && <p style={{ margin: "8px 0 0", fontSize: 11, color: "#555", lineHeight: 1.5 }}>This creates a new key and invalidates the old one. Update OBS before going live again.</p>}
            </div>

            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 18 }}>
              <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "#fff" }}>OBS Setup</p>
              <div style={{ background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.18)", borderRadius: 8, padding: "10px 12px", marginBottom: 14, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>⚠️</span>
                <p style={{ margin: 0, fontSize: 12, color: "#a16207", lineHeight: 1.5 }}><strong>Skip Auto-Config Wizard</strong> — it only works with Twitch/YouTube. Use manual setup below.</p>
              </div>
              <ol style={{ margin: 0, paddingLeft: 16, color: "#555", fontSize: 13, lineHeight: 2.1 }}>
                <li>OBS → <strong style={{ color: "#ccc" }}>Settings → Stream</strong></li>
                <li>Service: <strong style={{ color: "#ccc" }}>Custom…</strong></li>
                <li>Server: <strong style={{ color: YELLOW }}>RTMP Server</strong> above</li>
                <li>Stream Key: <strong style={{ color: YELLOW }}>Stream Key</strong> above</li>
                <li>Recommended: <strong style={{ color: "#ccc" }}>1080p · 6000 kbps · H.264</strong></li>
                <li>Click <strong style={{ color: "#ccc" }}>Start Streaming</strong></li>
              </ol>
            </div>
          </SectionCard>

          {/* Chat Moderation */}
          <SectionCard title="Chat Moderation">
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "#444", lineHeight: 1.6 }}>Messages containing these words are automatically blocked.</p>
            {bannedWords.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
                {bannedWords.map(w => (
                  <span key={w} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 6, padding: "3px 8px", fontSize: 12, color: "#f87171" }}>
                    {w}
                    <button onClick={() => setBannedWords(ws => ws.filter(x => x !== w))} style={{ background: "none", border: "none", color: "#ef4444", fontSize: 14, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input value={newWord} onChange={e => setNewWord(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addBannedWord()}
                placeholder="Add a word or phrase…"
                style={{ ...inp, flex: 1 }} />
              <button onClick={addBannedWord} disabled={!newWord.trim()}
                style={{ flexShrink: 0, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "0 14px", color: "#888", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: !newWord.trim() ? 0.4 : 1 }}>
                Add
              </button>
            </div>
            <button onClick={saveBannedWords} disabled={savingWords}
              style={{ background: YELLOW, border: "none", borderRadius: 10, padding: "10px 20px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: savingWords ? "wait" : "pointer", opacity: savingWords ? 0.6 : 1 }}>
              {savingWords ? "Saving…" : "Save"}
            </button>
          </SectionCard>

        </div>
      </div>

      {toast && <Toast msg={toast} />}
    </div>
  );
}
