import { useState, useEffect, useRef, useMemo, Component } from "react";
import Hls from "hls.js";
import { supabase } from "./supabase";
import { AuthModal } from "./components/AuthModal";
import { LandingPage } from "./pages/LandingPage";
import { PaywallPage } from "./pages/PaywallPage";
import { ProfileScreen, avatarForId, PRESET_AVATARS } from "./components/ProfileScreen";
import { ProfileSelect } from "./components/ProfileSelect";
import { CreatorDashboard } from "./pages/CreatorDashboard";

class PlayerErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#fff", gap: 16, padding: 32 }}>
          <p style={{ color: "#f87171", fontSize: 14, maxWidth: 600, textAlign: "center" }}>Player error: {this.state.error.message}</p>
          <button onClick={() => { this.setState({ error: null }); this.props.onBack?.(); }} style={{ background: "#facc15", border: "none", borderRadius: 8, padding: "10px 24px", color: "#0a0a0a", fontWeight: 700, cursor: "pointer" }}>← Go Back</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const PAD = "clamp(16px, 5vw, 96px)";
const CARD_W = "clamp(130px, 38vw, 252px)";
const SAFE_TOP = window.location.protocol === "capacitor:" ? 50 : 0;

function useIsMobile() {
  const [is, setIs] = useState(window.innerWidth < 640);
  useEffect(() => {
    const h = () => setIs(window.innerWidth < 640);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return is;
}

export default function App() {
  const [page, setPage] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const pg = p.get("page");
    if (pg === "settings" || pg === "profile" || pg === "creator") return pg;
    return "home";
  });
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [selectedShow, setSelectedShow] = useState(null);
  const [selectedPodcast, setSelectedPodcast] = useState(null);
  const [selectedPodcastEp, setSelectedPodcastEp] = useState(null);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [myList, setMyList] = useState({});
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [userAvatarId, setUserAvatarId] = useState(null);
  const [activeProfile, setActiveProfile] = useState(null);
  const userIdRef = useRef(null);
  const [subscription, setSubscription] = useState(null);
  const [subChecked, setSubChecked] = useState(false);
  const [isStreamer, setIsStreamer] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(() => {
    // Catch invite links — Supabase puts type=invite in the hash; must read it before Supabase clears it
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return hash.get("type") === "invite" ? "invite" : false;
  });
  const [userRole, setUserRole] = useState(null);
  const [creatorRecord, setCreatorRecord] = useState(null);
  const [betaAck, setBetaAck] = useState(() => localStorage.getItem("peep_beta_ack") === "true");
  // Capture deep-link params before any effect clears the URL
  const [deepLink] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return { v: p.get("v"), e: p.get("e"), s: p.get("s"), live: p.get("live"), podcast: p.get("podcast") };
  });

  useEffect(() => {
    supabase.from("app_settings").select("key, value").in("key", ["maintenance_mode"]).then(({ data }) => {
      const s = {};
      (data || []).forEach(r => { s[r.key] = r.value; });
      setMaintenanceMode(s.maintenance_mode === "true");
    });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const { data: blocked } = await supabase.from("blocked_users").select("id").eq("email", session.user.email).maybeSingle();
        if (blocked) { await supabase.auth.signOut(); setAuthChecked(true); return; }
        userIdRef.current = session.user.id;
        // Load avatar + role in one query
        const { data: profile } = await supabase.from("profiles").select("avatar_id, role").eq("id", session.user.id).maybeSingle();
        if (profile?.avatar_id) setUserAvatarId(profile.avatar_id);
        setUserRole(profile?.role || "viewer");
      }
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (_event === "PASSWORD_RECOVERY") { setPasswordRecovery(true); return; }
      if (_event === "USER_UPDATED" && session?.user?.email) {
        const { id, email } = session.user;
        supabase.from("profiles").update({ email }).eq("id", id);
        supabase.from("subscriptions").update({ email }).eq("user_id", id);
      }
      if (_event === "SIGNED_IN") {
        sessionStorage.removeItem("lastAdAt");
        if (session?.user) {
          supabase.from("profiles").select("avatar_id, role").eq("id", session.user.id).maybeSingle()
            .then(({ data }) => { if (data?.avatar_id) setUserAvatarId(data.avatar_id); setUserRole(data?.role || "viewer"); });
        }
      }
      if (!session?.user) {
        setMyList({});
        setActiveProfile(null);
        setUserRole(null);
        if (userIdRef.current) localStorage.removeItem(`peep_profile_${userIdRef.current}`);
        userIdRef.current = null;
      } else {
        userIdRef.current = session.user.id;
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Check if viewer-role user is also a creator partner (for in-app creator portal link)
  useEffect(() => {
    if (!user?.email || userRole === "creator") { setCreatorRecord(null); return; }
    supabase.from("creators").select("id, name, email, payment_method, payment_handle, status")
      .eq("email", user.email.toLowerCase()).eq("status", "active").maybeSingle()
      .then(({ data }) => setCreatorRecord(data ?? null));
  }, [user?.email, userRole]);

  // Load saved profile from localStorage when user is known
  useEffect(() => {
    if (!user) { setActiveProfile(null); return; }
    try {
      const stored = JSON.parse(localStorage.getItem(`peep_profile_${user.id}`));
      setActiveProfile(stored ?? null);
    } catch { setActiveProfile(null); }
  }, [user?.id]);

  // Reload My List whenever the active profile changes
  useEffect(() => {
    if (!user || !activeProfile) { setMyList({}); return; }
    loadMyList(user.id, activeProfile.id);
  }, [user?.id, activeProfile?.id]);


  // Check subscription status
  useEffect(() => {
    if (!user) { setSubscription(null); setSubChecked(false); return; }
    const params = new URLSearchParams(window.location.search);
    const justSubscribed = params.get("subscribed") === "1";
    if (justSubscribed) history.replaceState(null, "", "/");

    async function fetchSub(retries = 0) {
      const { data } = await supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle();
      if (!data && justSubscribed && retries < 8) {
        // Webhook may not have fired yet — poll up to ~8s
        await new Promise(r => setTimeout(r, 1000));
        return fetchSub(retries + 1);
      }
      setSubscription(data);
      setSubChecked(true);
    }
    fetchSub();
  }, [user?.id]);

  // Presence heartbeat — mark this user online while browsing
  useEffect(() => {
    if (!user) return;
    const ping = () => supabase.from("user_presence").upsert(
      { user_id: user.id, last_seen: new Date().toISOString(), current_page: page, profile_id: activeProfile?.id ?? null },
      { onConflict: "user_id" }
    ).then(() => {});
    ping();
    const t = setInterval(ping, 60000);
    return () => clearInterval(t);
  }, [user?.id, page, activeProfile?.id]);

  function selectProfile(profile) {
    setActiveProfile(profile);
    localStorage.setItem(`peep_profile_${user.id}`, JSON.stringify(profile));
  }

  function switchProfile() {
    setActiveProfile(null);
    if (user) localStorage.removeItem(`peep_profile_${user.id}`);
  }

  async function loadAvatarId(userId) {
    const { data } = await supabase.from("profiles").select("avatar_id").eq("id", userId).maybeSingle();
    if (data?.avatar_id) setUserAvatarId(data.avatar_id);
  }

  async function loadMyList(userId, profileId) {
    const { data } = await supabase.from("user_list").select("content_id, content_type")
      .eq("user_id", userId).eq("profile_id", profileId);
    if (data) {
      const map = {};
      data.forEach(item => { map[`${item.content_type}_${item.content_id}`] = true; });
      setMyList(map);
    }
  }

  async function toggleList(contentId, contentType) {
    if (!user || !activeProfile) { setAuthOpen(true); return; }
    const key = `${contentType}_${contentId}`;
    if (myList[key]) {
      await supabase.from("user_list").delete()
        .eq("user_id", user.id).eq("profile_id", activeProfile.id)
        .eq("content_id", contentId).eq("content_type", contentType);
      setMyList(prev => { const next = { ...prev }; delete next[key]; return next; });
    } else {
      await supabase.from("user_list").insert({
        user_id: user.id, profile_id: activeProfile.id,
        content_id: contentId, content_type: contentType,
      });
      setMyList(prev => ({ ...prev, [key]: true }));
    }
  }

  const goHome = () => { sessionStorage.setItem("peep_nav", "Home"); setPage("home"); setSelectedVideo(null); setSelectedShow(null); setSelectedPodcast(null); setSelectedPodcastEp(null); };

  // Keep URL in sync with navigation so share links work
  useEffect(() => {
    if (page === "player" && selectedVideo) {
      const t = selectedVideo._type;
      if (t === "live" || t === "live_epg") history.replaceState(null, "", `?live=${selectedVideo.id}`);
      else if (selectedVideo.show_id) history.replaceState(null, "", `?e=${selectedVideo.id}`);
      else history.replaceState(null, "", `?v=${selectedVideo.id}`);
    } else if (page === "show" && selectedShow) {
      history.replaceState(null, "", `?s=${selectedShow.id}`);
    } else if (page === "podcast" && selectedPodcast) {
      history.replaceState(null, "", `?podcast=${selectedPodcast.id}`);
    } else if (page === "settings") {
      history.replaceState(null, "", "?page=settings");
    } else if (page === "profile") {
      history.replaceState(null, "", "?page=profile");
    } else if (page === "creator") {
      history.replaceState(null, "", "?page=creator");
    } else if (page === "home") {
      history.replaceState(null, "", "/");
    }
  }, [page, selectedVideo?.id, selectedShow?.id, selectedPodcast?.id]);

  const listProps = { user, myList, onToggleList: toggleList, onAuthOpen: () => setAuthOpen(true), onProfileOpen: () => setPage("profile"), userAvatarId, activeProfile, onSwitchProfile: switchProfile, onPodcastSelect: pod => { setSelectedPodcast(pod); setPage("podcast"); }, onViewProfile: () => setPage("profile") };


  if (maintenanceMode) return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", gap: 16 }}>
      <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 48, color: "#facc15" }}>peep.</span>
      <p style={{ color: "#fff", fontSize: 22, fontWeight: 600, margin: 0 }}>We'll be right back.</p>
      <p style={{ color: "#555", fontSize: 14, margin: 0 }}>We're doing some maintenance. Check back shortly.</p>
    </div>
  );

  if (!authChecked) return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, color: "#facc15", opacity: 0.8 }}>peep.</span>
    </div>
  );
  if (passwordRecovery) return <PasswordResetPage isInvite={passwordRecovery === "invite"} onDone={() => { setPasswordRecovery(false); window.location.href = "/"; }} />;
  if (!user) return <LandingPage />;
  if (!user.email_confirmed_at) return <EmailVerificationGate user={user} />;
  if (userRole === "creator") return <CreatorDashboard user={user} onSignOut={async () => { await supabase.auth.signOut(); window.location.href = "/"; }} />;
  if (!activeProfile) return <ProfileSelect user={user} onSelect={selectProfile} />;
  const isOwner = user?.email?.toLowerCase() === "jacob.furlow@outlook.com";
  if (!isOwner && subChecked && (!subscription || subscription.status !== "active")) {
    return <PaywallPage user={user} onSubscribed={() => window.location.href = "/?subscribed=1"} onSignOut={async () => { await supabase.auth.signOut(); window.location.href = "/"; }} />;
  }

  const profileScreenEl = profileOpen && <ProfileScreen user={user} activeProfile={activeProfile} onClose={() => setProfileOpen(false)} onAvatarChange={id => setUserAvatarId(id)} onProfileUpdate={updated => { setActiveProfile(updated); localStorage.setItem(`peep_profile_${user.id}`, JSON.stringify(updated)); }} onSwitchProfile={switchProfile} onViewProfile={() => { setProfileOpen(false); setPage("profile"); }} onOpenSettings={() => { setProfileOpen(false); setPage("settings"); }} onCreatorDash={creatorRecord ? () => { setProfileOpen(false); setPage("creator"); } : null} />;

  if (page === "player" && selectedVideo) {
    const isLiveVideo = selectedVideo._type === "live" || selectedVideo._type === "live_epg";
    const handleBack = () => {
      if (isLiveVideo) sessionStorage.setItem("peep_goto_nav", "Streams");
      setPage(selectedShow ? "show" : "home");
      setSelectedVideo(null);
    };
    return (
      <>
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
        {profileScreenEl}
        <PlayerErrorBoundary onBack={handleBack}>
          <PlayerView
            key={selectedVideo.id}
            video={selectedVideo}
            onBack={handleBack}
            onGoHome={goHome}
            onSelect={v => setSelectedVideo(v)}
            onShowSelect={s => { setSelectedShow(s); setPage("show"); setSelectedVideo(null); }}
            {...listProps}
          />
        </PlayerErrorBoundary>
      </>
    );
  }

  if (page === "show" && selectedShow)
    return (
      <>
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
        {profileScreenEl}
        <ShowDetail
          show={selectedShow}
          onBack={() => { setSelectedShow(null); setPage("home"); }}
          onGoHome={goHome}
          onPlay={v => { setSelectedVideo(v); setPage("player"); }}
          onShowSelect={s => setSelectedShow(s)}
          {...listProps}
        />
      </>
    );

  if (page === "podcast" && selectedPodcast)
    return (
      <>
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
        {profileScreenEl}
        <PodcastDetail
          podcast={selectedPodcast}
          onBack={() => { setSelectedPodcast(null); setPage("home"); }}
          onGoHome={goHome}
          onPlay={ep => { setSelectedPodcastEp(ep); setPage("podcast_player"); }}
          {...listProps}
        />
      </>
    );

  if (page === "podcast_player" && selectedPodcastEp)
    return (
      <>
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
        {profileScreenEl}
        <PodcastPlayerView
          episode={selectedPodcastEp}
          podcast={selectedPodcast}
          onBack={() => setPage("podcast")}
          onGoHome={goHome}
          onSelect={ep => setSelectedPodcastEp(ep)}
          {...listProps}
        />
      </>
    );

  if (page === "settings")
    return (
      <>
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
        <SettingsPage
          user={user}
          activeProfile={activeProfile}
          isOwner={isOwner}
          onBack={() => setPage("home")}
          onGoHome={goHome}
          onProfileUpdate={updated => {
            setActiveProfile(updated);
            localStorage.setItem(`peep_profile_${user.id}`, JSON.stringify(updated));
          }}
          onAvatarChange={id => setUserAvatarId(id)}
          onSignOut={async () => { await supabase.auth.signOut(); window.location.href = "/"; }}
        />
      </>
    );

  if (page === "profile")
    return (
      <>
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
        <ProfilePage
          user={user}
          activeProfile={activeProfile}
          onBack={() => setPage("home")}
          onGoHome={goHome}
          onProfileUpdate={updated => {
            setActiveProfile(updated);
            localStorage.setItem(`peep_profile_${user.id}`, JSON.stringify(updated));
          }}
          onOpenSettings={() => setPage("settings")}
          onAvatarChange={id => setUserAvatarId(id)}
          onSignOut={async () => { await supabase.auth.signOut(); window.location.href = "/"; }}
        />
      </>
    );

  if (page === "creator" && creatorRecord)
    return (
      <>
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
        <CreatorPortalPage
          user={user}
          onBack={() => setPage("home")}
          onGoHome={goHome}
        />
      </>
    );

  return (
    <>
      {!betaAck && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(20px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", padding: 24 }}>
          <div style={{ position: "relative", background: "linear-gradient(160deg, #111 0%, #0d0d0d 100%)", border: "1px solid #222", borderRadius: 24, padding: "48px 40px 40px", maxWidth: 400, width: "100%", textAlign: "center", overflow: "hidden", boxShadow: "0 40px 100px rgba(0,0,0,0.6)" }}>
            {/* Orb glow */}
            <div style={{ position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)", width: 300, height: 200, background: "radial-gradient(ellipse, rgba(250,204,21,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />
            {/* Top accent line */}
            <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: 1, background: "linear-gradient(90deg, transparent, rgba(250,204,21,0.4), transparent)" }} />

            <div style={{ position: "relative" }}>
              <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 44, color: "#facc15", display: "block", marginBottom: 18, letterSpacing: "-0.01em" }}>peep.</span>

              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(250,204,21,0.07)", border: "1px solid rgba(250,204,21,0.18)", borderRadius: 100, padding: "6px 16px", marginBottom: 28 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#facc15", display: "inline-block", boxShadow: "0 0 6px #facc15" }} />
                <span style={{ fontSize: 10, color: "#facc15", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>Early Access</span>
              </div>

              <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.15 }}>We're still building.</h2>
              <p style={{ margin: "0 0 36px", fontSize: 14, color: "#4a4a4a", lineHeight: 1.85 }}>
                You might run into rough edges or missing features — we're working on it every day. Thanks for being here early.
              </p>

              <button
                onClick={() => { localStorage.setItem("peep_beta_ack", "true"); setBetaAck(true); }}
                style={{ width: "100%", background: "#facc15", border: "none", borderRadius: 12, padding: "15px 0", color: "#0a0a0a", fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s", letterSpacing: "-0.01em" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.02)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(250,204,21,0.3)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}
              >
                Let's go →
              </button>
            </div>
          </div>
        </div>
      )}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      {profileScreenEl}
      <Homepage
        onPlay={v => { setSelectedVideo(v); setPage("player"); }}
        onShowSelect={s => { setSelectedShow(s); setPage("show"); }}
{...listProps}
      />
    </>
  );
}

// ─── Notification Bell ────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}


