import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    const { user_id } = await req.json();
    if (!user_id) throw new Error("user_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    // Delete all user data first, then auth account
    await Promise.all([
      supabase.from("viewer_profiles").delete().eq("user_id", user_id),
      supabase.from("subscriptions").delete().eq("user_id", user_id),
      supabase.from("watch_progress").delete().eq("user_id", user_id),
      supabase.from("user_presence").delete().eq("user_id", user_id),
    ]);

    await supabase.from("profiles").delete().eq("id", user_id);

    const { error: authErr } = await supabase.auth.admin.deleteUser(user_id);
    if (authErr) throw new Error(authErr.message);

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
