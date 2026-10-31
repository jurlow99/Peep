import { describe, expect, it } from 'vitest';
import { channelCategories, liveRowChannels, automaticLiveRows } from './liveRows';
const channels = [{id:1,name:'One',category:'News'}, {id:2,name:'Two',category:'Outdoor;Sports'}, {id:3,name:'Three',category:'news'}];
describe('curated live channel rows', () => {
  it('adds categories automatically without duplicating or resurrecting configured rows', () => {
    const configured = [{id:1,type:'live_channels',pages:'home, live',filter_value:' NEWS ',enabled:false}];
    const rows = automaticLiveRows(channels, configured);
    expect(rows.map(r => r.filter_value)).toEqual(['Outdoor','Sports']);
    const added = automaticLiveRows([...channels,{id:4,category:'Kids'},{id:5,category:'Hidden',is_active:false}],configured);
    expect(added.find(r=>r.filter_value==='Sports')?.id).toBe(rows.find(r=>r.filter_value==='Sports')?.id);
    expect(added.some(r=>r.filter_value==='Kids')).toBe(true);
    expect(added.some(r=>r.filter_value==='Hidden')).toBe(false);
    expect(channelCategories(' ')).toEqual(['General']);
  });
  it('matches actual categories with trimmed, case-insensitive and multi-category values', () => {
    expect(liveRowChannels(' NEWS ',channels).map(c => c.id)).toEqual([1,3]);
    expect(liveRowChannels('sports',channels).map(c => c.id)).toEqual([2]);
    expect(channelCategories('Auto;Outdoor|Sports, News')).toEqual(['Auto','Outdoor','Sports','News']);
  });
  it('preserves manual order, ignores missing IDs and removes duplicates', () => {
    expect(liveRowChannels('[{"id":"3"},{"id":1},{"id":999},{"id":3}]',channels).map(c => c.id)).toEqual([3,1]);
    expect(liveRowChannels('[]',channels)).toEqual([]);
    expect(liveRowChannels('[broken',channels)).toEqual([]);
    expect(liveRowChannels('',channels)).toEqual(channels);
  });
});
