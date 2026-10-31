import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../supabase', () => ({ supabase: {} }));
import { parseAdPolicy, midrollCuePoints, placementAllowed, DEFAULT_AD_POLICY, loadAdPolicy, saveAdPolicy, allowsEntryAd, recordAdStart } from './adPolicy';
import { summarizeAdEvents } from './adsReport';

describe('ad rules', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('fills gaps, clamps numbers and reads booleans loosely', () => {
    expect(parseAdPolicy(undefined)).toEqual(DEFAULT_AD_POLICY);
    expect(parseAdPolicy('not json')).toEqual(DEFAULT_AD_POLICY);
    const parsed = parseAdPolicy(JSON.stringify({ enabled: 'true', min_gap_minutes: -5, midroll_every_minutes: '9.6', midroll_max_breaks: 99, postroll_enabled: 'no' }));
    expect(parsed).toMatchObject({ enabled: true, min_gap_minutes: 0, midroll_every_minutes: 10, midroll_max_breaks: 20, postroll_enabled: false });
  });
  it('places mid-rolls every N minutes, never near the end, capped', () => {
    const policy = { ...DEFAULT_AD_POLICY, midroll_every_minutes: 10, midroll_min_minutes: 20, midroll_max_breaks: 3 };
    expect(midrollCuePoints(19 * 60, policy)).toEqual([]);
    expect(midrollCuePoints(31 * 60, policy)).toEqual([600, 1200]);
    expect(midrollCuePoints(3 * 3600, policy)).toEqual([600, 1200, 1800]);
    expect(midrollCuePoints(3600, { ...policy, midroll_enabled: false })).toEqual([]);
    expect(midrollCuePoints(3600, { ...policy, enabled: false })).toEqual([]);
    expect(midrollCuePoints(NaN, policy)).toEqual([]);
  });
  it('turns placements off by rule', () => {
    expect(placementAllowed('pre_roll', 'live', { ...DEFAULT_AD_POLICY, live_entry: false })).toBe(false);
    expect(placementAllowed('pre_roll', 'movie', { ...DEFAULT_AD_POLICY, live_entry: false })).toBe(true);
    expect(placementAllowed('post_roll', 'movie', { ...DEFAULT_AD_POLICY, postroll_enabled: false })).toBe(false);
    expect(placementAllowed('mid_roll', 'episode', { ...DEFAULT_AD_POLICY, enabled: false })).toBe(false);
  });
  it('loads a stored row, survives a failed read and saves the clean version', async () => {
    const stored = JSON.stringify({ min_gap_minutes: 5 });
    const q: any = { select: () => q, eq: () => Promise.resolve({ data: [{ key: 'ads_policy', value: stored }] }) };
    expect((await loadAdPolicy({ from: () => q })).min_gap_minutes).toBe(5);
    expect((await loadAdPolicy({ from: () => { throw new Error('down'); } })).min_gap_minutes).toBe(5);
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const saved = await saveAdPolicy({ min_gap_minutes: '12', midroll_enabled: false }, { from: () => ({ upsert }) });
    expect(saved.policy).toMatchObject({ min_gap_minutes: 12, midroll_enabled: false });
    expect(JSON.parse(upsert.mock.calls[0][0].value).min_gap_minutes).toBe(12);
  });
  it('spaces entry ads by the configured gap', () => {
    const now = 3_000_000_000_000;
    recordAdStart(now);
    expect(allowsEntryAd(now + 4 * 60 * 1000, { ...DEFAULT_AD_POLICY, min_gap_minutes: 5 })).toBe(false);
    expect(allowsEntryAd(now + 5 * 60 * 1000, { ...DEFAULT_AD_POLICY, min_gap_minutes: 5 })).toBe(true);
    expect(allowsEntryAd(now + 1, { ...DEFAULT_AD_POLICY, min_gap_minutes: 0 })).toBe(true);
  });
});

describe('ad report math', () => {
  it('counts by tag, platform and position and derives rates from sessions', () => {
    const now = new Date('2026-10-31T12:00:00Z');
    const day = (offset: number) => new Date(now.getTime() - offset * 86400000).toISOString();
    const rows = [
      { vast_tag_id: 1, event: 'request', session_id: 'a', platform: 'web', created_at: day(0) },
      { vast_tag_id: 1, event: 'impression', session_id: 'a', platform: 'web', user_id: 'u1', created_at: day(0) },
      { vast_tag_id: 1, event: 'complete', session_id: 'a', platform: 'web', created_at: day(0) },
      { vast_tag_id: 2, event: 'request', session_id: 'b', platform: 'tvos', created_at: day(1) },
      { vast_tag_id: 2, event: 'error', session_id: 'b', platform: 'tvos', created_at: day(1) },
      { vast_tag_id: 1, event: 'impression', session_id: 'c', platform: 'web', user_id: 'u1', created_at: day(20) },
    ];
    const report = summarizeAdEvents(rows, [{ id: 1, ad_type: 'pre_roll' }, { id: 2, ad_type: 'mid_roll' }], { days: 14, now });
    expect(report).toMatchObject({ impressions: 2, completes: 1, errors: 1, completionRate: 50, startRate: 50, uniqueViewers: 1 });
    expect(report.byPlatform.web.impressions).toBe(2);
    expect(report.byPlatform.tvos.errors).toBe(1);
    expect(report.byPlacement.pre_roll.completes).toBe(1);
    expect(report.byPlacement.mid_roll.requests).toBe(1);
    expect(report.daily).toHaveLength(14);
    expect(report.daily.at(-1)?.count).toBe(1);
    expect(report.daily.reduce((n, d) => n + d.count, 0)).toBe(1);
  });
});
