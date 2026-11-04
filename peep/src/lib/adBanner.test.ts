// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { bannerFor, companionBanner, parseBannerParameters, prepareBannerHTML } from './adBanner';

const ima = { CompanionAdSelectionSettings: class { static ResourceType = { STATIC: 'static' }; static CreativeType = { IMAGE: 'image' }; static SizeCriteria = { IGNORE: 'ignore' }; } };
const companion = (w: number, h: number, html = `<a href="https://brand.example"><img src="https://cdn.example/${w}x${h}.png" width="${w}" height="${h}"></a><iframe src="https://t.example/cv"></iframe>`) =>
  ({ getWidth: () => w, getHeight: () => h, getContent: () => html });

it('takes the tallest static companion the SDK found', () => {
  const ad = { getCompanionAds: () => [companion(728, 90), companion(300, 600), companion(0, 0)] };
  expect(companionBanner(ima as any, ad)).toMatchObject({ width: 300, height: 600 });
  expect(companionBanner(ima as any, { getCompanionAds: () => [] })).toBeNull();
  expect(companionBanner(ima as any, { getCompanionAds: () => [companion(300, 250, '<div>no picture</div>')] })).toBeNull();
  expect(companionBanner(ima as any, { getCompanionAds: () => { throw new Error('sdk'); } })).toBeNull();
});

it('reads the Apple TV style banner from AdParameters, https only', () => {
  const text = JSON.stringify({ banner: { image: 'https://cdn.example/b.png', width: '300', height: 600, click: 'https://s.example/c', creativeView: ['https://s.example/cv', 'http://insecure.example/cv'] } });
  expect(parseBannerParameters(text)).toEqual({ image: 'https://cdn.example/b.png', width: 300, height: 600, click: 'https://s.example/c', creativeView: ['https://s.example/cv'] });
  expect(parseBannerParameters('{"banner":{"image":"http://cdn.example/b.png"}}')).toBeNull();
  expect(parseBannerParameters('not json')).toBeNull();
  expect(parseBannerParameters('')).toBeNull();
});

it('falls back to AdParameters when the SDK has no companion', () => {
  const ad = { getCompanionAds: () => [], getTraffickingParametersString: () => '{"banner":{"image":"https://cdn.example/b.png"}}' };
  expect(bannerFor(ima as any, ad)?.image).toBe('https://cdn.example/b.png');
  expect(bannerFor(ima as any, { getCompanionAds: () => [], getTraffickingParametersString: () => '' })).toBeNull();
});

it('makes the SDK companion HTML open in a new tab and fit its box', () => {
  const root = document.createElement('div');
  root.innerHTML = companion(300, 600).getContent();
  prepareBannerHTML(root);
  const link = root.querySelector('a')!;
  expect(link.target).toBe('_blank'); expect(link.rel).toBe('noopener');
  expect(root.querySelector('img')!.getAttribute('width')).toBeNull();
  expect(root.querySelector('iframe')!.style.opacity).toBe('0');
});
