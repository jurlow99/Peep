import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CORS_ORIGIN = Deno.env.get("SITE_URL") || "https://watchpeep.tv";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": CORS_ORIGIN, "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !user) throw new Error("Unauthorized");

    const { mode } = await req.json(); // "immediate" | "end_of_period"
    if (mode !== "immediate" && mode !== "end_of_period") throw new Error("mode must be 'immediate' or 'end_of_period'");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;

    // Get subscription record
    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id, stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subErr) throw new Error(subErr.message);
    if (!sub?.stripe_subscription_id) throw new Error("No active subscription found");

    if (mode === "end_of_period") {
      // Cancel at period end — user keeps access until renewal date
      const res = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ cancel_at_period_end: "true" }).toString(),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      await supabase.from("subscriptions").update({ status: "canceling" }).eq("user_id", user.id);

      return new Response(JSON.stringify({ success: true, mode: "end_of_period", access_until: new Date(data.cancel_at * 1000).toISOString() }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": CORS_ORIGIN },
      });
    } else {
      // Cancel immediately + issue prorated refund
      const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
        headers: { "Authorization": `Bearer ${stripeKey}` },
      });
      const subData = await subRes.json();
      if (subData.error) throw new Error(subData.error.message);

      // Calculate prorated refund
      const now = Math.floor(Date.now() / 1000);
      const periodStart = subData.current_period_start;
      const periodEnd = subData.current_period_end;
      const totalSeconds = periodEnd - periodStart;
      const remainingSeconds = periodEnd - now;
      const amount = subData.items?.data?.[0]?.price?.unit_amount ?? 0;
      const refundAmount = Math.round((remainingSeconds / totalSeconds) * amount);

      // Cancel the subscription immediately
      const cancelRes = await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${stripeKey}` },
      });
      const cancelData = await cancelRes.json();
      if (cancelData.error) throw new Error(cancelData.error.message);

      // Issue prorated refund if there's something to refund
      let refundIssued = false;
      if (refundAmount > 0) {
        // Get the latest invoice payment intent
        const invoiceRes = await fetch(`https://api.stripe.com/v1/invoices?customer=${sub.stripe_customer_id}&limit=1&status=paid`, {
          headers: { "Authorization": `Bearer ${stripeKey}` },
        });
        const invoiceData = await invoiceRes.json();
        const paymentIntentId = invoiceData.data?.[0]?.payment_intent;

        if (paymentIntentId) {
          const refundRes = await fetch("https://api.stripe.com/v1/refunds", {
            method: "POST",
            headers: { "Authorization": `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ payment_intent: paymentIntentId, amount: String(refundAmount) }).toString(),
          });
          const refundData = await refundRes.json();
          refundIssued = !refundData.error;
        }
      }

      await supabase.from("subscriptions").update({ status: "canceled" }).eq("user_id", user.id);

      return new Response(JSON.stringify({
        success: true,
        mode: "immediate",
        refund_amount: refundAmount,
        refund_issued: refundIssued,
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": CORS_ORIGIN },
      });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": CORS_ORIGIN },
    });
  }
});
