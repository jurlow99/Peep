// Inputs must already be filtered to the viewer's allowed catalog/tier.
export function continueWatchingItems(progress, content, episodes = []) {
  const movies = new Map(content.filter(v => v._type === 'movie').map(v => [String(v.id), v]));
  const shows = new Map(content.filter(v => v._type === 'show').map(v => [String(v.id), v]));
  const byEpisode = new Map(episodes.map(v => [String(v.id), v]));
  const seen = new Set();
  return progress.flatMap(row => {
    const position = Number(row.progress_seconds), duration = Number(row.duration_seconds);
    const key = `${row.content_type}:${row.content_id}`;
    if (row.completed || !Number.isFinite(position) || !Number.isFinite(duration) || position <= 10 || duration <= 0 || position / duration >= 0.9 || seen.has(key)) return [];
    let item = row.content_type === 'movie' ? movies.get(String(row.content_id)) : null;
    if (row.content_type === 'episode') {
      const episode = byEpisode.get(String(row.content_id));
      const show = episode && shows.get(String(episode.show_id));
      if (show) item = { ...episode, _type: 'episode', title: `${show.title} · ${episode.title || 'Episode'}`, thumbnail: episode.thumbnail || show.thumbnail };
    }
    if (!item) return [];
    seen.add(key);
    return [item];
  });
}
