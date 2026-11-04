// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { squeezeDue, squeezeSeconds } from './squeezeAd';
import { parsePauseAd } from './pauseAd';
import { DEFAULT_AD_POLICY } from './adPolicy';

const MIN = 60000;
const base = { now: 100 * MIN, lastAskedAt: 85 * MIN, lastBreakEndedAt: 0, playing: true, adBusy: false, policy: DEFAULT_AD_POLICY };

it('asks every N minutes of playback, never during or just after a break, never paused', () => {
  expect(squeezeDue(base)).toBe(true);
  expect(squeezeDue({ ...base, lastAskedAt: 95 * MIN })).toBe(false);
  expect(squeezeDue({ ...base, lastAskedAt: 95 * MIN, policy: { ...DEFAULT_AD_POLICY, squeeze_every_minutes: 5 } })).toBe(true);
  expect(squeezeDue({ ...base, lastBreakEndedAt: 99 * MIN })).toBe(false);
  expect(squeezeDue({ ...base, lastBreakEndedAt: 98 * MIN })).toBe(true);
  expect(squeezeDue({ ...base, playing: false })).toBe(false);
  expect(squeezeDue({ ...base, adBusy: true })).toBe(false);
  expect(squeezeDue({ ...base, policy: { ...DEFAULT_AD_POLICY, squeeze_enabled: false } })).toBe(false);
  expect(squeezeDue({ ...base, policy: { ...DEFAULT_AD_POLICY, enabled: false } })).toBe(false);
  expect(squeezeDue({ ...base, policy: null })).toBe(false);
});

it('on live, asks once per gap between breaks, a few minutes after the break ends', () => {
  const live = { ...base, live: true, startedAt: 90 * MIN, lastAskedAt: 90 * MIN };
  expect(squeezeDue({ ...live, now: 92 * MIN })).toBe(false);                          // 2 min after opening
  expect(squeezeDue({ ...live, now: 93 * MIN })).toBe(true);                           // 3 min after opening
  expect(squeezeDue({ ...live, now: 93 * MIN, askedSinceBreak: true })).toBe(false);   // this gap had its turn
  expect(squeezeDue({ ...live, lastBreakEndedAt: 98 * MIN })).toBe(false);             // break ended 2 min ago
  expect(squeezeDue({ ...live, lastBreakEndedAt: 97 * MIN })).toBe(true);              // 3 min after the break
  expect(squeezeDue({ ...live, lastBreakEndedAt: 97 * MIN, adBusy: true })).toBe(false);
  expect(squeezeDue({ ...live, lastBreakEndedAt: 95 * MIN, policy: { ...DEFAULT_AD_POLICY, squeeze_live_after_break_minutes: 6 } })).toBe(false);
});

it('keeps the picture up for minSuggestedDuration, 15 s when missing, 60 s at most', () => {
  const vast = (attr: string) => `<VAST version="4.2" xmlns="http://www.iab.com/VAST"><Ad id="1"><InLine><AdTitle>L</AdTitle><Creatives><Creative><NonLinearAds>
    <NonLinear width="1920" height="1080" ${attr}><StaticResource creativeType="image/png"><![CDATA[https://cdn.example/l.png]]></StaticResource></NonLinear>
    </NonLinearAds></Creative></Creatives></InLine></Ad></VAST>`;
  expect(parsePauseAd(vast('minSuggestedDuration="00:00:15.000"'))?.duration).toBe(15);
  expect(parsePauseAd(vast('minSuggestedDuration="00:01:30"'))?.duration).toBe(90);
  expect(parsePauseAd(vast(''))?.duration).toBeNull();
  expect(parsePauseAd(vast('minSuggestedDuration="nonsense"'))?.duration).toBeNull();
  expect(squeezeSeconds(parsePauseAd(vast('minSuggestedDuration="00:00:15.000"')))).toBe(15);
  expect(squeezeSeconds(parsePauseAd(vast('minSuggestedDuration="00:05:00"')))).toBe(60);
  expect(squeezeSeconds(parsePauseAd(vast('')))).toBe(15);
});
