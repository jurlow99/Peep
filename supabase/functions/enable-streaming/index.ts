import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CF_BASE = "https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (!user || authErr) throw new Error("Unauthorized");

    // Return existing stream if user already has one
    const { data: existing } = await supabase
      .from("live_streams")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ stream: existing }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Get profile info for default name/slug
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, full_name")
      .eq("id", user.id)
      .maybeSingle();

    const displayName = profile?.full_name || profile?.username || user.email?.split("@")[0] || "Streamer";
    const rawSlug = profile?.username || user.email?.split("@")[0] || `user${user.id.slice(0, 6)}`;
    const slug = rawSlug.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

    // Create Cloudflare live input
    const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN")!;
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/live_inputs`,
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${cfToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          meta: { name: `${displayName} — Peep Live` },
          recording: { mode: "automatic", timeoutSeconds: 10 },
          lowLatencyHls: true,
        }),
      }
    );
    const cfData = await cfRes.json();
    if (!cfData.success) throw new Error(`Cloudflare error: ${JSON.stringify(cfData.errors)}`);

    const streamUid = cfData.result.uid;
    const streamKey = cfData.result.rtmps.streamKey;
    const hlsUrl = `${CF_BASE}/${streamUid}/manifest/video.m3u8`;

    const { data: newStream, error: insertErr } = await supabase
      .from("live_streams")
      .insert({
        title: displayName,
        channel_name: displayName,
        description: "",
        stream_url: hlsUrl,
        stream_key: streamKey,
        stream_uid: streamUid,
        is_live: false,
        auto_save_vod: true,
        badge_text: "LIVE",
        user_id: user.id,
        username: slug,
      })
      .select("*")
      .single();

    if (insertErr) throw new Error(`Failed to create stream: ${insertErr.message}`);

    return new Response(JSON.stringify({ stream: newStream }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
