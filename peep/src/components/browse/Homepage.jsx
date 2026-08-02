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
  ContentRow,
} from "./BrowseWidgets";
import { Footer } from "./Footer";
import { Spinner } from "../ui/Spinner";
import { LiveTVPage } from "../../pages/LiveTV";

export function Homepage({ onPlay, onShowSelect, onPodcastSelect, onChannelPlay, user, myList, onToggleList, onAuthOpen, onProfileOpen, userAvatarId, userName, onGoLive, onExitStudio, studioContent, flags = {}, isPremiumUser = false }) {
  const [videos, setVideos] = useState([]);
  const [shows, setShows] = useState([]);
  const [carousels, setCarousels] = useState([]);
  const [podcasts, setPodcasts] = useState([]);
  const [watchRows, setWatchRows] = useState([]); // recent watch_progress, for Continue Watching / Recommended rows
  const [liveStreams, setLiveStreams] = useState([]);
  const [epgEntries, setEpgEntries] = useState([]);
  const [channels, setChannels] = useState([]);
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


  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 150);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Recent watch history — powers Continue Watching / Recommended carousel types
  useEffect(() => {
    if (!user?.id) { setWatchRows([]); return; }
    supabase.from("watch_progress")
      .select("content_id, content_type, progress_seconds, completed, last_watched_at")
      .eq("user_id", user.id).order("last_watched_at", { ascending: false }).limit(50)
      .then(({ data }) => setWatchRows(data || []));
  }, [user?.id]);

  async function fetchAll() {
    const epgWindowStart = new Date(Date.now() - 60 * 60 * 1000);
    const epgWindowEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [videosRes, showsRes, carouselsRes, podcastsRes, liveRes, epgRes, channelsRes] = await Promise.all([
      supabase.from("videos").select(contentSelect.videosBrowse).order("id", { ascending: true }),
      supabase.from("shows").select("*").order("id", { ascending: true }),
      supabase.from("carousels").select("*").eq("enabled", true).order("position", { ascending: true }),
      supabase.from("podcasts").select("*").order("id", { ascending: true }),
      supabase.from("live_streams").select("*").or("is_live.eq.true,listed.eq.true").order("id", { ascending: true }),
      supabase.from("epg_entries").select("*").gte("end_time", epgWindowStart.toISOString()).lte("start_time", epgWindowEnd.toISOString()).order("start_time", { ascending: true }),
      supabase.from("channels").select("*").eq("is_active", true).order("sort_order"),
    ]);
    if (videosRes.data) setVideos(videosRes.data);
    if (showsRes.data) setShows(showsRes.data);
    if (carouselsRes.data) setCarousels(carouselsRes.data);
    if (podcastsRes.data) setPodcasts(podcastsRes.data.filter(p => p.enabled !== false));
    if (liveRes.error) {
      const { data: fallback } = await supabase.from("live_streams").select("*").order("id", { ascending: true });
      if (fallback) setLiveStreams(fallback);
    } else if (liveRes.data) {
      setLiveStreams(liveRes.data);
    }
    if (epgRes.data) setEpgEntries(epgRes.data);
    if (channelsRes.data) setChannels(channelsRes.data);
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

  // Continue Watching — in-progress movies from watch history (newest first)
  const continueItems = useMemo(() => {
    if (!watchRows.length) return [];
    const movieById = {};
    allContent.forEach(v => { if (v._type === "movie") movieById[String(v.id)] = v; });
    const seen = new Set();
    const out = [];
    for (const r of watchRows) {
      if (r.completed || r.content_type !== "movie") continue; // movies map by uuid; episodes need show lookup
      const v = movieById[String(r.content_id)];
      if (v && !seen.has(v.id)) { seen.add(v.id); out.push(v); }
    }
    return out;
  }, [watchRows, allContent]);

  // Recommended — titles sharing a category with the last watched (or a saved) title
  const recommendedItems = useMemo(() => {
    const movieById = {};
    allContent.forEach(v => { if (v._type === "movie") movieById[String(v.id)] = v; });
    let seed = null;
    for (const r of watchRows) { const v = movieById[String(r.content_id)]; if (v) { seed = v; break; } }
    if (!seed) seed = allContent.find(v => myList?.[`${v._type}_${v.id}`]);
    if (!seed?.category) return [];
    return allContent.filter(v => v.category === seed.category && !(v.id === seed.id && v._type === seed._type));
  }, [watchRows, allContent, myList]);

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
          : c.type === "recommended"
          ? recommendedItems
          : c.type === "continue"
          ? continueItems
          : c.type === "category"
          ? filteredContent.filter(v => v.category?.toLowerCase() === filterVal)
          : c.type === "handpicked"
          ? (() => { try { const picks = JSON.parse(c.filter_value || "[]"); return picks.flatMap(p => { const found = filteredContent.find(v => v.id === p.id && v._type === p.type); return found ? [found] : []; }); } catch { return filteredContent; } })()
          : filteredContent;
        const items = c.content_type === "shorts" ? baseItems.filter(v => v._type === "movie")
          : c.content_type === "shows" ? baseItems.filter(v => v._type === "show")
          : baseItems;
        return { id: String(c.id), title: c.title, videos: items, layout: c.layout || (c.type === "trending" ? "top10" : "standard"), numbered: c.type === "trending" };
      }).filter(s => s.isPodcast ? s.podcastItems.length > 0 : s.videos.length > 0)
    : visibleCarousels.length === 0 && carousels.length > 0 ? []
    : [
        { id: "trending", title: "Trending Now", videos: [...filteredContent].reverse(), numbered: true, layout: "top10" },
        ...[...new Set(filteredContent.map(v => v.category).filter(Boolean))].map(cat => ({
          id: cat, title: `${cat} Films`, videos: filteredContent.filter(v => v.category === cat),
        })),
      ],
  [activeNav, allContent, filteredContent, visibleCarousels, podcasts, carousels, myList, continueItems, recommendedItems]);

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

  const [sbExpanded, setSbExpanded] = useState(false);
  const SB_W = 76;
  const SB_EXPANDED = 210;
  const liveNow = liveStreams.filter(s => s.is_live);
  // Live TV channels for the unified "Live Now" row, with their current program
  const liveChannels = (channels || []).filter(c => c.is_active !== false);
  const nowByChannel = {};
  {
    const t = Date.now();
    (epgEntries || []).forEach(e => {
      if (new Date(e.start_time).getTime() <= t && new Date(e.end_time).getTime() > t) nowByChannel[e.channel_id] = e;
    });
  }
  const liveNowEnabled = flags.live_now_home !== false;

  const SB_ITEMS = [
    { id: "Home",    label: "Home",    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { id: "Movies",  label: "Movies",  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg> },
    { id: "Series",  label: "Series",  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg> },
    { id: "Streams", label: "Live TV", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 7.76a6 6 0 0 0 0 8.49"/><path d="M20.66 3.34a12 12 0 0 1 0 17.32"/><path d="M3.34 3.34a12 12 0 0 0 0 17.32"/></svg>, badge: liveNow.length > 0 },
    { id: "Podcasts",label: "Podcasts",icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> },
    { id: "My List", label: "My List", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> },
  ];


  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>
      <style>{`
        .scroll-row::-webkit-scrollbar { display: none; }
        .sb-item { transition: background 0.15s, color 0.15s; }
        .sb-item:hover { background: rgba(255,255,255,0.06) !important; color: #fff !important; }
        @keyframes livepulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.3)} }
      `}</style>

      {/* ── LEFT SIDEBAR (desktop only) ── */}
      {!isMobile && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 200,
            width: SB_W,
            background: "#0a0a0a",
            borderRight: "1px solid rgba(255,255,255,0.05)",
            display: "flex", flexDirection: "column",
            transition: "width 0.2s ease",
            overflow: "hidden",
          }}>
          {/* Logo area */}
          <div style={{ height: 58, display: "flex", alignItems: "center", paddingLeft: sbExpanded ? 20 : 0, justifyContent: sbExpanded ? "flex-start" : "center", flexShrink: 0, cursor: "pointer" }} onClick={() => { onExitStudio?.(); setActiveNav("Home"); }}>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: "#facc15", whiteSpace: "nowrap" }}>peep.</span>
          </div>

          {/* Nav items */}
          <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 0" }}>
            {SB_ITEMS.filter(item => item.id !== "Podcasts" || flags.show_podcasts !== false).map(item => {
              const active = !studioContent && activeNav === item.id;
              return (
                <div key={item.id} className="sb-item"
                  onClick={() => { if (item.id === "My List" && !user) { onAuthOpen(); return; } onExitStudio?.(); setActiveNav(item.id); }}
                  style={{
                    display: "flex", flexDirection: sbExpanded ? "row" : "column", alignItems: "center", gap: sbExpanded ? 14 : 4,
                    padding: sbExpanded ? "11px 20px" : "10px 0",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: active ? "#facc15" : "rgba(255,255,255,0.5)",
                    background: active ? "rgba(250,204,21,0.06)" : "transparent",
                    borderLeft: active ? "3px solid #facc15" : "3px solid transparent",
                    position: "relative",
                  }}>
                  <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{item.icon}</div>
                  {item.badge && (
                    <div style={{ position: "absolute", top: 8, left: sbExpanded ? 30 : 36, width: 7, height: 7, borderRadius: "50%", background: "#ef4444", border: "2px solid #0a0a0a" }} />
                  )}
                  <span style={{ fontSize: sbExpanded ? 14 : 9.5, fontWeight: active ? 600 : 400, whiteSpace: "nowrap", letterSpacing: sbExpanded ? 0 : 0.2 }}>{item.label}</span>
                  {sbExpanded && item.badge && liveNow.length > 0 && (
                    <span style={{ marginLeft: "auto", background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 4, padding: "1px 5px" }}>{liveNow.length} LIVE</span>
                  )}
                </div>
              );
            })}

            {/* Go Live */}
            {user && (
              <div className="sb-item" onClick={() => onGoLive?.()} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: sbExpanded ? "11px 20px" : "11px 0",
                justifyContent: sbExpanded ? "flex-start" : "center",
                cursor: "pointer",
                color: studioContent ? "#facc15" : "rgba(250,204,21,0.6)",
                background: studioContent ? "rgba(250,204,21,0.06)" : "transparent",
                borderLeft: studioContent ? "3px solid #facc15" : "3px solid transparent",
                marginTop: 4,
              }}>
                <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                </div>
                {sbExpanded && <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>Channel</span>}
              </div>
            )}

            {/* Live channel avatars */}
            {sbExpanded && liveNow.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <p style={{ margin: "0 0 8px", paddingLeft: 20, fontSize: 10, fontWeight: 700, color: "#333", textTransform: "uppercase", letterSpacing: 1 }}>Live Now</p>
                {liveNow.slice(0, 6).map(s => {
                  const slug = s.username || (s.channel_name || s.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                  const name = s.channel_name || s.title || "";
                  return (
                    <a key={s.id} href={`/stream/${slug}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 20px", textDecoration: "none", color: "rgba(255,255,255,0.6)", fontSize: 13 }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "#fff"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg, #312e81, #6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", overflow: "hidden", position: "relative" }}>
                        {s.avatar_url ? <img src={s.avatar_url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : name[0]?.toUpperCase()}
                        <div style={{ position: "absolute", bottom: 0, right: 0, width: 8, height: 8, borderRadius: "50%", background: "#ef4444", border: "2px solid #0a0a0a" }} />
                      </div>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </nav>

          {/* Bottom: Settings */}
          {user && (
            <div className="sb-item" onClick={onProfileOpen} style={{ display: "flex", alignItems: "center", gap: 14, padding: sbExpanded ? "14px 20px" : "14px 0", justifyContent: sbExpanded ? "flex-start" : "center", cursor: "pointer", color: "rgba(255,255,255,0.4)", borderTop: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              {sbExpanded && <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>Settings</span>}
            </div>
          )}
        </div>
      )}

      {/* ── MAIN CONTENT AREA ── */}
      <div style={{ marginLeft: isMobile ? 0 : SB_W }}>

        {/* Top navbar — logo hidden (in sidebar), just search + user */}
        <nav style={{
          position: "fixed", top: 0, left: isMobile ? 0 : SB_W, right: 0, zIndex: 100, height: 58,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          paddingLeft: isMobile ? 16 : 24, paddingRight: isMobile ? 16 : 24,
          background: "rgba(10,10,10,0.96)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}>
          {/* Mobile logo */}
          {isMobile && (
            <span onClick={() => { onExitStudio?.(); setActiveNav("Home"); }} style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: "#facc15", cursor: "pointer", userSelect: "none" }}>peep.</span>
          )}
          {!isMobile && <div />}

          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 18 }}>
            {/* Search — always-visible box with placeholder */}
            <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
              <svg style={{ position: "absolute", left: 12, pointerEvents: "none", color: "rgba(255,255,255,0.5)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={e => { if (e.key === "Escape") { closeSearch(); e.currentTarget.blur(); } if (e.key === "Enter" && searchResults[0]) handleSearchResultClick(searchResults[0]); }}
                onBlur={() => { if (!searchQuery) closeSearch(); }}
                placeholder={isMobile ? "Search…" : "Search titles, channels, podcasts…"}
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 14px 8px 36px", color: "#fff", fontSize: 13, width: isMobile ? "min(52vw, 200px)" : 300, outline: "none" }}
              />
            </div>
            <NotifBell user={user} />
            {user ? (() => {
              const av = avatarForId(userAvatarId);
              return (
                <div onClick={onProfileOpen} style={{ width: 34, height: 34, borderRadius: "50%", background: av?.svg ? "none" : (av?.gradient ?? "linear-gradient(135deg,#6366f1,#8b5cf6)"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, cursor: "pointer", color: "#fff", flexShrink: 0, border: "2px solid transparent", transition: "border-color 0.15s", overflow: "hidden" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#facc15"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}>
                  {av?.svg ? <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: av.svg }} /> : (av ? av.emoji : (userName?.[0] || user.email?.[0] || "?").toUpperCase())}
                </div>
              );
            })() : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={onAuthOpen} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 6, padding: "7px 14px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>Sign In</button>
                <button onClick={() => { window.location.href = "/signup"; }} style={{ background: "#facc15", border: "none", borderRadius: 6, padding: "7px 16px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>Sign Up</button>
              </div>
            )}
        </div>
      </nav>

      {/* ── CONTENT (below nav) ── */}
      <div style={{ paddingTop: isMobile ? "calc(max(env(safe-area-inset-top), 44px) + 58px)" : 58 }}>

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

      {/* Studio — replaces browse content when active */}
      {studioContent && studioContent}

      {/* Hero — Home only */}
      {!studioContent && activeNav === "Home" && (
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
      {!studioContent && (activeNav === "Movies" || activeNav === "Series") && !loading && (
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
      {!studioContent && activeNav === "My List" && !loading && (
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
      {!studioContent && activeNav === "Podcasts" && !loading && (
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
      {!studioContent && activeNav === "Streams" && !loading && (
        <LiveTVPage streams={liveStreams} channels={channels} epgEntries={epgEntries} onChannelPlay={onChannelPlay} user={user} streamsLoading={loading} />
      )}

      {/* ── LIVE NOW STRIP (Home tab) — live TV channels + live streamers ── */}
      {!studioContent && activeNav === "Home" && liveNowEnabled && (liveChannels.length > 0 || liveNow.length > 0) && !loading && (
        <div style={{ padding: `24px ${PAD} 0` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", letterSpacing: "0.1em", textTransform: "uppercase" }}>Live Now</span>
            <span style={{ fontSize: 12, color: "#333" }}>{liveChannels.length + liveNow.length} live</span>
          </div>
          <div className="scroll-row" style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4 }}>
            {liveChannels.map(ch => {
              const nowAiring = nowByChannel[ch.id];
              const hero = ch.hero_url || "";
              const logo = ch.logo_url || "";
              return (
                <div key={`ch-${ch.id}`} onClick={() => onChannelPlay?.(ch)}
                  style={{ flexShrink: 0, width: isMobile ? 180 : 220, cursor: "pointer", borderRadius: 10, overflow: "hidden", background: "#0f0f0f", border: "1px solid rgba(239,68,68,0.15)", transition: "transform 0.15s, border-color 0.15s, box-shadow 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(239,68,68,0.1)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.15)"; e.currentTarget.style.boxShadow = "none"; }}>
                  <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", background: "linear-gradient(135deg, #0c1a2e, #12385f)" }}>
                    {hero
                      ? <img src={hero} alt={ch.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : logo
                      ? <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                          <img src={logo} alt={ch.name} style={{ maxWidth: "72%", maxHeight: "58%", objectFit: "contain" }} />
                        </div>
                      : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" opacity="0.4"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>
                        </div>}
                    {/* top scrim keeps LIVE/TV badges legible over any art */}
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 36, background: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", top: 7, left: 7, display: "flex", alignItems: "center", gap: 4, background: "#ef4444", borderRadius: 4, padding: "2px 7px" }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite" }} />
                      <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", letterSpacing: 0.6 }}>LIVE</span>
                    </div>
                    <div style={{ position: "absolute", top: 7, right: 7, background: "rgba(0,0,0,0.6)", borderRadius: 4, padding: "2px 7px", fontSize: 9, fontWeight: 700, color: "#38bdf8", letterSpacing: 0.5 }}>TV</div>
                  </div>
                  <div style={{ padding: "9px 10px", minWidth: 0 }}>
                    <p style={{ margin: "0 0 1px", fontSize: 12, fontWeight: 700, color: "#e8e8e8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</p>
                    <p style={{ margin: 0, fontSize: 11, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nowAiring ? nowAiring.title : (ch.description || "Live TV")}</p>
                  </div>
                </div>
              );
            })}
            {liveNow.map(s => {
              const slug = s.username || (s.channel_name || s.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
              const name = s.channel_name || s.title || "";
              return (
                <a key={s.id} href={`/stream/${slug}`}
                  style={{ flexShrink: 0, width: isMobile ? 180 : 220, textDecoration: "none", color: "inherit", borderRadius: 10, overflow: "hidden", background: "#0f0f0f", border: "1px solid rgba(239,68,68,0.15)", transition: "transform 0.15s, border-color 0.15s, box-shadow 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(239,68,68,0.1)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.15)"; e.currentTarget.style.boxShadow = "none"; }}>
                  <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", background: "#111" }}>
                    {s.thumbnail || s.hero_image
                      ? <img src={s.thumbnail || s.hero_image} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1a0505, #3a0808)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="#ef4444" opacity="0.25"><polygon points="5,3 19,12 5,21"/></svg>
                        </div>
                    }
                    <div style={{ position: "absolute", top: 7, left: 7, display: "flex", alignItems: "center", gap: 4, background: "#ef4444", borderRadius: 4, padding: "2px 7px" }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite" }} />
                      <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", letterSpacing: 0.6 }}>LIVE</span>
                    </div>
                  </div>
                  <div style={{ padding: "9px 10px", display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg, #312e81, #6d28d9)", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", outline: "2px solid #ef4444", outlineOffset: 1 }}>
                      {s.avatar_url ? <img src={s.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : name[0]?.toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: "0 0 1px", fontSize: 12, fontWeight: 700, color: "#e8e8e8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
                      {s.stream_title && <p style={{ margin: 0, fontSize: 11, color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.stream_title}</p>}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* Content rows (Home / Movies / Series / My List) */}
      {!studioContent && activeNav !== "Movies" && activeNav !== "Series" && activeNav !== "My List" && activeNav !== "Podcasts" && activeNav !== "Streams" && !loading && allContent.length > 0 && (
        <div style={{ position: "relative", zIndex: 1, marginTop: 0, paddingBottom: 80 }}>
          {filteredContent.length === 0 ? (
            <div style={{ padding: "100px 0", textAlign: "center", color: "#444", fontSize: 15 }}>
              No {activeNav.toLowerCase()} yet.
            </div>
          ) : sections.map(section => section.videos.length > 0 ? (
            <ContentRow key={section.id} section={section} onPlay={onPlay} onShowSelect={onShowSelect} myList={myList} onToggleList={onToggleList} isPremiumUser={isPremiumUser} />
          ) : null)}
        </div>
      )}

      </div>{/* end content wrapper */}
      </div>{/* end main area */}

      {isMobile && <div style={{ height: 72 }} />}
      <Footer onNavChange={tab => { onExitStudio?.(); setActiveNav(tab); }} onProfileOpen={onProfileOpen} onOpenModal={setFooterModal} />

      {/* Mobile bottom tab bar */}
      {isMobile && (
        <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: "rgba(10,10,10,0.97)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", height: 60, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          {[
            { id: "Home", label: "Home", icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
            { id: "Movies", label: "Movies", icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg> },
            { id: "Series", label: "Series", icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg> },
            { id: "Streams", label: "Live TV", icon: <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 7.76a6 6 0 0 0 0 8.49"/><path d="M20.66 3.34a12 12 0 0 1 0 17.32"/><path d="M3.34 3.34a12 12 0 0 0 0 17.32"/></svg> },
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