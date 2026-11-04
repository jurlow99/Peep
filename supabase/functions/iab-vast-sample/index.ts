// Public static playback fixture only. No credentials or user data; variant=peep
// reads the public ads_policy row (anon key) for the live skip setting.
// Adapted from IAB VAST 4.2 Inline_Linear_Tag-test.xml; media uses the repo copy.
// The static XML is embedded at deployment to avoid runtime file dependencies.
const xml = "<VAST version=\"4.2\" xmlns:xs=\"http://www.w3.org/2001/XMLSchema\" xmlns=\"http://www.iab.com/VAST\">\n  <Ad id=\"20001\" sequence=\"1\">\n    <InLine>\n      <AdSystem version=\"1\">iabtechlab</AdSystem>\n      \n      <Extensions>\n        <Extension type=\"iab-Count\">\n          <total_available>\n            <![CDATA[ 2 ]]>\n          </total_available>\n        </Extension>\n      </Extensions>\n      <Impression><![CDATA[https://example.com/iab-test-only]]></Impression>\n      <Pricing model=\"cpm\" currency=\"USD\">\n        <![CDATA[ 25.00 ]]>\n      </Pricing>\n      <AdServingId>a532d16d-4d7f-4440-bd29-2ec0e693fc80</AdServingId>\n      <AdTitle>iabtechlab video ad</AdTitle>\n      <Creatives>\n        <Creative id=\"5480\" sequence=\"1\" adId=\"2447226\">\n          <Linear>\n            \n            <Duration>00:00:16</Duration>\n            <MediaFiles>\n              <MediaFile id=\"5241\" delivery=\"progressive\" type=\"video/mp4\" bitrate=\"2000\" width=\"1280\" height=\"720\" minBitrate=\"1500\" maxBitrate=\"2500\" scalable=\"1\" maintainAspectRatio=\"1\" codec=\"H.264\">\n                <![CDATA[https://raw.githubusercontent.com/InteractiveAdvertisingBureau/VAST_Samples/master/VAST/VAST-4.0-Short-Intro.mp4]]>\n              </MediaFile>\n              <MediaFile id=\"5244\" delivery=\"progressive\" type=\"video/mp4\" bitrate=\"1000\" width=\"854\" height=\"480\" minBitrate=\"700\" maxBitrate=\"1500\" scalable=\"1\" maintainAspectRatio=\"1\" codec=\"H.264\">\n                <![CDATA[https://raw.githubusercontent.com/InteractiveAdvertisingBureau/VAST_Samples/master/VAST/VAST-4.0-Short-Intro-mid-resolution.mp4]]>\n              </MediaFile>\n              <MediaFile id=\"5246\" delivery=\"progressive\" type=\"video/mp4\" bitrate=\"600\" width=\"640\" height=\"360\" minBitrate=\"500\" maxBitrate=\"700\" scalable=\"1\" maintainAspectRatio=\"1\" codec=\"H.264\">\n                <![CDATA[https://raw.githubusercontent.com/InteractiveAdvertisingBureau/VAST_Samples/master/VAST/VAST-4.0-Short-Intro-low-resolution.mp4]]>\n              </MediaFile>\n            </MediaFiles>\n            <VideoClicks>\n              <ClickThrough id=\"blog\">\n                <![CDATA[https://iabtechlab.com]]>\n              </ClickThrough>\n            </VideoClicks>\n          </Linear>\n          <UniversalAdId idRegistry=\"Ad-ID\">8465</UniversalAdId>\n          <UniversalAdId idRegistry=\"Foo-ID\">4444323</UniversalAdId>\n        </Creative>\n      </Creatives>\n    </InLine>\n  </Ad>\n</VAST>\n";
// Adapted from IAB Wrapper_Tag-test.xml. One hop to our known inline fixture;
// no arbitrary redirect target, companion slot, or third-party measurement.
const wrapper = `<VAST version="4.2" xmlns="http://www.iab.com/VAST">
  <Ad id="peep-iab-wrapper" sequence="1">
    <Wrapper followAdditionalWrappers="false" allowMultipleAds="false" fallbackOnNoAd="false">
      <AdSystem version="4.2">Peep IAB test fixture</AdSystem>
      <Impression><![CDATA[https://example.com/iab-wrapper-test-only]]></Impression>
      <VASTAdTagURI><![CDATA[https://cuwdyedmmnpklufduaho.supabase.co/functions/v1/iab-vast-sample]]></VASTAdTagURI>
      <Creatives />
    </Wrapper>
  </Ad>
</VAST>`;
Deno.serve(async (request: Request) => {
  const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" };
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers });
  const params = new URL(request.url).searchParams;
  const variant = params.get("variant");
  if (variant === "peep") {
    const skip = params.get("scope") === "live" ? await liveSkipSeconds() : 0;
    const body = peepPod(Number(params.get("seconds") || 30), skip);
    return new Response(request.method === "HEAD" ? null : body, { headers: { ...headers, "Cache-Control": "no-store" } });
  }
  if (variant === "pause") {
    return new Response(request.method === "HEAD" ? null : PAUSE_AD, { headers: { ...headers, "Cache-Control": "no-store" } });
  }
  if (variant !== null && variant !== "wrapper") return new Response("Unknown test variant", { status: 400, headers });
  return new Response(request.method === "HEAD" ? null : variant === "wrapper" ? wrapper : xml, { headers });
});

