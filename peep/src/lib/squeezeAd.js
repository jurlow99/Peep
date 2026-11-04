// Squeeze ads (L-bar): a full-screen picture (VAST NonLinear) while the show keeps
// playing, shrunk to 75% into the top-right corner, sound on. Asked about every N
// minutes of playback (Ad rules `squeeze_every_minutes`), never during an ad break,
// within two minutes after one, or while paused. Up for the ad's suggested time
// (15 s default), gone early when a break starts, the viewer pauses or the title
// changes. The ad itself is the same shape as a pause ad (pauseAd.js). Apple TV
// mirrors this in SqueezeSchedule / SqueezeAdView (PlayerView.swift).
import { loadPauseAd } from './pauseAd';

export const SQUEEZE_TICK_MS = 5000;
export const SQUEEZE_AFTER_BREAK_MS = 120000;
export const SQUEEZE_DEFAULT_SECONDS = 15;
export const SQUEEZE_MAX_SECONDS = 60;

// Time to ask the squeeze tag? All times in ms; lastBreakEndedAt is 0 before any break.
export function squeezeDue({ now, lastAskedAt, lastBreakEndedAt = 0, playing, adBusy, policy }) {
  if (!policy?.enabled || !policy.squeeze_enabled || !playing || adBusy) return false;
  if (lastBreakEndedAt > 0 && now - lastBreakEndedAt < SQUEEZE_AFTER_BREAK_MS) return false;
  return now - lastAskedAt >= policy.squeeze_every_minutes * 60000;
}

// How long to keep the picture up: minSuggestedDuration, capped; 15 s when absent.
export function squeezeSeconds(ad) {
  const seconds = Number(ad?.duration);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(SQUEEZE_MAX_SECONDS, seconds) : SQUEEZE_DEFAULT_SECONDS;
}

export const loadSqueezeAd = loadPauseAd;
