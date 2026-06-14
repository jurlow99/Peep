import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CORS_ORIGIN = Deno.env.get("SITE_URL") || "https://watchpeep.tv";

const CF_BASE = "https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": CORS_ORIGIN, "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    const url = new URL(req.url);
    const streamUid = url.searchParams.get("stream_uid");
    if (!streamUid) throw new Error("stream_uid is required");

    // Accept comma-separated previous UIDs so VODs survive key rotations
    const previousUids = (url.searchParams.get("previous_uids") || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    const allUids = [streamUid, ...previousUids];

    const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN")!;

    // Fetch VODs from every live input in parallel
    const results = await Promise.all(
      allUids.map(uid =>
        fetch(
          `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/live_inputs/${uid}/videos`,
          { headers: { "Authorization": `Bearer ${cfToken}` } }
        ).then(r => r.json()).catch(() => ({ success: false, result: [] }))
      )
    );

    const seen = new Set<string>();
    const vods: any[] = [];

    for (const data of results) {
      if (!data.success) continue;
      for (const v of (data.result || [])) {
        if (seen.has(v.uid)) continue;
        if (v.status?.state !== "ready" && !v.readyToStream) continue;
        seen.add(v.uid);
        vods.push({
          uid: v.uid,
          created: v.created,
          duration: v.duration,
          thumbnail: `${CF_BASE}/${v.uid}/thumbnails/thumbnail.jpg`,
          meta: v.meta,
          playback: {
            hls:  `${CF_BASE}/${v.uid}/manifest/video.m3u8`,
            dash: `${CF_BASE}/${v.uid}/manifest/video.mpd`,
          },
        });
      }
    }

    vods.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

    return new Response(JSON.stringify({ vods }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": CORS_ORIGIN },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ vods: [], error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": CORS_ORIGIN },
    });
  }
});
