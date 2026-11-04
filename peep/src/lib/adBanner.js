// Banner beside a video ad (VAST CompanionAds). While an ad with a banner plays, the
// video shrinks to two thirds and the picture fills the space on the right.
//
// Two sources, first wins:
// 1. The Google IMA SDK's own companion support: `ad.getCompanionAds()` after STARTED
//    gives HTML (a link around the picture plus the creativeView tracker), so the SDK
//    counts the view and the link counts the click itself.
// 2. A `banner` object in the Linear creative's <AdParameters> JSON. Apple TV can only
//    get banners this way (Google's tvOS SDK drops CompanionAds), so Steep sends it
//    for every device; the web uses it when the SDK found no companion.
const https = url => { try { return new URL(String(url || '').trim()).protocol === 'https:' ? String(url).trim() : null; } catch { return null; } };

// `settings` enums fall back to their string values for SDK builds that lack them.
export function companionBanner(ima, ad, slotWidth = 300, slotHeight = 600) {
  try {
    const settings = new ima.CompanionAdSelectionSettings();
    const S = ima.CompanionAdSelectionSettings;
    settings.resourceType = S.ResourceType?.STATIC || 'static';
    settings.creativeType = S.CreativeType?.IMAGE || 'image';
    settings.sizeCriteria = S.SizeCriteria?.IGNORE || 'ignore';
    const companion = (ad.getCompanionAds(slotWidth, slotHeight, settings) || [])
      .filter(c => c.getWidth?.() > 0 && c.getHeight?.() > 0)
      .sort((a, b) => b.getHeight() / b.getWidth() - a.getHeight() / a.getWidth())[0]; // tallest first: it fits the side slot best
    if (!companion) return null;
    const html = companion.getContent();
    if (!html || !/<img/i.test(html)) return null;
    return { html, width: companion.getWidth(), height: companion.getHeight() };
  } catch { return null; }
}

// {"banner":{"image","width","height","creativeView":[…],"click"}} → banner or null.
export function parseBannerParameters(text) {
  try {
    const banner = JSON.parse(String(text || ''))?.banner;
    const image = https(banner?.image);
    if (!image) return null;
    const size = n => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : null);
    return {
      image, width: size(banner.width) || 1, height: size(banner.height) || 1,
      click: https(banner.click),
      creativeView: [].concat(banner.creativeView || []).map(https).filter(Boolean),
    };
  } catch { return null; }
}

// The banner for an IMA ad, from either source.
export function bannerFor(ima, ad) {
  return companionBanner(ima, ad) || parseBannerParameters(ad.getTraffickingParametersString?.());
}

// The SDK's companion HTML: links open in a new tab, the picture fits its box.
export function prepareBannerHTML(root) {
  for (const link of root.querySelectorAll('a')) { link.target = '_blank'; link.rel = 'noopener'; }
  for (const img of root.querySelectorAll('img')) { img.removeAttribute('width'); img.removeAttribute('height'); img.style.cssText = 'max-width:100%;max-height:100%;width:auto;height:auto;display:block;margin:auto'; }
  for (const frame of root.querySelectorAll('iframe')) { frame.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none'; }
}
