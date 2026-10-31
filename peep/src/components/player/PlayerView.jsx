import {nextSeriesEpisode, allowsEpisodeAutoplay} from "../../lib/seriesPlayback";
import { resolveVODPlayback } from "../../lib/vodStorage";
import { SUPABASE_URL } from "../../lib/config";
import { useChannelBlackout } from "../../hooks/useChannelBlackout";
import { playAdBreak, resizeAdBreak } from "../../lib/adBreak";
import { midrollCuePoints } from "../../lib/adPolicy";
import { trackLiveVideo } from "../../lib/liveViewing";
import { useState, useEffect, useRef, useMemo } from "react";
import Hls from "hls.js";
import { Wordmark } from "../Wordmark";
import { supabase } from "../../supabase";
import { avatarForId } from "../ProfileScreen";
import { PAD, SAFE_TOP } from "../../lib/theme";
import { contentSelect } from "../../lib/contentQueries";

import { useIsMobile } from "../../hooks/useIsMobile";
import { isHlsUrl, getEmbedUrl, LiveChannelStrip, FullscreenGuide, TrailerModal } from "../../lib/playerUtils";
import { rankRelated } from "../../lib/recommendations";
import { PREF_AUTOPLAY_NEXT } from "../../pages/settingsHelpers";
import { VideoCard } from "../browse/BrowseWidgets";

// Browse rows deliberately omit playback URLs. Resolve the entitled row before
// mounting either the ad request or the content player.
export function PlayerView(props) {
  const rawID = String(props.video.id);
  const channelID = ["live", "live_epg"].includes(props.video._type) && /^ch[-_]\d+$/.test(rawID) ? Number(rawID.slice(3)) : null;
  const blackout = useChannelBlackout(channelID);
  if (blackout.loading || blackout.message || blackout.error) return <div style={{ background: "#080808", color: "white", minHeight: "100vh", padding: "clamp(24px, 6vw, 80px)" }}>
    <button type="button" onClick={props.onBack}>Back to browsing</button>
    <h1>{props.video.title}</h1><p role="status">{blackout.loading ? "Checking channel availability…" : blackout.message || blackout.error}</p>
    {blackout.error && <button type="button" onClick={blackout.retry}>Retry</button>}
  </div>;
  return <AvailablePlayerView {...props} />;
}

function AvailablePlayerView(props) {
  const { video, onBack } = props;
  const [resolved, setResolved] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setError("");setResolved(null);
    (async () => {
      let item=video;
      if(!item.url) {
        if (["live","live_epg"].includes(video._type)) throw new Error("A playable stream is not available for this channel.");
        const {data,error}=await supabase.from(video.show_id ? "episodes" : "videos")
          .select(video.show_id ? contentSelect.episodesPlay : contentSelect.videosPlay)
          .eq("id",video.id).abortSignal(abort.signal).maybeSingle();
        if(error || !data?.url)throw new Error("This video is unavailable or your account does not have access.");
        item={...video,...data};
      }
      const url=await resolveVODPlayback(supabase,item.url,SUPABASE_URL);
      if(active)setResolved({...item,url});
    })().catch(error=>{if(active)setError(error.message || "Couldn’t load playback. Please try again.");});
    return () => { active = false; abort.abort(); };
  }, [video, attempt, props.user?.id]);
  if (resolved && resolved.id === video.id) return <ResolvedPlayerView {...props} video={resolved} />;
  return <div style={{ background: "#0a0a0a", color: "white", minHeight: "100vh", padding: 60 }}>
    <button type="button" onClick={onBack}>Back</button>
    {error ? <p role="alert">{error} <button type="button" onClick={() => setAttempt(attempt + 1)}>Retry</button></p> : <p role="status">Preparing playback…</p>}
  </div>;
}

