import { expect, it } from 'vitest';
import { tagProblem, tagPayload, describeTarget, scopesForPosition, EMPTY_AD } from './adsAdmin';

const ok = { ...EMPTY_AD, name: 'House', tag_url: 'https://ads.example.com/vast' };

it('stops bad tags before they reach the database', () => {
  expect(tagProblem({ ...EMPTY_AD })).toContain('name');
  expect(tagProblem({ ...ok, tag_url: 'http://ads.example.com' })).toContain('https');
  expect(tagProblem({ ...ok, ad_type: 'post_roll', scope: 'live' })).toContain("can't run");
  expect(tagProblem({ ...ok, ad_type: 'mid_roll', scope: 'multiview' })).toContain("can't run");
  expect(tagProblem({ ...ok, platforms: [] })).toContain('at least one');
  expect(tagProblem({ ...ok, ad_type: 'mid_roll', platforms: ['tvos'] }, true)).toBeTruthy();
  expect(tagProblem({ ...ok, ad_type: 'mid_roll', scope: 'live', content_id: '7', platforms: ['web', 'tvos'] }, true)).toContain('untick Browser');
  expect(tagProblem({ ...ok, ad_type: 'mid_roll', scope: 'live', content_id: '7', platforms: ['tvos'] }, true)).toBeNull();
  expect(tagProblem(ok)).toBeNull();
  expect(tagProblem({ ...ok, ad_type: 'mid_roll', platforms: ['web'] })).toBeNull();
});

it('stores a clean row and keeps ids as text', () => {
  expect(tagPayload({ ...ok, scope: 'movie', content_id: ' 4e11d0a0-3e97-4c7b-a800-000000000001 ' }).content_id).toBe('4e11d0a0-3e97-4c7b-a800-000000000001');
  expect(tagPayload({ ...ok, scope: 'global', content_id: '12' }).content_id).toBeNull();
  expect(tagPayload({ ...ok, scope: 'live', content_id: '' }).content_id).toBeNull();
  expect(tagPayload({ ...ok, is_test: undefined }).is_test).toBe(true);
});

it('describes targets with titles when known and narrows scopes by position', () => {
  expect(describeTarget({ scope: 'live', content_id: '3' }, { 'live:3': 'Rally TV' })).toBe('Live channels · Rally TV');
  expect(describeTarget({ scope: 'movie', content_id: 'abc' })).toBe('Movies · #abc');
  expect(describeTarget({ scope: 'global' })).toBe('All content');
  expect(scopesForPosition('post_roll').map(s => s.value)).toEqual(['global', 'movie', 'episode']);
  expect(scopesForPosition('pre_roll').map(s => s.value)).toContain('multiview');
});
