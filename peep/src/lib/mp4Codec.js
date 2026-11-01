// Peep plays H.264 MP4s only. An MP4 can carry AV1, HEVC or VP9 just as
// easily, and Safari / Apple TV then play the audio over a black picture. This
// reads the sample-description box names out of the container header so the
// admin hears about it before the upload starts.
const CODECS = [
  ['avc1', 'h264'], ['avc3', 'h264'],
  ['av01', 'av1'],
  ['hvc1', 'hevc'], ['hev1', 'hevc'], ['dvh1', 'hevc'], ['dvhe', 'hevc'],
  ['vp09', 'vp9'], ['vp08', 'vp8'],
];
const LABELS = { h264: 'H.264', av1: 'AV1', hevc: 'HEVC (H.265)', vp9: 'VP9', vp8: 'VP8' };

// bytes: Uint8Array of the start (and end) of the file. Returns the first
// recognised video codec name, or null when nothing recognisable is there.
export function sniffMP4VideoCodec(bytes) {
  const text = latin1(bytes);
  let best = null;
  for (const [fourcc, codec] of CODECS) {
    const at = text.indexOf(fourcc);
    if (at >= 0 && (best === null || at < best.at)) best = { at, codec };
  }
  return best?.codec ?? null;
}

export function codecLabel(codec) { return LABELS[codec] || codec || 'unknown'; }

// Reads the head and tail of the file (moov lives at one end or the other).
export async function detectMP4VideoCodec(file, window = 6 * 1024 * 1024) {
  const size = file.size || 0;
  const head = new Uint8Array(await file.slice(0, Math.min(window, size)).arrayBuffer());
  let codec = sniffMP4VideoCodec(head);
  if (!codec && size > window) {
    const tail = new Uint8Array(await file.slice(Math.max(0, size - window), size).arrayBuffer());
    codec = sniffMP4VideoCodec(tail);
  }
  return codec;
}

// A reason to refuse the file, or '' when it is fine (or undetermined).
export function mp4CodecProblem(codec) {
  if (!codec || codec === 'h264') return '';
  return `${codecLabel(codec)} video — Safari and Apple TV can't play it. Convert to H.264 first.`;
}

function latin1(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return out;
}
