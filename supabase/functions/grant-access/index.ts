import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin } from "../_shared/supabase.ts";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await requireAdmin(req, supabase);

    const { email } = await req.json();
    if (!email?.trim()) throw new Error("Email is required");

    const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) throw new Error(listErr.message);

    const target = users.find(u => u.email?.toLowerCase() === email.trim().toLowerCase());
    if (!target) throw new Error("No account found with that email address");

    const { error } = await supabase.from("subscriptions").upsert({
      user_id: target.id,
      email: target.email,
      status: "active",
      plan: "comp",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      current_period_end: null,
    }, { onConflict: "user_id" });

    if (error) throw new Error(error.message);

    return new Response(JSON.stringify({ success: true, email: target.email }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
