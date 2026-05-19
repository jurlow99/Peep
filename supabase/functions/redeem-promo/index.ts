import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    const { code } = await req.json();

    // Verify the user from their JWT — never trust client-sent user_id
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (!user || userErr) throw new Error("Not authenticated");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    const { data: promo } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .eq("active", true)
      .maybeSingle();

    if (!promo) {
      return new Response(JSON.stringify({ error: "Invalid or inactive promo code" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    await supabase.from("promo_codes").update({ uses: promo.uses + 1 }).eq("id", promo.id);

    const { error } = await supabase.from("subscriptions").upsert({
      user_id: user.id,
      email: user.email,
      status: "active",
      plan: "comp",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      current_period_end: null,
    }, { onConflict: "user_id" });

    if (error) throw new Error(error.message);

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
