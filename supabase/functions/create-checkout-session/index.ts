const PRICE_ID = "price_1TYZ4ADARsmnN5LeEIZnYYgB";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  try {
    const { user_id, email, origin } = await req.json();
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    const params = new URLSearchParams({
      "payment_method_types[0]": "card",
      "line_items[0][price]": PRICE_ID,
      "line_items[0][quantity]": "1",
      "mode": "subscription",
      "success_url": `${origin}/?subscribed=1`,
      "cancel_url": `${origin}/`,
      "customer_email": email,
      "metadata[user_id]": user_id,
    });

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await res.json();
    if (!res.ok) throw new Error(session.error?.message || "Stripe error");

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
