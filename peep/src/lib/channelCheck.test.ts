import {describe,it,expect} from 'vitest';
import {channelCheckURL} from './channelCheck';
import {httpCheckResult,isHLSManifest} from '../../../supabase/functions/check-channels/manifest';
describe('channel checker',()=>{
 it('uses the linked feed before stale direct URLs',()=>{
  expect(channelCheckURL({live_feed_id:'abc',hls_url:'https://old.invalid/live.m3u8'},[{id:'abc',cloudflare_hls_url:'https://feed.invalid/live.m3u8'}])).toBe('https://feed.invalid/live.m3u8');
  expect(channelCheckURL({hls_url:'https://direct.invalid/live.m3u8'})).toBe('https://direct.invalid/live.m3u8');
  expect(channelCheckURL({stream_uid:'uid'})).toContain('/uid/manifest/video.m3u8');
  expect(channelCheckURL({hls_url:'javascript:alert(1)'})).toBe('');
 });
 it('distinguishes missing playlists from blocked or inconclusive checks',()=>{
  expect(httpCheckResult(403).status).toBe('unknown');
  expect(httpCheckResult(429).status).toBe('unknown');
  expect(httpCheckResult(503).status).toBe('unknown');
  expect(httpCheckResult(404).status).toBe('dead');
 });
 it('recognizes media and master playlists and rejects HTML/error pages',()=>{
  expect(isHLSManifest('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8')).toBe(true);
  expect(isHLSManifest('\uFEFF#EXTM3U\n#EXTINF:6,\nsegment.ts')).toBe(true);
  expect(isHLSManifest('<html>#EXT error</html>')).toBe(false);
  expect(isHLSManifest('#EXTM3U')).toBe(false);
 });
});
