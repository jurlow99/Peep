export function channelCheckURL(channel, feeds = []) {
  const feed = feeds.find(item => String(item.id) === String(channel.live_feed_id));
  const value = feed?.cloudflare_hls_url || channel.hls_url || (channel.stream_uid ? `https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com/${channel.stream_uid}/manifest/video.m3u8` : '');
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
