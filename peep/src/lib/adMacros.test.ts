import { expect, it } from 'vitest';
import { adChannelName, adDeviceId, fillAdMacros } from './adMacros';
it('fills break length macros, defaulting to 30 s', () => {
  expect(fillAdMacros('https://x/ads?seconds=[BREAK_SECONDS]&pmxd=[BREAK_MS]', 120.4)).toBe('https://x/ads?seconds=120&pmxd=120000');
  expect(fillAdMacros('https://x/ads?seconds=[BREAK_SECONDS]', null)).toBe('https://x/ads?seconds=30');
  expect(fillAdMacros('https://x/ads?plain=1', 60)).toBe('https://x/ads?plain=1');
});
it('fills what is playing and the device, encoded, with no ad ID on the web', () => {
  const url = 'https://x/ads?channel=[CHANNEL]&show=[SHOW]&genre=[GENRE]&device=[DEVICE]&ifa=[IFA]&lmt=[LMT]';
  expect(fillAdMacros(url, 30, { channel: 'OAN Plus (1080p)', show: 'Tipping Point & More', genre: 'News' }))
    .toBe('https://x/ads?channel=OAN%20Plus&show=Tipping%20Point%20%26%20More&genre=News&device=web&ifa=&lmt=1');
  expect(fillAdMacros(url, 30)).toBe('https://x/ads?channel=&show=&genre=&device=web&ifa=&lmt=1');
});
it('sends one clean spelling per channel', () => {
  expect(adChannelName('Dog the Bounty Hunter (1080p)')).toBe('Dog the Bounty Hunter');
  expect(adChannelName('Dog the Bounty Hunter')).toBe('Dog the Bounty Hunter');
  expect(adChannelName('ESPN (United States) HD (720p)')).toBe('ESPN (United States) HD');
  expect(adChannelName('Formula 1 AntenaPlay (576p) [Not 24/7]')).toBe('Formula 1 AntenaPlay');
  expect(adChannelName("Vevo '80s (1080p)")).toBe("Vevo '80s");
  expect(adChannelName('FightBox HD')).toBe('FightBox HD');
  expect(adChannelName('  ')).toBe('');
  expect(fillAdMacros('https://x/?c=[CHANNEL]', 30, { channel: 'Dog the Bounty Hunter (1080p)' })).toBe('https://x/?c=Dog%20the%20Bounty%20Hunter');
});
it('says whether the break may be skipped', () => {
  expect(fillAdMacros('https://x/ads?skip=[SKIPPABLE]', 30)).toBe('https://x/ads?skip=1');
  expect(fillAdMacros('https://x/ads?skip=[SKIPPABLE]', 30, { skippable: false })).toBe('https://x/ads?skip=0');
  expect(fillAdMacros('https://x/ads?ct=[CT]', 30)).toBe('https://x/ads?ct=vod');
  expect(fillAdMacros('https://x/ads?ct=[CT]', 30, { contentType: 'live' })).toBe('https://x/ads?ct=live');
});
it('makes one random device ID per browser and keeps it', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  const first = adDeviceId(storage);
  expect(first).toMatch(/^[0-9a-f]{32}$/);
  expect(adDeviceId(storage)).toBe(first);
  expect(adDeviceId({ getItem: () => { throw new Error('blocked'); }, setItem: () => {} })).toBe('');
  expect(fillAdMacros('https://x/ads?did=[DEVICE_ID]&device=[DEVICE]', 30, { deviceId: first })).toBe(`https://x/ads?did=${first}&device=web`);
});
