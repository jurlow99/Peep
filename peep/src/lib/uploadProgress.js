// Pure helpers for the Add VOD upload card: human-readable sizes, runtimes and
// a rolling time-left estimate. No DOM, so they are unit-tested directly.
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

// Matches the catalog's free-text duration convention ("24 min", "1 h 32 min").
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function formatTimeLeft(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 10) return 'a few seconds left';
  if (seconds < 60) return `about ${Math.ceil(seconds / 10) * 10} sec left`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `about ${minutes} min left`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return `about ${hours} h${rest ? ` ${rest} min` : ''} left`;
}

// samples: [{at: ms timestamp, bytes: uploaded so far}], oldest first.
// Uses the last `window` ms so a stall or a burst shows up quickly.
export function uploadEstimate(samples, total, window = 15000) {
  if (!samples?.length || !Number.isFinite(total) || total <= 0) return null;
  const last = samples[samples.length - 1];
  const start = samples.find(s => last.at - s.at <= window) || samples[0];
  const elapsed = (last.at - start.at) / 1000, sent = last.bytes - start.bytes;
  if (elapsed < 1 || sent <= 0) return null;
  const rate = sent / elapsed;
  return { rate, secondsLeft: Math.max(0, total - last.bytes) / rate };
}

export function recordSample(samples, bytes, at = Date.now(), keep = 40) {
  const next = [...samples, { at, bytes }];
  return next.length > keep ? next.slice(next.length - keep) : next;
}
