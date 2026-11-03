// Pause ads: a picture (VAST NonLinear) shown while the viewer has paused. The
// player asks the active `pause` tag after PAUSE_DELAY_MS paused, at most once per
// pause, shows the picture over the paused video, fires its impressions once it is
// on screen and hides it the moment play resumes. No IMA: it is one image and a
// few tracking URLs. Apple TV mirrors this in PauseAd (PlayerView.swift).
import { fillAdMacros } from './adMacros';

export const PAUSE_DELAY_MS = 2000;
const https = url => { try { return new URL(String(url || '').trim()).protocol === 'https:' ? String(url).trim() : null; } catch { return null; } };
const texts = (root, tag) => [...root.getElementsByTagName(tag)].map(n => https(n.textContent)).filter(Boolean);

// VAST XML → { image, width, height, impressions, clickThrough, clickTracking, title } or null.
export function parsePauseAd(xml) {
  let doc;
  try { doc = new DOMParser().parseFromString(String(xml || ''), 'application/xml'); } catch { return null; }
  if (!doc || doc.getElementsByTagName('parsererror').length) return null;
  const ad = doc.getElementsByTagName('Ad')[0];
  const nonLinear = ad?.getElementsByTagName('NonLinear')[0];
  const image = nonLinear && texts(nonLinear, 'StaticResource')[0];
  if (!image) return null;
  const size = name => { const n = Number(nonLinear.getAttribute(name)); return Number.isFinite(n) && n > 0 ? n : null; };
  return {
    image, width: size('width') || 16, height: size('height') || 9,
    impressions: texts(ad, 'Impression'),
    clickThrough: texts(nonLinear, 'NonLinearClickThrough')[0] || null,
    clickTracking: texts(nonLinear, 'NonLinearClickTracking'),
    title: ad.getElementsByTagName('AdTitle')[0]?.textContent?.trim() || 'Ad',
  };
}

// Ask a pause tag for its ad. Resolves null on no ad, a bad reply or a timeout.
export async function loadPauseAd(tagUrl, context, { fetch: get = globalThis.fetch, timeoutMs = 4000 } = {}) {
  try {
    const response = await get(fillAdMacros(tagUrl, null, context), { signal: AbortSignal.timeout(timeoutMs), credentials: 'omit' });
    return response.ok ? parsePauseAd(await response.text()) : null;
  } catch { return null; }
}

// Fire-and-forget tracking pings (impressions, clicks): an image beacon works cross-origin.
export function ping(urls) {
  for (const url of urls || []) { try { new Image().src = url; } catch { /* tracking is best effort */ } }
}
