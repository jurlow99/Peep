// Live ad breaks signalled in the HLS playlist. hls.js hands us each fragment's raw
// tags; a break starts on the fragment carrying #EXT-X-CUE-OUT (not -CONT), or an
// #EXT-OATCLS-SCTE35 cue with no CUE-OUT alongside. Joining mid-break (only -CONT)
// is not a start, so viewers never get an ad dropped on them halfway through.
export function breakStart(tagList = []) {
  let cueOut = null, oatcls = false, cont = false;
  for (const [tag, value = ''] of tagList) {
    const name = String(tag).toUpperCase();
    if (name === 'EXT-X-CUE-OUT') cueOut = value;
    else if (name === 'EXT-X-CUE-OUT-CONT') cont = true;
    else if (name === 'EXT-OATCLS-SCTE35') oatcls = true;
  }
  if (cueOut !== null) return { duration: parseDuration(cueOut) };
  if (oatcls && !cont) return { duration: null };
  return null;
}

// "DURATION=120", "120", "120.0" → seconds; anything else → null.
export function parseDuration(value) {
  const text = String(value || '');
  const match = /DURATION=([\d.]+)/i.exec(text) || /^([\d.]+)$/.exec(text.trim());
  const seconds = match ? Number(match[1]) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
