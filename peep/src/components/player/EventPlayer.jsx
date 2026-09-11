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
  //
  // liveSyncPosition == null is not enough to detect a non-live source:
  // against a VOD (e.g. a test stream with no live edge at all) hls.js can
  // still report a liveSyncPosition, just one with no real relationship to
  // el.currentTime -- the gap between them isn't "latency", it's garbage,
  // and taking it at face value holds every tick for however large that
  // gap happens to be. Two independent guards: check the current level's
  // playlist actually claims to be live, and sanity-bound the result to
  // roughly the range a real Cloudflare Stream edge sits at (spec §3:
  // 6-18s) so any other bad reading degrades to "no correction" instead of
  // silently freezing the overlay.
  const getPlayerLatencyMs = useCallback(() => {
    const hls = hlsRef.current;
    const el = videoRef.current;
    if (!hls || !el) return 0;
    const isLive = hls.levels?.[hls.currentLevel]?.details?.live;
    if (!isLive || hls.liveSyncPosition == null) return 0;
    const latencyMs = (hls.liveSyncPosition - el.currentTime) * 1000;
    return Number.isFinite(latencyMs) && latencyMs >= 0 && latencyMs < 120_000 ? latencyMs : 0;
  }, []);

  return (
    <div style={{ position: "relative", background: "#000", borderRadius: 14, overflow: "hidden", aspectRatio: "16/9", boxShadow: "0 24px 60px rgba(0,0,0,0.6)" }}>
      <video ref={videoRef} controls autoPlay playsInline style={{ width: "100%", height: "100%", display: "block" }} />
      {streamId && <MarketOverlay streamId={streamId} getPlayerLatencyMs={getPlayerLatencyMs} />}
    </div>
  );
}
