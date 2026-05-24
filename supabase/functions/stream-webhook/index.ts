import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, webhook-signature" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const event = body?.event ?? body?.action;
    const uid = body?.uid ?? body?.stream_uid;

    if (!uid) throw new Error("No stream UID in payload");

    if (event === "live_input.connected" || event === "stream.live_input.connected") {
      await supabase
        .from("live_streams")
        .update({ is_live: true, live_started_at: new Date().toISOString() })
        .eq("stream_uid", uid);
    } else if (
      event === "live_input.disconnected" ||
      event === "stream.live_input.disconnected" ||
      event === "stream.ready"
    ) {
      const vodUrl = body?.playback?.hls ?? null;
      const update: Record<string, unknown> = { is_live: false };
      if (vodUrl) update.stream_url = vodUrl;
      await supabase
        .from("live_streams")
        .update(update)
        .eq("stream_uid", uid);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
