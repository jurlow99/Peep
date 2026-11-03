import { expect, it } from 'vitest';
import { adDeviceId, fillAdMacros } from './adMacros';
it('fills break length macros, defaulting to 30 s', () => {
  expect(fillAdMacros('https://x/ads?seconds=[BREAK_SECONDS]&pmxd=[BREAK_MS]', 120.4)).toBe('https://x/ads?seconds=120&pmxd=120000');
  expect(fillAdMacros('https://x/ads?seconds=[BREAK_SECONDS]', null)).toBe('https://x/ads?seconds=30');
  expect(fillAdMacros('https://x/ads?plain=1', 60)).toBe('https://x/ads?plain=1');
});
it('fills what is playing and the device, encoded, with no ad ID on the web', () => {
  const url = 'https://x/ads?channel=[CHANNEL]&show=[SHOW]&genre=[GENRE]&device=[DEVICE]&ifa=[IFA]&lmt=[LMT]';
  expect(fillAdMacros(url, 30, { channel: 'OAN Plus (1080p)', show: 'Tipping Point & More', genre: 'News' }))
    .toBe('https://x/ads?channel=OAN%20Plus%20(1080p)&show=Tipping%20Point%20%26%20More&genre=News&device=web&ifa=&lmt=1');
  expect(fillAdMacros(url, 30)).toBe('https://x/ads?channel=&show=&genre=&device=web&ifa=&lmt=1');
});
it('says whether the break may be skipped', () => {
  expect(fillAdMacros('https://x/ads?skip=[SKIPPABLE]', 30)).toBe('https://x/ads?skip=1');
  expect(fillAdMacros('https://x/ads?skip=[SKIPPABLE]', 30, { skippable: false })).toBe('https://x/ads?skip=0');
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
