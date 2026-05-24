import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_PRICE_ID = "price_1TZkbxRgQH3TYy3QAYrrn4Ew";

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
    const { user_id, email, payment_method_id, price_id } = await req.json();
    const activePriceId = price_id || DEFAULT_PRICE_ID;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    // Find or create Stripe customer
    const searchRes = await fetch(
      `https://api.stripe.com/v1/customers/search?query=${encodeURIComponent(`email:'${email}'`)}`,
      { headers: { "Authorization": `Bearer ${stripeKey}` } }
    );
    const searchData = await searchRes.json();

    let customerId: string;
    if (searchData.data?.length > 0) {
      customerId = searchData.data[0].id;
    } else {
      const custRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: { "Authorization": `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email, "metadata[user_id]": user_id }).toString(),
      });
      const cust = await custRes.json();
      if (cust.error) throw new Error(cust.error.message);
      customerId = cust.id;
    }

    // Attach payment method to customer
    const attachRes = await fetch(`https://api.stripe.com/v1/payment_methods/${payment_method_id}/attach`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ customer: customerId }).toString(),
    });
    const attachData = await attachRes.json();
    if (attachData.error) throw new Error(attachData.error.message);

    // Create subscription
    const subRes = await fetch("https://api.stripe.com/v1/subscriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        customer: customerId,
        "items[0][price]": activePriceId,
        default_payment_method: payment_method_id,
        "expand[]": "latest_invoice.payment_intent",
        "metadata[user_id]": user_id,
      }).toString(),
    });
    const sub = await subRes.json();
    if (sub.error) throw new Error(sub.error.message);

    // Write to DB directly — don't wait for webhook
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );
    await supabaseClient.from("subscriptions").upsert({
      user_id,
      email,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      plan_id: activePriceId,
      status: sub.status,
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
    }, { onConflict: "user_id" });

    const paymentIntent = sub.latest_invoice?.payment_intent;
    return new Response(JSON.stringify({
      status: paymentIntent?.status ?? sub.status,
      client_secret: paymentIntent?.client_secret ?? null,
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
