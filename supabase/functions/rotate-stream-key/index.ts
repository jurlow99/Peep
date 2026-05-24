import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) throw new Error("Unauthorized");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (!user || authErr) throw new Error("Unauthorized");

    // Load the stream owned by this user
    const { data: stream, error: streamErr } = await supabase
      .from("live_streams")
      .select("id, stream_uid, channel_name, title")
      .eq("user_id", user.id)
      .single();
    if (streamErr || !stream) throw new Error("Stream not found");

    const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN")!;

    // Delete old live input
    if (stream.stream_uid) {
      await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/live_inputs/${stream.stream_uid}`,
        { method: "DELETE", headers: { "Authorization": `Bearer ${cfToken}` } }
      );
    }

    // Create new live input
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/live_inputs`,
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${cfToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          meta: { name: `${stream.channel_name || stream.title} — Peep Live` },
          recording: { mode: "automatic", timeoutSeconds: 10 },
        }),
      }
    );
    const cfData = await cfRes.json();
    if (!cfData.success) throw new Error(`Cloudflare error: ${JSON.stringify(cfData.errors)}`);

    const newUid = cfData.result.uid;
    const newKey = cfData.result.rtmps.streamKey;
    const hlsUrl = `https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com/${newUid}/manifest/video.m3u8`;

    await supabase
      .from("live_streams")
      .update({ stream_uid: newUid, stream_key: newKey, stream_url: hlsUrl })
      .eq("id", stream.id);

    return new Response(JSON.stringify({ success: true, stream_key: newKey, stream_uid: newUid }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
