import { useChannelBlackout } from "../hooks/useChannelBlackout";
import { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import { supabase } from "../supabase";
import { useIsMobile } from "../hooks/useIsMobile";

// Resolve a channel's playback URL (HLS-pull direct, or Cloudflare live-input UID).
function channelHlsUrl(ch) {
  if (ch.hls_url) return ch.hls_url;
  if (ch.stream_uid) return `https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com/${ch.stream_uid}/manifest/video.m3u8`;
  return "";
}

// Title-case a raw category slug for display (categories are derived from channel data).
// M3U group-titles can be messy ("Auto;Outdoor;Sports") — collapse separators cleanly.
function prettyCategory(c) {
  if (!c) return "General";
  return c.replace(/[;,]+/g, " / ").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b\w/g, m => m.toUpperCase());
}

const PAD = "clamp(16px, 5vw, 96px)";

const CATEGORIES = [
  { value: "all",       label: "All" },
  { value: "gaming",    label: "Gaming" },
  { value: "talk",      label: "Talk" },
  { value: "irl",       label: "IRL" },
  { value: "sports",    label: "Sports" },
  { value: "education", label: "Education" },
  { value: "creative",  label: "Creative" },
];

const CATEGORY_LABELS = {
  general: "General", gaming: "Gaming",
  talk: "Talk", irl: "IRL", sports: "Sports",
  education: "Education", creative: "Creative",
};

const CSS = `
  @keyframes livepulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.3)} }
  @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
  @keyframes fadeup { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes ringpulse { 0%{box-shadow:0 0 0 0 rgba(239,68,68,0.5)} 70%{box-shadow:0 0 0 6px rgba(239,68,68,0)} 100%{box-shadow:0 0 0 0 rgba(239,68,68,0)} }
  @keyframes btnpop { 0%{transform:scale(1)} 40%{transform:scale(1.14)} 100%{transform:scale(1)} }
  .stream-card { animation: fadeup 0.35s ease both; }
  .follow-pop { animation: btnpop 0.28s ease; }
`;

function viewerStr(n) {
  if (!n) return null;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function Avatar({ stream, size = 38, live = false }) {
  const src = stream.profile_picture || stream.avatar_url;
  const letter = (stream.channel_name || stream.title || "?")[0].toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
      background: "linear-gradient(135deg, #1e1b4b, #4c1d95)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.4), fontWeight: 700, color: "#fff",
      // red ring + pulse only when live
      outline: live ? "2px solid #ef4444" : "none",
      outlineOffset: 2,
      animation: live ? "ringpulse 2s ease-out infinite" : "none",
      transition: "outline 0.3s",
    }}>
      {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : letter}
    </div>
  );
}