// variant=peep: Peep-branded test spots (15 s and 30 s, public dev bucket), returned
// as a VAST ad pod sized to the break: as many 30 s spots as fit, then a 15 s one.
// Under 15 s returns an empty VAST, like a real ad server with nothing to sell.
// Each slot gets a random look/tune from STYLES, never the same one twice in a pod.
const STYLES = ["fractal", "life", "bars", "cells", "noise", "gradient"];
// Every other spot carries a banner (beside-the-video picture), both as VAST CompanionAds
// for the web SDK and as AdParameters JSON for Apple TV. See peep/src/lib/adBanner.js.
const BANNER = "https://cuwdyedmmnpklufduaho.supabase.co/storage/v1/object/public/ad-creatives/test/peep-pause-test.png";
const CREATIVE = (style: string, s: number) => `https://cuwdyedmmnpklufduaho.supabase.co/storage/v1/object/public/ad-creatives/test/peep-test-${style}-${s}s.mp4`;
function shuffled(items: string[]): string[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
function podFor(seconds: number): number[] {
  const budget = Number.isFinite(seconds) ? Math.min(600, Math.max(0, Math.floor(seconds))) : 30;
  const spots: number[] = [];
  let left = budget;
  while (left >= 30 && spots.length < 8) { spots.push(30); left -= 30; }
  if (left >= 15 && spots.length < 8) spots.push(15);
  return spots;
}
// Admin → Monetization → Ads → Live TV "Skip button after N seconds". 0 or unreadable = no skip.
async function liveSkipSeconds(): Promise<number> {
  try {
    const key = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/app_settings?select=value&key=eq.ads_policy`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(2000),
    });
    const rows = await response.json();
    const value = rows?.[0]?.value ?? "{}";
    const policy = typeof value === "string" ? JSON.parse(value) : value;
    const seconds = Math.round(Number(policy.live_skip_seconds));
    return Number.isFinite(seconds) ? Math.min(60, Math.max(0, seconds)) : 0;
  } catch { return 0; }
}
const clock = (s: number) => `00:00:${String(s).padStart(2, "0")}`;
function peepPod(seconds: number, skip = 0): string {
  const spots = podFor(seconds);
  let deck: string[] = [];
  const ads = spots.map((length, i) => {
    if (!deck.length) deck = shuffled(STYLES);
    const style = deck.pop()!;
    return `  <Ad id="peep-test-${style}-${length}s-${i + 1}" sequence="${i + 1}">
    <InLine>
      <AdSystem version="1">Peep test ad server</AdSystem>
      <AdTitle>Peep test ad ${i + 1} of ${spots.length} - ${style} ${length}s</AdTitle>
      <Impression><![CDATA[https://example.com/peep-test-impression]]></Impression>
      <Creatives>
        <Creative id="peep-test-${style}-${length}s" sequence="1">
          <Linear${skip > 0 && skip < length ? ` skipoffset="${clock(skip)}"` : ""}>
            <Duration>${clock(length)}</Duration>${i % 2 === 0 ? `
            <AdParameters><![CDATA[${JSON.stringify({ banner: { image: BANNER, width: 800, height: 450, creativeView: ["https://example.com/peep-test-banner-view"], click: "https://watchpeep.tv" } })}]]></AdParameters>` : ""}
            <MediaFiles>
              <MediaFile delivery="progressive" type="video/mp4" width="1920" height="1080" codec="H.264" bitrate="200"><![CDATA[${CREATIVE(style, length)}]]></MediaFile>
            </MediaFiles>
          </Linear>
        </Creative>${i % 2 === 0 ? `
        <Creative id="peep-test-banner" sequence="1">
          <CompanionAds>
            <Companion id="peep-test-banner" width="800" height="450">
              <StaticResource creativeType="image/png"><![CDATA[${BANNER}]]></StaticResource>
              <TrackingEvents><Tracking event="creativeView"><![CDATA[https://example.com/peep-test-banner-view]]></Tracking></TrackingEvents>
              <CompanionClickThrough><![CDATA[https://watchpeep.tv]]></CompanionClickThrough>
            </Companion>
          </CompanionAds>
        </Creative>` : ""}
      </Creatives>
    </InLine>
  </Ad>`;
  }).join("\n");
  return `<VAST version="4.2" xmlns="http://www.iab.com/VAST">\n${ads}\n</VAST>`;
}

// variant=pause: a Peep test pause ad (VAST 4.2 NonLinear picture), the same shape
// Steep's peep-pause replies with, for checking the players' pause-ad overlay.
const PAUSE_AD = `<VAST version="4.2" xmlns="http://www.iab.com/VAST">
  <Ad id="peep-test-pause" sequence="1">
    <InLine>
      <AdSystem version="1">Peep test ad server</AdSystem>
      <AdTitle>Peep test pause ad - Farris Cola</AdTitle>
      <Impression><![CDATA[https://example.com/peep-test-pause-impression]]></Impression>
      <Creatives>
        <Creative id="peep-test-pause">
          <NonLinearAds>
            <NonLinear id="peep-test-pause" width="800" height="450" minSuggestedDuration="00:00:30">
              <StaticResource creativeType="image/png"><![CDATA[https://cuwdyedmmnpklufduaho.supabase.co/storage/v1/object/public/ad-creatives/test/peep-pause-test.png]]></StaticResource>
              <NonLinearClickThrough><![CDATA[https://watchpeep.tv]]></NonLinearClickThrough>
              <NonLinearClickTracking><![CDATA[https://example.com/peep-test-pause-click]]></NonLinearClickTracking>
            </NonLinear>
          </NonLinearAds>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
</VAST>`;
