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

    if (event === "live_input.connected" || event === "stream.live_input.connected") {
      const uid = body?.uid ?? body?.stream_uid;
      if (!uid) throw new Error("No UID in payload");

      const { data: stream } = await supabase
        .from("live_streams")
        .update({ is_live: true, live_started_at: new Date().toISOString() })
        .eq("stream_uid", uid)
        .select("id")
        .maybeSingle();

      if (stream?.id) {
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-go-live`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${Deno.env.get("SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ stream_id: stream.id }),
        }).catch(() => {});
      }

    } else if (event === "live_input.disconnected" || event === "stream.live_input.disconnected") {
      const uid = body?.uid ?? body?.stream_uid;
      if (!uid) throw new Error("No UID in payload");

      await supabase
        .from("live_streams")
        .update({ is_live: false })
        .eq("stream_uid", uid);

    } else if (event === "stream.ready") {
      // uid = video UID of the finished VOD; liveInput = the live input UID
      const videoUid = body?.uid;
      const liveInputUid = body?.liveInput ?? body?.live_input;

      // Flip is_live using the live input UID (not the video UID)
      if (liveInputUid) {
        await supabase
          .from("live_streams")
          .update({ is_live: false })
          .eq("stream_uid", liveInputUid);
      }

      // Tag the VOD with the stream title from our DB so past streams show the right name
      if (videoUid && liveInputUid) {
        const { data: stream } = await supabase
          .from("live_streams")
          .select("stream_title, channel_name, title")
          .eq("stream_uid", liveInputUid)
          .maybeSingle();

        const title = stream?.stream_title || stream?.channel_name || stream?.title;
        if (title) {
          const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
          const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN")!;
          await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/${videoUid}`,
            {
              method: "POST",
              headers: { "Authorization": `Bearer ${cfToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ meta: { name: title } }),
            }
          );
        }
      }
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