function LiveBadge({ size = "sm" }) {
  const pad = size === "lg" ? "5px 12px" : "3px 9px";
  const dot = size === "lg" ? 7 : 5;
  const fs = size === "lg" ? 11 : 10;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#ef4444", borderRadius: 5, padding: pad }}>
      <div style={{ width: dot, height: dot, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite", flexShrink: 0 }} />
      <span style={{ fontSize: fs, fontWeight: 800, color: "#fff", letterSpacing: 0.8 }}>LIVE</span>
    </div>
  );
}

function FollowButton({ isFollowing, onClick }) {
  const [popping, setPopping] = useState(false);

  function handleClick(e) {
    e.preventDefault(); e.stopPropagation();
    setPopping(true);
    onClick();
  }

  return (
    <button
      onClick={handleClick}
      onAnimationEnd={() => setPopping(false)}
      className={popping ? "follow-pop" : ""}
      style={{
        flexShrink: 0,
        background: isFollowing ? "rgba(250,204,21,0.08)" : "transparent",
        border: `1px solid ${isFollowing ? "rgba(250,204,21,0.3)" : "#2a2a2a"}`,
        borderRadius: 7, padding: "6px 13px",
        color: isFollowing ? "#facc15" : "#555",
        fontSize: 12, fontWeight: 700, cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
        fontFamily: "inherit",
      }}
      onMouseEnter={e => { if (!isFollowing) { e.currentTarget.style.borderColor = "#3a3a3a"; e.currentTarget.style.color = "#aaa"; } }}
      onMouseLeave={e => { if (!isFollowing) { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#555"; } }}
    >
      {isFollowing ? "✓ Following" : "+ Follow"}
    </button>
  );
}

function ThumbnailPlaceholder() {
  return (
    <div style={{
      width: "100%", height: "100%",
      background: "linear-gradient(90deg, #111 25%, #181818 50%, #111 75%)",
      backgroundSize: "800px 100%",
      animation: "shimmer 1.8s infinite linear",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="rgba(255,255,255,0.05)">
        <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>
      </svg>
    </div>
  );
}

function FeaturedStream({ stream, viewers, isFollowing, onToggleFollow, user }) {
  const [hovered, setHovered] = useState(false);
  const [followPopping, setFollowPopping] = useState(false);
  const slug = stream.slug || stream.username || (stream.channel_name || stream.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const count = viewers || 0;
  const channelName = stream.channel_name || stream.title;

  function handleFollow(e) {
    e.preventDefault(); e.stopPropagation();
    setFollowPopping(true);
    onToggleFollow(stream.id);
  }

  return (
    <a href={`/stream/${slug}`} style={{ textDecoration: "none", color: "inherit", display: "block", marginBottom: 40 }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{
        position: "relative", borderRadius: 16, overflow: "hidden",
        background: "#0f0f0f",
        border: "1px solid rgba(239,68,68,0.25)",
        boxShadow: hovered
          ? "0 0 0 1px rgba(239,68,68,0.35), 0 16px 48px rgba(239,68,68,0.1)"
          : "0 0 0 0px transparent, 0 4px 24px rgba(0,0,0,0.4)",
        display: "grid", gridTemplateColumns: "1fr 320px",
        maxHeight: 380,
        transition: "box-shadow 0.25s, transform 0.2s",
        transform: hovered ? "translateY(-2px)" : "translateY(0)",
      }}>
        {/* Thumbnail */}
        <div style={{ position: "relative", overflow: "hidden", background: "#111" }}>
          <div style={{ width: "100%", height: "100%", transition: "transform 0.4s ease", transform: hovered ? "scale(1.03)" : "scale(1)" }}>
            {stream.thumbnail || stream.hero_image
              ? <img src={stream.thumbnail || stream.hero_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <ThumbnailPlaceholder />
            }
          </div>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent 70%, rgba(0,0,0,0.4))" }} />
          <div style={{ position: "absolute", top: 14, left: 14 }}>
            <LiveBadge size="lg" />
          </div>
          {count > 0 && (
            <div style={{ position: "absolute", bottom: 14, left: 14, display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)", borderRadius: 6, padding: "5px 10px" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444" }} />
              <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>{viewerStr(count)} watching</span>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={{ padding: "28px 24px", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0d0d0d" }}>
          <div>
            <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "#ef4444", letterSpacing: "0.1em", textTransform: "uppercase" }}>Featured Stream</p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <Avatar stream={stream} size={40} live />
              <div>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{channelName}</p>
                {stream.category && stream.category !== "general" && (
                  <p style={{ margin: "3px 0 0", fontSize: 11, color: "#555" }}>{CATEGORY_LABELS[stream.category] || stream.category}</p>
                )}
              </div>
            </div>
            {stream.stream_title && (
              <p style={{ margin: "0 0 14px", fontSize: 14, color: "#888", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{stream.stream_title}</p>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <a href={`/stream/${slug}`}
              style={{ display: "block", background: "#ef4444", border: "none", borderRadius: 8, padding: "12px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "center", textDecoration: "none", transition: "background 0.15s", boxShadow: "0 4px 16px rgba(239,68,68,0.3)" }}
              onMouseEnter={e => e.currentTarget.style.background = "#dc2626"}
              onMouseLeave={e => e.currentTarget.style.background = "#ef4444"}>
              Watch Live →
            </a>
            {user && user.id !== stream.user_id && (
              <button
                onClick={handleFollow}
                onAnimationEnd={() => setFollowPopping(false)}
                className={followPopping ? "follow-pop" : ""}
                style={{ background: isFollowing ? "rgba(255,255,255,0.05)" : "transparent", border: `1px solid ${isFollowing ? "#2a2a2a" : "#2a2a2a"}`, borderRadius: 8, padding: "11px", color: isFollowing ? "#facc15" : "#888", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit" }}>
                {isFollowing ? "✓ Following" : "+ Follow"}
              </button>
            )}
          </div>
        </div>
      </div>
    </a>
  );
}

function StreamCard({ stream, viewers, isLive, isFollowing, onToggleFollow, user, index = 0 }) {
  const [hovered, setHovered] = useState(false);
  const slug = stream.slug || stream.username || (stream.channel_name || stream.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const count = viewers || 0;
  const channelName = stream.channel_name || stream.title;

  const liveGlow = isLive && hovered
    ? "0 0 0 1px rgba(239,68,68,0.3), 0 8px 28px rgba(239,68,68,0.08)"
    : isLive
      ? "0 0 0 1px rgba(239,68,68,0.12), 0 2px 12px rgba(0,0,0,0.4)"
      : "0 2px 12px rgba(0,0,0,0.3)";

  return (
    <div
      className="stream-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 12, overflow: "hidden", background: "#0f0f0f",
        border: `1px solid ${isLive ? "rgba(239,68,68,0.15)" : "#161616"}`,
        boxShadow: liveGlow,
        transition: "box-shadow 0.2s, transform 0.2s, border-color 0.2s",
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
        animationDelay: `${index * 50}ms`,
      }}
    >
      <a href={`/stream/${slug}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>

        <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", background: "#111" }}>
          <div style={{ width: "100%", height: "100%", transition: "transform 0.35s ease", transform: hovered ? "scale(1.05)" : "scale(1)" }}>
            {stream.thumbnail || stream.hero_image
              ? <img src={stream.thumbnail || stream.hero_image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <ThumbnailPlaceholder />
            }
          </div>

          {/* Hover vignette overlay */}
          <div style={{ position: "absolute", inset: 0, background: hovered ? "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)" : "transparent", transition: "background 0.3s", pointerEvents: "none" }} />

          {!isLive && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />}

          <div style={{ position: "absolute", top: 10, left: 10 }}>
            {isLive ? <LiveBadge /> : (
              <div style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", borderRadius: 5, padding: "3px 9px", border: "1px solid rgba(255,255,255,0.07)" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#555", letterSpacing: 0.8 }}>OFFLINE</span>
              </div>
            )}
          </div>

          {isLive && count > 0 && (
            <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", borderRadius: 5, padding: "3px 8px", display: "flex", alignItems: "center", gap: 4 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2.5" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{viewerStr(count)}</span>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "11px 12px 13px" }}>
          <Avatar stream={stream} size={36} live={isLive} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: isLive ? "#e8e8e8" : "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
              {stream.stream_title || channelName}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "#3a3a3a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {channelName}
            </p>
          </div>
          {user && user.id !== stream.user_id && (
            <FollowButton isFollowing={isFollowing} onClick={() => onToggleFollow(stream.id)} />
          )}
        </div>
      </a>
    </div>
  );
}

const CHANNEL_CATEGORIES = {
  general: "General", movies: "Movies", sports: "Sports", news: "News",
  gaming: "Gaming", music: "Music", kids: "Kids", education: "Education", entertainment: "Entertainment",
};

function ChannelCard({ channel, onPlay, index = 0 }) {
  const [hovered, setHovered] = useState(false);
  const [heroFailed, setHeroFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  return (
    <div
      className="stream-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onPlay(channel)}
      style={{
        borderRadius: 12, overflow: "hidden", background: "#0f0f0f",
        border: "1px solid rgba(239,68,68,0.2)",
        boxShadow: hovered ? "0 0 0 1px rgba(239,68,68,0.35), 0 8px 28px rgba(239,68,68,0.1)" : "0 0 0 1px rgba(239,68,68,0.08), 0 2px 12px rgba(0,0,0,0.4)",
        transition: "box-shadow 0.2s, transform 0.2s",
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
        cursor: "pointer",
        animationDelay: `${index * 50}ms`,
      }}>
      <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", background: "#111" }}>
        <div style={{ width: "100%", height: "100%", transition: "transform 0.35s ease", transform: hovered ? "scale(1.05)" : "scale(1)" }}>
          {(channel.hero_url && !heroFailed)
            ? <img src={channel.hero_url} alt="" onError={() => setHeroFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <ThumbnailPlaceholder />
          }
        </div>
        <div style={{ position: "absolute", inset: 0, background: hovered ? "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)" : "transparent", transition: "background 0.3s", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: 10, left: 10 }}>
          <LiveBadge />
        </div>
        {channel.category && channel.category !== "general" && (
          <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", borderRadius: 5, padding: "3px 9px" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#aaa" }}>{CHANNEL_CATEGORIES[channel.category] || channel.category}</span>
          </div>
        )}
        {hovered && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "rgba(239,68,68,0.9)", borderRadius: "50%", width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><polygon points="5,3 19,12 5,21"/></svg>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "11px 12px 13px" }}>
        {(channel.logo_url && !logoFailed)
          ? <img src={channel.logo_url} alt="" onError={() => setLogoFailed(true)} style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "#1a1a1a" }} />
          : <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg,#ef4444,#991b1b)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📺</div>
        }
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#e8e8e8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>{channel.name}</p>
          {channel.description && (
            <p style={{ margin: 0, fontSize: 12, color: "#3a3a3a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{channel.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtClock(dt) {
  return new Date(dt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function channelNowNext(epgEntries, channelId) {
  const now = Date.now();
  const mine = epgEntries
    .filter(e => String(e.channel_id) === String(channelId))
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  let current = null, next = null, progress = 0;
  for (const e of mine) {
    const s = new Date(e.start_time).getTime();
    const en = new Date(e.end_time).getTime();
    if (s <= now && now < en) { current = e; progress = (now - s) / (en - s); }
    else if (s > now && !next) next = e;
  }
  return { current, next, progress };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVING MOSAIC — a breathing wall of channel tiles.
// Tile size is admin-controlled per channel (normal / large / spotlight); each
// tile shows the real "on now" frame and plays a muted live preview on hover.
// Everything here is data-driven — categories, sizes and the hero come from the
// channels themselves, nothing is hardcoded.
// ─────────────────────────────────────────────────────────────────────────────

const TILE_SPAN = {
  normal:    { c: 1, r: 1 },
  large:     { c: 2, r: 2 },
  spotlight: { c: 3, r: 2 },
};

function MosaicTile({ channel, epgEntries, onPlay, previewActive, onHoverStart, onHoverEnd, isMobile }) {
  const blackout = useChannelBlackout(previewActive ? channel.id : null, channel);
  const canPreview = previewActive && !blackout.loading && !blackout.message && !blackout.error;
  const [imgFailed, setImgFailed] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const { current, next, progress } = channelNowNext(epgEntries, channel.id);

  const size = TILE_SPAN[channel.tile_size] ? channel.tile_size : (channel.is_live_hero ? "spotlight" : "normal");
  // On mobile we use a fixed 2-column grid, so clamp spans to fit (never overflow the viewport).
  const span = isMobile
    ? (size === "normal" ? { c: 1, r: 1 } : { c: 2, r: 2 })
    : TILE_SPAN[size];
  const big = size !== "normal";
  const thumb = current?.thumbnail || channel.hero_url;
  const hasThumb = thumb && !imgFailed;
  const showIdent = !hasThumb && channel.logo_url; // logo-forward "ident" when no program art

  // Mount a muted live preview only while this tile is the single active one.
  useEffect(() => {
    setPreviewReady(false);
    if (!canPreview) { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } return; }
    const url = channelHlsUrl(channel);
    const el = videoRef.current;
    if (!url || !el) return;
    let cancelled = false;
    if (Hls.isSupported() && /\.m3u8/i.test(url)) {
      const hls = new Hls({ enableWorker: true, maxBufferLength: 6, capLevelToPlayerSize: true, startLevel: 0 });
      hls.loadSource(url);
      hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { if (!cancelled) { el.play().then(() => setPreviewReady(true)).catch(() => {}); } });
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { try { hls.destroy(); } catch {} } });
      hlsRef.current = hls;
    } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = url;
      el.play().then(() => setPreviewReady(true)).catch(() => {});
    }
    return () => { cancelled = true; if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } el.pause(); el.removeAttribute("src"); el.load(); };
  }, [canPreview, channel.id]);

  return (
    <div
      className="stream-card"
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onClick={() => onPlay(channel)}
      style={{
        gridColumn: `span ${span.c}`, gridRow: `span ${span.r}`,
        position: "relative", borderRadius: 14, overflow: "hidden", cursor: "pointer",
        background: "#0d0d0d", border: "1px solid rgba(239,68,68,0.18)",
        boxShadow: previewActive ? "0 0 0 1px rgba(239,68,68,0.5), 0 14px 40px rgba(239,68,68,0.18)" : "0 2px 12px rgba(0,0,0,0.4)",
        transform: previewActive ? "translateY(-3px)" : "none", transition: "box-shadow 0.2s, transform 0.2s",
      }}>
      {/* Base frame: real on-air thumbnail / channel hero, else a branded gradient */}
      {hasThumb
        ? <img src={thumb} alt="" onError={() => setImgFailed(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        : <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 38%, #26262b 0%, #141417 55%, #0a0a0c 100%)" }} />}

      {/* Logo-forward "ident" when there's no program art */}
      {showIdent && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: big ? 54 : 40 }}>
          <img src={channel.logo_url} alt="" onError={() => setImgFailed(true)}
            style={{ maxWidth: big ? "46%" : "58%", maxHeight: big ? "46%" : "56%", objectFit: "contain", filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.5))" }} />
        </div>
      )}

      {/* Live muted preview fades in over the frame */}
      {canPreview && (
        <video ref={videoRef} muted playsInline autoPlay
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: previewReady ? 1 : 0, transition: "opacity 0.4s" }} />
      )}

      {/* Legibility gradient (only really needed over imagery) */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.1) 45%, transparent 100%)" }} />

      {/* LIVE badge */}
      <div style={{ position: "absolute", top: 10, left: 10 }}><LiveBadge size={big ? "lg" : "sm"} /></div>

      {/* Category chip (top-right) */}
      {channel.category && channel.category !== "general" && (
        <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", borderRadius: 5, padding: "3px 9px" }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#ddd" }}>{prettyCategory(channel.category)}</span>
        </div>
      )}

      {/* Bottom info */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: big ? "16px 16px 14px" : "11px 12px 11px", display: "flex", flexDirection: "column", gap: big ? 8 : 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {!showIdent && (channel.logo_url && !imgFailed
            ? <img src={channel.logo_url} alt="" onError={e => { e.target.style.display = "none"; }} style={{ width: big ? 34 : 26, height: big ? 34 : 26, borderRadius: 7, objectFit: "cover", flexShrink: 0, background: "#000", border: "1px solid rgba(255,255,255,0.15)" }} />
            : <div style={{ width: big ? 34 : 26, height: big ? 34 : 26, borderRadius: 7, background: "linear-gradient(135deg,#ef4444,#991b1b)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: big ? 15 : 12 }}>📺</div>)}
          <span style={{ fontSize: big ? 17 : 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>{channel.name}</span>
        </div>
        {current && (
          <>
            <span style={{ fontSize: big ? 13 : 11, color: "#e5e5e5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current.title}</span>
            <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.18)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.max(2, Math.min(100, progress * 100))}%`, background: "#ef4444" }} />
            </div>
            {big && next && <span style={{ fontSize: 11, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Up next · {next.title}</span>}
          </>
        )}
      </div>

      {/* Play affordation on hover */}
      {previewActive && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "rgba(239,68,68,0.92)", borderRadius: "50%", width: big ? 56 : 44, height: big ? 56 : 44, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <svg width={big ? 20 : 16} height={big ? 20 : 16} viewBox="0 0 24 24" fill="#fff"><polygon points="5,3 19,12 5,21" /></svg>
        </div>
      )}
    </div>
  );
}

// Cinematic featured channel at the top of Live TV — shows the current programme's
// art + now/next straight from the guide, like a real FAST service's front page.
function FeaturedChannelHero({ channel, epgEntries, onPlay, isMobile }) {
  const [imgFailed, setImgFailed] = useState(false);
  const { current, next, progress } = channelNowNext(epgEntries, channel.id);
  const art = current?.thumbnail || channel.hero_url;
  const hasArt = art && !imgFailed;

  return (
    <div onClick={() => onPlay(channel)} className="stream-card"
      style={{ position: "relative", borderRadius: 16, overflow: "hidden", cursor: "pointer",
        height: isMobile ? 230 : "clamp(300px, 32vw, 430px)", marginBottom: isMobile ? 10 : 14,
        background: "#0d0d0d", border: "1px solid rgba(239,68,68,0.22)", boxShadow: "0 12px 44px rgba(0,0,0,0.5)" }}>
      {hasArt ? (
        <>
          {/* Blurred fill so the wide hero never letterboxes or crops the subject */}
          <img src={art} alt="" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(28px) brightness(0.45)", transform: "scale(1.12)" }} />
          {/* Full art, uncropped, anchored right (left side is reserved for the text overlay) */}
          <img src={art} alt="" onError={() => setImgFailed(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", objectPosition: isMobile ? "center" : "right center" }} />
        </>
      ) : <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 35% 40%, #26262b, #141417 55%, #0a0a0c)" }} />}

      {!hasArt && channel.logo_url && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 90 }}>
          <img src={channel.logo_url} alt="" style={{ maxWidth: "34%", maxHeight: "40%", objectFit: "contain", filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.6))" }} />
        </div>
      )}

      {/* legibility gradients */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.55) 42%, rgba(0,0,0,0.12) 72%, transparent 100%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent 55%)" }} />

      <div style={{ position: "absolute", left: 0, bottom: 0, padding: isMobile ? "18px" : "clamp(24px, 3vw, 40px)", maxWidth: isMobile ? "100%" : 620, display: "flex", flexDirection: "column", gap: isMobile ? 9 : 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LiveBadge size="lg" />
          {channel.category && channel.category !== "general" && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "#ddd", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", borderRadius: 5, padding: "3px 10px" }}>{prettyCategory(channel.category)}</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {channel.logo_url && !imgFailed && (
            <img src={channel.logo_url} alt="" onError={e => { e.target.style.display = "none"; }} style={{ width: isMobile ? 40 : 52, height: isMobile ? 40 : 52, borderRadius: 10, objectFit: "cover", background: "#000", border: "1px solid rgba(255,255,255,0.15)", flexShrink: 0 }} />
          )}
          <h2 style={{ margin: 0, fontSize: isMobile ? 22 : "clamp(26px, 3.4vw, 40px)", fontWeight: 800, color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.6)", lineHeight: 1.05 }}>{channel.name}</h2>
        </div>
        {current && (
          <div style={{ maxWidth: 460 }}>
            <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#ef4444" }}>Now Airing</p>
            <p style={{ margin: "0 0 8px", fontSize: isMobile ? 15 : 18, fontWeight: 600, color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>{current.title}</p>
            <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.22)", overflow: "hidden", maxWidth: 320 }}>
              <div style={{ height: "100%", width: `${Math.max(2, Math.min(100, progress * 100))}%`, background: "#ef4444" }} />
            </div>
            {next && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#aaa" }}>Up next · {next.title}</p>}
          </div>
        )}
        <button onClick={e => { e.stopPropagation(); onPlay(channel); }}
          style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 8, background: "#fff", color: "#0a0a0a", border: "none", borderRadius: 8, padding: isMobile ? "10px 20px" : "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#0a0a0a"><polygon points="5,3 19,12 5,21" /></svg> Watch Live
        </button>
      </div>
    </div>
  );
}

function LiveMosaic({ channels, epgEntries, onChannelPlay }) {
  const isMobile = useIsMobile();
  const [activeCat, setActiveCat] = useState("all");
  const [previewId, setPreviewId] = useState(null);
  const hoverTimer = useRef(null);

  const active = channels.filter(c => c.is_active !== false);

  // Categories derived from the channels themselves — no hardcoded list.
  // Split multi-value categories ("Auto;Outdoor;Sports") and dedupe case-insensitively
  // ("Sports" and "sports" are the same pill), so nothing shows up more than once.
  const catsOf = c => (c.category || "general").split(/[;,/]/).map(s => s.trim()).filter(Boolean);
  const catMap = new Map(); // lowercased key -> display label
  active.forEach(c => catsOf(c).forEach(t => { const k = t.toLowerCase(); if (!catMap.has(k)) catMap.set(k, prettyCategory(t)); }));
  const cats = Array.from(catMap.entries()).sort((a, b) => a[1].localeCompare(b[1])); // [key, label]
  const shown = activeCat === "all" ? active : active.filter(c => catsOf(c).some(t => t.toLowerCase() === activeCat));

  // Hero/spotlight first, then large, then normal, then admin sort_order.
  const rank = c => (c.is_live_hero ? 0 : c.tile_size === "spotlight" ? 1 : c.tile_size === "large" ? 2 : 3);
  const ordered = [...shown].sort((a, b) => rank(a) - rank(b) || (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // Featured hero: highest-ranked channel that has a live guide entry (so the hero
  // shows a real "now airing"), else just the top-ranked one. Pulled out of the grid.
  const hero = ordered.find(c => channelNowNext(epgEntries, c.id).current) || ordered[0];
  const gridChannels = ordered.filter(c => c.id !== hero?.id);

  // Hover previews are desktop-only (no hover on touch; also saves mobile data).
  const startHover = id => { if (isMobile) return; clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setPreviewId(id), 350); };
  const endHover = () => { clearTimeout(hoverTimer.current); setPreviewId(null); };
  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  if (active.length === 0) return null;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#ef4444", letterSpacing: "0.12em", textTransform: "uppercase" }}>Live TV · On Now</p>
        {cats.length > 1 && (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {[["all", "All"], ...cats].map(([key, label]) => (
              <button key={key} onClick={() => setActiveCat(key)}
                style={{ background: activeCat === key ? "#facc15" : "rgba(255,255,255,0.05)", border: `1px solid ${activeCat === key ? "#facc15" : "rgba(255,255,255,0.08)"}`, borderRadius: 20, padding: "5px 15px", color: activeCat === key ? "#0a0a0a" : "#888", fontSize: 12, fontWeight: activeCat === key ? 700 : 500, cursor: "pointer", transition: "all 0.15s" }}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {hero && <FeaturedChannelHero channel={hero} epgEntries={epgEntries} onPlay={onChannelPlay} isMobile={isMobile} />}

      {gridChannels.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(230px, 1fr))", gridAutoRows: isMobile ? "112px" : "150px", gridAutoFlow: "dense", gap: isMobile ? 8 : 12 }}>
        {gridChannels.map(ch => (
          <MosaicTile key={ch.id} channel={ch} epgEntries={epgEntries} onPlay={onChannelPlay} isMobile={isMobile}
            previewActive={previewId === ch.id}
            onHoverStart={() => startHover(ch.id)} onHoverEnd={endHover} />
        ))}
        </div>
      )}
    </div>
  );
}

function ChannelGuideCard({ channel, epgEntries, onPlay, index }) {
  const [hovered, setHovered] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const { current, next, progress } = channelNowNext(epgEntries, channel.id);
  const thumbSrc = current?.thumbnail || channel.hero_url;
  return (
    <div className="stream-card" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={() => onPlay(channel)}
      style={{ borderRadius: 12, overflow: "hidden", background: "#0f0f0f", border: "1px solid rgba(239,68,68,0.2)",
        boxShadow: hovered ? "0 0 0 1px rgba(239,68,68,0.35), 0 8px 28px rgba(239,68,68,0.1)" : "0 0 0 1px rgba(239,68,68,0.08), 0 2px 12px rgba(0,0,0,0.4)",
        transition: "box-shadow 0.2s, transform 0.2s", transform: hovered ? "translateY(-4px)" : "translateY(0)", cursor: "pointer", animationDelay: `${index * 50}ms` }}>
      <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", background: "#111" }}>
        <div style={{ width: "100%", height: "100%", transition: "transform 0.35s ease", transform: hovered ? "scale(1.05)" : "scale(1)" }}>
          {(thumbSrc && !thumbFailed)
            ? <img src={thumbSrc} alt="" onError={() => setThumbFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <ThumbnailPlaceholder />}
        </div>
        <div style={{ position: "absolute", top: 10, left: 10 }}><LiveBadge /></div>
        {hovered && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "rgba(239,68,68,0.9)", borderRadius: "50%", width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><polygon points="5,3 19,12 5,21"/></svg>
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: "11px 13px 14px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: current ? 10 : 0 }}>
          {(channel.logo_url && !logoFailed)
            ? <img src={channel.logo_url} alt="" onError={() => setLogoFailed(true)} style={{ width: 32, height: 32, borderRadius: 7, objectFit: "cover", flexShrink: 0, background: "#1a1a1a" }} />
            : <div style={{ width: 32, height: 32, borderRadius: 7, background: "linear-gradient(135deg,#ef4444,#991b1b)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>📺</div>}
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#e8e8e8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>{channel.name}</p>
        </div>
        {current ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: "#fff", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current.title}</span>
              <span style={{ fontSize: 11, color: "#555", flexShrink: 0 }}>{fmtClock(current.start_time)}</span>
            </div>
            <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.1)", overflow: "hidden", marginBottom: next ? 10 : 0 }}>
              <div style={{ height: "100%", width: `${Math.max(2, Math.min(100, progress * 100))}%`, background: "#ef4444", borderRadius: 2 }} />
            </div>
            {next && (
              <p style={{ margin: 0, fontSize: 12, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ color: "#3a3a3a", fontWeight: 600 }}>Up next</span> · {fmtClock(next.start_time)} {next.title}
              </p>
            )}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "#3a3a3a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {channel.description || "Live TV"}
          </p>
        )}
      </div>
    </div>
  );
}

export function LiveTVPage({ streams, channels = [], epgEntries = [], onChannelPlay, user, streamsLoading }) {
  const [, setNowTick] = useState(0); // re-render every 30s so the guide's Now/Up-next rolls over live
  useEffect(() => { const t = setInterval(() => setNowTick(n => n + 1), 30000); return () => clearInterval(t); }, []);
  const [viewerCounts, setViewerCounts] = useState({});
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeTab, setActiveTab] = useState("all");
  const [schedule, setSchedule] = useState([]);
  const [followedIds, setFollowedIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const searchFiltered = searchQuery.trim()
    ? streams.filter(s => {
        const q = searchQuery.trim().toLowerCase();
        const name = (s.channel_name || s.title || "").toLowerCase();
        const handle = (s.username || "").toLowerCase();
        return name.includes(q) || handle.includes(q);
      })
    : streams;

  const liveStreams = searchFiltered.filter(s => s.is_live);
  const offlineStreams = searchFiltered.filter(s => !s.is_live);

  useEffect(() => {
    supabase.from("stream_schedule")
      .select("*, live_streams(id, channel_name, title)")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at").limit(8)
      .then(({ data }) => setSchedule(data || []));
  }, []);

  useEffect(() => {
    if (!user) { setFollowedIds(new Set()); return; }
    supabase.from("streamer_follows").select("stream_id").eq("follower_id", user.id)
      .then(({ data }) => setFollowedIds(new Set((data || []).map(r => r.stream_id))));
  }, [user?.id]);

  useEffect(() => {
    async function loadViewers() {
      const cutoff = new Date(Date.now() - 60000).toISOString();
      const { data } = await supabase.from("live_viewers").select("channel_id").gte("last_ping", cutoff);
      if (!data) return;
      const counts = {};
      data.forEach(r => { counts[r.channel_id] = (counts[r.channel_id] || 0) + 1; });
      setViewerCounts(counts);
    }
    loadViewers();
    const t = setInterval(loadViewers, 15000);
    return () => clearInterval(t);
  }, []);

  async function toggleFollow(streamId) {
    if (!user) { window.location.href = "/signin"; return; }
    const isFollowing = followedIds.has(streamId);
    if (isFollowing) {
      await supabase.from("streamer_follows").delete().eq("stream_id", streamId).eq("follower_id", user.id);
      setFollowedIds(prev => { const n = new Set(prev); n.delete(streamId); return n; });
    } else {
      await supabase.from("streamer_follows").insert({ stream_id: streamId, follower_id: user.id });
      setFollowedIds(prev => new Set([...prev, streamId]));
    }
  }

  const usedCategories = new Set(liveStreams.map(s => s.category || "general"));
  const applyCategory = list => activeCategory === "all" ? list : list.filter(s => (s.category || "general") === activeCategory);

  const filteredLive = activeTab === "following"
    ? liveStreams.filter(s => followedIds.has(s.id))
    : applyCategory(liveStreams);

  const filteredOffline = activeTab === "following"
    ? offlineStreams.filter(s => followedIds.has(s.id))
    : applyCategory(offlineStreams);

  const totalViewers = Object.values(viewerCounts).reduce((a, b) => a + b, 0);
  const followingCount = streams.filter(s => followedIds.has(s.id)).length;

  const sortedFilteredLive = [...filteredLive].sort((a, b) => (viewerCounts[b.id] || 0) - (viewerCounts[a.id] || 0));

  const cardProps = (s, i) => ({
    stream: s, viewers: viewerCounts[s.id] || 0, index: i,
    isLive: s.is_live, isFollowing: followedIds.has(s.id),
    onToggleFollow: toggleFollow, user,
  });

  if (streamsLoading) return <div style={{ paddingTop: 90, minHeight: "100vh" }} />;

  if (streams.length === 0 && channels.length === 0) {
    return (
      <div style={{ paddingTop: 90, paddingBottom: 80, minHeight: "100vh" }}>
        <div style={{ padding: `clamp(80px,12vw,140px) ${PAD}`, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ width: 80, height: 80, borderRadius: 22, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5"><path d="M15 10l4.553-2.07A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
          </div>
          <h2 style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 700, color: "#fff" }}>No channels yet</h2>
          <p style={{ margin: 0, fontSize: 14, color: "#555", maxWidth: 340, lineHeight: 1.7 }}>Channels will appear here once creators go live.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 90, paddingBottom: 80, minHeight: "100vh" }}>
      <style>{CSS}</style>
      <div style={{ padding: `0 ${PAD}` }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(22px, 3vw, 30px)", fontWeight: 700, color: "#fff" }}>Live TV</h1>
          {liveStreams.length > 0 && !searchQuery && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 20, padding: "5px 14px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite" }} />
              <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>
                {liveStreams.length} live{totalViewers > 0 ? ` · ${totalViewers >= 1000 ? `${(totalViewers / 1000).toFixed(1)}k` : totalViewers} watching` : ""}
              </span>
            </div>
          )}
          <div style={{ marginLeft: "auto", position: "relative" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="2" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search channels…"
              style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 20, padding: "8px 14px 8px 34px", color: "#ccc", fontSize: 13, outline: "none", width: 200, fontFamily: "inherit", transition: "border-color 0.15s" }}
              onFocus={e => e.currentTarget.style.borderColor = "#333"}
              onBlur={e => e.currentTarget.style.borderColor = "#1e1e1e"}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
            )}
          </div>
        </div>
        {searchQuery && (
          <p style={{ margin: "0 0 20px", fontSize: 13, color: "#444" }}>
            {searchFiltered.length === 0 ? `No channels found for "${searchQuery}"` : `${searchFiltered.length} channel${searchFiltered.length !== 1 ? "s" : ""} found`}
          </p>
        )}

        {/* ── Live TV channel guide (primary): the Living Mosaic ── */}
        <LiveMosaic channels={channels} epgEntries={epgEntries} onChannelPlay={onChannelPlay} />

        {/* ── Creator Streams (secondary) ── */}
        <h2 style={{ margin: channels.length > 0 ? "56px 0 18px" : "0 0 18px", fontSize: 18, fontWeight: 700, color: "#fff" }}>Creator Streams</h2>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {[{ id: "all", label: "All Channels" }, { id: "following", label: `Following${followingCount > 0 ? ` (${followingCount})` : ""}` }].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ background: activeTab === t.id ? "#fff" : "rgba(255,255,255,0.05)", border: `1px solid ${activeTab === t.id ? "#fff" : "rgba(255,255,255,0.1)"}`, borderRadius: 20, padding: "7px 20px", color: activeTab === t.id ? "#0a0a0a" : "#666", fontSize: 13, fontWeight: activeTab === t.id ? 700 : 400, cursor: "pointer", transition: "all 0.15s" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Category pills */}
        {activeTab === "all" && usedCategories.size > 1 && (
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 28 }}>
            {CATEGORIES.filter(c => c.value === "all" || usedCategories.has(c.value)).map(c => (
              <button key={c.value} onClick={() => setActiveCategory(c.value)}
                style={{ background: activeCategory === c.value ? "#facc15" : "rgba(255,255,255,0.05)", border: `1px solid ${activeCategory === c.value ? "#facc15" : "rgba(255,255,255,0.08)"}`, borderRadius: 20, padding: "5px 16px", color: activeCategory === c.value ? "#0a0a0a" : "#666", fontSize: 12, fontWeight: activeCategory === c.value ? 700 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                {c.label}
              </button>
            ))}
          </div>
        )}

        {/* Following empty state */}
        {activeTab === "following" && followingCount === 0 && (
          <div style={{ padding: "72px 0", textAlign: "center" }}>
            <p style={{ color: "#444", fontSize: 15, margin: "0 0 8px" }}>You're not following anyone yet.</p>
            <p style={{ color: "#333", fontSize: 13, margin: "0 0 24px" }}>Hit "+ Follow" on any channel to see them here.</p>
            <button onClick={() => setActiveTab("all")} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 24px", color: "#bbb", fontSize: 13, cursor: "pointer" }}>Browse channels</button>
          </div>
        )}

        {/* Live Now */}
        {sortedFilteredLive.length > 0 && (
          <div style={{ marginBottom: 48 }}>
            {offlineStreams.length > 0 && (
              <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: "#ef4444", letterSpacing: "0.12em", textTransform: "uppercase" }}>Live Now</p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              {sortedFilteredLive.map((s, i) => <StreamCard key={s.id} {...cardProps(s, i)} />)}
            </div>
          </div>
        )}

        {activeTab === "all" && filteredLive.length === 0 && liveStreams.length > 0 && activeCategory !== "all" && (
          <p style={{ color: "#333", fontSize: 14, marginBottom: 32 }}>No live streams in this category right now.</p>
        )}

        {/* Offline channels */}
        {filteredOffline.length > 0 && (
          <div>
            <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: "#444", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {liveStreams.length > 0 ? "Other Channels" : "All Channels"}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              {filteredOffline.map((s, i) => <StreamCard key={s.id} {...cardProps(s, i)} />)}
            </div>
          </div>
        )}

        {/* Schedule */}
        {schedule.length > 0 && (
          <div style={{ marginTop: 72 }}>
            <p style={{ margin: "0 0 18px", fontSize: 11, fontWeight: 700, color: "#444", letterSpacing: "0.12em", textTransform: "uppercase" }}>Coming Up</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
              {schedule.map(s => {
                const d = new Date(s.scheduled_at);
                const name = s.live_streams?.channel_name || s.live_streams?.title || "Unknown";
                return (
                  <div key={s.id} style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: 10, padding: "16px 18px" }}>
                    <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: "#fff" }}>{s.title}</p>
                    <p style={{ margin: "0 0 8px", fontSize: 12, color: "#555" }}>{name}</p>
                    <p style={{ margin: 0, fontSize: 11, color: "#444" }}>
                      {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
