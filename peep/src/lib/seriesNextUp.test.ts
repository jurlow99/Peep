import { describe, expect, it } from 'vitest';
import { canResume, isFinishedAt, seriesNextUp } from './seriesPlayback';

const ep = (id: number, season: number, n: number) => ({ id, season, episode_number: n, url: 'x' });
const episodes = [ep(10, 0, 1), ep(1, 1, 1), ep(2, 1, 2), ep(3, 2, 1), ep(4, 2, 2)];
const p = (pos: number, dur: number, at: string, completed = false) => ({ progress_seconds: pos, duration_seconds: dur, completed, last_watched_at: at });

describe('series next up', () => {
  it('starts at S1E1, never an extra, when nothing is watched', () => {
    expect(seriesNextUp(episodes, {})).toEqual({ episode: episodes[1], resuming: false });
  });
  it('resumes the most recently watched unfinished episode', () => {
    const progress = { 1: p(300, 1300, '2026-11-01T10:00Z'), 3: p(500, 1300, '2026-11-01T12:00Z') };
    expect(seriesNextUp(episodes, progress)).toEqual({ episode: episodes[3], resuming: true });
  });
  it('moves on to the next episode after the latest finished one', () => {
    const progress = { 1: p(1300, 1300, '2026-11-01T10:00Z', true), 2: p(1290, 1300, '2026-11-01T11:00Z', true) };
    expect(seriesNextUp(episodes, progress)).toEqual({ episode: episodes[3], resuming: false });
  });
  it('skips episodes already finished when moving on, and wraps to the start at the end', () => {
    const done = (at: string) => p(1300, 1300, at, true);
    expect(seriesNextUp(episodes, { 1: done('2026-11-01T12:00Z'), 2: done('2026-10-01T00:00Z') }).episode).toBe(episodes[3]);
    expect(seriesNextUp(episodes, { 4: done('2026-11-01T12:00Z') }).episode).toBe(episodes[1]);
  });
  it('treats the credits as finished on long episodes but not on short clips', () => {
    expect(isFinishedAt(1270, 1320)).toBe(true);   // 50 s left of 22 min
    expect(isFinishedAt(30, 90)).toBe(false);      // 60 s left of a 90 s clip
    expect(canResume(p(1270, 1320, 'x'))).toBe(false);
    expect(canResume(p(400, 1320, 'x'))).toBe(true);
    expect(canResume(p(8, 1320, 'x'))).toBe(false);
  });
});
