import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin } from "../_shared/supabase.ts";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await requireAdmin(req, supabase);

    const { name, email } = await req.json();
    if (!email?.trim() || !name?.trim()) throw new Error("Name and email are required");

    // Generate invite link (creates user in auth if they don't exist)
    const { data, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "invite",
      email: email.trim().toLowerCase(),
      options: { redirectTo: "https://watchpeep.tv/" },
    });
    if (linkErr) throw new Error(linkErr.message);

    const userId = data.user.id;
    const inviteLink = data.properties.action_link;

    // Set role=creator on their profile
    const { error: upsertErr } = await supabase.from("profiles").upsert(
      { id: userId, email: email.trim().toLowerCase(), role: "creator" },
      { onConflict: "id" }
    );
    if (upsertErr) throw new Error(`Failed to set creator role: ${upsertErr.message}`);

    // Send branded invite email via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Peep <noreply@watchpeep.tv>",
        to: email.trim(),
        subject: "You're invited to Peep as a Creator",
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;background:#0a0a0a;color:#fff;">
            <h1 style="font-size:32px;color:#facc15;margin:0 0 24px;">peep.</h1>
            <h2 style="font-size:20px;font-weight:600;margin:0 0 12px;">Welcome to Peep, ${name.trim()}</h2>
            <p style="color:#888;font-size:14px;margin:0 0 16px;line-height:1.6;">
              You've been added as a creator partner on Peep. You'll earn a share of monthly revenue based on how much your content gets watched.
            </p>
            <p style="color:#888;font-size:14px;margin:0 0 28px;line-height:1.6;">
              Click below to set your password and access your creator dashboard.
            </p>
            <a href="${inviteLink}" style="display:inline-block;background:#facc15;color:#0a0a0a;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;text-decoration:none;">
              Set Up Your Account →
            </a>
            <p style="color:#444;font-size:12px;margin:32px 0 0;line-height:1.6;">
              Once you're in, you can upload episodes, track your watch time, and view your payout history — all in your creator dashboard.<br/><br/>
              Questions? Reply to this email or reach out at <a href="mailto:creators@watchpeep.tv" style="color:#facc15;">creators@watchpeep.tv</a>
            </p>
          </div>
        `,
      }),
    });

    const result = await res.json();
    if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
