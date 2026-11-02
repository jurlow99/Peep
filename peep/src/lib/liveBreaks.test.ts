import { describe, expect, it } from 'vitest';
import { breakStart, parseDuration } from './liveBreaks';

describe('live break markers', () => {
  it('starts a break on CUE-OUT and reads its length', () => {
    expect(breakStart([['INF', '6.0'], ['EXT-X-CUE-OUT', 'DURATION=120']])).toEqual({ duration: 120 });
    expect(breakStart([['EXT-X-CUE-OUT', '90.5']])).toEqual({ duration: 90.5 });
    expect(breakStart([['EXT-X-CUE-OUT', '']])).toEqual({ duration: null });
  });
  it('does not start a break when joining one already under way', () => {
    expect(breakStart([['EXT-X-CUE-OUT-CONT', 'ElapsedTime=30,Duration=120']])).toBeNull();
    expect(breakStart([['EXT-OATCLS-SCTE35', '/DAl...'], ['EXT-X-CUE-OUT-CONT', '30/120']])).toBeNull();
    expect(breakStart([['EXT-X-CUE-IN', '']])).toBeNull();
    expect(breakStart([])).toBeNull();
  });
  it('treats a lone SCTE-35 cue as a break start of unknown length', () => {
    expect(breakStart([['EXT-OATCLS-SCTE35', '/DAl...']])).toEqual({ duration: null });
    expect(parseDuration('garbage')).toBeNull();
  });
});
