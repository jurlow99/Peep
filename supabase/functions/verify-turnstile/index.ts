const CORS_ORIGIN = Deno.env.get("SITE_URL") || "https://watchpeep.tv";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": CORS_ORIGIN, "Access-Control-Allow-Headers": "content-type, authorization" },
    });
  }

  try {
    const { token } = await req.json();
    if (!token) throw new Error("Token required");

    const secret = Deno.env.get("TURNSTILE_SECRET_KEY")!;
    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });

    const data = await res.json();
    if (!data.success) throw new Error("Bot check failed");

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": CORS_ORIGIN },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": CORS_ORIGIN },
    });
  }
});
