import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/supabase.ts";
import { corsHeaders } from "../_shared/cors.ts";

const CF_CUSTOMER = "https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const user = await requireUser(req, supabase);

    // Don't let them create a second channel
    const { data: existing } = await supabase
      .from("live_streams")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "already_exists" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { channel_name } = await req.json();
    const name = channel_name?.trim();
    if (!name) throw new Error("Channel name is required");
    if (name.length > 60) throw new Error("Channel name must be 60 characters or less");

    // Create Cloudflare live input
    const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN")!;

    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/live_inputs`,
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${cfToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          meta: { name: `${name} — Peep Live` },
          recording: { mode: "automatic", timeoutSeconds: 10 },
        }),
      }
    );
    const cfData = await cfRes.json();
    if (!cfData.success) throw new Error(`Could not create stream: ${cfData.errors?.[0]?.message ?? "unknown error"}`);

    const { uid: streamUid, rtmps } = cfData.result;
    const streamKey = rtmps.streamKey;
    const rtmpUrl = rtmps.url;
    const hlsUrl = `${CF_CUSTOMER}/${streamUid}/manifest/video.m3u8`;

    // Slug for the channel URL: /stream/<slug>
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "creator";

    // Make sure slug is unique — append user id suffix if taken
    const { data: slugConflict } = await supabase
      .from("live_streams")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    const finalSlug = slugConflict ? `${slug}-${user.id.slice(0, 6)}` : slug;

    // Upsert profile row
    await supabase.from("profiles").upsert({
      id: user.id,
      username: finalSlug,
      email: user.email?.toLowerCase() ?? "",
    }, { onConflict: "id" });

    // Create the channel row
    const { data: newStream, error: insertErr } = await supabase
      .from("live_streams")
      .insert({
        title: name,
        channel_name: name,
        description: "",
        stream_url: hlsUrl,
        stream_key: streamKey,
        stream_uid: streamUid,
        slug: finalSlug,
        is_live: false,
        auto_save_vod: true,
        badge_text: "LIVE",
        user_id: user.id,
      })
      .select("id, slug")
      .single();

    if (insertErr) throw new Error(`Failed to create channel: ${insertErr.message}`);

    return new Response(JSON.stringify({
      success: true,
      stream_id: newStream.id,
      slug: newStream.slug,
      rtmp_url: rtmpUrl,
      stream_key: streamKey,
    }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
