export function nextSeriesEpisode(current, episodes) {
  const season = e => Number(e.season ?? 1);
  const number = e => Number(e.episode_number ?? 0);
  return episodes.filter(e => String(e.id) !== String(current.id) && e.url &&
    (e.status == null || ['approved','published'].includes(e.status)) &&
    (season(e) > season(current) || (season(e) === season(current) && number(e) > number(current))))
    .sort((a,b) => season(a)-season(b) || number(a)-number(b) || Number(a.id)-Number(b.id))[0] || null;
}
export function allowsEpisodeAutoplay(seriesAllows, viewerValue) {
  return seriesAllows === true && viewerValue !== 'false';
}
