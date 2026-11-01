import { describe, expect, it } from 'vitest';
import { introWindow, shouldOfferSkip } from './seriesPlayback';

describe('skip intro window', () => {
  it('uses the episode markers, else the series default, else nothing', () => {
    const show = { intro_start_seconds: 5, intro_end_seconds: 50 };
    expect(introWindow({ intro_end_seconds: 30 }, show)).toEqual({ start: 0, end: 30 });
    expect(introWindow({ intro_start_seconds: 10, intro_end_seconds: 40 }, show)).toEqual({ start: 10, end: 40 });
    expect(introWindow({}, show)).toEqual({ start: 5, end: 50 });
    expect(introWindow({}, {})).toBeNull();
    expect(introWindow({ intro_start_seconds: 60, intro_end_seconds: 40 }, null)).toBeNull(); // end before start → ignored
    expect(introWindow(null, { intro_end_seconds: 0 })).toBeNull();
  });

  it('offers the button inside the window and drops it a second before the end', () => {
    const win = { start: 5, end: 50 };
    expect(shouldOfferSkip(win, 4)).toBe(false);
    expect(shouldOfferSkip(win, 5)).toBe(true);
    expect(shouldOfferSkip(win, 48.9)).toBe(true);
    expect(shouldOfferSkip(win, 49)).toBe(false);
    expect(shouldOfferSkip(null, 10)).toBe(false);
  });
});
