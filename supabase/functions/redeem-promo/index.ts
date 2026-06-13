import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();
    if (!code || typeof code !== "string" || code.trim().length > 50) {
      throw new Error("Invalid promo code");
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) throw new Error("Not authenticated");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (!user || userErr) throw new Error("Not authenticated");

    const { data: promo } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .eq("active", true)
      .maybeSingle();

    if (!promo) {
      return new Response(JSON.stringify({ error: "Invalid or inactive promo code" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (promo.max_uses !== null && promo.uses >= promo.max_uses) {
      return new Response(JSON.stringify({ error: "Promo code has reached its usage limit" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
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
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
