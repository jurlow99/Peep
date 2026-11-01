// Series that share a title are almost always the same show added twice.
// Pure helpers for spotting them and suggesting which one to keep.
export const normalShowTitle = title => String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');

// shows: [{ id, title, ... }], episodes: [{ show_id }]
// → [{ title, members: [{...show, episodes}], keep }] with the fullest series first.
export function duplicateShowGroups(shows = [], episodes = []) {
  const counts = {};
  for (const episode of episodes) counts[episode.show_id] = (counts[episode.show_id] || 0) + 1;
  const groups = {};
  for (const show of shows) {
    const key = normalShowTitle(show.title);
    if (key) (groups[key] ||= []).push(show);
  }
  return Object.values(groups).filter(group => group.length > 1).map(group => {
    const members = group.map(show => ({ ...show, episodes: counts[show.id] || 0 }))
      .sort((a, b) => b.episodes - a.episodes || Number(a.id) - Number(b.id));
    return { title: members[0].title, members, keep: members[0] };
  });
}
