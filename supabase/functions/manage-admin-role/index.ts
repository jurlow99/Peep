import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getServiceClient, requireUser } from "../_shared/supabase.ts";

const OWNER_EMAIL = "jacob.furlow@outlook.com";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = getServiceClient();
    const user = await requireUser(req, supabase);

    if (user.email?.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
      throw new Error("Only the owner can manage admin roles");
    }

    const { targetEmail, action } = await req.json();
    if (!targetEmail?.trim()) throw new Error("targetEmail is required");
    if (action !== "promote" && action !== "demote") throw new Error("action must be 'promote' or 'demote'");

    const newRole = action === "promote" ? "admin" : "viewer";
    const newIsAdmin = action === "promote";

    const { data: profile, error: findErr } = await supabase
      .from("profiles")
      .select("id, email, role")
      .eq("email", targetEmail.trim().toLowerCase())
      .maybeSingle();

    if (findErr) throw new Error(findErr.message);
    if (!profile) throw new Error(`No account found for ${targetEmail}`);
    if (profile.email === OWNER_EMAIL.toLowerCase()) throw new Error("Cannot change owner role");

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ role: newRole, is_admin: newIsAdmin })
      .eq("id", profile.id);

    if (updateErr) throw new Error(updateErr.message);

    return jsonResponse({ success: true, email: profile.email, role: newRole });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse(message, 400);
  }
});