function ResolvedPlayerView({ video, onBack, onGoHome, onSelect, onShowSelect, user, myList, onToggleList, onAuthOpen, onProfileOpen, userAvatarId, userName }) {
  const isMobile = useIsMobile();
  const [allVideos, setAllVideos] = useState([]);
  const [allShows, setAllShows] = useState([]);
  const [nextEpisode, setNextEpisode] = useState(null);
  const [seriesAllowsAutoplay, setSeriesAllowsAutoplay] = useState(false);
  const [countdownActive, setCountdownActive] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const videoRef = useRef(null);
  const adsClearedRef = useRef(false);
  const hlsRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const adContainerRef = useRef(null);
  const adsManagerRef = useRef(null);
  const midrollCuesRef = useRef([]);      // seconds into the title where a mid-roll plays
  const midrollNextRef = useRef(0);       // index of the next cue not yet passed
  const adBreakStopRef = useRef(null);    // disposer of the mid/post-roll in flight
  const postRollFiredRef = useRef(false);
  const [adPlaying, setAdPlaying] = useState(false);
  const adBusyRef = useRef(false);
  adBusyRef.current = adPlaying;
  const [liveChannels, setLiveChannels] = useState([]);
  const [liveEpg, setLiveEpg] = useState([]);

  const isLive = video._type === "live" || video._type === "live_epg";
  const isEpisode = !!video.show_id;
  const [myRating, setMyRating] = useState(null);
  const [ratingCounts, setRatingCounts] = useState({ up: 0, down: 0 });
  const progressTimerRef = useRef(null);
  const viewCountedRef = useRef(false);
  const saveProgressRef = useRef(null);
  const playerContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const countdownGuardRef = useRef(false);
  const [guideVisible, setGuideVisible] = useState(false);
  const [guideExpanded, setGuideExpanded] = useState(false);
  const [currentViewers, setCurrentViewers] = useState(0);
  const guideHideRef = useRef(null);
  const [streamEnded, setStreamEnded] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const netRetryRef = useRef(0);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    Promise.all([
      supabase.from("videos").select("*"),
      supabase.from("shows").select("*"),
    ]).then(([vRes, sRes]) => {
      if (vRes.data) setAllVideos(vRes.data);
      if (sRes.data) setAllShows(sRes.data);
    });
  }, []);

  useEffect(() => {
    if (!isLive) return;
    const epgStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const epgEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    Promise.all([
      supabase.from("channels").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("epg_entries").select("*").gte("end_time", epgStart).lte("start_time", epgEnd),
    ]).then(([liveRes, epgRes]) => {
      if (liveRes.data) setLiveChannels(liveRes.data);
      if (epgRes.data) setLiveEpg(epgRes.data);
    });
  }, [isLive]);

  // Cloudflare stream: subscribe to is_live changes for stream ended state
  useEffect(() => {
    if (!video.stream_uid) return;
    const ch = supabase
      .channel(`live-status-${video.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_streams", filter: `id=eq.${video.id}` },
        ({ new: row }) => { if (!row.is_live) setStreamEnded(true); }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [video.id, video.stream_uid]);

  // Cloudflare stream: load and subscribe to chat messages
  useEffect(() => {
    if (!video.stream_uid) return;
    supabase.from("live_chat").select("id, message, user_id, profile_name, created_at")
      .eq("channel_id", video.id).order("created_at", { ascending: true }).limit(200)
      .then(({ data }) => { if (data) setChatMessages(data); });
    const ch = supabase
      .channel(`chat-${video.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_chat", filter: `channel_id=eq.${video.id}` },
        ({ new: msg }) => {
          setChatMessages(prev => [...prev, msg]);
          setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [video.id, video.stream_uid]);

  async function sendChat() {
    if (!chatInput.trim() || !user || chatSending) return;
    const msg = chatInput.trim();
    const bannedWords = video.banned_words || [];
    if (bannedWords.length > 0) {
      const lower = msg.toLowerCase();
      if (bannedWords.some(w => lower.includes(w.toLowerCase()))) {
        setChatInput("");
        return;
      }
    }
    setChatSending(true);
    setChatInput("");
    await supabase.from("live_chat").insert({
      channel_id: video.id,
      user_id: user.id,
      profile_name: userName || user.email.split("@")[0],
      message: msg,
    });
    setChatSending(false);
  }

  useEffect(() => {
    let cancelled = false;
    setNextEpisode(null);
    setSeriesAllowsAutoplay(false);
    if (!isEpisode) return;
    Promise.all([
      supabase.from("episodes").select("*").eq("show_id", video.show_id),
      supabase.from("shows").select("autoplay_next").eq("id", video.show_id).maybeSingle(),
    ]).then(([episodes, show]) => {
      if (cancelled || episodes.error) return;
      setNextEpisode(nextSeriesEpisode(video, episodes.data || []));
      setSeriesAllowsAutoplay(!show.error && !!show.data && show.data.autoplay_next !== false);
    });
    return () => { cancelled = true; };
  }, [video.id, video.show_id, isEpisode]);

  useEffect(() => {
    setCountdownActive(false);
    setCountdown(10);
    clearInterval(countdownTimerRef.current);
    countdownGuardRef.current = false;
  }, [video.id]);

  useEffect(() => () => clearInterval(countdownTimerRef.current), []);

  useEffect(() => {
    if (viewCountedRef.current) return;
    viewCountedRef.current = true;
    supabase.rpc("increment_view", { p_id: video.id, p_table: isEpisode ? "episodes" : "videos" }).then(() => {}, () => {});
  }, [video.id]);

  useEffect(() => {
    const ct = isEpisode ? "episode" : "movie";
    supabase.from("ratings").select("rating").eq("content_id", video.id).eq("content_type", ct)
      .then(({ data }) => { if (data) setRatingCounts({ up: data.filter(r => r.rating === 1).length, down: data.filter(r => r.rating === -1).length }); });
    if (user) {
      supabase.from("ratings").select("rating").eq("user_id", user.id).eq("content_id", video.id).eq("content_type", ct).maybeSingle()
        .then(({ data }) => { if (data) setMyRating(data.rating); });
    }
  }, [video.id, user]);


  // HLS.js setup for .m3u8 streams — with fatal-error recovery + dead-stream fallback
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !isHlsUrl(video.url) || getEmbedUrl(video.url)) return;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    setPlaybackError(false);
    netRetryRef.current = 0;
    const MAX_NET_RETRY = 4;

    if (Hls.isSupported()) {
      const hlsConfig = isLive
        ? {
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
          }
        : { enableWorker: true };
      const hls = new Hls(hlsConfig);
      hls.loadSource(video.url);
      hls.attachMedia(videoEl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { if (adsClearedRef.current) videoEl.play().catch(() => {}); });
      hls.on(Hls.Events.FRAG_BUFFERED, () => { netRetryRef.current = 0; }); // healthy again → reset
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (!d.fatal) {
          // Non-fatal media hiccup — nudge recovery, keep playing.
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
          return;
        }
        // Fatal error — try to recover before giving up.
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (netRetryRef.current < MAX_NET_RETRY) {
            netRetryRef.current += 1;
            setTimeout(() => { try { hls.startLoad(); } catch {} }, 1000 * netRetryRef.current);
          } else {
            setPlaybackError(true);
          }
        } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try { hls.recoverMediaError(); } catch { setPlaybackError(true); }
        } else {
          try { hls.destroy(); } catch {}
          hlsRef.current = null;
          setPlaybackError(true);
        }
      });
      hlsRef.current = hls;
    } else if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
      videoEl.src = video.url;
      if (adsClearedRef.current) videoEl.play().catch(() => {});
    } else {
      setPlaybackError(true);
    }
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [video.url, retryNonce]);

  useEffect(() => {
    if (!user || getEmbedUrl(video.url) || video._type === "live" || video._type === "live_epg") return;
    const ct = isEpisode ? "episode" : "movie";
    saveProgressRef.current = async () => {
      if (!videoRef.current || !adsClearedRef.current || adBusyRef.current) return;
      const { currentTime, duration } = videoRef.current;
      if (currentTime < 5 || !duration) return;
      await supabase.from("watch_progress").upsert({
        user_id: user.id, content_id: video.id, content_type: ct,
        progress_seconds: currentTime, duration_seconds: duration,
        completed: currentTime / duration > 0.9 || duration - currentTime < 60,
        last_watched_at: new Date().toISOString(),
      }, { onConflict: "user_id,content_id,content_type" });
    };
    progressTimerRef.current = setInterval(() => { saveProgressRef.current?.(); }, 15000);
    return () => clearInterval(progressTimerRef.current);
  }, [video.id, user]);

  useEffect(() => () => { clearInterval(progressTimerRef.current); saveProgressRef.current?.(); }, []);

  useEffect(() => () => { document.body.style.overflow = ""; }, []);

  useEffect(() => {
    if (getEmbedUrl(video.url)) return;
    adsClearedRef.current = false;
    const stop = playAdBreak({ client: supabase, video: videoRef.current, container: adContainerRef.current, placement: "pre_roll",
      scope: isLive ? "live" : isEpisode ? "episode" : "movie",
      contentId: isLive ? String(video.id).replace(/^ch[-_]/, "") : video.id,
      onBusy: setAdPlaying, onManager: manager => { adsManagerRef.current = manager; },
      onReady: () => {
        adsClearedRef.current = true; setPlaybackError(false);
        const element = videoRef.current;
        if (element) { element.style.visibility = "visible"; element.style.display = "block"; element.style.opacity = "1"; }
        if (element && !isHlsUrl(video.url)) {
          element.src = video.url;
          element.load();
        }
        element?.play().catch(() => {});
      },
    });
    return () => {
      stop(); adBreakStopRef.current?.(); adBreakStopRef.current = null;
      adsClearedRef.current = false; midrollCuesRef.current = []; midrollNextRef.current = 0; postRollFiredRef.current = false;
    };
  }, [video.id]);

  // The ad surface follows the player into and out of fullscreen.
  useEffect(() => {
    const element = videoRef.current;
    if (adsManagerRef.current && element) resizeAdBreak(adsManagerRef.current, element.clientWidth, element.clientHeight);
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e) => {
      if (e.key === "Escape") toggleFullscreen();
      if ((e.key === " " || e.key === "Spacebar") && !getEmbedUrl(video.url)) {
        e.preventDefault();
        togglePlayPause();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  useEffect(() => {
    if (adPlaying || !isLive || !String(video.id).startsWith("ch-")) return;
    return trackLiveVideo(videoRef.current, Number(String(video.id).slice(3)));
  }, [video.id, isLive, adPlaying]);

  // live_viewers.channel_id is bigint: FAST channels arrive as "ch-12", creator
  // streams as their numeric id. A non-numeric value would fail the write.
  const viewerChannelId = isLive ? Number(String(video.id ?? "").replace(/^ch[-_]/, "")) || null : null;

  // Live viewer heartbeat — register this session while watching live
  useEffect(() => {
    if (!isLive || !viewerChannelId) return;
    let sid = sessionStorage.getItem("peep_live_session");
    if (!sid) {
      sid = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();
      sessionStorage.setItem("peep_live_session", sid);
    }
    const ping = () => supabase.from("live_viewers").upsert(
      { session_id: sid, channel_id: viewerChannelId, user_id: user?.id ?? null, last_ping: new Date().toISOString() },
      { onConflict: "session_id" }
    ).then(() => {});
    ping();
    const t = setInterval(ping, 30000);
    return () => {
      clearInterval(t);
      supabase.from("live_viewers").delete().eq("session_id", sid).then(() => {});
    };
  }, [viewerChannelId, isLive]);

  // Live viewer count for current channel
  useEffect(() => {
    if (!isLive || !viewerChannelId) return;
    async function fetchCount() {
      const cutoff = new Date(Date.now() - 90 * 1000).toISOString();
      const { count } = await supabase.from("live_viewers")
        .select("*", { count: "exact", head: true })
        .eq("channel_id", viewerChannelId)
        .gte("last_ping", cutoff);
      if (count !== null) setCurrentViewers(count);
    }
    fetchCount();
    const t = setInterval(fetchCount, 30000);
    return () => { clearInterval(t); setCurrentViewers(0); };
  }, [viewerChannelId, isLive]);

  // Live chat — subscribe when 2+ viewers present
  // Fullscreen guide — show on mouse move, expand on scroll down, hide on inactivity
  useEffect(() => {
    if (!isFullscreen || !isLive) {
      setGuideVisible(false);
      setGuideExpanded(false);
      clearTimeout(guideHideRef.current);
      return;
    }
    const container = playerContainerRef.current;
    if (!container) return;

    function arm(expanded) {
      clearTimeout(guideHideRef.current);
      setGuideVisible(true);
      if (expanded) setGuideExpanded(true);
      guideHideRef.current = setTimeout(() => {
        setGuideVisible(false);
        setGuideExpanded(false);
      }, 4500);
    }

    const onMove = () => arm(false);
    const onWheel = e => {
      e.preventDefault();
      if (e.deltaY > 0) arm(true);
      else setGuideExpanded(false);
    };

    container.addEventListener("mousemove", onMove);
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("mousemove", onMove);
      container.removeEventListener("wheel", onWheel);
      clearTimeout(guideHideRef.current);
    };
  }, [isFullscreen, isLive]);

  function toggleFullscreen() {
    setIsFullscreen(prev => {
      document.body.style.overflow = prev ? "" : "hidden";
      return !prev;
    });
  }

  function togglePlayPause() {
    if (!videoRef.current) return;
    if (adPlaying) return;
    if (videoRef.current.paused) videoRef.current.play().catch(() => {});
    else videoRef.current.pause();
  }

  function startCountdown(seconds) {
    const ep = nextEpisode;
    const total = Math.min(10, Math.ceil(seconds));
    setCountdownActive(true);
    setCountdown(total);
    clearInterval(countdownTimerRef.current);
    let remaining = total;
    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownTimerRef.current);
        setCountdownActive(false);
        onSelect(ep);
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }

  function handleTimeUpdate(e) {
    if (!adsClearedRef.current || adBusyRef.current) return;
    const { currentTime, duration } = e.currentTarget;
    if (!duration || isNaN(duration)) return;

    // Mid-roll: the next cue point we've reached. Seeking past several cues
    // plays one break, not one per cue.
    const cues = midrollCuesRef.current;
    if (!isLive && !getEmbedUrl(video.url) && midrollNextRef.current < cues.length && currentTime >= cues[midrollNextRef.current]) {
      while (midrollNextRef.current < cues.length && currentTime >= cues[midrollNextRef.current]) midrollNextRef.current++;
      playMidRoll();
    }
  }

  // Mid- and post-rolls go through the same break player as the pre-roll, so
  // they share its timeouts, cleanup and reporting.
  function runAdBreak(placement, onDone) {
    const element = videoRef.current;
    if (!element || !adContainerRef.current) { onDone(); return; }
    adBreakStopRef.current?.();
    adBreakStopRef.current = playAdBreak({ client: supabase, video: element, container: adContainerRef.current, placement,
      scope: isEpisode ? "episode" : "movie", contentId: video.id,
      onBusy: setAdPlaying, onManager: manager => { adsManagerRef.current = manager; },
      onReady: () => { adBreakStopRef.current = null; onDone(); },
    });
  }

  function playMidRoll() {
    runAdBreak("mid_roll", () => { videoRef.current?.play().catch(() => {}); });
  }

  function playPostRoll(onComplete) {
    if (postRollFiredRef.current) { onComplete(); return; }
    postRollFiredRef.current = true;
    runAdBreak("post_roll", onComplete);
  }

  async function handleEnded() {
    if (!adsClearedRef.current || adBusyRef.current) return;
    if (user && videoRef.current && !getEmbedUrl(video.url)) {
      const { currentTime, duration } = videoRef.current;
      if (duration > 0) {
        const ct = isEpisode ? "episode" : "movie";
        await supabase.from("watch_progress").upsert({ user_id: user.id, content_id: video.id, content_type: ct, progress_seconds: currentTime, duration_seconds: duration, completed: true, last_watched_at: new Date().toISOString() }, { onConflict: "user_id,content_id,content_type" });
      }
    }
    const afterAd = () => {
      if (nextEpisode) {
        countdownGuardRef.current = true;
        if (allowsEpisodeAutoplay(seriesAllowsAutoplay, localStorage.getItem(PREF_AUTOPLAY_NEXT))) startCountdown(10);
        else { setCountdown(0); setCountdownActive(true); }
      }
    };
    if (!getEmbedUrl(video.url)) playPostRoll(afterAd);
    else afterAd();
  }

  function cancelCountdown() {
    countdownGuardRef.current = true;
    setCountdownActive(false);
    clearInterval(countdownTimerRef.current);
  }


  async function rate(val) {
    if (!user) { onAuthOpen?.(); return; }
    const ct = isEpisode ? "episode" : "movie";
    if (myRating === val) {
      await supabase.from("ratings").delete().eq("user_id", user.id).eq("content_id", video.id).eq("content_type", ct);
      setMyRating(null);
      setRatingCounts(p => ({ up: p.up - (val === 1 ? 1 : 0), down: p.down - (val === -1 ? 1 : 0) }));
    } else {
      await supabase.from("ratings").upsert({ user_id: user.id, content_id: video.id, content_type: ct, rating: val }, { onConflict: "user_id,content_id,content_type" });
      setRatingCounts(p => ({ up: p.up + (val === 1 ? 1 : 0) - (myRating === 1 ? 1 : 0), down: p.down + (val === -1 ? 1 : 0) - (myRating === -1 ? 1 : 0) }));
      setMyRating(val);
    }
  }

  function handleLoadedMetadata() {
    if (!videoRef.current || adBusyRef.current) return;
    if (!isLive && !getEmbedUrl(video.url)) {
      midrollCuesRef.current = midrollCuePoints(videoRef.current.duration);
      midrollNextRef.current = 0;
    }
    if ((video._type === "live_epg") && video._elapsed > 0 && !getEmbedUrl(video.url)) {
      const { duration } = videoRef.current;
      if (duration && video._elapsed < duration) videoRef.current.currentTime = video._elapsed;
      return;
    }
    if (!user || getEmbedUrl(video.url)) return;
    const ct = isEpisode ? "episode" : "movie";
    supabase.from("watch_progress").select("progress_seconds, duration_seconds, completed")
      .eq("user_id", user.id).eq("content_id", video.id).eq("content_type", ct).maybeSingle()
      .then(({ data }) => {
        if (!data || data.completed || !videoRef.current) return;
        const pct = data.duration_seconds > 0 ? data.progress_seconds / data.duration_seconds : 0;
        if (data.progress_seconds > 10 && pct < 0.9) videoRef.current.currentTime = data.progress_seconds;
      });
  }

  const allRelatable = [
    ...allVideos.map(v => ({ ...v, _type: "movie" })),
    ...allShows.map(s => ({ ...s, _type: "show" })),
  ];
  const related = isEpisode ? [] : rankRelated(
    video,
    allRelatable.filter(v => !(v._type === "movie" && v.id === video.id)),
  );

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#fff" }}>
      <nav style={{ position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${PAD}`, height: 68, background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "#ccc", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
            Back
          </button>
          <Wordmark height={22} onClick={onGoHome} />
        </div>
        {(() => {
          const av = avatarForId(userAvatarId);
          return user ? (
            <div onClick={onProfileOpen} title={userName ?? "Profile"} style={{ width: 34, height: 34, borderRadius: "50%", background: av?.gradient ?? "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: av ? 15 : 13, fontWeight: 700, cursor: "pointer", color: "#fff", flexShrink: 0, border: "2px solid transparent", transition: "border-color 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#facc15"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}>
              {av ? av.emoji : (userName?.[0] || user.email[0]).toUpperCase()}
            </div>
          ) : null;
        })()}
      </nav>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: `40px ${PAD} 80px` }}>
        <style>{`
          video::-webkit-media-controls-fullscreen-button{display:none!important}
          ${(video._type === "live" || video._type === "live_epg") ? "video::-webkit-media-controls-timeline{display:none!important} video::-webkit-media-controls-time-remaining-display{display:none!important} video::-webkit-media-controls-current-time-display{display:none!important}" : ""}
          @keyframes livepulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(1.3); } }
        `}</style>
        <div ref={playerContainerRef} style={isFullscreen ? { position: "fixed", inset: 0, zIndex: 999, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" } : { position: "relative", marginBottom: 30 }}>
          <div style={isFullscreen ? { position: "relative", width: "100%", height: "100%" } : { background: "#000", borderRadius: 14, overflow: "hidden", aspectRatio: "16/9", boxShadow: "0 32px 80px rgba(0,0,0,0.8)", position: "relative" }}>
            {getEmbedUrl(video.url) ? (
              <iframe src={getEmbedUrl(video.url)} style={{ width: "100%", height: "100%", display: "block", border: "none" }} allowFullScreen allow="autoplay" />
            ) : (
              <video ref={videoRef} controls={!adPlaying} controlsList="nofullscreen" style={{ width: "100%", height: "100%", display: "block", cursor: isFullscreen ? "pointer" : "default" }} poster={video.thumbnail}
                onClick={isFullscreen ? togglePlayPause : undefined}
                onError={() => { if (adsClearedRef.current && !adBusyRef.current && (!Hls.isSupported() || !isHlsUrl(video.url))) setPlaybackError(true); }}
                onTimeUpdate={handleTimeUpdate} onEnded={handleEnded} onLoadedMetadata={handleLoadedMetadata}>
                {!isHlsUrl(video.url) && <source src={video.url} type="video/mp4" />}
              </video>
            )}
            <div ref={adContainerRef} style={{ position: "absolute", inset: 0, zIndex: 10, display: adPlaying ? "block" : "none", pointerEvents: adPlaying ? "auto" : "none" }} />
            {playbackError && !adPlaying && !streamEnded && (
              <div style={{ position: "absolute", inset: 0, zIndex: 20, background: "rgba(0,0,0,0.94)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center" }}>
                <div style={{ fontSize: 46, lineHeight: 1 }}>📡</div>
                <p style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#fff" }}>{isLive ? "Channel unavailable" : "Can't play this video"}</p>
                <p style={{ margin: 0, fontSize: 13, color: "#9ca3af", maxWidth: 360, lineHeight: 1.6 }}>
                  {isLive ? "This channel isn't responding right now. It may be temporarily offline." : "The video stream couldn't be loaded. Please try again."}
                </p>
                <button onClick={() => { setPlaybackError(false); setRetryNonce(n => n + 1); }}
                  style={{ marginTop: 4, background: "#ef4444", border: "none", borderRadius: 8, padding: "10px 22px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Try again
                </button>
              </div>
            )}
            {streamEnded && (
              <div style={{ position: "absolute", inset: 0, zIndex: 20, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                <div style={{ fontSize: 52, lineHeight: 1 }}>📺</div>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#fff" }}>Stream Ended</p>
                <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>The streamer has disconnected.</p>
              </div>
            )}
          </div>
          {!getEmbedUrl(video.url) && (
            <button onClick={toggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} style={{ position: "absolute", bottom: isFullscreen ? 60 : 12, right: 16, zIndex: 1000, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 7, padding: "7px 9px", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center" }}>
              {isFullscreen
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
              }
            </button>
          )}
          {countdownActive && nextEpisode && (
            <div style={{ position: "absolute", bottom: isFullscreen ? 80 : 20, right: 20, background: "rgba(15,15,15,0.96)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "18px 20px", display: "flex", alignItems: "center", gap: 18, minWidth: 290, zIndex: 1000, boxShadow: "0 8px 32px rgba(0,0,0,0.7)" }}>
              {countdown > 0 && <div style={{ position: "relative", flexShrink: 0, width: 54, height: 54 }}>
                <svg width="54" height="54" viewBox="0 0 54 54" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="27" cy="27" r="21" fill="none" stroke="#222" strokeWidth="4" />
                  <circle cx="27" cy="27" r="21" fill="none" stroke="#facc15" strokeWidth="4"
                    strokeDasharray={2 * Math.PI * 21}
                    strokeDashoffset={2 * Math.PI * 21 * (1 - countdown / 10)}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 0.9s linear" }}
                  />
                </svg>
                <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, color: "#fff" }}>{countdown}</span>
              </div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: "0 0 2px", fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1 }}>Next Episode</p>
                <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#e5e5e5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  S{nextEpisode.season} E{nextEpisode.episode_number} · {nextEpisode.title}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { clearInterval(countdownTimerRef.current); onSelect(nextEpisode); }}
                    style={{ background: "#facc15", border: "none", borderRadius: 6, padding: "6px 14px", color: "#0a0a0a", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Play Now
                  </button>
                  <button onClick={cancelCountdown}
                    style={{ background: "transparent", border: "1px solid #2a2a2a", borderRadius: 6, padding: "6px 12px", color: "#666", fontSize: 12, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Fullscreen channel guide overlay ── */}
          {isFullscreen && isLive && guideVisible && (
            <div
              style={{
                position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 50,
                background: guideExpanded
                  ? "linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.88) 75%, transparent 100%)"
                  : "linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)",
                padding: guideExpanded ? "64px 36px 28px" : "48px 36px 22px",
                transition: "padding 0.3s ease",
                cursor: "default",
              }}
              onMouseEnter={() => clearTimeout(guideHideRef.current)}
              onMouseLeave={() => {
                guideHideRef.current = setTimeout(() => { setGuideVisible(false); setGuideExpanded(false); }, 2000);
              }}
            >
              {/* Mini info bar — always visible when guide is shown */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: guideExpanded ? 22 : 0, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#ef4444", borderRadius: 4, padding: "3px 8px" }}>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite" }} />
                    <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", letterSpacing: 1 }}>{video.badge_text || "LIVE"}</span>
                  </div>
                  {video.channel_number != null && video.channel_number !== "" && (
                    <span style={{ fontSize: 11, color: "#555", fontWeight: 600 }}>CH {video.channel_number}</span>
                  )}
                </div>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{video.title}</span>
                {video.now_airing && (
                  <>
                    <span style={{ color: "#2a2a2a", fontSize: 16 }}>·</span>
                    <span style={{ fontSize: 14, color: "#9ca3af" }}>{video.now_airing}</span>
                  </>
                )}
                {currentViewers > 0 && (
                  <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#4b5563" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                    {currentViewers.toLocaleString()} watching
                  </span>
                )}
                {!guideExpanded && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#333", fontSize: 11, marginLeft: "auto" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
                    scroll for guide
                  </div>
                )}
              </div>

              {/* Expanded channel grid */}
              {guideExpanded && liveChannels.length > 0 && (
                <FullscreenGuide
                  channels={liveChannels}
                  epgEntries={liveEpg}
                  currentId={typeof video.id === "string" ? video.id.replace(/^ch-/, "") : video.id}
                  onSwitch={ch => {
                    const now = new Date();
                    const cur = liveEpg.find(e => e.channel_id === ch.id && new Date(e.start_time) <= now && new Date(e.end_time) > now);
                    const upNext = liveEpg.filter(e => e.channel_id === ch.id && new Date(e.start_time) > now).sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
                    const chUrl = ch.hls_url || (ch.stream_uid ? `https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com/${ch.stream_uid}/manifest/video.m3u8` : "");
                    onSelect({ ...ch, id: `ch-${ch.id}`, title: ch.name, url: chUrl, _type: "live", thumbnail: ch.hero_url || ch.logo_url || "", now_airing: cur?.title, up_next: upNext?.title, badge_text: "LIVE" });
                    setGuideVisible(false);
                    setGuideExpanded(false);
                  }}
                />
              )}
            </div>
          )}
        </div>

        {(video._type === "live" || video._type === "live_epg") && (() => {
          // Compute now/next live from the guide for whatever channel is playing —
          // works whether the channel was opened from the grid or the in-player strip.
          const cid = Number(String(video.id || "").replace("ch-", ""));
          const _now = new Date();
          const liveNow = liveEpg.find(e => e.channel_id === cid && new Date(e.start_time) <= _now && new Date(e.end_time) > _now);
          const liveNext = liveEpg.filter(e => e.channel_id === cid && new Date(e.start_time) > _now).sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
          const nowAiring = video.now_airing || liveNow?.title;
          const upNext = video.up_next || liveNext?.title;
          if (!nowAiring && !upNext) return null;
          return (
          <div style={{ marginBottom: 24, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            {nowAiring && (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite", flexShrink: 0 }} />
                <div>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 700 }}>Now Airing</p>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#e5e5e5" }}>{nowAiring}</p>
                </div>
              </div>
            )}
            {upNext && (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#333", flexShrink: 0 }} />
                <div>
                  <p style={{ margin: "0 0 2px", fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 700 }}>Up Next</p>
                  <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>{upNext}</p>
                </div>
              </div>
            )}
            {currentViewers > 0 && (
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#4b5563" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                {currentViewers.toLocaleString()} watching now
              </div>
            )}
          </div>
          );
        })()}

        {/* Live chat — Cloudflare-managed streams only */}
        {video.stream_uid && (
          <div style={{ marginBottom: 24, background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "livepulse 1.5s infinite", flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Live Chat</span>
            </div>
            <div style={{ height: 280, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {chatMessages.length === 0 ? (
                <p style={{ margin: "auto", fontSize: 13, color: "#444", textAlign: "center" }}>No messages yet. Be the first to say hi!</p>
              ) : chatMessages.map(m => (
                <div key={m.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                    {(m.profile_name || "?")[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#facc15", marginRight: 6 }}>{m.profile_name || "Viewer"}</span>
                    <span style={{ fontSize: 13, color: "#e5e5e5", wordBreak: "break-word" }}>{m.message}</span>
                  </div>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>
            <div style={{ borderTop: "1px solid #1e1e1e", padding: "10px 12px", display: "flex", gap: 8 }}>
              {user ? (
                <>
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat()}
                    placeholder="Say something…"
                    maxLength={200}
                    style={{ flex: 1, background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                  />
                  <button onClick={sendChat} disabled={!chatInput.trim() || chatSending}
                    style={{ background: "#facc15", border: "none", borderRadius: 8, padding: "9px 16px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: chatInput.trim() ? "pointer" : "not-allowed", opacity: chatInput.trim() ? 1 : 0.5, flexShrink: 0 }}>
                    Send
                  </button>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "#555", flex: 1, textAlign: "center", padding: "8px 0" }}>
                  <button onClick={onAuthOpen} style={{ background: "none", border: "none", color: "#facc15", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>Sign in</button>
                  {" "}to join the chat
                </p>
              )}
            </div>
          </div>
        )}

        {isLive && liveChannels.length > 0 && (
          <LiveChannelStrip
            channels={liveChannels}
            epgEntries={liveEpg}
            currentId={typeof video.id === "string" ? video.id.replace(/^ch-/, "") : video.id}
            onSwitch={ch => {
              const now = new Date();
              const cur = liveEpg.find(e => e.channel_id === ch.id && new Date(e.start_time) <= now && new Date(e.end_time) > now);
              const upNext = liveEpg.filter(e => e.channel_id === ch.id && new Date(e.start_time) > now).sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
              onSelect({ ...ch, id: `ch-${ch.id}`, title: ch.name, url: ch.hls_url, _type: "live", thumbnail: ch.hero_url || ch.logo_url || "", now_airing: cur?.title, up_next: upNext?.title, badge_text: "LIVE" });
            }}
          />
        )}


        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 48, gap: isMobile ? 24 : 0 }}>
          <div style={{ flex: 1, maxWidth: 700 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              {(video._type === "live" || video._type === "live_epg") && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#ef4444", borderRadius: 5, padding: "4px 10px" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", animation: "livepulse 1.5s infinite" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: 0.5 }}>{video.badge_text || "LIVE"}</span>
                </div>
              )}
              {video.channel_number != null && video.channel_number !== "" && (
                <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>CH {video.channel_number}</span>
              )}
            </div>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 38, margin: "0 0 14px", fontWeight: 400 }}>{video.title}</h1>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
              {video.score && <span style={{ color: "#4ade80", fontWeight: 700, fontSize: 14 }}>{video.score}% Match</span>}
              {video.year && <span style={{ color: "#666", fontSize: 13 }}>{video.year}</span>}
              {video.rating && <span style={{ border: "1px solid #2e2e2e", color: "#666", fontSize: 11, padding: "2px 8px", borderRadius: 4 }}>{video.rating}</span>}
              {video.duration && <span style={{ color: "#666", fontSize: 13 }}>{video.duration}</span>}
              {video._type !== "live" && <span style={{ background: "#1a1a1a", border: "1px solid #222", color: "#777", fontSize: 11, padding: "3px 10px", borderRadius: 4, fontWeight: 600, letterSpacing: 0.5 }}>FREE</span>}
            </div>
            {video.description && <p style={{ fontSize: 15, color: "#888", lineHeight: 1.8, margin: 0 }}>{video.description}</p>}
          </div>
          <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", flexWrap: "wrap", gap: 10, marginLeft: isMobile ? 0 : 48, minWidth: isMobile ? 0 : 150 }}>
            {(() => {
              const type = video._type || (video.show_id ? "episode" : "movie");
              const inList = type !== "episode" && myList?.[`${type}_${video.id}`];
              return (
                <button onClick={() => type !== "episode" && onToggleList?.(video.id, type)}
                  style={{ background: inList ? "rgba(250,204,21,0.15)" : "#facc15", border: inList ? "1px solid rgba(250,204,21,0.4)" : "none", borderRadius: 7, padding: "12px 20px", color: inList ? "#facc15" : "#0a0a0a", fontSize: 13, fontWeight: 600, cursor: type === "episode" ? "default" : "pointer", opacity: type === "episode" ? 0.4 : 1 }}>
                  {inList ? "✓ In My List" : "+ My List"}
                </button>
              );
            })()}
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => rate(1)} style={{ flex: 1, background: myRating === 1 ? "rgba(74,222,128,0.15)" : "#1a1a1a", border: `1px solid ${myRating === 1 ? "rgba(74,222,128,0.4)" : "#242424"}`, borderRadius: 7, padding: "10px 0", color: myRating === 1 ? "#4ade80" : "#555", fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                👍 {ratingCounts.up > 0 && <span style={{ fontSize: 12 }}>{ratingCounts.up}</span>}
              </button>
              <button onClick={() => rate(-1)} style={{ flex: 1, background: myRating === -1 ? "rgba(248,113,113,0.15)" : "#1a1a1a", border: `1px solid ${myRating === -1 ? "rgba(248,113,113,0.4)" : "#242424"}`, borderRadius: 7, padding: "10px 0", color: myRating === -1 ? "#f87171" : "#555", fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                👎 {ratingCounts.down > 0 && <span style={{ fontSize: 12 }}>{ratingCounts.down}</span>}
              </button>
            </div>
            <button
              onClick={() => {
                const url = window.location.href;
                if (navigator.share) {
                  navigator.share({ title: video.title, url }).catch(() => {});
                } else {
                  navigator.clipboard.writeText(url).then(() => {
                    setShareCopied(true);
                    setTimeout(() => setShareCopied(false), 2000);
                  });
                }
              }}
              style={{ background: "#1a1a1a", border: "1px solid #242424", borderRadius: 7, padding: "12px 20px", color: shareCopied ? "#4ade80" : "#777", fontSize: 13, cursor: "pointer", transition: "color 0.2s" }}>
              {shareCopied ? "Copied!" : "Share"}
            </button>
          </div>
        </div>


        {related.length > 0 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 20px", color: "#e5e5e5" }}>More Like This</h2>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 130 : 160}px, 1fr))`, gap: isMobile ? 10 : 16 }}>
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

// ─── Similarity scoring ───────────────────────────────────────────────────────
