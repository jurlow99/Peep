import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getServiceClient, requireAdmin } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = getServiceClient();
    await requireAdmin(req, supabase);

    const { user_id } = await req.json();
    if (!user_id) throw new Error("user_id is required");

    const { data: profile } = await supabase.from("profiles").select("email").eq("id", user_id).maybeSingle();

    await Promise.all([
      supabase.from("viewer_profiles").delete().eq("user_id", user_id),
      supabase.from("subscriptions").delete().eq("user_id", user_id),
      supabase.from("watch_progress").delete().eq("user_id", user_id),
      supabase.from("user_list").delete().eq("user_id", user_id),
      supabase.from("ratings").delete().eq("user_id", user_id),
      supabase.from("live_viewers").delete().eq("user_id", user_id),
      ...(profile?.email ? [supabase.from("access_grants").delete().eq("email", profile.email)] : []),
    ]);

    const { error: profileErr } = await supabase.from("profiles").delete().eq("id", user_id);
    if (profileErr) throw new Error(`Failed to delete profile: ${profileErr.message}`);

    const { error: deleteErr } = await supabase.auth.admin.deleteUser(user_id);
    if (deleteErr) throw new Error(`Failed to delete auth user: ${deleteErr.message}`);

    return jsonResponse({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse(message, 500);
  }
});
