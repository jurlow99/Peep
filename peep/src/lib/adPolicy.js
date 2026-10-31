// Ad rules: the knobs an admin sets once and every player reads. Whether ads are
// on at all, how far apart entry ads are, where mid-rolls land, whether a
// post-roll plays. One JSON row in app_settings (key `ads_policy`) that anyone
// may read; only admins write it.
import { supabase } from '../supabase';

export const AD_POLICY_KEY = 'ads_policy';
export const DEFAULT_AD_POLICY = Object.freeze({
  enabled: true,
  min_gap_minutes: 30,      // between entry ads: start of a title, a channel, a multiview package
  live_entry: true,         // ad before joining a live channel
  multiview_entry: true,    // ad before a multiview package
  midroll_enabled: true,    // browser VOD only
  midroll_min_minutes: 20,  // shorter titles get no mid-rolls
  midroll_every_minutes: 15,
  midroll_max_breaks: 4,
  postroll_enabled: true,   // browser VOD only
});

const LIMITS = { min_gap_minutes: [0, 1440], midroll_min_minutes: [1, 600], midroll_every_minutes: [1, 240], midroll_max_breaks: [0, 20] };

// Accepts the stored string/object, fills gaps with defaults, clamps numbers.
export function parseAdPolicy(value) {
  let raw = value;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AD_POLICY };
  const policy = { ...DEFAULT_AD_POLICY };
  for (const key of Object.keys(DEFAULT_AD_POLICY)) {
    if (!(key in raw)) continue;
    if (typeof DEFAULT_AD_POLICY[key] === 'boolean') { policy[key] = raw[key] === true || raw[key] === 'true'; continue; }
    const number = Number(raw[key]);
    if (!Number.isFinite(number)) continue;
    const [low, high] = LIMITS[key];
    policy[key] = Math.min(high, Math.max(low, Math.round(number)));
  }
  return policy;
}

let cache = null;
export function hasAdPolicy() { return cache !== null; }
export function getAdPolicy() { return cache || DEFAULT_AD_POLICY; }

export async function loadAdPolicy(client = supabase) {
  try {
    const response = await client.from('app_settings').select('key,value').eq('key', AD_POLICY_KEY);
    cache = parseAdPolicy(response?.data?.[0]?.value);
  } catch { cache = cache || { ...DEFAULT_AD_POLICY }; }
  return cache;
}

export async function saveAdPolicy(policy, client = supabase) {
  const clean = parseAdPolicy(policy);
  const { error } = await client.from('app_settings').upsert({ key: AD_POLICY_KEY, value: JSON.stringify(clean), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (!error) cache = clean;
  return { error, policy: clean };
}

// Seconds into a title where a mid-roll should play. Never inside the last two
// minutes, never more than the cap.
export function midrollCuePoints(durationSeconds, policy = getAdPolicy()) {
  const duration = Number(durationSeconds);
  if (!policy.enabled || !policy.midroll_enabled || !Number.isFinite(duration)) return [];
  if (duration < policy.midroll_min_minutes * 60) return [];
  const every = policy.midroll_every_minutes * 60;
  const points = [];
  for (let at = every; at < duration - 120 && points.length < policy.midroll_max_breaks; at += every) points.push(at);
  return points;
}

// Does this placement run at all under the rules?
export function placementAllowed(placement, scope, policy = getAdPolicy()) {
  if (!policy.enabled) return false;
  if (placement === 'mid_roll') return policy.midroll_enabled;
  if (placement === 'post_roll') return policy.postroll_enabled;
  if (scope === 'live') return policy.live_entry;
  if (scope === 'multiview') return policy.multiview_entry;
  return true;
}

// Entry ads share one device-wide clock so hopping between titles or channels
// can't chain ads. Any ad start (including a mid-roll) resets it.
const FREQUENCY_KEY = 'peep.preroll.lastStartedAt';
let lastStartedInMemory = 0;
export function lastAdStartedAt() {
  let last = lastStartedInMemory;
  try { last = Math.max(last, Number(localStorage.getItem(FREQUENCY_KEY)) || 0); } catch { /* Memory fallback for restricted storage. */ }
  return last;
}
export function allowsEntryAd(now = Date.now(), policy = getAdPolicy()) {
  const last = lastAdStartedAt();
  return last <= 0 || now - last >= policy.min_gap_minutes * 60 * 1000;
}
export function recordAdStart(now = Date.now()) {
  lastStartedInMemory = now;
  try { localStorage.setItem(FREQUENCY_KEY, String(now)); } catch { /* Keep the in-memory cap. */ }
}
