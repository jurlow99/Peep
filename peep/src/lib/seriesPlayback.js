// Season 0 is the Extras shelf (trailers, teasers, bloopers): listed last, never
// "next up", never autoplayed after an episode.
export const EXTRAS_SEASON = 0;
export const isExtra = e => Number(e?.season ?? 1) === EXTRAS_SEASON;
export const seasonLabel = season => (Number(season) === EXTRAS_SEASON ? 'Extras' : `Season ${season}`);
export const seasonOrder = (a, b) => (Number(a) === EXTRAS_SEASON) - (Number(b) === EXTRAS_SEASON) || Number(a) - Number(b);

// The intro window for an episode: its own markers, else the series default.
// Returns { start, end } in seconds or null when there is nothing to skip.
export function introWindow(episode, show) {
  const pick = source => {
    const start = Number(source?.intro_start_seconds), end = Number(source?.intro_end_seconds);
    if (source?.intro_end_seconds == null || !Number.isFinite(end) || end <= 0) return null;
    const from = Number.isFinite(start) && start >= 0 ? start : 0;
    return end > from ? { start: from, end } : null;
  };
  return (episode?.intro_end_seconds != null ? pick(episode) : null) || pick(show);
}

// Show the button from the window's start until shortly before its end.
export function shouldOfferSkip(window, currentTime) {
  if (!window || !Number.isFinite(currentTime)) return false;
  return currentTime >= window.start && currentTime < window.end - 1;
}

export function nextSeriesEpisode(current, episodes) {
  const season = e => Number(e.season ?? 1);
  const number = e => Number(e.episode_number ?? 0);
  if (isExtra(current)) return null;
  return episodes.filter(e => String(e.id) !== String(current.id) && e.url && !isExtra(e) &&
    (e.status == null || ['approved','published'].includes(e.status)) &&
    (season(e) > season(current) || (season(e) === season(current) && number(e) > number(current))))
    .sort((a,b) => season(a)-season(b) || number(a)-number(b) || Number(a.id)-Number(b.id))[0] || null;
}
// "Watched" for saving progress: 90% in, or into the last minute of anything
// longer than five minutes (credits). Short clips need the full 90%.
export function isFinishedAt(position, duration) {
  if (!(duration > 0) || !Number.isFinite(position)) return false;
  return position / duration >= 0.9 || (duration > 300 && duration - position < 60);
}

// Can this progress row be resumed (as opposed to started over or already done)?
export function canResume(row) {
  const position = Number(row?.progress_seconds), duration = Number(row?.duration_seconds);
  return !!row && !row.completed && position > 10 && duration > 0 && !isFinishedAt(position, duration);
}

// What the series' Play button should start. progress: { [episodeId]: row }.
// The most recently touched episode decides: still in progress → resume it;
// finished → the episode after it. Nothing watched → the first episode.
// Extras never count and are never offered.
export function seriesNextUp(episodes, progress = {}) {
  const season = e => Number(e.season ?? 1), number = e => Number(e.episode_number ?? 0);
  const ordered = episodes.filter(e => !isExtra(e) && e.url !== null && e.url !== '')
    .sort((a, b) => season(a) - season(b) || number(a) - number(b) || Number(a.id) - Number(b.id));
  if (!ordered.length) return { episode: null, resuming: false };
  const touched = ordered.filter(e => progress[e.id] && (progress[e.id].completed || canResume(progress[e.id])))
    .sort((a, b) => new Date(progress[b.id].last_watched_at || 0) - new Date(progress[a.id].last_watched_at || 0) || ordered.indexOf(b) - ordered.indexOf(a));
  const latest = touched[0];
  if (!latest) return { episode: ordered[0], resuming: false };
  if (canResume(progress[latest.id])) return { episode: latest, resuming: true };
  const after = ordered.slice(ordered.indexOf(latest) + 1).find(e => !progress[e.id]?.completed);
  return { episode: after || ordered[0], resuming: false };
}

// Fired by the player after it saves progress, so open series pages refresh.
export const PROGRESS_EVENT = 'peep:watch-progress';

export function allowsEpisodeAutoplay(seriesAllows, viewerValue) {
  return seriesAllows === true && viewerValue !== 'false';
}
