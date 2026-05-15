import { useState, useEffect, useRef, useMemo, Component } from "react";
import { supabase } from "./supabase";
import { AuthModal } from "./components/AuthModal";
import { LandingPage } from "./pages/LandingPage";
import { ProfileScreen, avatarForId } from "./components/ProfileScreen";
import { ProfileSelect } from "./components/ProfileSelect";

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
  const [page, setPage] = useState("home");
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) { loadAvatarId(session.user.id); userIdRef.current = session.user.id; }
      setAuthChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setMyList({});
        setActiveProfile(null);
        if (userIdRef.current) localStorage.removeItem(`peep_profile_${userIdRef.current}`);
        userIdRef.current = null;
      } else {
        userIdRef.current = session.user.id;
      }
    });
    return () => subscription.unsubscribe();
  }, []);

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

  const listProps = { user, myList, onToggleList: toggleList, onAuthOpen: () => setAuthOpen(true), onProfileOpen: () => setProfileOpen(true), userAvatarId, activeProfile, onSwitchProfile: switchProfile, onPodcastSelect: pod => { setSelectedPodcast(pod); setPage("podcast"); }, onViewProfile: () => setPage("profile") };

  if (!authChecked) return null;
  if (!user) return <LandingPage />;
  // email verification gate — re-enable once real domain is set up
  // if (!user.email_confirmed_at) return <EmailVerificationGate user={user} />;
  if (!activeProfile) return <ProfileSelect user={user} onSelect={selectProfile} />;

  const profileScreenEl = profileOpen && <ProfileScreen user={user} onClose={() => setProfileOpen(false)} onAvatarChange={id => setUserAvatarId(id)} onSwitchProfile={switchProfile} onViewProfile={() => { setProfileOpen(false); setPage("profile"); }} />;

  if (page === "player" && selectedVideo) {
    const handleBack = () => { setPage(selectedShow ? "show" : "home"); setSelectedVideo(null); };
    return (
      <>
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
        {profileScreenEl}
        <PlayerErrorBoundary onBack={handleBack}>
          <PlayerView
            key={selectedVideo.id}
            video={selectedVideo}
            onBack={handleBack}
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
          onSelect={ep => setSelectedPodcastEp(ep)}
          {...listProps}
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
          onProfileUpdate={updated => {
            setActiveProfile(updated);
            localStorage.setItem(`peep_profile_${user.id}`, JSON.stringify(updated));
          }}
        />
      </>
    );

  return (
    <>
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

// ─── Homepage ─────────────────────────────────────────────────────────────────

function Homepage({ onPlay, onShowSelect, onPodcastSelect, user, myList, onToggleList, onAuthOpen, onProfileOpen, userAvatarId, activeProfile, onSwitchProfile }) {
  const [videos, setVideos] = useState([]);
  const [shows, setShows] = useState([]);
  const [carousels, setCarousels] = useState([]);
  const [podcasts, setPodcasts] = useState([]);
  const [liveStreams, setLiveStreams] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchTypeFilter, setSearchTypeFilter] = useState("all");
  const [recentSearches, setRecentSearches] = useState(() => { try { return JSON.parse(localStorage.getItem("peep_recent_searches") || "[]"); } catch { return []; } });
  const [activeNav, setActiveNav] = useState("Home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [footerModal, setFooterModal] = useState(null);
  const isMobile = useIsMobile();

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

    const handler = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handler);

    return () => {
      supabase.removeChannel(videoChannel);
      supabase.removeChannel(showChannel);
      supabase.removeChannel(carouselChannel);
      supabase.removeChannel(podcastChannel);
      supabase.removeChannel(liveChannel);
      window.removeEventListener("scroll", handler);
    };
  }, []);

  useEffect(() => { loadContinueWatching(); }, [user, activeProfile]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 150);
    return () => clearTimeout(t);
  }, [searchQuery]);

  async function fetchAll() {
    const [videosRes, showsRes, carouselsRes, podcastsRes, liveRes] = await Promise.all([
      supabase.from("videos").select("*").order("id", { ascending: true }),
      supabase.from("shows").select("*").order("id", { ascending: true }),
      supabase.from("carousels").select("*").eq("enabled", true).order("position", { ascending: true }),
      supabase.from("podcasts").select("*").order("id", { ascending: true }),
      supabase.from("live_streams").select("*").order("id", { ascending: true }),
    ]);
    if (videosRes.data) setVideos(videosRes.data);
    if (showsRes.data) setShows(showsRes.data);
    if (carouselsRes.data) setCarousels(carouselsRes.data);
    if (podcastsRes.data) setPodcasts(podcastsRes.data.filter(p => p.enabled !== false));
    if (liveRes.data) setLiveStreams(liveRes.data);
    setLoading(false);
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

  const visibleCarousels = useMemo(() => carousels.filter(c => {
    if (!c.enabled) return false;
    const pages = (c.pages || "home").split(",").map(p => p.trim());
    if (activeNav === "Home") return pages.includes("home");
    if (activeNav === "Movies") return pages.includes("movies");
    if (activeNav === "Series") return pages.includes("series");
    return false;
  }), [carousels, activeNav]);

  const sections = useMemo(() => activeNav === "My List"
    ? [{ id: "mylist", title: "My List", videos: allContent.filter(v => myList?.[`${v._type}_${v.id}`]) }]
    : activeNav === "New & Popular"
    ? [{ id: "new", title: "New & Popular", videos: [...allContent].sort((a, b) => (b.year || 0) - (a.year || 0)) }]
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
          : filteredContent;
        const items = c.content_type === "movies" ? baseItems.filter(v => v._type === "movie")
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
    ];
  }, [videos, shows, podcasts]);

  const searchResults = useMemo(() => {
    if (!debouncedQuery || !debouncedQuery.trim()) return [];
    const q = debouncedQuery.toLowerCase().trim();
    return searchPool.filter(v => {
      if (searchTypeFilter !== "all" && v._type !== searchTypeFilter) return false;
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
    if (item._type === "show") onShowSelect(item);
    else if (item._type === "podcast") { setSelectedPodcast(item); setPage("podcast"); }
    else onPlay(item);
  }

  function handleClick(item) {
    item._type === "show" ? onShowSelect(item) : onPlay(item);
  }

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>
      <style>{`.scroll-row::-webkit-scrollbar { display: none; }`}</style>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* Navbar */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: `0 ${PAD}`, height: 68,
        background: scrolled || menuOpen ? "rgba(10,10,10,0.96)" : "linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)",
        backdropFilter: scrolled || menuOpen ? "blur(12px)" : "none",
        borderBottom: scrolled || menuOpen ? "1px solid rgba(255,255,255,0.05)" : "none",
        transition: "background 0.4s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, letterSpacing: "-0.5px", userSelect: "none" }}>
            <span style={{ color: "#facc15" }}>peep.</span>
          </span>
          {!isMobile && (
            <div style={{ display: "flex", gap: 4 }}>
              {["Home", "Movies", "Series", "Podcasts", "New & Popular"].map(label => {
                const active = activeNav === label;
                return (
                  <span key={label} onClick={() => setActiveNav(label)} style={{ fontSize: 13.5, padding: "6px 12px", borderRadius: 6, color: active ? "#fff" : "rgba(255,255,255,0.55)", fontWeight: active ? 600 : 400, cursor: "pointer", background: active ? "rgba(250,204,21,0.12)" : "transparent", transition: "color 0.2s, background 0.2s" }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.color = "rgba(255,255,255,0.55)"; e.currentTarget.style.background = "transparent"; } }}
                  >{label}</span>
                );
              })}
              <span onClick={() => { if (!user) { onAuthOpen(); return; } setActiveNav("My List"); }}
                style={{ fontSize: 13.5, padding: "6px 12px", borderRadius: 6, cursor: "pointer", color: activeNav === "My List" ? "#fff" : "rgba(255,255,255,0.55)", fontWeight: activeNav === "My List" ? 600 : 400, background: activeNav === "My List" ? "rgba(250,204,21,0.12)" : "transparent", transition: "color 0.2s, background 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = activeNav === "My List" ? "#fff" : "rgba(255,255,255,0.55)"; e.currentTarget.style.background = activeNav === "My List" ? "rgba(250,204,21,0.12)" : "transparent"; }}
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
                placeholder="Search titles, genres, podcasts..."
                style={{ background: "rgba(15,15,15,0.92)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 6, padding: "8px 14px 8px 38px", color: "#fff", fontSize: 13, width: isMobile ? "calc(100vw - 110px)" : 260, outline: "none" }}
              />
            )}
            <div onClick={() => setSearchOpen(o => !o)} style={{ position: searchOpen ? "absolute" : "relative", left: searchOpen ? 11 : 0, cursor: "pointer", color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            </div>
          </div>
          {!isMobile && (
            <div style={{ position: "relative", cursor: "pointer", color: "rgba(255,255,255,0.7)", display: "flex" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              <div style={{ position: "absolute", top: -2, right: -2, width: 7, height: 7, borderRadius: "50%", background: "#facc15", border: "1.5px solid #0a0a0a" }} />
            </div>
          )}
          {!isMobile && (user ? (() => {
            const av = avatarForId(activeProfile?.avatar_id);
            return (
              <div onClick={onProfileOpen} title={activeProfile?.name ?? "Profile"} style={{ width: 36, height: 36, borderRadius: "50%", background: av?.gradient ?? "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: av ? 16 : 13, fontWeight: 700, cursor: "pointer", color: "#fff", flexShrink: 0, border: "2px solid transparent", transition: "border-color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#facc15"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}>
                {av ? av.emoji : (activeProfile?.name?.[0] || user.email[0]).toUpperCase()}
              </div>
            );
          })() : (
            <button onClick={onAuthOpen} style={{ background: "#facc15", border: "none", borderRadius: 6, padding: "8px 18px", color: "#0a0a0a", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Sign In</button>
          ))}
          {!isMobile && (
            <div onClick={() => window.location.href = "/admin"} title="Admin panel"
              style={{ width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg, #fde68a, #b45309)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>P</div>
          )}
          {isMobile && (
            <button onClick={() => setMenuOpen(m => !m)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", padding: 4 }}>
              {menuOpen
                ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
              }
            </button>
          )}
        </div>
      </nav>

      {/* Mobile nav drawer */}
      {isMobile && menuOpen && (
        <div style={{ position: "fixed", top: 68, left: 0, right: 0, bottom: 0, zIndex: 98, background: "rgba(10,10,10,0.98)", backdropFilter: "blur(16px)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
          <div style={{ padding: "12px 0" }}>
            {["Home", "Movies", "Series", "Podcasts", "New & Popular", "My List"].map(label => {
              const active = activeNav === label;
              return (
                <div key={label} onClick={() => { if (label === "My List" && !user) { onAuthOpen(); setMenuOpen(false); return; } setActiveNav(label); setMenuOpen(false); }}
                  style={{ padding: "16px 24px", fontSize: 17, fontWeight: active ? 600 : 400, color: active ? "#fff" : "rgba(255,255,255,0.6)", borderLeft: `3px solid ${active ? "#facc15" : "transparent"}`, cursor: "pointer" }}>
                  {label}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: "auto", padding: 24, borderTop: "1px solid #1a1a1a" }}>
            {user ? (
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                  {(user.user_metadata?.full_name?.[0] || user.email[0]).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 4px", fontSize: 14, color: "#fff", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.user_metadata?.full_name || user.email}</p>
                  <button onClick={() => { supabase.auth.signOut(); setMenuOpen(false); }} style={{ background: "none", border: "none", color: "#f87171", fontSize: 12, cursor: "pointer", padding: 0 }}>Sign Out</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { onAuthOpen(); setMenuOpen(false); }} style={{ width: "100%", background: "#facc15", border: "none", borderRadius: 8, padding: "14px", color: "#0a0a0a", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Sign In</button>
            )}
          </div>
        </div>
      )}

      {/* Search overlay */}
      {searchOpen && (
        <div style={{ position: "fixed", top: 68, left: 0, right: 0, zIndex: 99, background: "rgba(8,8,8,0.98)", backdropFilter: "blur(20px)", borderBottom: "1px solid #1a1a1a", maxHeight: "calc(100vh - 68px)", overflowY: "auto" }}>
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
                  <p style={{ color: "#333", fontSize: 14, padding: "20px 0" }}>No titles match. Try a different search or filter.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {searchResults.map(v => {
                      const typeColor = v._type === "movie" ? "#facc15" : v._type === "show" ? "#60a5fa" : "#a78bfa";
                      const typeLabel = v._type === "movie" ? "Movie" : v._type === "show" ? "Series" : "Podcast";
                      const thumb = v.poster || v.thumbnail || v.artwork_url;
                      const meta = v._type === "podcast" ? v._tagsStr : v.category;
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
              <p style={{ color: "#333", fontSize: 14, padding: "20px 0" }}>Start typing to search movies, series, and podcasts.</p>
            )}
          </div>
        </div>
      )}

      {/* Hero — hidden on catalog pages and Podcasts */}
      {activeNav !== "Movies" && activeNav !== "Series" && activeNav !== "Podcasts" && (
        loading ? (
          <div style={{ height: "85vh", display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner /></div>
        ) : featured ? (
          <HeroBanner video={featured} onPlay={featuredIsShow ? onShowSelect : onPlay} isShow={featuredIsShow} myList={myList} onToggleList={onToggleList} />
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

      {/* Content rows (Home / My List / New & Popular / Podcasts) */}
      {activeNav !== "Movies" && activeNav !== "Series" && !loading && (allContent.length > 0 || podcasts.length > 0 || liveStreams.filter(s => s.is_live).length > 0 || continueWatching.length > 0) && (
        <div style={{ position: "relative", zIndex: 1, marginTop: activeNav === "Podcasts" ? 0 : -60, paddingBottom: 80 }}>
          {activeNav === "Podcasts" && (
            <div style={{ padding: `48px ${PAD} 0` }}>
              <h1 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 400, color: "#fff" }}>Podcasts</h1>
              <p style={{ margin: "8px 0 0", fontSize: 14, color: "#555" }}>{podcasts.length} show{podcasts.length !== 1 ? "s" : ""}</p>
            </div>
          )}
          {liveStreams.filter(s => s.is_live).length > 0 && activeNav === "Home" && (
            <LiveSection streams={liveStreams.filter(s => s.is_live)} onPlay={onPlay} />
          )}
          {continueWatching.length > 0 && activeNav === "Home" && (
            <ContinueWatchingRow items={continueWatching} onPlay={onPlay} onRemove={handleRemoveCW} />
          )}
          {filteredContent.length === 0 && activeNav !== "My List" && activeNav !== "Podcasts" ? (
            <div style={{ padding: "100px 0", textAlign: "center", color: "#444", fontSize: 15 }}>
              No {activeNav.toLowerCase()} yet.
            </div>
          ) : sections.map(section => section.isPodcast ? (
            <PodcastRow key={section.id} section={section} onPodcastSelect={onPodcastSelect} />
          ) : section.videos.length > 0 ? (
            <ContentRow key={section.id} section={section} onPlay={onPlay} onShowSelect={onShowSelect} myList={myList} onToggleList={onToggleList} />
          ) : null)}
          {activeNav === "My List" && sections[0]?.videos.length === 0 && (
            <div style={{ padding: "100px 0", textAlign: "center", color: "#444", fontSize: 15 }}>
              Your list is empty — browse content and hit + List to save titles.
            </div>
          )}
          {activeNav === "Podcasts" && podcasts.length === 0 && (
            <div style={{ padding: "100px 0", textAlign: "center", color: "#444", fontSize: 15 }}>
              No podcasts yet — add one from the admin panel.
            </div>
          )}
        </div>
      )}

      <Footer onNavChange={setActiveNav} onProfileOpen={onProfileOpen} onOpenModal={setFooterModal} />
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
    const items = c.content_type === "movies" ? baseItems.filter(v => v._type === "movie")
      : c.content_type === "shows" ? baseItems.filter(v => v._type === "show")
      : baseItems;
    return { id: String(c.id), title: c.title, videos: items, numbered: c.type === "trending" };
  }).filter(s => s.videos.length > 0), [carousels, content]);

  return (
    <div style={{ paddingTop: 88, minHeight: "100vh" }}>
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

      {/* Browse all grid */}
      <div style={{ padding: `0 ${PAD}`, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: "clamp(16px, 1.4vw, 20px)", fontWeight: 600, color: "#e5e5e5" }}>
          Browse All
        </h2>
      </div>

      {displayed.length === 0 ? (
        <div style={{ padding: "80px 0", textAlign: "center", color: "#444", fontSize: 15 }}>
          No {type.toLowerCase()} in this genre yet.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? "130px" : "160px"}, 1fr))`, gap: isMobile ? 10 : 14, padding: `0 ${PAD} 80px` }}>
          {displayed.map(item => (
            <CatalogCard key={item.id + item._type} item={item}
              onClick={() => item._type === "show" ? onShowSelect(item) : onPlay(item)}
              myList={myList} onToggleList={onToggleList} />
          ))}
        </div>
      )}
    </div>
  );
}

function CatalogCard({ item, onClick, myList, onToggleList }) {
  const [hovered, setHovered] = useState(false);
  const inList = myList?.[`${item._type}_${item.id}`];

  return (
    <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ cursor: "pointer", borderRadius: 10, overflow: "hidden", background: "#141414", transform: hovered ? "scale(1.04) translateY(-4px)" : "scale(1)", transition: "transform 0.22s ease, box-shadow 0.22s ease", boxShadow: hovered ? "0 20px 48px rgba(0,0,0,0.8)" : "0 2px 8px rgba(0,0,0,0.3)" }}>
      <div style={{ position: "relative", aspectRatio: "2/3", overflow: "hidden" }}>
        <img src={item.poster || item.thumbnail} alt={item.title}
          style={{ width: "100%", height: "100%", objectFit: "cover", transition: "filter 0.22s", filter: hovered ? "brightness(0.45)" : "brightness(0.75)" }} />

        {/* Badges */}
        {item._type === "show"
          ? <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(59,130,246,0.9)", backdropFilter: "blur(4px)", color: "#fff", fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: 0.5, textTransform: "uppercase" }}>Series</div>
          : item.category && <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(250,204,21,0.85)", backdropFilter: "blur(4px)", color: "#0a0a0a", fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: 0.5, textTransform: "uppercase" }}>{item.category}</div>
        }
        {item.duration && <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", color: "#bbb", fontSize: 10.5, padding: "3px 7px", borderRadius: 4 }}>{item.duration}</div>}

        {/* Hover overlay */}
        {hovered && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#0a0a0a"><polygon points="5,3 19,12 5,21" /></svg>
            </div>
            <button onClick={e => { e.stopPropagation(); onToggleList?.(item.id, item._type); }}
              style={{ background: inList ? "rgba(250,204,21,0.2)" : "rgba(0,0,0,0.6)", border: `1px solid ${inList ? "rgba(250,204,21,0.6)" : "rgba(255,255,255,0.3)"}`, borderRadius: 20, padding: "5px 14px", color: inList ? "#facc15" : "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", backdropFilter: "blur(4px)" }}>
              {inList ? "✓ Saved" : "+ My List"}
            </button>
          </div>
        )}
      </div>

      <div style={{ padding: "10px 12px 12px", background: hovered ? "#1c1c1c" : "#141414", transition: "background 0.22s" }}>
        <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {item.score ? <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 600 }}>{item.score}%</span> : <span />}
          {item.year && <span style={{ fontSize: 11, color: "#555" }}>{item.year}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Hero Banner ──────────────────────────────────────────────────────────────

function HeroBanner({ video, onPlay, isShow, myList, onToggleList }) {
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
    const t = setTimeout(() => { setBgPlaying(true); startLoop(); }, 3000);
    return () => { clearTimeout(t); clearTimeout(pauseTimerRef.current); clearTimeout(loopTimerRef.current); };
  }, [video.id, hasBgTrailer]);

  // React doesn't reliably sync the muted DOM attribute via prop alone
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  function handleTrailerEnded() { doRestartCycle(); }

  return (
    <div style={{ position: "relative", height: "85vh", minHeight: 580, overflow: "hidden" }}>
      {trailerOpen && <TrailerModal url={video.trailer_url} title={video.title} onClose={() => setTrailerOpen(false)} />}

      {/* Thumbnail — fades out when trailer takes over */}
      <img src={video.thumbnail} alt={video.title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", filter: "brightness(0.45) saturate(1.15)", transition: "opacity 1.4s ease", opacity: bgPlaying ? 0 : 1 }} />

      {/* Background autoplay trailer */}
      {hasBgTrailer && (
        <video ref={videoRef} src={video.trailer_url} autoPlay muted playsInline onEnded={handleTrailerEnded}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", filter: "brightness(0.5)", transition: "opacity 1.4s ease", opacity: bgPlaying ? 1 : 0, pointerEvents: "none" }} />
      )}

      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.25) 45%, transparent 70%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0.45) 50%, transparent 80%)" }} />

      <div style={{ position: "absolute", bottom: isMobile ? "12%" : "16%", left: PAD, right: PAD, maxWidth: isMobile ? "100%" : "clamp(500px, 42vw, 720px)" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          {isShow
            ? <span style={{ background: "#3b82f6", color: "#fff", fontSize: 10, fontWeight: 700, padding: "4px 12px", borderRadius: 4, letterSpacing: 1.5, textTransform: "uppercase" }}>Series</span>
            : <span style={{ background: "#facc15", color: "#0a0a0a", fontSize: 10, fontWeight: 700, padding: "4px 12px", borderRadius: 4, letterSpacing: 1.5, textTransform: "uppercase" }}>Peep Original</span>
          }
          {video.category && <span style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", fontSize: 10, fontWeight: 600, padding: "4px 12px", borderRadius: 4, letterSpacing: 1, textTransform: "uppercase" }}>#1 in {video.category}</span>}
        </div>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(42px, 5vw, 80px)", lineHeight: 1.0, margin: "0 0 18px", fontWeight: 400, textShadow: "0 2px 24px rgba(0,0,0,0.5)" }}>{video.title}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
          {video.score && <span style={{ color: "#4ade80", fontSize: 14, fontWeight: 700 }}>{video.score}% Match</span>}
          {video.year && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{video.year}</span>}
          {video.rating && <span style={{ border: "1px solid rgba(255,255,255,0.28)", color: "rgba(255,255,255,0.5)", fontSize: 11, padding: "2px 7px", borderRadius: 3 }}>{video.rating}</span>}
          {video.duration && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{video.duration}</span>}
        </div>
        {video.description && <p style={{ fontSize: 15.5, color: "rgba(255,255,255,0.76)", lineHeight: 1.75, margin: "0 0 34px", textShadow: "0 1px 8px rgba(0,0,0,0.4)" }}>{video.description}</p>}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => onPlay(video)} style={{ background: "#fff", color: "#0a0a0a", border: "none", borderRadius: 7, padding: isMobile ? "12px 24px" : "14px 32px", fontSize: isMobile ? 14 : 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
            onMouseEnter={e => e.currentTarget.style.background = "#e5e5e5"}
            onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
            {isShow ? "Watch Now" : "Play"}
          </button>
          {video.trailer_url && (
            <button onClick={() => setTrailerOpen(true)}
              style={{ background: "rgba(109,109,110,0.65)", backdropFilter: "blur(4px)", color: "#fff", border: "none", borderRadius: 7, padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(109,109,110,0.85)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(109,109,110,0.65)"}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" /></svg>
              Trailer
            </button>
          )}
          {(() => {
            const type = isShow ? "show" : "movie";
            const inList = myList?.[`${type}_${video.id}`];
            return (
              <button onClick={() => onToggleList?.(video.id, type)}
                style={{ background: "rgba(109,109,110,0.65)", backdropFilter: "blur(4px)", color: "#fff", border: inList ? "1px solid rgba(250,204,21,0.6)" : "none", borderRadius: 7, padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                {inList ? "✓ My List" : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    My List
                  </>
                )}
              </button>
            );
          })()}
        </div>
      </div>

      {/* Mute / unmute */}
      {bgPlaying && hasBgTrailer && (
        <button onClick={() => setMuted(m => !m)}
          style={{ position: "absolute", bottom: "16%", right: PAD, background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: "50%", width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff", zIndex: 10, flexShrink: 0 }}>
          {muted
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
          }
        </button>
      )}
    </div>
  );
}

// ─── Content Row ──────────────────────────────────────────────────────────────

function ContentRow({ section, onPlay, onShowSelect, myList, onToggleList }) {
  const scrollRef = useRef(null);
  const scroll = dir => scrollRef.current?.scrollBy({ left: dir * scrollRef.current.clientWidth * 0.85, behavior: "smooth" });

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${PAD}`, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: "clamp(16px, 1.4vw, 20px)", fontWeight: 600, color: "#e5e5e5" }}>{section.title}</h2>
        <span style={{ fontSize: 13, color: "#facc15", cursor: "pointer", fontWeight: 500 }}>Explore All →</span>
      </div>
      <div style={{ position: "relative" }}>
        <button onClick={() => scroll(-1)} style={{ position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 10, background: "linear-gradient(to right, rgba(10,10,10,0.95), transparent)", border: "none", color: "#fff", width: 64, cursor: "pointer", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <button onClick={() => scroll(1)} style={{ position: "absolute", right: 0, top: 0, bottom: 0, zIndex: 10, background: "linear-gradient(to left, rgba(10,10,10,0.95), transparent)", border: "none", color: "#fff", width: 64, cursor: "pointer", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
        <div ref={scrollRef} className="scroll-row" style={{ display: "flex", gap: 12, overflowX: "auto", scrollbarWidth: "none", padding: `28px ${PAD} 32px` }}>
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
  const scroll = dir => scrollRef.current?.scrollBy({ left: dir * scrollRef.current.clientWidth * 0.8, behavior: "smooth" });

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
        <button onClick={() => scroll(-1)} style={{ position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 10, background: "linear-gradient(to right, rgba(10,10,10,0.95), transparent)", border: "none", color: "#fff", width: 64, cursor: "pointer", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <button onClick={() => scroll(1)} style={{ position: "absolute", right: 0, top: 0, bottom: 0, zIndex: 10, background: "linear-gradient(to left, rgba(10,10,10,0.95), transparent)", border: "none", color: "#fff", width: 64, cursor: "pointer", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
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
          <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(129,140,248,0.9)", backdropFilter: "blur(4px)", color: "#fff", fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: 0.5, textTransform: "uppercase" }}>Podcast</div>
          {podcast.episode_count && (
            <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", color: "#bbb", fontSize: 10, padding: "3px 7px", borderRadius: 4 }}>{podcast.episode_count} ep</div>
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
        <div style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 5, background: "#ef4444", borderRadius: 5, padding: "4px 10px" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 }}>{stream.badge_text || "LIVE"}</span>
        </div>
        {hovered && stream.stream_url && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(239,68,68,0.9)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(239,68,68,0.5)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><polygon points="5,3 19,12 5,21" /></svg>
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: "14px 16px" }}>
        <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600, color: "#fff" }}>{stream.title}</p>
        {stream.description && <p style={{ margin: 0, fontSize: 12, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stream.description}</p>}
      </div>
    </div>
  );
}

// ─── Continue Watching ────────────────────────────────────────────────────────

const CW_CARD_W = "clamp(200px, 26vw, 300px)";

function ContinueWatchingRow({ items, onPlay, onRemove }) {
  const scrollRef = useRef(null);
  const scroll = dir => scrollRef.current?.scrollBy({ left: dir * scrollRef.current.clientWidth * 0.85, behavior: "smooth" });
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: `0 ${PAD}`, marginBottom: 12 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <h2 style={{ margin: 0, fontSize: "clamp(16px, 1.4vw, 20px)", fontWeight: 600, color: "#e5e5e5" }}>Continue Watching</h2>
      </div>
      <div style={{ position: "relative" }}>
        <button onClick={() => scroll(-1)} style={{ position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 10, background: "linear-gradient(to right, rgba(10,10,10,0.95), transparent)", border: "none", color: "#fff", width: 64, cursor: "pointer", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <button onClick={() => scroll(1)} style={{ position: "absolute", right: 0, top: 0, bottom: 0, zIndex: 10, background: "linear-gradient(to left, rgba(10,10,10,0.95), transparent)", border: "none", color: "#fff", width: 64, cursor: "pointer", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
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
const TRAILER_INFO_H = 148;

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
    if (hasDirectTrailer) {
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
        <div style={{ position: "absolute", left: -10, bottom: 28, fontFamily: "'DM Serif Display', serif", fontSize: 96, lineHeight: 1, fontWeight: 400, color: "#0a0a0a", WebkitTextStroke: "2px #282828", userSelect: "none", zIndex: 0, pointerEvents: "none" }}>{rank}</div>
      )}
      <div onClick={onClick} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}
        style={{ cursor: "pointer", borderRadius: 8, overflow: "hidden", background: "#141414", transform: hovered ? "scale(1.05) translateY(-4px)" : "scale(1)", transformOrigin: "bottom center", transition: "transform 0.25s ease, box-shadow 0.25s ease", boxShadow: hovered ? "0 24px 50px rgba(0,0,0,0.75)" : "0 2px 8px rgba(0,0,0,0.3)", position: "relative", zIndex: hovered ? 10 : 1, marginLeft: rank ? 34 : 0 }}>
        <div style={{ position: "relative", aspectRatio: "2/3", overflow: "hidden" }}>
          <img src={video.poster || video.thumbnail} alt={video.title}
            style={{ width: "100%", height: "100%", objectFit: "cover", transition: "filter 0.25s", filter: hovered ? "brightness(0.5) saturate(1.1)" : "brightness(0.75)" }} />
          {hovered && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(255,255,255,0.92)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#0a0a0a"><polygon points="5,3 19,12 5,21" /></svg>
              </div>
            </div>
          )}
          {video._type === "show"
            ? <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(59,130,246,0.85)", backdropFilter: "blur(4px)", color: "#fff", fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: 0.5, textTransform: "uppercase" }}>Series</div>
            : video.category && <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(250,204,21,0.85)", backdropFilter: "blur(4px)", color: "#0a0a0a", fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: 0.5, textTransform: "uppercase" }}>{video.category}</div>
          }
          {video.duration && <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", color: "#bbb", fontSize: 10.5, padding: "3px 7px", borderRadius: 4 }}>{video.duration}</div>}
          {video._progress && video._progress.duration_seconds > 0 && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "rgba(0,0,0,0.5)" }}>
              <div style={{ height: "100%", background: "#facc15", width: `${Math.min(100, (video._progress.progress_seconds / video._progress.duration_seconds) * 100)}%` }} />
            </div>
          )}
        </div>
        <div style={{ padding: "12px 14px 14px", background: hovered ? "#1c1c1c" : "#141414", transition: "background 0.25s" }}>
          <p style={{ margin: "0 0 5px", fontSize: 13.5, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{video.title}</p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: hovered ? 12 : 0 }}>
            {video.score ? <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>{video.score}%</span> : <span />}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {video.view_count > 0 && <span style={{ fontSize: 10, color: "#444" }}>{fmtViews(video.view_count)}</span>}
              {video.year && <span style={{ fontSize: 11, color: "#666" }}>{video.year}</span>}
            </div>
          </div>
          {(hovered || isMobile) && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={e => { e.stopPropagation(); onToggleList?.(video.id, video._type); }}
                style={{ flex: 1, background: inList ? "rgba(250,204,21,0.15)" : "rgba(255,255,255,0.07)", border: `1px solid ${inList ? "rgba(250,204,21,0.4)" : "rgba(255,255,255,0.14)"}`, borderRadius: 5, color: inList ? "#facc15" : "#ccc", fontSize: 12, padding: "7px 0", cursor: "pointer", fontWeight: inList ? 600 : 400 }}>
                {inList ? "✓ Saved" : "+ List"}
              </button>
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
            <p style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{video.title}</p>

            {/* Metadata row */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              {video.score && <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 700 }}>{video.score}% Match</span>}
              {video.category && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5 }}>{video.category}</span>}
              {video.year && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{video.year}</span>}
              {video.rating && <span style={{ fontSize: 10, border: "1px solid rgba(255,255,255,0.3)", color: "rgba(255,255,255,0.5)", padding: "1px 5px", borderRadius: 3 }}>{video.rating}</span>}
              {video.duration && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{video.duration}</span>}
            </div>

            {/* Description */}
            {video.description && (
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{video.description}</p>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={e => { e.stopPropagation(); onClick(); }}
                style={{ flex: 1, background: "#fff", border: "none", borderRadius: 6, padding: "9px 0", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
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

function getEmbedUrl(url) {
  if (!url) return null;
  const match = url.match(/archive\.org\/download\/([^/]+)/);
  if (match) return `https://archive.org/embed/${match[1]}`;
  if (url.includes("archive.org/embed/")) return url;
  return null;
}

function PlayerView({ video, onBack, onSelect, onShowSelect, user, myList, onToggleList, onAuthOpen, activeProfile }) {
  const [allVideos, setAllVideos] = useState([]);
  const [allShows, setAllShows] = useState([]);
  const [nextEpisode, setNextEpisode] = useState(null);
  const [countdownActive, setCountdownActive] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const videoRef = useRef(null);
  const countdownTimerRef = useRef(null);

  const isEpisode = !!video.show_id;
  const [myRating, setMyRating] = useState(null);
  const [ratingCounts, setRatingCounts] = useState({ up: 0, down: 0 });
  const progressTimerRef = useRef(null);
  const viewCountedRef = useRef(false);
  const saveProgressRef = useRef(null);
  const [continueWatching, setContinueWatching] = useState([]);
  const playerContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const countdownGuardRef = useRef(false);

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

  useEffect(() => {
    if (!user || !activeProfile || getEmbedUrl(video.url)) return;
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

  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e) => { if (e.key === "Escape") toggleFullscreen(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  function toggleFullscreen() {
    setIsFullscreen(prev => {
      document.body.style.overflow = prev ? "" : "hidden";
      return !prev;
    });
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
    if (!nextEpisode || countdownGuardRef.current) return;
    const { currentTime, duration } = e.currentTarget;
    if (!duration || isNaN(duration)) return;
    if (duration - currentTime <= 10) {
      countdownGuardRef.current = true;
      startCountdown(duration - currentTime);
    }
  }

  async function handleEnded() {
    if (user && activeProfile && videoRef.current && !getEmbedUrl(video.url)) {
      const { currentTime, duration } = videoRef.current;
      if (duration > 0) {
        const ct = isEpisode ? "episode" : "movie";
        await supabase.from("watch_progress").upsert({ user_id: user.id, profile_id: activeProfile.id, content_id: video.id, content_type: ct, progress_seconds: currentTime, duration_seconds: duration, completed: true, last_watched_at: new Date().toISOString() }, { onConflict: "user_id,profile_id,content_id,content_type" });
      }
    }
    if (nextEpisode) { clearInterval(countdownTimerRef.current); onSelect(nextEpisode); }
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
    if (!user || !activeProfile || !videoRef.current || getEmbedUrl(video.url)) return;
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
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <nav style={{ position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", padding: `0 ${PAD}`, height: 68, gap: 24, background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#ccc", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22 }}><span style={{ color: "#facc15" }}>peep.</span></span>
      </nav>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: `40px ${PAD} 80px` }}>
        <style>{`video::-webkit-media-controls-fullscreen-button{display:none!important}`}</style>
        <div ref={playerContainerRef} style={isFullscreen ? { position: "fixed", inset: 0, zIndex: 999, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" } : { position: "relative", marginBottom: 30 }}>
          <div style={isFullscreen ? { position: "relative", width: "100%", height: "100%" } : { background: "#000", borderRadius: 14, overflow: "hidden", aspectRatio: "16/9", boxShadow: "0 32px 80px rgba(0,0,0,0.8)" }}>
            {getEmbedUrl(video.url) ? (
              <iframe src={getEmbedUrl(video.url)} style={{ width: "100%", height: "100%", display: "block", border: "none" }} allowFullScreen allow="autoplay" />
            ) : (
              <video ref={videoRef} controls controlsList="nofullscreen" autoPlay style={{ width: "100%", height: "100%", display: "block" }} poster={video.thumbnail}
                onTimeUpdate={handleTimeUpdate} onEnded={handleEnded} onLoadedMetadata={handleLoadedMetadata}>
                <source src={video.url} type="video/mp4" />
              </video>
            )}
          </div>
          {!getEmbedUrl(video.url) && (
            <button onClick={toggleFullscreen} style={{ position: "absolute", bottom: isFullscreen ? 60 : 12, right: 16, zIndex: 1000, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 7, padding: "7px 12px", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>
              {isFullscreen
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
              }
              {isFullscreen ? "Exit" : "Fullscreen"}
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
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 48 }}>
          <div style={{ flex: 1, maxWidth: 700 }}>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 38, margin: "0 0 14px", fontWeight: 400 }}>{video.title}</h1>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
              {video.score && <span style={{ color: "#4ade80", fontWeight: 700, fontSize: 14 }}>{video.score}% Match</span>}
              {video.year && <span style={{ color: "#666", fontSize: 13 }}>{video.year}</span>}
              {video.rating && <span style={{ border: "1px solid #2e2e2e", color: "#666", fontSize: 11, padding: "2px 8px", borderRadius: 4 }}>{video.rating}</span>}
              {video.duration && <span style={{ color: "#666", fontSize: 13 }}>{video.duration}</span>}
              <span style={{ background: "#1a1a1a", border: "1px solid #222", color: "#777", fontSize: 11, padding: "3px 10px", borderRadius: 4, fontWeight: 600, letterSpacing: 0.5 }}>FREE</span>
            </div>
            {video.description && <p style={{ fontSize: 15, color: "#888", lineHeight: 1.8, margin: 0 }}>{video.description}</p>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginLeft: 48, minWidth: 150 }}>
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
            <button style={{ background: "#1a1a1a", border: "1px solid #242424", borderRadius: 7, padding: "12px 20px", color: "#777", fontSize: 13, cursor: "pointer" }}>Share</button>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
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

function ShowDetail({ show, onBack, onPlay, onShowSelect, user, myList, onToggleList, onAuthOpen, activeProfile }) {
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
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* ── Hero ── */}
      <div style={{ position: "relative", height: isMobile ? "65vh" : "72vh", minHeight: 480, overflow: "hidden" }}>
        <img src={show.thumbnail || show.poster} alt={show.title}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", filter: "brightness(0.28) saturate(1.15)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.1) 58%, transparent 78%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(10,10,10,0.97) 0%, rgba(10,10,10,0.5) 55%, transparent 85%)" }} />

        {/* Top nav row */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", alignItems: "center", padding: `20px ${PAD}`, gap: 24, zIndex: 10 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#ccc", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
            Back
          </button>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22 }}><span style={{ color: "#facc15" }}>peep.</span></span>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
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

function PodcastDetail({ podcast, onBack, onPlay, user, activeProfile }) {
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
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* ── Hero ── */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        {/* Blurred background */}
        {podcast.artwork_url && (
          <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${podcast.artwork_url})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(40px) brightness(0.25) saturate(1.4)", transform: "scale(1.1)" }} />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(10,10,10,0.4) 0%, #0a0a0a 100%)" }} />

        {/* Nav */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", padding: `20px ${PAD}`, gap: 24, zIndex: 10 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#ccc", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
            Back
          </button>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22 }}><span style={{ color: "#facc15" }}>peep.</span></span>
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

function PodcastPlayerView({ episode, podcast, onBack, onSelect, user, activeProfile }) {
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
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* Blurred background */}
      {podcast.artwork_url && (
        <div style={{ position: "fixed", inset: 0, backgroundImage: `url(${podcast.artwork_url})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(60px) brightness(0.15) saturate(1.5)", transform: "scale(1.1)", zIndex: 0 }} />
      )}
      <div style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.7)", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Nav */}
        <nav style={{ display: "flex", alignItems: "center", padding: `0 ${PAD}`, height: 68, gap: 24, background: "rgba(10,10,10,0.5)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#ccc", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
            Back
          </button>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22 }}><span style={{ color: "#facc15" }}>peep.</span></span>
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

function ProfilePage({ user, activeProfile, onBack, onProfileUpdate }) {
  const [history, setHistory] = useState([]);
  const [contentMap, setContentMap] = useState({});
  const [showsMap, setShowsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(activeProfile?.bio || "");
  const [bannerUrl, setBannerUrl] = useState(activeProfile?.banner_url || "");
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile();
  const av = avatarForId(activeProfile?.avatar_id);

  useEffect(() => { fetchData(); }, [activeProfile?.id]);

  async function fetchData() {
    setLoading(true);
    const [progressRes, videosRes, showsRes, episodesRes, podEpRes, podRes] = await Promise.all([
      supabase.from("watch_progress").select("*").eq("user_id", user.id).eq("profile_id", activeProfile.id).order("last_watched_at", { ascending: false }),
      supabase.from("videos").select("id, title, thumbnail_url, category, year"),
      supabase.from("shows").select("id, title, thumbnail_url, category"),
      supabase.from("episodes").select("id, title, thumbnail_url, show_id, season, episode_number"),
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
    await supabase.from("viewer_profiles").update({ bio: bio.trim(), banner_url: bannerUrl.trim() }).eq("id", activeProfile.id);
    setSaving(false);
    setEditing(false);
    onProfileUpdate?.({ ...activeProfile, bio: bio.trim(), banner_url: bannerUrl.trim() });
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

  const banner = bannerUrl || activeProfile?.banner_url;

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* Nav */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, display: "flex", alignItems: "center", padding: `0 ${PAD}`, height: 68, gap: 24, background: "rgba(10,10,10,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#ccc", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22 }}><span style={{ color: "#facc15" }}>peep.</span></span>
      </nav>

      {/* Banner */}
      <div style={{ marginTop: 68, position: "relative", height: isMobile ? 160 : 240, overflow: "hidden", background: banner ? "transparent" : "linear-gradient(135deg, #0f0f1a, #1a1a2e)" }}>
        {banner && <img src={banner} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.55 }} />}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 30%, #0a0a0a 100%)" }} />
      </div>

      {/* Profile header */}
      <div style={{ padding: `0 ${PAD}`, marginTop: -52, position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ width: isMobile ? 80 : 100, height: isMobile ? 80 : 100, borderRadius: "50%", background: av?.gradient ?? "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 32 : 40, border: "4px solid #0a0a0a", flexShrink: 0 }}>
            {av?.emoji ?? "?"}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 6 }}>
            <h1 style={{ margin: "0 0 3px", fontSize: isMobile ? 22 : 28, fontWeight: 700, color: "#fff" }}>{activeProfile?.name}</h1>
            <p style={{ margin: 0, fontSize: 13, color: "#444" }}>{user?.email}</p>
          </div>
          <button onClick={() => { setEditing(e => !e); setBio(activeProfile?.bio || ""); setBannerUrl(activeProfile?.banner_url || ""); }}
            style={{ background: editing ? "rgba(250,204,21,0.12)" : "rgba(255,255,255,0.06)", border: `1px solid ${editing ? "rgba(250,204,21,0.3)" : "#2a2a2a"}`, borderRadius: 8, padding: "8px 18px", color: editing ? "#facc15" : "#aaa", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0, alignSelf: "center" }}>
            {editing ? "Cancel" : "Edit Profile"}
          </button>
        </div>

        {/* Bio display */}
        {!editing && activeProfile?.bio && (
          <p style={{ margin: "0 0 24px", fontSize: 14, color: "#888", maxWidth: 600, lineHeight: 1.7 }}>{activeProfile.bio}</p>
        )}

        {/* Edit form */}
        {editing && (
          <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: 20, maxWidth: 600, marginBottom: 28 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Bio</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={200} placeholder="Write something about yourself..." style={{ width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#333", textAlign: "right" }}>{bio.length}/200</p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Banner Image URL</label>
              <input type="text" value={bannerUrl} onChange={e => setBannerUrl(e.target.value)} placeholder="https://..." style={{ width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <button onClick={saveProfile} disabled={saving} style={{ background: "#facc15", border: "none", borderRadius: 8, padding: "10px 24px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ padding: `8px ${PAD} 32px` }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 3}, 1fr)`, gap: 12, maxWidth: 640 }}>
          {[
            { label: "Hours Watched", value: totalHours > 0 ? `${totalHours}h ${totalMinutes}m` : totalMinutes > 0 ? `${totalMinutes}m` : "0m" },
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
      <div style={{ padding: `0 ${PAD} 80px`, maxWidth: 860 }}>
        <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 600, color: "#e5e5e5" }}>Watch History</h2>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner /></div>
        ) : enriched.length === 0 ? (
          <p style={{ color: "#444", fontSize: 14 }}>Nothing watched yet.</p>
        ) : enriched.map(h => {
          const c = h.content;
          const pct = h.duration_seconds > 0 ? Math.min(100, Math.round((h.progress_seconds / h.duration_seconds) * 100)) : 0;
          const thumb = c.thumbnail_url || c.thumbnail;
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
    <footer style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: `56px ${PAD} 40px`, fontFamily: "'Space Grotesk', sans-serif" }}>
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

// ─── Email Verification Gate ──────────────────────────────────────────────────

function EmailVerificationGate({ user }) {
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState(null);

  async function handleResend() {
    setResending(true);
    setError(null);
    const { error } = await supabase.auth.resend({ type: "signup", email: user.email });
    setResending(false);
    if (error) setError(error.message);
    else setResent(true);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Space Grotesk', sans-serif", padding: 24 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
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

function Spinner() {
  return (
    <div style={{ width: 32, height: 32, border: "3px solid #222", borderTop: "3px solid #facc15", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
