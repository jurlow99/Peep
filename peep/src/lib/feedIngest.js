// A live feed arrives one of two ways: the provider pushes straight to our
// Cloudflare live input (they are the SRT caller; no relay involved), or the
// relay pulls it from them. Push is the default we ask providers for.
export const PUSH_SOURCE_TYPE = 'push';
export const PULL_SOURCE_TYPE = 'srt';
export const isPushFeed = feed => feed?.source_type === PUSH_SOURCE_TYPE;

export const SUGGESTED_PUSH_LATENCY_MS = 2000;

// The text an operator pastes to a provider. Cloudflare's SRT ingest takes the
// stream ID and passphrase as query parameters on its address.
export function formatPushDetails({ feedName, srt, rtmps, latency = SUGGESTED_PUSH_LATENCY_MS }) {
  const lines = [`Peep live feed: ${feedName}`, ''];
  if (srt?.url) {
    const streamId = srt.streamId || '', passphrase = srt.passphrase || '';
    lines.push(
      'SRT (preferred) — you connect to us as the caller:',
      `  Address:    ${srt.url}`,
      `  Stream ID:  ${streamId}`,
      `  Passphrase: ${passphrase}`,
      `  Latency:    ${latency} ms suggested`,
      `  One line:   ${srt.url}?streamid=${encodeURIComponent(streamId)}&passphrase=${encodeURIComponent(passphrase)}&latency=${latency}`,
      '',
    );
  }
  if (rtmps?.url) {
    lines.push('RTMPS (alternative):', `  Server:     ${rtmps.url}`, `  Stream key: ${rtmps.streamKey || ''}`, '');
  }
  lines.push('Send one continuous stream, H.264 video + AAC audio. We relay it live only; nothing is recorded on our side.');
  return lines.join('\n');
}
