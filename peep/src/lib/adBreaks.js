// Per-title ad breaks: where a mid-roll lands inside a movie or episode. A title
// with its own approved list (`ad_breaks`, seconds from the start) uses it; one
// without falls back to the Ad rules timing. Both are still off when the admin
// turns ads or mid-rolls off. Apple TV mirrors this in AdPolicy.cuePoints.
import { getAdPolicy, midrollCuePoints } from './adPolicy';

const TAIL_SECONDS = 120; // never inside the last two minutes, like the rules timing

// Whatever is stored (array, JSON text, "12:40, 27:15") → sorted unique whole seconds.
export function parseAdBreaks(value) {
  let raw = value;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return [];
    try { raw = JSON.parse(text); } catch { raw = text.split(/[,\s]+/); }
  }
  if (!Array.isArray(raw)) return [];
  const seconds = raw.map(item => (typeof item === 'string' && item.includes(':') ? parseBreakTime(item) : Math.round(Number(item))))
    .filter(n => Number.isFinite(n) && n >= 0);
  return [...new Set(seconds)].sort((a, b) => a - b);
}

// "1:02:03" / "12:40" / "760" → seconds, or null when it isn't a time.
export function parseBreakTime(text) {
  const parts = String(text ?? '').trim().split(':');
  if (!parts.length || parts.some(p => p === '' || !/^\d+$/.test(p)) || parts.length > 3) return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

// 760 → "12:40", 3723 → "1:02:03".
export function formatBreakTime(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

// Seconds into the title where a mid-roll plays. The title's own list wins when
// it has one; otherwise the Ad rules timing. Empty when ads or mid-rolls are off.
export function titleCuePoints(adBreaks, durationSeconds, policy = getAdPolicy()) {
  const duration = Number(durationSeconds);
  if (!policy.enabled || !policy.midroll_enabled || !Number.isFinite(duration)) return [];
  const own = parseAdBreaks(adBreaks).filter(at => at > 0 && at < duration - TAIL_SECONDS);
  return own.length ? own : midrollCuePoints(duration, policy);
}
