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

    const { application_id } = await req.json();
    if (!application_id) throw new Error("application_id is required");

    // Load application
    const { data: app, error: appErr } = await supabase
      .from("streamer_applications")
      .select("*")
      .eq("id", application_id)
      .single();
    if (appErr || !app) throw new Error("Application not found");

    const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN")!;

    // Create Cloudflare live input
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/live_inputs`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cfToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          meta: { name: `${app.name} — Peep Live` },
          recording: { mode: "automatic", timeoutSeconds: 10 },
        }),
      }
    );
    const cfData = await cfRes.json();
    if (!cfData.success) throw new Error(`Cloudflare error: ${JSON.stringify(cfData.errors)}`);

    const streamUid = cfData.result.uid;
    const streamKey = cfData.result.rtmps.streamKey;
    const rtmpUrl = cfData.result.rtmps.url;
    const hlsUrl = cfData.result.playback?.hls ?? `https://customer-${cfAccountId}.cloudflarestream.com/${streamUid}/manifest/video.m3u8`;

    // Create live_streams row
    const { data: newStream, error: insertErr } = await supabase
      .from("live_streams")
      .insert({
        title: `${app.name} — Live`,
        description: "",
        stream_url: hlsUrl,
        stream_key: streamKey,
        stream_uid: streamUid,
        is_live: false,
        auto_save_vod: true,
        badge_text: "LIVE",
      })
      .select("id")
      .single();
    if (insertErr) throw new Error(`Failed to create stream: ${insertErr.message}`);

    // Update application to approved
    await supabase
      .from("streamer_applications")
      .update({ status: "approved" })
      .eq("id", application_id);

    // Send approval email
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Peep <noreply@watchpeep.tv>",
        to: app.email,
        subject: "You're approved to stream on Peep! 🎬",
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;background:#0a0a0a;color:#fff;">
            <h1 style="font-size:32px;color:#facc15;margin:0 0 24px;">peep.</h1>
            <h2 style="font-size:20px;font-weight:600;margin:0 0 12px;">You're approved to stream, ${app.name}!</h2>
            <p style="color:#888;font-size:14px;margin:0 0 28px;line-height:1.6;">
              Welcome to Peep Live. Here are your stream details — keep these private.
            </p>

            <div style="background:#111;border:1px solid #1e1e1e;border-radius:12px;padding:24px;margin-bottom:28px;">
              <p style="margin:0 0 16px;font-size:13px;color:#555;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Your Stream Settings</p>
              <div style="margin-bottom:12px;">
                <p style="margin:0 0 4px;font-size:12px;color:#666;">RTMP Server</p>
                <p style="margin:0;font-size:14px;color:#facc15;font-family:monospace;">${rtmpUrl}</p>
              </div>
              <div>
                <p style="margin:0 0 4px;font-size:12px;color:#666;">Stream Key (keep this private)</p>
                <p style="margin:0;font-size:14px;color:#facc15;font-family:monospace;">${streamKey}</p>
              </div>
            </div>

            <div style="background:#111;border:1px solid #1e1e1e;border-radius:12px;padding:24px;margin-bottom:28px;">
              <p style="margin:0 0 16px;font-size:13px;color:#555;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">OBS Setup</p>
              <ol style="margin:0;padding-left:20px;color:#888;font-size:14px;line-height:2;">
                <li>Open OBS → Settings → Stream</li>
                <li>Service: <strong style="color:#fff;">Custom</strong></li>
                <li>Server: <strong style="color:#facc15;font-family:monospace;">${rtmpUrl}</strong></li>
                <li>Stream Key: <strong style="color:#facc15;font-family:monospace;">${streamKey}</strong></li>
                <li>Recommended: 1080p, 6000 kbps, H.264</li>
                <li>Click <strong style="color:#fff;">Start Streaming</strong> — you'll go live on Peep automatically</li>
              </ol>
            </div>

            <p style="color:#444;font-size:12px;margin:0;">
              Questions? Reply to this email and we'll help you get set up.
            </p>
          </div>
        `,
      }),
    });

    return new Response(JSON.stringify({ success: true, stream_id: newStream.id, stream_uid: streamUid }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
