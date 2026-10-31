export const channelCategories = value => {
  const values = String(value || '').split(/[;,|]/).map(s => s.trim()).filter(Boolean);
  return values.length ? values : ['General'];
};
export function automaticLiveRows(channels, configured) {
  const existing = new Set(configured.filter(r => r.type === 'live_channels' && (r.pages || 'home').split(',').map(s => s.trim()).includes('live')).map(r => String(r.filter_value || '').trim().toLowerCase()));
  const categories = new Map();
  channels.filter(c => c.is_active !== false).forEach(c => channelCategories(c.category).forEach(name => {
    const key = name.toLowerCase();
    if (!categories.has(key)) categories.set(key, name);
  }));
  return [...categories].sort(([a],[b]) => a.localeCompare(b)).filter(([key]) => !existing.has(key)).map(([key,name]) => ({
    id:`auto-live:${key}`,title:name.replace(/\b\w/g,c=>c.toUpperCase()),type:'live_channels',filter_value:name,pages:'live',enabled:true,
  }));
}
export function liveRowChannels(value, channels) {
  const filter = String(value || '').trim();
  if (!filter || filter.toLowerCase() === 'all') return channels;
  if (filter.startsWith('[')) {
    try {
      const picks = JSON.parse(filter);
      if (!Array.isArray(picks)) return [];
      const seen = new Set();
      return picks.flatMap(p => {
        const id = String(p.id ?? p);
        if (seen.has(id)) return [];
        seen.add(id);
        const channel = channels.find(c => String(c.id) === id);
        return channel ? [channel] : [];
      });
    } catch { return []; }
  }
  return channels.filter(c => channelCategories(c.category).some(s => s.toLowerCase() === filter.toLowerCase()));
}
