// Inputs must already be filtered to the viewer's allowed catalog/tier.
// progress rows arrive newest first. One card per movie; one card per series,
// carrying the most recently watched in-progress episode so Resume lands there.
export function continueWatchingItems(progress, content, episodes = []) {
  const movies = new Map(content.filter(v => v._type === 'movie').map(v => [String(v.id), v]));
  const shows = new Map(content.filter(v => v._type === 'show').map(v => [String(v.id), v]));
  const byEpisode = new Map(episodes.map(v => [String(v.id), v]));
  const seen = new Set();
  return progress.flatMap(row => {
    const position = Number(row.progress_seconds), duration = Number(row.duration_seconds);
    if (row.completed || !Number.isFinite(position) || !Number.isFinite(duration) || position <= 10 || duration <= 0 || position / duration >= 0.9) return [];
    if (row.content_type === 'movie') {
      const movie = movies.get(String(row.content_id));
      const key = `movie:${row.content_id}`;
      if (!movie || seen.has(key)) return [];
      seen.add(key);
      return [{ ...movie, _progress: { progress_seconds: position, duration_seconds: duration } }];
    }
    if (row.content_type === 'episode') {
      const episode = byEpisode.get(String(row.content_id));
      const show = episode && shows.get(String(episode.show_id));
      const key = `show:${episode?.show_id}`;
      if (!show || seen.has(key)) return [];
      seen.add(key);
      const where = Number(episode.season) === 0 ? 'Extras' : `S${episode.season} E${episode.episode_number}`;
      return [{
        ...episode, _type: 'episode',
        title: show.title,
        _subtitle: `${where}${episode.title ? ` · ${episode.title}` : ''}`,
        poster: show.poster || null,
        thumbnail: episode.thumbnail || show.thumbnail || show.poster || null,
        _progress: { progress_seconds: position, duration_seconds: duration },
      }];
    }
    return [];
  });
}
