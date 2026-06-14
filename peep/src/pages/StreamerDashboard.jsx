import { useState, useEffect, useCallback, useRef } from "react";
import Hls from "hls.js";
import { supabase } from "../supabase";

const BG = "#0a0a0a";
const YELLOW = "#facc15";
const BORDER = "#1e1e1e";
const CARD = "#111";
const RTMP_BASE = "rtmps://live.cloudflare.com/live/";

const CATEGORIES = [
  { value: "general",   label: "General" },
  { value: "gaming",    label: "Gaming" },
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

function SectionCard({ title, children, style = {}, collapsible = false, defaultOpen = true, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = !collapsible || open;
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden", ...style }}>
      {title && (
        <div
          onClick={collapsible ? () => setOpen(o => !o) : undefined}
          style={{ padding: "16px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: isOpen ? `1px solid ${BORDER}` : "none", cursor: collapsible ? "pointer" : "default", userSelect: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{title}</span>
            {badge && <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(250,204,21,0.15)", color: YELLOW, border: "1px solid rgba(250,204,21,0.25)", borderRadius: 5, padding: "1px 7px" }}>{badge}</span>}
          </div>
          {collapsible && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2.5" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          )}
        </div>
      )}
      {isOpen && <div style={{ padding: "20px 22px" }}>{children}</div>}
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "18px 20px" }}>
      <p style={{ margin: "0 0 6px", fontSize: 12, color: "#555", fontWeight: 600, letterSpacing: 0.2 }}>{label}</p>
      <p style={{ margin: "0 0 2px", fontSize: 28, fontWeight: 800, color: "#fff" }}>{value}</p>
      {sub && <p style={{ margin: 0, fontSize: 12, color: "#444" }}>{sub}</p>}
    </div>
  );
}

function VodPlayer({ url }) {
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !url) return;
    hlsRef.current?.destroy();
    if (url.includes(".m3u8") && Hls.isSupported()) {
      const h = new Hls();
      h.loadSource(url);
      h.attachMedia(el);
      h.on(Hls.Events.MANIFEST_PARSED, () => el.play().catch(() => {}));
      hlsRef.current = h;
    } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = url;
      el.play().catch(() => {});
    } else {
      el.src = url;
    }
    return () => { hlsRef.current?.destroy(); hlsRef.current = null; el.pause(); el.src = ""; };
  }, [url]);

  return (
    <video ref={videoRef} controls controlsList="nodownload" playsInline style={{ display: "block", width: "100%", aspectRatio: "16/9", background: "#000" }} />
  );
}

