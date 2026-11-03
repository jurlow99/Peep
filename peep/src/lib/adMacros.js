// Ad tag URL macros. [BREAK_SECONDS] / [BREAK_MS] carry the break length so the
// ad server can size its pod (Google Ad Manager: pmxd=[BREAK_MS]). Unknown or
// missing lengths fall back to 30 s so a tag never goes out with a raw macro in it.
// [CHANNEL] / [SHOW] / [GENRE] describe what is playing, [DEVICE] the player.
// [CHANNEL] is always the channel's clean name (see adChannelName), so the ad server
// sees one spelling per channel whichever screen opened it, on web and Apple TV.
// The web has no advertising ID, so [IFA] is blank and [LMT] (limit tracking) is 1.
// [SKIPPABLE] is 1 when the viewer may skip this break (pre-rolls, movie and episode
// ads) and 0 for live channel breaks, so the ad server leaves out skipoffset.
// [DEVICE_ID] is a random 32-hex label made once per browser, for frequency caps
// on Peep's own ad server. It is derived from nothing; clearing site data resets it.
const DEVICE_ID_KEY = 'peep_ad_device_id';

// "Dog the Bounty Hunter (1080p)" → "Dog the Bounty Hunter": drops picture-quality tags
// and bracketed notes ("[Not 24/7]"). Same rule as tvOS BrowsePresentation.channelName.
export function adChannelName(raw) {
  const original = String(raw ?? '').trim();
  const name = original.replace(/\s*\((?:\d{3,4}[pi]|\d+x\d+|HD|SD|FHD|UHD|4K)\)/gi, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim();
  return name || original;
}

export function adDeviceId(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(DEVICE_ID_KEY);
    if (/^[0-9a-f]{32}$/.test(stored || '')) return stored;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const id = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    storage?.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch { return ''; }
}

export function fillAdMacros(url, breakSeconds, context = {}) {
  const seconds = Number.isFinite(breakSeconds) && breakSeconds > 0 ? Math.round(breakSeconds) : 30;
  const text = value => encodeURIComponent(String(value ?? '').trim());
  const values = {
    BREAK_SECONDS: String(seconds), BREAK_MS: String(seconds * 1000),
    CHANNEL: text(adChannelName(context.channel)), SHOW: text(context.show), GENRE: text(context.genre),
    DEVICE: 'web', IFA: '', LMT: '1', SKIPPABLE: context.skippable === false ? '0' : '1',
  };
  return String(url || '').replace(/\[(BREAK_SECONDS|BREAK_MS|CHANNEL|SHOW|GENRE|DEVICE_ID|DEVICE|IFA|LMT|SKIPPABLE)\]/g,
    (_, key) => key === 'DEVICE_ID' ? text(context.deviceId ?? adDeviceId()) : values[key]);
}
