// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { parsePauseAd, loadPauseAd } from './pauseAd';

const VAST = `<VAST version="4.2" xmlns="http://www.iab.com/VAST"><Ad id="1"><InLine>
  <AdTitle>Farris Cola</AdTitle>
  <Impression><![CDATA[https://t.example/imp]]></Impression><Impression><![CDATA[http://insecure.example/imp]]></Impression>
  <Creatives><Creative><NonLinearAds><NonLinear width="800" height="450">
    <StaticResource creativeType="image/png"><![CDATA[ https://cdn.example/pause.png ]]></StaticResource>
    <NonLinearClickThrough><![CDATA[https://brand.example]]></NonLinearClickThrough>
    <NonLinearClickTracking><![CDATA[https://t.example/click]]></NonLinearClickTracking>
  </NonLinear></NonLinearAds></Creative></Creatives></InLine></Ad></VAST>`;

it('reads the picture, size, impressions and click links from a NonLinear ad', () => {
  expect(parsePauseAd(VAST)).toEqual({
    image: 'https://cdn.example/pause.png', width: 800, height: 450,
    impressions: ['https://t.example/imp'], // http trackers are dropped
    clickThrough: 'https://brand.example', clickTracking: ['https://t.example/click'], title: 'Farris Cola', duration: null,
  });
});

it('shows nothing for an empty or broken reply', () => {
  expect(parsePauseAd('<VAST version="4.2" xmlns="http://www.iab.com/VAST"></VAST>')).toBeNull();
  expect(parsePauseAd('not xml')).toBeNull();
  expect(parsePauseAd(VAST.replace('https://cdn.example/pause.png', 'http://cdn.example/pause.png'))).toBeNull();
});

it('fills the tag macros and survives a failed request', async () => {
  let asked = '';
  const ad = await loadPauseAd('https://ads.example/v?p=peep-pause&channel=[CHANNEL]&show=[SHOW]&device=[DEVICE]', { channel: 'OAN Plus (1080p)', show: 'Full Force' },
    { fetch: async url => { asked = url; return new Response(VAST); } });
  expect(asked).toBe('https://ads.example/v?p=peep-pause&channel=OAN%20Plus&show=Full%20Force&device=web');
  expect(ad?.image).toBe('https://cdn.example/pause.png');
  expect(await loadPauseAd('https://ads.example/v', {}, { fetch: async () => { throw new Error('offline'); } })).toBeNull();
});
