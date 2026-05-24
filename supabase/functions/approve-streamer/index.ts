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

    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(token);
    if (!caller || authErr) throw new Error("Unauthorized");

    const { application_id } = await req.json();
    if (!application_id) throw new Error("application_id is required");

    // Load application
    const { data: app, error: appErr } = await supabase
      .from("streamer_applications")
      .select("*")
      .eq("id", application_id)
      .single();
    if (appErr || !app) throw new Error("Application not found");

    // Create Supabase auth account for the streamer (or get existing)
    let streamerId: string;
    const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
      email: app.email,
      email_confirm: true,
      user_metadata: { full_name: app.name },
    });

    if (createErr) {
      // User likely already exists — find them
      const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const existing = listData?.users?.find(u => u.email?.toLowerCase() === app.email.toLowerCase());
      if (!existing) throw new Error(`Could not create or find user: ${createErr.message}`);
      streamerId = existing.id;
    } else {
      streamerId = createData.user.id;
    }

    // Ensure profiles row exists
    const username = app.name.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    await supabase.from("profiles").upsert({
      id: streamerId,
      username: username || "streamer",
      email: app.email.toLowerCase(),
      full_name: app.name,
    }, { onConflict: "id" });

    // Create Cloudflare live input
    const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN")!;

    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/live_inputs`,
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${cfToken}`, "Content-Type": "application/json" },
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
    const hlsUrl = `https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com/${streamUid}/manifest/video.m3u8`;

    // Create live_streams row linked to streamer's account
    const { data: newStream, error: insertErr } = await supabase
      .from("live_streams")
      .insert({
        title: app.name,
        channel_name: app.name,
        description: "",
        stream_url: hlsUrl,
        stream_key: streamKey,
        stream_uid: streamUid,
        is_live: false,
        auto_save_vod: true,
        badge_text: "LIVE",
        user_id: streamerId,
      })
      .select("id")
      .single();
    if (insertErr) throw new Error(`Failed to create stream: ${insertErr.message}`);

    // Generate a recovery link → streamer clicks, sets a password, lands on /streamer
    const siteUrl = "https://watchpeep.tv";
    let setPasswordLink = `${siteUrl}/set-password`;
    try {
      const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email: app.email,
        options: { redirectTo: `${siteUrl}/set-password` },
      });
      if (!linkErr && linkData?.properties?.action_link) {
        setPasswordLink = linkData.properties.action_link;
      }
    } catch (_) { /* fall back to plain /set-password link */ }

    // Update application status
    await supabase
      .from("streamer_applications")
      .update({ status: "approved" })
      .eq("id", application_id);

    // Send approval email with dashboard link + stream credentials
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
            <h1 style="font-size:32px;color:#facc15;margin:0 0 8px;">peep.</h1>
            <p style="font-size:12px;color:#555;margin:0 0 32px;text-transform:uppercase;letter-spacing:0.8px;">Streamer Approval</p>

            <h2 style="font-size:22px;font-weight:700;margin:0 0 12px;color:#fff;">Welcome to Peep Live, ${app.name}!</h2>
            <p style="color:#888;font-size:14px;margin:0 0 32px;line-height:1.7;">
              Your application has been approved. You now have a streamer account and your own live stream on Peep.
              Keep your stream key private — anyone with it can stream to your channel.
            </p>

            <a href="${setPasswordLink}" style="display:block;background:#facc15;color:#0a0a0a;text-align:center;padding:16px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;margin-bottom:32px;">
              Set Your Password →
            </a>

            <p style="font-size:12px;color:#444;margin:0 0 32px;text-align:center;">Click to set your password — then you can sign in at any time from <a href="${siteUrl}/signin" style="color:#facc15;">watchpeep.tv/signin</a>. Link expires in 24 hours.</p>

            <div style="background:#111;border:1px solid #1e1e1e;border-radius:12px;padding:24px;margin-bottom:20px;">
              <p style="margin:0 0 16px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;">OBS Stream Settings</p>
              <div style="margin-bottom:16px;">
                <p style="margin:0 0 4px;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">RTMP Server</p>
                <p style="margin:0;font-size:13px;color:#facc15;font-family:monospace;word-break:break-all;">${rtmpUrl}</p>
              </div>
              <div>
                <p style="margin:0 0 4px;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Stream Key (keep private)</p>
                <p style="margin:0;font-size:13px;color:#facc15;font-family:monospace;word-break:break-all;">${streamKey}</p>
              </div>
            </div>

            <div style="background:#111;border:1px solid #1e1e1e;border-radius:12px;padding:24px;margin-bottom:32px;">
              <p style="margin:0 0 16px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;">Quick OBS Setup</p>
              <ol style="margin:0;padding-left:18px;color:#888;font-size:14px;line-height:2.2;">
                <li>Open OBS → Settings → Stream</li>
                <li>Service: <strong style="color:#fff;">Custom</strong></li>
                <li>Server: paste the RTMP Server above</li>
                <li>Stream Key: paste your Stream Key above</li>
                <li>Recommended: 1080p, 6000 kbps, H.264</li>
                <li>Click <strong style="color:#fff;">Start Streaming</strong> — you'll go live on Peep automatically</li>
              </ol>
            </div>

            <p style="color:#333;font-size:12px;margin:0;text-align:center;line-height:1.8;">
              Questions? Reply to this email and we'll get you sorted.<br/>
              <a href="https://watchpeep.tv" style="color:#facc15;">watchpeep.tv</a>
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
