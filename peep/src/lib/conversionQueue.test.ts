import { describe, expect, it, vi } from 'vitest';
vi.mock('../supabase', () => ({ supabase: {} }));
import { conversionListText } from './conversionQueue';

describe('conversion list text', () => {
  it('groups files by folder, one per line, ready to paste', () => {
    const text = conversionListText([
      { path: 'South Park/Season 02/ep01 Terrance.mkv' },
      { path: 'South Park/Season 02/ep02 Cartman.mkv' },
      { path: 'Big Lez/S04E03 Vinally.webm' },
      { path: 'loose.mkv' },
    ]);
    expect(text).toBe('South Park/Season 02\n  - ep01 Terrance.mkv\n  - ep02 Cartman.mkv\n\nBig Lez\n  - S04E03 Vinally.webm\n\n(top level)\n  - loose.mkv');
  });
});