function LivePreview({ url }) {
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !url) return;
    hlsRef.current?.destroy();
    if (url.includes(".m3u8") && Hls.isSupported()) {
      const h = new Hls({ startLevel: -1 });
      h.loadSource(url);
      h.attachMedia(el);
      h.on(Hls.Events.MANIFEST_PARSED, () => el.play().catch(() => {}));
      hlsRef.current = h;
    } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = url;
      el.play().catch(() => {});
    }
    return () => { hlsRef.current?.destroy(); hlsRef.current = null; el.pause(); el.src = ""; };
  }, [url]);

  return (
    <div style={{ background: "#000", position: "relative" }}>
      <video ref={videoRef} muted={muted} playsInline style={{ display: "block", width: "100%", aspectRatio: "16/9", background: "#000" }} />
      <button
        onClick={() => { const el = videoRef.current; if (el) { el.muted = !el.muted; setMuted(el.muted); } }}
        style={{ position: "absolute", bottom: 12, right: 12, background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, padding: "6px 12px", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", backdropFilter: "blur(6px)" }}>
        {muted ? "Unmute" : "Mute"}
      </button>
    </div>
  );
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtDuration(secs) {
  if (!secs) return "";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function StreamerDashboard() {
  const [user, setUser]               = useState(undefined);
  const [stream, setStream]           = useState(null);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState("studio");

  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName]   = useState(false);
  const [handle, setHandle]           = useState("");
  const [savingHandle, setSavingHandle] = useState(false);

  const [streamTitle, setStreamTitle]   = useState("");
  const [category, setCategory]         = useState("general");
  const [bio, setBio]                   = useState("");
  const [donationLink, setDonationLink] = useState("");
  const [savingInfo, setSavingInfo]     = useState(false);

  const [uploadingThumb, setUploadingThumb]   = useState(false);
  const [uploadingHero, setUploadingHero]     = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pendingFiles, setPendingFiles]       = useState({ thumbnail: null, hero: null, avatar: null });

  const [revealKey, setRevealKey]         = useState(false);
  const [rotatingKey, setRotatingKey]     = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const [viewers, setViewers]         = useState(0);
  const [followCount, setFollowCount] = useState(0);

  const [schedule, setSchedule]       = useState([]);
  const [schedTitle, setSchedTitle]   = useState("");
  const [schedDate, setSchedDate]     = useState("");
  const [addingSched, setAddingSched] = useState(false);

  const [bannedWords, setBannedWords] = useState([]);
  const [newWord, setNewWord]         = useState("");
  const [savingWords, setSavingWords] = useState(false);

  const [analyticsFollowers, setAnalyticsFollowers] = useState([]);
  const [analyticsLoading, setAnalyticsLoading]     = useState(false);

  const [notifications, setNotifications]   = useState([]);
  const [unreadCount, setUnreadCount]       = useState(0);
  const [notifsLoading, setNotifsLoading]   = useState(false);
  const [markingRead, setMarkingRead]       = useState(false);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput]       = useState("");
  const [chatSending, setChatSending]   = useState(false);
  const chatBottomRef = useRef(null);

  const [vods, setVods]               = useState([]);
  const [vodsLoading, setVodsLoading] = useState(false);
  const [editingVod, setEditingVod]   = useState(null);
  const [deletingVod, setDeletingVod] = useState(null);
  const [savingVod, setSavingVod]     = useState(false);
  const [watchingVod, setWatchingVod] = useState(null);
  const [vodExpanded, setVodExpanded] = useState(false);

  const [copied, setCopied] = useState(null);
  const [toast, setToast]   = useState(null);

  const [streamHealth, setStreamHealth]   = useState(null);
  const [liveStartedAt, setLiveStartedAt] = useState(null);
  const [liveDuration, setLiveDuration]   = useState(0);
  const [previewOpen, setPreviewOpen]     = useState(false);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }
  function copy(text, which) {
    navigator.clipboard.writeText(text);
    setCopied(which); setTimeout(() => setCopied(null), 2000);
    showToast("Copied!");
  }

  const inp = {
    background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 10,
    padding: "11px 13px", color: "#fff", fontSize: 13, outline: "none",
    boxSizing: "border-box", fontFamily: "inherit", width: "100%",
  };

  useEffect(() => {
    const activeThisSession = sessionStorage.getItem("streamer_session_active");
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && activeThisSession) { setUser(session.user); loadAll(session.user.id); }
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        sessionStorage.setItem("streamer_session_active", "1");
        setUser(session.user); loadAll(session.user.id);
      } else if (event === "SIGNED_OUT") {
        sessionStorage.removeItem("streamer_session_active");
        setUser(null); setStream(null); setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadAll(userId) {
    setLoading(true);
    const { data } = await supabase.from("live_streams").select("*").eq("user_id", userId).maybeSingle();
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
      loadAnalytics(data.id);
      loadNotifications(data.id);
      loadVods(data.stream_uid, data.previous_stream_uids || []);
    }
    setLoading(false);
  }

  async function loadFollows(streamId) {
    const { count } = await supabase.from("streamer_follows").select("*", { count: "exact", head: true }).eq("stream_id", streamId);
    setFollowCount(count ?? 0);
  }

  async function loadSchedule(streamId) {
    const { data } = await supabase.from("stream_schedule").select("*").eq("stream_id", streamId).gte("scheduled_at", new Date().toISOString()).order("scheduled_at");
    setSchedule(data || []);
  }

  async function loadAnalytics(streamId) {
    setAnalyticsLoading(true);
    const { data } = await supabase.from("streamer_follows")
      .select("created_at, follower_id, profiles(username, full_name)")
      .eq("stream_id", streamId).order("created_at", { ascending: false });
    setAnalyticsFollowers(data || []);
    setAnalyticsLoading(false);
  }

  async function loadNotifications(streamId) {
    setNotifsLoading(true);
    const { data } = await supabase.from("streamer_notifications")
      .select("*").eq("stream_id", streamId)
      .order("created_at", { ascending: false }).limit(60);
    setNotifications(data || []);
    setUnreadCount(data?.filter(n => !n.read).length || 0);
    setNotifsLoading(false);
  }

  async function markAllRead() {
    if (!stream || unreadCount === 0) return;
    setMarkingRead(true);
    await supabase.from("streamer_notifications").update({ read: true }).eq("stream_id", stream.id).eq("read", false);
    setNotifications(ns => ns.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
    setMarkingRead(false);
  }

  async function loadVods(streamUid, previousUids = []) {
    if (!streamUid) return;
    setVodsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const prevParam = previousUids.length ? `&previous_uids=${previousUids.join(",")}` : "";
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-vods?stream_uid=${streamUid}${prevParam}`,
        { headers: session?.access_token ? { "Authorization": `Bearer ${session.access_token}` } : {} }
      );
      const json = await res.json();
      setVods(json.vods || []);
    } catch (_) {}
    setVodsLoading(false);
  }

  async function deleteVod(uid) {
    setSavingVod(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-vod`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setVods(vs => vs.filter(v => v.uid !== uid));
      setDeletingVod(null);
      showToast("VOD deleted.");
    } catch (e) { showToast("Delete failed: " + e.message); }
    setSavingVod(false);
  }

  async function saveVodTitle(uid, title) {
    setSavingVod(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rename-vod`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uid, title }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setVods(vs => vs.map(v => v.uid === uid ? { ...v, meta: { ...v.meta, name: title } } : v));
      setEditingVod(null);
      showToast("Title updated.");
    } catch (e) { showToast("Rename failed: " + e.message); }
    setSavingVod(false);
  }

  useEffect(() => {
    if (!stream?.id) return;
    const ch = supabase.channel(`notifs-${stream.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "streamer_notifications", filter: `stream_id=eq.${stream.id}` },
        ({ new: n }) => { setNotifications(prev => [n, ...prev]); setUnreadCount(c => c + 1); })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [stream?.id]);

  useEffect(() => {
    if (!stream?.id) return;
    const ch = supabase.channel(`streamer-live-${stream.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_streams", filter: `id=eq.${stream.id}` },
        ({ new: row }) => setStream(s => ({ ...s, is_live: row.is_live })))
      .subscribe();
    async function pollLive() {
      try {
        const res  = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-live-status?stream_uid=${stream.stream_uid}&stream_id=${stream.id}`);
        const json = await res.json();
        if (typeof json.is_live === "boolean") setStream(s => s.is_live !== json.is_live ? { ...s, is_live: json.is_live } : s);
        if (json.health) setStreamHealth(json.health);
      } catch (_) {}
    }
    pollLive();
    const t = setInterval(pollLive, 8000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [stream?.id]);

  useEffect(() => {
    if (!stream?.id) return;
    const key = `peep_live_start_${stream.id}`;
    if (stream?.is_live) {
      setLiveStartedAt(prev => {
        if (prev) return prev;
        const stored = localStorage.getItem(key);
        if (stored) return parseInt(stored, 10);
        const now = Date.now();
        localStorage.setItem(key, String(now));
        return now;
      });
      setPreviewOpen(true);
    } else {
      localStorage.removeItem(key);
      setLiveStartedAt(null); setLiveDuration(0); setPreviewOpen(false); setViewers(0);
    }
  }, [stream?.is_live, stream?.id]);

  useEffect(() => {
    if (!liveStartedAt) return;
    const t = setInterval(() => setLiveDuration(Math.floor((Date.now() - liveStartedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [liveStartedAt]);

  useEffect(() => {
    if (!stream?.id) return;
    async function fetchViewers() {
      const cutoff = new Date(Date.now() - 90000).toISOString();
      const { count } = await supabase.from("live_viewers").select("*", { count: "exact", head: true }).eq("channel_id", stream.id).gte("last_ping", cutoff);
      setViewers(count ?? 0);
    }
    fetchViewers();
    const t = setInterval(fetchViewers, 10000);
    return () => clearInterval(t);
  }, [stream?.id]);

  useEffect(() => {
    if (!stream?.id || !stream?.is_live) { setChatMessages([]); return; }
    supabase.from("live_chat")
      .select("id, message, user_id, profile_name, created_at")
      .eq("channel_id", stream.id).order("created_at", { ascending: true }).limit(200)
      .then(({ data }) => { if (data) setChatMessages(data); });
    const ch = supabase.channel(`dash-chat-${stream.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_chat", filter: `channel_id=eq.${stream.id}` },
        ({ new: msg }) => {
          setChatMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [stream?.id, stream?.is_live]);

  async function saveName() {
    if (!displayName.trim() || !stream) return;
    setSavingName(true);
    await supabase.from("live_streams").update({ channel_name: displayName.trim() }).eq("id", stream.id);
    setStream(s => ({ ...s, channel_name: displayName.trim() }));
    setSavingName(false);
    showToast("Channel name updated!");
  }

  async function sendChat() {
    if (!chatInput.trim() || chatSending || !stream?.id) return;
    const msg = chatInput.trim();
    setChatSending(true); setChatInput("");
    const channelName = stream.channel_name || stream.title || "Streamer";
    const session = await supabase.auth.getSession();
    const { data } = await supabase.from("live_chat").insert({
      channel_id: stream.id,
      user_id: session.data.session?.user?.id,
      profile_name: `${channelName} 🎥`,
      message: msg,
    }).select().single();
    if (data) {
      setChatMessages(prev => prev.some(m => m.id === data.id) ? prev : [...prev, data]);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
    setChatSending(false);
  }

  async function saveHandle() {
    if (!handle.trim() || !stream || stream.username) return;
    const cleaned = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!cleaned) return;
    setSavingHandle(true);
    const { error } = await supabase.from("live_streams").update({ username: cleaned }).eq("id", stream.id);
    if (error) showToast(error.code === "23505" ? "That handle is already taken." : "Failed to save handle.");
    else { setStream(s => ({ ...s, username: cleaned })); setHandle(cleaned); showToast("Handle set!"); }
    setSavingHandle(false);
  }

  async function saveStreamInfo() {
    if (!stream) return;
    setSavingInfo(true);
    const cleanDonation = donationLink.trim();
    await supabase.from("live_streams").update({ stream_title: streamTitle.trim() || null, category, bio: bio.trim() || null, donation_link: cleanDonation || null }).eq("id", stream.id);
    setStream(s => ({ ...s, stream_title: streamTitle.trim() || null, category, bio: bio.trim() || null, donation_link: cleanDonation || null }));
    setSavingInfo(false);
    showToast("Channel info saved!");
  }

  async function rotateKey() {
    setRotatingKey(true); setConfirmRotate(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rotate-stream-key`, { method: "POST", headers: { "Authorization": `Bearer ${session.access_token}`, "Content-Type": "application/json" } });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setStream(s => ({ ...s, stream_key: json.stream_key, stream_uid: json.stream_uid }));
      setRevealKey(false);
      showToast("Stream key rotated! Update OBS with the new key.");
    } catch (e) { showToast("Failed: " + e.message); }
    setRotatingKey(false);
  }

  async function addSchedule() {
    if (!schedTitle.trim() || !schedDate || !stream || !user) return;
    setAddingSched(true);
    const { data } = await supabase.from("stream_schedule").insert({ stream_id: stream.id, user_id: user.id, title: schedTitle.trim(), scheduled_at: new Date(schedDate).toISOString() }).select().single();
    if (data) setSchedule(s => [...s, data].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)));
    setSchedTitle(""); setSchedDate(""); setAddingSched(false);
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
    setBannedWords(ws => [...ws, w]); setNewWord("");
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
    setPendingFiles(p => ({ ...p, [key]: { file, previewUrl: URL.createObjectURL(file) } }));
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
    } catch (err) { showToast("Upload failed: " + err.message); }
    setUploading(false);
  }

  async function clearImage(field) {
    await supabase.from("live_streams").update({ [field]: null }).eq("id", stream.id);
    setStream(s => ({ ...s, [field]: null }));
    showToast("Image removed.");
  }

  async function signOut() { await supabase.auth.signOut(); window.location.href = "/"; }

  if (user === undefined || loading) return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif" }}>
      <p style={{ color: "#555", fontSize: 14 }}>Loading…</p>
    </div>
  );

  if (!user) return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 16px", fontFamily: "'Space Grotesk', sans-serif" }}>
      <a href="/" style={{ textDecoration: "none", marginBottom: 40 }}><span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, color: YELLOW }}>peep.</span></a>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "40px 36px", width: "min(400px,100%)", textAlign: "center" }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 700, color: "#fff" }}>Streamer Dashboard</h2>
        <p style={{ margin: "0 0 28px", fontSize: 14, color: "#555", lineHeight: 1.6 }}>Sign in to access your stream settings and go live.</p>
        <a href="/signin?redirect=/streamer" style={{ display: "block", background: YELLOW, color: "#0a0a0a", fontWeight: 700, fontSize: 14, padding: "13px", borderRadius: 10, textDecoration: "none" }}>Sign In</a>
      </div>
    </div>
  );

  if (!stream) return (
    <div style={{ background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 16px", fontFamily: "'Space Grotesk', sans-serif" }}>
      <a href="/" style={{ textDecoration: "none", marginBottom: 40 }}><span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, color: YELLOW }}>peep.</span></a>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "40px 36px", width: "min(440px,100%)", textAlign: "center" }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 700, color: "#fff" }}>No stream found</h2>
        <p style={{ margin: "0 0 28px", fontSize: 14, color: "#555", lineHeight: 1.6 }}>Your account isn't linked to a stream yet.</p>
        <a href="/apply-to-stream" style={{ display: "block", background: YELLOW, color: "#0a0a0a", fontWeight: 700, fontSize: 14, padding: "13px", borderRadius: 10, textDecoration: "none", marginBottom: 12 }}>Apply to Stream</a>
        <button onClick={signOut} style={{ background: "none", border: "none", color: "#444", fontSize: 13, cursor: "pointer" }}>Sign out</button>
      </div>
    </div>
  );

  const slug = stream.username || stream.channel_name?.toLowerCase().replace(/[^a-z0-9]/g, "") || stream.id;
  const channelUrl = `watchpeep.tv/stream/${slug}`;
  const PAD = "clamp(16px,4vw,48px)";
  const Label = ({ children }) => <p style={{ margin: "0 0 6px", fontSize: 12, color: "#555", fontWeight: 600, letterSpacing: 0.2 }}>{children}</p>;

  const now = new Date();
  const oneWeekAgo  = new Date(now - 7  * 86400000);
  const oneMonthAgo = new Date(now - 30 * 86400000);
  const thisWeek  = analyticsFollowers.filter(f => new Date(f.created_at) > oneWeekAgo).length;
  const thisMonth = analyticsFollowers.filter(f => new Date(f.created_at) > oneMonthAgo).length;
  const weekBuckets = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(now - (8 - i) * 7 * 86400000);
    const end   = new Date(now - (7 - i) * 7 * 86400000);
    return { label: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }), count: analyticsFollowers.filter(f => { const d = new Date(f.created_at); return d >= start && d < end; }).length };
  });
  const chartMax = Math.max(...weekBuckets.map(b => b.count), 1);

  const TABS = [
    { id: "studio",        label: "Studio" },
    { id: "channel",       label: "Channel" },
    { id: "analytics",     label: "Analytics" },
    { id: "notifications", label: "Notifications", badge: unreadCount },
    { id: "vods",          label: "VODs" },
  ];

  return (
    <div style={{ background: BG, minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>
      <style>{`
        @keyframes livepulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.3)} }
        .dash-tab-bar { display: flex; gap: 2px; border-bottom: 1px solid #1e1e1e; background: #0a0a0a; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
        .dash-tab-bar::-webkit-scrollbar { display: none; }
        @media (max-width: 700px) {
          .dash-nav { height: auto !important; min-height: 56px; flex-wrap: wrap; padding-top: 10px !important; padding-bottom: 10px !important; gap: 8px; }
          .dash-nav-hide-mobile { display: none !important; }
        }
      `}</style>

      {/* Nav */}
      <nav className="dash-nav" style={{ position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${PAD}`, height: 56, background: "rgba(10,10,10,0.97)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/" style={{ textDecoration: "none" }}><span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: YELLOW }}>peep.</span></a>
          <span className="dash-nav-hide-mobile" style={{ color: "#222", fontSize: 14 }}>|</span>
          <span className="dash-nav-hide-mobile" style={{ fontSize: 12, color: "#444", fontWeight: 600, letterSpacing: 0.3 }}>Creator Studio</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setActiveTab("notifications")} style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: "4px", color: unreadCount > 0 ? YELLOW : "#444", display: "flex" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            {unreadCount > 0 && <span style={{ position: "absolute", top: -2, right: -2, background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: "50%", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{unreadCount > 9 ? "9+" : unreadCount}</span>}
          </button>
          <a href={`/stream/${slug}`} target="_blank" rel="noopener noreferrer" className="dash-nav-hide-mobile" style={{ color: "#444", fontSize: 12, textDecoration: "none", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            My Channel
          </a>
          <button onClick={signOut} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "5px 12px", color: "#555", fontSize: 12, cursor: "pointer" }}>Sign Out</button>
        </div>
      </nav>

      {/* Live status bar */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, background: stream.is_live ? "rgba(239,68,68,0.03)" : "transparent" }}>
        <div style={{ padding: `12px ${PAD}`, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>

          {/* Status pill */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: stream.is_live ? "rgba(239,68,68,0.1)" : "#111", border: `1px solid ${stream.is_live ? "rgba(239,68,68,0.25)" : BORDER}`, borderRadius: 20, padding: "5px 14px" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: stream.is_live ? "#ef4444" : "#333", animation: stream.is_live ? "livepulse 1.5s infinite" : "none" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: stream.is_live ? "#ef4444" : "#444", letterSpacing: 0.6 }}>{stream.is_live ? "LIVE" : "OFFLINE"}</span>
            {stream.is_live && liveDuration > 0 && <span style={{ fontSize: 11, color: "rgba(239,68,68,0.5)", fontVariantNumeric: "tabular-nums" }}>{fmtDuration(liveDuration)}</span>}
          </div>

          <span style={{ fontSize: 13, color: "#444" }}><strong style={{ color: stream.is_live ? "#e0e0e0" : "#555" }}>{viewers}</strong> watching</span>
          <span style={{ fontSize: 13, color: "#444" }}><strong style={{ color: "#bbb" }}>{followCount}</strong> followers</span>

          {/* OBS health chips */}
          {streamHealth && (
            <>
              <div style={{ height: 14, width: 1, background: BORDER }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: streamHealth.state === "connected" ? "rgba(74,222,128,0.07)" : "rgba(255,255,255,0.02)", border: `1px solid ${streamHealth.state === "connected" ? "rgba(74,222,128,0.2)" : BORDER}`, borderRadius: 6, padding: "3px 10px" }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: streamHealth.state === "connected" ? "#4ade80" : "#333" }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: streamHealth.state === "connected" ? "#4ade80" : "#333" }}>
                  {streamHealth.state === "connected" ? "OBS Connected" : "OBS Idle"}
                </span>
              </div>
              {streamHealth.bitrate != null && (
                <span style={{ fontSize: 11, color: "#444", fontWeight: 600 }}>
                  {streamHealth.bitrate >= 1000000 ? `${(streamHealth.bitrate / 1000000).toFixed(1)} Mbps` : `${Math.round(streamHealth.bitrate / 1000)} kbps`}
                </span>
              )}
              {streamHealth.width && streamHealth.height && <span style={{ fontSize: 11, color: "#333", fontWeight: 600 }}>{streamHealth.width}×{streamHealth.height}</span>}
              {streamHealth.fps != null && <span style={{ fontSize: 11, color: "#333", fontWeight: 600 }}>{streamHealth.fps} fps</span>}
            </>
          )}

          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#888" }}>{stream.channel_name || stream.title}</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="dash-tab-bar" style={{ padding: `0 ${PAD}` }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ position: "relative", background: "none", border: "none", borderBottom: activeTab === t.id ? `2px solid ${YELLOW}` : "2px solid transparent", padding: "13px 16px", color: activeTab === t.id ? YELLOW : "#555", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "color 0.15s", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            {t.label}
            {t.badge > 0 && <span style={{ background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: 10, padding: "1px 5px" }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── STUDIO TAB ── */}
      {activeTab === "studio" && (
        <div style={{ padding: `24px ${PAD} 80px`, display: "flex", flexDirection: "column", gap: 12, maxWidth: 860 }}>

          {/* Go Live */}
          <SectionCard title="Go Live" collapsible defaultOpen={!stream.is_live}>
            {/* RTMP + Key */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <Label>RTMP Server</Label>
                <div style={{ display: "flex", gap: 7 }}>
                  <code style={{ flex: 1, background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 11px", fontSize: 11, color: YELLOW, wordBreak: "break-all", lineHeight: 1.5 }}>{RTMP_BASE}</code>
                  <button onClick={() => copy(RTMP_BASE, "rtmp")} style={{ flexShrink: 0, background: copied === "rtmp" ? "rgba(250,204,21,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${copied === "rtmp" ? "rgba(250,204,21,0.3)" : BORDER}`, borderRadius: 8, padding: "0 12px", color: copied === "rtmp" ? YELLOW : "#666", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{copied === "rtmp" ? "✓" : "Copy"}</button>
                </div>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <Label>Stream Key</Label>
                  {!confirmRotate
                    ? <button onClick={() => setConfirmRotate(true)} style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 5, padding: "2px 8px", color: "#dc2626", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Rotate</button>
                    : <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#dc2626" }}>Sure?</span>
                        <button onClick={rotateKey} disabled={rotatingKey} style={{ background: "#dc2626", border: "none", borderRadius: 5, padding: "2px 8px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{rotatingKey ? "…" : "Yes"}</button>
                        <button onClick={() => setConfirmRotate(false)} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 5, padding: "2px 7px", color: "#666", fontSize: 11, cursor: "pointer" }}>No</button>
                      </div>}
                </div>
                <div style={{ display: "flex", gap: 7 }}>
                  <code style={{ flex: 1, background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 11px", fontSize: 11, color: YELLOW, wordBreak: "break-all", lineHeight: 1.5, userSelect: revealKey ? "all" : "none" }}>
                    {revealKey ? stream.stream_key : "••••••••••••••••••••••"}
                  </code>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <button onClick={() => setRevealKey(r => !r)} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "5px 10px", color: "#666", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{revealKey ? "Hide" : "Show"}</button>
                    <button onClick={() => copy(stream.stream_key, "key")} style={{ background: copied === "key" ? "rgba(250,204,21,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${copied === "key" ? "rgba(250,204,21,0.3)" : BORDER}`, borderRadius: 8, padding: "5px 10px", color: copied === "key" ? YELLOW : "#666", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{copied === "key" ? "✓" : "Copy"}</button>
                  </div>
                </div>
              </div>
            </div>

            {/* OBS steps */}
            <div style={{ background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px" }}>
              <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#555", letterSpacing: "0.08em", textTransform: "uppercase" }}>OBS Setup</p>
              <div style={{ background: "rgba(234,179,8,0.05)", border: "1px solid rgba(234,179,8,0.1)", borderRadius: 7, padding: "7px 11px", marginBottom: 12 }}>
                <p style={{ margin: 0, fontSize: 12, color: "#78350f", lineHeight: 1.5 }}>Skip the Auto-Config Wizard — it only works with Twitch/YouTube.</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                {[
                  "OBS → Settings → Stream",
                  'Service: "Custom…"',
                  "Paste RTMP Server above",
                  "Paste Stream Key above",
                  "1080p · 6000 kbps · H.264",
                  "Click Start Streaming",
                ].map((text, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#1a1a1a", border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#444", flexShrink: 0, marginTop: 2 }}>{i + 1}</div>
                    <span style={{ fontSize: 12, color: "#555", lineHeight: 1.5 }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          {/* Stream Preview */}
          {stream.stream_url && (
            <SectionCard collapsible defaultOpen={previewOpen}
              title={
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  Stream Preview
                  {stream.is_live && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 800, color: "#ef4444" }}>
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite", display: "inline-block" }} /> LIVE
                    </span>
                  )}
                </span>
              }>
              <div style={{ margin: "-20px -22px", borderRadius: "0 0 14px 14px", overflow: "hidden" }}>
                <LivePreview url={stream.stream_url} />
              </div>
            </SectionCard>
          )}

          {/* Live Chat */}
          {stream.is_live && (
            <SectionCard title="Live Chat" badge={chatMessages.length > 0 ? `${chatMessages.length}` : undefined}>
              <div style={{ height: 260, overflowY: "auto", padding: "0 0 12px", display: "flex", flexDirection: "column", gap: 1, margin: "-20px -22px 0", padding: "12px 22px" }}>
                {chatMessages.length === 0
                  ? <p style={{ color: "#2a2a2a", fontSize: 12, margin: "auto 0", textAlign: "center" }}>No messages yet</p>
                  : chatMessages.map(m => (
                    <div key={m.id} style={{ fontSize: 13, lineHeight: 1.55, wordBreak: "break-word", padding: "3px 0", borderRadius: 4 }}>
                      <span style={{ color: YELLOW, fontWeight: 700, marginRight: 6, fontSize: 12 }}>{m.profile_name}</span>
                      <span style={{ color: "#777" }}>{m.message}</span>
                    </div>
                  ))
                }
                <div ref={chatBottomRef} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat()}
                  placeholder="Chat as streamer…" maxLength={300}
                  style={{ flex: 1, background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
                <button onClick={sendChat} disabled={!chatInput.trim() || chatSending}
                  style={{ background: chatInput.trim() ? YELLOW : "#111", border: "none", borderRadius: 8, padding: "9px 18px", color: chatInput.trim() ? "#0a0a0a" : "#333", fontSize: 13, fontWeight: 700, cursor: !chatInput.trim() || chatSending ? "not-allowed" : "pointer", flexShrink: 0 }}>
                  Send
                </button>
              </div>
            </SectionCard>
          )}

        </div>
      )}

      {/* ── CHANNEL TAB ── */}
      {activeTab === "channel" && (
        <div style={{ padding: `24px ${PAD} 80px`, display: "flex", flexDirection: "column", gap: 12, maxWidth: 860 }}>

          {/* Channel Identity */}
          <SectionCard title="Identity" collapsible defaultOpen>
            {/* Channel URL display */}
            <div style={{ background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <p style={{ margin: "0 0 2px", fontSize: 11, color: "#444", fontWeight: 600, letterSpacing: 0.2 }}>CHANNEL URL</p>
                <span style={{ fontSize: 13, color: YELLOW, fontWeight: 600 }}>{channelUrl}</span>
              </div>
              <button onClick={() => copy(`https://${channelUrl}`, "url")} style={{ flexShrink: 0, background: copied === "url" ? "rgba(250,204,21,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${copied === "url" ? "rgba(250,204,21,0.3)" : BORDER}`, borderRadius: 8, padding: "6px 14px", color: copied === "url" ? YELLOW : "#666", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                {copied === "url" ? "Copied!" : "Copy Link"}
              </button>
            </div>

            {/* Name + Handle */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <Label>Channel Name</Label>
                <div style={{ display: "flex", gap: 7 }}>
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)} onKeyDown={e => e.key === "Enter" && saveName()} placeholder="Your channel name" maxLength={60} style={{ ...inp, flex: 1 }} />
                  <button onClick={saveName} disabled={savingName || !displayName.trim() || displayName.trim() === (stream.channel_name || stream.title)}
                    style={{ flexShrink: 0, background: YELLOW, border: "none", borderRadius: 9, padding: "0 14px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: savingName || displayName.trim() === (stream.channel_name || stream.title) ? 0.4 : 1 }}>
                    {savingName ? "…" : "Save"}
                  </button>
                </div>
              </div>
              <div>
                <Label>Handle {!stream.username && <span style={{ color: "#2a2a2a", fontWeight: 400 }}>— set once, permanent</span>}</Label>
                {stream.username ? (
                  <div style={{ ...inp, color: "#444", display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ color: "#2a2a2a" }}>@</span>{stream.username}
                    <svg style={{ marginLeft: "auto" }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2a2a2a" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 7 }}>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#0d0d0d", border: `1px solid ${BORDER}`, borderRadius: 9, overflow: "hidden" }}>
                      <span style={{ padding: "0 8px", color: "#333", fontSize: 14, flexShrink: 0 }}>@</span>
                      <input value={handle} onChange={e => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} onKeyDown={e => e.key === "Enter" && saveHandle()} placeholder="yourchannel" maxLength={30} style={{ ...inp, border: "none", borderRadius: 0, paddingLeft: 0, flex: 1 }} />
                    </div>
                    <button onClick={saveHandle} disabled={savingHandle || !handle.trim()} style={{ flexShrink: 0, background: YELLOW, border: "none", borderRadius: 9, padding: "0 14px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: !handle.trim() ? 0.4 : 1 }}>{savingHandle ? "…" : "Set"}</button>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Stream Info */}
          <SectionCard title="Stream Info" collapsible defaultOpen>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, marginBottom: 12 }}>
              <div>
                <Label>Stream Title</Label>
                <input value={streamTitle} onChange={e => setStreamTitle(e.target.value)} placeholder="What are you streaming today?" maxLength={120} style={inp} />
              </div>
              <div style={{ minWidth: 150 }}>
                <Label>Category</Label>
                <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inp, appearance: "none", cursor: "pointer" }}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <Label>Bio</Label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell viewers about your channel…" maxLength={300} rows={3} style={{ ...inp, resize: "vertical", lineHeight: 1.6 }} />
              <p style={{ margin: "3px 0 0", fontSize: 11, color: "#333", textAlign: "right" }}>{bio.length}/300</p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <Label>Donation Link <span style={{ color: "#2a2a2a", fontWeight: 400 }}>Ko-fi, PayPal, Streamlabs…</span></Label>
              <input value={donationLink} onChange={e => setDonationLink(e.target.value)} placeholder="https://ko-fi.com/yourchannel" type="url" style={inp} />
            </div>
            <button onClick={saveStreamInfo} disabled={savingInfo} style={{ background: YELLOW, border: "none", borderRadius: 9, padding: "10px 22px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: savingInfo ? "wait" : "pointer", opacity: savingInfo ? 0.6 : 1 }}>
              {savingInfo ? "Saving…" : "Save Changes"}
            </button>
          </SectionCard>

          {/* Channel Art */}
          <SectionCard title="Channel Art" collapsible defaultOpen>
            {/* Avatar */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg, #312e81, #6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#fff", flexShrink: 0, overflow: "hidden", border: `2px solid ${pendingFiles.avatar ? YELLOW : BORDER}` }}>
                {pendingFiles.avatar ? <img src={pendingFiles.avatar.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : stream.avatar_url ? <img src={stream.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span>{(stream.channel_name || stream.title || "?")[0].toUpperCase()}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 1px", fontSize: 13, fontWeight: 600, color: "#ccc" }}>Profile Picture</p>
                <p style={{ margin: "0 0 8px", fontSize: 11, color: "#444" }}>Circle crop · shown everywhere next to your name</p>
                <div style={{ display: "flex", gap: 6 }}>
                  {pendingFiles.avatar ? (
                    <>
                      <button onClick={() => saveImage("avatar", "avatar_url", setUploadingAvatar, "Profile picture updated!")} disabled={uploadingAvatar} style={{ background: YELLOW, border: "none", borderRadius: 7, padding: "6px 14px", color: "#0a0a0a", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: uploadingAvatar ? 0.6 : 1 }}>{uploadingAvatar ? "Saving…" : "Save"}</button>
                      <button onClick={() => cancelPending("avatar")} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 10px", color: "#555", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <label style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 14px", color: "#bbb", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        <input type="file" accept="image/*" onChange={e => handleImagePick(e, "avatar")} style={{ display: "none" }} />
                        {stream.avatar_url ? "Replace" : "Upload"}
                      </label>
                      {stream.avatar_url && <button onClick={() => clearImage("avatar_url")} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 10px", color: "#333", fontSize: 12, cursor: "pointer" }}>Remove</button>}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Thumbnail + Banner */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Thumbnail", where: "Streams page card", size: "1280 × 720", pendingKey: "thumbnail", dbField: "thumbnail", uploading: uploadingThumb, setUploading: setUploadingThumb, toastMsg: "Thumbnail updated!", current: stream.thumbnail },
                { label: "Channel Banner", where: "Top of your channel page", size: "1920 × 480", pendingKey: "hero", dbField: "hero_image", uploading: uploadingHero, setUploading: setUploadingHero, toastMsg: "Banner updated!", current: stream.hero_image },
              ].map(({ label, where, size, pendingKey, dbField, uploading, setUploading, toastMsg, current }) => {
                const pending = pendingFiles[pendingKey];
                const preview = pending?.previewUrl || current;
                return (
                  <div key={pendingKey} style={{ display: "flex", gap: 12, alignItems: "center", background: "#0d0d0d", border: `1px solid ${pending ? YELLOW : BORDER}`, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ width: 72, height: 44, borderRadius: 6, overflow: "hidden", background: "#111", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {preview ? <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2a2a2a" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: "0 0 1px", fontSize: 13, fontWeight: 600, color: "#ccc" }}>{label}</p>
                      <p style={{ margin: 0, fontSize: 11, color: "#333" }}>{where} · {size}</p>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {pending ? (
                        <>
                          <button onClick={() => saveImage(pendingKey, dbField, setUploading, toastMsg)} disabled={uploading} style={{ background: YELLOW, border: "none", borderRadius: 7, padding: "6px 14px", color: "#0a0a0a", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: uploading ? 0.6 : 1 }}>{uploading ? "Saving…" : "Save"}</button>
                          <button onClick={() => cancelPending(pendingKey)} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 10px", color: "#555", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <label style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 14px", color: "#bbb", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            <input type="file" accept="image/*" onChange={e => handleImagePick(e, pendingKey)} style={{ display: "none" }} />
                            {current ? "Replace" : "Upload"}
                          </label>
                          {current && <button onClick={() => clearImage(dbField)} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 10px", color: "#333", fontSize: 12, cursor: "pointer" }}>Remove</button>}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {/* Moderation */}
          <SectionCard title="Chat Moderation" collapsible defaultOpen={false}>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#444" }}>Words automatically blocked from your live chat.</p>
            {bannedWords.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {bannedWords.map(w => (
                  <span key={w} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 6, padding: "3px 8px", fontSize: 12, color: "#f87171" }}>
                    {w}
                    <button onClick={() => setBannedWords(ws => ws.filter(x => x !== w))} style={{ background: "none", border: "none", color: "#ef4444", fontSize: 14, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
              <input value={newWord} onChange={e => setNewWord(e.target.value)} onKeyDown={e => e.key === "Enter" && addBannedWord()} placeholder="Add a word…" style={{ ...inp, flex: 1 }} />
              <button onClick={addBannedWord} disabled={!newWord.trim()} style={{ flexShrink: 0, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 9, padding: "0 14px", color: "#888", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: !newWord.trim() ? 0.4 : 1 }}>Add</button>
            </div>
            <button onClick={saveBannedWords} disabled={savingWords} style={{ background: YELLOW, border: "none", borderRadius: 9, padding: "9px 18px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: savingWords ? "wait" : "pointer", opacity: savingWords ? 0.6 : 1 }}>{savingWords ? "Saving…" : "Save"}</button>
          </SectionCard>

        </div>
      )}

      {/* ── ANALYTICS TAB ── */}
      {activeTab === "analytics" && (
        <div style={{ padding: `24px ${PAD} 80px` }}>
          {analyticsLoading ? <p style={{ color: "#555", fontSize: 14 }}>Loading analytics…</p> : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
                <StatCard label="TOTAL FOLLOWERS" value={followCount.toLocaleString()} />
                <StatCard label="NEW THIS WEEK" value={thisWeek} sub={`${thisWeek} new follower${thisWeek !== 1 ? "s" : ""}`} />
                <StatCard label="NEW THIS MONTH" value={thisMonth} sub="last 30 days" />
                <StatCard label="PAST STREAMS" value={vods.length} sub="recorded VODs" />
              </div>

              <SectionCard title="Follower Growth — Last 8 Weeks" style={{ marginBottom: 12 }}>
                {analyticsFollowers.length === 0 ? (
                  <p style={{ color: "#333", fontSize: 13 }}>No follower data yet.</p>
                ) : (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
                    {weekBuckets.map((b, i) => (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%" }}>
                        <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                          <div style={{ width: "100%", background: b.count > 0 ? YELLOW : "#1a1a1a", borderRadius: "4px 4px 0 0", height: `${Math.max((b.count / chartMax) * 100, b.count > 0 ? 8 : 4)}%`, transition: "height 0.3s", opacity: i === 7 ? 1 : 0.7 }} />
                        </div>
                        <span style={{ fontSize: 9, color: "#444", whiteSpace: "nowrap" }}>{b.label}</span>
                        {b.count > 0 && <span style={{ fontSize: 10, color: YELLOW, fontWeight: 700 }}>{b.count}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Recent Followers">
                {analyticsFollowers.length === 0 ? (
                  <p style={{ color: "#333", fontSize: 13 }}>No followers yet.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {analyticsFollowers.slice(0, 20).map((f, i) => {
                      const name = f.profiles?.full_name || f.profiles?.username || "A viewer";
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < 19 && i < analyticsFollowers.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg, #312e81, #6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{name[0]?.toUpperCase()}</div>
                            <span style={{ fontSize: 13, color: "#ccc", fontWeight: 500 }}>{name}</span>
                          </div>
                          <span style={{ fontSize: 12, color: "#444" }}>{timeAgo(f.created_at)}</span>
                        </div>
                      );
                    })}
                    {analyticsFollowers.length > 20 && <p style={{ margin: "12px 0 0", fontSize: 12, color: "#444" }}>+ {analyticsFollowers.length - 20} more</p>}
                  </div>
                )}
              </SectionCard>
            </>
          )}
        </div>
      )}

      {/* ── NOTIFICATIONS TAB ── */}
      {activeTab === "notifications" && (
        <div style={{ padding: `24px ${PAD} 80px`, maxWidth: 720 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#fff" }}>Notifications</h2>
            {unreadCount > 0 && (
              <button onClick={markAllRead} disabled={markingRead} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 14px", color: "#888", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                {markingRead ? "…" : "Mark all read"}
              </button>
            )}
          </div>
          {notifsLoading ? <p style={{ color: "#555", fontSize: 14 }}>Loading…</p>
            : notifications.length === 0 ? (
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "48px 24px", textAlign: "center" }}>
                <p style={{ margin: "0 0 8px", fontSize: 28 }}>🔔</p>
                <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600, color: "#fff" }}>No notifications yet</p>
                <p style={{ margin: 0, fontSize: 13, color: "#444" }}>You'll see alerts here when someone follows your channel.</p>
              </div>
            ) : (
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
                {notifications.map((n, i) => (
                  <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: i < notifications.length - 1 ? `1px solid ${BORDER}` : "none", background: n.read ? "transparent" : "rgba(250,204,21,0.02)" }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #312e81, #6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{(n.actor_name || "?")[0]?.toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: "0 0 2px", fontSize: 13, color: n.read ? "#666" : "#fff" }}>
                        <strong style={{ color: n.read ? "#666" : "#fff" }}>{n.actor_name || "Someone"}</strong>
                        {n.type === "follow" ? " followed your channel" : ` — ${n.message}`}
                      </p>
                      <p style={{ margin: 0, fontSize: 11, color: "#444" }}>{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.read && <div style={{ width: 6, height: 6, borderRadius: "50%", background: YELLOW, flexShrink: 0 }} />}
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {/* ── VODS TAB ── */}
      {activeTab === "vods" && (
        <div style={{ padding: `24px ${PAD} 80px` }}>

          {/* Past Streams */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#fff" }}>Past Streams</h2>
            <span style={{ fontSize: 13, color: "#444" }}>{vods.length} recording{vods.length !== 1 ? "s" : ""}</span>
          </div>

          {vodsLoading ? <p style={{ color: "#555", fontSize: 14, marginBottom: 24 }}>Loading VODs…</p>
            : vods.length === 0 ? (
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "40px 24px", textAlign: "center", marginBottom: 24 }}>
                <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600, color: "#fff" }}>No recordings yet</p>
                <p style={{ margin: 0, fontSize: 13, color: "#444" }}>Past streams are saved automatically when you go live.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, marginBottom: 24 }}>
                {vods.map(v => {
                  const metaName = v.meta?.name || "";
                  const isAutoGenerated = !metaName || /peep live/i.test(metaName);
                  const title = isAutoGenerated
                    ? (stream?.stream_title || new Date(v.created).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }))
                    : metaName;
                  const isDeleting = deletingVod === v.uid;
                  const isEditing  = editingVod?.uid === v.uid;
                  return (
                    <div key={v.uid} style={{ background: CARD, border: `1px solid ${isDeleting ? "rgba(239,68,68,0.3)" : BORDER}`, borderRadius: 12, overflow: "hidden" }}>
                      <div onClick={() => setWatchingVod({ url: v.playback?.hls, title })}
                        style={{ position: "relative", aspectRatio: "16/9", background: "#090910", cursor: "pointer", overflow: "hidden" }}
                        onMouseEnter={e => e.currentTarget.querySelector(".vod-play")?.style && (e.currentTarget.querySelector(".vod-play").style.opacity = "1")}
                        onMouseLeave={e => e.currentTarget.querySelector(".vod-play")?.style && (e.currentTarget.querySelector(".vod-play").style.opacity = "0")}>
                        {v.thumbnail
                          ? <img src={v.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.08)"><polygon points="5,3 19,12 5,21" /></svg></div>}
                        <div className="vod-play" style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.15s" }}>
                          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
                          </div>
                        </div>
                        {v.duration && <span style={{ position: "absolute", bottom: 6, right: 8, background: "rgba(0,0,0,0.8)", borderRadius: 4, padding: "2px 6px", fontSize: 11, color: "#fff", fontWeight: 600 }}>{fmtDuration(v.duration)}</span>}
                      </div>
                      <div style={{ padding: "12px 14px" }}>
                        {isEditing ? (
                          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                            <input value={editingVod.title} onChange={e => setEditingVod(ev => ({ ...ev, title: e.target.value }))}
                              onKeyDown={e => { if (e.key === "Enter") saveVodTitle(v.uid, editingVod.title); if (e.key === "Escape") setEditingVod(null); }}
                              style={{ ...inp, padding: "7px 10px", fontSize: 13, flex: 1 }} autoFocus />
                            <button onClick={() => saveVodTitle(v.uid, editingVod.title)} disabled={savingVod} style={{ background: YELLOW, border: "none", borderRadius: 8, padding: "0 12px", color: "#0a0a0a", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{savingVod ? "…" : "Save"}</button>
                            <button onClick={() => setEditingVod(null)} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "0 10px", color: "#666", fontSize: 12, cursor: "pointer" }}>✕</button>
                          </div>
                        ) : (
                          <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 600, color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</p>
                        )}
                        <p style={{ margin: "0 0 10px", fontSize: 11, color: "#444" }}>{new Date(v.created).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</p>
                        {isDeleting ? (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: "#dc2626", flex: 1 }}>Delete this VOD?</span>
                            <button onClick={() => deleteVod(v.uid)} disabled={savingVod} style={{ background: "#dc2626", border: "none", borderRadius: 7, padding: "5px 12px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{savingVod ? "…" : "Yes"}</button>
                            <button onClick={() => setDeletingVod(null)} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "5px 10px", color: "#666", fontSize: 12, cursor: "pointer" }}>No</button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => setWatchingVod({ url: v.playback?.hls, title })} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 0", color: "#bbb", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Watch</button>
                            <button onClick={() => setEditingVod({ uid: v.uid, title })} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "6px 10px", color: "#888", fontSize: 12, cursor: "pointer" }}>Rename</button>
                            <button onClick={() => setDeletingVod(v.uid)} style={{ background: "transparent", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 7, padding: "6px 10px", color: "#dc2626", fontSize: 12, cursor: "pointer" }}>Delete</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          {/* Schedule */}
          <SectionCard title="Upcoming Streams" collapsible defaultOpen={schedule.length > 0}>
            {schedule.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {schedule.map((s, i) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: i < schedule.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                    <div>
                      <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#fff" }}>{s.title}</p>
                      <p style={{ margin: 0, fontSize: 11, color: "#555" }}>
                        {new Date(s.scheduled_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {new Date(s.scheduled_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                    <button onClick={() => deleteSchedule(s.id)} style={{ background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "4px 9px", color: "#333", fontSize: 11, cursor: "pointer" }}>✕</button>
                  </div>
                ))}
              </div>
            )}
            {schedule.length === 0 && <p style={{ margin: "0 0 14px", fontSize: 13, color: "#333" }}>No streams scheduled yet.</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input value={schedTitle} onChange={e => setSchedTitle(e.target.value)} placeholder="Stream title…" style={inp} />
              <input type="datetime-local" value={schedDate} onChange={e => setSchedDate(e.target.value)} style={{ ...inp, colorScheme: "dark" }} />
              <button onClick={addSchedule} disabled={addingSched || !schedTitle.trim() || !schedDate}
                style={{ background: YELLOW, border: "none", borderRadius: 9, padding: "10px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: !schedTitle.trim() || !schedDate ? 0.4 : 1 }}>
                {addingSched ? "…" : "Add to Schedule"}
              </button>
            </div>
          </SectionCard>

        </div>
      )}

      {toast && <Toast msg={toast} />}

      {/* VOD player */}
      {watchingVod && (
        vodExpanded ? (
          <div onClick={() => setVodExpanded(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: "min(860px, calc(100vw - 48px))", background: "#111", border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.9)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: `1px solid ${BORDER}` }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>{watchingVod.title}</p>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setVodExpanded(false)} title="Minimize" style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 5, width: 28, height: 28, color: "#aaa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="21" y2="3"/><line x1="3" y1="21" x2="14" y2="10"/></svg>
                  </button>
                  <button onClick={() => { setWatchingVod(null); setVodExpanded(false); }} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 5, width: 28, height: 28, color: "#aaa", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                </div>
              </div>
              <VodPlayer url={watchingVod.url} />
            </div>
          </div>
        ) : (
          <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 200, width: "min(340px, calc(100vw - 32px))", background: "#111", border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,0.8)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: `1px solid ${BORDER}` }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>{watchingVod.title}</p>
              <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                <button onClick={() => setVodExpanded(true)} title="Expand" style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 5, width: 26, height: 26, color: "#aaa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                </button>
                <button onClick={() => { setWatchingVod(null); setVodExpanded(false); }} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 5, width: 26, height: 26, color: "#aaa", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              </div>
            </div>
            <VodPlayer url={watchingVod.url} />
          </div>
        )
      )}
    </div>
  );
}
