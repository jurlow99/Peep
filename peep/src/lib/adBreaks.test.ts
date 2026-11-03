import { expect, it } from 'vitest';
import { parseAdBreaks, parseBreakTime, formatBreakTime, titleCuePoints } from './adBreaks';
import { DEFAULT_AD_POLICY } from './adPolicy';

it('reads break lists from arrays, JSON and typed times', () => {
  expect(parseAdBreaks([760, 1635, 760, -5, 'x'])).toEqual([760, 1635]);
  expect(parseAdBreaks('[1635, 760]')).toEqual([760, 1635]);
  expect(parseAdBreaks('12:40, 27:15')).toEqual([760, 1635]);
  expect(parseAdBreaks(null)).toEqual([]);
  expect(parseAdBreaks('')).toEqual([]);
});

it('converts between seconds and clock text', () => {
  expect(parseBreakTime('12:40')).toBe(760);
  expect(parseBreakTime('1:02:03')).toBe(3723);
  expect(parseBreakTime('760')).toBe(760);
  expect(parseBreakTime('12:4a')).toBeNull();
  expect(parseBreakTime('')).toBeNull();
  expect(formatBreakTime(760)).toBe('12:40');
  expect(formatBreakTime(3723)).toBe('1:02:03');
  expect(formatBreakTime(5)).toBe('0:05');
});

it("uses the title's own breaks when it has them, else the rules timing", () => {
  const duration = 95 * 60;
  expect(titleCuePoints([760, 1635, 5000, 5600], duration, DEFAULT_AD_POLICY)).toEqual([760, 1635, 5000]); // 5600 is inside the last two minutes
  expect(titleCuePoints([], duration, DEFAULT_AD_POLICY)).toEqual([900, 1800, 2700, 3600]);
  expect(titleCuePoints(null, 10 * 60, DEFAULT_AD_POLICY)).toEqual([]);
  expect(titleCuePoints([300], 10 * 60, DEFAULT_AD_POLICY)).toEqual([300]); // own list ignores the minimum length rule
  expect(titleCuePoints([760], duration, { ...DEFAULT_AD_POLICY, midroll_enabled: false })).toEqual([]);
  expect(titleCuePoints([760], duration, { ...DEFAULT_AD_POLICY, enabled: false })).toEqual([]);
});
