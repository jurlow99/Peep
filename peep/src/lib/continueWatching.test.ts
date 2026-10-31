import { expect, it } from 'vitest';
import { continueWatchingItems } from './continueWatching';
it('keeps recent resumable movies and episodes, excludes completed/unavailable items and duplicates', () => {
  const content = [{ id:'m', _type:'movie', title:'Movie' }, {id:1,_type:'show',title:'Series',thumbnail:'show.jpg'}];
  const row = (id: string, type = 'movie', extra = {}) => ({content_id:id,content_type:type,progress_seconds:30,duration_seconds:100,completed:false,...extra});
  const rows = [row('2','episode'),row('m'),row('m'),row('missing'),row('3','episode'),row('m','movie',{completed:true})];
  expect(continueWatchingItems(rows,content,[{id:2,show_id:1,title:'Pilot'},{id:3,show_id:99}])).toEqual([
    {id:2,show_id:1,title:'Series · Pilot',_type:'episode',thumbnail:'show.jpg'},content[0]
  ]);
  expect(continueWatchingItems([row('m','movie',{progress_seconds:10}),row('m','movie',{duration_seconds:0}),row('m','movie',{progress_seconds:90}),row('m','movie',{progress_seconds:NaN})],content)).toEqual([]);
  expect(continueWatchingItems([],content)).toEqual([]);
});
