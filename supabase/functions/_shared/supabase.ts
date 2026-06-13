import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

export async function requireUser(req: Request, supabase = getServiceClient()) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) throw new Error("Unauthorized");

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error("Unauthorized");
  return user;
}

export async function requireAdmin(req: Request, supabase = getServiceClient()) {
  const user = await requireUser(req, supabase);
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin" || profile?.is_admin === true;
  if (!isAdmin) throw new Error("Admin access required");
  return user;
}
