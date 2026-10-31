export const DEFAULT_BLACKOUT_MESSAGE = "This channel is temporarily unavailable. Please check back soon.";

// A manual blackout overrides the schedule. Scheduled windows include their
// start and exclude their end, so playback returns at the scheduled end time.
export function channelBlackout(channel, now = Date.now()) {
  if (!channel) return null;
  const start = Date.parse(channel.blackout_starts_at);
  const end = Date.parse(channel.blackout_ends_at);
  const scheduled = Number.isFinite(start) && Number.isFinite(end) && start < end && start <= now && now < end;
  return channel.blackout_enabled === true || scheduled
    ? (channel.blackout_message?.trim() || DEFAULT_BLACKOUT_MESSAGE) : null;
}

export function blackoutFields(form) {
  const start = form.blackout_starts_at || null;
  const end = form.blackout_ends_at || null;
  if ((start || end) && (!start || !end || !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start))) {
    throw new Error("Choose a blackout start and an end after the start.");
  }
  const message = (form.blackout_message || "").trim();
  if (message.length > 500) throw new Error("Keep the blackout message within 500 characters.");
  return { blackout_enabled: !!form.blackout_enabled, blackout_message: message,
    blackout_starts_at: start ? new Date(start).toISOString() : null,
    blackout_ends_at: end ? new Date(end).toISOString() : null };
}

export function localDateTimeValue(iso) {
  const date = new Date(iso);
  if (!iso || !Number.isFinite(date.getTime())) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
