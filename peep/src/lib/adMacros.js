// Ad tag URL macros. [BREAK_SECONDS] / [BREAK_MS] carry the break length so the
// ad server can size its pod (Google Ad Manager: pmxd=[BREAK_MS]). Unknown or
// missing lengths fall back to 30 s so a tag never goes out with a raw macro in it.
// [CHANNEL] / [SHOW] / [GENRE] describe what is playing, [DEVICE] the player.
// The web has no advertising ID, so [IFA] is blank and [LMT] (limit tracking) is 1.
export function fillAdMacros(url, breakSeconds, context = {}) {
  const seconds = Number.isFinite(breakSeconds) && breakSeconds > 0 ? Math.round(breakSeconds) : 30;
  const text = value => encodeURIComponent(String(value ?? '').trim());
  const values = {
    BREAK_SECONDS: String(seconds), BREAK_MS: String(seconds * 1000),
    CHANNEL: text(context.channel), SHOW: text(context.show), GENRE: text(context.genre),
    DEVICE: 'web', IFA: '', LMT: '1',
  };
  return String(url || '').replace(/\[(BREAK_SECONDS|BREAK_MS|CHANNEL|SHOW|GENRE|DEVICE|IFA|LMT)\]/g, (_, key) => values[key]);
}
