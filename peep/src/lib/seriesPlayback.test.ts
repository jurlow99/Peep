import {expect,it} from 'vitest';
import {nextSeriesEpisode,allowsEpisodeAutoplay} from './seriesPlayback';
it('orders across seasons, skips missing/unapproved streams, and never wraps',()=>{
 const current={id:1,season:1,episode_number:1,url:'current'};
 const next={id:4,season:2,episode_number:1,url:'next',status:'approved'};
 const episodes=[next,current,{id:2,season:1,episode_number:2},{id:3,season:1,episode_number:3,url:'pending',status:'pending'}];
 expect(nextSeriesEpisode(current,episodes)).toEqual(next);
 expect(nextSeriesEpisode(next,episodes)).toBeNull();
});
it('requires both series permission and viewer preference',()=>{
 expect(allowsEpisodeAutoplay(true,null)).toBe(true);
 expect(allowsEpisodeAutoplay(true,'false')).toBe(false);
 expect(allowsEpisodeAutoplay(false,'true')).toBe(false);
});

import {isExtra, seasonLabel, seasonOrder} from './seriesPlayback';
it('keeps the Extras shelf out of next-up and sorts it last', () => {
  const trailer = {id: 9, season: 0, episode_number: 1, url: 'https://cdn/t.mp4', status: 'approved'};
  const e1 = {id: 1, season: 1, episode_number: 1, url: 'https://cdn/1.mp4', status: 'approved'};
  const e2 = {id: 2, season: 1, episode_number: 2, url: 'https://cdn/2.mp4', status: 'approved'};
  expect(nextSeriesEpisode(e1, [trailer, e1, e2])?.id).toBe(2);
  expect(nextSeriesEpisode(e2, [trailer, e1, e2])).toBeNull();
  expect(nextSeriesEpisode(trailer, [trailer, e1, e2])).toBeNull();
  expect(isExtra(trailer)).toBe(true);
  expect([0, 2, 1].sort(seasonOrder)).toEqual([1, 2, 0]);
  expect(seasonLabel(0)).toBe('Extras');
  expect(seasonLabel(2)).toBe('Season 2');
});
