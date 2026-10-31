import { supabase } from '../supabase';

// Best-effort playback telemetry never blocks playback. Each stream has a private
// write token; history is only readable by admins. No buffering/paused time is added.
export function trackLiveVideo(video, channelId, mode = 'single') {
  if (!video || !Number.isSafeInteger(Number(channelId))) return () => {};
  let deviceId;
  try { deviceId = localStorage.getItem('peep_live_device_id') || crypto.randomUUID(); localStorage.setItem('peep_live_device_id', deviceId); }
  catch { deviceId = crypto.randomUUID(); }
  let sessionId, token, started = false, seconds = 0, lastWall = performance.now(), lastMedia = video.currentTime, lastSent = performance.now();
  let pending = Promise.resolve();
  function flush(end = false) {
    if (!started) return;
    const payload = { p_session_id: sessionId, p_token: token, p_device_id: deviceId, p_channel_id: Number(channelId), p_platform: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile_web' : 'web', p_mode: mode, p_seconds: Math.min(30, seconds), p_end: end };
    seconds = 0; lastSent = performance.now();
    pending = pending.then(() => supabase.rpc('record_live_viewing', payload)).catch(() => {});
    if (end) started = false;
  }
  function sample() {
    const now = performance.now(), media = video.currentTime;
    const visible = typeof document === "undefined" || document.visibilityState !== "hidden";
    if (visible && !video.paused && !video.ended && video.readyState >= 2 && media > lastMedia) {
      if (!started) { sessionId = crypto.randomUUID(); token = crypto.randomUUID(); started = true; flush(); }
      seconds += Math.min(Math.max(0, (now-lastWall)/1000), media-lastMedia, 2);
      if (now-lastSent >= 15000) flush();
    } else if ((!visible || video.paused || video.ended) && started) flush(true);
    lastWall = now; lastMedia = media;
  }
  const timer = setInterval(sample, 1000);
  const finish = () => { sample(); flush(true); };
  video.addEventListener('pause', finish); video.addEventListener('ended', finish);
  window.addEventListener('pagehide', finish);
  return () => { clearInterval(timer); finish(); video.removeEventListener('pause', finish); video.removeEventListener('ended', finish); window.removeEventListener('pagehide', finish); };
}
