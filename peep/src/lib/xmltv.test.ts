// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {xmltvDate,parseChannelGuide,suggestGuideChannel} from './xmltv';
import {publicFeedURL,privateAddress,decodedFeedStream,boundedBytes} from '../../../supabase/functions/_shared/xmltvFetch';
it('parses timezone offsets, matches exactly and skips invalid programme times',()=>{
 expect(xmltvDate('20261028120000 -0400')?.toISOString()).toBe('2026-10-28T16:00:00.000Z');
 const data=parseChannelGuide('<tv><channel id="news"><display-name>News One</display-name></channel><programme channel="news" start="20261028120000 +0000" stop="20261028130000 +0000"><title>News &amp; Weather</title></programme><programme channel="news" start="20261028130000 +0000" stop="20261028120000 +0000"><title>Invalid</title></programme></tv>');
 expect(data.programmes).toHaveLength(1);expect(data.programmes[0].title).toBe('News & Weather');expect(data.skipped).toBe(1);
 expect(suggestGuideChannel(data.channels,'NEWS ONE')).toBe('news');expect(suggestGuideChannel(data.channels,'News Two')).toBe('');
 expect(()=>parseChannelGuide('<tv>')).toThrow();expect(()=>parseChannelGuide('<!DOCTYPE tv><tv/>')).toThrow();
});
it('rejects private hosts/addresses for feed fetches and redirects',()=>{
 expect(()=>publicFeedURL('http://localhost/a.xml')).toThrow();expect(()=>publicFeedURL('file:///a.xml')).toThrow();
 expect(()=>publicFeedURL('https://name:password@example.com/feed')).toThrow();
 expect(privateAddress('127.0.0.1')).toBe(true);expect(privateAddress('169.254.169.254')).toBe(true);expect(privateAddress('::ffff:127.0.0.1')).toBe(true);expect(privateAddress('8.8.8.8')).toBe(false);
});

it('detects actual gzip bytes instead of double-decompressing a decoded .gz response',async()=>{
 const text='<tv><channel id="test"/></tv>';
 const compressed=new Response(text).body!.pipeThrough(new CompressionStream('gzip'));
 expect(new TextDecoder().decode(await boundedBytes(await decodedFeedStream(new Response(compressed))))).toBe(text);
 expect(new TextDecoder().decode(await boundedBytes(await decodedFeedStream(new Response(text))))).toBe(text);
});
