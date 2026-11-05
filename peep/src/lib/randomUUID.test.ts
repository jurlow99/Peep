import { expect, it } from 'vitest';
import { uuidFromBytes } from './randomUUID';

it('makes a valid v4 UUID from 16 random bytes', () => {
  const id = uuidFromBytes(crypto.getRandomValues(new Uint8Array(16)));
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(uuidFromBytes(new Uint8Array(16).fill(255))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
});
