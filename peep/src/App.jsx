import { useState, useEffect, useRef, useMemo, Component } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "./supabase";
import { AuthModal } from "./components/AuthModal";
import { LandingPage } from "./pages/LandingPage";
import { ProfileScreen, avatarForId, PRESET_AVATARS } from "./components/ProfileScreen";
import { CreatorDashboard } from "./pages/CreatorDashboard";
import { LiveTVPage } from "./pages/LiveTV";
import { StreamerDashboard } from "./pages/StreamerDashboard";
import { Homepage } from "./components/browse/Homepage";
import { CatalogCard } from "./components/browse/BrowseWidgets";
import { PlayerView } from "./components/player/PlayerView";
import { SettingsPage } from "./pages/SettingsPage";
import { PasswordResetPage, EmailVerificationGate } from "./components/auth/AuthGates";
import { useAuth } from "./hooks/useAuth";
import { useMyList } from "./hooks/useMyList";
import { useSubscription, hasActiveSubscription } from "./hooks/useSubscription";
import { PaywallPage } from "./pages/PaywallPage";
import { isOwnerEmail } from "./lib/auth";
import { PAD, CARD_W, SAFE_TOP } from "./lib/theme";
import { AvatarThumb } from "./pages/settingsHelpers";
import { useAppNavigation } from "./app/useAppNavigation";
import { useIsMobile } from "./hooks/useIsMobile";
import { rankRelated } from "./lib/recommendations";
import { TrailerModal } from "./lib/playerUtils";
import { Spinner } from "./components/ui/Spinner";
import { loadFlags, getFlags } from "./lib/flags";
import { contentSelect } from "./lib/contentQueries";
import { contentKey } from "./lib/contentIds";

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

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

function resolvePage(pathname, search) {
  if (pathname === "/settings") return "settings";
  if (pathname === "/profile") return "profile";
  if (pathname === "/creator") return "creator";
  if (pathname === "/studio") return "studio";
  const pg = new URLSearchParams(search).get("page");
  if (pg === "settings" || pg === "profile" || pg === "creator" || pg === "studio") return pg;
  return "home";
}

