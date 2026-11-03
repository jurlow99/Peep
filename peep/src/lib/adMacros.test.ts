import { expect, it } from 'vitest';
import { fillAdMacros } from './adMacros';
it('fills break length macros, defaulting to 30 s', () => {
  expect(fillAdMacros('https://x/ads?seconds=[BREAK_SECONDS]&pmxd=[BREAK_MS]', 120.4)).toBe('https://x/ads?seconds=120&pmxd=120000');
  expect(fillAdMacros('https://x/ads?seconds=[BREAK_SECONDS]', null)).toBe('https://x/ads?seconds=30');
  expect(fillAdMacros('https://x/ads?plain=1', 60)).toBe('https://x/ads?plain=1');
});
