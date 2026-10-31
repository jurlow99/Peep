// Public static playback fixture only. No database, credentials, or user data.
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
Deno.serve((request: Request) => {
  const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" };
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers });
  const variant = new URL(request.url).searchParams.get("variant");
  if (variant !== null && variant !== "wrapper") return new Response("Unknown test variant", { status: 400, headers });
  return new Response(request.method === "HEAD" ? null : variant === "wrapper" ? wrapper : xml, { headers });
});
