import { useChannelBlackout } from "../../hooks/useChannelBlackout";
import { startPreroll } from "../../lib/preroll";
import { trackLiveVideo } from "../../lib/liveViewing";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { supabase } from "../../supabase";
import { packagesForRow, packageChannels } from "../../lib/multiview";
import { filterByTier } from "../../lib/tiers";
import { PAD } from "../../lib/theme";

const control = { background: "#242424", color: "white", border: "1px solid #555", borderRadius: 8, padding: "10px 16px", cursor: "pointer" };
function playbackURL(channel, feeds) {
  return feeds.find(f => f.id === channel.live_feed_id)?.cloudflare_hls_url || channel.hls_url || (channel.stream_uid ? `https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com/${channel.stream_uid}/manifest/video.m3u8` : "");
}
function StreamTile({ channel, url, audible, onAudio }) {
  const video = useRef(null);
  const blackout = useChannelBlackout(channel.id, channel);
  const blocked = blackout.loading || !!blackout.message || !!blackout.error;
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = video.current;
    if (blocked || !element) return;
    let hls;
    const start = () => element.play().catch(() => setError("Select audio or press play to start."));
    if (/\.m3u8(?:\?|$)/i.test(url) && !element.canPlayType("application/vnd.apple.mpegurl") && Hls.isSupported()) {
      hls = new Hls({ maxMaxBufferLength: 20, capLevelToPlayerSize: true });
      hls.loadSource(url); hls.attachMedia(element);
      hls.on(Hls.Events.MANIFEST_PARSED, start);
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) setError("This channel is unavailable. Try again."); });
    } else { element.src = url; start(); }
    return () => { hls?.destroy(); element.pause(); element.removeAttribute("src"); element.load(); };
  }, [url, attempt, blocked]);
  useEffect(() => { if (video.current) video.current.muted = !audible; }, [audible]);
  useEffect(() => { if (!blocked) return trackLiveVideo(video.current, Number(channel.id), "multiview"); }, [channel.id, blocked]);
  return <div style={{ minWidth: 0, border: `2px solid ${audible ? "#facc15" : "#444"}`, borderRadius: 10, overflow: "hidden" }}>
    {blocked ? <div role="status" style={{ aspectRatio: "16/9", display: "grid", placeContent: "center", textAlign: "center", padding: 24, boxSizing: "border-box", background: "black" }}>{blackout.loading ? "Checking channel…" : blackout.message || blackout.error}{blackout.error && <button style={control} onClick={blackout.retry}>Retry</button>}</div> : <video ref={video} data-channel-id={channel.id} controls playsInline muted={!audible} onVolumeChange={() => {
      if (video.current && !video.current.muted && !audible) onAudio();
    }} onPlaying={() => setError("")} onError={() => setError("This channel is unavailable. Try again.")} style={{ width: "100%", aspectRatio: "16/9", background: "black", display: "block" }} />}
    <div style={{ padding: 12 }}><strong>{channel.name}</strong> <button disabled={blocked} style={{ ...control, marginLeft: 12 }} onClick={() => { onAudio(); video.current?.play().then(() => setError("")).catch(() => setError("Press play on the video.")); }}>{audible ? "Audio on" : "Listen"}</button>
      {error && !blocked && <p role="status">{error} <button style={control} onClick={() => { setError(""); setAttempt(a => a + 1); }}>Retry</button></p>}
    </div>
  </div>;
}
function MultiviewPlayer({ pkg, pair, feeds, onClose }) {
  const [audio, setAudio] = useState(0);
  const [adPending, setAdPending] = useState(true);
  const adVideo = useRef(null);
  const adContainer = useRef(null);
  useEffect(() => startPreroll({ client: supabase, video: adVideo.current, container: adContainer.current, scope: "multiview", contentId: "", onBusy: setAdPending, onReady: () => setAdPending(false) }), []);
  const close = useRef(null);
  const videos = useRef(null);
  function selectAudio(index) {
    // Mute synchronously before unmuting the chosen stream.
    videos.current?.querySelectorAll("video").forEach(video => { video.muted = video.dataset.channelId !== String(pair[index].id); });
    setAudio(index);
  }
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.setProperty("overflow", "hidden"); close.current?.focus();
    const key = e => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "Tab") {
        const focusable = [...videos.current.querySelectorAll("button,video")];
        const index = focusable.indexOf(document.activeElement);
        if (e.shiftKey && index <= 0) { e.preventDefault(); focusable.at(-1)?.focus(); }
        else if (!e.shiftKey && index === focusable.length - 1) { e.preventDefault(); focusable[0]?.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); document.body.style.setProperty("overflow", overflow); previous?.focus(); };
  }, [onClose]);
  return createPortal(<div ref={videos} role="dialog" aria-modal="true" aria-label={pkg.title} style={{ position: "fixed", inset: 0, zIndex: 1000, fontFamily: "Space Grotesk, sans-serif", background: "#080808", color: "white", padding: "clamp(16px, 4vw, 60px)", overflow: "auto" }}>
    <button ref={close} style={control} onClick={onClose}>Close multiview</button><h1>{pkg.title}</h1><p style={{ color: "#aaa" }}>{pkg.description || "Watch together. Choose one channel for audio."}</p>
    <div style={{ position: "relative", display: adPending ? "block" : "none", height: "70vh", background: "black" }}><video ref={adVideo} playsInline style={{ width: "100%", height: "100%" }} /><div ref={adContainer} style={{ position: "absolute", inset: 0 }} /></div>
    {!adPending && <div style={{ display: "grid", gridTemplateColumns: pair.length === 4 ? "repeat(2, minmax(0, 1fr))" : "repeat(auto-fit, minmax(min(100%, 400px), 1fr))", gap: 20 }}>{pair.map((channel, i) => <StreamTile key={channel.id} channel={channel} url={playbackURL(channel, feeds)} audible={audio === i} onAudio={() => selectAudio(i)} />)}</div>}
  </div>, document.body);
}
export default function MultiviewShelf({ row, userTier }) {
  const [items, setItems] = useState([]);
  const [feeds, setFeeds] = useState([]);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from("multiview_packages").select("*").eq("enabled", true).order("position").order("created_at"),
      supabase.from("channels").select("*").eq("is_active", true),
      supabase.from("public_live_feeds").select("id,cloudflare_hls_url"),
    ]).then(([packages, channels, feedsResult]) => {
      if (!active) return;
      const publicFeeds = feedsResult.data || [];
      const eligible = filterByTier(channels.data || [], userTier);
      setFeeds(publicFeeds);
      setItems(packagesForRow(row, filterByTier(packages.data || [], userTier)).flatMap(pkg => {
        const pair = packageChannels(pkg, eligible);
        return [2, 4].includes(pair.length) && pair.every(c => playbackURL(c, publicFeeds)) ? [{ pkg, pair }] : [];
      }));
    });
    return () => { active = false; };
  }, [row, userTier]);
  if (!items.length) return null;
  return <section style={{ padding: `24px ${PAD}`, color: "white" }}>
    <h2 style={{ fontWeight: 400 }}>{row.title}</h2><div style={{ display: "flex", gap: 20, overflowX: "auto", paddingBottom: 16 }}>{items.map(item => <button key={item.pkg.id} onClick={() => setSelected(item)} style={{ ...control, padding: 0, textAlign: "left", flex: "0 0 320px", overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: 130, gap: 2 }}>{item.pair.map(c => <div key={c.id} style={{ minHeight: 0, background: "#181818", display: "grid", placeItems: "center", overflow: "hidden" }}>{c.hero_url || c.logo_url ? <img src={c.hero_url || c.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : c.name}</div>)}</div>
      <div style={{ padding: 16 }}><strong>{item.pkg.title}</strong><p style={{ color: "#aaa", fontSize: 12 }}>{item.pair.map(c => c.name).join(" + ")}</p><span style={{ fontSize: 11, color: "#aaa" }}>MULTIVIEW · {item.pair.length} CHANNELS</span></div>
    </button>)}</div>
    {selected && <MultiviewPlayer pkg={selected.pkg} pair={selected.pair} feeds={feeds} onClose={() => setSelected(null)} />}
  </section>;
}
