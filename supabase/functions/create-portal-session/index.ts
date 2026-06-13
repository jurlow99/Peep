import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getServiceClient, requireUser } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = getServiceClient();
    const user = await requireUser(req, supabase);

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!sub?.stripe_customer_id) throw new Error("No billing account found");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const { return_url } = await req.json().catch(() => ({ return_url: "https://watchpeep.tv" }));

    const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        customer: sub.stripe_customer_id,
        return_url: return_url || "https://watchpeep.tv",
      }).toString(),
    });

    const session = await res.json();
    if (session.error) throw new Error(session.error.message);

    return jsonResponse({ url: session.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse(message, 500);
  }
});
