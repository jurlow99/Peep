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

    const { application_id, note } = await req.json();
    if (!application_id) throw new Error("application_id is required");

    const { data: app, error: appErr } = await supabase
      .from("streamer_applications")
      .select("*")
      .eq("id", application_id)
      .single();
    if (appErr || !app) throw new Error("Application not found");

    await supabase
      .from("streamer_applications")
      .update({ status: "rejected", notes: note || null })
      .eq("id", application_id);

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Peep <noreply@watchpeep.tv>",
        to: app.email,
        subject: "Your Peep streaming application",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#0a0a0a;color:#fff;">
            <h1 style="font-size:32px;color:#facc15;margin:0 0 24px;">peep.</h1>
            <h2 style="font-size:20px;font-weight:600;margin:0 0 12px;">Thanks for applying, ${app.name}</h2>
            <p style="color:#888;font-size:14px;margin:0 0 20px;line-height:1.6;">
              After reviewing your application, we're not able to move forward at this time.
            </p>
            ${note ? `
            <div style="background:#111;border:1px solid #1e1e1e;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
              <p style="margin:0 0 6px;font-size:12px;color:#555;text-transform:uppercase;letter-spacing:0.8px;">Note from the team</p>
              <p style="margin:0;font-size:14px;color:#aaa;line-height:1.6;">${note}</p>
            </div>` : ""}
            <p style="color:#555;font-size:13px;margin:0;line-height:1.6;">
              We appreciate your interest in streaming on Peep. You're welcome to apply again in the future.
            </p>
          </div>
        `,
      }),
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
