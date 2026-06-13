import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CORS_ORIGIN = Deno.env.get("SITE_URL") || "https://watchpeep.tv";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": CORS_ORIGIN, "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const streamUid = url.searchParams.get("stream_uid");
    const streamId = url.searchParams.get("stream_id");
    if (!streamUid || !streamId) throw new Error("stream_uid and stream_id are required");

    const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN")!;

    // Ask Cloudflare if this live input is currently connected
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/live_inputs/${streamUid}`,
      { headers: { "Authorization": `Bearer ${cfToken}` } }
    );
    const data = await res.json();

    if (!data.success) throw new Error("Cloudflare error");

    const isLive = data.result?.status?.current?.state === "connected";

    // Update DB to match
    await supabase
      .from("live_streams")
      .update({ is_live: isLive })
      .eq("id", streamId);

    return new Response(JSON.stringify({ is_live: isLive }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": CORS_ORIGIN },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": CORS_ORIGIN },
    });
  }
});
