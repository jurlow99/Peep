const CORS_ORIGIN = Deno.env.get("SITE_URL") || "https://watchpeep.tv";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": CORS_ORIGIN, "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    const { email, name } = await req.json();
    if (!email?.trim()) throw new Error("Email is required");

    const firstName = (name || "").trim().split(" ")[0] || "there";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Peep <noreply@watchpeep.tv>",
        to: email.trim(),
        subject: "Welcome to Peep 👋",
        html: `
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:48px 32px;background:#0a0a0a;color:#ffffff;">
            <h1 style="font-size:36px;color:#facc15;margin:0 0 32px;letter-spacing:-0.5px;">peep.</h1>

            <h2 style="font-size:22px;font-weight:700;margin:0 0 12px;color:#ffffff;">Welcome, ${firstName} 🎉</h2>

            <p style="font-size:15px;color:#888888;line-height:1.7;margin:0 0 20px;">
              Thanks for signing up. You're now part of the early community — we're currently in <strong style="color:#facc15;">beta</strong>, so things are still taking shape and your feedback genuinely matters.
            </p>

            <p style="font-size:15px;color:#888888;line-height:1.7;margin:0 0 32px;">
              Watch live streams, catch up on past streams, and explore content — all in one place. We're building this for you, so if something feels off or you have an idea, let us know.
            </p>

            <a href="https://watchpeep.tv" style="display:inline-block;background:#facc15;color:#0a0a0a;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;text-decoration:none;">
              Start watching →
            </a>

            <p style="font-size:12px;color:#333333;margin:40px 0 0;line-height:1.6;">
              You're receiving this because you signed up at watchpeep.tv.<br/>
              If this wasn't you, you can safely ignore this email.
            </p>
          </div>
        `,
      }),
    });

    const result = await res.json();
    if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": CORS_ORIGIN },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": CORS_ORIGIN },
    });
  }
});
