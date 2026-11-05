// Ad "moments" Peep tells Steep about on an L ad request (moment=). Live ones come from an
// operator's button (Live TV → Live moments, table channel_moments); episode_end comes from
// the player itself, near the end of a movie or episode. Apple TV mirrors this in
// LiveMoment / SqueezeAdModifier (PlayerView.swift).
export const LIVE_MOMENTS = [
  { value: 'halftime', label: 'Halftime now' },
  { value: 'between_matches', label: 'Round ended' },
  { value: 'intermission', label: 'Intermission' },
  { value: 'lobby', label: 'Lobby' },
];
export const MOMENT_LABELS = Object.fromEntries(LIVE_MOMENTS.map(m => [m.value, m.label]));
export const MOMENT_MINUTES = 15;

// episode_end: one L over the credits of a title at least 10 minutes long, while 20–45 s
// are left (it is up about 15 s, so it is gone before the title ends).
export function endingSoon(duration, currentTime) {
  const total = Number(duration), at = Number(currentTime);
  if (!Number.isFinite(total) || !Number.isFinite(at) || total < 600) return false;
  const left = total - at;
  return left <= 45 && left > 20;
}

// One L per live moment per viewer: the moment ids already used, kept on this browser.
const SEEN_KEY = 'peep.moments.seen';
let seenInMemory = [];
function seenList() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return seenInMemory; }
}
export function momentSeen(id) { return seenList().includes(String(id)); }
export function markMomentSeen(id) {
  const next = [...seenList().filter(x => x !== String(id)), String(id)].slice(-50);
  seenInMemory = next;
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* memory only */ }
}
