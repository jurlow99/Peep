import { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import { supabase } from "../supabase";

const PAD = "clamp(16px, 5vw, 96px)";

const PX_PER_MIN = 6;
const EPG_WINDOW_MINS = 5 * 60;
const EPG_CH_COL_W = 148;
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

export function LiveTVPage({ streams, epgEntries, onPlay }) {
  const [tuningIn, setTuningIn] = useState(null);
  const now = new Date();
  const isMobile = useIsMobile();

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

  const sortedStreams = [...streams].sort((a, b) => (a.channel_number ?? 999) - (b.channel_number ?? 999));
  const enrichedStreams = sortedStreams.map(s => ({
    ...s,
    _nowAiring: nowAiringMap[s.id] ?? null,
    _upNext: upNextMap[s.id] ?? null,
  }));
  const featured = enrichedStreams.slice(0, 3);
  const hasEpg = epgEntries.length > 0;

  return (
    <div style={{ paddingTop: 100, paddingBottom: 80, minHeight: "100vh" }}>
      <style>{`
        @keyframes livepulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(1.3); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div style={{ padding: `0 ${PAD} 32px` }}>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 400, margin: "0 0 6px", color: "#fff" }}>Live TV</h1>
        <p style={{ margin: 0, fontSize: 14, color: "#555" }}>
          {sortedStreams.length > 0 ? `${sortedStreams.length} channel${sortedStreams.length !== 1 ? "s" : ""}` : "No channels set up yet."}
        </p>
      </div>

      {sortedStreams.length === 0 && (
        <div style={{ padding: `80px ${PAD}`, textAlign: "center", color: "#444" }}>
          <p style={{ fontSize: 16 }}>No channels set up yet.</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>Add live streams in the admin panel.</p>
        </div>
      )}

      {sortedStreams.length > 0 && (
        <>
          {/* Featured — top 3 */}
          <div style={{ padding: `0 ${PAD}`, marginBottom: 48 }}>
            <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 600, color: "#444", letterSpacing: "0.1em", textTransform: "uppercase" }}>On Now</p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 14 }}>
              {featured.map(s => (
                <ChannelCard key={s.id} stream={s} onTuneIn={tuneIn} tuning={tuningIn === s.id} />
              ))}
            </div>
          </div>

          {/* All channels list */}
          <div style={{ padding: `0 ${PAD}`, marginBottom: 56 }}>
            <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 600, color: "#444", letterSpacing: "0.1em", textTransform: "uppercase" }}>All Channels</p>
            <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.05)" }}>
              {enrichedStreams.map((s, i) => (
                <ChannelRow
                  key={s.id}
                  stream={s}
                  onTuneIn={tuneIn}
                  tuning={tuningIn === s.id}
                  now={now}
                  isLast={i === enrichedStreams.length - 1}
                  isMobile={isMobile}
                />
              ))}
            </div>
          </div>

          {/* EPG */}
          {hasEpg && (
            <div style={{ padding: `0 ${PAD}`, marginBottom: 56 }}>
              <EpgGrid channels={sortedStreams} epgEntries={epgEntries} onTuneIn={tuneIn} now={now} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChannelCard({ stream, onTuneIn, tuning }) {
  const [hovered, setHovered] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const previewRef = useRef(null);
  const hlsRef = useRef(null);
  const hoverTimer = useRef(null);

  const nowTitle = stream._nowAiring?.title || stream.now_airing;
  const upNextTitle = stream._upNext?.title || stream.up_next;

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
      el.pause();
      el.src = "";
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      setPreviewReady(false);
    };
  }, [hovered, stream.stream_url]);

  return (
    <div
      onClick={() => onTuneIn(stream)}
      onMouseEnter={() => { hoverTimer.current = setTimeout(() => setHovered(true), 300); }}
      onMouseLeave={() => { clearTimeout(hoverTimer.current); setHovered(false); }}
      style={{
        cursor: "pointer", borderRadius: 10, overflow: "hidden",
        background: "#0e0e10",
        border: `1px solid ${hovered ? "rgba(99,102,241,0.35)" : "rgba(255,255,255,0.06)"}`,
        transform: hovered ? "translateY(-3px)" : "none",
        transition: "all 0.2s",
        boxShadow: hovered ? "0 12px 32px rgba(0,0,0,0.6)" : "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      {/* Thumbnail */}
      <div style={{ position: "relative", aspectRatio: "16/9", overflow: "hidden", background: "#0a0a0a" }}>
        {stream.thumbnail
          ? <img src={stream.thumbnail} alt={stream.title} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: previewReady ? 0 : 1, transition: "opacity 0.4s" }} />
          : <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, opacity: previewReady ? 0 : 1, transition: "opacity 0.4s", background: "linear-gradient(135deg, #0c0c0e 0%, #111116 100%)" }}>
              {stream.channel_number != null && stream.channel_number !== "" && (
                <span style={{ fontSize: 56, fontWeight: 900, color: "rgba(255,255,255,0.04)", lineHeight: 1, letterSpacing: -3, userSelect: "none" }}>{stream.channel_number}</span>
              )}
              <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.12)", textAlign: "center", padding: "0 12px", letterSpacing: "0.06em", textTransform: "uppercase" }}>{stream.title}</span>
            </div>
        }
        <video ref={previewRef} muted playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: previewReady ? 1 : 0, transition: "opacity 0.4s" }} />

        {stream.is_live && (
          <div style={{ position: "absolute", top: 8, left: 8, display: "flex", alignItems: "center", gap: 4, background: "#ef4444", borderRadius: 4, padding: "3px 8px", zIndex: 2 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite" }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", letterSpacing: 0.5 }}>{stream.badge_text || "LIVE"}</span>
          </div>
        )}
        {stream.channel_number != null && stream.channel_number !== "" && (
          <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", borderRadius: 4, padding: "3px 7px", fontSize: 10, fontWeight: 700, color: "#fff", zIndex: 2 }}>
            CH {stream.channel_number}
          </div>
        )}

        {tuning ? (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : hovered && (
          <div style={{ position: "absolute", inset: 0, background: previewReady ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.3s", zIndex: 3 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(99,102,241,0.9)", display: "flex", alignItems: "center", justifyContent: "center", opacity: previewReady ? 0.85 : 1, transition: "opacity 0.3s" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><polygon points="5,3 19,12 5,21" /></svg>
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "11px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
          {stream.channel_number != null && stream.channel_number !== "" && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#2e2e3a", flexShrink: 0 }}>CH{stream.channel_number}</span>
          )}
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#e5e5e5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stream.title}</p>
        </div>
        {nowTitle
          ? <p style={{ margin: "0 0 2px", fontSize: 11, color: "#818cf8", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span style={{ color: "#374151", marginRight: 4 }}>Now</span>{nowTitle}</p>
          : <p style={{ margin: "0 0 2px", fontSize: 11, color: "#2a2a2a" }}>No program info</p>
        }
        {upNextTitle && (
          <p style={{ margin: 0, fontSize: 11, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span style={{ marginRight: 4 }}>↪</span>{upNextTitle}</p>
        )}
      </div>
    </div>
  );
}

function ChannelRow({ stream, onTuneIn, tuning, now, isLast, isMobile }) {
  const [hovered, setHovered] = useState(false);

  const nowAiring = stream._nowAiring;
  const upNext = stream._upNext;
  const nowTitle = nowAiring?.title || stream.now_airing;
  const upNextTitle = upNext?.title || stream.up_next;

  let progress = 0;
  if (nowAiring) {
    const start = new Date(nowAiring.start_time);
    const end = new Date(nowAiring.end_time);
    progress = Math.max(0, Math.min(1, (now - start) / (end - start)));
  }

  const timeStr = nowAiring
    ? `${new Date(nowAiring.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })} – ${new Date(nowAiring.end_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`
    : null;

  return (
    <div
      onClick={() => onTuneIn(stream)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "140px 1fr 40px" : "200px 1fr 180px 44px",
        alignItems: "center",
        gap: 12,
        padding: "0 20px",
        height: 68,
        background: hovered ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.015)",
        cursor: "pointer",
        transition: "background 0.15s",
        borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.04)",
      }}
    >
      {/* Channel identity */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {stream.is_live && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, background: "#ef4444", borderRadius: 3, padding: "2px 6px", flexShrink: 0 }}>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite" }} />
            <span style={{ fontSize: 8, fontWeight: 800, color: "#fff", letterSpacing: 0.5 }}>LIVE</span>
          </div>
        )}
        {stream.channel_number != null && stream.channel_number !== "" && (
          <span style={{ fontSize: 10, fontWeight: 700, color: "#2e2e3a", flexShrink: 0 }}>CH{stream.channel_number}</span>
        )}
        <span style={{ fontSize: 13, fontWeight: 600, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stream.title}</span>
      </div>

      {/* Now playing + progress bar */}
      <div style={{ minWidth: 0 }}>
        {nowTitle ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 5 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#3f3f50", letterSpacing: "0.08em", textTransform: "uppercase", flexShrink: 0 }}>Now</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#d1d5db", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nowTitle}</span>
              {!isMobile && timeStr && <span style={{ fontSize: 10, color: "#2e2e3a", flexShrink: 0 }}>{timeStr}</span>}
            </div>
            <div style={{ height: 2, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress * 100}%`, background: "linear-gradient(90deg, #4f46e5, #818cf8)", borderRadius: 2 }} />
            </div>
          </>
        ) : (
          <span style={{ fontSize: 12, color: "#222" }}>No guide data</span>
        )}
      </div>

      {/* Up next — desktop only */}
      {!isMobile && (
        <div style={{ minWidth: 0 }}>
          {upNextTitle ? (
            <>
              <span style={{ display: "block", fontSize: 9, fontWeight: 700, color: "#2a2a38", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>Up Next</span>
              <span style={{ display: "block", fontSize: 12, color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{upNextTitle}</span>
            </>
          ) : null}
        </div>
      )}

      {/* Watch button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {tuning ? (
          <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }} />
        ) : (
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: hovered ? "rgba(99,102,241,0.15)" : "transparent",
            border: `1px solid ${hovered ? "rgba(99,102,241,0.35)" : "rgba(255,255,255,0.06)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s",
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill={hovered ? "#818cf8" : "#374151"}><polygon points="5,3 19,12 5,21" /></svg>
          </div>
        )}
      </div>
    </div>
  );
}

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: "0 0 2px", fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px" }}>Program Guide</h2>
          <p style={{ margin: 0, fontSize: 12, color: "#555" }}>Scroll to browse · click a live program to watch</p>
        </div>
        <button
          onClick={() => { if (scrollRef.current) scrollRef.current.scrollLeft = nowOffsetPx - scrollRef.current.clientWidth * 0.3; }}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "7px 14px", color: "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "background 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.22)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.12)"}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "livepulse 1.5s ease-in-out infinite" }} />
          Live Now
        </button>
      </div>

      <div style={{ display: "flex", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 4px 32px rgba(0,0,0,0.5)" }}>
        {/* Fixed channel column */}
        <div style={{ flexShrink: 0, width: EPG_CH_COL_W, background: "#0c0c0e", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ height: EPG_HDR_H, borderBottom: "1px solid rgba(255,255,255,0.06)", background: "#0c0c0e" }} />
          {channels.map((ch, i) => (
            <div key={ch.id} style={{ height: EPG_ROW_H, display: "flex", alignItems: "center", padding: "0 14px", borderBottom: i < channels.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", gap: 8, background: i % 2 === 0 ? "#0c0c0e" : "#0e0e11" }}>
              {ch.channel_number != null && ch.channel_number !== "" && (
                <span style={{ fontSize: 9, color: "#3a3a4a", fontWeight: 700, flexShrink: 0, letterSpacing: "0.5px", textTransform: "uppercase" }}>CH{ch.channel_number}</span>
              )}
              <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>{ch.title}</span>
            </div>
          ))}
        </div>

        {/* Scrollable grid */}
        <div ref={scrollRef} className="scroll-row" style={{ flex: 1, overflowX: "auto", scrollbarWidth: "none", position: "relative" }}>
          {/* Time ruler */}
          <div style={{ position: "sticky", top: 0, zIndex: 10, width: totalPx, height: EPG_HDR_H, background: "#0c0c0e", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {timeLabels.map(({ label, left }, i) => (
              <div key={i} style={{ position: "absolute", left, top: 0, height: "100%", display: "flex", alignItems: "center", paddingLeft: 10, borderLeft: left === 0 ? "none" : "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: "#4b5563", whiteSpace: "nowrap", letterSpacing: "0.2px" }}>
                  {label.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                </span>
              </div>
            ))}
            <div style={{ position: "absolute", top: 0, bottom: 0, left: nowOffsetPx - 1, width: 2, background: "linear-gradient(to bottom, #ef4444, rgba(239,68,68,0.4))", zIndex: 6 }} />
          </div>

          {/* Channel rows */}
          {channels.map((ch, ci) => {
            const entries = (byChannel[ch.id] || []).filter(e =>
              new Date(e.end_time) > windowStart && new Date(e.start_time) < windowEnd
            );
            const rowBg = ci % 2 === 0 ? "#0c0c0e" : "#0e0e11";
            return (
              <div key={ch.id} style={{ position: "relative", width: totalPx, height: EPG_ROW_H, borderBottom: ci < channels.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", background: rowBg }}>
                <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: Math.min(nowOffsetPx, totalPx), background: "rgba(0,0,0,0.25)", zIndex: 1, pointerEvents: "none" }} />
                <div style={{ position: "absolute", top: 0, bottom: 0, left: nowOffsetPx - 1, width: 2, background: "rgba(239,68,68,0.6)", zIndex: 4, pointerEvents: "none" }} />
                {entries.map(entry => {
                  const eStart = new Date(entry.start_time);
                  const eEnd = new Date(entry.end_time);
                  const leftPx = Math.max(0, (eStart - windowStart) / 60000 * PX_PER_MIN);
                  const rightPx = Math.min(totalPx, (eEnd - windowStart) / 60000 * PX_PER_MIN);
                  const widthPx = rightPx - leftPx;
                  const isPast = eEnd <= now;
                  const isNow = eStart <= now && eEnd > now;
                  const isFuture = eStart > now;
                  if (widthPx < 3) return null;
                  const GAP = 3;
                  return (
                    <div key={entry.id}
                      onClick={() => isNow && ch.is_live && onTuneIn(ch)}
                      style={{
                        position: "absolute",
                        left: leftPx + GAP,
                        width: Math.max(0, widthPx - GAP * 2),
                        top: 6, height: EPG_ROW_H - 12,
                        borderRadius: 8, overflow: "hidden",
                        cursor: isNow && ch.is_live ? "pointer" : "default",
                        padding: widthPx > 60 ? "7px 11px" : "7px 7px",
                        display: "flex", flexDirection: "column", justifyContent: "center",
                        zIndex: isNow ? 3 : 2,
                        transition: "background 0.15s, box-shadow 0.15s",
                        background: isNow
                          ? "linear-gradient(135deg, rgba(99,102,241,0.28) 0%, rgba(79,70,229,0.18) 100%)"
                          : isFuture ? "rgba(255,255,255,0.03)" : "transparent",
                        border: isNow
                          ? "1px solid rgba(99,102,241,0.45)"
                          : isFuture ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
                        boxShadow: isNow ? "0 2px 16px rgba(79,70,229,0.15)" : "none",
                      }}
                      onMouseEnter={e => { if (isNow && ch.is_live) { e.currentTarget.style.background = "linear-gradient(135deg, rgba(99,102,241,0.42) 0%, rgba(79,70,229,0.28) 100%)"; e.currentTarget.style.boxShadow = "0 4px 24px rgba(79,70,229,0.25)"; } }}
                      onMouseLeave={e => { if (isNow && ch.is_live) { e.currentTarget.style.background = "linear-gradient(135deg, rgba(99,102,241,0.28) 0%, rgba(79,70,229,0.18) 100%)"; e.currentTarget.style.boxShadow = "0 2px 16px rgba(79,70,229,0.15)"; } }}
                    >
                      {isNow && (
                        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "linear-gradient(to bottom, #818cf8, #6366f1)", borderRadius: "8px 0 0 8px" }} />
                      )}
                      <p style={{ margin: 0, fontSize: widthPx > 100 ? 12 : 11, fontWeight: 600, color: isNow ? "#e0e7ff" : isPast ? "#2e2e3a" : "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingLeft: isNow ? 6 : 0 }}>{entry.title}</p>
                      {widthPx > 90 && (
                        <p style={{ margin: "2px 0 0", fontSize: 10, fontWeight: 500, color: isNow ? "#6366f1" : isPast ? "#1e1e28" : "#374151", whiteSpace: "nowrap", paddingLeft: isNow ? 6 : 0 }}>
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
