import { useRef, useState, useEffect } from "react";

function useNowTick(ms = 30000) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), ms); return () => clearInterval(t); }, [ms]);
}

export function getTrailerType(url) {
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

export function TrailerModal({ url, title, onClose }) {
  const type = getTrailerType(url);
  const embedUrl = type !== "direct" ? getTrailerEmbedUrl(url) : null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.94)", backdropFilter: "blur(14px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(960px, 92vw)", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: -48, right: 0, background: "none", border: "none", color: "#aaa", fontSize: 32, cursor: "pointer", lineHeight: 1, padding: "4px 8px" }}>×</button>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600 }}>Official Trailer — {title}</p>
        <div style={{ aspectRatio: "16/9", background: "#000", borderRadius: 12, overflow: "hidden", boxShadow: "0 40px 100px rgba(0,0,0,0.9)" }}>
          {type === "direct" ? (
            <video src={url} controls autoPlay style={{ width: "100%", height: "100%", display: "block" }} />
          ) : embedUrl ? (
            <iframe src={embedUrl} style={{ width: "100%", height: "100%", display: "block", border: "none" }} allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#555", fontSize: 14 }}>Unable to play trailer.</div>
          )}
        </div>
        <p style={{ margin: "12px 0 0", textAlign: "center", fontSize: 12, color: "#333" }}>Click anywhere outside to close</p>
      </div>
    </div>
  );
}

export function LiveChannelStrip({ channels, epgEntries, currentId, onSwitch }) {
  const scrollRef = useRef(null);
  useNowTick();
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
          const isCurrent = String(ch.id) === String(currentId);
          const nowAiring = nowByChannel[ch.id];
          return (
            <div key={ch.id} onClick={() => !isCurrent && onSwitch(ch)}
              style={{
                flexShrink: 0, width: 175, borderRadius: 10, padding: "12px 14px",
                background: isCurrent ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${isCurrent ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.07)"}`,
                cursor: isCurrent ? "default" : "pointer",
                transition: "background 0.15s, border-color 0.15s",
                position: "relative", overflow: "hidden",
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
              <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: isCurrent ? "#e0e7ff" : "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name || ch.title}</p>
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

export function FullscreenGuide({ channels, epgEntries, currentId, onSwitch }) {
  useNowTick();
  const now = new Date();
  const nowByChannel = {};
  epgEntries.forEach(e => {
    const s = new Date(e.start_time), en = new Date(e.end_time);
    if (s <= now && en > now) nowByChannel[e.channel_id] = e;
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", gap: 8, maxHeight: "42vh", overflowY: "auto" }}>
      {channels.map(ch => {
        const isCurrent = String(ch.id) === String(currentId);
        const nowAiring = nowByChannel[ch.id];
        return (
          <div key={ch.id} onClick={() => !isCurrent && onSwitch(ch)}
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
            <p style={{ margin: "0 0 3px", fontSize: 12, fontWeight: 700, color: isCurrent ? "#e0e7ff" : "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name || ch.title}</p>
            <p style={{ margin: 0, fontSize: 10, color: isCurrent ? "#6366f1" : "#2e2e3a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {nowAiring ? nowAiring.title : "No guide info"}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function getEmbedUrl(url) {
  if (!url) return null;
  const match = url.match(/archive\.org\/download\/([^/]+)/);
  if (match) return `https://archive.org/embed/${match[1]}`;
  if (url.includes("archive.org/embed/")) return url;
  return null;
}

export function isHlsUrl(url) {
  return !!url && (url.includes(".m3u8") || url.includes("m3u8"));
}
