import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    const url = new URL(req.url);
    const streamUid = url.searchParams.get("stream_uid");
    if (!streamUid) throw new Error("stream_uid is required");

    const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN")!;

    // List recordings for this live input
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/live_inputs/${streamUid}/videos`,
      { headers: { "Authorization": `Bearer ${cfToken}` } }
    );
    const data = await res.json();

    if (!data.success) {
      return new Response(JSON.stringify({ vods: [] }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Only return ready videos, newest first
    const vods = (data.result || [])
      .filter((v: any) => v.status?.state === "ready" || v.readyToStream)
      .sort((a: any, b: any) => new Date(b.created).getTime() - new Date(a.created).getTime())
      .map((v: any) => ({
        uid: v.uid,
        created: v.created,
        duration: v.duration,
        thumbnail: `https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com/${v.uid}/thumbnails/thumbnail.jpg`,
        meta: v.meta,
        playback: {
          hls: `https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com/${v.uid}/manifest/video.m3u8`,
          dash: `https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com/${v.uid}/manifest/video.mpd`,
        },
      }));

    return new Response(JSON.stringify({ vods }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ vods: [], error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
