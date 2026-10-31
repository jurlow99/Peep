import { describe, expect, it } from 'vitest';
import { packagesForRow, packageChannels } from './multiview';
describe('curated multiview', () => {
  const packages = [{ id: 'a', enabled: true }, { id: 'b', enabled: true }, { id: 'off', enabled: false }];
  it('preserves curated order and removes disabled or missing packages', () => {
    expect(packagesForRow({ filter_value: '[{"id":"b"},{"id":"off"},{"id":"missing"},{"id":"a"}]' }, packages).map(p => p.id)).toEqual(['b','a']);
    expect(packagesForRow({ filter_value: '' }, packages)).toEqual(packages.slice(0, 2));
    expect(packagesForRow({ filter_value: 'broken' }, packages)).toEqual([]);
    expect(packagesForRow({ filter_value: '[]' }, packages)).toEqual([]);
  });
  it('resolves four channels in screen order and rejects incomplete or duplicate grids', () => {
    const pkg = { left_channel_id: 4, right_channel_id: 1, third_channel_id: 3, fourth_channel_id: 2 };
    const channels = [1,2,3,4].map(id => ({ id }));
    expect(packageChannels(pkg, channels).map(c => c.id)).toEqual([4,1,3,2]);
    expect(packageChannels(pkg, channels.slice(0,3))).toEqual([]);
    expect(packageChannels({ ...pkg, fourth_channel_id: null }, channels)).toEqual([]);
    expect(packageChannels({ ...pkg, fourth_channel_id: 4 }, channels)).toEqual([]);
  });
  it('never substitutes another channel for an unavailable curated channel', () => {
    const pkg = { left_channel_id: 3, right_channel_id: 1 };
    const channels = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(packageChannels(pkg, channels).map(c => c.id)).toEqual([3,1]);
    expect(packageChannels(pkg, channels.slice(0,2))).toEqual([]);
    expect(packageChannels(pkg, [{id: 1}, {id: 3, is_active: false}])).toEqual([]);
    expect(packageChannels(pkg, [{id: 1}, {id: 3, is_premium: true}])).toEqual([]);
    expect(packageChannels({left_channel_id: 1, right_channel_id: 1}, channels)).toEqual([]);
  });
});
