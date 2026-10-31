import { corsHeaders, handleCors, errorResponse } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/supabase.ts";
import { fetchPublicFeed, boundedBytes, decodedFeedStream } from "../_shared/xmltvFetch.ts";

// Server-side proxy for M3U/M3U8 playlists — bypasses browser CORS so the admin
// importer can pull from any source (iptv-org, i.mjh.nz, etc.), not just ones
// that send Access-Control-Allow-Origin. Mirrors fetch-xmltv: admin-only, and
// the shared fetcher refuses private/internal hosts (including via redirects).

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    await requireAdmin(req);
  } catch {
    return errorResponse("Admin access required", 403);
  }

  try {
    const url = new URL(req.url).searchParams.get("url");
    if (!url) return errorResponse("url is required");

    // Handles gzipped playlists (some mirrors serve .m3u.gz) and caps size.
    const response = await fetchPublicFeed(url, AbortSignal.timeout(25000));
    const bytes = await boundedBytes(await decodedFeedStream(response));
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
