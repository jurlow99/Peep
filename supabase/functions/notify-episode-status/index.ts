import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = "andreclinton6996@gmail.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    const { type, episode_id, rejection_note } = await req.json();
    if (!type || !episode_id) throw new Error("type and episode_id are required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    // Load episode + show info
    const { data: episode } = await supabase
      .from("episodes")
      .select("id, title, episode_number, season, show_id, shows(title)")
      .eq("id", episode_id)
      .maybeSingle();
    if (!episode) throw new Error("Episode not found");

    const showTitle = (episode as any).shows?.title || "Unknown Show";
    const epLabel = `S${episode.season}E${episode.episode_number} — ${episode.title}`;

    // Find creator via content_creators
    const { data: link } = await supabase
      .from("content_creators")
      .select("creator_id, creators(name, email)")
      .eq("content_type", "show")
      .eq("content_id", String(episode.show_id))
      .maybeSingle();

    const creatorName = (link as any)?.creators?.name || "Creator";
    const creatorEmail = (link as any)?.creators?.email;

    let emailTo: string;
    let subject: string;
    let html: string;

    if (type === "new_upload") {
      emailTo = ADMIN_EMAIL;
      subject = `New episode pending review: ${showTitle}`;
      html = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;background:#0a0a0a;color:#fff;">
          <h1 style="font-size:32px;color:#facc15;margin:0 0 24px;">peep.</h1>
          <h2 style="font-size:18px;font-weight:600;margin:0 0 12px;">New Episode Pending Review</h2>
          <div style="background:#111;border:1px solid #1e1e1e;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
            <p style="margin:0 0 8px;font-size:13px;color:#888;">Show</p>
            <p style="margin:0 0 16px;font-size:16px;font-weight:600;">${showTitle}</p>
            <p style="margin:0 0 8px;font-size:13px;color:#888;">Episode</p>
            <p style="margin:0 0 16px;font-size:16px;font-weight:600;">${epLabel}</p>
            <p style="margin:0 0 8px;font-size:13px;color:#888;">Uploaded by</p>
            <p style="margin:0;font-size:15px;font-weight:500;">${creatorName}${creatorEmail ? ` &lt;${creatorEmail}&gt;` : ""}</p>
          </div>
          <a href="https://watchpeep.tv/cms" style="display:inline-block;background:#facc15;color:#0a0a0a;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;text-decoration:none;">
            Review in CMS →
          </a>
        </div>
      `;
    } else if (type === "approved") {
      if (!creatorEmail) throw new Error("Creator email not found");
      emailTo = creatorEmail;
      subject = `Your episode is live on Peep — ${showTitle}`;
      html = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;background:#0a0a0a;color:#fff;">
          <h1 style="font-size:32px;color:#facc15;margin:0 0 24px;">peep.</h1>
          <h2 style="font-size:18px;font-weight:600;margin:0 0 12px;">Your episode is live 🎉</h2>
          <p style="color:#888;font-size:14px;margin:0 0 20px;line-height:1.6;">
            We've reviewed and approved your upload. It's now live on Peep and will count toward your watch time and monthly payout.
          </p>
          <div style="background:#111;border:1px solid #1e1e1e;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
            <p style="margin:0 0 4px;font-size:13px;color:#888;">${showTitle}</p>
            <p style="margin:0;font-size:16px;font-weight:600;">${epLabel}</p>
          </div>
          <a href="https://watchpeep.tv/" style="display:inline-block;background:#facc15;color:#0a0a0a;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;text-decoration:none;">
            View Your Dashboard →
          </a>
        </div>
      `;
    } else if (type === "rejected") {
      if (!creatorEmail) throw new Error("Creator email not found");
      emailTo = creatorEmail;
      subject = `Regarding your episode upload — ${showTitle}`;
      html = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;background:#0a0a0a;color:#fff;">
          <h1 style="font-size:32px;color:#facc15;margin:0 0 24px;">peep.</h1>
          <h2 style="font-size:18px;font-weight:600;margin:0 0 12px;">We couldn't approve this upload</h2>
          <div style="background:#111;border:1px solid #1e1e1e;border-radius:12px;padding:20px 24px;margin:0 0 20px;">
            <p style="margin:0 0 4px;font-size:13px;color:#888;">${showTitle}</p>
            <p style="margin:0;font-size:16px;font-weight:600;">${epLabel}</p>
          </div>
          ${rejection_note ? `
          <div style="background:#1a0a0a;border:1px solid #3a1a1a;border-radius:12px;padding:20px 24px;margin:0 0 24px;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Note from Peep</p>
            <p style="margin:0;font-size:14px;color:#e5e5e5;line-height:1.6;">${rejection_note}</p>
          </div>
          ` : ""}
          <p style="color:#888;font-size:14px;margin:0 0 24px;line-height:1.6;">
            If you have questions or want to resubmit, reply to this email or reach out at <a href="mailto:creators@watchpeep.tv" style="color:#facc15;">creators@watchpeep.tv</a>
          </p>
        </div>
      `;
    } else {
      throw new Error(`Unknown notification type: ${type}`);
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: "Peep <noreply@watchpeep.tv>", to: emailTo, subject, html }),
    });

    const result = await res.json();
    if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
