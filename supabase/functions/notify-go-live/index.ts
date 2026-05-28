import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    const { stream_id } = await req.json();
    if (!stream_id) throw new Error("stream_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    // Get stream info
    const { data: stream } = await supabase
      .from("live_streams")
      .select("id, channel_name, title, stream_title, category")
      .eq("id", stream_id)
      .single();
    if (!stream) throw new Error("Stream not found");

    // Get all followers with emails
    const { data: follows } = await supabase
      .from("streamer_follows")
      .select("follower_id")
      .eq("stream_id", stream_id);
    if (!follows || follows.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const followerIds = follows.map(f => f.follower_id);
    const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const emails = (users?.users || [])
      .filter(u => followerIds.includes(u.id) && u.email)
      .map(u => u.email!);

    if (emails.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const channelName = stream.channel_name || stream.title;
    const streamTitle = stream.stream_title ? ` — ${stream.stream_title}` : "";
    const slug = channelName.toLowerCase().replace(/[^a-z0-9]/g, "");

    // Write in-app notifications for each follower
    if (followerIds.length > 0) {
      await supabase.from("viewer_notifications").insert(
        followerIds.map(uid => ({
          user_id: uid,
          stream_id: stream.id,
          type: "go_live",
          channel_name: channelName,
          stream_title: stream.stream_title || null,
          stream_slug: slug,
        }))
      );
    }

    // Send batch emails via Resend
    await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        emails.map(email => ({
          from: "Peep <noreply@watchpeep.tv>",
          to: email,
          subject: `${channelName} is live on Peep!`,
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;background:#0a0a0a;color:#fff;">
              <h1 style="font-size:28px;color:#facc15;margin:0 0 6px;">peep.</h1>
              <p style="font-size:12px;color:#555;margin:0 0 32px;text-transform:uppercase;letter-spacing:0.8px;">Live Now</p>

              <div style="background:#111;border:1px solid #1e1e1e;border-radius:12px;padding:24px;margin-bottom:28px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                  <div style="width:8px;height:8px;border-radius:50%;background:#ef4444;"></div>
                  <span style="font-size:11px;font-weight:800;color:#ef4444;letter-spacing:1px;text-transform:uppercase;">Live</span>
                </div>
                <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#fff;">${channelName}</h2>
                ${stream.stream_title ? `<p style="margin:0;font-size:14px;color:#888;">${stream.stream_title}</p>` : ""}
              </div>

              <a href="https://watchpeep.tv/stream/${slug}" style="display:block;background:#ef4444;color:#fff;text-align:center;padding:16px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;margin-bottom:24px;">
                Watch Now →
              </a>

              <p style="color:#333;font-size:12px;margin:0;text-align:center;">
                You're following ${channelName} on Peep.<br/>
                <a href="https://watchpeep.tv" style="color:#555;">watchpeep.tv</a>
              </p>
            </div>
          `,
        }))
      ),
    });

    return new Response(JSON.stringify({ success: true, sent: emails.length }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