function NotifBell({ user }) {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const bellRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("viewer_notifications")
      .select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(30)
      .then(({ data }) => setNotifs(data || []));

    const ch = supabase.channel(`viewer-notifs-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "viewer_notifications", filter: `user_id=eq.${user.id}` },
        ({ new: row }) => setNotifs(prev => [row, ...prev].slice(0, 30))
      ).subscribe();
    return () => supabase.removeChannel(ch);
  }, [user?.id]);

  const unread = notifs.filter(n => !n.read).length;

  async function markAllRead() {
    await supabase.from("viewer_notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  }

  function toggle() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && unread > 0) markAllRead();
  }

  useEffect(() => {
    if (!open) return;
    function handler(e) { if (!bellRef.current?.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!user) return null;

  return (
    <div ref={bellRef} style={{ position: "relative" }}>
      <button onClick={toggle} title="Notifications" style={{ background: "none", border: "none", color: open ? "#fff" : "rgba(255,255,255,0.65)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", position: "relative", transition: "color 0.15s" }}
        onMouseEnter={e => e.currentTarget.style.color = "#fff"}
        onMouseLeave={e => { if (!open) e.currentTarget.style.color = "rgba(255,255,255,0.65)"; }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <div style={{ position: "absolute", top: 0, right: 0, minWidth: 15, height: 15, background: "#ef4444", borderRadius: 8, fontSize: 9, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", lineHeight: 1 }}>
            {unread > 9 ? "9+" : unread}
          </div>
        )}
      </button>

      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 12px)", width: 310, background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, overflow: "hidden", zIndex: 200, boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#e5e5e5" }}>Notifications</p>
          </div>
          {notifs.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center" }}>
              <p style={{ margin: 0, color: "#3a3a3a", fontSize: 13 }}>No notifications yet</p>
              <p style={{ margin: "6px 0 0", color: "#2a2a2a", fontSize: 12 }}>Follow a streamer to get go-live alerts</p>
            </div>
          ) : (
            <div style={{ maxHeight: 380, overflowY: "auto" }}>
              {notifs.map(n => (
                <a key={n.id} href={`/stream/${n.stream_slug}`}
                  onClick={() => setOpen(false)}
                  style={{ display: "block", padding: "12px 16px", textDecoration: "none", borderBottom: "1px solid #141414", background: n.read ? "transparent" : "rgba(239,68,68,0.05)", transition: "background 0.12s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                  onMouseLeave={e => { e.currentTarget.style.background = n.read ? "transparent" : "rgba(239,68,68,0.05)"; }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", marginTop: 6, flexShrink: 0, opacity: n.read ? 0 : 1, transition: "opacity 0.2s" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#e0e0e0" }}>
                        {n.channel_name} <span style={{ fontWeight: 400, color: "#666" }}>is live</span>
                      </p>
                      {n.stream_title && <p style={{ margin: "0 0 3px", fontSize: 12, color: "#555", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.stream_title}</p>}
                      <p style={{ margin: 0, fontSize: 11, color: "#383838" }}>{timeAgo(n.created_at)}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite" }} />
                      <span style={{ fontSize: 10, fontWeight: 800, color: "#ef4444", letterSpacing: 0.5 }}>LIVE</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Homepage ─────────────────────────────────────────────────────────────────

function Homepage({ onPlay, onShowSelect, onPodcastSelect, user, myList, onToggleList, onAuthOpen, onProfileOpen, userAvatarId, activeProfile, onSwitchProfile }) {
  const [videos, setVideos] = useState([]);
  const [shows, setShows] = useState([]);
  const [carousels, setCarousels] = useState([]);
  const [podcasts, setPodcasts] = useState([]);
  const [liveStreams, setLiveStreams] = useState([]);
  const [epgEntries, setEpgEntries] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchTypeFilter, setSearchTypeFilter] = useState("all");
  const [recentSearches, setRecentSearches] = useState(() => { try { return JSON.parse(localStorage.getItem("peep_recent_searches") || "[]"); } catch { return []; } });
  const [activeNav, setActiveNav] = useState(() => {
    const goto = sessionStorage.getItem("peep_goto_nav");
    if (goto) { sessionStorage.removeItem("peep_goto_nav"); return goto; }
    return sessionStorage.getItem("peep_nav") || "Home";
  });
  const [footerModal, setFooterModal] = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => { sessionStorage.setItem("peep_nav", activeNav); }, [activeNav]);



  useEffect(() => {
    fetchAll();

    const videoChannel = supabase.channel("videos-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "videos" }, fetchAll)
      .subscribe();
    const showChannel = supabase.channel("shows-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "shows" }, fetchAll)
      .subscribe();
    const carouselChannel = supabase.channel("carousels-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "carousels" }, fetchAll)
      .subscribe();
    const podcastChannel = supabase.channel("podcasts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "podcasts" }, fetchAll)
      .subscribe();
    const liveChannel = supabase.channel("live-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_streams" }, fetchAll)
      .subscribe();
    const epgChannel = supabase.channel("epg-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "epg_entries" }, fetchAll)
      .subscribe();
    const handler = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handler);

    return () => {
      supabase.removeChannel(videoChannel);
      supabase.removeChannel(showChannel);
      supabase.removeChannel(carouselChannel);
      supabase.removeChannel(podcastChannel);
      supabase.removeChannel(liveChannel);
      supabase.removeChannel(epgChannel);
      window.removeEventListener("scroll", handler);
    };
  }, []);

  useEffect(() => { loadContinueWatching(); }, [user, activeProfile]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 150);
    return () => clearTimeout(t);
  }, [searchQuery]);

  async function fetchAll() {
    const epgWindowStart = new Date(Date.now() - 60 * 60 * 1000);
    const epgWindowEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [videosRes, showsRes, carouselsRes, podcastsRes, liveRes, epgRes] = await Promise.all([
      supabase.from("videos").select("*").order("id", { ascending: true }),
      supabase.from("shows").select("*").order("id", { ascending: true }),
      supabase.from("carousels").select("*").eq("enabled", true).order("position", { ascending: true }),
      supabase.from("podcasts").select("*").order("id", { ascending: true }),
      supabase.from("live_streams").select("*").order("id", { ascending: true }),
      supabase.from("epg_entries").select("*").gte("end_time", epgWindowStart.toISOString()).lte("start_time", epgWindowEnd.toISOString()).order("start_time", { ascending: true }),
    ]);
    if (videosRes.data) setVideos(videosRes.data);
    if (showsRes.data) setShows(showsRes.data);
    if (carouselsRes.data) setCarousels(carouselsRes.data);
    if (podcastsRes.data) setPodcasts(podcastsRes.data.filter(p => p.enabled !== false));
    if (liveRes.data) setLiveStreams(liveRes.data);
    if (epgRes.data) setEpgEntries(epgRes.data);
    setLoading(false);

    // Resolve deep link
    const { v, e, s, live, podcast } = deepLink;
    if (v && videosRes.data) {
      const vid = videosRes.data.find(x => String(x.id) === v);
      if (vid) { setSelectedVideo({ ...vid, _type: "movie" }); setPage("player"); }
    } else if (e) {
      const { data: ep } = await supabase.from("episodes").select("*").eq("id", e).maybeSingle();
      if (ep) {
        const show = showsRes.data?.find(x => String(x.id) === String(ep.show_id));
        if (show) setSelectedShow(show);
        setSelectedVideo({ ...ep, _type: "episode" });
        setPage("player");
      }
    } else if (s && showsRes.data) {
      const show = showsRes.data.find(x => String(x.id) === s);
      if (show) { setSelectedShow(show); setPage("show"); }
    } else if (live && liveRes.data) {
      const stream = liveRes.data.find(x => String(x.id) === live);
      if (stream) { setSelectedVideo({ ...stream, url: stream.stream_url, _type: "live" }); setPage("player"); }
    } else if (podcast && podcastsRes.data) {
      const pod = podcastsRes.data.find(x => String(x.id) === podcast);
      if (pod) { setSelectedPodcast(pod); setPage("podcast"); }
    }
  }

  async function handleRemoveCW(item) {
    if (!user || !activeProfile) return;
    const ct = item._type === "episode" ? "episode" : "movie";
    await supabase.from("watch_progress").upsert(
      { user_id: user.id, profile_id: activeProfile.id, content_id: item.id, content_type: ct, completed: true, last_watched_at: new Date().toISOString() },
      { onConflict: "user_id,profile_id,content_id,content_type" }
    );
    setContinueWatching(prev => prev.filter(i => !(i._type === item._type && i.id === item.id)));
  }

  async function loadContinueWatching() {
    if (!user || !activeProfile) { setContinueWatching([]); return; }

    // Fetch all incomplete progress (movies + episodes)
    const { data: progress } = await supabase.from("watch_progress").select("*")
      .eq("user_id", user.id).eq("profile_id", activeProfile.id).eq("completed", false)
      .order("last_watched_at", { ascending: false }).limit(50);
    if (!progress || progress.length === 0) { setContinueWatching([]); return; }

    const movieIds = progress.filter(p => p.content_type === "movie").map(p => p.content_id);
    const incompleteEpIds = progress.filter(p => p.content_type === "episode").map(p => p.content_id);

    // Fetch movies and the incomplete episodes (to get show_ids)
    const [movRes, incompleteEpRes] = await Promise.all([
      movieIds.length ? supabase.from("videos").select("*").in("id", movieIds) : { data: [] },
      incompleteEpIds.length ? supabase.from("episodes").select("id,show_id,season,episode_number,title,thumbnail").in("id", incompleteEpIds) : { data: [] },
    ]);

    const pMap = {};
    progress.forEach(p => { pMap[`${p.content_type}_${p.content_id}`] = p; });

    // Track when each show was last touched (for sorting)
    const showLastWatched = {};
    (incompleteEpRes.data || []).forEach(e => {
      if (!e.show_id) return;
      const t = new Date(pMap[`episode_${e.id}`]?.last_watched_at || 0).getTime();
      if (!showLastWatched[e.show_id] || t > showLastWatched[e.show_id]) showLastWatched[e.show_id] = t;
    });

    const showIds = Object.keys(showLastWatched);

    // For each show: fetch ALL its episodes + ALL user progress, then pick the first unwatched
    let showItems = [];
    if (showIds.length) {
      const [allEpRes, allProgRes, showMetaRes] = await Promise.all([
        supabase.from("episodes").select("*").in("show_id", showIds)
          .order("season", { ascending: true }).order("episode_number", { ascending: true }),
        supabase.from("watch_progress").select("content_id,completed,progress_seconds,duration_seconds,last_watched_at")
          .eq("user_id", user.id).eq("profile_id", activeProfile.id).eq("content_type", "episode"),
        supabase.from("shows").select("id,title,thumbnail,poster").in("id", showIds),
      ]);

      const allEps = allEpRes.data || [];
      const allProgMap = {};
      (allProgRes.data || []).forEach(p => { allProgMap[p.content_id] = p; });
      const showMeta = {};
      (showMetaRes.data || []).forEach(s => { showMeta[s.id] = s; });

      const epsByShow = {};
      allEps.forEach(e => { (epsByShow[e.show_id] = epsByShow[e.show_id] || []).push(e); });

      for (const showId of showIds) {
        const eps = epsByShow[showId] || [];
        // Find first episode that isn't completed (includes never-started)
        const nextEp = eps.find(e => !allProgMap[e.id]?.completed);
        if (!nextEp) continue; // all episodes completed — drop from Continue Watching
        showItems.push({
          ...nextEp,
          _type: "episode",
          _show: showMeta[showId] || null,
          _progress: allProgMap[nextEp.id] || { progress_seconds: 0, duration_seconds: 0 },
          _lastWatched: showLastWatched[showId] || 0,
        });
      }
    }

    const movieItems = (movRes.data || []).map(v => ({
      ...v, _type: "movie", _progress: pMap[`movie_${v.id}`],
      _lastWatched: new Date(pMap[`movie_${v.id}`]?.last_watched_at || 0).getTime(),
    }));

    setContinueWatching(
      [...movieItems, ...showItems].sort((a, b) => b._lastWatched - a._lastWatched)
    );
  }

  const allContent = useMemo(() => [
    ...videos.map(v => ({ ...v, _type: "movie" })),
    ...shows.map(s => ({ ...s, _type: "show" })),
  ], [videos, shows]);

  const filteredContent = useMemo(() => activeNav === "Movies"
    ? allContent.filter(v => v._type === "movie")
    : activeNav === "Series"
    ? allContent.filter(v => v._type === "show")
    : allContent,
  [allContent, activeNav]);

  const featuredVideo = useMemo(() => videos.find(v => v.featured) ?? null, [videos]);
  const featuredShow = useMemo(() => shows.find(s => s.featured) ?? null, [shows]);
  const featured = featuredVideo ?? featuredShow ?? videos[0] ?? shows[0] ?? null;
  const featuredIsShow = featured !== null && featured === (featuredShow ?? null) && !featuredVideo;

  const featuredCategoryRank = useMemo(() => {
    if (!featured?.category) return null;
    const cat = featured.category.toLowerCase();
    const allInCat = [
      ...videos.filter(v => v.category?.toLowerCase() === cat).map(v => ({ id: v.id, _type: "movie", views: v.view_count || 0 })),
      ...shows.filter(s => s.category?.toLowerCase() === cat).map(s => ({ id: s.id, _type: "show", views: s.view_count || 0 })),
    ].sort((a, b) => b.views - a.views);
    const featuredType = featuredIsShow ? "show" : "movie";
    const rank = allInCat.findIndex(v => v.id === featured.id && v._type === featuredType) + 1;
    return rank > 0 ? rank : null;
  }, [featured, featuredIsShow, videos, shows]);

  const visibleCarousels = useMemo(() => carousels.filter(c => {
    if (!c.enabled) return false;
    const pages = (c.pages || "home").split(",").map(p => p.trim());
    if (activeNav === "Home") return pages.includes("home");
    if (activeNav === "Movies") return pages.includes("shorts");
    if (activeNav === "Series") return pages.includes("series");
    return false;
  }), [carousels, activeNav]);

  const sections = useMemo(() => activeNav === "My List"
    ? []
    : activeNav === "Streams"
    ? []
    : activeNav === "Podcasts"
    ? [{ id: "all-podcasts", title: "All Podcasts", isPodcast: true, videos: [], podcastItems: podcasts }]
    : visibleCarousels.length > 0
    ? visibleCarousels.map(c => {
        const filterVal = c.filter_value?.toLowerCase();
        if (c.type === "podcast") {
          const podItems = filterVal
            ? podcasts.filter(p => Array.isArray(p.tags) ? p.tags.some(t => t.toLowerCase() === filterVal) : p.tags?.toLowerCase().includes(filterVal))
            : podcasts;
          return { id: String(c.id), title: c.title, videos: [], isPodcast: true, podcastItems: podItems };
        }
        const baseItems = c.type === "trending"
          ? [...filteredContent].reverse()
          : c.type === "category"
          ? filteredContent.filter(v => v.category?.toLowerCase() === filterVal)
          : c.type === "handpicked"
          ? (() => { try { const picks = JSON.parse(c.filter_value || "[]"); return picks.flatMap(p => { const found = filteredContent.find(v => v.id === p.id && v._type === p.type); return found ? [found] : []; }); } catch { return filteredContent; } })()
          : filteredContent;
        const items = c.content_type === "shorts" ? baseItems.filter(v => v._type === "movie")
          : c.content_type === "shows" ? baseItems.filter(v => v._type === "show")
          : baseItems;
        return { id: String(c.id), title: c.title, videos: items, numbered: c.type === "trending" };
      }).filter(s => s.isPodcast ? s.podcastItems.length > 0 : s.videos.length > 0)
    : visibleCarousels.length === 0 && carousels.length > 0 ? []
    : [
        { id: "trending", title: "Trending Now", videos: [...filteredContent].reverse(), numbered: true },
        ...[...new Set(filteredContent.map(v => v.category).filter(Boolean))].map(cat => ({
          id: cat, title: `${cat} Films`, videos: filteredContent.filter(v => v.category === cat),
        })),
      ],
  [activeNav, allContent, filteredContent, visibleCarousels, podcasts, carousels, myList]);

  const searchPool = useMemo(() => {
    const tagsStr = (tags) => Array.isArray(tags) ? tags.join(" ") : (tags || "");
    return [
      ...videos.map(v => ({ ...v, _type: "movie", _tagsStr: tagsStr(v.tags) })),
      ...shows.map(s => ({ ...s, _type: "show", _tagsStr: tagsStr(s.tags) })),
      ...podcasts.map(p => ({ ...p, _type: "podcast", _tagsStr: tagsStr(p.tags) })),
      ...liveStreams.map(s => ({ ...s, _type: "stream", title: s.channel_name || s.title || "", _tagsStr: tagsStr(s.tags) })),
    ];
  }, [videos, shows, podcasts, liveStreams]);

  const searchResults = useMemo(() => {
    if (!debouncedQuery || !debouncedQuery.trim()) return [];
    const q = debouncedQuery.toLowerCase().trim();
    return searchPool.filter(v => {
      if (searchTypeFilter !== "all") {
        if (searchTypeFilter !== "all" && v._type !== searchTypeFilter) return false;
      }
      const titleWords = v.title?.toLowerCase().split(/\s+/) || [];
      const titleMatch = titleWords.some(w => w.startsWith(q));
      if (q.length < 2) return titleMatch;
      return (
        titleMatch ||
        v.title?.toLowerCase().includes(q) ||
        v.category?.toLowerCase().includes(q) ||
        v.description?.toLowerCase().includes(q) ||
        v._tagsStr.toLowerCase().includes(q)
      );
    });
  }, [debouncedQuery, searchPool, searchTypeFilter]);

  function closeSearch() {
    setSearchQuery("");
    setDebouncedQuery("");
    setSearchOpen(false);
    setSearchTypeFilter("all");
  }

  function saveRecentSearch(q) {
    if (!q.trim()) return;
    const updated = [q, ...recentSearches.filter(s => s !== q)].slice(0, 6);
    setRecentSearches(updated);
    localStorage.setItem("peep_recent_searches", JSON.stringify(updated));
  }

  function handleSearchResultClick(item) {
    saveRecentSearch(searchQuery);
    closeSearch();
    if (item._type === "stream") {
      const slug = item.username || (item.channel_name || item.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      window.location.href = `/stream/${slug}`;
    } else if (item._type === "show") onShowSelect(item);
    else if (item._type === "podcast") { setSelectedPodcast(item); setPage("podcast"); }
    else onPlay(item);
  }

  function handleClick(item) {
    item._type === "show" ? onShowSelect(item) : onPlay(item);
  }

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>
      <style>{`.scroll-row::-webkit-scrollbar { display: none; }`}</style>

      {/* Navbar */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingTop: isMobile ? "max(env(safe-area-inset-top), 44px)" : 14, paddingBottom: 14, paddingLeft: PAD, paddingRight: PAD,
        background: scrolled ? "rgba(10,10,10,0.96)" : "rgba(10,10,10,0.82)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.05)" : "none",
        transition: "background 0.4s ease, border-color 0.4s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <span onClick={() => setActiveNav("Home")} style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, letterSpacing: "-0.5px", userSelect: "none", cursor: "pointer" }}>
            <span style={{ color: "#facc15" }}>peep.</span>
          </span>
          {!isMobile && (
            <div style={{ display: "flex", gap: 4 }}>
              {["Home", "Movies", "Series", "Podcasts"].map(label => {
                const active = activeNav === label;
                return (
                  <span key={label} onClick={() => setActiveNav(label)} style={{ fontSize: 17, padding: "6px 16px", borderRadius: 6, color: active ? "#0a0a0a" : "rgba(255,255,255,0.55)", fontWeight: active ? 700 : 400, cursor: "pointer", background: active ? "#facc15" : "transparent", transition: "color 0.2s, background 0.2s" }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.color = "rgba(255,255,255,0.55)"; e.currentTarget.style.background = "transparent"; } }}
                  >{label}</span>
                );
              })}
              <span onClick={() => { if (!user) { onAuthOpen(); return; } setActiveNav("My List"); }}
                style={{ fontSize: 17, padding: "6px 16px", borderRadius: 6, cursor: "pointer", color: activeNav === "My List" ? "#0a0a0a" : "rgba(255,255,255,0.55)", fontWeight: activeNav === "My List" ? 700 : 400, background: activeNav === "My List" ? "#facc15" : "transparent", transition: "color 0.2s, background 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = activeNav === "My List" ? "#0a0a0a" : "rgba(255,255,255,0.55)"; e.currentTarget.style.background = activeNav === "My List" ? "#facc15" : "transparent"; }}
              >My List</span>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 14 : 20 }}>
          <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
            {searchOpen && (
              <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape") closeSearch(); if (e.key === "Enter" && searchResults[0]) handleSearchResultClick(searchResults[0]); }}
                onBlur={() => { if (!searchQuery) closeSearch(); }}
                placeholder="Search titles, channels, podcasts..."
                style={{ background: "rgba(15,15,15,0.92)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 6, padding: "8px 14px 8px 38px", color: "#fff", fontSize: 13, width: isMobile ? "calc(100vw - 110px)" : 260, outline: "none" }}
              />
            )}
            <div onClick={() => setSearchOpen(o => !o)} style={{ position: searchOpen ? "absolute" : "relative", left: searchOpen ? 11 : 0, cursor: "pointer", color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            </div>
          </div>
          <NotifBell user={user} />
          {user ? (() => {
            const av = avatarForId(userAvatarId || activeProfile?.avatar_id);
            return (
              <div onClick={onProfileOpen} title={activeProfile?.name ?? "Profile"} style={{ width: isMobile ? 32 : 36, height: isMobile ? 32 : 36, borderRadius: "50%", background: av?.svg ? "none" : (av?.gradient ?? "linear-gradient(135deg, #6366f1, #8b5cf6)"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: av ? (isMobile ? 14 : 16) : 13, fontWeight: 700, cursor: "pointer", color: "#fff", flexShrink: 0, border: "2px solid transparent", transition: "border-color 0.15s", overflow: "hidden" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#facc15"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}>
                {av?.svg ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: av.svg }} /> : (av ? av.emoji : (activeProfile?.name?.[0] || user.email[0]).toUpperCase())}
              </div>
            );
          })() : (
            <button onClick={onAuthOpen} style={{ background: "#facc15", border: "none", borderRadius: 6, padding: isMobile ? "7px 14px" : "8px 18px", color: "#0a0a0a", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Sign In</button>
          )}
        </div>
      </nav>


      {/* Search overlay */}
      {searchOpen && (
        <div style={{ position: "fixed", top: isMobile ? "calc(max(env(safe-area-inset-top), 44px) + 54px)" : 68, left: 0, right: 0, zIndex: 99, background: "rgba(8,8,8,0.98)", backdropFilter: "blur(20px)", borderBottom: "1px solid #1a1a1a", maxHeight: isMobile ? "calc(100vh - max(env(safe-area-inset-top), 44px) - 54px)" : "calc(100vh - 68px)", overflowY: "auto" }}>
          <div style={{ padding: `20px ${PAD} 32px` }}>
            {/* Type filter chips */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {[{ id: "all", label: "All" }, { id: "movie", label: "Movies" }, { id: "show", label: "Series" }, { id: "podcast", label: "Podcasts" }].map(f => (
                <button key={f.id}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setSearchTypeFilter(f.id)}
                  style={{ background: searchTypeFilter === f.id ? "#facc15" : "rgba(255,255,255,0.07)", border: "none", borderRadius: 20, padding: "6px 16px", color: searchTypeFilter === f.id ? "#0a0a0a" : "#aaa", fontSize: 13, fontWeight: searchTypeFilter === f.id ? 700 : 400, cursor: "pointer", transition: "background 0.15s, color 0.15s" }}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Recent searches — shown when no query */}
            {!debouncedQuery && recentSearches.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <p style={{ margin: 0, fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 600 }}>Recent</p>
                  <button onMouseDown={e => e.preventDefault()} onClick={() => { setRecentSearches([]); localStorage.removeItem("peep_recent_searches"); }} style={{ background: "none", border: "none", color: "#444", fontSize: 12, cursor: "pointer" }}>Clear</button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {recentSearches.map(s => (
                    <button key={s} onMouseDown={e => e.preventDefault()} onClick={() => setSearchQuery(s)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid #2a2a2a", borderRadius: 20, padding: "6px 14px", color: "#ccc", fontSize: 13, cursor: "pointer" }}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            {debouncedQuery && (
              <>
                <p style={{ fontSize: 13, color: "#555", marginBottom: 16 }}>
                  {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for <span style={{ color: "#888" }}>"{debouncedQuery}"</span>
                </p>
                {searchResults.length === 0 ? (
                  <p style={{ color: "#444", fontSize: 14, padding: "20px 0" }}>Nothing found. Try something weirder.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {searchResults.map(v => {
                      const typeColor = v._type === "movie" ? "#facc15" : v._type === "show" ? "#60a5fa" : v._type === "stream" ? "#ef4444" : "#a78bfa";
                      const typeLabel = v._type === "movie" ? "Movie" : v._type === "show" ? "Series" : v._type === "stream" ? (v.is_live ? "🔴 Live" : "Channel") : "Podcast";
                      const thumb = v.poster || v.thumbnail || v.artwork_url || v.hero_image;
                      const meta = v._type === "podcast" ? v._tagsStr : v._type === "stream" ? (v.category || null) : v.category;
                      return (
                        <div key={v.id + v._type}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => handleSearchResultClick(v)}
                          style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 12px", borderRadius: 10, cursor: "pointer", transition: "background 0.12s" }}
                          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <div style={{ width: 52, height: 52, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "#1a1a1a" }}>
                            {thumb ? <img src={thumb} alt={v.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#1e1e2e,#2a2a3e)" }} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600, color: "#e5e5e5", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.title}</p>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: typeColor }}>{typeLabel}</span>
                              {meta && <span style={{ fontSize: 11, color: "#444" }}>·</span>}
                              {meta && <span style={{ fontSize: 11, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{meta}</span>}
                              {v.year && <span style={{ fontSize: 11, color: "#444" }}>·</span>}
                              {v.year && <span style={{ fontSize: 11, color: "#555", flexShrink: 0 }}>{v.year}</span>}
                            </div>
                          </div>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {!debouncedQuery && recentSearches.length === 0 && (
              <p style={{ color: "#333", fontSize: 14, padding: "20px 0" }}>Start typing to search movies, series, channels, and podcasts.</p>
            )}
          </div>
        </div>
      )}

      {/* Hero — Home only */}
      {activeNav === "Home" && (
        loading ? (
          <div style={{ height: "85vh", display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner /></div>
        ) : featured ? (
          <HeroBanner video={featured} onPlay={featuredIsShow ? onShowSelect : onPlay} isShow={featuredIsShow} myList={myList} onToggleList={onToggleList} categoryRank={featuredCategoryRank} />
        ) : (
          <div style={{ height: "85vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ color: "#555", fontSize: 15 }}>No content yet.</p>
          </div>
        )
      )}

      {/* Catalog pages for Movies / Series */}
      {(activeNav === "Movies" || activeNav === "Series") && !loading && (
        <CatalogPage
          type={activeNav}
          content={filteredContent}
          carousels={visibleCarousels}
          podcasts={podcasts}
          onPlay={onPlay}
          onShowSelect={onShowSelect}
          myList={myList}
          onToggleList={onToggleList}
        />
      )}


      {/* My List — full grid */}
      {activeNav === "My List" && !loading && (
        <div style={{ position: "relative", zIndex: 1, paddingTop: isMobile ? "calc(max(env(safe-area-inset-top), 44px) + 60px)" : 100, paddingBottom: 80 }}>
          <div style={{ padding: `0 ${PAD} 32px` }}>
            <h1 style={{ margin: "0 0 6px", fontFamily: "'DM Serif Display', serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 400, color: "#fff" }}>My List</h1>
            {(() => {
              const items = allContent.filter(v => myList?.[`${v._type}_${v.id}`]);
              return <p style={{ margin: 0, fontSize: 14, color: "#555" }}>{items.length} title{items.length !== 1 ? "s" : ""} saved</p>;
            })()}
          </div>
          {(() => {
            const items = allContent.filter(v => myList?.[`${v._type}_${v.id}`]);
            if (items.length === 0) return (
              <div style={{ padding: "80px 0", textAlign: "center", color: "#444", fontSize: 15 }}>
                <p style={{ marginBottom: 8, color: "#555" }}>Nothing saved yet. Your taste is a mystery.</p>
                <p style={{ fontSize: 13, color: "#333" }}>Browse content and hit + My List to save titles here.</p>
              </div>
            );
            return (
              <div style={{ padding: `0 ${PAD}`, display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 130 : 160}px, 1fr))`, gap: isMobile ? 12 : 16 }}>
                {items.map(item => (
                  <CatalogCard key={item.id + item._type} item={item}
                    onClick={() => item._type === "show" ? onShowSelect(item) : onPlay(item)}
                    myList={myList} onToggleList={onToggleList} />
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Podcasts page — always renders when on Podcasts tab */}
      {activeNav === "Podcasts" && !loading && (
        <div style={{ paddingTop: isMobile ? "calc(max(env(safe-area-inset-top), 44px) + 48px)" : 108, paddingBottom: 80 }}>
          <div style={{ padding: `0 ${PAD} 32px` }}>
            <h1 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 400, color: "#fff" }}>Podcasts</h1>
            <p style={{ margin: "8px 0 0", fontSize: 14, color: "#555" }}>{podcasts.length} show{podcasts.length !== 1 ? "s" : ""}</p>
          </div>
          {podcasts.length === 0 ? (
            <div style={{ padding: "60px 0", textAlign: "center", color: "#444", fontSize: 15 }}>
              No podcasts yet — check back soon.
            </div>
          ) : sections.map(section => section.isPodcast ? (
            <PodcastRow key={section.id} section={section} onPodcastSelect={onPodcastSelect} />
          ) : null)}
        </div>
      )}

      {/* Content rows (Home) */}
      {activeNav !== "Movies" && activeNav !== "Series" && activeNav !== "My List" && activeNav !== "Podcasts" && !loading && (allContent.length > 0 || continueWatching.length > 0) && (
        <div style={{ position: "relative", zIndex: 1, marginTop: 0, paddingBottom: 80 }}>
          {continueWatching.length > 0 && activeNav === "Home" && (
            <ContinueWatchingRow items={continueWatching} onPlay={onPlay} onRemove={handleRemoveCW} />
          )}
          {filteredContent.length === 0 ? (
            <div style={{ padding: "100px 0", textAlign: "center", color: "#444", fontSize: 15 }}>
              No {activeNav.toLowerCase()} yet.
            </div>
          ) : sections.map(section => section.videos.length > 0 ? (
            <ContentRow key={section.id} section={section} onPlay={onPlay} onShowSelect={onShowSelect} myList={myList} onToggleList={onToggleList} />
          ) : null)}
        </div>
      )}

      {isMobile && <div style={{ height: 72 }} />}
      <Footer onNavChange={setActiveNav} onProfileOpen={onProfileOpen} onOpenModal={setFooterModal} />

      {/* Mobile bottom tab bar */}
      {isMobile && (
        <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: "rgba(10,10,10,0.97)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", height: 60, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          {[
            { id: "Home", label: "Home", icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
            { id: "Movies", label: "Movies", icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg> },
            { id: "Series", label: "Series", icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg> },
            { id: "My List", label: "My List", icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> },
          ].map(tab => {
            const active = activeNav === tab.id;
            return (
              <button key={tab.id}
                onClick={() => { if (tab.id === "My List" && !user) { onAuthOpen(); return; } setActiveNav(tab.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, background: "none", border: "none", color: active ? "#facc15" : "#555", cursor: "pointer", padding: "6px 0", fontSize: 9.5, fontWeight: active ? 700 : 400, letterSpacing: 0.3, transition: "color 0.15s" }}>
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </nav>
      )}
      {footerModal && (
        <div onClick={() => setFooterModal(null)} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 16, padding: "36px 40px", width: "min(560px, 100%)", maxHeight: "80vh", overflowY: "auto", fontFamily: "'Space Grotesk', sans-serif" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#fff" }}>{footerModal.title}</h2>
              <button onClick={() => setFooterModal(null)} style={{ background: "none", border: "none", color: "#555", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: 14, color: "#888", lineHeight: 1.8 }}>{footerModal.content}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Catalog Page (Movies / Series) ──────────────────────────────────────────

function CatalogPage({ type, content, carousels = [], podcasts = [], onPlay, onShowSelect, myList, onToggleList }) {
  const [genreFilter, setGenreFilter] = useState("All");
  const [sortBy, setSortBy] = useState("default");
  const isMobile = useIsMobile();

  const genres = useMemo(() => {
    const cats = [...new Set(content.map(v => v.category).filter(Boolean))].sort();
    return ["All", ...cats];
  }, [content]);

  const displayed = useMemo(() => {
    let items = genreFilter === "All" ? content : content.filter(v => v.category === genreFilter);
    if (sortBy === "newest") items = [...items].sort((a, b) => (b.year || 0) - (a.year || 0));
    else if (sortBy === "az") items = [...items].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    else if (sortBy === "rating") items = [...items].sort((a, b) => (b.score || 0) - (a.score || 0));
    return items;
  }, [content, genreFilter, sortBy]);

  // Build carousel sections for this tab — same logic as homepage
  const catalogSections = useMemo(() => carousels.map(c => {
    const filterVal = c.filter_value?.toLowerCase();
    const baseItems = c.type === "trending"
      ? [...content].reverse()
      : c.type === "category"
      ? content.filter(v => v.category?.toLowerCase() === filterVal)
      : content;
    const items = c.content_type === "shorts" ? baseItems.filter(v => v._type === "movie")
      : c.content_type === "shows" ? baseItems.filter(v => v._type === "show")
      : baseItems;
    return { id: String(c.id), title: c.title, videos: items, numbered: c.type === "trending" };
  }).filter(s => s.videos.length > 0), [carousels, content]);

  return (
    <div style={{ paddingTop: isMobile ? "calc(max(env(safe-area-inset-top), 44px) + 48px)" : 88, minHeight: "100vh" }}>
      {/* Page header */}
      <div style={{ padding: `0 ${PAD} 28px` }}>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(32px, 4vw, 56px)", fontWeight: 400, margin: "0 0 24px", color: "#fff" }}>
          {type === "Movies" ? "Movies" : "Series"}
        </h1>

        {/* Filters row */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
            {genres.map(g => (
              <button key={g} onClick={() => setGenreFilter(g)}
                style={{ background: genreFilter === g ? "#facc15" : "rgba(255,255,255,0.06)", border: `1px solid ${genreFilter === g ? "#facc15" : "rgba(255,255,255,0.1)"}`, borderRadius: 20, padding: "7px 16px", color: genreFilter === g ? "#0a0a0a" : "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: genreFilter === g ? 700 : 400, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap" }}>
                {g}
              </button>
            ))}
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 14px", color: "rgba(255,255,255,0.7)", fontSize: 13, cursor: "pointer", outline: "none", flexShrink: 0 }}>
            <option value="default">Default order</option>
            <option value="newest">Newest first</option>
            <option value="az">A – Z</option>
            <option value="rating">Top rated</option>
          </select>
        </div>

        <p style={{ margin: "16px 0 0", fontSize: 12, color: "#444" }}>
          {displayed.length} title{displayed.length !== 1 ? "s" : ""}
          {genreFilter !== "All" ? ` in ${genreFilter}` : ""}
        </p>
      </div>

      <div style={{ height: 1, background: "linear-gradient(to right, rgba(255,255,255,0.06), transparent)", margin: `0 ${PAD} 8px` }} />

      {/* Carousel rows for this tab */}
      {catalogSections.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {catalogSections.map(section => (
            <ContentRow key={section.id} section={section} onPlay={onPlay} onShowSelect={onShowSelect} myList={myList} onToggleList={onToggleList} />
          ))}
        </div>
      )}

      {catalogSections.length === 0 && (
        displayed.length === 0 ? (
          <div style={{ padding: "80px 0", textAlign: "center", color: "#444", fontSize: 15 }}>
            Nothing here yet. Check back soon.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? "130px" : "160px"}, 1fr))`, gap: isMobile ? 10 : 14, padding: `0 ${PAD} 80px` }}>
            {displayed.map(item => (
              <CatalogCard key={item.id + item._type} item={item}
                onClick={() => item._type === "show" ? onShowSelect(item) : onPlay(item)}
                myList={myList} onToggleList={onToggleList} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function CatalogCard({ item, onClick, myList, onToggleList }) {
  const [hovered, setHovered] = useState(false);
  const inList = myList?.[`${item._type}_${item.id}`];

  return (
    <div onClick={onClick}
      style={{ cursor: "pointer", borderRadius: 10, overflow: "hidden", background: "#141414", transform: hovered ? "scale(1.04) translateY(-4px)" : "scale(1)", transition: "transform 0.22s ease, box-shadow 0.22s ease", boxShadow: hovered ? "0 20px 48px rgba(0,0,0,0.8), 0 0 0 2px rgba(250,204,21,0.4)" : "0 2px 8px rgba(0,0,0,0.3)" }}>
      <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{ position: "relative", aspectRatio: "2/3", overflow: "hidden" }}>
        <img src={item.poster || item.thumbnail} alt={item.title}
          style={{ width: "100%", height: "100%", objectFit: "cover", transition: "filter 0.22s", filter: hovered ? "brightness(0.45)" : "brightness(0.75)" }} />


        {/* Hover overlay — play button only */}
        {hovered && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#0a0a0a"><polygon points="5,3 19,12 5,21" /></svg>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// ─── Hero Banner ──────────────────────────────────────────────────────────────

function HeroBanner({ video, onPlay, isShow, myList, onToggleList, categoryRank }) {
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [bgPlaying, setBgPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef(null);
  const pauseTimerRef = useRef(null);
  const loopTimerRef = useRef(null);

  const isMobile = useIsMobile();
  const hasBgTrailer = !!video.trailer_url && getTrailerType(video.trailer_url) === "direct";

  function startLoop() {
    clearTimeout(loopTimerRef.current);
    loopTimerRef.current = setTimeout(doRestartCycle, 25000);
  }

  function doRestartCycle() {
    clearTimeout(loopTimerRef.current);
    clearTimeout(pauseTimerRef.current);
    setBgPlaying(false);
    pauseTimerRef.current = setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
      }
      setBgPlaying(true);
      startLoop();
    }, 25000);
  }

  useEffect(() => {
    setBgPlaying(false);
    setMuted(true);
    clearTimeout(pauseTimerRef.current);
    clearTimeout(loopTimerRef.current);
    if (!hasBgTrailer) return;
    if (localStorage.getItem(PREF_AUTOPLAY_HERO) === "false") return;
    const t = setTimeout(() => { setBgPlaying(true); startLoop(); }, 3000);
    return () => { clearTimeout(t); clearTimeout(pauseTimerRef.current); clearTimeout(loopTimerRef.current); };
  }, [video.id, hasBgTrailer]);

  // React doesn't reliably sync the muted DOM attribute via prop alone
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  function handleTrailerEnded() { doRestartCycle(); }

  return (
    <div style={{ position: "relative", height: isMobile ? "58vh" : "62vh", minHeight: 420, overflow: "hidden" }}>
      {trailerOpen && <TrailerModal url={video.trailer_url} title={video.title} onClose={() => setTrailerOpen(false)} />}

      {/* Thumbnail */}
      <img src={video.thumbnail} alt={video.title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", filter: "brightness(0.65) saturate(1.2)", transition: "opacity 1.4s ease", opacity: bgPlaying ? 0 : 1 }} />

      {/* Background autoplay trailer */}
      {hasBgTrailer && (
        <video ref={videoRef} src={video.trailer_url} autoPlay muted playsInline onEnded={handleTrailerEnded}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", filter: "brightness(0.65)", transition: "opacity 1.4s ease", opacity: bgPlaying ? 1 : 0, pointerEvents: "none" }} />
      )}

      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.2) 50%, transparent 75%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(10,10,10,0.85) 0%, rgba(10,10,10,0.3) 55%, transparent 85%)" }} />

      <div style={{ position: "absolute", bottom: isMobile ? "12%" : "16%", left: PAD, right: PAD, maxWidth: isMobile ? "100%" : "clamp(400px, 38vw, 600px)", zIndex: 3 }}>

        {/* Featured label */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(250,204,21,0.12)", border: "1px solid rgba(250,204,21,0.3)", borderRadius: 20, padding: "5px 14px", marginBottom: 16 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#facc15", flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#facc15", letterSpacing: 1.2, textTransform: "uppercase" }}>
            {isShow ? "Featured Series" : video.category === "podcast" ? "Featured Podcast" : video.category ? video.category : "Featured"}
          </span>
        </div>

        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(32px, 4vw, 60px)", lineHeight: 1.1, margin: "0 0 12px", fontWeight: 800, letterSpacing: "-0.02em" }}>{video.title}</h1>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          {isShow && <span style={{ fontSize: 13, fontWeight: 600, color: "#facc15" }}>Series</span>}
          {video.year && <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>{video.year}</span>}
          {video.rating && <span style={{ border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.45)", fontSize: 12, padding: "2px 8px", borderRadius: 3 }}>{video.rating}</span>}
          {video.category && !isShow && <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, textTransform: "capitalize" }}>{video.category}</span>}
        </div>

        {video.description && (
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", lineHeight: 1.65, margin: "0 0 28px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {video.description}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => onPlay(video)}
            style={{ background: "#facc15", color: "#0a0a0a", border: "none", borderRadius: 8, padding: isMobile ? "11px 22px" : "12px 28px", fontSize: isMobile ? 14 : 15, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "opacity 0.15s, transform 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "none"; }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>
            {isShow ? "Watch Now" : "Play"}
          </button>
          {video.trailer_url && (
            <button onClick={() => setTrailerOpen(true)}
              style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 8, padding: isMobile ? "11px 18px" : "12px 22px", fontSize: isMobile ? 14 : 15, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.18)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}>
              Trailer
            </button>
          )}
          {(() => {
            const type = isShow ? "show" : "movie";
            const inList = myList?.[`${type}_${video.id}`];
            return (
              <button onClick={() => onToggleList?.(video.id, type)}
                style={{ background: "transparent", color: inList ? "#facc15" : "rgba(255,255,255,0.6)", border: "none", padding: isMobile ? "11px 4px" : "12px 4px", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = inList ? "#facc15" : "#fff"}
                onMouseLeave={e => e.currentTarget.style.color = inList ? "#facc15" : "rgba(255,255,255,0.6)"}>
                {inList
                  ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>Saved</>
                  : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>My List</>
                }
              </button>
            );
          })()}
        </div>
      </div>

      {/* Mute / unmute */}
      {bgPlaying && hasBgTrailer && (
        <button onClick={() => setMuted(m => !m)}
          style={{ position: "absolute", bottom: 20, right: 24, background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "50%", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff", zIndex: 10 }}>
          {muted
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
          }
        </button>
      )}
    </div>
  );
}

// ─── Content Row ──────────────────────────────────────────────────────────────

function ContentRow({ section, onPlay, onShowSelect, myList, onToggleList }) {
  const scrollRef = useRef(null);
  const isMobile = useIsMobile();
  const scroll = dir => scrollRef.current?.scrollBy({ left: dir * scrollRef.current.clientWidth * 0.85, behavior: "smooth" });

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${PAD}`, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: "clamp(13px, 1.1vw, 16px)", fontWeight: 700, color: "#e5e7eb", letterSpacing: "0.15em", textTransform: "uppercase" }}>{section.title}</h2>
        {!isMobile && (
          <div style={{ display: "flex", gap: 6 }}>
            {[
              <svg key="l" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>,
              <svg key="r" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>,
            ].map((icon, i) => (
              <button key={i} onClick={() => scroll(i === 0 ? -1 : 1)}
                style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, width: 30, height: 30, color: "rgba(255,255,255,0.4)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "border-color 0.15s, color 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}>
                {icon}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ position: "relative" }}>
        {!isMobile && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 48, background: "linear-gradient(to right, #0a0a0a, transparent)", zIndex: 5, pointerEvents: "none" }} />}
        {!isMobile && <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 48, background: "linear-gradient(to left, #0a0a0a, transparent)", zIndex: 5, pointerEvents: "none" }} />}
        <div ref={scrollRef} className="scroll-row" style={{ display: "flex", gap: 14, overflowX: "auto", scrollbarWidth: "none", padding: `16px ${PAD} 24px` }}>
          {section.videos.map((video, i) => (
            <VideoCard key={video.id + (video._type || "")} video={video}
              onClick={() => video._type === "show" ? onShowSelect(video) : onPlay(video)}
              rank={section.numbered ? i + 1 : null}
              myList={myList} onToggleList={onToggleList} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Podcast Row ─────────────────────────────────────────────────────────────

const PODCAST_CARD_W = "clamp(150px, 20vw, 210px)";

function PodcastRow({ section, onPodcastSelect }) {
  const scrollRef = useRef(null);
  const isMobile = useIsMobile();
  const scroll = dir => scrollRef.current?.scrollBy({ left: dir * scrollRef.current.clientWidth * 0.8, behavior: "smooth" });

  if (!section.podcastItems?.length) return null;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${PAD}`, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.5">
            <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
          </svg>
          <h2 style={{ margin: 0, fontSize: "clamp(16px, 1.4vw, 20px)", fontWeight: 600, color: "#e5e5e5" }}>{section.title}</h2>
        </div>
        <span style={{ fontSize: 13, color: "#818cf8", cursor: "pointer", fontWeight: 500 }}>See All →</span>
      </div>
      <div style={{ margin: `0 0 18px ${PAD}`, height: 1, background: "linear-gradient(to right, #818cf8, rgba(129,140,248,0.3), transparent)" }} />
      <div style={{ position: "relative" }}>
        {!isMobile && <button onClick={() => scroll(-1)} style={{ position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 10, background: "linear-gradient(to right, rgba(10,10,10,0.95), transparent)", border: "none", color: "#fff", width: 64, cursor: "pointer", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>}
        {!isMobile && <button onClick={() => scroll(1)} style={{ position: "absolute", right: 0, top: 0, bottom: 0, zIndex: 10, background: "linear-gradient(to left, rgba(10,10,10,0.95), transparent)", border: "none", color: "#fff", width: 64, cursor: "pointer", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>}
        <div ref={scrollRef} className="scroll-row" style={{ display: "flex", gap: 16, overflowX: "auto", scrollbarWidth: "none", padding: `28px ${PAD} 32px` }}>
          {section.podcastItems.map(podcast => (
            <PodcastCard key={podcast.id} podcast={podcast} onPodcastSelect={onPodcastSelect} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PodcastCard({ podcast, onPodcastSelect }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ flexShrink: 0, width: PODCAST_CARD_W, cursor: "pointer" }}
      onClick={() => onPodcastSelect?.(podcast)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>
      <div style={{
        borderRadius: 14, overflow: "hidden", background: "#0f0f1a",
        border: `1px solid ${hovered ? "#818cf8" : "#1a1a2e"}`,
        transform: hovered ? "scale(1.04) translateY(-4px)" : "scale(1)",
        transformOrigin: "bottom center",
        transition: "transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s",
        boxShadow: hovered ? "0 20px 50px rgba(129,140,248,0.22)" : "0 2px 10px rgba(0,0,0,0.4)",
      }}>
        <div style={{ position: "relative", aspectRatio: "1/1", overflow: "hidden" }}>
          {podcast.artwork_url ? (
            <img src={podcast.artwork_url} alt={podcast.title}
              style={{ width: "100%", height: "100%", objectFit: "cover", filter: hovered ? "brightness(0.55)" : "brightness(0.9)", transition: "filter 0.25s" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1e1b4b, #312e81)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.5">
                <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
            </div>
          )}
          {hovered && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ background: "#818cf8", borderRadius: "50%", width: 50, height: 50, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(129,140,248,0.5)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><polygon points="5,3 19,12 5,21" /></svg>
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: "12px 14px 14px", background: hovered ? "#141428" : "#0f0f1a", transition: "background 0.25s" }}>
          <p style={{ margin: "0 0 4px", fontSize: 13.5, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{podcast.title}</p>
          {podcast.host && <p style={{ margin: 0, fontSize: 12, color: "#818cf8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{podcast.host}</p>}
        </div>
      </div>
    </div>
  );
}

function fmtViews(n) {
  if (!n) return null;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M views";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K views";
  return n + " views";
}

// ─── Live Section ─────────────────────────────────────────────────────────────

function LiveSection({ streams, onPlay }) {
  return (
    <div style={{ marginBottom: 16, padding: `0 ${PAD}` }}>
      <style>{`@keyframes livepulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(1.3); } }`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite" }} />
        <h2 style={{ margin: 0, fontSize: "clamp(16px, 1.4vw, 20px)", fontWeight: 600, color: "#e5e5e5" }}>Live Now</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {streams.map(s => <LiveCard key={s.id} stream={s} onPlay={onPlay} />)}
      </div>
    </div>
  );
}

function LiveCard({ stream, onPlay }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div onClick={() => stream.stream_url && onPlay({ ...stream, url: stream.stream_url, _type: "live", title: stream.title })}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ cursor: stream.stream_url ? "pointer" : "default", borderRadius: 12, overflow: "hidden", background: "#141414", border: `1px solid ${hovered ? "#ef4444" : "#1e1e1e"}`, transform: hovered ? "scale(1.02)" : "scale(1)", transition: "all 0.2s", boxShadow: hovered ? "0 8px 32px rgba(239,68,68,0.2)" : "none" }}>
      <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden" }}>
        {stream.thumbnail
          ? <img src={stream.thumbnail} alt={stream.title} style={{ width: "100%", height: "100%", objectFit: "cover", filter: hovered ? "brightness(0.55)" : "brightness(0.8)", transition: "filter 0.2s" }} />
          : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1a0000, #3a0000)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="#ef4444" opacity="0.4"><polygon points="5,3 19,12 5,21" /></svg>
            </div>
        }
        {stream.is_live && (
          <div style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 5, background: "#ef4444", borderRadius: 5, padding: "4px 10px" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 }}>{stream.badge_text || "LIVE"}</span>
          </div>
        )}
        {stream.channel_number != null && stream.channel_number !== "" && (
          <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", borderRadius: 5, padding: "4px 8px", fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: 0.5 }}>
            CH {stream.channel_number}
          </div>
        )}
        {hovered && stream.stream_url && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(239,68,68,0.9)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(239,68,68,0.5)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><polygon points="5,3 19,12 5,21" /></svg>
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: "14px 16px" }}>
        <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "#fff" }}>{stream.channel_name || stream.title}</p>
        {stream.now_airing && (
          <p style={{ margin: "0 0 3px", fontSize: 12, color: "#ef4444", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Now: {stream.now_airing}
          </p>
        )}
        {stream.up_next && (
          <p style={{ margin: 0, fontSize: 11, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Up Next: {stream.up_next}
          </p>
        )}
        {!stream.now_airing && stream.description && (
          <p style={{ margin: 0, fontSize: 12, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stream.description}</p>
        )}
      </div>
    </div>
  );
}


// ─── Continue Watching ────────────────────────────────────────────────────────

const CW_CARD_W = "clamp(200px, 26vw, 300px)";

function ContinueWatchingRow({ items, onPlay, onRemove }) {
  const scrollRef = useRef(null);
  const isMobile = useIsMobile();
  const scroll = dir => scrollRef.current?.scrollBy({ left: dir * scrollRef.current.clientWidth * 0.85, behavior: "smooth" });
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: `0 ${PAD}`, marginBottom: 12 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <h2 style={{ margin: 0, fontSize: "clamp(16px, 1.4vw, 20px)", fontWeight: 600, color: "#e5e5e5" }}>Continue Watching</h2>
      </div>
      <div style={{ position: "relative" }}>
        {!isMobile && <button onClick={() => scroll(-1)} style={{ position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 10, background: "linear-gradient(to right, rgba(10,10,10,0.95), transparent)", border: "none", color: "#fff", width: 64, cursor: "pointer", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>}
        {!isMobile && <button onClick={() => scroll(1)} style={{ position: "absolute", right: 0, top: 0, bottom: 0, zIndex: 10, background: "linear-gradient(to left, rgba(10,10,10,0.95), transparent)", border: "none", color: "#fff", width: 64, cursor: "pointer", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>}
        <div ref={scrollRef} className="scroll-row" style={{ display: "flex", gap: 14, overflowX: "auto", scrollbarWidth: "none", padding: `10px ${PAD} 28px` }}>
          {items.map(item => <ContinueWatchingCard key={`${item._type}_${item.id}`} item={item} onPlay={onPlay} onRemove={onRemove} />)}
        </div>
      </div>
    </div>
  );
}

function ContinueWatchingCard({ item, onPlay, onRemove }) {
  const [hovered, setHovered] = useState(false);
  const pct = item._progress?.duration_seconds > 0 ? Math.min(100, (item._progress.progress_seconds / item._progress.duration_seconds) * 100) : 0;

  const isEpisode = item._type === "episode";
  const displayTitle = isEpisode && item._show ? item._show.title : item.title;
  const displayThumb = isEpisode && item._show
    ? (item.thumbnail || item._show.thumbnail || item._show.poster)
    : (item.thumbnail || item.poster);
  const subtitle = isEpisode && item.season != null
    ? `S${item.season} E${item.episode_number} · ${Math.round(pct)}% watched`
    : `${Math.round(pct)}% watched`;

  return (
    <div style={{ flexShrink: 0, width: CW_CARD_W, cursor: "pointer", position: "relative" }}
      onClick={() => onPlay(item)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {hovered && onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(item); }}
          title="Mark as watched"
          style={{ position: "absolute", top: 8, right: 8, zIndex: 20, width: 26, height: 26, borderRadius: "50%", background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,255,255,0.15)", color: "#aaa", fontSize: 14, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          ×
        </button>
      )}
      <div style={{ borderRadius: 10, overflow: "hidden", background: "#141414", transform: hovered ? "scale(1.03) translateY(-3px)" : "scale(1)", transition: "transform 0.25s, box-shadow 0.25s", boxShadow: hovered ? "0 16px 40px rgba(0,0,0,0.65)" : "0 2px 8px rgba(0,0,0,0.3)" }}>
        <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden" }}>
          <img src={displayThumb} alt={displayTitle}
            style={{ width: "100%", height: "100%", objectFit: "cover", filter: hovered ? "brightness(0.5)" : "brightness(0.75)", transition: "filter 0.25s" }} />
          {hovered && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#0a0a0a"><polygon points="5,3 19,12 5,21" /></svg>
              </div>
            </div>
          )}
          {isEpisode && item.season != null && (
            <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", color: "#bbb", fontSize: 10, padding: "3px 7px", borderRadius: 4 }}>S{item.season} E{item.episode_number}</div>
          )}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "rgba(0,0,0,0.5)" }}>
            <div style={{ height: "100%", background: "#facc15", width: `${pct}%` }} />
          </div>
        </div>
        <div style={{ padding: "10px 14px 12px", background: hovered ? "#1c1c1c" : "#141414", transition: "background 0.25s" }}>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayTitle}</p>
          <p style={{ margin: 0, fontSize: 11, color: "#555" }}>{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Video Card ───────────────────────────────────────────────────────────────

const TRAILER_OVERLAY_W = 520;
const TRAILER_INFO_H = 200;

function VideoCard({ video, onClick, rank, myList, onToggleList }) {
  const [hovered, setHovered] = useState(false);
  const [trailerMounted, setTrailerMounted] = useState(false);
  const [trailerExpanded, setTrailerExpanded] = useState(false);
  const [cardRect, setCardRect] = useState(null);
  const [overlayMuted, setOverlayMuted] = useState(true);
  const overlayVideoRef = useRef(null);
  const trailerTimerRef = useRef(null);
  const closingTimerRef = useRef(null);
  const cardRef = useRef(null);
  const isMobile = useIsMobile();
  const inList = myList?.[`${video._type}_${video.id}`];
  const hasDirectTrailer = !isMobile && video.trailer_url && getTrailerType(video.trailer_url) === "direct";

  useEffect(() => () => { clearTimeout(trailerTimerRef.current); clearTimeout(closingTimerRef.current); }, []);

  function startClose() {
    clearTimeout(trailerTimerRef.current);
    // Small delay lets the overlay's onMouseEnter cancel before collapse fires
    closingTimerRef.current = setTimeout(() => {
      setTrailerExpanded(false);
      setTimeout(() => { setTrailerMounted(false); setCardRect(null); setOverlayMuted(true); }, 220);
    }, 80);
  }

  function handleMouseEnter() {
    setHovered(true);
    clearTimeout(closingTimerRef.current);
    if (hasDirectTrailer && localStorage.getItem(PREF_AUTOPLAY_PREVIEWS) !== "false") {
      trailerTimerRef.current = setTimeout(() => {
        const rect = cardRef.current?.getBoundingClientRect();
        if (!rect) return;
        setCardRect(rect);
        setTrailerMounted(true);
        requestAnimationFrame(() => requestAnimationFrame(() => setTrailerExpanded(true)));
      }, 400);
    }
  }

  function handleMouseLeave() {
    setHovered(false);
    startClose();
  }

  const overlayW = TRAILER_OVERLAY_W;
  const videoH = Math.round(overlayW * 9 / 16);
  const overlayH = videoH + TRAILER_INFO_H;

  let overlayStyle = null;
  if (trailerMounted && cardRect) {
    const endLeft = Math.max(8, Math.min(window.innerWidth - overlayW - 8, cardRect.left + cardRect.width / 2 - overlayW / 2));
    const endTop  = Math.max(8, Math.min(window.innerHeight - overlayH - 8, cardRect.top + cardRect.height / 2 - overlayH / 2));
    overlayStyle = {
      position: "fixed",
      left:   trailerExpanded ? endLeft      : cardRect.left,
      top:    trailerExpanded ? endTop       : cardRect.top,
      width:  trailerExpanded ? overlayW     : cardRect.width,
      height: trailerExpanded ? overlayH     : cardRect.height,
      borderRadius: trailerExpanded ? 14 : 8,
      boxShadow: trailerExpanded ? "0 40px 100px rgba(0,0,0,0.97)" : "none",
      zIndex: 200,
      overflow: "hidden",
      background: "#141414",
      transition: "left 0.2s ease, top 0.2s ease, width 0.2s ease, height 0.2s ease, border-radius 0.2s ease, box-shadow 0.2s ease",
    };
  }

  return (
    <div ref={cardRef} style={{ position: "relative", flexShrink: 0, width: rank ? `calc(${CARD_W} + 40px)` : CARD_W }}>
      {rank && (
        <div style={{ position: "absolute", left: -8, bottom: 24, fontFamily: "'DM Serif Display', serif", fontSize: 88, lineHeight: 1, fontWeight: 400, color: "transparent", WebkitTextStroke: "1px rgba(255,255,255,0.08)", userSelect: "none", zIndex: 0, pointerEvents: "none" }}>{rank}</div>
      )}
      <div onClick={onClick} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
        style={{ cursor: "pointer", borderRadius: 10, overflow: "hidden", background: "#0f0f0f", transform: hovered ? "scale(1.03) translateY(-6px)" : "scale(1)", transformOrigin: "bottom center", transition: "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94), box-shadow 0.3s ease", boxShadow: hovered ? "0 28px 60px rgba(0,0,0,0.85)" : "none", position: "relative", zIndex: hovered ? 10 : 1, marginLeft: rank ? 34 : 0 }}>
        <div style={{ position: "relative", aspectRatio: "2/3", overflow: "hidden" }}>
          <img src={video.poster || video.thumbnail} alt={video.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", transition: "filter 0.35s ease, transform 0.35s ease", filter: hovered ? "brightness(0.45)" : "brightness(0.82)", transform: hovered ? "scale(1.06)" : "scale(1)" }} />

          {/* Hover overlay */}
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)`, opacity: hovered ? 1 : 0, transition: "opacity 0.3s ease" }} />
          {hovered && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(255,255,255,0.95)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.6)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#0a0a0a"><polygon points="6,3 20,12 6,21" /></svg>
              </div>
            </div>
          )}


          {/* Progress bar */}
          {video._progress && video._progress.duration_seconds > 0 && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.1)" }}>
              <div style={{ height: "100%", background: "#facc15", width: `${Math.min(100, (video._progress.progress_seconds / video._progress.duration_seconds) * 100)}%`, transition: "width 0.3s" }} />
            </div>
          )}
        </div>

      </div>

      {/* Morphing trailer overlay */}
      {overlayStyle && (
        <div style={overlayStyle}
          onMouseEnter={() => { clearTimeout(closingTimerRef.current); setHovered(true); }}
          onMouseLeave={handleMouseLeave}>

          {/* 16:9 video section */}
          <div style={{ position: "relative", width: "100%", paddingTop: `${9/16*100}%`, flexShrink: 0 }}>
            <video ref={overlayVideoRef} src={video.trailer_url} autoPlay muted playsInline
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            {/* Mute toggle */}
            <button
              onClick={e => { e.stopPropagation(); const m = !overlayMuted; setOverlayMuted(m); if (overlayVideoRef.current) overlayVideoRef.current.muted = m; }}
              style={{ position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, backdropFilter: "blur(4px)" }}>
              {overlayMuted
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              }
            </button>
          </div>

          {/* Info panel — fades in after expansion */}
          <div style={{ padding: "14px 18px 18px", opacity: trailerExpanded ? 1 : 0, transition: "opacity 0.15s ease 0.15s" }}>
            <p style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{video.title}</p>

            {/* Metadata row */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              {video.score && <span style={{ fontSize: 14, color: "#4ade80", fontWeight: 700 }}>{video.score}% Match</span>}
              {video.category && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5 }}>{video.category}</span>}
              {video.year && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{video.year}</span>}
              {video.rating && <span style={{ fontSize: 12, border: "1px solid rgba(255,255,255,0.3)", color: "rgba(255,255,255,0.5)", padding: "2px 6px", borderRadius: 3 }}>{video.rating}</span>}
              {video.duration && <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{video.duration}</span>}
            </div>

            {/* Description */}
            {video.description && (
              <p style={{ margin: "0 0 12px", fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{video.description}</p>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={e => { e.stopPropagation(); onClick(); }}
                style={{ flex: 1, background: "#fff", border: "none", borderRadius: 6, padding: "10px 0", color: "#0a0a0a", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                Play
              </button>
              <button onClick={e => { e.stopPropagation(); onToggleList?.(video.id, video._type); }}
                style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: `1px solid ${inList ? "rgba(250,204,21,0.6)" : "rgba(255,255,255,0.3)"}`, color: inList ? "#facc15" : "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {inList ? "✓" : "+"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Trailer Modal ────────────────────────────────────────────────────────────

function getTrailerType(url) {
  if (!url) return null;
  if (url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)/)) return "youtube";
  if (url.includes("youtube.com/embed/")) return "youtube-embed";
  if (url.match(/archive\.org\/(download|embed)\//)) return "archive";
  return "direct";
}

function getTrailerEmbedUrl(url) {
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&mute=1&rel=0`;
  if (url.includes("youtube.com/embed/")) return url.includes("?") ? url : url + "?autoplay=1&mute=1";
  const archiveMatch = url.match(/archive\.org\/download\/([^/]+)/);
  if (archiveMatch) return `https://archive.org/embed/${archiveMatch[1]}?autoplay=1`;
  if (url.includes("archive.org/embed/")) return url;
  return null;
}

function TrailerModal({ url, title, onClose }) {
  const type = getTrailerType(url);
  const embedUrl = type !== "direct" ? getTrailerEmbedUrl(url) : null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.94)", backdropFilter: "blur(14px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(960px, 92vw)", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: -48, right: 0, background: "none", border: "none", color: "#aaa", fontSize: 32, cursor: "pointer", lineHeight: 1, padding: "4px 8px" }}>×</button>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600 }}>Official Trailer — {title}</p>
        <div style={{ aspectRatio: "16/9", background: "#000", borderRadius: 12, overflow: "hidden", boxShadow: "0 40px 100px rgba(0,0,0,0.9)" }}>
          {type === "direct" ? (
            <video
              src={url}
              controls
              autoPlay
              style={{ width: "100%", height: "100%", display: "block" }}
            />
          ) : embedUrl ? (
            <iframe
              src={embedUrl}
              style={{ width: "100%", height: "100%", display: "block", border: "none" }}
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#555", fontSize: 14 }}>Unable to play trailer.</div>
          )}
        </div>
        <p style={{ margin: "12px 0 0", textAlign: "center", fontSize: 12, color: "#333" }}>Click anywhere outside to close</p>
      </div>
    </div>
  );
}

// ─── Player View ──────────────────────────────────────────────────────────────

function LiveChannelStrip({ channels, epgEntries, currentId, onSwitch }) {
  const scrollRef = useRef(null);
  const now = new Date();

  const nowByChannel = {};
  epgEntries.forEach(e => {
    const s = new Date(e.start_time), en = new Date(e.end_time);
    if (s <= now && en > now) nowByChannel[e.channel_id] = e;
  });

  const scroll = dir => scrollRef.current?.scrollBy({ left: dir * 300, behavior: "smooth" });

  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>Channels</p>
        <div style={{ display: "flex", gap: 6 }}>
          {["‹", "›"].map((arrow, i) => (
            <button key={arrow} onClick={() => scroll(i === 0 ? -1 : 1)}
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, width: 28, height: 28, color: "#888", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
              {arrow}
            </button>
          ))}
        </div>
      </div>
      <div ref={scrollRef} className="scroll-row" style={{ display: "flex", gap: 10, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 4 }}>
        {channels.map(ch => {
          const isCurrent = ch.id === currentId;
          const nowAiring = nowByChannel[ch.id];
          return (
            <div key={ch.id} onClick={() => !isCurrent && onSwitch(ch)}
              style={{
                flexShrink: 0, width: 175, borderRadius: 10, padding: "12px 14px",
                background: isCurrent ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${isCurrent ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.07)"}`,
                cursor: isCurrent ? "default" : "pointer",
                transition: "background 0.15s, border-color 0.15s",
                position: "relative",
                overflow: "hidden",
              }}
              onMouseEnter={e => { if (!isCurrent) { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)"; } }}
              onMouseLeave={e => { if (!isCurrent) { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; } }}
            >
              {isCurrent && (
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(to right, #818cf8, #6366f1)", borderRadius: "10px 10px 0 0" }} />
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                {ch.channel_number != null && ch.channel_number !== "" && (
                  <span style={{ fontSize: 9, color: isCurrent ? "#818cf8" : "#444", fontWeight: 700, letterSpacing: 0.5 }}>CH{ch.channel_number}</span>
                )}
                {isCurrent && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite" }} />
                    <span style={{ fontSize: 9, color: "#ef4444", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Now</span>
                  </div>
                )}
              </div>
              <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: isCurrent ? "#e0e7ff" : "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.title}</p>
              <p style={{ margin: 0, fontSize: 11, color: isCurrent ? "#6366f1" : "#3a3a4a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {nowAiring ? nowAiring.title : "No guide info"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FullscreenGuide({ channels, epgEntries, currentId, onSwitch }) {
  const now = new Date();
  const nowByChannel = {};
  epgEntries.forEach(e => {
    const s = new Date(e.start_time), en = new Date(e.end_time);
    if (s <= now && en > now) nowByChannel[e.channel_id] = e;
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", gap: 8, maxHeight: "42vh", overflowY: "auto" }}>
      {channels.map(ch => {
        const isCurrent = ch.id === currentId;
        const nowAiring = nowByChannel[ch.id];
        return (
          <div
            key={ch.id}
            onClick={() => !isCurrent && onSwitch(ch)}
            style={{
              borderRadius: 8, padding: "10px 12px",
              background: isCurrent ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${isCurrent ? "rgba(99,102,241,0.45)" : "rgba(255,255,255,0.07)"}`,
              cursor: isCurrent ? "default" : "pointer",
              transition: "background 0.15s, border-color 0.15s",
              position: "relative", overflow: "hidden",
            }}
            onMouseEnter={e => { if (!isCurrent) { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)"; } }}
            onMouseLeave={e => { if (!isCurrent) { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; } }}
          >
            {isCurrent && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(to right, #818cf8, #6366f1)" }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              {ch.channel_number != null && ch.channel_number !== "" && (
                <span style={{ fontSize: 9, color: isCurrent ? "#818cf8" : "#333", fontWeight: 700, letterSpacing: 0.4 }}>CH{ch.channel_number}</span>
              )}
              {isCurrent && (
                <div style={{ display: "flex", alignItems: "center", gap: 3, marginLeft: "auto" }}>
                  <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite" }} />
                  <span style={{ fontSize: 8, color: "#ef4444", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>watching</span>
                </div>
              )}
            </div>
            <p style={{ margin: "0 0 3px", fontSize: 12, fontWeight: 700, color: isCurrent ? "#e0e7ff" : "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.title}</p>
            <p style={{ margin: 0, fontSize: 10, color: isCurrent ? "#6366f1" : "#2e2e3a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {nowAiring ? nowAiring.title : "No guide info"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function getEmbedUrl(url) {
  if (!url) return null;
  const match = url.match(/archive\.org\/download\/([^/]+)/);
  if (match) return `https://archive.org/embed/${match[1]}`;
  if (url.includes("archive.org/embed/")) return url;
  return null;
}

function isHlsUrl(url) {
  return !!url && (url.includes(".m3u8") || url.includes("m3u8"));
}

function PlayerView({ video, onBack, onGoHome, onSelect, onShowSelect, user, myList, onToggleList, onAuthOpen, onProfileOpen, userAvatarId, activeProfile }) {
  const isMobile = useIsMobile();
  const [allVideos, setAllVideos] = useState([]);
  const [allShows, setAllShows] = useState([]);
  const [nextEpisode, setNextEpisode] = useState(null);
  const [countdownActive, setCountdownActive] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const adContainerRef = useRef(null);
  const adsManagerRef = useRef(null);
  const displayContainerRef = useRef(null);
  const midRollFiredRef = useRef(false);
  const postRollFiredRef = useRef(false);
  const [adPlaying, setAdPlaying] = useState(false);
  const [adVastUrl, setAdVastUrl] = useState(null);
  const [liveChannels, setLiveChannels] = useState([]);
  const [liveEpg, setLiveEpg] = useState([]);

  const isLive = video._type === "live" || video._type === "live_epg";
  const isEpisode = !!video.show_id;
  const [myRating, setMyRating] = useState(null);
  const [ratingCounts, setRatingCounts] = useState({ up: 0, down: 0 });
  const progressTimerRef = useRef(null);
  const viewCountedRef = useRef(false);
  const saveProgressRef = useRef(null);
  const [continueWatching, setContinueWatching] = useState([]);
  const playerContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const countdownGuardRef = useRef(false);
  const [guideVisible, setGuideVisible] = useState(false);
  const [guideExpanded, setGuideExpanded] = useState(false);
  const [currentViewers, setCurrentViewers] = useState(0);
  const guideHideRef = useRef(null);
  const [streamEnded, setStreamEnded] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    Promise.all([
      supabase.from("videos").select("*"),
      supabase.from("shows").select("*"),
    ]).then(([vRes, sRes]) => {
      if (vRes.data) setAllVideos(vRes.data);
      if (sRes.data) setAllShows(sRes.data);
    });
  }, []);

  useEffect(() => {
    if (!isLive) return;
    const epgStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const epgEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    Promise.all([
      supabase.from("live_streams").select("*").order("channel_number", { ascending: true }),
      supabase.from("epg_entries").select("*").gte("end_time", epgStart).lte("start_time", epgEnd),
    ]).then(([liveRes, epgRes]) => {
      if (liveRes.data) setLiveChannels(liveRes.data);
      if (epgRes.data) setLiveEpg(epgRes.data);
    });
  }, [isLive]);

  // Cloudflare stream: subscribe to is_live changes for stream ended state
  useEffect(() => {
    if (!video.stream_uid) return;
    const ch = supabase
      .channel(`live-status-${video.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_streams", filter: `id=eq.${video.id}` },
        ({ new: row }) => { if (!row.is_live) setStreamEnded(true); }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [video.id, video.stream_uid]);

  // Cloudflare stream: load and subscribe to chat messages
  useEffect(() => {
    if (!video.stream_uid) return;
    supabase.from("stream_chat").select("id, message, user_id, display_name, created_at")
      .eq("stream_id", video.id).order("created_at", { ascending: true }).limit(200)
      .then(({ data }) => { if (data) setChatMessages(data); });
    const ch = supabase
      .channel(`chat-${video.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stream_chat", filter: `stream_id=eq.${video.id}` },
        ({ new: msg }) => {
          setChatMessages(prev => [...prev, msg]);
          setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [video.id, video.stream_uid]);

  async function sendChat() {
    if (!chatInput.trim() || !user || chatSending) return;
    const msg = chatInput.trim();
    const bannedWords = video.banned_words || [];
    if (bannedWords.length > 0) {
      const lower = msg.toLowerCase();
      if (bannedWords.some(w => lower.includes(w.toLowerCase()))) {
        setChatInput("");
        return;
      }
    }
    setChatSending(true);
    setChatInput("");
    await supabase.from("stream_chat").insert({
      stream_id: video.id,
      user_id: user.id,
      display_name: activeProfile?.name || user.email.split("@")[0],
      message: msg,
    });
    setChatSending(false);
  }

  useEffect(() => {
    setNextEpisode(null);
    if (!isEpisode) return;
    supabase.from("episodes").select("*").eq("show_id", video.show_id)
      .order("season", { ascending: true })
      .order("episode_number", { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        const idx = data.findIndex(e => e.id === video.id);
        const candidate = idx >= 0 && idx < data.length - 1 ? data[idx + 1] : null;
        const isForward = candidate && (
          candidate.season > video.season ||
          (candidate.season === video.season && candidate.episode_number > video.episode_number)
        );
        setNextEpisode(isForward ? candidate : null);
      });
  }, [video.id, video.show_id, isEpisode]);

  useEffect(() => {
    setCountdownActive(false);
    setCountdown(10);
    clearInterval(countdownTimerRef.current);
    countdownGuardRef.current = false;
  }, [video.id]);

  useEffect(() => () => clearInterval(countdownTimerRef.current), []);

  useEffect(() => {
    if (viewCountedRef.current) return;
    viewCountedRef.current = true;
    supabase.rpc("increment_view", { p_id: video.id, p_table: isEpisode ? "episodes" : "videos" }).then(() => {}, () => {});
  }, [video.id]);

  useEffect(() => {
    const ct = isEpisode ? "episode" : "movie";
    supabase.from("ratings").select("rating").eq("content_id", video.id).eq("content_type", ct)
      .then(({ data }) => { if (data) setRatingCounts({ up: data.filter(r => r.rating === 1).length, down: data.filter(r => r.rating === -1).length }); });
    if (user) {
      supabase.from("ratings").select("rating").eq("user_id", user.id).eq("content_id", video.id).eq("content_type", ct).maybeSingle()
        .then(({ data }) => { if (data) setMyRating(data.rating); });
    }
  }, [video.id, user]);

  useEffect(() => {
    if (!user || !activeProfile) { setContinueWatching([]); return; }
    (async () => {
      const { data: progress } = await supabase.from("watch_progress").select("*")
        .eq("user_id", user.id).eq("profile_id", activeProfile.id).eq("completed", false)
        .order("last_watched_at", { ascending: false }).limit(15);
      if (!progress || progress.length === 0) return;
      const movieIds = progress.filter(p => p.content_type === "movie").map(p => p.content_id);
      const episodeIds = progress.filter(p => p.content_type === "episode").map(p => p.content_id);
      const [movRes, epRes] = await Promise.all([
        movieIds.length ? supabase.from("videos").select("*").in("id", movieIds) : { data: [] },
        episodeIds.length ? supabase.from("episodes").select("*").in("id", episodeIds) : { data: [] },
      ]);
      const pMap = {};
      progress.forEach(p => { pMap[`${p.content_type}_${p.content_id}`] = p; });
      const items = [
        ...(movRes.data || []).map(v => ({ ...v, _type: "movie", _progress: pMap[`movie_${v.id}`] })),
        ...(epRes.data || []).map(e => ({ ...e, _type: "episode", _progress: pMap[`episode_${e.id}`] })),
      ]
        .filter(item => !(item._type === (isEpisode ? "episode" : "movie") && item.id === video.id))
        .sort((a, b) => new Date(b._progress.last_watched_at) - new Date(a._progress.last_watched_at));
      setContinueWatching(items);
    })();
  }, [video.id, user, activeProfile?.id]);

  // HLS.js setup for .m3u8 streams
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !isHlsUrl(video.url) || getEmbedUrl(video.url)) return;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(video.url);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { videoEl.play().catch(() => {}); });
      hlsRef.current = hls;
    } else if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
      videoEl.src = video.url;
      videoEl.play().catch(() => {});
    }
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [video.url]);

  useEffect(() => {
    if (!user || !activeProfile || getEmbedUrl(video.url) || video._type === "live" || video._type === "live_epg") return;
    const ct = isEpisode ? "episode" : "movie";
    saveProgressRef.current = async () => {
      if (!videoRef.current) return;
      const { currentTime, duration } = videoRef.current;
      if (currentTime < 5 || !duration) return;
      await supabase.from("watch_progress").upsert({
        user_id: user.id, profile_id: activeProfile.id, content_id: video.id, content_type: ct,
        progress_seconds: currentTime, duration_seconds: duration,
        completed: currentTime / duration > 0.9 || duration - currentTime < 60,
        last_watched_at: new Date().toISOString(),
      }, { onConflict: "user_id,profile_id,content_id,content_type" });
    };
    progressTimerRef.current = setInterval(() => { saveProgressRef.current?.(); }, 15000);
    return () => clearInterval(progressTimerRef.current);
  }, [video.id, user, activeProfile?.id]);

  useEffect(() => () => { clearInterval(progressTimerRef.current); saveProgressRef.current?.(); }, []);

  useEffect(() => () => { document.body.style.overflow = ""; }, []);

  // Fetch VAST tag + initialize IMA pre-roll in one effect
  useEffect(() => {
    if (getEmbedUrl(video.url)) return;
    let cancelled = false;

    async function runAd() {
      // One pre-roll per session, 30-min cooldown
      const lastAd = sessionStorage.getItem("lastAdAt");
      if (lastAd && Date.now() - Number(lastAd) < 30 * 60 * 1000) return;

      // Wait up to 3s for IMA SDK script to load
      let waited = 0;
      while (!window.google?.ima && waited < 3000) {
        await new Promise(r => setTimeout(r, 100));
        waited += 100;
      }
      if (cancelled || !window.google?.ima) return;

      // Fetch best matching pre-roll tag
      const contentScope = isEpisode ? "episode" : "movie";
      const { data } = await supabase.from("vast_tags")
        .select("id, tag_url, scope, content_id")
        .eq("active", true)
        .eq("ad_type", "pre_roll")
        .or(`scope.eq.global,scope.eq.${contentScope}`);
      if (cancelled || !data || data.length === 0) return;

      const exact = data.find(t => t.content_id === video.id);
      const typed = data.find(t => t.scope === contentScope && !t.content_id);
      const glob  = data.find(t => t.scope === "global");
      const tag = exact || typed || glob;
      if (!tag) return;

      const logAdEvent = (event) => {
        supabase.from("ad_impressions").insert({ vast_tag_id: tag.id, video_id: video.id, event, user_id: user?.id ?? null }).then(() => {});
      };

      const ima = window.google.ima;
      const videoEl = videoRef.current;
      const adContainer = adContainerRef.current;
      if (cancelled || !videoEl || !adContainer) return;

      // Pause content while ad loads
      videoEl.pause();
      setAdPlaying(true);
      setAdVastUrl(tag.tag_url);

      if (!displayContainerRef.current) {
        displayContainerRef.current = new ima.AdDisplayContainer(adContainer, videoEl);
        displayContainerRef.current.initialize();
      }
      const adsLoader = new ima.AdsLoader(displayContainerRef.current);

      const resume = () => {
        setAdPlaying(false);
        if (!cancelled) videoEl.play().catch(() => {});
      };

      adsLoader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (e) => {
        if (cancelled) return;
        const mgr = e.getAdsManager(videoEl);
        adsManagerRef.current = mgr;

        mgr.addEventListener(ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, () => { videoEl.pause(); setAdPlaying(true); });
        mgr.addEventListener(ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, resume);
        mgr.addEventListener(ima.AdEvent.Type.STARTED, () => { sessionStorage.setItem("lastAdAt", Date.now()); logAdEvent("impression"); });
        mgr.addEventListener(ima.AdEvent.Type.COMPLETE, () => logAdEvent("complete"));
        mgr.addEventListener(ima.AdEvent.Type.SKIPPED, () => logAdEvent("skip"));
        mgr.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => { logAdEvent("error"); mgr.destroy(); adsManagerRef.current = null; resume(); });

        try {
          const w = videoEl.clientWidth || 640;
          const h = videoEl.clientHeight || 360;
          mgr.init(w, h, ima.ViewMode.NORMAL);
          mgr.start();
        } catch {
          mgr.destroy();
          adsManagerRef.current = null;
          resume();
        }
      });

      adsLoader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => { logAdEvent("error"); resume(); });

      const req = new ima.AdsRequest();
      req.adTagUrl = tag.tag_url;
      req.linearAdSlotWidth = videoEl.clientWidth || 640;
      req.linearAdSlotHeight = videoEl.clientHeight || 360;
      adsLoader.requestAds(req);
    }

    runAd();

    return () => {
      cancelled = true;
      midRollFiredRef.current = false;
      postRollFiredRef.current = false;
      adsManagerRef.current?.destroy();
      adsManagerRef.current = null;
      displayContainerRef.current = null;
    };
  }, [video.id]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e) => {
      if (e.key === "Escape") toggleFullscreen();
      if ((e.key === " " || e.key === "Spacebar") && !getEmbedUrl(video.url)) {
        e.preventDefault();
        togglePlayPause();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  // Live viewer heartbeat — register this session while watching live
  useEffect(() => {
    if (!isLive || !video.id) return;
    let sid = sessionStorage.getItem("peep_live_session");
    if (!sid) {
      sid = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();
      sessionStorage.setItem("peep_live_session", sid);
    }
    const ping = () => supabase.from("live_viewers").upsert(
      { session_id: sid, channel_id: video.id, user_id: user?.id ?? null, last_ping: new Date().toISOString() },
      { onConflict: "session_id" }
    ).then(() => {});
    ping();
    const t = setInterval(ping, 30000);
    return () => {
      clearInterval(t);
      supabase.from("live_viewers").delete().eq("session_id", sid).then(() => {});
    };
  }, [video.id, isLive]);

  // Live viewer count for current channel
  useEffect(() => {
    if (!isLive) return;
    async function fetchCount() {
      const cutoff = new Date(Date.now() - 90 * 1000).toISOString();
      const { count } = await supabase.from("live_viewers")
        .select("*", { count: "exact", head: true })
        .eq("channel_id", video.id)
        .gte("last_ping", cutoff);
      if (count !== null) setCurrentViewers(count);
    }
    fetchCount();
    const t = setInterval(fetchCount, 30000);
    return () => { clearInterval(t); setCurrentViewers(0); };
  }, [video.id, isLive]);

  // Live chat — subscribe when 2+ viewers present
  // Fullscreen guide — show on mouse move, expand on scroll down, hide on inactivity
  useEffect(() => {
    if (!isFullscreen || !isLive) {
      setGuideVisible(false);
      setGuideExpanded(false);
      clearTimeout(guideHideRef.current);
      return;
    }
    const container = playerContainerRef.current;
    if (!container) return;

    function arm(expanded) {
      clearTimeout(guideHideRef.current);
      setGuideVisible(true);
      if (expanded) setGuideExpanded(true);
      guideHideRef.current = setTimeout(() => {
        setGuideVisible(false);
        setGuideExpanded(false);
      }, 4500);
    }

    const onMove = () => arm(false);
    const onWheel = e => {
      e.preventDefault();
      if (e.deltaY > 0) arm(true);
      else setGuideExpanded(false);
    };

    container.addEventListener("mousemove", onMove);
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("mousemove", onMove);
      container.removeEventListener("wheel", onWheel);
      clearTimeout(guideHideRef.current);
    };
  }, [isFullscreen, isLive]);

  function toggleFullscreen() {
    setIsFullscreen(prev => {
      document.body.style.overflow = prev ? "" : "hidden";
      return !prev;
    });
  }

  function togglePlayPause() {
    if (!videoRef.current) return;
    if (videoRef.current.paused) videoRef.current.play().catch(() => {});
    else videoRef.current.pause();
  }

  function startCountdown(seconds) {
    const ep = nextEpisode;
    const total = Math.min(10, Math.ceil(seconds));
    setCountdownActive(true);
    setCountdown(total);
    clearInterval(countdownTimerRef.current);
    let remaining = total;
    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownTimerRef.current);
        setCountdownActive(false);
        onSelect(ep);
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }

  function handleTimeUpdate(e) {
    const { currentTime, duration } = e.currentTarget;
    if (!duration || isNaN(duration)) return;

    // Mid-roll: fire once at 50% for videos over 20 minutes
    if (!midRollFiredRef.current && !getEmbedUrl(video.url) && duration >= 1200 && currentTime / duration >= 0.5) {
      midRollFiredRef.current = true;
      playMidRoll();
    }

    if (!nextEpisode || countdownGuardRef.current) return;
    if (localStorage.getItem(PREF_AUTOPLAY_NEXT) === "false") return;
    if (duration - currentTime <= 10) {
      countdownGuardRef.current = true;
      startCountdown(duration - currentTime);
    }
  }

  async function playMidRoll() {
    if (!window.google?.ima) return;
    const contentScope = isEpisode ? "episode" : "movie";
    const { data } = await supabase.from("vast_tags")
      .select("id, tag_url, scope, content_id")
      .eq("active", true)
      .eq("ad_type", "mid_roll")
      .or(`scope.eq.global,scope.eq.${contentScope}`);
    if (!data || data.length === 0) return;

    const exact = data.find(t => t.content_id === video.id);
    const typed = data.find(t => t.scope === contentScope && !t.content_id);
    const glob  = data.find(t => t.scope === "global");
    const tag = exact || typed || glob;
    if (!tag) return;

    const logAdEvent = (event) => {
      supabase.from("ad_impressions").insert({ vast_tag_id: tag.id, video_id: video.id, event, user_id: user?.id ?? null }).then(() => {});
    };

    const ima = window.google.ima;
    const videoEl = videoRef.current;
    const adContainer = adContainerRef.current;
    if (!videoEl || !adContainer) return;

    videoEl.pause();
    setAdPlaying(true);

    if (!displayContainerRef.current) {
      displayContainerRef.current = new ima.AdDisplayContainer(adContainer, videoEl);
      displayContainerRef.current.initialize();
    }
    const adsLoader = new ima.AdsLoader(displayContainerRef.current);

    const resume = () => { setAdPlaying(false); videoEl.play().catch(() => {}); };

    adsLoader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (e) => {
      const mgr = e.getAdsManager(videoEl);
      mgr.addEventListener(ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, () => { videoEl.pause(); setAdPlaying(true); });
      mgr.addEventListener(ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, resume);
      mgr.addEventListener(ima.AdEvent.Type.STARTED, () => logAdEvent("impression"));
      mgr.addEventListener(ima.AdEvent.Type.COMPLETE, () => logAdEvent("complete"));
      mgr.addEventListener(ima.AdEvent.Type.SKIPPED, () => logAdEvent("skip"));
      mgr.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => { logAdEvent("error"); mgr.destroy(); resume(); });
      try {
        mgr.init(videoEl.clientWidth || 640, videoEl.clientHeight || 360, ima.ViewMode.NORMAL);
        mgr.start();
      } catch { mgr.destroy(); resume(); }
    });
    adsLoader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => { logAdEvent("error"); resume(); });

    const req = new ima.AdsRequest();
    req.adTagUrl = tag.tag_url;
    req.linearAdSlotWidth = videoEl.clientWidth || 640;
    req.linearAdSlotHeight = videoEl.clientHeight || 360;
    adsLoader.requestAds(req);
  }

  function playPostRoll(onComplete) {
    if (!window.google?.ima || postRollFiredRef.current) { onComplete(); return; }
    postRollFiredRef.current = true;
    const contentScope = isEpisode ? "episode" : "movie";
    supabase.from("vast_tags")
      .select("id, tag_url, scope, content_id")
      .eq("active", true)
      .eq("ad_type", "post_roll")
      .or(`scope.eq.global,scope.eq.${contentScope}`)
      .then(({ data }) => {
        if (!data || data.length === 0) { onComplete(); return; }
        const exact = data.find(t => t.content_id === video.id);
        const typed = data.find(t => t.scope === contentScope && !t.content_id);
        const glob  = data.find(t => t.scope === "global");
        const tag = exact || typed || glob;
        if (!tag) { onComplete(); return; }

        const logAdEvent = (event) => {
          supabase.from("ad_impressions").insert({ vast_tag_id: tag.id, video_id: video.id, event, user_id: user?.id ?? null }).then(() => {});
        };

        const ima = window.google.ima;
        const videoEl = videoRef.current;
        const adContainer = adContainerRef.current;
        if (!videoEl || !adContainer) { onComplete(); return; }

        setAdPlaying(true);
        if (!displayContainerRef.current) {
          displayContainerRef.current = new ima.AdDisplayContainer(adContainer, videoEl);
          displayContainerRef.current.initialize();
        }
        const adsLoader = new ima.AdsLoader(displayContainerRef.current);
        const done = () => { setAdPlaying(false); onComplete(); };

        adsLoader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (e) => {
          const mgr = e.getAdsManager(videoEl);
          mgr.addEventListener(ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, () => { videoEl.pause(); setAdPlaying(true); });
          mgr.addEventListener(ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, done);
          mgr.addEventListener(ima.AdEvent.Type.STARTED, () => logAdEvent("impression"));
          mgr.addEventListener(ima.AdEvent.Type.COMPLETE, () => logAdEvent("complete"));
          mgr.addEventListener(ima.AdEvent.Type.SKIPPED, () => logAdEvent("skip"));
          mgr.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => { logAdEvent("error"); mgr.destroy(); done(); });
          try {
            mgr.init(videoEl.clientWidth || 640, videoEl.clientHeight || 360, ima.ViewMode.NORMAL);
            mgr.start();
          } catch { mgr.destroy(); done(); }
        });
        adsLoader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, () => { logAdEvent("error"); done(); });

        const req = new ima.AdsRequest();
        req.adTagUrl = tag.tag_url;
        req.linearAdSlotWidth = videoEl.clientWidth || 640;
        req.linearAdSlotHeight = videoEl.clientHeight || 360;
        adsLoader.requestAds(req);
      });
  }

  async function handleEnded() {
    if (user && activeProfile && videoRef.current && !getEmbedUrl(video.url)) {
      const { currentTime, duration } = videoRef.current;
      if (duration > 0) {
        const ct = isEpisode ? "episode" : "movie";
        await supabase.from("watch_progress").upsert({ user_id: user.id, profile_id: activeProfile.id, content_id: video.id, content_type: ct, progress_seconds: currentTime, duration_seconds: duration, completed: true, last_watched_at: new Date().toISOString() }, { onConflict: "user_id,profile_id,content_id,content_type" });
      }
    }
    const afterAd = () => {
      if (nextEpisode && localStorage.getItem(PREF_AUTOPLAY_NEXT) !== "false") { clearInterval(countdownTimerRef.current); onSelect(nextEpisode); }
    };
    if (!getEmbedUrl(video.url)) playPostRoll(afterAd);
    else afterAd();
  }

  function cancelCountdown() {
    countdownGuardRef.current = false;
    setCountdownActive(false);
    clearInterval(countdownTimerRef.current);
  }

  async function handleRemoveCW(item) {
    if (!user || !activeProfile) return;
    const ct = item._type === "episode" ? "episode" : "movie";
    await supabase.from("watch_progress").upsert(
      { user_id: user.id, profile_id: activeProfile.id, content_id: item.id, content_type: ct, completed: true, last_watched_at: new Date().toISOString() },
      { onConflict: "user_id,profile_id,content_id,content_type" }
    );
    setContinueWatching(prev => prev.filter(i => !(i._type === item._type && i.id === item.id)));
  }

  async function rate(val) {
    if (!user) { onAuthOpen?.(); return; }
    const ct = isEpisode ? "episode" : "movie";
    if (myRating === val) {
      await supabase.from("ratings").delete().eq("user_id", user.id).eq("content_id", video.id).eq("content_type", ct);
      setMyRating(null);
      setRatingCounts(p => ({ up: p.up - (val === 1 ? 1 : 0), down: p.down - (val === -1 ? 1 : 0) }));
    } else {
      await supabase.from("ratings").upsert({ user_id: user.id, content_id: video.id, content_type: ct, rating: val }, { onConflict: "user_id,content_id,content_type" });
      setRatingCounts(p => ({ up: p.up + (val === 1 ? 1 : 0) - (myRating === 1 ? 1 : 0), down: p.down + (val === -1 ? 1 : 0) - (myRating === -1 ? 1 : 0) }));
      setMyRating(val);
    }
  }

  function handleLoadedMetadata() {
    if (!videoRef.current) return;
    if ((video._type === "live_epg") && video._elapsed > 0 && !getEmbedUrl(video.url)) {
      const { duration } = videoRef.current;
      if (duration && video._elapsed < duration) videoRef.current.currentTime = video._elapsed;
      return;
    }
    if (!user || !activeProfile || getEmbedUrl(video.url)) return;
    const ct = isEpisode ? "episode" : "movie";
    supabase.from("watch_progress").select("progress_seconds, duration_seconds, completed")
      .eq("user_id", user.id).eq("profile_id", activeProfile.id).eq("content_id", video.id).eq("content_type", ct).maybeSingle()
      .then(({ data }) => {
        if (!data || data.completed || !videoRef.current) return;
        const pct = data.duration_seconds > 0 ? data.progress_seconds / data.duration_seconds : 0;
        if (data.progress_seconds > 10 && pct < 0.9) videoRef.current.currentTime = data.progress_seconds;
      });
  }

  const allRelatable = [
    ...allVideos.map(v => ({ ...v, _type: "movie" })),
    ...allShows.map(s => ({ ...s, _type: "show" })),
  ];
  const related = isEpisode ? [] : rankRelated(
    video,
    allRelatable.filter(v => !(v._type === "movie" && v.id === video.id)),
  );

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>
      <nav style={{ position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${PAD}`, height: 68, background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#ccc", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
            Back
          </button>
          <span onClick={onGoHome} style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, cursor: "pointer" }}><span style={{ color: "#facc15" }}>peep.</span></span>
        </div>
        {(() => {
          const av = avatarForId(userAvatarId || activeProfile?.avatar_id);
          return user ? (
            <div onClick={onProfileOpen} title={activeProfile?.name ?? "Profile"} style={{ width: 34, height: 34, borderRadius: "50%", background: av?.gradient ?? "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: av ? 15 : 13, fontWeight: 700, cursor: "pointer", color: "#fff", flexShrink: 0, border: "2px solid transparent", transition: "border-color 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#facc15"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}>
              {av ? av.emoji : (activeProfile?.name?.[0] || user.email[0]).toUpperCase()}
            </div>
          ) : null;
        })()}
      </nav>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: `40px ${PAD} 80px` }}>
        <style>{`
          video::-webkit-media-controls-fullscreen-button{display:none!important}
          ${(video._type === "live" || video._type === "live_epg") ? "video::-webkit-media-controls-timeline{display:none!important} video::-webkit-media-controls-time-remaining-display{display:none!important} video::-webkit-media-controls-current-time-display{display:none!important}" : ""}
          @keyframes livepulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(1.3); } }
        `}</style>
        <div ref={playerContainerRef} style={isFullscreen ? { position: "fixed", inset: 0, zIndex: 999, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" } : { position: "relative", marginBottom: 30 }}>
          <div style={isFullscreen ? { position: "relative", width: "100%", height: "100%" } : { background: "#000", borderRadius: 14, overflow: "hidden", aspectRatio: "16/9", boxShadow: "0 32px 80px rgba(0,0,0,0.8)", position: "relative" }}>
            {getEmbedUrl(video.url) ? (
              <iframe src={getEmbedUrl(video.url)} style={{ width: "100%", height: "100%", display: "block", border: "none" }} allowFullScreen allow="autoplay" />
            ) : (
              <video ref={videoRef} controls controlsList="nofullscreen" autoPlay style={{ width: "100%", height: "100%", display: "block", cursor: isFullscreen ? "pointer" : "default" }} poster={video.thumbnail}
                onClick={isFullscreen ? togglePlayPause : undefined}
                onTimeUpdate={handleTimeUpdate} onEnded={handleEnded} onLoadedMetadata={handleLoadedMetadata}>
                {!isHlsUrl(video.url) && <source src={video.url} type="video/mp4" />}
              </video>
            )}
            <div ref={adContainerRef} style={{ position: "absolute", inset: 0, zIndex: 10, pointerEvents: adPlaying ? "auto" : "none" }} />
            {streamEnded && (
              <div style={{ position: "absolute", inset: 0, zIndex: 20, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                <div style={{ fontSize: 52, lineHeight: 1 }}>📺</div>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#fff" }}>Stream Ended</p>
                <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>The streamer has disconnected.</p>
              </div>
            )}
          </div>
          {!getEmbedUrl(video.url) && (
            <button onClick={toggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} style={{ position: "absolute", bottom: isFullscreen ? 60 : 12, right: 16, zIndex: 1000, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 7, padding: "7px 9px", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center" }}>
              {isFullscreen
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
              }
            </button>
          )}
          {countdownActive && nextEpisode && (
            <div style={{ position: "absolute", bottom: isFullscreen ? 80 : 20, right: 20, background: "rgba(15,15,15,0.96)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "18px 20px", display: "flex", alignItems: "center", gap: 18, minWidth: 290, zIndex: 1000, boxShadow: "0 8px 32px rgba(0,0,0,0.7)" }}>
              <div style={{ position: "relative", flexShrink: 0, width: 54, height: 54 }}>
                <svg width="54" height="54" viewBox="0 0 54 54" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="27" cy="27" r="21" fill="none" stroke="#222" strokeWidth="4" />
                  <circle cx="27" cy="27" r="21" fill="none" stroke="#facc15" strokeWidth="4"
                    strokeDasharray={2 * Math.PI * 21}
                    strokeDashoffset={2 * Math.PI * 21 * (1 - countdown / 10)}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 0.9s linear" }}
                  />
                </svg>
                <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, color: "#fff" }}>{countdown}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: "0 0 2px", fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1 }}>Next Episode</p>
                <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#e5e5e5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  S{nextEpisode.season} E{nextEpisode.episode_number} · {nextEpisode.title}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { clearInterval(countdownTimerRef.current); onSelect(nextEpisode); }}
                    style={{ background: "#facc15", border: "none", borderRadius: 6, padding: "6px 14px", color: "#0a0a0a", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Play Now
                  </button>
                  <button onClick={cancelCountdown}
                    style={{ background: "transparent", border: "1px solid #2a2a2a", borderRadius: 6, padding: "6px 12px", color: "#666", fontSize: 12, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Fullscreen channel guide overlay ── */}
          {isFullscreen && isLive && guideVisible && (
            <div
              style={{
                position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 50,
                background: guideExpanded
                  ? "linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.88) 75%, transparent 100%)"
                  : "linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)",
                padding: guideExpanded ? "64px 36px 28px" : "48px 36px 22px",
                transition: "padding 0.3s ease",
                cursor: "default",
              }}
              onMouseEnter={() => clearTimeout(guideHideRef.current)}
              onMouseLeave={() => {
                guideHideRef.current = setTimeout(() => { setGuideVisible(false); setGuideExpanded(false); }, 2000);
              }}
            >
              {/* Mini info bar — always visible when guide is shown */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: guideExpanded ? 22 : 0, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#ef4444", borderRadius: 4, padding: "3px 8px" }}>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite" }} />
                    <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", letterSpacing: 1 }}>{video.badge_text || "LIVE"}</span>
                  </div>
                  {video.channel_number != null && video.channel_number !== "" && (
                    <span style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>CH {video.channel_number}</span>
                  )}
                </div>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{video.title}</span>
                {video.now_airing && (
                  <>
                    <span style={{ color: "#2a2a2a", fontSize: 16 }}>·</span>
                    <span style={{ fontSize: 14, color: "#9ca3af" }}>{video.now_airing}</span>
                  </>
                )}
                {currentViewers > 0 && (
                  <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#4b5563" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                    {currentViewers.toLocaleString()} watching
                  </span>
                )}
                {!guideExpanded && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#333", fontSize: 11, marginLeft: "auto" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
                    scroll for guide
                  </div>
                )}
              </div>

              {/* Expanded channel grid */}
              {guideExpanded && liveChannels.length > 0 && (
                <FullscreenGuide
                  channels={liveChannels}
                  epgEntries={liveEpg}
                  currentId={video.id}
                  onSwitch={ch => {
                    const now = new Date();
                    const cur = liveEpg.find(e => e.channel_id === ch.id && new Date(e.start_time) <= now && new Date(e.end_time) > now);
                    const upNext = liveEpg.filter(e => e.channel_id === ch.id && new Date(e.start_time) > now).sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
                    onSelect({ ...ch, url: ch.stream_url, _type: "live", now_airing: cur?.title ?? ch.now_airing, up_next: upNext?.title ?? ch.up_next, badge_text: ch.badge_text || "LIVE" });
                    setGuideVisible(false);
                    setGuideExpanded(false);
                  }}
                />
              )}
            </div>
          )}
        </div>

        {(video._type === "live" || video._type === "live_epg") && (video.now_airing || video.up_next) && (
          <div style={{ marginBottom: 24, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            {video.now_airing && (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite", flexShrink: 0 }} />
                <div>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 700 }}>Now Airing</p>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#e5e5e5" }}>{video.now_airing}</p>
                </div>
              </div>
            )}
            {video.up_next && (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#333", flexShrink: 0 }} />
                <div>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 700 }}>Up Next</p>
                  <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>{video.up_next}</p>
                </div>
              </div>
            )}
            {currentViewers > 0 && (
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#4b5563" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                {currentViewers.toLocaleString()} watching now
              </div>
            )}
          </div>
        )}

        {/* Live chat — Cloudflare-managed streams only */}
        {video.stream_uid && (
          <div style={{ marginBottom: 24, background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite", flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Live Chat</span>
            </div>
            <div style={{ height: 280, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {chatMessages.length === 0 ? (
                <p style={{ margin: "auto", fontSize: 13, color: "#444", textAlign: "center" }}>No messages yet. Be the first to say hi!</p>
              ) : chatMessages.map(m => (
                <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                    {(m.display_name || "?")[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#facc15", marginRight: 6 }}>{m.display_name || "Viewer"}</span>
                    <span style={{ fontSize: 13, color: "#e5e5e5", wordBreak: "break-word" }}>{m.message}</span>
                  </div>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>
            <div style={{ borderTop: "1px solid #1e1e1e", padding: "10px 12px", display: "flex", gap: 8 }}>
              {user ? (
                <>
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat()}
                    placeholder="Say something…"
                    maxLength={200}
                    style={{ flex: 1, background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                  />
                  <button onClick={sendChat} disabled={!chatInput.trim() || chatSending}
                    style={{ background: "#facc15", border: "none", borderRadius: 8, padding: "9px 16px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: chatInput.trim() ? "pointer" : "not-allowed", opacity: chatInput.trim() ? 1 : 0.5, flexShrink: 0 }}>
                    Send
                  </button>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "#555", flex: 1, textAlign: "center", padding: "8px 0" }}>
                  <button onClick={onAuthOpen} style={{ background: "none", border: "none", color: "#facc15", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>Sign in</button>
                  {" "}to join the chat
                </p>
              )}
            </div>
          </div>
        )}

        {isLive && liveChannels.length > 0 && (
          <LiveChannelStrip
            channels={liveChannels}
            epgEntries={liveEpg}
            currentId={video.id}
            onSwitch={ch => {
              const now = new Date();
              const cur = liveEpg.find(e => e.channel_id === ch.id && new Date(e.start_time) <= now && new Date(e.end_time) > now);
              const upNext = liveEpg.filter(e => e.channel_id === ch.id && new Date(e.start_time) > now).sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
              onSelect({ ...ch, url: ch.stream_url, _type: "live", now_airing: cur?.title ?? ch.now_airing, up_next: upNext?.title ?? ch.up_next, badge_text: ch.badge_text || "LIVE" });
            }}
          />
        )}


        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 48, gap: isMobile ? 24 : 0 }}>
          <div style={{ flex: 1, maxWidth: 700 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              {(video._type === "live" || video._type === "live_epg") && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#ef4444", borderRadius: 5, padding: "4px 10px" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 }}>{video.badge_text || "LIVE"}</span>
                </div>
              )}
              {video.channel_number != null && video.channel_number !== "" && (
                <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>CH {video.channel_number}</span>
              )}
            </div>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 38, margin: "0 0 14px", fontWeight: 400 }}>{video.title}</h1>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
              {video.score && <span style={{ color: "#4ade80", fontWeight: 700, fontSize: 14 }}>{video.score}% Match</span>}
              {video.year && <span style={{ color: "#666", fontSize: 13 }}>{video.year}</span>}
              {video.rating && <span style={{ border: "1px solid #2e2e2e", color: "#666", fontSize: 11, padding: "2px 8px", borderRadius: 4 }}>{video.rating}</span>}
              {video.duration && <span style={{ color: "#666", fontSize: 13 }}>{video.duration}</span>}
              {video._type !== "live" && <span style={{ background: "#1a1a1a", border: "1px solid #222", color: "#777", fontSize: 11, padding: "3px 10px", borderRadius: 4, fontWeight: 600, letterSpacing: 0.5 }}>FREE</span>}
            </div>
            {video.description && <p style={{ fontSize: 15, color: "#888", lineHeight: 1.8, margin: 0 }}>{video.description}</p>}
          </div>
          <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", flexWrap: "wrap", gap: 10, marginLeft: isMobile ? 0 : 48, minWidth: isMobile ? 0 : 150 }}>
            {(() => {
              const type = video._type || (video.show_id ? "episode" : "movie");
              const inList = type !== "episode" && myList?.[`${type}_${video.id}`];
              return (
                <button onClick={() => type !== "episode" && onToggleList?.(video.id, type)}
                  style={{ background: inList ? "rgba(250,204,21,0.15)" : "#facc15", border: inList ? "1px solid rgba(250,204,21,0.4)" : "none", borderRadius: 7, padding: "12px 20px", color: inList ? "#facc15" : "#0a0a0a", fontSize: 13, fontWeight: 600, cursor: type === "episode" ? "default" : "pointer", opacity: type === "episode" ? 0.4 : 1 }}>
                  {inList ? "✓ In My List" : "+ My List"}
                </button>
              );
            })()}
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => rate(1)} style={{ flex: 1, background: myRating === 1 ? "rgba(74,222,128,0.15)" : "#1a1a1a", border: `1px solid ${myRating === 1 ? "rgba(74,222,128,0.4)" : "#242424"}`, borderRadius: 7, padding: "10px 0", color: myRating === 1 ? "#4ade80" : "#555", fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                👍 {ratingCounts.up > 0 && <span style={{ fontSize: 12 }}>{ratingCounts.up}</span>}
              </button>
              <button onClick={() => rate(-1)} style={{ flex: 1, background: myRating === -1 ? "rgba(248,113,113,0.15)" : "#1a1a1a", border: `1px solid ${myRating === -1 ? "rgba(248,113,113,0.4)" : "#242424"}`, borderRadius: 7, padding: "10px 0", color: myRating === -1 ? "#f87171" : "#555", fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                👎 {ratingCounts.down > 0 && <span style={{ fontSize: 12 }}>{ratingCounts.down}</span>}
              </button>
            </div>
            <button
              onClick={() => {
                const url = window.location.href;
                if (navigator.share) {
                  navigator.share({ title: video.title, url }).catch(() => {});
                } else {
                  navigator.clipboard.writeText(url).then(() => {
                    setShareCopied(true);
                    setTimeout(() => setShareCopied(false), 2000);
                  });
                }
              }}
              style={{ background: "#1a1a1a", border: "1px solid #242424", borderRadius: 7, padding: "12px 20px", color: shareCopied ? "#4ade80" : "#777", fontSize: 13, cursor: "pointer", transition: "color 0.2s" }}>
              {shareCopied ? "Copied!" : "Share"}
            </button>
          </div>
        </div>

        {continueWatching.length > 0 && (
          <div style={{ marginBottom: 48 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#e5e5e5" }}>Continue Watching</h2>
            </div>
            <div style={{ display: "flex", gap: 14, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 8 }}>
              {continueWatching.map(item => (
                <ContinueWatchingCard key={`${item._type}_${item.id}`} item={item} onPlay={onSelect} onRemove={handleRemoveCW} />
              ))}
            </div>
          </div>
        )}

        {related.length > 0 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 20px", color: "#e5e5e5" }}>More Like This</h2>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 130 : 160}px, 1fr))`, gap: isMobile ? 10 : 16 }}>
              {related.map(v => (
                <div key={v.id + v._type} onClick={() => v._type === "show" ? onShowSelect?.(v) : onSelect(v)} style={{ cursor: "pointer", borderRadius: 10, overflow: "hidden", background: "#141414", border: "1px solid #1a1a1a", transition: "transform 0.2s, box-shadow 0.2s" }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.03)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.6)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}>
                  <div style={{ aspectRatio: "2/3", overflow: "hidden" }}>
                    <img src={v.poster || v.thumbnail} alt={v.title} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.7)" }} />
                  </div>
                  <div style={{ padding: "12px 14px" }}>
                    <p style={{ margin: "0 0 4px", fontSize: 13.5, fontWeight: 600, color: "#e5e5e5" }}>{v.title}</p>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      {v.score && <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>{v.score}%</span>}
                      {v.year && <span style={{ fontSize: 11, color: "#555" }}>{v.year}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Similarity scoring ───────────────────────────────────────────────────────

function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(t => t.toLowerCase().trim()).filter(Boolean);
  return String(tags).split(",").map(t => t.toLowerCase().trim()).filter(Boolean);
}

function computeSimilarity(source, candidate) {
  let pts = 0;

  if (source.category && candidate.category && source.category === candidate.category) pts += 40;

  const srcTags = normalizeTags(source.tags);
  const candTags = normalizeTags(candidate.tags);
  if (srcTags.length && candTags.length) {
    const shared = srcTags.filter(t => candTags.includes(t)).length;
    pts += shared * 15;
  }

  if (source.year && candidate.year) {
    const diff = Math.abs(Number(source.year) - Number(candidate.year));
    if (diff <= 5) pts += 10;
    else if (diff <= 15) pts += 6;
    else if (diff <= 30) pts += 2;
  }

  if (source.rating && candidate.rating && source.rating === candidate.rating) pts += 8;

  if (source.score && candidate.score) {
    const diff = Math.abs(Number(source.score) - Number(candidate.score));
    if (diff <= 5) pts += 5;
    else if (diff <= 15) pts += 3;
  }

  return pts;
}

function rankRelated(source, pool, limit = 12) {
  return pool
    .map(item => ({ item, pts: computeSimilarity(source, item) }))
    .filter(({ pts }) => pts > 0)
    .sort((a, b) => b.pts - a.pts)
    .slice(0, limit)
    .map(({ item }) => item);
}

// ─── Show Detail ──────────────────────────────────────────────────────────────

function ShowDetail({ show, onBack, onGoHome, onPlay, onShowSelect, user, myList, onToggleList, onAuthOpen, onProfileOpen, userAvatarId, activeProfile }) {
  const [episodes, setEpisodes] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState([]);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [watchProgress, setWatchProgress] = useState({});
  const [activeTab, setActiveTab] = useState("episodes");
  const isMobile = useIsMobile();

  useEffect(() => {
    setEpisodes([]);
    setSelectedSeason(null);
    setLoading(true);
    setWatchProgress({});
    setActiveTab("episodes");

    supabase.from("episodes").select("*").eq("show_id", show.id)
      .order("season", { ascending: true })
      .order("episode_number", { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setEpisodes(data);
          setSelectedSeason(data[0].season);
        }
        setLoading(false);
      });

    Promise.all([
      supabase.from("shows").select("id,title,category,tags,year,score,rating,thumbnail,poster").neq("id", show.id),
      supabase.from("videos").select("id,title,category,tags,year,score,rating,thumbnail,poster,duration"),
    ]).then(([sRes, vRes]) => {
      const pool = [
        ...(sRes.data || []).map(s => ({ ...s, _type: "show" })),
        ...(vRes.data || []).map(v => ({ ...v, _type: "movie" })),
      ];
      setRelated(rankRelated(show, pool));
    });
  }, [show.id]);

  useEffect(() => {
    if (!user || !activeProfile || !episodes.length) { setWatchProgress({}); return; }
    supabase.from("watch_progress").select("*")
      .eq("user_id", user.id).eq("profile_id", activeProfile.id).eq("content_type", "episode")
      .in("content_id", episodes.map(e => e.id))
      .then(({ data }) => {
        if (data) {
          const map = {};
          data.forEach(p => { map[p.content_id] = p; });
          setWatchProgress(map);
        }
      });
  }, [episodes, user, activeProfile?.id]);

  const seasons = [...new Set(episodes.map(e => e.season))].sort((a, b) => a - b);
  const seasonEpisodes = episodes.filter(e => e.season === selectedSeason);
  const completedCount = episodes.filter(e => watchProgress[e.id]?.completed).length;

  const resumeEpisode = (() => {
    if (!episodes.length) return null;
    if (user) {
      const incomplete = episodes
        .filter(e => watchProgress[e.id] && !watchProgress[e.id].completed && watchProgress[e.id].progress_seconds > 10)
        .sort((a, b) => new Date(watchProgress[b.id].last_watched_at) - new Date(watchProgress[a.id].last_watched_at));
      if (incomplete[0]) return incomplete[0];
    }
    return episodes[0];
  })();
  const isResuming = resumeEpisode && watchProgress[resumeEpisode.id]?.progress_seconds > 10 && !watchProgress[resumeEpisode.id]?.completed;

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>
      {trailerOpen && <TrailerModal url={show.trailer_url} title={show.title} onClose={() => setTrailerOpen(false)} />}

      {/* ── Hero ── */}
      <div style={{ position: "relative", height: isMobile ? "65vh" : "72vh", minHeight: 480, overflow: "hidden" }}>
        <img src={show.thumbnail || show.poster} alt={show.title}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", filter: "brightness(0.28) saturate(1.15)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.1) 58%, transparent 78%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(10,10,10,0.97) 0%, rgba(10,10,10,0.5) 55%, transparent 85%)" }} />

        {/* Top nav row */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `20px ${PAD}`, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <button onClick={onBack} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#ccc", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              Back
            </button>
            <span onClick={onGoHome} style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, cursor: "pointer" }}><span style={{ color: "#facc15" }}>peep.</span></span>
          </div>
          {(() => {
            const av = avatarForId(userAvatarId || activeProfile?.avatar_id);
            return user ? (
              <div onClick={onProfileOpen} title={activeProfile?.name ?? "Profile"} style={{ width: 34, height: 34, borderRadius: "50%", background: av?.gradient ?? "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: av ? 15 : 13, fontWeight: 700, cursor: "pointer", color: "#fff", flexShrink: 0, border: "2px solid transparent", transition: "border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#facc15"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}>
                {av ? av.emoji : (activeProfile?.name?.[0] || user.email[0]).toUpperCase()}
              </div>
            ) : null;
          })()}
        </div>

        {/* Hero content */}
        <div style={{ position: "absolute", bottom: isMobile ? "6%" : "9%", left: PAD, right: PAD, maxWidth: isMobile ? "100%" : "clamp(440px, 44vw, 700px)" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
            <span style={{ background: "#3b82f6", color: "#fff", fontSize: 10, fontWeight: 700, padding: "4px 12px", borderRadius: 4, letterSpacing: 1.5, textTransform: "uppercase" }}>Series</span>
            {show.category && <span style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", fontSize: 10, fontWeight: 600, padding: "4px 12px", borderRadius: 4, letterSpacing: 1, textTransform: "uppercase" }}>{show.category}</span>}
          </div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(34px, 4.5vw, 72px)", lineHeight: 1.0, margin: "0 0 16px", fontWeight: 400 }}>{show.title}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            {show.score && <span style={{ color: "#4ade80", fontSize: 14, fontWeight: 700 }}>{show.score}% Match</span>}
            {show.year && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{show.year}</span>}
            {show.rating && <span style={{ border: "1px solid rgba(255,255,255,0.28)", color: "rgba(255,255,255,0.5)", fontSize: 11, padding: "2px 7px", borderRadius: 3 }}>{show.rating}</span>}
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>{seasons.length} Season{seasons.length !== 1 ? "s" : ""}</span>
            <span style={{ color: "#333", fontSize: 13 }}>·</span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>{episodes.length} Episode{episodes.length !== 1 ? "s" : ""}</span>
            {completedCount > 0 && episodes.length > 0 && (
              <span style={{ color: "#4ade80", fontSize: 12, fontWeight: 600 }}>{completedCount}/{episodes.length} watched</span>
            )}
          </div>
          {show.description && (
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", lineHeight: 1.75, margin: "0 0 28px", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{show.description}</p>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {resumeEpisode && (
              <button onClick={() => onPlay(resumeEpisode)}
                style={{ background: "#fff", color: "#0a0a0a", border: "none", borderRadius: 7, padding: "13px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                onMouseEnter={e => e.currentTarget.style.background = "#e5e5e5"}
                onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                {isResuming ? `Resume S${resumeEpisode.season} E${resumeEpisode.episode_number}` : `Play S${resumeEpisode.season} E${resumeEpisode.episode_number}`}
              </button>
            )}
            {show.trailer_url && (
              <button onClick={() => setTrailerOpen(true)}
                style={{ background: "rgba(109,109,110,0.65)", backdropFilter: "blur(4px)", color: "#fff", border: "none", borderRadius: 7, padding: "13px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(109,109,110,0.85)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(109,109,110,0.65)"}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" /></svg>
                Trailer
              </button>
            )}
            {(() => {
              const inList = myList?.[`show_${show.id}`];
              return (
                <button onClick={() => onToggleList?.(show.id, "show")}
                  style={{ background: inList ? "rgba(250,204,21,0.15)" : "rgba(109,109,110,0.65)", backdropFilter: "blur(4px)", color: inList ? "#facc15" : "#fff", border: inList ? "1px solid rgba(250,204,21,0.5)" : "none", borderRadius: 7, padding: "13px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                  {inList ? "✓ My List" : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      My List
                    </>
                  )}
                </button>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(10,10,10,0.97)", backdropFilter: "blur(14px)", borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ display: "flex", padding: `0 ${PAD}` }}>
          {[
            { key: "episodes", label: "Episodes", badge: episodes.length || null },
            { key: "more", label: "More Like This", badge: null },
          ].map(({ key, label, badge }) => {
            const active = activeTab === key;
            return (
              <button key={key} onClick={() => setActiveTab(key)}
                style={{ background: "none", border: "none", padding: "18px 20px 16px", fontSize: 14, fontWeight: active ? 600 : 400, color: active ? "#fff" : "#555", cursor: "pointer", borderBottom: `2px solid ${active ? "#facc15" : "transparent"}`, transition: "color 0.15s, border-color 0.15s", display: "flex", alignItems: "center", gap: 8 }}>
                {label}
                {badge != null && <span style={{ fontSize: 11, fontWeight: 700, color: active ? "#facc15" : "#333" }}>{badge}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: `32px ${PAD} 80px`, maxWidth: 1100, margin: "0 auto" }}>

        {activeTab === "episodes" && (
          <>
            {/* Season selector */}
            {seasons.length > 1 && (
              <div style={{ marginBottom: 28 }}>
                {seasons.length <= 6 ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {seasons.map(s => {
                      const sEps = episodes.filter(e => e.season === s);
                      const sWatched = sEps.filter(e => watchProgress[e.id]?.completed).length;
                      const active = selectedSeason === s;
                      return (
                        <button key={s} onClick={() => setSelectedSeason(s)}
                          style={{ background: active ? "#facc15" : "#111", border: `1px solid ${active ? "#facc15" : "#242424"}`, borderRadius: 8, padding: "10px 20px", color: active ? "#0a0a0a" : "#888", fontSize: 13, fontWeight: active ? 700 : 400, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, transition: "all 0.15s" }}>
                          <span>Season {s}</span>
                          {sWatched > 0 && <span style={{ fontSize: 10, color: active ? "rgba(10,10,10,0.55)" : "#4ade80", fontWeight: 600 }}>{sWatched}/{sEps.length}</span>}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <select value={selectedSeason ?? ""} onChange={e => setSelectedSeason(Number(e.target.value))}
                    style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 16px", color: "#fff", fontSize: 14, cursor: "pointer", outline: "none" }}>
                    {seasons.map(s => <option key={s} value={s}>Season {s}</option>)}
                  </select>
                )}
              </div>
            )}

            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner /></div>
            ) : seasonEpisodes.length === 0 ? (
              <p style={{ color: "#555", fontSize: 15, padding: "40px 0" }}>No episodes added yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {seasonEpisodes.map(ep => (
                  <EpisodeCard key={ep.id} episode={ep} show={show} onPlay={onPlay} progress={watchProgress[ep.id]} />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "more" && (
          related.length === 0 ? (
            <p style={{ color: "#555", fontSize: 15, padding: "40px 0" }}>No similar titles found.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 130 : 160}px, 1fr))`, gap: isMobile ? 10 : 16 }}>
              {related.map(item => (
                <CatalogCard key={item.id + item._type} item={item}
                  onClick={() => item._type === "show" ? onShowSelect?.(item) : onPlay(item)}
                  myList={myList} onToggleList={onToggleList} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function EpisodeCard({ episode, show, onPlay, progress }) {
  const [hovered, setHovered] = useState(false);
  const isMobile = useIsMobile();
  const pct = progress?.duration_seconds > 0 ? Math.min(100, (progress.progress_seconds / progress.duration_seconds) * 100) : 0;
  const isCompleted = !!progress?.completed;

  return (
    <div onClick={() => onPlay(episode)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", gap: isMobile ? 12 : 24, padding: isMobile ? "14px 0" : "20px 0", borderBottom: "1px solid #141414", cursor: "pointer", alignItems: "flex-start", opacity: isCompleted ? 0.6 : 1, transition: "opacity 0.2s" }}>

      {/* Episode number / check */}
      <div style={{ flexShrink: 0, width: 28, paddingTop: isMobile ? 4 : 8, textAlign: "center" }}>
        {isCompleted
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
          : <span style={{ fontSize: 16, color: "#333", fontWeight: 700 }}>{episode.episode_number}</span>
        }
      </div>

      {/* Thumbnail */}
      <div style={{ width: isMobile ? 108 : 192, aspectRatio: "16/9", flexShrink: 0, borderRadius: 8, overflow: "hidden", background: "#1a1a1a", position: "relative" }}>
        <img src={episode.thumbnail || show.thumbnail} alt={episode.title}
          style={{ width: "100%", height: "100%", objectFit: "cover", filter: hovered ? "brightness(0.5)" : isCompleted ? "brightness(0.42)" : "brightness(0.82)", transition: "filter 0.2s" }}
          onError={e => { e.target.style.display = "none"; }} />
        {hovered && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#0a0a0a"><polygon points="5,3 19,12 5,21" /></svg>
            </div>
          </div>
        )}
        {pct > 0 && !isCompleted && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "rgba(0,0,0,0.5)" }}>
            <div style={{ height: "100%", background: "#facc15", width: `${pct}%` }} />
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
          <p style={{ margin: 0, fontSize: isMobile ? 13 : 15, fontWeight: 600, color: isCompleted ? "#555" : "#e5e5e5", lineHeight: 1.3 }}>{episode.title}</p>
          {episode.duration && <span style={{ fontSize: 12, color: "#444", flexShrink: 0 }}>{episode.duration}</span>}
        </div>
        {!isMobile && episode.description && (
          <p style={{ margin: 0, fontSize: 13, color: "#555", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{episode.description}</p>
        )}
        {pct > 0 && !isCompleted && (
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#facc15", fontWeight: 600 }}>{Math.round(pct)}% watched</p>
        )}
      </div>
    </div>
  );
}

// ─── Podcast Detail ───────────────────────────────────────────────────────────

function PodcastDetail({ podcast, onBack, onGoHome, onPlay, onProfileOpen, userAvatarId, user, activeProfile }) {
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [watchProgress, setWatchProgress] = useState({});
  const isMobile = useIsMobile();

  useEffect(() => {
    setEpisodes([]);
    setLoading(true);
    supabase.from("podcast_episodes").select("*")
      .eq("podcast_id", podcast.id)
      .order("episode_number", { ascending: true })
      .then(({ data }) => { setEpisodes(data || []); setLoading(false); });
  }, [podcast.id]);

  useEffect(() => {
    if (!user || !activeProfile || !episodes.length) { setWatchProgress({}); return; }
    supabase.from("watch_progress").select("*")
      .eq("user_id", user.id).eq("profile_id", activeProfile.id).eq("content_type", "podcast_episode")
      .in("content_id", episodes.map(e => e.id))
      .then(({ data }) => {
        if (data) { const m = {}; data.forEach(p => { m[p.content_id] = p; }); setWatchProgress(m); }
      });
  }, [episodes, user, activeProfile?.id]);

  const resumeEp = (() => {
    if (!episodes.length) return null;
    if (user) {
      const incomplete = episodes
        .filter(e => watchProgress[e.id] && !watchProgress[e.id].completed && watchProgress[e.id].progress_seconds > 5)
        .sort((a, b) => new Date(watchProgress[b.id].last_watched_at) - new Date(watchProgress[a.id].last_watched_at));
      if (incomplete[0]) return incomplete[0];
    }
    return episodes[0];
  })();
  const isResuming = resumeEp && watchProgress[resumeEp.id]?.progress_seconds > 5 && !watchProgress[resumeEp.id]?.completed;

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>

      {/* ── Hero ── */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        {/* Blurred background */}
        {podcast.artwork_url && (
          <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${podcast.artwork_url})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(40px) brightness(0.25) saturate(1.4)", transform: "scale(1.1)" }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(10,10,10,0.4) 0%, #0a0a0a 100%)" }} />

        {/* Nav */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", padding: `20px ${PAD}`, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <button onClick={onBack} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#ccc", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              Back
            </button>
            <span onClick={onGoHome} style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, cursor: "pointer" }}><span style={{ color: "#facc15" }}>peep.</span></span>
          </div>
          {(() => {
            const av = avatarForId(userAvatarId || activeProfile?.avatar_id);
            return user ? (
              <div onClick={onProfileOpen} title={activeProfile?.name ?? "Profile"} style={{ width: 34, height: 34, borderRadius: "50%", background: av?.gradient ?? "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: av ? 15 : 13, fontWeight: 700, cursor: "pointer", color: "#fff", flexShrink: 0, border: "2px solid transparent", transition: "border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#facc15"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}>
                {av ? av.emoji : (activeProfile?.name?.[0] || user.email[0]).toUpperCase()}
              </div>
            ) : null;
          })()}
        </div>

        {/* Artwork + info */}
        <div style={{ position: "relative", display: "flex", gap: isMobile ? 20 : 40, padding: `20px ${PAD} 48px`, alignItems: "flex-end", flexWrap: isMobile ? "wrap" : "nowrap", zIndex: 10 }}>
          <div style={{ flexShrink: 0, width: isMobile ? 120 : 180, height: isMobile ? 120 : 180, borderRadius: 14, overflow: "hidden", background: "linear-gradient(135deg, #1e1b4b, #312e81)", boxShadow: "0 24px 60px rgba(0,0,0,0.7)" }}>
            {podcast.artwork_url
              ? <img src={podcast.artwork_url} alt={podcast.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.5"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
                </div>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <span style={{ background: "rgba(129,140,248,0.2)", border: "1px solid rgba(129,140,248,0.3)", color: "#818cf8", fontSize: 10, fontWeight: 700, padding: "4px 12px", borderRadius: 4, letterSpacing: 1.5, textTransform: "uppercase" }}>Podcast</span>
            </div>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(28px, 4vw, 56px)", lineHeight: 1.05, margin: "0 0 10px", fontWeight: 400 }}>{podcast.title}</h1>
            {podcast.host && <p style={{ margin: "0 0 12px", fontSize: 15, color: "#818cf8", fontWeight: 500 }}>{podcast.host}</p>}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>{episodes.length} Episode{episodes.length !== 1 ? "s" : ""}</span>
            </div>
            {podcast.description && <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, margin: "0 0 24px", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{podcast.description}</p>}
            {resumeEp && (
              <button onClick={() => onPlay(resumeEp)}
                style={{ background: "#fff", color: "#0a0a0a", border: "none", borderRadius: 7, padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10 }}
                onMouseEnter={e => e.currentTarget.style.background = "#e5e5e5"}
                onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                {isResuming ? `Resume Ep. ${resumeEp.episode_number}` : `Play Ep. ${resumeEp.episode_number}`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Episode list ── */}
      <div style={{ padding: `8px ${PAD} 80px`, maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600, color: "#e5e5e5" }}>Episodes</h2>
        <div style={{ height: 1, background: "#1a1a1a", marginBottom: 4 }} />
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner /></div>
        ) : episodes.length === 0 ? (
          <p style={{ color: "#555", fontSize: 15, padding: "40px 0" }}>No episodes yet.</p>
        ) : episodes.map(ep => (
          <PodcastEpisodeRow key={ep.id} episode={ep} podcast={podcast} onPlay={onPlay} progress={watchProgress[ep.id]} />
        ))}
      </div>
    </div>
  );
}

function PodcastEpisodeRow({ episode, podcast, onPlay, progress }) {
  const [hovered, setHovered] = useState(false);
  const isMobile = useIsMobile();
  const pct = progress?.duration_seconds > 0 ? Math.min(100, (progress.progress_seconds / progress.duration_seconds) * 100) : 0;
  const isCompleted = !!progress?.completed;

  return (
    <div onClick={() => onPlay(episode)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", gap: isMobile ? 14 : 20, padding: "18px 0", borderBottom: "1px solid #141414", cursor: "pointer", alignItems: "center", opacity: isCompleted ? 0.55 : 1, transition: "opacity 0.2s" }}>

      {/* Episode number */}
      <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: "50%", background: hovered ? "rgba(129,140,248,0.25)" : "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.2s" }}>
        {hovered
          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="#818cf8"><polygon points="5,3 19,12 5,21" /></svg>
          : isCompleted
          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
          : <span style={{ fontSize: 12, fontWeight: 700, color: "#818cf8" }}>{episode.episode_number}</span>
        }
      </div>

      {/* Thumbnail (optional) */}
      {!isMobile && episode.thumbnail && (
        <div style={{ flexShrink: 0, width: 72, height: 72, borderRadius: 8, overflow: "hidden", background: "#1a1a1a" }}>
          <img src={episode.thumbnail || podcast.artwork_url} alt={episode.title} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.8)" }} />
        </div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: "0 0 4px", fontSize: isMobile ? 13 : 15, fontWeight: 600, color: isCompleted ? "#555" : "#e5e5e5" }}>{episode.title}</p>
        {episode.description && !isMobile && (
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#555", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{episode.description}</p>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {episode.duration && <span style={{ fontSize: 12, color: "#444" }}>{episode.duration}</span>}
          {pct > 0 && !isCompleted && (
            <>
              <div style={{ flex: 1, maxWidth: 120, height: 3, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "#818cf8" }} />
              </div>
              <span style={{ fontSize: 11, color: "#818cf8", fontWeight: 600 }}>{Math.round(pct)}%</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Podcast Player ────────────────────────────────────────────────────────────

function PodcastPlayerView({ episode, podcast, onBack, onGoHome, onSelect, onProfileOpen, userAvatarId, user, activeProfile }) {
  const audioRef = useRef(null);
  const saveProgressRef = useRef(null);
  const progressTimerRef = useRef(null);
  const [nextEpisode, setNextEpisode] = useState(null);
  const [allEpisodes, setAllEpisodes] = useState([]);
  const isMobile = useIsMobile();

  useEffect(() => {
    supabase.from("podcast_episodes").select("*")
      .eq("podcast_id", podcast.id).order("episode_number", { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        setAllEpisodes(data);
        const idx = data.findIndex(e => e.id === episode.id);
        setNextEpisode(idx >= 0 && idx < data.length - 1 ? data[idx + 1] : null);
      });
  }, [episode.id, podcast.id]);

  useEffect(() => {
    if (!user || !activeProfile) return;
    saveProgressRef.current = async () => {
      if (!audioRef.current) return;
      const { currentTime, duration } = audioRef.current;
      if (currentTime < 5 || !duration) return;
      await supabase.from("watch_progress").upsert({
        user_id: user.id, profile_id: activeProfile.id, content_id: episode.id, content_type: "podcast_episode",
        progress_seconds: currentTime, duration_seconds: duration,
        completed: currentTime / duration > 0.92 || duration - currentTime < 30,
        last_watched_at: new Date().toISOString(),
      }, { onConflict: "user_id,profile_id,content_id,content_type" });
    };
    progressTimerRef.current = setInterval(() => { saveProgressRef.current?.(); }, 15000);
    return () => clearInterval(progressTimerRef.current);
  }, [episode.id, user, activeProfile?.id]);

  useEffect(() => () => { clearInterval(progressTimerRef.current); saveProgressRef.current?.(); }, []);

  function handleLoadedMetadata() {
    if (!user || !activeProfile || !audioRef.current) return;
    supabase.from("watch_progress").select("progress_seconds, duration_seconds, completed")
      .eq("user_id", user.id).eq("profile_id", activeProfile.id)
      .eq("content_id", episode.id).eq("content_type", "podcast_episode").maybeSingle()
      .then(({ data }) => {
        if (!data || data.completed || !audioRef.current) return;
        const pct = data.duration_seconds > 0 ? data.progress_seconds / data.duration_seconds : 0;
        if (data.progress_seconds > 5 && pct < 0.92) audioRef.current.currentTime = data.progress_seconds;
      });
  }

  function handleEnded() {
    saveProgressRef.current?.();
    if (nextEpisode) onSelect(nextEpisode);
  }

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff", display: "flex", flexDirection: "column" }}>

      {/* Blurred background */}
      {podcast.artwork_url && (
        <div style={{ position: "fixed", inset: 0, backgroundImage: `url(${podcast.artwork_url})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(60px) brightness(0.15) saturate(1.5)", transform: "scale(1.1)", zIndex: 0 }} />
      )}
      <div style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.7)", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Nav */}
        <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${PAD}`, height: 68, background: "rgba(10,10,10,0.5)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <button onClick={onBack} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#ccc", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              Back
            </button>
            <span onClick={onGoHome} style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, cursor: "pointer" }}><span style={{ color: "#facc15" }}>peep.</span></span>
          </div>
          {(() => {
            const av = avatarForId(userAvatarId || activeProfile?.avatar_id);
            return user ? (
              <div onClick={onProfileOpen} title={activeProfile?.name ?? "Profile"} style={{ width: 34, height: 34, borderRadius: "50%", background: av?.gradient ?? "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: av ? 15 : 13, fontWeight: 700, cursor: "pointer", color: "#fff", flexShrink: 0, border: "2px solid transparent", transition: "border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#facc15"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}>
                {av ? av.emoji : (activeProfile?.name?.[0] || user.email[0]).toUpperCase()}
              </div>
            ) : null;
          })()}
        </nav>

        {/* Player content */}
        {(() => {
          const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(episode.audio_url || "");
          return (
        <div style={{ flex: 1, display: "flex", alignItems: isVideo ? "flex-start" : "center", justifyContent: "center", padding: isVideo ? 0 : `40px ${PAD}` }}>
          <div style={{ width: "100%", maxWidth: isVideo ? "none" : 520, display: "flex", flexDirection: "column", alignItems: "center", gap: isVideo ? 0 : 32 }}>

            {/* Video player — full width */}
            {isVideo && (
              <video ref={audioRef} src={episode.audio_url} controls autoPlay
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleEnded}
                style={{ width: "100%", maxHeight: "75vh", background: "#000", display: "block" }} />
            )}

            {/* Artwork — audio only */}
            {!isVideo && (
              <div style={{ width: isMobile ? 220 : 280, height: isMobile ? 220 : 280, borderRadius: 20, overflow: "hidden", background: "linear-gradient(135deg, #1e1b4b, #312e81)", boxShadow: "0 40px 100px rgba(0,0,0,0.8)", flexShrink: 0 }}>
                {podcast.artwork_url
                  ? <img src={podcast.artwork_url} alt={podcast.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.2"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
                    </div>
                }
              </div>
            )}

            {/* Episode info */}
            <div style={{ textAlign: "center", width: "100%", padding: isVideo ? `24px ${PAD}` : 0 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#818cf8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{podcast.title} · Ep. {episode.episode_number}</p>
              <h2 style={{ margin: "0 0 6px", fontSize: isMobile ? 20 : 24, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{episode.title}</h2>
              {podcast.host && <p style={{ margin: 0, fontSize: 13, color: "#555" }}>{podcast.host}</p>}
            </div>

            {/* Audio player — audio only */}
            {!isVideo && (
              <audio ref={audioRef} src={episode.audio_url} controls autoPlay
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleEnded}
                style={{ width: "100%", borderRadius: 12, outline: "none", accentColor: "#818cf8" }} />
            )}

            {/* Next episode */}
            {nextEpisode && (
              <button onClick={() => onSelect(nextEpisode)}
                style={{ background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)", borderRadius: 10, padding: "12px 20px", color: "#818cf8", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, width: "100%", justifyContent: "center" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(129,140,248,0.18)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(129,140,248,0.1)"}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5,3 19,12 5,21"/><line x1="19" y1="3" x2="19" y2="21"/></svg>
                Next: Ep. {nextEpisode.episode_number} · {nextEpisode.title}
              </button>
            )}
          </div>
        </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Profile Page ─────────────────────────────────────────────────────────────

function ProfilePage({ user, activeProfile, onBack, onGoHome, onProfileUpdate, onOpenSettings, onAvatarChange, onSignOut }) {
  const [history, setHistory] = useState([]);
  const [contentMap, setContentMap] = useState({});
  const [showsMap, setShowsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(activeProfile?.name || "");
  const [bio, setBio] = useState(activeProfile?.bio || "");
  const [avatarId, setAvatarId] = useState(activeProfile?.avatar_id || null);
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile();
  const memberSince = user?.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : null;
  const av = avatarForId(editing ? avatarId : activeProfile?.avatar_id);

  useEffect(() => { fetchData(); }, [activeProfile?.id]);

  async function fetchData() {
    setLoading(true);
    const [progressRes, videosRes, showsRes, episodesRes, podEpRes, podRes] = await Promise.all([
      supabase.from("watch_progress").select("*").eq("user_id", user.id).eq("profile_id", activeProfile.id).order("last_watched_at", { ascending: false }),
      supabase.from("videos").select("id, title, thumbnail, poster, category, year"),
      supabase.from("shows").select("id, title, thumbnail, poster, category"),
      supabase.from("episodes").select("id, title, thumbnail, show_id, season, episode_number"),
      supabase.from("podcast_episodes").select("id, title, thumbnail, podcast_id, episode_number"),
      supabase.from("podcasts").select("id, title, artwork_url"),
    ]);
    const map = {};
    const sMap = {};
    const pMap = {};
    (videosRes.data || []).forEach(v => { map[v.id] = { ...v, _type: "movie" }; });
    (showsRes.data || []).forEach(s => { map[s.id] = { ...s, _type: "show" }; sMap[s.id] = s; });
    (episodesRes.data || []).forEach(e => { map[e.id] = { ...e, _type: "episode" }; });
    (podRes.data || []).forEach(p => { pMap[p.id] = p; });
    (podEpRes.data || []).forEach(e => { map[e.id] = { ...e, _type: "podcast_episode", thumbnail_url: e.thumbnail, title: e.title, category: pMap[e.podcast_id]?.title }; });
    setContentMap(map);
    setShowsMap(sMap);
    setHistory(progressRes.data || []);
    setLoading(false);
  }

  async function saveProfile() {
    setSaving(true);
    await Promise.all([
      supabase.from("viewer_profiles").update({ name: name.trim(), bio: bio.trim(), avatar_id: avatarId }).eq("id", activeProfile.id),
      supabase.from("profiles").upsert({ id: user.id, avatar_id: avatarId }, { onConflict: "id" }),
    ]);
    setSaving(false);
    setEditing(false);
    onAvatarChange?.(avatarId);
    onProfileUpdate?.({ ...activeProfile, name: name.trim(), bio: bio.trim(), avatar_id: avatarId });
  }

  const enriched = history.map(h => ({ ...h, content: contentMap[h.content_id] || null })).filter(h => h.content);

  const totalSeconds = history.reduce((acc, h) => acc + (h.progress_seconds || 0), 0);
  const totalHours = Math.floor(totalSeconds / 3600);
  const totalMinutes = Math.floor((totalSeconds % 3600) / 60);

  const genreCounts = {};
  enriched.forEach(h => { const g = h.content?.category; if (g) genreCounts[g] = (genreCounts[g] || 0) + 1; });
  const favoriteGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const showCounts = {};
  enriched.forEach(h => { if (h.content?._type === "episode" && h.content.show_id) showCounts[h.content.show_id] = (showCounts[h.content.show_id] || 0) + 1; });
  const topShowId = Object.entries(showCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topShow = topShowId ? showsMap[topShowId] : null;

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>

      {/* Nav */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, display: "flex", alignItems: "center", padding: `0 ${PAD}`, height: 68, gap: 24, background: "rgba(10,10,10,0.92)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#ccc", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
        <span onClick={onGoHome} style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, cursor: "pointer" }}><span style={{ color: "#facc15" }}>peep.</span></span>
      </nav>

      {/* Profile header */}
      <div style={{ paddingTop: 68 + 40, paddingLeft: PAD, paddingRight: PAD, paddingBottom: 0, maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 28, flexWrap: "wrap" }}>
          <div style={{ width: isMobile ? 80 : 96, height: isMobile ? 80 : 96, borderRadius: "50%", background: av?.svg ? "none" : (av?.gradient ?? "linear-gradient(135deg,#6366f1,#8b5cf6)"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 30 : 38, border: "3px solid #222", flexShrink: 0, overflow: "hidden" }}>
            {av?.svg ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: av.svg }} /> : (av?.emoji ?? (activeProfile?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase())}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: "0 0 4px", fontSize: isMobile ? 20 : 26, fontWeight: 700, color: "#fff" }}>{editing ? (name || activeProfile?.name) : activeProfile?.name}</h1>
            {!editing && activeProfile?.bio && <p style={{ margin: "0 0 6px", fontSize: 13, color: "#666", lineHeight: 1.6 }}>{activeProfile.bio}</p>}
            <p style={{ margin: 0, fontSize: 12, color: "#333" }}>{memberSince ? `Member since ${memberSince}` : user?.email}</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            {onOpenSettings && !editing && (
              <button onClick={onOpenSettings} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid #2a2a2a", borderRadius: 8, padding: "8px 14px", color: "#aaa", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Settings
              </button>
            )}
            <button onClick={() => { setEditing(e => !e); setName(activeProfile?.name || ""); setBio(activeProfile?.bio || ""); setAvatarId(activeProfile?.avatar_id || null); }}
              style={{ background: editing ? "rgba(250,204,21,0.12)" : "rgba(255,255,255,0.06)", border: `1px solid ${editing ? "rgba(250,204,21,0.3)" : "#2a2a2a"}`, borderRadius: 8, padding: "8px 18px", color: editing ? "#facc15" : "#aaa", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {editing ? "Cancel" : "Edit Profile"}
            </button>
            {onSignOut && !editing && (
              <button onClick={onSignOut} style={{ background: "transparent", border: "1px solid #2a2a2a", borderRadius: 8, padding: "8px 14px", color: "#f87171", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(248,113,113,0.08)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                Sign Out
              </button>
            )}
          </div>
        </div>

        {/* Edit form */}
        {editing && (
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: 24, marginBottom: 32 }}>
            <p style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 600, color: "#e5e5e5" }}>Choose an avatar</p>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 4 : 6}, 1fr)`, gap: 8, marginBottom: 24 }}>
              {PRESET_AVATARS.map(a => (
                <AvatarThumb key={a.id} av={a} size={isMobile ? 56 : 64} selected={avatarId === a.id} onClick={() => setAvatarId(a.id)} />
              ))}
            </div>
            <div style={{ height: 1, background: "#1a1a1a", marginBottom: 20 }} />
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Display Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Your name" style={{ width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 11, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Bio</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={200} placeholder="Write something about yourself..." style={{ width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#333", textAlign: "right" }}>{bio.length}/200</p>
            </div>
            <button onClick={saveProfile} disabled={saving} style={{ background: "#facc15", border: "none", borderRadius: 8, padding: "10px 28px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ padding: `8px ${PAD} 32px`, maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`, gap: 12 }}>
          {[
            { label: "Hours Watched", value: totalHours > 0 ? `${totalHours}h ${totalMinutes}m` : totalMinutes > 0 ? `${totalMinutes}m` : "0m" },
            { label: "Titles Watched", value: enriched.length > 0 ? enriched.length.toString() : "0" },
            { label: "Favorite Genre", value: favoriteGenre || "—" },
            { label: "Most Watched", value: topShow?.title || "—" },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, padding: "18px 20px" }}>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: "#444", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</p>
              <p style={{ margin: 0, fontSize: isMobile ? 16 : 20, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Watch History */}
      <div style={{ padding: `0 ${PAD} 80px`, maxWidth: 860, margin: "0 auto" }}>
        <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 600, color: "#e5e5e5" }}>Watch History</h2>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner /></div>
        ) : enriched.length === 0 ? (
          <p style={{ color: "#444", fontSize: 14 }}>Nothing watched yet.</p>
        ) : enriched.map(h => {
          const c = h.content;
          const pct = h.duration_seconds > 0 ? Math.min(100, Math.round((h.progress_seconds / h.duration_seconds) * 100)) : 0;
          const thumb = c.poster || c.thumbnail;
          const subtitle = c._type === "episode"
            ? `S${c.season} E${c.episode_number}`
            : c._type === "podcast_episode"
            ? `Podcast · ${c.category || ""}`
            : c._type === "movie" ? `${c.year || ""} · ${c.category || ""}` : "";
          return (
            <div key={h.id} style={{ display: "flex", gap: isMobile ? 12 : 16, padding: "14px 0", borderBottom: "1px solid #111", alignItems: "center" }}>
              <div style={{ flexShrink: 0, width: isMobile ? 80 : 112, aspectRatio: "16/9", borderRadius: 7, overflow: "hidden", background: "#1a1a1a" }}>
                {thumb
                  ? <img src={thumb} alt={c.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ width: "100%", height: "100%", background: "#1a1a1a" }} />
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: "0 0 3px", fontSize: isMobile ? 13 : 15, fontWeight: 600, color: h.completed ? "#555" : "#e5e5e5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</p>
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "#444" }}>{subtitle}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {h.completed ? (
                    <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 600 }}>✓ Watched</span>
                  ) : pct > 0 ? (
                    <>
                      <div style={{ width: 80, height: 3, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "#facc15" }} />
                      </div>
                      <span style={{ fontSize: 11, color: "#555" }}>{pct}%</span>
                    </>
                  ) : null}
                  <span style={{ fontSize: 11, color: "#333", marginLeft: "auto" }}>{timeAgo(h.last_watched_at)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CreatorPortalPage ────────────────────────────────────────────────────────

const SUPABASE_URL_CREATOR = "https://iuozujwtuzuwubhsnhix.supabase.co";

function CreatorPortalPage({ user, onBack, onGoHome }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL_CREATOR}/functions/v1/get-creator-dashboard`, {
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setLoading(false);
    }
    load().catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const creator = data?.creator;
  const payouts = data?.payouts || [];
  const content = data?.contentList || [];
  const stats = data?.currentMonth;
  const monthLabel = stats ? new Date(stats.month + "-02").toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "";
  const paidPayouts = payouts.filter(p => p.status === "paid");
  const totalEarned = paidPayouts.reduce((s, p) => s + (p.payout_amount || 0), 0);

  const card = { marginBottom: 16, background: "#111", border: "1px solid #1e1e1e", borderRadius: 16, overflow: "hidden" };
  const cardHead = { padding: "20px 24px", borderBottom: "1px solid #1a1a1a" };
  const cardBody = { padding: "24px" };

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>

      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, display: "flex", alignItems: "center", padding: `0 ${PAD}`, height: 64, gap: 20, background: "rgba(10,10,10,0.92)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#aaa", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
        <span onClick={onGoHome} style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, cursor: "pointer", color: "#facc15" }}>peep.</span>
        <span style={{ fontSize: 12, color: "#444", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Creator Portal</span>
      </nav>

      <div style={{ paddingTop: 64 + 48, paddingBottom: 100, paddingLeft: PAD, paddingRight: PAD, maxWidth: 780, margin: "0 auto" }}>
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: "3px solid #1a1a1a", borderTopColor: "#facc15", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        )}

        {error && (
          <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 12, padding: "20px 24px", color: "#f87171", fontSize: 14 }}>
            {error}
          </div>
        )}

        {!loading && !error && creator && (
          <>
            {/* Header */}
            <div style={{ marginBottom: 40 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 100, padding: "5px 14px", marginBottom: 16, fontSize: 12, fontWeight: 600, color: "#facc15", letterSpacing: 0.5 }}>
                <span style={{ width: 6, height: 6, background: "#facc15", borderRadius: "50%", boxShadow: "0 0 6px #facc15" }} />
                CREATOR
              </div>
              <h1 style={{ margin: "0 0 6px", fontSize: 32, fontWeight: 700, letterSpacing: "-0.5px" }}>Welcome, {creator.name}</h1>
              <p style={{ margin: 0, fontSize: 14, color: "#444" }}>Revenue share partner · {creator.email}</p>
            </div>

            {/* This month stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
              {[
                { label: "Watch Minutes", value: stats ? stats.watchMins.toLocaleString() : "—", sub: monthLabel },
                { label: "Platform Share", value: stats ? `${stats.share}%` : "—", sub: "of total watch time" },
                { label: "Total Earned", value: `$${totalEarned.toFixed(2)}`, sub: "lifetime paid out" },
              ].map(({ label, value, sub }) => (
                <div key={label} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: "20px 22px" }}>
                  <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</p>
                  <p style={{ margin: "0 0 4px", fontSize: 28, fontWeight: 700, color: "#facc15", letterSpacing: "-0.5px" }}>{value}</p>
                  <p style={{ margin: 0, fontSize: 11, color: "#333" }}>{sub}</p>
                </div>
              ))}
            </div>

            {/* How you earn */}
            <div style={{ ...card }}>
              <div style={cardHead}>
                <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 600 }}>How You Earn</p>
                <p style={{ margin: 0, fontSize: 12, color: "#555" }}>Your revenue share explained</p>
              </div>
              <div style={cardBody}>
                <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 10, padding: "16px 18px", marginBottom: 16, fontFamily: "monospace", fontSize: 13, color: "#e5e5e5", lineHeight: 1.8 }}>
                  Creator Pool = Total Revenue × 50%<br />
                  Your Payout = Creator Pool × (Your Watch Mins ÷ All Watch Mins)
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    ["Payment Schedule", "15th of every month for the prior month's data"],
                    ["Watch Threshold", "Viewer must watch at least 25% of an episode to count"],
                    ["Minimum Payout", "$10 minimum before payment is issued"],
                    ["Payment Method", creator.payment_method + (creator.payment_handle ? ` · ${creator.payment_handle}` : "")],
                  ].map(([k, v]) => (
                    <div key={k} style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 10, padding: "14px 16px" }}>
                      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: 0.5 }}>{k}</p>
                      <p style={{ margin: 0, fontSize: 13, color: "#e5e5e5" }}>{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Your content */}
            <div style={card}>
              <div style={cardHead}>
                <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 600 }}>Your Content</p>
                <p style={{ margin: 0, fontSize: 12, color: "#555" }}>Watch time from these titles counts toward your share</p>
              </div>
              <div style={cardBody}>
                {content.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 14, color: "#444" }}>No content linked yet. Contact us to get your shows or films attributed.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {content.map(c => (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 10, padding: "12px 16px" }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: "#e5e5e5" }}>{c.title}</span>
                        <span style={{ fontSize: 11, color: "#444", textTransform: "capitalize", background: "#1a1a1a", borderRadius: 6, padding: "3px 8px" }}>{c.content_type.replace("_", " ")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Payout history */}
            <div style={card}>
              <div style={cardHead}>
                <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 600 }}>Payout History</p>
                <p style={{ margin: 0, fontSize: 12, color: "#555" }}>{paidPayouts.length} payment{paidPayouts.length !== 1 ? "s" : ""} issued</p>
              </div>
              <div style={cardBody}>
                {payouts.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 14, color: "#444" }}>No payouts yet. Your first payment will be issued on the 15th of next month.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {payouts.map(p => {
                      const monthStr = new Date(p.month + "-02").toLocaleDateString("en-US", { month: "long", year: "numeric" });
                      return (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 10, padding: "14px 16px", flexWrap: "wrap", gap: 8 }}>
                          <div>
                            <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: "#e5e5e5" }}>{monthStr}</p>
                            {p.paid_at && <p style={{ margin: 0, fontSize: 11, color: "#444" }}>Paid {new Date(p.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ fontSize: 20, fontWeight: 700, color: p.status === "paid" ? "#facc15" : "#555" }}>${(p.payout_amount || 0).toFixed(2)}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: p.status === "paid" ? "rgba(74,222,128,0.1)" : "rgba(100,100,100,0.1)", color: p.status === "paid" ? "#4ade80" : "#666", border: `1px solid ${p.status === "paid" ? "rgba(74,222,128,0.2)" : "#2a2a2a"}` }}>
                              {p.status === "paid" ? "PAID" : "PENDING"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <p style={{ textAlign: "center", fontSize: 12, color: "#2a2a2a", marginTop: 32 }}>
              Questions? Reach out at <span style={{ color: "#444" }}>creators@watchpeep.tv</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── SettingsPage ─────────────────────────────────────────────────────────────

const PREF_AUTOPLAY_NEXT     = "peep_pref_autoplay_next";
const PREF_AUTOPLAY_PREVIEWS = "peep_pref_autoplay_previews";
const PREF_AUTOPLAY_HERO     = "peep_pref_autoplay_hero";

function getPref(key) {
  const v = localStorage.getItem(key);
  return v === null ? true : v === "true";
}

function setPref(key, val) {
  localStorage.setItem(key, String(val));
}

function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{ width: 46, height: 26, borderRadius: 13, background: value ? "#facc15" : "#2a2a2a", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 3, left: value ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: value ? "#0a0a0a" : "#555", transition: "left 0.2s, background 0.2s" }} />
    </div>
  );
}

function SettingRow({ label, description, value, onChange, noBorder = false }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, padding: "14px 18px", borderBottom: noBorder ? "none" : "1px solid #1a1a1a" }}>
      <div>
        <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: "#e0e0e0" }}>{label}</p>
        {description && <p style={{ margin: 0, fontSize: 12, color: "#444" }}>{description}</p>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}


function AvatarThumb({ av, size = 48, selected = false, onClick }) {
  const isSvg = !!av.svg;
  return (
    <button onClick={onClick} style={{ background: "none", border: `2px solid ${selected ? "#facc15" : "rgba(255,255,255,0.06)"}`, borderRadius: 12, padding: 3, cursor: "pointer", outline: "none", transition: "border-color 0.15s, transform 0.15s", transform: selected ? "scale(1.06)" : "scale(1)" }}>
      <div style={{ width: size, height: size, borderRadius: 8, background: av.gradient || "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.44), overflow: "hidden" }}>
        {isSvg ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: av.svg }} /> : av.emoji}
      </div>
    </button>
  );
}

function AvatarDisplay({ av, size = 64, initials }) {
  if (!av) return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, fontWeight: 700, border: "3px solid #facc15", flexShrink: 0 }}>{initials}</div>
  );
  const isSvg = !!av.svg;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: av.gradient || "#1a1a1a", border: "3px solid #facc15", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.44 }}>
      {isSvg ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: av.svg }} /> : av.emoji}
    </div>
  );
}

const SUPABASE_URL_SETTINGS = "https://iuozujwtuzuwubhsnhix.supabase.co";

function DeleteAccountSection({ user, onSignOut, inline }) {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL_SETTINGS}/functions/v1/delete-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await supabase.auth.signOut();
      window.location.href = "/";
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  if (inline) {
    return (
      <div style={{ flex: 1, position: "relative" }}>
        {!confirm ? (
          <button onClick={() => setConfirm(true)}
            style={{ width: "100%", background: "transparent", border: "1px solid #2a2a2a", borderRadius: 12, padding: "14px", color: "#555", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#7f1d1d"; e.currentTarget.style.color = "#f87171"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#555"; }}>
            Delete Account
          </button>
        ) : (
          <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 12, padding: "20px" }}>
            <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600, color: "#f87171" }}>Delete your account?</p>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: "#555" }}>This permanently deletes your account, all profiles, and watch history. This cannot be undone.</p>
            {error && <p style={{ margin: "0 0 12px", fontSize: 12, color: "#f87171" }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirm(false)} disabled={deleting}
                style={{ flex: 1, background: "transparent", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px", color: "#666", fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ flex: 1, background: "#7f1d1d", border: "none", borderRadius: 8, padding: "10px", color: "#fca5a5", fontSize: 13, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.7 : 1 }}>
                {deleting ? "Deleting…" : "Yes, Delete Everything"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid #1a1a1a" }}>
      {!confirm ? (
        <button onClick={() => setConfirm(true)}
          style={{ background: "transparent", border: "none", color: "#444", fontSize: 13, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
          Delete Account
        </button>
      ) : (
        <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: 12, padding: "20px" }}>
          <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600, color: "#f87171" }}>Delete your account?</p>
          <p style={{ margin: "0 0 16px", fontSize: 12, color: "#555" }}>This permanently deletes your account, all profiles, and watch history. This cannot be undone.</p>
          {error && <p style={{ margin: "0 0 12px", fontSize: 12, color: "#f87171" }}>{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setConfirm(false)} disabled={deleting}
              style={{ flex: 1, background: "transparent", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px", color: "#666", fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={handleDelete} disabled={deleting}
              style={{ flex: 1, background: "#7f1d1d", border: "none", borderRadius: 8, padding: "10px", color: "#fca5a5", fontSize: 13, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.7 : 1 }}>
              {deleting ? "Deleting…" : "Yes, Delete Everything"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsPage({ user, activeProfile, isOwner, onBack, onGoHome, onProfileUpdate, onAvatarChange, onSignOut }) {
  const [autoplayNext, setAutoplayNext] = useState(() => getPref(PREF_AUTOPLAY_NEXT));
  const [autoplayPreviews, setAutoplayPreviews] = useState(() => getPref(PREF_AUTOPLAY_PREVIEWS));
  const [subscription, setSubscription] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelFlow, setCancelFlow] = useState(null); // null | "confirm" | "success"
  const [cancelMode, setCancelMode] = useState("end_of_period");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelResult, setCancelResult] = useState(null);
  const [autoplayHero, setAutoplayHero] = useState(() => getPref(PREF_AUTOPLAY_HERO));
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState(null);

  const memberSince = user?.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : null;

  useEffect(() => {
    supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => setSubscription(data));
  }, [user.id]);

  async function openBillingPortal() {
    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL_SETTINGS}/functions/v1/create-portal-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ return_url: window.location.href }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      window.location.href = data.url;
    } catch (err) {
      alert(err.message);
    }
    setPortalLoading(false);
  }

  async function handleCancelSubscription() {
    setCancelLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL_SETTINGS}/functions/v1/cancel-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ mode: cancelMode }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCancelResult(data);
      setCancelFlow("success");
      setSubscription(prev => ({ ...prev, status: cancelMode === "immediate" ? "canceled" : "canceling" }));
    } catch (err) {
      alert(err.message);
    }
    setCancelLoading(false);
  }

  function toggleAutoplayNext(val) { setAutoplayNext(val); setPref(PREF_AUTOPLAY_NEXT, val); }
  function toggleAutoplayPreviews(val) { setAutoplayPreviews(val); setPref(PREF_AUTOPLAY_PREVIEWS, val); }
  function toggleAutoplayHero(val) { setAutoplayHero(val); setPref(PREF_AUTOPLAY_HERO, val); }


  async function changeEmail() {
    if (!newEmail.trim() || newEmail === user.email) return;
    setEmailSaving(true); setEmailMsg(null);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailSaving(false);
    if (error) setEmailMsg({ type: "error", text: error.message });
    else { setEmailMsg({ type: "ok", text: `Confirmation sent to ${newEmail.trim()} — click the link in that email to complete the change.` }); setNewEmail(""); }
  }

  async function changePassword() {
    if (!newPassword || newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: newPassword !== confirmPassword ? "Passwords don't match" : "Enter a new password" });
      return;
    }
    if (newPassword.length < 6) { setPasswordMsg({ type: "error", text: "Password must be at least 6 characters" }); return; }
    setPasswordSaving(true); setPasswordMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) setPasswordMsg({ type: "error", text: error.message });
    else { setPasswordMsg({ type: "ok", text: "Password updated successfully" }); setNewPassword(""); setConfirmPassword(""); }
  }

  const [expandedSection, setExpandedSection] = useState(null);
  const inp = { width: "100%", background: "#181818", border: "1px solid #222", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const card = { marginBottom: 24, background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, overflow: "hidden" };
  const planLabel = subscription?.plan === "comp" ? "Complimentary" : subscription?.plan_id === "price_1TafqJRgQH3TYy3QOCovduJf" ? "Founding Member — $2.99/mo" : subscription?.plan_id === "price_1Tag3FRgQH3TYy3Ql0KuQNeA" ? "Founding Member — $19.99/yr" : "Peep Monthly — $10/mo";
  const AcctRow = ({ label, value, note, action, onAction, danger = false, noBorder = false }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderBottom: noBorder ? "none" : "1px solid #1a1a1a" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: danger ? "#f87171" : "#e0e0e0" }}>{label}</p>
        {value && <p style={{ margin: "2px 0 0", fontSize: 13, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</p>}
        {note && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#f87171" }}>{note}</p>}
      </div>
      {action && <button onClick={onAction} style={{ background: "none", border: "none", color: danger ? "#f87171" : "#facc15", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, flexShrink: 0, fontFamily: "inherit", whiteSpace: "nowrap" }}>{action}</button>}
    </div>
  );
  const SectionLabel = ({ children }) => (
    <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "#3a3a3a", letterSpacing: "0.1em", textTransform: "uppercase", paddingLeft: 2 }}>{children}</p>
  );

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>

      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, display: "flex", alignItems: "center", padding: `0 ${PAD}`, height: 64, gap: 20, background: "rgba(10,10,10,0.92)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "#aaa", fontSize: 14, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
        <span onClick={onGoHome} style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, cursor: "pointer", color: "#facc15" }}>peep.</span>
      </nav>

      <div style={{ paddingTop: 64 + 40, paddingBottom: 100, paddingLeft: PAD, paddingRight: PAD, maxWidth: 600, margin: "0 auto" }}>

        {/* Profile header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
          <div style={{ width: 54, height: 54, borderRadius: "50%", background: "linear-gradient(135deg, #312e81, #6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
            {(activeProfile?.name || user?.user_metadata?.full_name || user?.email || "?")[0].toUpperCase()}
          </div>
          <div>
            <p style={{ margin: "0 0 2px", fontSize: 18, fontWeight: 700, color: "#fff" }}>{activeProfile?.name || user?.user_metadata?.full_name || "Your Account"}</p>
            <p style={{ margin: 0, fontSize: 13, color: "#555" }}>{user?.email}</p>
          </div>
          {isOwner && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#facc15", background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 6, padding: "3px 10px", flexShrink: 0 }}>Owner</span>}
        </div>

        {/* Email verification alert */}
        {!user?.email_confirmed_at && (
          <div style={{ marginBottom: 24, background: "#160a0a", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 12, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "#f87171" }}>Email verification needed</p>
              <p style={{ margin: 0, fontSize: 12, color: "#555" }}>Verify your email to confirm your account.</p>
            </div>
            <button onClick={async () => { await supabase.auth.resend({ type: "signup", email: user.email }); alert("Verification email sent!"); }}
              style={{ background: "transparent", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, padding: "8px 16px", color: "#f87171", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
              Resend
            </button>
          </div>
        )}

        {/* ── Account ── */}
        <SectionLabel>Account</SectionLabel>
        <div style={card}>
          <AcctRow label="Name" value={activeProfile?.name || user?.user_metadata?.full_name || "—"} action="Change" onAction={onBack} />
          <AcctRow
            label="Email"
            value={user?.email}
            note={!user?.email_confirmed_at ? "Verification needed" : null}
            action={expandedSection === "email" ? "Cancel" : "Change"}
            onAction={() => setExpandedSection(expandedSection === "email" ? null : "email")}
          />
          {expandedSection === "email" && (
            <div style={{ padding: "4px 18px 18px" }}>
              <input type="email" value={newEmail} onChange={e => { setNewEmail(e.target.value); setEmailMsg(null); }} placeholder="New email address" style={{ ...inp, marginBottom: 10 }} />
              {emailMsg && <p style={{ margin: "0 0 10px", fontSize: 13, color: emailMsg.type === "ok" ? "#4ade80" : "#f87171" }}>{emailMsg.text}</p>}
              <button onClick={changeEmail} disabled={emailSaving || !newEmail.trim()}
                style={{ background: newEmail.trim() ? "#facc15" : "#1e1e1e", border: "none", borderRadius: 8, padding: "11px 22px", color: newEmail.trim() ? "#0a0a0a" : "#444", fontSize: 13, fontWeight: 700, cursor: newEmail.trim() ? "pointer" : "default" }}>
                {emailSaving ? "Sending…" : "Update Email"}
              </button>
            </div>
          )}
          <AcctRow
            label="Password"
            value="••••••••••"
            action={expandedSection === "password" ? "Cancel" : "Change"}
            onAction={() => setExpandedSection(expandedSection === "password" ? null : "password")}
            noBorder={expandedSection !== "password"}
          />
          {expandedSection === "password" && (
            <div style={{ padding: "4px 18px 18px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <input type="password" value={newPassword} onChange={e => { setNewPassword(e.target.value); setPasswordMsg(null); }} placeholder="New password" style={inp} />
                <input type="password" value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setPasswordMsg(null); }} placeholder="Confirm password" style={inp} />
              </div>
              {passwordMsg && <p style={{ margin: "0 0 10px", fontSize: 13, color: passwordMsg.type === "ok" ? "#4ade80" : "#f87171" }}>{passwordMsg.text}</p>}
              <button onClick={changePassword} disabled={passwordSaving || !newPassword}
                style={{ background: newPassword ? "#facc15" : "#1e1e1e", border: "none", borderRadius: 8, padding: "11px 22px", color: newPassword ? "#0a0a0a" : "#444", fontSize: 13, fontWeight: 700, cursor: newPassword ? "pointer" : "default" }}>
                {passwordSaving ? "Updating…" : "Update Password"}
              </button>
            </div>
          )}
        </div>

        {/* ── Subscription ── */}
        <SectionLabel>Subscription</SectionLabel>
        <div style={card}>
          {isOwner ? (
            <AcctRow label="Plan" value="Owner — Full access" noBorder />
          ) : subscription ? (
            <>
              <AcctRow label="Plan" value={planLabel} />
              {subscription.current_period_end && subscription.plan !== "comp" && (
                <AcctRow label="Next Billing Date" value={new Date(subscription.current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} />
              )}
              {subscription.stripe_customer_id && (
                <AcctRow label="Payment Method" action="Update" onAction={openBillingPortal} />
              )}
              {cancelFlow === null && subscription.stripe_customer_id && subscription.status === "active" && (
                <AcctRow label="Cancel Subscription" danger action="Cancel" onAction={() => setCancelFlow("confirm")} noBorder />
              )}
              {cancelFlow === "confirm" && (
                <div style={{ padding: "16px 18px", borderTop: "1px solid #1a1a1a" }}>
                  <p style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>How would you like to cancel?</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                    {[
                      { id: "end_of_period", title: "Cancel at end of billing period", desc: `Keep access until ${subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "renewal"}. No refund.` },
                      { id: "immediate", title: "Cancel immediately", desc: "Access ends now. Prorated refund issued." },
                    ].map(opt => (
                      <div key={opt.id} onClick={() => setCancelMode(opt.id)}
                        style={{ border: `1px solid ${cancelMode === opt.id ? "#f87171" : "#222"}`, borderRadius: 10, padding: "14px 16px", cursor: "pointer", background: cancelMode === opt.id ? "rgba(248,113,113,0.04)" : "transparent", transition: "all 0.15s" }}>
                        <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 600, color: cancelMode === opt.id ? "#f87171" : "#aaa" }}>{opt.title}</p>
                        <p style={{ margin: 0, fontSize: 12, color: "#555" }}>{opt.desc}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setCancelFlow(null)} style={{ flex: 1, background: "transparent", border: "1px solid #222", borderRadius: 8, padding: "12px", color: "#666", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Keep Subscription</button>
                    <button onClick={handleCancelSubscription} disabled={cancelLoading} style={{ flex: 1, background: "#f87171", border: "none", borderRadius: 8, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: cancelLoading ? "not-allowed" : "pointer", opacity: cancelLoading ? 0.7 : 1 }}>
                      {cancelLoading ? "Cancelling…" : "Confirm"}
                    </button>
                  </div>
                </div>
              )}
              {cancelFlow === "success" && (
                <div style={{ padding: "18px" }}>
                  <p style={{ margin: "0 0 16px", fontSize: 14, color: "#aaa", lineHeight: 1.7 }}>
                    {cancelResult?.mode === "immediate"
                      ? `Your subscription has been cancelled.${cancelResult?.refund_issued ? ` A refund of $${(cancelResult.refund_amount / 100).toFixed(2)} has been issued.` : ""}`
                      : "You can still stream Peep until the end of your billing cycle."}
                  </p>
                  <button onClick={() => setCancelFlow(null)} style={{ background: "#1e1e1e", border: "none", borderRadius: 8, padding: "12px 24px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Done</button>
                </div>
              )}
            </>
          ) : (
            <AcctRow label="Plan" value="No active subscription" noBorder />
          )}
        </div>

        {/* ── Playback ── */}
        <SectionLabel>Playback</SectionLabel>
        <div style={card}>
          <SettingRow label="Autoplay Next Episode" description="Automatically play the next episode when one ends" value={autoplayNext} onChange={toggleAutoplayNext} />
          <SettingRow label="Hover Previews" description="Play a trailer clip when hovering over a title" value={autoplayPreviews} onChange={toggleAutoplayPreviews} />
          <SettingRow label="Hero Trailer Autoplay" description="Automatically play the featured trailer on the home screen" value={autoplayHero} onChange={toggleAutoplayHero} noBorder />
        </div>

        {/* ── Admin (owner only) ── */}
        {isOwner && (
          <>
            <SectionLabel>Admin</SectionLabel>
            <div style={{ ...card, border: "1px solid rgba(250,204,21,0.12)", marginBottom: 24 }}>
              <AcctRow label="Admin Dashboard" value="Manage content, users, and settings" action="Open →" onAction={() => { window.location.href = "/admin"; }} noBorder />
            </div>
          </>
        )}

        {/* ── Sign out + Delete ── */}
        <SectionLabel>Session</SectionLabel>
        <div style={card}>
          <AcctRow label="Sign Out" action="Sign Out" onAction={onSignOut} noBorder />
        </div>
        <div style={{ marginTop: 8 }}>
          <DeleteAccountSection user={user} onSignOut={onSignOut} inline />
        </div>

      </div>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

const FOOTER_MODALS = {
  "About Peep": {
    title: "About Peep",
    content: (
      <>
        <p>Peep is an independent streaming platform built for people who actually care about what they watch. We curate movies, series, podcasts, and live streams — no algorithm filler, no bloat.</p>
        <p style={{ marginTop: 16 }}>We believe great content shouldn't be buried. Peep is designed to surface stories worth your time, from indie films to original series to live events.</p>
        <p style={{ marginTop: 16 }}>Founded with a simple idea: streaming should feel good again.</p>
      </>
    ),
  },
  "Press Room": {
    title: "Press Room",
    content: (
      <>
        <p>For press inquiries, partnership opportunities, or media assets, please reach out to our communications team.</p>
        <p style={{ marginTop: 16, color: "#facc15" }}>press@peep.tv</p>
        <p style={{ marginTop: 16 }}>We typically respond within 2 business days.</p>
      </>
    ),
  },
  "Careers": {
    title: "Careers at Peep",
    content: (
      <>
        <p>We're building a small, focused team of people who love great storytelling and great software. If that's you, we'd love to hear from you.</p>
        <p style={{ marginTop: 16 }}>Open roles are posted as we grow. In the meantime, send your resume and a note about what excites you to:</p>
        <p style={{ marginTop: 12, color: "#facc15" }}>jobs@peep.tv</p>
      </>
    ),
  },
  "Contact Us": {
    title: "Contact Us",
    content: (
      <>
        <p>Have a question, a content suggestion, or just want to say hello? We're all ears.</p>
        <p style={{ marginTop: 16, color: "#facc15" }}>hello@peep.tv</p>
        <p style={{ marginTop: 16 }}>For technical support, visit the Help Center or email support@peep.tv.</p>
      </>
    ),
  },
  "FAQ": {
    title: "Frequently Asked Questions",
    content: (
      <>
        {[
          ["Is Peep free?", "Yes. Peep is completely free to join and watch. No credit card required."],
          ["What can I watch?", "Movies, original series, podcasts, and live streams — all in one place."],
          ["Do I need an account?", "You need an account to save content to your list and track watch progress, but browsing is open to everyone."],
          ["How do I cancel?", "There's nothing to cancel — Peep is free. You can delete your account at any time from your profile settings."],
          ["Is content available in my country?", "Peep is available globally. Some live content may be region-restricted."],
        ].map(([q, a]) => (
          <div key={q} style={{ marginBottom: 20 }}>
            <p style={{ margin: "0 0 6px", color: "#e5e5e5", fontWeight: 600, fontSize: 13 }}>{q}</p>
            <p style={{ margin: 0, color: "#777", fontSize: 13 }}>{a}</p>
          </div>
        ))}
      </>
    ),
  },
  "Contact Support": {
    title: "Contact Support",
    content: (
      <>
        <p>Running into an issue? We're here to help.</p>
        <p style={{ marginTop: 16, color: "#facc15" }}>support@peep.tv</p>
        <p style={{ marginTop: 16 }}>Include your username and a description of the issue and we'll get back to you within 24 hours.</p>
      </>
    ),
  },
  "Terms of Use": {
    title: "Terms of Use",
    content: (
      <>
        <p>By using Peep, you agree to use the platform for lawful purposes only. You may not copy, distribute, or reproduce any content without explicit permission.</p>
        <p style={{ marginTop: 14 }}>Peep reserves the right to suspend accounts that violate these terms. Content availability is subject to change without notice.</p>
        <p style={{ marginTop: 14 }}>These terms are governed by applicable law. For questions, contact legal@peep.tv.</p>
        <p style={{ marginTop: 14, color: "#444", fontSize: 12 }}>Last updated: 2025</p>
      </>
    ),
  },
  "Privacy Policy": {
    title: "Privacy Policy",
    content: (
      <>
        <p>Peep collects only the information necessary to provide the service: your email address, username, and watch activity.</p>
        <p style={{ marginTop: 14 }}>We do not sell your data. We do not share your personal information with third parties except as required by law.</p>
        <p style={{ marginTop: 14 }}>Watch history and list data are stored securely and used solely to improve your experience on Peep.</p>
        <p style={{ marginTop: 14 }}>You can request deletion of your account and all associated data at any time by contacting privacy@peep.tv.</p>
        <p style={{ marginTop: 14, color: "#444", fontSize: 12 }}>Last updated: 2025</p>
      </>
    ),
  },
  "Privacy Settings": {
    title: "Privacy Settings",
    content: (
      <p>Privacy controls are coming soon. For now, to request data deletion or opt out of watch history, email privacy@peep.tv.</p>
    ),
  },
};

const SOCIAL_LINKS = [
  { label: "Twitter / X", href: "https://x.com" },
  { label: "Instagram", href: "https://instagram.com" },
  { label: "YouTube", href: "https://youtube.com" },
  { label: "TikTok", href: "https://tiktok.com" },
  { label: "Facebook", href: "https://facebook.com" },
];

function Footer({ onNavChange, onProfileOpen, onOpenModal }) {
  const isMobile = useIsMobile();

  function handleLink(label) {
    if (label === "Movies") { onNavChange("Movies"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (label === "Series") { onNavChange("Series"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (["Horror", "Comedy", "Drama", "Action", "Sci-Fi", "Documentary"].includes(label)) { onNavChange("Movies"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (label === "Sign In") { window.location.href = "/signin"; return; }
    if (label === "Create Profile") { window.location.href = "/signup"; return; }
    if (label === "Manage Account") { onProfileOpen?.(); return; }
    if (FOOTER_MODALS[label]) { onOpenModal(FOOTER_MODALS[label]); return; }
  }

  return (
    <footer style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: `56px ${PAD} ${isMobile ? 100 : 40}px`, fontFamily: "'Space Grotesk', sans-serif" }}>
      <div style={{ display: "flex", gap: 28, marginBottom: 40, flexWrap: "wrap" }}>
        {SOCIAL_LINKS.map(s => (
          <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, color: "#666", cursor: "pointer", textDecoration: "none", transition: "color 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.color = "#ccc"}
            onMouseLeave={e => e.currentTarget.style.color = "#666"}>
            {s.label}
          </a>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 32, marginBottom: 44 }}>
        {[
          { heading: "Company", links: ["About Peep", "Press Room", "Careers", "Contact Us"] },
          { heading: "Browse", links: ["Movies", "Series", "Horror", "Comedy", "Drama"] },
          { heading: "Account", links: ["Sign In", "Create Profile", "Manage Account", "Privacy Settings"] },
          { heading: "Help Center", links: ["FAQ", "Contact Support", "Terms of Use", "Privacy Policy"] },
        ].map(col => (
          <div key={col.heading}>
            <p style={{ fontSize: 11.5, fontWeight: 600, color: "#555", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: 0.8 }}>{col.heading}</p>
            {col.links.map(l => (
              <p key={l} onClick={() => handleLink(l)} style={{ fontSize: 12.5, color: "#3e3e3e", margin: "0 0 10px", cursor: "pointer", transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "#aaa"}
                onMouseLeave={e => e.currentTarget.style.color = "#3e3e3e"}>
                {l}
              </p>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: "#2e2e2e" }}><span style={{ color: "#facc15" }}>peep.</span></span>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: "0 0 4px", fontSize: 11, color: "#333" }}>© {new Date().getFullYear()} Peep Media, Inc. All rights reserved.</p>
          <p style={{ margin: 0, fontSize: 11, color: "#2a2a2a" }}>All content sourced from the public domain. Free to watch, forever.</p>
        </div>
      </div>
    </footer>
  );
}

// ─── Password Reset Page ──────────────────────────────────────────────────────

function PasswordResetPage({ onDone, isInvite = false }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setLoading(false); return; }
    setDone(true);
    setTimeout(onDone, 2000);
  }

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", padding: 24 }}>
      <div style={{ width: "min(420px, 100%)" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: "#facc15" }}>peep.</span>
        </div>
        <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 16, padding: "36px clamp(20px, 6vw, 40px)" }}>
          {done ? (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: "#fff" }}>Password updated!</p>
              <p style={{ fontSize: 14, color: "#555" }}>Taking you back…</p>
            </div>
          ) : (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: "#fff" }}>{isInvite ? "Create your password" : "Set new password"}</h2>
              <p style={{ margin: "0 0 28px", fontSize: 13, color: "#555" }}>{isInvite ? "Welcome to Peep. Set a password to access your creator dashboard." : "Choose a new password for your account."}</p>
              <form onSubmit={handleSubmit}>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 500 }}>New Password</label>
                    <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(null); }} placeholder="At least 6 characters" required
                      style={{ width: "100%", background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 10, padding: "13px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6, fontWeight: 500 }}>Confirm Password</label>
                    <input type="password" value={confirm} onChange={e => { setConfirm(e.target.value); setError(null); }} placeholder="Repeat new password" required
                      style={{ width: "100%", background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 10, padding: "13px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
                {error && <p style={{ color: "#f87171", fontSize: 13, margin: "12px 0 0" }}>{error}</p>}
                <button type="submit" disabled={loading}
                  style={{ display: "block", width: "100%", marginTop: 24, background: "#facc15", border: "none", borderRadius: 10, padding: "13px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
                  {loading ? "Updating…" : "Update Password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Email Verification Gate ──────────────────────────────────────────────────

function EmailVerificationGate({ user }) {
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState(null);

  async function handleResend() {
    setResending(true);
    setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL_SETTINGS}/functions/v1/send-confirmation-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResent(true);
    } catch (err) {
      setError(err.message);
    }
    setResending(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", padding: 24 }}>
      <div style={{ width: "min(420px, 100%)", textAlign: "center" }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, color: "#facc15", display: "block", marginBottom: 36 }}>peep.</span>

        <div style={{ fontSize: 48, marginBottom: 20 }}>✉️</div>
        <h1 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 700, color: "#fff" }}>Check your inbox</h1>
        <p style={{ margin: "0 0 8px", fontSize: 14, color: "#666", lineHeight: 1.6 }}>
          We sent a confirmation link to
        </p>
        <p style={{ margin: "0 0 32px", fontSize: 14, fontWeight: 600, color: "#facc15" }}>{user.email}</p>
        <p style={{ margin: "0 0 32px", fontSize: 13, color: "#444", lineHeight: 1.6 }}>
          Click the link in that email to verify your account and start watching.
        </p>

        {resent ? (
          <p style={{ fontSize: 13, color: "#22c55e", marginBottom: 24 }}>Email resent — check your inbox.</p>
        ) : (
          <button
            onClick={handleResend}
            disabled={resending}
            style={{ width: "100%", background: "#facc15", border: "none", borderRadius: 10, padding: "13px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: resending ? "default" : "pointer", marginBottom: 12, opacity: resending ? 0.7 : 1 }}>
            {resending ? "Sending…" : "Resend verification email"}
          </button>
        )}

        {error && <p style={{ fontSize: 13, color: "#f87171", marginBottom: 12 }}>{error}</p>}

        <button
          onClick={handleSignOut}
          style={{ background: "transparent", border: "none", color: "#444", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
          Sign out and use a different account
        </button>

        <p style={{ marginTop: 28, fontSize: 12, color: "#2a2a2a" }}>
          Didn't get it? Check your spam folder or resend above.
        </p>
      </div>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

const LOADING_MSGS = [
  "Loading something weird...",
  "Almost there, don't panic...",
  "Buffering the vibes...",
  "This better be worth it...",
  "Summoning the content...",
];

function Spinner() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % LOADING_MSGS.length), 800);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{ width: 28, height: 28, border: "2.5px solid #222", borderTop: "2.5px solid #facc15", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
      <span style={{ fontSize: 13, color: "#444", letterSpacing: "0.02em" }}>{LOADING_MSGS[idx]}</span>
    </div>
  );
}
