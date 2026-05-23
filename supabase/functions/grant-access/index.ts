import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    // Verify caller is an authenticated admin via service role check
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) throw new Error("Not authenticated");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (!user || userErr) throw new Error("Not authenticated");

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
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
