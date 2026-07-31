import { corsHeaders, handleCors, errorResponse } from "../_shared/cors.ts";

// Server-side proxy for XMLTV EPG feeds — bypasses browser CORS and transparently
// gunzips .xml.gz dumps (common for EPG sources like EPGShare / i.mjh.nz).

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const url = new URL(req.url).searchParams.get("url");
    if (!url) return errorResponse("url is required");
    if (!/^https?:\/\//i.test(url)) return errorResponse("url must be http(s)");

    const res = await fetch(url, {
      headers: { "User-Agent": "Peep-EPG-Importer/1.0" },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return errorResponse(`Feed returned ${res.status}`, 502);

    let bytes = new Uint8Array(await res.arrayBuffer());
    // gzip magic bytes → decompress (fetch only auto-decodes transport encoding, not a .gz body)
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    const text = new TextDecoder().decode(bytes);

    return new Response(text, {
      headers: { "Content-Type": "application/xml; charset=utf-8", ...corsHeaders },
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Could not fetch feed", 502);
  }
});
