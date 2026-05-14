import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import { AuthModal } from "./components/AuthModal";

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
  const [user, setUser] = useState(null);
  const [myList, setMyList] = useState({});
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadMyList(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadMyList(session.user.id);
      else setMyList({});
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadMyList(userId) {
    const { data } = await supabase.from("user_list").select("content_id, content_type").eq("user_id", userId);
    if (data) {
      const map = {};
      data.forEach(item => { map[`${item.content_type}_${item.content_id}`] = true; });
      setMyList(map);
    }
  }

  async function toggleList(contentId, contentType) {
    if (!user) { setAuthOpen(true); return; }
    const key = `${contentType}_${contentId}`;
    if (myList[key]) {
      await supabase.from("user_list").delete().eq("user_id", user.id).eq("content_id", contentId).eq("content_type", contentType);
      setMyList(prev => { const next = { ...prev }; delete next[key]; return next; });
    } else {
      await supabase.from("user_list").insert({ user_id: user.id, content_id: contentId, content_type: contentType });
      setMyList(prev => ({ ...prev, [key]: true }));
    }
  }

  const listProps = { user, myList, onToggleList: toggleList, onAuthOpen: () => setAuthOpen(true) };

  if (page === "player" && selectedVideo)
    return (
      <>
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
        <PlayerView
          video={selectedVideo}
          onBack={() => { setPage(selectedShow ? "show" : "home"); setSelectedVideo(null); }}
          onSelect={v => setSelectedVideo(v)}
          onShowSelect={s => { setSelectedShow(s); setPage("show"); setSelectedVideo(null); }}
          {...listProps}
        />
      </>
    );

  if (page === "show" && selectedShow)
    return (
      <>
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
        <ShowDetail
          show={selectedShow}
          onBack={() => { setSelectedShow(null); setPage("home"); }}
          onPlay={v => { setSelectedVideo(v); setPage("player"); }}
          onShowSelect={s => setSelectedShow(s)}
          {...listProps}
        />
      </>
    );

  return (
    <>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      <Homepage
        onPlay={v => { setSelectedVideo(v); setPage("player"); }}
        onShowSelect={s => { setSelectedShow(s); setPage("show"); }}
        {...listProps}
      />
    </>
  );
}

// ─── Homepage ─────────────────────────────────────────────────────────────────