export default function App() {
  const location = useLocation();
  const [page, setPage] = useState(() => resolvePage(location.pathname, location.search));
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [selectedShow, setSelectedShow] = useState(null);
  const [selectedPodcast, setSelectedPodcast] = useState(null);
  const [selectedPodcastEp, setSelectedPodcastEp] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [streamRecord, setStreamRecord] = useState(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [flags, setFlags] = useState(() => getFlags());
  const {
    user,
    authChecked,
    userAvatarId,
    setUserAvatarId,
    userName,
    setUserName,
    userRole,
    passwordRecovery,
    setPasswordRecovery,
  } = useAuth();
  const { myList, toggleList } = useMyList(user?.id, () => setAuthOpen(true));
  const { subscription } = useSubscription(user?.id);
  const isPremiumUser = hasActiveSubscription(subscription, isOwnerEmail(user?.email));
  const [paywallOpen, setPaywallOpen] = useState(false);
  const isLocked = (item) => !!item?.is_premium && !isPremiumUser;
  const openGate = (item) => { if (!user) setAuthOpen(true); else setPaywallOpen(true); };
  const guardPlay = (v) => { if (isLocked(v)) { openGate(v); return; } setSelectedVideo(v); setPage("player"); };
  const guardShowOpen = (s) => { if (isLocked(s)) { openGate(s); return; } setSelectedShow(s); setPage("show"); };
  const [creatorRecord, setCreatorRecord] = useState(null);
  const [betaAck, setBetaAck] = useState(() => localStorage.getItem("peep_beta_ack") === "true");
  const [guestMode, setGuestMode] = useState(() => sessionStorage.getItem("peep_guest") === "1");
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

  useEffect(() => { loadFlags().then(setFlags); }, []);

  // Check if viewer-role user is also a creator partner (for in-app creator portal link)
  useEffect(() => {
    if (!user?.email || userRole === "creator") { setCreatorRecord(null); return; }
    supabase.from("creators").select("id, name, email, payment_method, payment_handle, status")
      .eq("email", user.email.toLowerCase()).eq("status", "active").maybeSingle()
      .then(({ data }) => setCreatorRecord(data ?? null));
  }, [user?.email, userRole]);

  // Check if signed-in user is a streamer (for Streamer Dashboard link in profile menu)
  useEffect(() => {
    if (!user?.id) { setStreamRecord(null); return; }
    supabase.from("live_streams").select("id, channel_name, username").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setStreamRecord(data ?? null));
  }, [user?.id]);

  // When the session ends (sign-out here or in another tab), leave any logged-in-only
  // view so we don't show a stale screen (e.g. the streamer "Application under review").
  const prevUserRef = useRef(user);
  useEffect(() => {
    const wasSignedIn = !!prevUserRef.current;
    prevUserRef.current = user;
    if (wasSignedIn && !user) {
      setProfileOpen(false);
      setPaywallOpen(false);
      setPage(p => (["studio", "settings", "profile", "creator"].includes(p) ? "home" : p));
    }
  }, [user]);

  // Presence heartbeat — mark this user online while browsing
  useEffect(() => {
    if (!user) return;
    const ping = () => supabase.from("user_presence").upsert(
      { user_id: user.id, last_seen: new Date().toISOString(), current_page: page },
      { onConflict: "user_id" }
    ).then(() => {});
    ping();
    const t = setInterval(ping, 60000);
    return () => clearInterval(t);
  }, [user?.id, page]);

  const clearSelection = () => {
    setSelectedVideo(null);
    setSelectedShow(null);
    setSelectedPodcast(null);
    setSelectedPodcastEp(null);
  };
  const { goHome: navigateHome } = useAppNavigation({ page, setPage, selectedVideo, selectedShow, selectedPodcast, onClearSelection: clearSelection });
  const goHome = () => { navigateHome(); clearSelection(); };

  // Live Feed HLS map (from the public_live_feeds view) — lets a channel play a
  // linked feed's Cloudflare stream without exposing any source details.
  const [feedHlsMap, setFeedHlsMap] = useState({});
  useEffect(() => {
    supabase.from("public_live_feeds").select("id, cloudflare_hls_url, playback_status")
      .then(({ data }) => {
        const m = {};
        (data || []).forEach(f => { if (f.cloudflare_hls_url) m[f.id] = f.cloudflare_hls_url; });
        setFeedHlsMap(m);
      });
  }, []);

  // Resolve a channel's HLS playback URL. Priority:
  //   1. linked Live Feed -> its Cloudflare HLS
  //   2. direct hls_url (HLS-pull channels)
  //   3. Cloudflare live-input UID (RTMP/SRT push channels)
  const channelPlaybackUrl = ch => {
    if (ch.live_feed_id && feedHlsMap[ch.live_feed_id]) return feedHlsMap[ch.live_feed_id];
    if (ch.hls_url) return ch.hls_url;
    if (ch.stream_uid) return `https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com/${ch.stream_uid}/manifest/video.m3u8`;
    return "";
  };

  const listProps = { user, myList, onToggleList: toggleList, onAuthOpen: () => setAuthOpen(true), onProfileOpen: () => setPage("profile"), userAvatarId, userName, isPremiumUser, onPodcastSelect: pod => { setSelectedPodcast(pod); setPage("podcast"); }, onViewProfile: () => setPage("profile"), onChannelPlay: ch => { if (!user) { setAuthOpen(true); return; } if (isLocked(ch)) { openGate(ch); return; } setSelectedVideo({ id: `ch-${ch.id}`, title: ch.name, url: channelPlaybackUrl(ch), _type: "live", thumbnail: ch.hero_url || ch.logo_url || "", description: ch.description || "" }); setPage("player"); } };


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
  if (!user && !guestMode) return <LandingPage onBrowse={() => { sessionStorage.setItem("peep_guest", "1"); setGuestMode(true); }} />;
  if (user && !user.email_confirmed_at) return <EmailVerificationGate user={user} />;
  if (user && userRole === "creator") return <CreatorDashboard user={user} onSignOut={async () => { await supabase.auth.signOut(); window.location.href = "/"; }} />;
  if (paywallOpen) return <PaywallPage user={user} onBack={() => setPaywallOpen(false)} onSubscribed={() => setPaywallOpen(false)} onSignOut={async () => { await supabase.auth.signOut(); window.location.href = "/"; }} />;

  const goToStudio = () => { setProfileOpen(false); setPage("studio"); };
  const profileScreenEl = profileOpen && <ProfileScreen user={user} userAvatarId={userAvatarId} userName={userName} onClose={() => setProfileOpen(false)} onAvatarChange={id => setUserAvatarId(id)} onNameChange={n => setUserName(n)} onViewProfile={() => { setProfileOpen(false); setPage("profile"); }} onOpenSettings={() => { setProfileOpen(false); setPage("settings"); }} onCreatorDash={creatorRecord ? () => { setProfileOpen(false); setPage("creator"); } : null} onStreamerDash={streamRecord ? goToStudio : null} />;

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
          onPlay={guardPlay}
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
          isOwner={isOwnerEmail(user?.email)}
          isStreamer={!!streamRecord}
          onApplyToStream={() => setPage("studio")}
          onBack={() => setPage("home")}
          onGoHome={goHome}
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
          userAvatarId={userAvatarId}
          userName={userName}
          onBack={() => setPage("home")}
          onGoHome={goHome}
          onNameChange={n => setUserName(n)}
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
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(12,11,14,0.78)", backdropFilter: "blur(24px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", padding: 24 }}>
          <div style={{ position: "relative", background: "linear-gradient(165deg, #232019 0%, #1b1a1d 55%, #151417 100%)", border: "1px solid rgba(250,204,21,0.22)", borderRadius: 24, padding: "46px 40px 38px", maxWidth: 430, width: "100%", textAlign: "center", overflow: "hidden", boxShadow: "0 40px 120px rgba(0,0,0,0.5), 0 0 70px rgba(250,204,21,0.07)" }}>
            {/* Warm orb glow */}
            <div style={{ position: "absolute", top: -90, left: "50%", transform: "translateX(-50%)", width: 380, height: 280, background: "radial-gradient(ellipse, rgba(250,204,21,0.22) 0%, transparent 70%)", pointerEvents: "none" }} />
            {/* Top accent line */}
            <div style={{ position: "absolute", top: 0, left: "15%", right: "15%", height: 1, background: "linear-gradient(90deg, transparent, rgba(250,204,21,0.6), transparent)" }} />

            <div style={{ position: "relative" }}>
              <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 46, color: "#facc15", display: "block", marginBottom: 16, letterSpacing: "-0.01em", textShadow: "0 0 32px rgba(250,204,21,0.35)" }}>peep.</span>

              <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(250,204,21,0.13)", border: "1px solid rgba(250,204,21,0.32)", borderRadius: 100, padding: "6px 16px", marginBottom: 24 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#facc15", display: "inline-block", boxShadow: "0 0 8px #facc15" }} />
                <span style={{ fontSize: 10, color: "#facc15", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>Pre-Beta · Early Access</span>
              </div>

              <h2 style={{ margin: "0 0 14px", fontSize: 27, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.15, color: "#fff" }}>You're early.</h2>
              <p style={{ margin: "0 0 24px", fontSize: 15, color: "#cbc9c2", lineHeight: 1.7 }}>
                Welcome inside Peep — we're in <span style={{ color: "#e8e6df", fontWeight: 600 }}>pre-beta</span>, the very beginning stages, so expect rough edges, missing pieces, and things changing fast. It's a growing mix of films, series and always-on live channels, with fresh drops landing every week. Thanks for being here this early.
              </p>

              {/* What's inside */}
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 30, flexWrap: "wrap" }}>
                {["Live TV", "Films", "Series"].map(t => (
                  <span key={t} style={{ fontSize: 12, fontWeight: 600, color: "#e8e6df", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 100, padding: "6px 15px" }}>{t}</span>
                ))}
              </div>

              <button
                onClick={() => { localStorage.setItem("peep_beta_ack", "true"); setBetaAck(true); }}
                style={{ width: "100%", background: "#facc15", border: "none", borderRadius: 12, padding: "15px 0", color: "#0a0a0a", fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s", letterSpacing: "-0.01em", boxShadow: "0 4px 20px rgba(250,204,21,0.22)" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.02)"; e.currentTarget.style.boxShadow = "0 6px 30px rgba(250,204,21,0.4)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(250,204,21,0.22)"; }}
              >
                Start watching →
              </button>
            </div>
          </div>
        </div>
      )}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      {profileScreenEl}
      <Homepage
        onPlay={guardPlay}
        onShowSelect={guardShowOpen}
        onGoLive={() => setPage("studio")}
        onExitStudio={() => setPage("home")}
        studioContent={page === "studio" ? <StreamerDashboard embedded preloadedUser={user} /> : null}
        flags={flags}
        isStreamer={!!streamRecord}
        {...listProps}
      />
    </>
  );
}

