import { corsHeaders, handleCors, errorResponse } from "../_shared/cors.ts";

// Server-side proxy for M3U/M3U8 playlists — bypasses browser CORS so the admin
// importer can pull from any source (iptv-org, i.mjh.nz, etc.), not just ones
// that send Access-Control-Allow-Origin. Mirrors fetch-xmltv.

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const url = new URL(req.url).searchParams.get("url");
    if (!url) return errorResponse("url is required");
    if (!/^https?:\/\//i.test(url)) return errorResponse("url must be http(s)");

    const res = await fetch(url, {
      headers: {
        // Some CDNs 403 unknown agents; present as a normal client.
        "User-Agent": "Mozilla/5.0 (compatible; Peep-M3U-Importer/1.0)",
        "Accept": "*/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return errorResponse(`Playlist returned ${res.status}`, 502);

    let bytes = new Uint8Array(await res.arrayBuffer());
    // Handle gzipped playlists (some mirrors serve .m3u.gz).
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    const text = new TextDecoder().decode(bytes);

    if (!text.includes("#EXTM3U") && !text.includes("#EXTINF")) {
      return errorResponse("That URL didn't return an M3U playlist", 422);
    }

    return new Response(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not fetch playlist";
    return errorResponse(msg.includes("timed out") ? "The source took too long to respond" : msg, 502);
  }
});
