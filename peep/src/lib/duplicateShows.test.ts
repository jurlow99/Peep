import { describe, expect, it } from 'vitest';
import { duplicateShowGroups } from './duplicateShows';

describe('duplicate series detection', () => {
  it('groups shows by title ignoring case and spacing, fullest first', () => {
    const shows = [{ id: 10, title: 'The Donny & Clarence Show' }, { id: 11, title: 'the donny &  clarence show ' }, { id: 5, title: 'Big Lez' }, { id: 12, title: 'Big  LEZ' }, { id: 7, title: 'Solo' }];
    const episodes = [{ show_id: 10 }, { show_id: 10 }, { show_id: 11 }, { show_id: 11 }, { show_id: 11 }];
    const groups = duplicateShowGroups(shows, episodes);
    expect(groups.map(g => g.members.map(m => m.id))).toEqual([[11, 10], [5, 12]]);
    expect(groups[0].keep.id).toBe(11);
    expect(groups[0].members.map(m => m.episodes)).toEqual([3, 2]);
    expect(groups[1].keep.id).toBe(5); // tie on episodes → the older row
  });

  it('returns nothing when titles are unique or blank', () => {
    expect(duplicateShowGroups([{ id: 1, title: 'A' }, { id: 2, title: 'B' }, { id: 3, title: '' }, { id: 4, title: '  ' }])).toEqual([]);
  });
});
