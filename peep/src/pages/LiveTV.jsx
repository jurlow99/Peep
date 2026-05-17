import { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import { supabase } from "../supabase";

const PAD = "clamp(16px, 5vw, 96px)";
const PX_PER_MIN = 6;
const EPG_WINDOW_MINS = 5 * 60;
const EPG_CH_COL_W = 156;
const EPG_ROW_H = 72;
const EPG_HDR_H = 40;

function useIsMobile() {
  const [is, setIs] = useState(window.innerWidth < 640);
  useEffect(() => {
    const h = () => setIs(window.innerWidth < 640);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return is;
}

function isHlsUrl(url) {
  return !!url && (url.includes(".m3u8") || url.includes("m3u8"));
}

function ViewerBadge({ count, style = {} }) {
  if (!count || count < 1) return null;
  const label = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "rgba(255,255,255,0.45)", ...style }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
      </svg>
      {label} watching
    </span>
  );
}

export function LiveTVPage({ streams, epgEntries, onPlay }) {
  const [tuningIn, setTuningIn] = useState(null);
  const [viewerCounts, setViewerCounts] = useState({});
  const now = useRef(new Date()).current;
  const isMobile = useIsMobile();

  // Build EPG maps
  const nowAiringMap = {};
  const upNextMap = {};
  epgEntries.forEach(e => {
    const start = new Date(e.start_time);
    const end = new Date(e.end_time);
    if (start <= now && end > now) nowAiringMap[e.channel_id] = e;
  });
  streams.forEach(ch => {
    const cur = nowAiringMap[ch.id];
    if (cur) {
      const next = epgEntries
        .filter(e => e.channel_id === ch.id && new Date(e.start_time) >= new Date(cur.end_time))
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
      if (next) upNextMap[ch.id] = next;
    }
  });

  // Fetch viewer counts
  useEffect(() => {
    async function load() {
      const cutoff = new Date(Date.now() - 90 * 1000).toISOString();
      const { data } = await supabase
        .from("live_viewers")
        .select("channel_id")
        .gte("last_ping", cutoff);
      if (!data) return;
      const counts = {};
      data.forEach(r => { counts[r.channel_id] = (counts[r.channel_id] || 0) + 1; });
      setViewerCounts(counts);
    }
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  async function tuneIn(channel) {
    setTuningIn(channel.id);
    const cur = nowAiringMap[channel.id];
    const upNext = upNextMap[channel.id];
    const fresh = new Date();
    if (cur?.content_id && cur?.content_type) {
      const table = cur.content_type === "movie" ? "videos" : "episodes";
      const { data } = await supabase.from(table).select("*").eq("id", cur.content_id).single();
      if (data) {
        const elapsed = Math.floor((fresh - new Date(cur.start_time)) / 1000);
        setTuningIn(null);
        onPlay({
          ...data,
          url: data.url || data.video_url,
          _type: "live_epg",
          _elapsed: elapsed,
          _channel: channel,
          _epgEntry: cur,
          now_airing: cur.title,
          up_next: upNext?.title ?? null,
          channel_number: channel.channel_number,
          badge_text: channel.badge_text || "LIVE",
        });
        return;
      }
    }
    setTuningIn(null);
    if (channel.stream_url) {
      onPlay({
        ...channel,
        url: channel.stream_url,
        _type: "live",
        now_airing: cur?.title ?? channel.now_airing,
        up_next: upNext?.title ?? channel.up_next,
      });
    }
  }

  const sorted = [...streams].sort((a, b) => (a.channel_number ?? 999) - (b.channel_number ?? 999));
  const enriched = sorted.map(s => ({
    ...s,
    _nowAiring: nowAiringMap[s.id] ?? null,
    _upNext: upNextMap[s.id] ?? null,
    _viewers: viewerCounts[s.id] ?? 0,
  }));

  // Pick hero: admin-pinned first, then has image, then first
  const hero = enriched.find(s => s.is_hero) ?? enriched.find(s => s.hero_image || s.thumbnail) ?? enriched[0] ?? null;
  const hasEpg = epgEntries.length > 0;

  // Total live viewers across all channels
  const totalViewers = Object.values(viewerCounts).reduce((a, b) => a + b, 0);

  return (
    <div style={{ paddingTop: 90, paddingBottom: 80, minHeight: "100vh" }}>
      <style>{`
        @keyframes livepulse { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.4;transform:scale(1.3);} }
        @keyframes spin { to { transform:rotate(360deg); } }
        .livetv-tile:hover { transform: translateY(-5px) !important; box-shadow: 0 20px 48px rgba(0,0,0,0.65) !important; border-color: rgba(99,102,241,0.28) !important; }
      `}</style>

      {sorted.length === 0 ? (
        <div style={{ padding: `80px ${PAD}`, textAlign: "center", color: "#444" }}>
          <p style={{ fontSize: 16 }}>No channels set up yet.</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>Add live streams in the admin panel.</p>
        </div>
      ) : (
        <>
          {/* ── Header ── */}
          <div style={{ padding: `0 ${PAD} 32px`, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(28px, 4vw, 52px)", fontWeight: 400, margin: "0 0 6px", color: "#fff", lineHeight: 1 }}>Live TV</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 13, color: "#3a3a4a" }}>{sorted.length} channel{sorted.length !== 1 ? "s" : ""}</span>
                {totalViewers > 0 && (
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#4b5563" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "livepulse 2s ease-in-out infinite" }} />
                    {totalViewers.toLocaleString()} watching now
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Hero ── */}
          {hero && (
            <div style={{ padding: `0 ${PAD} 52px` }}>
              <HeroChannel channel={hero} onTuneIn={tuneIn} tuning={tuningIn === hero.id} isMobile={isMobile} />
            </div>
          )}

          {/* ── Channel Grid ── */}
          <div style={{ padding: `0 ${PAD} 60px` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#3a3a4a", letterSpacing: "0.12em", textTransform: "uppercase" }}>All Channels</p>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.04)" }} />
            </div>
            <div style={isMobile
              ? { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }
              : { display: "grid", gridTemplateRows: "repeat(2, auto)", gridAutoFlow: "column", gridAutoColumns: "clamp(180px, 14vw, 230px)", gap: 14, overflowX: "auto", paddingBottom: 8 }
            }>
              {enriched.map(s => (
                <ChannelTile
                  key={s.id}
                  stream={s}
                  onTuneIn={tuneIn}
                  tuning={tuningIn === s.id}
                />
              ))}
            </div>
          </div>

          {/* ── EPG ── */}
          {hasEpg && (
            <div style={{ padding: `0 ${PAD} 60px` }}>
              <EpgGrid channels={sorted} epgEntries={epgEntries} onTuneIn={tuneIn} now={now} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Hero Channel ──────────────────────────────────────────────────────────────

function HeroChannel({ channel, onTuneIn, tuning, isMobile }) {
  const [hovered, setHovered] = useState(false);
  const nowTitle = channel._nowAiring?.title || channel.now_airing;
  const upNextTitle = channel._upNext?.title || channel.up_next;
  const now = new Date();

  let progress = 0;
  if (channel._nowAiring) {
    const s = new Date(channel._nowAiring.start_time);
    const e = new Date(channel._nowAiring.end_time);
    progress = Math.max(0, Math.min(1, (now - s) / (e - s)));
  }

  const timeStr = channel._nowAiring
    ? `${new Date(channel._nowAiring.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })} – ${new Date(channel._nowAiring.end_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`
    : null;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onTuneIn(channel)}
      style={{
        position: "relative",
        borderRadius: 18,
        overflow: "hidden",
        height: isMobile ? 260 : "clamp(280px, 36vw, 460px)",
        cursor: "pointer",
        transform: hovered ? "scale(1.004)" : "scale(1)",
        transition: "transform 0.4s ease, box-shadow 0.4s ease",
        boxShadow: hovered ? "0 28px 72px rgba(0,0,0,0.75)" : "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      {/* Background */}
      {(channel.hero_image || channel.thumbnail)
        ? <>
            <img src={channel.hero_image || channel.thumbnail} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.5) saturate(1.1)", transform: "scale(1.04)", transition: "transform 0.6s ease" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.1) 100%)" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 50%)" }} />
          </>
        : <>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 30%, #1e1b4b 60%, #0f172a 100%)" }} />
            <div style={{ position: "absolute", inset: 0, opacity: 0.35, backgroundImage: "radial-gradient(circle at 20% 50%, rgba(99,102,241,0.4) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(139,92,246,0.3) 0%, transparent 50%)" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)" }} />
            {/* Channel number watermark */}
            {channel.channel_number != null && channel.channel_number !== "" && (
              <div style={{ position: "absolute", right: "6%", top: "50%", transform: "translateY(-50%)", fontSize: "clamp(80px, 18vw, 200px)", fontWeight: 900, color: "rgba(255,255,255,0.04)", lineHeight: 1, userSelect: "none", letterSpacing: -8 }}>
                {channel.channel_number}
              </div>
            )}
          </>
      }

      {/* Content */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: isMobile ? "20px 22px" : "clamp(24px, 4vw, 44px)" }}>
        {/* Badges row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#ef4444", borderRadius: 5, padding: "4px 10px" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite" }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", letterSpacing: 1 }}>LIVE</span>
          </div>
          {channel.channel_number != null && channel.channel_number !== "" && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.07)", borderRadius: 4, padding: "3px 9px" }}>
              CH {channel.channel_number}
            </span>
          )}
          <ViewerBadge count={channel._viewers} />
        </div>

        {/* Channel name */}
        <h2 style={{ margin: "0 0 10px", fontSize: isMobile ? 24 : "clamp(26px, 4vw, 44px)", fontFamily: "'DM Serif Display', serif", fontWeight: 400, color: "#fff", lineHeight: 1.1, maxWidth: "60%" }}>
          {channel.title}
        </h2>

        {/* Now airing */}
        {nowTitle && (
          <div style={{ marginBottom: upNextTitle ? 8 : 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: "#ef4444", textTransform: "uppercase", letterSpacing: 1.2 }}>Now Airing</span>
              <span style={{ fontSize: isMobile ? 13 : 15, color: "#e5e5e5", fontWeight: 500 }}>{nowTitle}</span>
              {!isMobile && timeStr && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{timeStr}</span>}
            </div>
            {channel._nowAiring && (
              <div style={{ height: 2, background: "rgba(255,255,255,0.1)", borderRadius: 2, width: "clamp(140px, 28%, 260px)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress * 100}%`, background: "linear-gradient(90deg, #ef4444, #f87171)", borderRadius: 2 }} />
              </div>
            )}
          </div>
        )}

        {upNextTitle && (
          <p style={{ margin: "0 0 18px", fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            <span style={{ color: "rgba(255,255,255,0.18)", marginRight: 6 }}>Up next</span>{upNextTitle}
          </p>
        )}

        {/* CTA */}
        <button
          onClick={e => { e.stopPropagation(); onTuneIn(channel); }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
            background: hovered ? "#fff" : "rgba(255,255,255,0.88)",
            border: "none", borderRadius: 9, padding: isMobile ? "10px 20px" : "12px 26px",
            color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: "pointer",
            transition: "background 0.2s, transform 0.2s",
            transform: hovered ? "scale(1.03)" : "scale(1)",
          }}
        >
          {tuning
            ? <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(0,0,0,0.2)", borderTopColor: "#000", animation: "spin 0.8s linear infinite" }} />
            : <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
          }
          {tuning ? "Tuning in…" : "Watch Live"}
        </button>
      </div>
    </div>
  );
}

// ─── Channel Tile ──────────────────────────────────────────────────────────────

function ChannelTile({ stream, onTuneIn, tuning }) {
  const [hovered, setHovered] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const previewRef = useRef(null);
  const hlsRef = useRef(null);
  const hoverTimer = useRef(null);

  const nowTitle = stream._nowAiring?.title || stream.now_airing;
  const now = new Date();
  let progress = 0;
  if (stream._nowAiring) {
    const s = new Date(stream._nowAiring.start_time), e = new Date(stream._nowAiring.end_time);
    progress = Math.max(0, Math.min(1, (now - s) / (e - s)));
  }

  useEffect(() => {
    if (!hovered || !stream.stream_url || !previewRef.current) return;
    const el = previewRef.current;
    setPreviewReady(false);
    if (isHlsUrl(stream.stream_url)) {
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: false, maxBufferLength: 8, maxMaxBufferLength: 16 });
        hls.loadSource(stream.stream_url);
        hls.attachMedia(el);
        hls.on(Hls.Events.MANIFEST_PARSED, () => el.play().catch(() => {}));
        hlsRef.current = hls;
      } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
        el.src = stream.stream_url;
        el.play().catch(() => {});
      }
    } else {
      el.src = stream.stream_url;
      el.play().catch(() => {});
    }
    const onPlaying = () => setPreviewReady(true);
    el.addEventListener("playing", onPlaying);
    return () => {
      el.removeEventListener("playing", onPlaying);
      el.pause(); el.src = "";
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      setPreviewReady(false);
    };
  }, [hovered, stream.stream_url]);

  return (
    <div
      className="livetv-tile"
      onClick={() => onTuneIn(stream)}
      onMouseEnter={() => { hoverTimer.current = setTimeout(() => setHovered(true), 350); }}
      onMouseLeave={() => { clearTimeout(hoverTimer.current); setHovered(false); }}
      style={{
        borderRadius: 12, overflow: "hidden", background: "#0e0e11", cursor: "pointer",
        border: "1px solid rgba(255,255,255,0.05)",
        transition: "transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease",
      }}
    >
      {/* Thumbnail */}
      <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", background: "#090910" }}>
        {stream.thumbnail
          ? <img src={stream.thumbnail} alt={stream.title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: previewReady ? 0 : 1, transition: "opacity 0.35s" }} />
          : (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0c0c0f 0%, #12121a 100%)", opacity: previewReady ? 0 : 1, transition: "opacity 0.35s" }}>
              {stream.channel_number != null && stream.channel_number !== "" && (
                <span style={{ fontSize: 52, fontWeight: 900, color: "rgba(255,255,255,0.035)", userSelect: "none", letterSpacing: -2 }}>{stream.channel_number}</span>
              )}
            </div>
          )
        }
        <video ref={previewRef} muted playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: previewReady ? 1 : 0, transition: "opacity 0.35s" }} />

        {/* Top-left: LIVE badge */}
        <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 5, zIndex: 2 }}>
          {stream.is_live && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(239,68,68,0.9)", backdropFilter: "blur(4px)", borderRadius: 4, padding: "3px 7px" }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite" }} />
              <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", letterSpacing: 0.5 }}>{stream.badge_text || "LIVE"}</span>
            </div>
          )}
        </div>

        {/* Top-right: viewer count */}
        {stream._viewers > 0 && (
          <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", borderRadius: 5, padding: "3px 8px", display: "flex", alignItems: "center", gap: 4, zIndex: 2 }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
            </svg>
            <span style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>
              {stream._viewers >= 1000 ? `${(stream._viewers / 1000).toFixed(1)}k` : stream._viewers}
            </span>
          </div>
        )}

        {/* Hover play overlay */}
        {tuning
          ? <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }} />
            </div>
          : hovered && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3, background: previewReady ? "transparent" : "rgba(0,0,0,0.15)", transition: "background 0.3s" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(99,102,241,0.88)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", opacity: previewReady ? 0 : 1, transition: "opacity 0.25s", boxShadow: "0 4px 16px rgba(99,102,241,0.4)" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff"><polygon points="5,3 19,12 5,21" /></svg>
              </div>
            </div>
          )
        }

        {/* Bottom gradient for info peek */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 32, background: "linear-gradient(to top, rgba(14,14,17,0.9) 0%, transparent 100%)", zIndex: 1 }} />
      </div>

      {/* Info row */}
      <div style={{ padding: "11px 14px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
          {stream.channel_number != null && stream.channel_number !== "" && (
            <span style={{ fontSize: 9, fontWeight: 700, color: "#252535", flexShrink: 0 }}>CH{stream.channel_number}</span>
          )}
          <span style={{ fontSize: 13, fontWeight: 700, color: "#e5e5e5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{stream.title}</span>
        </div>
        {nowTitle
          ? <p style={{ margin: "0 0 7px", fontSize: 11, color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "#ef4444", marginRight: 6, verticalAlign: "middle", animation: "livepulse 2s infinite" }} />
              {nowTitle}
            </p>
          : <p style={{ margin: "0 0 7px", fontSize: 11, color: "#222" }}>No guide data</p>
        }
        <div style={{ height: 2, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress * 100}%`, background: "linear-gradient(90deg, #4f46e5, #818cf8)", borderRadius: 2 }} />
        </div>
      </div>
    </div>
  );
}

// ─── EPG Grid ─────────────────────────────────────────────────────────────────

function EpgGrid({ channels, epgEntries, onTuneIn, now }) {
  const scrollRef = useRef(null);

  const windowStart = new Date(now);
  windowStart.setMinutes(Math.floor(windowStart.getMinutes() / 30) * 30, 0, 0);
  windowStart.setTime(windowStart.getTime() - 60 * 60000);
  const windowEnd = new Date(windowStart.getTime() + EPG_WINDOW_MINS * 60000);
  const totalPx = EPG_WINDOW_MINS * PX_PER_MIN;
  const nowOffsetPx = Math.max(0, Math.min(totalPx, (now - windowStart) / 60000 * PX_PER_MIN));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = nowOffsetPx - scrollRef.current.clientWidth * 0.3;
    }
  }, []);

  const timeLabels = [];
  for (let m = 0; m < EPG_WINDOW_MINS; m += 30) {
    timeLabels.push({ label: new Date(windowStart.getTime() + m * 60000), left: m * PX_PER_MIN });
  }

  const byChannel = {};
  epgEntries.forEach(e => {
    if (!byChannel[e.channel_id]) byChannel[e.channel_id] = [];
    byChannel[e.channel_id].push(e);
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: "-0.2px" }}>Program Guide</h2>
          <div style={{ height: 1, width: 32, background: "rgba(255,255,255,0.06)" }} />
          <p style={{ margin: 0, fontSize: 12, color: "#3a3a4a" }}>Scroll to browse · click to watch</p>
        </div>
        <button
          onClick={() => { if (scrollRef.current) scrollRef.current.scrollLeft = nowOffsetPx - scrollRef.current.clientWidth * 0.3; }}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 7, padding: "6px 14px", color: "#f87171", fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "background 0.15s", letterSpacing: 0.3 }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.2)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.1)"}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "livepulse 1.5s ease-in-out infinite" }} />
          Live Now
        </button>
      </div>

      <div style={{ display: "flex", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 4px 40px rgba(0,0,0,0.5)" }}>
        {/* Fixed channel column */}
        <div style={{ flexShrink: 0, width: EPG_CH_COL_W, background: "#0b0b0e", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ height: EPG_HDR_H, borderBottom: "1px solid rgba(255,255,255,0.05)", background: "#0b0b0e" }} />
          {channels.map((ch, i) => (
            <div key={ch.id} style={{ height: EPG_ROW_H, display: "flex", alignItems: "center", padding: "0 14px", borderBottom: i < channels.length - 1 ? "1px solid rgba(255,255,255,0.035)" : "none", gap: 8, background: i % 2 === 0 ? "#0b0b0e" : "#0d0d11" }}>
              {ch.channel_number != null && ch.channel_number !== "" && (
                <span style={{ fontSize: 9, color: "#2a2a38", fontWeight: 700, flexShrink: 0, letterSpacing: 0.4, textTransform: "uppercase" }}>CH{ch.channel_number}</span>
              )}
              <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>{ch.title}</span>
            </div>
          ))}
        </div>

        {/* Scrollable grid */}
        <div ref={scrollRef} className="scroll-row" style={{ flex: 1, overflowX: "auto", scrollbarWidth: "none", position: "relative" }}>
          {/* Time ruler */}
          <div style={{ position: "sticky", top: 0, zIndex: 10, width: totalPx, height: EPG_HDR_H, background: "#0b0b0e", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            {timeLabels.map(({ label, left }, i) => (
              <div key={i} style={{ position: "absolute", left, top: 0, height: "100%", display: "flex", alignItems: "center", paddingLeft: 10, borderLeft: left === 0 ? "none" : "1px solid rgba(255,255,255,0.035)" }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: "#3a3a4a", whiteSpace: "nowrap" }}>
                  {label.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                </span>
              </div>
            ))}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: nowOffsetPx - 1, width: 2, background: "linear-gradient(to bottom, #ef4444, rgba(239,68,68,0.3))", zIndex: 6 }} />
          </div>

          {/* Channel rows */}
          {channels.map((ch, ci) => {
            const entries = (byChannel[ch.id] || []).filter(e =>
              new Date(e.end_time) > windowStart && new Date(e.start_time) < windowEnd
            );
            const rowBg = ci % 2 === 0 ? "#0b0b0e" : "#0d0d11";
            return (
              <div key={ch.id} style={{ position: "relative", width: totalPx, height: EPG_ROW_H, borderBottom: ci < channels.length - 1 ? "1px solid rgba(255,255,255,0.035)" : "none", background: rowBg }}>
                <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: Math.min(nowOffsetPx, totalPx), background: "rgba(0,0,0,0.2)", zIndex: 1, pointerEvents: "none" }} />
                <div style={{ position: "absolute", top: 0, bottom: 0, left: nowOffsetPx - 1, width: 2, background: "rgba(239,68,68,0.5)", zIndex: 4, pointerEvents: "none" }} />
                {entries.map(entry => {
                  const eStart = new Date(entry.start_time);
                  const eEnd = new Date(entry.end_time);
                  const leftPx = Math.max(0, (eStart - windowStart) / 60000 * PX_PER_MIN);
                  const rightPx = Math.min(totalPx, (eEnd - windowStart) / 60000 * PX_PER_MIN);
                  const widthPx = rightPx - leftPx;
                  const isPast = eEnd <= now;
                  const isNow = eStart <= now && eEnd > now;
                  if (widthPx < 3) return null;
                  const GAP = 3;
                  return (
                    <div
                      key={entry.id}
                      onClick={() => isNow && ch.is_live && onTuneIn(ch)}
                      style={{
                        position: "absolute",
                        left: leftPx + GAP, width: Math.max(0, widthPx - GAP * 2),
                        top: 6, height: EPG_ROW_H - 12,
                        borderRadius: 7, overflow: "hidden",
                        cursor: isNow && ch.is_live ? "pointer" : "default",
                        padding: widthPx > 60 ? "7px 11px" : "7px 6px",
                        display: "flex", flexDirection: "column", justifyContent: "center",
                        zIndex: isNow ? 3 : 2,
                        transition: "background 0.15s, box-shadow 0.15s",
                        background: isNow
                          ? "linear-gradient(135deg, rgba(99,102,241,0.25) 0%, rgba(79,70,229,0.15) 100%)"
                          : isPast ? "transparent" : "rgba(255,255,255,0.025)",
                        border: isNow
                          ? "1px solid rgba(99,102,241,0.4)"
                          : isPast ? "1px solid transparent" : "1px solid rgba(255,255,255,0.05)",
                        boxShadow: isNow ? "0 2px 16px rgba(79,70,229,0.12)" : "none",
                      }}
                      onMouseEnter={e => { if (isNow && ch.is_live) { e.currentTarget.style.background = "linear-gradient(135deg, rgba(99,102,241,0.38) 0%, rgba(79,70,229,0.25) 100%)"; e.currentTarget.style.boxShadow = "0 4px 24px rgba(79,70,229,0.22)"; } }}
                      onMouseLeave={e => { if (isNow && ch.is_live) { e.currentTarget.style.background = "linear-gradient(135deg, rgba(99,102,241,0.25) 0%, rgba(79,70,229,0.15) 100%)"; e.currentTarget.style.boxShadow = "0 2px 16px rgba(79,70,229,0.12)"; } }}
                    >
                      {isNow && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "linear-gradient(to bottom, #818cf8, #6366f1)", borderRadius: "7px 0 0 7px" }} />}
                      <p style={{ margin: 0, fontSize: widthPx > 100 ? 12 : 11, fontWeight: 600, color: isNow ? "#e0e7ff" : isPast ? "#252535" : "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingLeft: isNow ? 6 : 0 }}>{entry.title}</p>
                      {widthPx > 90 && (
                        <p style={{ margin: "2px 0 0", fontSize: 10, fontWeight: 500, color: isNow ? "#6366f1" : isPast ? "#1a1a22" : "#2e2e3a", whiteSpace: "nowrap", paddingLeft: isNow ? 6 : 0 }}>
                          {eStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                          {" – "}
                          {eEnd.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
