// Ad tag URL macros. [BREAK_SECONDS] / [BREAK_MS] carry the live break length so
// the ad server can size its pod (Google Ad Manager: pmxd=[BREAK_MS]). Unknown or
// missing lengths fall back to 30 s so a tag never goes out with a raw macro in it.
export function fillAdMacros(url, breakSeconds) {
  const seconds = Number.isFinite(breakSeconds) && breakSeconds > 0 ? Math.round(breakSeconds) : 30;
  return String(url || '').replaceAll('[BREAK_SECONDS]', String(seconds)).replaceAll('[BREAK_MS]', String(seconds * 1000));
}
