import { useEffect, useRef, useCallback, useState } from "react";
import Hls from "hls.js";
import { MarketOverlay } from "./MarketOverlay";

/**
 * A small, purpose-built live player for the Predictions tab -- not a reuse
 * of PlayerView (FAST channels) or StreamerProfile's player (creator
 * streams + chat/follow); prediction events are their own curated content
 * type, decoupled from both existing lanes.
 *
 * The hls.js config below is the same tuning StreamerProfile's live player
 * uses (see its VideoPlayer for the reasoning behind each value) -- proven
 * settings for Cloudflare Stream live playback, not reinvented here.
 */
export function EventPlayer({ url, streamId }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [, setReady] = useState(false); // forces a render once playback actually starts

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !url) return;
    let cancelled = false;

    if (Hls.isSupported() && /\.m3u8/i.test(url)) {
      const hls = new Hls({
        enableWorker: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 0,
        lowLatencyMode: false,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        startLevel: -1,
        capLevelToPlayerSize: true,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
      });
      hls.loadSource(url);
      hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return;
        el.play().then(() => setReady(true)).catch(() => {});
      });
      hlsRef.current = hls;
    } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = url;
      el.play().then(() => setReady(true)).catch(() => {});
    }

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [url]);

  // Read imperatively by the reveal scheduler on each tick, not reactive
  // state -- latency drifts continuously and isn't something a re-render
  // should track (see MarketOverlay's getPlayerLatencyMs doc).
  const getPlayerLatencyMs = useCallback(() => {
    const hls = hlsRef.current;
    const el = videoRef.current;
    if (!hls || !el || hls.liveSyncPosition == null) return 0;
    return Math.max(0, (hls.liveSyncPosition - el.currentTime) * 1000);
  }, []);

  return (
    <div style={{ position: "relative", background: "#000", borderRadius: 14, overflow: "hidden", aspectRatio: "16/9", boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}>
      <video ref={videoRef} controls autoPlay playsInline style={{ width: "100%", height: "100%", display: "block" }} />
      {streamId && <MarketOverlay streamId={streamId} getPlayerLatencyMs={getPlayerLatencyMs} />}
    </div>
  );
}
