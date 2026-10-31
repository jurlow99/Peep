export const liveMetricDetails = {
  viewers_now: { title: 'Viewers now', live: true, description: 'Each device counts once in this metric. The records below show its active channel streams, so a multiview device can appear on several rows.' },
  streams_now: { title: 'Active streams', live: true, description: 'One row per active channel stream. Four-screen multiview can contribute four streams from the same device.' },
  watch_hours: { title: 'Channel watch hours', duration: true, description: 'Sessions ranked by watched time. Hours add across channels, including simultaneous multiview streams. Buffering and paused time are excluded.' },
  sessions: { title: 'Viewing sessions', description: 'One session per channel playback. Switching channels, pausing and resuming can create new sessions. A four-channel multiview creates up to four sessions.' },
  unique_devices: { title: 'Unique devices', description: 'Distinct anonymous device IDs across sessions started in this period. Repeated IDs below belong to the same device. These identify app/browser installations, not individual people.' },
  average_minutes: { title: 'Avg. session minutes', duration: true, description: 'Total watched minutes divided by channel sessions, including short sessions. These sessions are ranked longest first; multiview channels are measured separately.' },
};

export function queryLiveViewingDetails(client, { metric, since, now, page = 0, platform = '', mode = '', device = '', includeTests = false }) {
  const definition = liveMetricDetails[metric];
  let query = client.from('live_watch_sessions').select(
    'id,device_id,channel_name,platform,mode,started_at,last_ping,ended_at,watched_seconds,is_test', { count: 'exact' });
  if (!includeTests) query = query.eq('is_test', false);
  if (definition.live) query = query.is('ended_at', null).gt('last_ping', new Date(now - 45000).toISOString());
  else query = query.gte('started_at', since);
  if (platform) query = query.eq('platform', platform);
  if (device) query = query.eq('device_id', device);
  if (mode) query = query.eq('mode', mode);
  return query.order(definition.duration ? 'watched_seconds' : 'started_at', { ascending: false })
    .order('id', { ascending: false }).range(page * 25, page * 25 + 24);
}
