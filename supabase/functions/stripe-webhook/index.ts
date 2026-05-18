import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-04-10",
});

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature!,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );
  } catch {
    return new Response("Webhook signature invalid", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const sub = await stripe.subscriptions.retrieve(session.subscription as string);
    await supabase.from("subscriptions").upsert({
      user_id: session.metadata!.user_id,
      stripe_customer_id: session.customer as string,
      stripe_subscription_id: session.subscription as string,
      status: sub.status,
      current_period_end: new Date((sub as any).current_period_end * 1000).toISOString(),
    }, { onConflict: "user_id" });
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    await supabase.from("subscriptions").update({
      status: sub.status,
      current_period_end: new Date((sub as any).current_period_end * 1000).toISOString(),
    }).eq("stripe_subscription_id", sub.id);
  }

  return new Response("ok", { status: 200 });
});
