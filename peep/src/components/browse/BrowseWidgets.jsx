import { useState, useEffect, useRef, useMemo } from "react";
import { PAD, CARD_W } from "../../lib/theme";
import { useIsMobile } from "../../hooks/useIsMobile";
import { getTrailerType, TrailerModal } from "../../lib/playerUtils";
import { PREF_AUTOPLAY_HERO, PREF_AUTOPLAY_PREVIEWS } from "../../pages/settingsHelpers";

export function CatalogPage({ type, content, carousels = [], podcasts = [], onPlay, onShowSelect, myList, onToggleList }) {
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

export function CatalogCard({ item, onClick, myList, onToggleList }) {
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

export function HeroBanner({ video, onPlay, isShow, myList, onToggleList, categoryRank }) {
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

      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #0a0a0a 0%, rgba(10,10,10,0.55) 38%, transparent 72%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0.5) 48%, transparent 82%)" }} />

      <div style={{ position: "absolute", bottom: isMobile ? "12%" : "16%", left: PAD, right: PAD, maxWidth: isMobile ? "100%" : "clamp(400px, 38vw, 600px)", zIndex: 3 }}>

        {/* Featured label — solid yellow so it stands out */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#facc15", border: "none", borderRadius: 20, padding: "5px 14px", marginBottom: 18, boxShadow: "0 2px 12px rgba(250,204,21,0.35)" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#0a0a0a", flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: "#0a0a0a", letterSpacing: 1.2, textTransform: "uppercase" }}>
            {isShow ? "Featured Series" : video.category === "podcast" ? "Featured Podcast" : video.category ? video.category : "Featured"}
          </span>
        </div>

        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(40px, 5.5vw, 82px)", lineHeight: 1.04, margin: "0 0 14px", fontWeight: 900, letterSpacing: "-0.03em" }}>{video.title}</h1>

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

export function ContentRow({ section, onPlay, onShowSelect, myList, onToggleList }) {
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

export function PodcastRow({ section, onPodcastSelect }) {
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

export function LiveSection({ streams }) {
  return (
    <div style={{ marginBottom: 16, padding: `0 ${PAD}` }}>
      <style>{`@keyframes livepulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(1.3); } }`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite" }} />
        <h2 style={{ margin: 0, fontSize: "clamp(16px, 1.4vw, 20px)", fontWeight: 600, color: "#e5e5e5" }}>Live Now</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {streams.map(s => <LiveCard key={s.id} stream={s} />)}
      </div>
    </div>
  );
}

function LiveCard({ stream }) {
  const [hovered, setHovered] = useState(false);
  const slug = stream.username || (stream.channel_name || stream.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const name = stream.channel_name || stream.title || "";
  const initial = name[0]?.toUpperCase() || "?";
  const CATEGORY_LABELS = { general: "General", gaming: "Gaming", talk: "Talk", irl: "IRL", sports: "Sports", education: "Education", creative: "Creative" };
  return (
    <a href={`/stream/${slug}`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ display: "block", textDecoration: "none", color: "inherit", borderRadius: 12, overflow: "hidden", background: "#141414", border: `1px solid ${hovered ? "#ef4444" : "#1e1e1e"}`, transform: hovered ? "scale(1.02)" : "scale(1)", transition: "all 0.2s", boxShadow: hovered ? "0 8px 32px rgba(239,68,68,0.2)" : "none" }}>
      <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden" }}>
        {stream.thumbnail
          ? <img src={stream.thumbnail} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", filter: hovered ? "brightness(0.55)" : "brightness(0.85)", transition: "filter 0.2s" }} />
          : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #1a0000, #3a0000)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="#ef4444" opacity="0.4"><polygon points="5,3 19,12 5,21" /></svg>
            </div>
        }
        {/* LIVE badge */}
        {stream.is_live && (
          <div style={{ position: "absolute", top: 10, left: 10, display: "flex", alignItems: "center", gap: 5, background: "#ef4444", borderRadius: 5, padding: "4px 10px" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 }}>{stream.badge_text || "LIVE"}</span>
          </div>
        )}
        {/* Channel number */}
        {stream.channel_number != null && stream.channel_number !== "" && (
          <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", borderRadius: 5, padding: "4px 8px", fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: 0.5 }}>
            CH {stream.channel_number}
          </div>
        )}
        {/* Play overlay */}
        {hovered && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(239,68,68,0.9)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(239,68,68,0.5)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><polygon points="5,3 19,12 5,21" /></svg>
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: "12px 14px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
        {/* Avatar */}
        <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, overflow: "hidden", border: "2px solid #1e1e1e", background: "linear-gradient(135deg, #312e81, #6d28d9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff" }}>
          {stream.avatar_url
            ? <img src={stream.avatar_url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
          {stream.stream_title && (
            <p style={{ margin: "0 0 5px", fontSize: 12, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stream.stream_title}</p>
          )}
          {stream.now_airing && (
            <p style={{ margin: "0 0 5px", fontSize: 12, color: "#ef4444", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Now: {stream.now_airing}</p>
          )}
          {stream.category && stream.category !== "general" && (
            <span style={{ fontSize: 10, fontWeight: 600, color: "#666", background: "#1a1a1a", border: "1px solid #222", borderRadius: 4, padding: "2px 7px" }}>
              {CATEGORY_LABELS[stream.category] || stream.category}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}


// ─── Continue Watching ────────────────────────────────────────────────────────

// ─── Video Card ───────────────────────────────────────────────────────────────

const TRAILER_OVERLAY_W = 520;
const TRAILER_INFO_H = 200;

export function VideoCard({ video, onClick, rank, myList, onToggleList }) {
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
