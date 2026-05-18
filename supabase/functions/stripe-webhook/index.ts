import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = header.split(",").reduce((acc: Record<string, string>, part) => {
    const [k, v] = part.split("=");
    acc[k] = v;
    return acc;
  }, {});
  const timestamp = parts["t"];
  const sig = parts["v1"];
  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(signatureBytes)).map(b => b.toString(16).padStart(2, "0")).join("");
  return expected === sig;
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature") || "";
  const body = await req.text();
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

  const valid = await verifyStripeSignature(body, signature, webhookSecret);
  if (!valid) return new Response("Invalid signature", { status: 400 });

  const event = JSON.parse(body);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SERVICE_ROLE_KEY")!
  );

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    // Fetch subscription details
    const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${session.subscription}`, {
      headers: { "Authorization": `Bearer ${stripeKey}` },
    });
    const sub = await subRes.json();
    await supabase.from("subscriptions").upsert({
      user_id: session.metadata.user_id,
      stripe_customer_id: session.customer,
      stripe_subscription_id: session.subscription,
      status: sub.status,
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    }, { onConflict: "user_id" });
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    await supabase.from("subscriptions").update({
      status: sub.status,
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    }).eq("stripe_subscription_id", sub.id);
  }

  return new Response("ok", { status: 200 });
});
