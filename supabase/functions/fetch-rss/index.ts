const CORS_ORIGIN = Deno.env.get("SITE_URL") || "https://watchpeep.tv";
const CORS = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function tag(xml: string, name: string): string {
  // String.raw is required: in a normal template literal `\s`/`\S` collapse to
  // literal "s"/"S", silently breaking the [\s\S] "any char" class.
  const patterns = [
    new RegExp(String.raw`<${name}[^>]*><!\[CDATA\[([\s\S]*?)\]\]></${name}>`, "i"),
    new RegExp(String.raw`<${name}[^>]*>([\s\S]*?)</${name}>`, "i"),
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (m) return m[1].trim();
  }
  return "";
}

function attr(xml: string, tagName: string, attrName: string): string {
  const re = new RegExp(`<${tagName}[^>]+${attrName}=["']([^"']+)["']`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function fmtDuration(raw: string): string {
  if (!raw) return "";
  const parts = raw.split(":").map(Number);
  if (parts.length === 3) {
    const [h, m] = parts;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  if (parts.length === 2) {
    const [m] = parts;
    return `${m}m`;
  }
  const secs = parseInt(raw);
  if (!isNaN(secs)) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  return raw;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const feedUrl = new URL(req.url).searchParams.get("url");
    if (!feedUrl) throw new Error("url is required");

    const res = await fetch(feedUrl, {
      headers: { "User-Agent": "Peep-RSS-Importer/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Feed returned ${res.status}`);
    const xml = await res.text();

    // Extract channel block (everything before first <item>)
    const channelBlock = xml.split(/<item[\s>]/i)[0];

    // Podcast metadata
    const title       = tag(channelBlock, "title");
    const description = tag(channelBlock, "description") || tag(channelBlock, "itunes:summary");
    const host        = tag(channelBlock, "itunes:author") || tag(channelBlock, "managingEditor");
    const link_url    = tag(channelBlock, "link");

    // Artwork: itunes:image href attr first, then image/url
    let artwork_url = attr(channelBlock, "itunes:image", "href");
    if (!artwork_url) artwork_url = tag(channelBlock, "url");

    // Episodes
    const itemBlocks = [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)].map(m => m[1]);

    const episodes = itemBlocks.map((item, idx) => {
      const epTitle       = tag(item, "title");
      const epDesc        = tag(item, "itunes:summary") || tag(item, "description");
      const audio_url     = attr(item, "enclosure", "url");
      const rawDuration   = tag(item, "itunes:duration");
      const duration      = fmtDuration(rawDuration);
      const epNum         = parseInt(tag(item, "itunes:episode")) || null;
      const epThumb       = attr(item, "itunes:image", "href");
      const pubDate       = tag(item, "pubDate");

      return {
        index: idx,              // position in feed (0 = newest)
        episode_number: epNum,
        title: epTitle,
        description: epDesc.slice(0, 1000),
        audio_url,
        duration,
        thumbnail: epThumb || "",
        pub_date: pubDate,
      };
    });

    return new Response(JSON.stringify({
      podcast: { title, description: description.slice(0, 1000), host, artwork_url, link_url },
      episodes,
      total: episodes.length,
    }), { headers: { "Content-Type": "application/json", ...CORS } });

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
});
