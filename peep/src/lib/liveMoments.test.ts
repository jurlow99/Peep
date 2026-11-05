// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { endingSoon, momentSeen, markMomentSeen, LIVE_MOMENTS } from './liveMoments';

it('asks for the episode_end L only over the credits of a full-length title', () => {
  expect(endingSoon(1320, 1320 - 44)).toBe(true);
  expect(endingSoon(1320, 1320 - 21)).toBe(true);
  expect(endingSoon(1320, 1320 - 60)).toBe(false);  // too early
  expect(endingSoon(1320, 1320 - 15)).toBe(false);  // too late: it would outlast the title
  expect(endingSoon(300, 270)).toBe(false);         // short clip
  expect(endingSoon(NaN, 10)).toBe(false);
});

it('uses each live moment once per viewer', () => {
  expect(momentSeen(7)).toBe(false);
  markMomentSeen(7);
  expect(momentSeen(7)).toBe(true);
  expect(momentSeen(8)).toBe(false);
  expect(LIVE_MOMENTS.map(m => m.value)).toEqual(['halftime', 'between_matches', 'intermission', 'lobby']);
});
