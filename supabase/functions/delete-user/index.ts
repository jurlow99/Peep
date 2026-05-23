import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) throw new Error("Not authenticated");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(token);
    if (!caller || authErr) throw new Error("Not authenticated");

    const { user_id } = await req.json();
    if (!user_id) throw new Error("user_id is required");

    // Delete all user data first, then auth account
    await Promise.all([
      supabase.from("viewer_profiles").delete().eq("user_id", user_id),
      supabase.from("subscriptions").delete().eq("user_id", user_id),
      supabase.from("watch_progress").delete().eq("user_id", user_id),
      supabase.from("user_presence").delete().eq("user_id", user_id),
    ]);

    await supabase.from("profiles").delete().eq("id", user_id);

    const { error: deleteErr } = await supabase.auth.admin.deleteUser(user_id);
    if (deleteErr) throw new Error(deleteErr.message);

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
