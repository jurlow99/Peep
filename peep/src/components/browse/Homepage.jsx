import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../../supabase";
import { avatarForId } from "../ProfileScreen";
import { PAD, CARD_W, SAFE_TOP } from "../../lib/theme";
import { useIsMobile } from "../../hooks/useIsMobile";
import { contentSelect } from "../../lib/contentQueries";

import { NotifBell } from "./NotifBell";
import {
  HeroBanner,
  CatalogPage,
  CatalogCard,
  PodcastRow,
  ContinueWatchingRow,
  LiveSection,
  ContentRow,
} from "./BrowseWidgets";
import { Footer } from "./Footer";
import { Spinner } from "../ui/Spinner";
import { LiveTVPage } from "../../pages/LiveTV";

export function Homepage({ onPlay, onShowSelect, onPodcastSelect, user, myList, onToggleList, onAuthOpen, onProfileOpen, userAvatarId, activeProfile, onSwitchProfile }) {
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
      supabase.from("videos").select(contentSelect.videosBrowse).order("id", { ascending: true }),
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
      movieIds.length ? supabase.from("videos").select(contentSelect.videosBrowse).in("id", movieIds) : { data: [] },
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
          <span onClick={() => setActiveNav("Home")} style={{ display: "inline-flex", alignItems: "flex-end", gap: 5, userSelect: "none", cursor: "pointer" }}>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, letterSpacing: "-0.5px", color: "#facc15", lineHeight: 1 }}>peep.</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: "#0a0a0a", background: "#facc15", borderRadius: 4, padding: "2px 5px", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4, lineHeight: 1.4 }}>BETA</span>
          </span>
          {!isMobile && (
            <div style={{ display: "flex", gap: 4 }}>
              {["Home", "Movies", "Series", "Streams", "Podcasts"].map(label => {
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

      {/* Streams tab */}
      {activeNav === "Streams" && !loading && (
        <LiveTVPage streams={liveStreams} user={user} streamsLoading={loading} />
      )}

      {/* Content rows (Home / Movies / Series / My List) */}
      {activeNav !== "Movies" && activeNav !== "Series" && activeNav !== "My List" && activeNav !== "Podcasts" && activeNav !== "Streams" && !loading && (allContent.length > 0 || continueWatching.length > 0) && (
        <div style={{ position: "relative", zIndex: 1, marginTop: 0, paddingBottom: 80 }}>
          {continueWatching.length > 0 && activeNav === "Home" && (
            <ContinueWatchingRow items={continueWatching} onPlay={onPlay} onRemove={handleRemoveCW} />
          )}
          {activeNav === "Home" && liveStreams.filter(s => s.is_live).length > 0 && (
            <LiveSection streams={liveStreams.filter(s => s.is_live)} />
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
            { id: "Streams", label: "Streams", icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 7.76a6 6 0 0 0 0 8.49"/><path d="M20.66 3.34a12 12 0 0 1 0 17.32"/><path d="M3.34 3.34a12 12 0 0 0 0 17.32"/></svg> },
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