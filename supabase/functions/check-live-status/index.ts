import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const streamUid = url.searchParams.get("stream_uid");
    const streamId  = url.searchParams.get("stream_id");
    if (!streamUid || !streamId) throw new Error("stream_uid and stream_id are required");

    const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
    const cfToken     = Deno.env.get("CLOUDFLARE_API_TOKEN")!;

    const res  = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/live_inputs/${streamUid}`,
      { headers: { "Authorization": `Bearer ${cfToken}` } }
    );
    const data = await res.json();
    if (!data.success) throw new Error(`Cloudflare error: ${JSON.stringify(data.errors)}`);

    const current = data.result?.status?.current ?? {};
    const state   = current.state ?? "disconnected";
    const isLive  = state === "connected";

    // Parse frame rate fraction e.g. "30/1" → 30
    let fps: number | null = null;
    if (current.frameRate) {
      const parts = String(current.frameRate).split("/");
      fps = parts.length === 2
        ? Math.round(Number(parts[0]) / Number(parts[1]))
        : Math.round(Number(parts[0]));
    }

    const streamHealth = {
      state,
      bitrate:    current.bitrate    ?? null,
      fps,
      width:      current.width      ?? null,
      height:     current.height     ?? null,
      videoCodec: current.videoCodec ?? null,
      audioCodec: current.audioCodec ?? null,
    };

    await supabase.from("live_streams").update({ is_live: isLive }).eq("id", streamId);

    return new Response(JSON.stringify({ is_live: isLive, health: streamHealth }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
