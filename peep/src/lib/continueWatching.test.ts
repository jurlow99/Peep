import { expect, it } from 'vitest';
import { continueWatchingItems } from './continueWatching';

const content = [{ id: 'm', _type: 'movie', title: 'Movie', poster: 'm.jpg' }, { id: 1, _type: 'show', title: 'Series', poster: 'p.jpg', thumbnail: 'show.jpg' }];
const row = (id: string, type = 'movie', extra = {}) => ({ content_id: id, content_type: type, progress_seconds: 30, duration_seconds: 100, completed: false, ...extra });

it('shows one card per series, carrying the most recent in-progress episode, with the series poster', () => {
  const episodes = [{ id: 2, show_id: 1, season: 1, episode_number: 2, title: 'Second', thumbnail: 'e2.jpg' }, { id: 3, show_id: 1, season: 1, episode_number: 3, title: 'Third' }, { id: 4, show_id: 99 }];
  // Newest first: episode 3 was watched most recently, so the series card resumes there.
  const rows = [row('3', 'episode'), row('2', 'episode'), row('m'), row('m'), row('missing'), row('4', 'episode'), row('m', 'movie', { completed: true })];
  const items = continueWatchingItems(rows, content, episodes);
  expect(items.map(i => [i._type, i.id, i.title])).toEqual([['episode', 3, 'Series'], ['movie', 'm', 'Movie']]);
  expect(items[0]).toMatchObject({ _subtitle: 'S1 E3 · Third', poster: 'p.jpg', thumbnail: 'show.jpg', _progress: { progress_seconds: 30, duration_seconds: 100 } });
});

it('falls back through episode thumbnail, series hero and series poster for artwork', () => {
  const plain = [{ id: 1, _type: 'show', title: 'Series', poster: 'p.jpg' }];
  expect(continueWatchingItems([row('2', 'episode')], plain, [{ id: 2, show_id: 1, season: 2, episode_number: 1, thumbnail: 'e.jpg' }])[0].thumbnail).toBe('e.jpg');
  expect(continueWatchingItems([row('2', 'episode')], plain, [{ id: 2, show_id: 1, season: 0, episode_number: 1, title: 'Blooper' }])[0]).toMatchObject({ thumbnail: 'p.jpg', _subtitle: 'Extras · Blooper' });
});

it('excludes finished, barely started and broken rows', () => {
  expect(continueWatchingItems([row('m', 'movie', { progress_seconds: 10 }), row('m', 'movie', { duration_seconds: 0 }), row('m', 'movie', { progress_seconds: 90 }), row('m', 'movie', { progress_seconds: NaN })], content)).toEqual([]);
  expect(continueWatchingItems([], content)).toEqual([]);
});