// ─── Notification Bell ────────────────────────────────────────────────────────

// ─── Homepage ─────────────────────────────────────────────────────────────────


function ShowDetail({ show, onBack, onGoHome, onPlay, onShowSelect, user, myList, onToggleList, onAuthOpen, onProfileOpen, userAvatarId, userName }) {
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
    if (!user || !episodes.length) { setWatchProgress({}); return; }
    supabase.from("watch_progress").select("*")
      .eq("user_id", user.id).eq("content_type", "episode")
      .in("content_id", episodes.map(e => e.id))
      .then(({ data }) => {
        if (data) {
          const map = {};
          data.forEach(p => { map[p.content_id] = p; });
          setWatchProgress(map);
        }
      });
  }, [episodes, user?.id]);

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
            const av = avatarForId(userAvatarId);
            return user ? (
              <div onClick={onProfileOpen} title={userName ?? "Profile"} style={{ width: 34, height: 34, borderRadius: "50%", background: av?.gradient ?? "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: av ? 15 : 13, fontWeight: 700, cursor: "pointer", color: "#fff", flexShrink: 0, border: "2px solid transparent", transition: "border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#facc15"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}>
                {av ? av.emoji : (userName?.[0] || user.email[0]).toUpperCase()}
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

function PodcastDetail({ podcast, onBack, onGoHome, onPlay, onProfileOpen, userAvatarId, user, userName }) {
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
    if (!user || !episodes.length) { setWatchProgress({}); return; }
    supabase.from("watch_progress").select("*")
      .eq("user_id", user.id).eq("content_type", "podcast_episode")
      .in("content_id", episodes.map(e => e.id))
      .then(({ data }) => {
        if (data) { const m = {}; data.forEach(p => { m[p.content_id] = p; }); setWatchProgress(m); }
      });
  }, [episodes, user?.id]);

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
            const av = avatarForId(userAvatarId);
            return user ? (
              <div onClick={onProfileOpen} title={userName ?? "Profile"} style={{ width: 34, height: 34, borderRadius: "50%", background: av?.gradient ?? "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: av ? 15 : 13, fontWeight: 700, cursor: "pointer", color: "#fff", flexShrink: 0, border: "2px solid transparent", transition: "border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#facc15"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}>
                {av ? av.emoji : (userName?.[0] || user.email[0]).toUpperCase()}
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

function PodcastPlayerView({ episode, podcast, onBack, onGoHome, onSelect, onProfileOpen, userAvatarId, user, userName }) {
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
    if (!user) return;
    saveProgressRef.current = async () => {
      if (!audioRef.current) return;
      const { currentTime, duration } = audioRef.current;
      if (currentTime < 5 || !duration) return;
      await supabase.from("watch_progress").upsert({
        user_id: user.id, content_id: episode.id, content_type: "podcast_episode",
        progress_seconds: currentTime, duration_seconds: duration,
        completed: currentTime / duration > 0.92 || duration - currentTime < 30,
        last_watched_at: new Date().toISOString(),
      }, { onConflict: "user_id,content_id,content_type" });
    };
    progressTimerRef.current = setInterval(() => { saveProgressRef.current?.(); }, 15000);
    return () => clearInterval(progressTimerRef.current);
  }, [episode.id, user]);

  useEffect(() => () => { clearInterval(progressTimerRef.current); saveProgressRef.current?.(); }, []);

  function handleLoadedMetadata() {
    if (!user || !audioRef.current) return;
    supabase.from("watch_progress").select("progress_seconds, duration_seconds, completed")
      .eq("user_id", user.id)
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
            const av = avatarForId(userAvatarId);
            return user ? (
              <div onClick={onProfileOpen} title={userName ?? "Profile"} style={{ width: 34, height: 34, borderRadius: "50%", background: av?.gradient ?? "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: av ? 15 : 13, fontWeight: 700, cursor: "pointer", color: "#fff", flexShrink: 0, border: "2px solid transparent", transition: "border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#facc15"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}>
                {av ? av.emoji : (userName?.[0] || user.email[0]).toUpperCase()}
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

function ProfilePage({ user, userAvatarId, userName, onBack, onGoHome, onNameChange, onOpenSettings, onAvatarChange, onSignOut }) {
  const [history, setHistory] = useState([]);
  const [contentMap, setContentMap] = useState({});
  const [showsMap, setShowsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(userName || "");
  const [avatarId, setAvatarId] = useState(userAvatarId || null);
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile();
  const memberSince = user?.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : null;
  const av = avatarForId(editing ? avatarId : userAvatarId);

  useEffect(() => { fetchData(); }, [user?.id]);

  async function fetchData() {
    setLoading(true);
    const [progressRes, videosRes, showsRes, episodesRes, podEpRes, podRes] = await Promise.all([
      supabase.from("watch_progress").select("*").eq("user_id", user.id).order("last_watched_at", { ascending: false }),
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
    await supabase.from("profiles").update({ full_name: name.trim(), avatar_id: avatarId }).eq("id", user.id);
    setSaving(false);
    setEditing(false);
    onAvatarChange?.(avatarId);
    onNameChange?.(name.trim());
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
            {av?.svg ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: av.svg }} /> : (av?.emoji ?? (userName?.[0] ?? user?.email?.[0] ?? "?").toUpperCase())}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: "0 0 4px", fontSize: isMobile ? 20 : 26, fontWeight: 700, color: "#fff" }}>{editing ? name : (userName || user?.email)}</h1>
            <p style={{ margin: 0, fontSize: 12, color: "#333" }}>{memberSince ? `Member since ${memberSince}` : user?.email}</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            {onOpenSettings && !editing && (
              <button onClick={onOpenSettings} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid #2a2a2a", borderRadius: 8, padding: "8px 14px", color: "#aaa", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Settings
              </button>
            )}
            <button onClick={() => { setEditing(e => !e); setName(userName || ""); setAvatarId(userAvatarId || null); }}
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
