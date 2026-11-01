// Season 0 is the Extras shelf (trailers, teasers, bloopers): listed last, never
// "next up", never autoplayed after an episode.
export const EXTRAS_SEASON = 0;
export const isExtra = e => Number(e?.season ?? 1) === EXTRAS_SEASON;
export const seasonLabel = season => (Number(season) === EXTRAS_SEASON ? 'Extras' : `Season ${season}`);
export const seasonOrder = (a, b) => (Number(a) === EXTRAS_SEASON) - (Number(b) === EXTRAS_SEASON) || Number(a) - Number(b);

export function nextSeriesEpisode(current, episodes) {
  const season = e => Number(e.season ?? 1);
  const number = e => Number(e.episode_number ?? 0);
  if (isExtra(current)) return null;
  return episodes.filter(e => String(e.id) !== String(current.id) && e.url && !isExtra(e) &&
    (e.status == null || ['approved','published'].includes(e.status)) &&
    (season(e) > season(current) || (season(e) === season(current) && number(e) > number(current))))
    .sort((a,b) => season(a)-season(b) || number(a)-number(b) || Number(a.id)-Number(b.id))[0] || null;
}
export function allowsEpisodeAutoplay(seriesAllows, viewerValue) {
  return seriesAllows === true && viewerValue !== 'false';
}
