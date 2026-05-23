import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    const { email } = await req.json();
    if (!email?.trim()) throw new Error("Email is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    // Generate reset link directly — no SMTP involved
    const { data, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: email.trim(),
      options: { redirectTo: "https://watchpeep.tv/" },
    });
    if (linkErr) throw new Error(linkErr.message);

    const resetLink = data.properties.action_link;

    // Send via Resend API directly
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Peep <noreply@watchpeep.tv>",
        to: email.trim(),
        subject: "Reset your Peep password",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#0a0a0a;color:#fff;">
            <h1 style="font-size:32px;color:#facc15;margin:0 0 24px;">peep.</h1>
            <h2 style="font-size:20px;font-weight:600;margin:0 0 12px;">Reset your password</h2>
            <p style="color:#888;font-size:14px;margin:0 0 28px;line-height:1.6;">
              Click the button below to reset your password. This link expires in 1 hour.
            </p>
            <a href="${resetLink}" style="display:inline-block;background:#facc15;color:#0a0a0a;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;text-decoration:none;">
              Reset Password
            </a>
            <p style="color:#444;font-size:12px;margin:28px 0 0;">
              If you didn't request this, ignore this email.
            </p>
          </div>
        `,
      }),
    });

    const result = await res.json();
    if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