function Homepage({ onPlay, onShowSelect, user, myList, onToggleList, onAuthOpen }) {
  const [videos, setVideos] = useState([]);
  const [shows, setShows] = useState([]);
  const [carousels, setCarousels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeNav, setActiveNav] = useState("Home");
  const [menuOpen, setMenuOpen] = useState(false);
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

    const handler = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handler);

    return () => {
      supabase.removeChannel(videoChannel);
      supabase.removeChannel(showChannel);
      supabase.removeChannel(carouselChannel);
      window.removeEventListener("scroll", handler);
    };
  }, []);

  async function fetchAll() {
    const [videosRes, showsRes, carouselsRes] = await Promise.all([
      supabase.from("videos").select("*").order("id", { ascending: true }),
      supabase.from("shows").select("*").order("id", { ascending: true }),
      supabase.from("carousels").select("*").eq("enabled", true).order("position", { ascending: true }),
    ]);
    if (videosRes.data) setVideos(videosRes.data);
    if (showsRes.data) setShows(showsRes.data);
    if (carouselsRes.data) setCarousels(carouselsRes.data);
    setLoading(false);
  }

  const allContent = [
    ...videos.map(v => ({ ...v, _type: "movie" })),
    ...shows.map(s => ({ ...s, _type: "show" })),
  ];

  const filteredContent = activeNav === "Movies"
    ? allContent.filter(v => v._type === "movie")
    : activeNav === "Series"
    ? allContent.filter(v => v._type === "show")
    : allContent;

  const featuredVideo = videos.find(v => v.featured) ?? null;
  const featuredShow = shows.find(s => s.featured) ?? null;
  const featured = featuredVideo ?? featuredShow ?? videos[0] ?? shows[0] ?? null;
  const featuredIsShow = featured !== null && featured === (featuredShow ?? null) && !featuredVideo;

  const visibleCarousels = carousels.filter(c => {
    const ct = c.content_type || "all";
    if (ct === "all") return true;
    if (ct === "movies" && (activeNav === "Movies" || activeNav === "Home")) return true;
    if (ct === "shows" && (activeNav === "Series" || activeNav === "Home")) return true;
    return false;
  });

  const sections = activeNav === "My List"
    ? [{ id: "mylist", title: "My List", videos: allContent.filter(v => myList?.[`${v._type}_${v.id}`]) }]
    : activeNav === "New & Popular"
    ? [{ id: "new", title: "New & Popular", videos: [...allContent].sort((a, b) => (b.year || 0) - (a.year || 0)) }]
    : visibleCarousels.length > 0
    ? visibleCarousels.map(c => {
        const filterVal = c.filter_value?.toLowerCase();
        const items = c.type === "trending"
          ? [...filteredContent].reverse()
          : c.type === "category"
          ? filteredContent.filter(v => v.category?.toLowerCase() === filterVal)
          : filteredContent;
        return { id: String(c.id), title: c.title, videos: items, numbered: c.type === "trending" };
      }).filter(s => s.videos.length > 0)
    : visibleCarousels.length === 0 && carousels.length > 0 ? []
    : [
        { id: "trending", title: "Trending Now", videos: [...filteredContent].reverse(), numbered: true },
        ...[...new Set(filteredContent.map(v => v.category).filter(Boolean))].map(cat => ({
          id: cat, title: `${cat} Films`, videos: filteredContent.filter(v => v.category === cat),
        })),
      ];

  const searchResults = searchQuery
    ? allContent.filter(v => {
        const q = searchQuery.toLowerCase();
        return v.title?.toLowerCase().includes(q) ||
          v.category?.toLowerCase().includes(q) ||
          v.description?.toLowerCase().includes(q) ||
          (Array.isArray(v.tags) ? v.tags.some(t => t.toLowerCase().includes(q)) : v.tags?.toLowerCase().includes(q));
      })
    : [];

  function handleClick(item) {
    item._type === "show" ? onShowSelect(item) : onPlay(item);
  }

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#fff" }}>
      <style>{`.scroll-row::-webkit-scrollbar { display: none; }`}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />

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
            peep<span style={{ color: "#ff4d4d" }}>.</span>
          </span>
          {!isMobile && (
            <div style={{ display: "flex", gap: 4 }}>
              {["Home", "Movies", "Series", "New & Popular"].map(label => {
                const active = activeNav === label;
                return (
                  <span key={label} onClick={() => setActiveNav(label)} style={{ fontSize: 13.5, padding: "6px 12px", borderRadius: 6, color: active ? "#fff" : "rgba(255,255,255,0.55)", fontWeight: active ? 600 : 400, cursor: "pointer", background: active ? "rgba(255,77,77,0.12)" : "transparent", transition: "color 0.2s, background 0.2s" }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.color = "rgba(255,255,255,0.55)"; e.currentTarget.style.background = "transparent"; } }}
                  >{label}</span>
                );
              })}
              <span onClick={() => { if (!user) { onAuthOpen(); return; } setActiveNav("My List"); }}
                style={{ fontSize: 13.5, padding: "6px 12px", borderRadius: 6, cursor: "pointer", color: activeNav === "My List" ? "#fff" : "rgba(255,255,255,0.55)", fontWeight: activeNav === "My List" ? 600 : 400, background: activeNav === "My List" ? "rgba(255,77,77,0.12)" : "transparent", transition: "color 0.2s, background 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = activeNav === "My List" ? "#fff" : "rgba(255,255,255,0.55)"; e.currentTarget.style.background = activeNav === "My List" ? "rgba(255,77,77,0.12)" : "transparent"; }}
              >My List</span>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 14 : 20 }}>
          <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
            {searchOpen && (
              <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                onBlur={() => { if (!searchQuery) setSearchOpen(false); }}
                placeholder="Search titles, genres..."
                style={{ background: "rgba(15,15,15,0.92)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 6, padding: "8px 14px 8px 38px", color: "#fff", fontSize: 13, width: isMobile ? "calc(100vw - 110px)" : 240, outline: "none" }}
              />
            )}
            <div onClick={() => setSearchOpen(o => !o)} style={{ position: searchOpen ? "absolute" : "relative", left: searchOpen ? 11 : 0, cursor: "pointer", color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            </div>
          </div>
          {!isMobile && (
            <div style={{ position: "relative", cursor: "pointer", color: "rgba(255,255,255,0.7)", display: "flex" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              <div style={{ position: "absolute", top: -2, right: -2, width: 7, height: 7, borderRadius: "50%", background: "#ff4d4d", border: "1.5px solid #0a0a0a" }} />
            </div>
          )}
          {!isMobile && (user ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div title={user.email} style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, cursor: "default", color: "#fff", flexShrink: 0 }}>
                {(user.user_metadata?.full_name?.[0] || user.email[0]).toUpperCase()}
              </div>
              <button onClick={() => supabase.auth.signOut()} style={{ background: "transparent", border: "1px solid #2a2a2a", borderRadius: 6, padding: "6px 12px", color: "#666", fontSize: 12, cursor: "pointer" }}>Sign Out</button>
            </div>
          ) : (
            <button onClick={onAuthOpen} style={{ background: "#ff4d4d", border: "none", borderRadius: 6, padding: "8px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Sign In</button>
          ))}
          {!isMobile && (
            <div onClick={() => window.location.href = "/admin"} title="Admin panel"
              style={{ width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg, #ff6b6b, #cc2222)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>P</div>
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
            {["Home", "Movies", "Series", "New & Popular", "My List"].map(label => {
              const active = activeNav === label;
              return (
                <div key={label} onClick={() => { if (label === "My List" && !user) { onAuthOpen(); setMenuOpen(false); return; } setActiveNav(label); setMenuOpen(false); }}
                  style={{ padding: "16px 24px", fontSize: 17, fontWeight: active ? 600 : 400, color: active ? "#fff" : "rgba(255,255,255,0.6)", borderLeft: `3px solid ${active ? "#ff4d4d" : "transparent"}`, cursor: "pointer" }}>
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
              <button onClick={() => { onAuthOpen(); setMenuOpen(false); }} style={{ width: "100%", background: "#ff4d4d", border: "none", borderRadius: 8, padding: "14px", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Sign In</button>
            )}
          </div>
        </div>
      )}

      {/* Search overlay */}
      {searchQuery && (
        <div style={{ position: "fixed", top: 68, left: 0, right: 0, zIndex: 99, background: "rgba(10,10,10,0.97)", backdropFilter: "blur(16px)", padding: `24px ${PAD} 32px`, borderBottom: "1px solid #1a1a1a", maxHeight: "70vh", overflowY: "auto" }}>
          <p style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>{searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for "{searchQuery}"</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 14 }}>
            {searchResults.map(v => (
              <div key={v.id + v._type} onClick={() => { handleClick(v); setSearchQuery(""); setSearchOpen(false); }}
                style={{ cursor: "pointer", borderRadius: 8, overflow: "hidden", background: "#141414", border: "1px solid #1e1e1e" }}>
                <div style={{ aspectRatio: "2/3", position: "relative" }}>
                  <img src={v.poster || v.thumbnail} alt={v.title} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.72)" }} />
                  {v._type === "show" && <div style={{ position: "absolute", top: 6, left: 6, background: "rgba(59,130,246,0.9)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>Series</div>}
                </div>
                <div style={{ padding: "10px 12px" }}>
                  <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 600, color: "#e5e5e5" }}>{v.title}</p>
                  <span style={{ fontSize: 11, color: "#555" }}>{v.category} · {v.year}</span>
                </div>
              </div>
            ))}
            {searchResults.length === 0 && <p style={{ color: "#444", fontSize: 14 }}>No titles match.</p>}
          </div>
        </div>
      )}

      {/* Hero */}
      {loading ? (
        <div style={{ height: "85vh", display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner /></div>
      ) : featured ? (
        <HeroBanner video={featured} onPlay={featuredIsShow ? onShowSelect : onPlay} isShow={featuredIsShow} myList={myList} onToggleList={onToggleList} />
      ) : (
        <div style={{ height: "85vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "#555", fontSize: 15 }}>No content yet.</p>
        </div>
      )}

      {/* Content rows */}
      {!loading && allContent.length > 0 && (
        <div style={{ position: "relative", zIndex: 1, marginTop: -60, paddingBottom: 80 }}>
          {filteredContent.length === 0 && activeNav !== "My List" ? (
            <div style={{ padding: "100px 0", textAlign: "center", color: "#444", fontSize: 15 }}>
              No {activeNav.toLowerCase()} yet.
            </div>
          ) : sections.map(section => section.videos.length > 0 ? (
            <ContentRow key={section.id} section={section} onPlay={onPlay} onShowSelect={onShowSelect} myList={myList} onToggleList={onToggleList} />
          ) : null)}
          {activeNav === "My List" && sections[0]?.videos.length === 0 && (
            <div style={{ padding: "100px 0", textAlign: "center", color: "#444", fontSize: 15 }}>
              Your list is empty — browse content and hit + List to save titles.
            </div>
          )}
        </div>
      )}

      <Footer />
    </div>
  );
}

// ─── Hero Banner ──────────────────────────────────────────────────────────────

function HeroBanner({ video, onPlay, isShow, myList, onToggleList }) {
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [bgPlaying, setBgPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef(null);

  const isMobile = useIsMobile();
  const hasBgTrailer = !!video.trailer_url && getTrailerType(video.trailer_url) === "direct";

  useEffect(() => {
    setBgPlaying(false);
    setMuted(true);
    if (!hasBgTrailer) return;
    const t = setTimeout(() => setBgPlaying(true), 3000);
    return () => clearTimeout(t);
  }, [video.id, hasBgTrailer]);

  // React doesn't reliably sync the muted DOM attribute via prop alone
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  return (
    <div style={{ position: "relative", height: "85vh", minHeight: 580, overflow: "hidden" }}>
      {trailerOpen && <TrailerModal url={video.trailer_url} title={video.title} onClose={() => setTrailerOpen(false)} />}

      {/* Thumbnail — fades out when trailer takes over */}
      <img src={video.thumbnail} alt={video.title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", filter: "brightness(0.45) saturate(1.15)", transition: "opacity 1.4s ease", opacity: bgPlaying ? 0 : 1 }} />

      {/* Background autoplay trailer */}
      {hasBgTrailer && (
        <video ref={videoRef} src={video.trailer_url} autoPlay muted loop playsInline
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", filter: "brightness(0.5)", transition: "opacity 1.4s ease", opacity: bgPlaying ? 1 : 0, pointerEvents: "none" }} />
      )}

      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.25) 45%, transparent 70%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0.45) 50%, transparent 80%)" }} />

      <div style={{ position: "absolute", bottom: isMobile ? "12%" : "16%", left: PAD, right: PAD, maxWidth: isMobile ? "100%" : "clamp(500px, 42vw, 720px)" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          {isShow
            ? <span style={{ background: "#3b82f6", color: "#fff", fontSize: 10, fontWeight: 700, padding: "4px 12px", borderRadius: 4, letterSpacing: 1.5, textTransform: "uppercase" }}>Series</span>
            : <span style={{ background: "#ff4d4d", color: "#fff", fontSize: 10, fontWeight: 700, padding: "4px 12px", borderRadius: 4, letterSpacing: 1.5, textTransform: "uppercase" }}>Peep Original</span>
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
                style={{ background: "rgba(109,109,110,0.65)", backdropFilter: "blur(4px)", color: "#fff", border: inList ? "1px solid rgba(255,77,77,0.6)" : "none", borderRadius: 7, padding: "14px 28px", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
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
        <span style={{ fontSize: 13, color: "#ff4d4d", cursor: "pointer", fontWeight: 500 }}>Explore All →</span>
      </div>
      <div style={{ position: "relative" }}>
        <button onClick={() => scroll(-1)} style={{ position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 10, background: "linear-gradient(to right, rgba(10,10,10,0.95), transparent)", border: "none", color: "#fff", width: 64, cursor: "pointer", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
        <button onClick={() => scroll(1)} style={{ position: "absolute", right: 0, top: 0, bottom: 0, zIndex: 10, background: "linear-gradient(to left, rgba(10,10,10,0.95), transparent)", border: "none", color: "#fff", width: 64, cursor: "pointer", fontSize: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
        <div ref={scrollRef} className="scroll-row" style={{ display: "flex", gap: 12, overflowX: "auto", scrollbarWidth: "none", padding: `10px ${PAD} 32px` }}>
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

// ─── Video Card ───────────────────────────────────────────────────────────────

function VideoCard({ video, onClick, rank, myList, onToggleList }) {
  const [hovered, setHovered] = useState(false);
  const isMobile = useIsMobile();
  const inList = myList?.[`${video._type}_${video.id}`];

  return (
    <div style={{ position: "relative", flexShrink: 0, width: rank ? `calc(${CARD_W} + 40px)` : CARD_W }}>
      {rank && (
        <div style={{ position: "absolute", left: -10, bottom: 28, fontFamily: "'DM Serif Display', serif", fontSize: 96, lineHeight: 1, fontWeight: 400, color: "#0a0a0a", WebkitTextStroke: "2px #282828", userSelect: "none", zIndex: 0, pointerEvents: "none" }}>{rank}</div>
      )}
      <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
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
            : video.category && <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(255,77,77,0.85)", backdropFilter: "blur(4px)", color: "#fff", fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: 0.5, textTransform: "uppercase" }}>{video.category}</div>
          }
          {video.duration && <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", color: "#bbb", fontSize: 10.5, padding: "3px 7px", borderRadius: 4 }}>{video.duration}</div>}
        </div>
        <div style={{ padding: "12px 14px 14px", background: hovered ? "#1c1c1c" : "#141414", transition: "background 0.25s" }}>
          <p style={{ margin: "0 0 5px", fontSize: 13.5, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{video.title}</p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: hovered ? 12 : 0 }}>
            {video.score ? <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>{video.score}%</span> : <span />}
            {video.year && <span style={{ fontSize: 11, color: "#666" }}>{video.year}</span>}
          </div>
          {(hovered || isMobile) && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={e => { e.stopPropagation(); onToggleList?.(video.id, video._type); }}
                style={{ flex: 1, background: inList ? "rgba(255,77,77,0.15)" : "rgba(255,255,255,0.07)", border: `1px solid ${inList ? "rgba(255,77,77,0.4)" : "rgba(255,255,255,0.14)"}`, borderRadius: 5, color: inList ? "#ff4d4d" : "#ccc", fontSize: 12, padding: "7px 0", cursor: "pointer", fontWeight: inList ? 600 : 400 }}>
                {inList ? "✓ Saved" : "+ List"}
              </button>
            </div>
          )}
        </div>
      </div>
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

function PlayerView({ video, onBack, onSelect, onShowSelect, user, myList, onToggleList, onAuthOpen }) {
  const [allVideos, setAllVideos] = useState([]);
  const [allShows, setAllShows] = useState([]);

  useEffect(() => {
    Promise.all([
      supabase.from("videos").select("*"),
      supabase.from("shows").select("*"),
    ]).then(([vRes, sRes]) => {
      if (vRes.data) setAllVideos(vRes.data);
      if (sRes.data) setAllShows(sRes.data);
    });
  }, []);

  const isEpisode = !!video.show_id;
  const allRelatable = [
    ...allVideos.map(v => ({ ...v, _type: "movie" })),
    ...allShows.map(s => ({ ...s, _type: "show" })),
  ];
  const related = !isEpisode && video.category
    ? allRelatable.filter(v => v.category === video.category && !(v._type === "movie" && v.id === video.id))
    : [];

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#fff" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <nav style={{ position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", padding: `0 ${PAD}`, height: 68, gap: 24, background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#ccc", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22 }}>peep<span style={{ color: "#ff4d4d" }}>.</span></span>
      </nav>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: `40px ${PAD} 80px` }}>
        <div style={{ background: "#000", borderRadius: 14, overflow: "hidden", marginBottom: 30, aspectRatio: "16/9", boxShadow: "0 32px 80px rgba(0,0,0,0.8)" }}>
          {getEmbedUrl(video.url) ? (
            <iframe src={getEmbedUrl(video.url)} style={{ width: "100%", height: "100%", display: "block", border: "none" }} allowFullScreen allow="autoplay" />
          ) : (
            <video controls autoPlay style={{ width: "100%", height: "100%", display: "block" }} poster={video.thumbnail}>
              <source src={video.url} type="video/mp4" />
            </video>
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
                  style={{ background: inList ? "rgba(255,77,77,0.15)" : "#ff4d4d", border: inList ? "1px solid rgba(255,77,77,0.4)" : "none", borderRadius: 7, padding: "12px 20px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: type === "episode" ? "default" : "pointer", opacity: type === "episode" ? 0.4 : 1 }}>
                  {inList ? "✓ In My List" : "+ My List"}
                </button>
              );
            })()}
            <button style={{ background: "#1a1a1a", border: "1px solid #242424", borderRadius: 7, padding: "12px 20px", color: "#777", fontSize: 13, cursor: "pointer" }}>Share</button>
          </div>
        </div>

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

// ─── Show Detail ──────────────────────────────────────────────────────────────

function ShowDetail({ show, onBack, onPlay, onShowSelect, user, myList, onToggleList, onAuthOpen }) {
  const [episodes, setEpisodes] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState([]);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
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

    if (show.category) {
      Promise.all([
        supabase.from("shows").select("*").eq("category", show.category).neq("id", show.id).limit(6),
        supabase.from("videos").select("*").eq("category", show.category).limit(6),
      ]).then(([sRes, vRes]) => {
        setRelated([
          ...(sRes.data || []).map(s => ({ ...s, _type: "show" })),
          ...(vRes.data || []).map(v => ({ ...v, _type: "movie" })),
        ]);
      });
    }
  }, [show.id]);

  const seasons = [...new Set(episodes.map(e => e.season))].sort((a, b) => a - b);
  const seasonEpisodes = episodes.filter(e => e.season === selectedSeason);

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#fff" }}>
      {trailerOpen && <TrailerModal url={show.trailer_url} title={show.title} onClose={() => setTrailerOpen(false)} />}
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      <div style={{ position: "relative", height: "60vh", minHeight: 420, overflow: "hidden" }}>
        <img src={show.thumbnail || show.poster} alt={show.title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", filter: "brightness(0.35) saturate(1.1)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.2) 50%, transparent 70%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(10,10,10,0.9) 0%, transparent 60%)" }} />

        <button onClick={onBack} style={{ position: "absolute", top: 24, left: PAD, background: "rgba(255,255,255,0.07)", border: "none", color: "#ccc", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6, zIndex: 10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
        <span style={{ position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)", fontFamily: "'DM Serif Display', serif", fontSize: 22, zIndex: 10 }}>peep<span style={{ color: "#ff4d4d" }}>.</span></span>

        <div style={{ position: "absolute", bottom: "10%", left: PAD, right: PAD, maxWidth: isMobile ? "100%" : "clamp(400px, 40vw, 660px)" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <span style={{ background: "#3b82f6", color: "#fff", fontSize: 10, fontWeight: 700, padding: "4px 12px", borderRadius: 4, letterSpacing: 1.5, textTransform: "uppercase" }}>Series</span>
            {show.category && <span style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", fontSize: 10, fontWeight: 600, padding: "4px 12px", borderRadius: 4, letterSpacing: 1, textTransform: "uppercase" }}>{show.category}</span>}
          </div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(36px, 4vw, 68px)", lineHeight: 1.0, margin: "0 0 14px", fontWeight: 400 }}>{show.title}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
            {show.score && <span style={{ color: "#4ade80", fontSize: 14, fontWeight: 700 }}>{show.score}% Match</span>}
            {show.year && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{show.year}</span>}
            {show.rating && <span style={{ border: "1px solid rgba(255,255,255,0.28)", color: "rgba(255,255,255,0.5)", fontSize: 11, padding: "2px 7px", borderRadius: 3 }}>{show.rating}</span>}
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{seasons.length} Season{seasons.length !== 1 ? "s" : ""} · {episodes.length} Episode{episodes.length !== 1 ? "s" : ""}</span>
          </div>
          {show.description && <p style={{ fontSize: 15, color: "rgba(255,255,255,0.72)", lineHeight: 1.75, margin: "0 0 28px" }}>{show.description}</p>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {episodes.length > 0 && (
              <button onClick={() => onPlay(episodes[0])} style={{ background: "#fff", color: "#0a0a0a", border: "none", borderRadius: 7, padding: "13px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                onMouseEnter={e => e.currentTarget.style.background = "#e5e5e5"}
                onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
                Play S1 E1
              </button>
            )}
            {show.trailer_url && (
              <button onClick={() => setTrailerOpen(true)}
                style={{ background: "rgba(109,109,110,0.65)", backdropFilter: "blur(4px)", color: "#fff", border: "none", borderRadius: 7, padding: "13px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
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
                  style={{ background: inList ? "rgba(255,77,77,0.2)" : "rgba(109,109,110,0.65)", backdropFilter: "blur(4px)", color: "#fff", border: inList ? "1px solid rgba(255,77,77,0.5)" : "none", borderRadius: 7, padding: "13px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  {inList ? "✓ In My List" : "+ My List"}
                </button>
              );
            })()}
          </div>
        </div>
      </div>

      <div style={{ padding: `40px ${PAD} 80px`, maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Episodes</h2>
          {seasons.length > 1 && (
            <div style={{ display: "flex", gap: 8 }}>
              {seasons.map(s => (
                <button key={s} onClick={() => setSelectedSeason(s)}
                  style={{ background: selectedSeason === s ? "#ff4d4d" : "#1a1a1a", border: `1px solid ${selectedSeason === s ? "#ff4d4d" : "#2a2a2a"}`, borderRadius: 6, padding: "8px 18px", color: selectedSeason === s ? "#fff" : "#888", fontSize: 13, fontWeight: selectedSeason === s ? 600 : 400, cursor: "pointer" }}>
                  Season {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner /></div>
        ) : seasonEpisodes.length === 0 ? (
          <p style={{ color: "#555", fontSize: 15 }}>No episodes added yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {seasonEpisodes.map(ep => <EpisodeRow key={ep.id} episode={ep} show={show} onPlay={onPlay} />)}
          </div>
        )}

        {related.length > 0 && (
          <div style={{ marginTop: 56 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 20px", color: "#e5e5e5" }}>More Like This</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
              {related.map(item => (
                <div key={item.id + item._type} onClick={() => item._type === "show" ? onShowSelect?.(item) : onPlay(item)}
                  style={{ cursor: "pointer", borderRadius: 10, overflow: "hidden", background: "#141414", border: "1px solid #1a1a1a", transition: "transform 0.2s, box-shadow 0.2s" }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.03)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.6)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}>
                  <div style={{ aspectRatio: "2/3", overflow: "hidden", position: "relative" }}>
                    <img src={item.poster || item.thumbnail} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.7)" }} />
                    {item._type === "show" && <div style={{ position: "absolute", top: 6, left: 6, background: "rgba(59,130,246,0.85)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>Series</div>}
                  </div>
                  <div style={{ padding: "12px 14px" }}>
                    <p style={{ margin: "0 0 4px", fontSize: 13.5, fontWeight: 600, color: "#e5e5e5" }}>{item.title}</p>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      {item.score && <span style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>{item.score}%</span>}
                      {item.year && <span style={{ fontSize: 11, color: "#555" }}>{item.year}</span>}
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

function EpisodeRow({ episode, show, onPlay }) {
  const [hovered, setHovered] = useState(false);
  const isMobile = useIsMobile();
  return (
    <div onClick={() => onPlay(episode)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", gap: isMobile ? 12 : 20, padding: isMobile ? "12px 8px" : "16px 20px", borderRadius: 10, cursor: "pointer", background: hovered ? "#141414" : "transparent", transition: "background 0.2s", alignItems: "center" }}>
      <div style={{ flexShrink: 0, fontSize: 16, color: "#333", fontWeight: 700, width: 22, textAlign: "center" }}>{episode.episode_number}</div>
      <div style={{ width: isMobile ? 100 : 160, aspectRatio: "16/9", flexShrink: 0, borderRadius: 6, overflow: "hidden", background: "#1a1a1a", position: "relative" }}>
        <img src={episode.thumbnail || show.thumbnail} alt={episode.title} style={{ width: "100%", height: "100%", objectFit: "cover", filter: hovered ? "brightness(0.6)" : "brightness(0.8)", transition: "filter 0.2s" }} onError={e => { e.target.style.display = "none"; }} />
        {hovered && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#0a0a0a"><polygon points="5,3 19,12 5,21" /></svg>
            </div>
          </div>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#e5e5e5" }}>{episode.title}</p>
          {episode.duration && <span style={{ fontSize: 12, color: "#555", flexShrink: 0, marginLeft: 16 }}>{episode.duration}</span>}
        </div>
        {episode.description && <p style={{ margin: 0, fontSize: 13, color: "#666", lineHeight: 1.6 }}>{episode.description}</p>}
      </div>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  const isMobile = useIsMobile();
  return (
    <footer style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: `56px ${PAD} 40px`, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: "flex", gap: 28, marginBottom: 40, flexWrap: "wrap" }}>
        {["Twitter / X", "Instagram", "YouTube", "TikTok", "Facebook"].map(s => (
          <span key={s} style={{ fontSize: 13, color: "#666", cursor: "pointer" }} onMouseEnter={e => e.target.style.color = "#ccc"} onMouseLeave={e => e.target.style.color = "#666"}>{s}</span>
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
              <p key={l} style={{ fontSize: 12.5, color: "#3e3e3e", margin: "0 0 10px", cursor: "pointer" }} onMouseEnter={e => e.target.style.color = "#aaa"} onMouseLeave={e => e.target.style.color = "#3e3e3e"}>{l}</p>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: "#2e2e2e" }}>peep<span style={{ color: "#ff4d4d" }}>.</span></span>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: "0 0 4px", fontSize: 11, color: "#333" }}>© 2025 Peep Media, Inc. All rights reserved.</p>
          <p style={{ margin: 0, fontSize: 11, color: "#2a2a2a" }}>All content sourced from the public domain. Free to watch, forever.</p>
        </div>
      </div>
    </footer>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{ width: 32, height: 32, border: "3px solid #222", borderTop: "3px solid #ff4d4d", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
