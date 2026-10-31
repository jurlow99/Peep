// Read-only proxy — auth is enforced by the JWT, not CORS, so allow any origin
// (needed for local dev / preview builds, not just watchpeep.tv).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&amp;/g, "&"); // must be last so "&amp;lt;" style double-encoding survives
}

function tag(xml: string, name: string): string {
  // String.raw is required: in a normal template literal `\s`/`\S` collapse to
  // literal "s"/"S", silently breaking the [\s\S] "any char" class.
  const patterns = [
    new RegExp(String.raw`<${name}[^>]*><!\[CDATA\[([\s\S]*?)\]\]></${name}>`, "i"),
    new RegExp(String.raw`<${name}[^>]*>([\s\S]*?)</${name}>`, "i"),
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (m) return decodeEntities(m[1].trim());
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
    const authorization = req.headers.get("Authorization") || "";
    const baseURL = Deno.env.get("SUPABASE_URL")!;
    const apiKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const headers = { Authorization: authorization, apikey: apiKey };
    const auth = await fetch(`${baseURL}/auth/v1/user`, { headers });
    const user = auth.ok ? await auth.json() : null;
    if (!user?.id) return new Response(JSON.stringify({ error: "Sign in to import a feed." }), { status: 401, headers: { "Content-Type": "application/json", ...CORS } });
    const profile = await fetch(`${baseURL}/rest/v1/profiles?select=role&id=eq.${encodeURIComponent(user.id)}`, { headers });
    const rows = profile.ok ? await profile.json() : [];
    if (rows[0]?.role !== "admin") return new Response(JSON.stringify({ error: "Admin access required." }), { status: 403, headers: { "Content-Type": "application/json", ...CORS } });
    const feedUrl = new URL(req.url).searchParams.get("url");
    if (!feedUrl) throw new Error("url is required");

    const parsedURL = new URL(feedUrl);
    if (parsedURL.protocol !== "https:" || parsedURL.username || parsedURL.password || parsedURL.port || !/^[a-z0-9.-]+$/i.test(parsedURL.hostname) || !parsedURL.hostname.includes(".") || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(parsedURL.hostname)) {
      throw new Error("Use a public HTTPS podcast feed URL.");
    }
    const res = await fetch(parsedURL, {
      redirect: "error",
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
