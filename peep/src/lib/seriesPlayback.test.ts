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
