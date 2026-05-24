import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OWNER_EMAIL = "jacob.furlow@outlook.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    // Verify caller is authenticated
    const { data: { user }, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !user) throw new Error("Unauthorized");

    // Only the owner can manage admin roles
    if (user.email?.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
      throw new Error("Only the owner can manage admin roles");
    }

    const { targetEmail, action } = await req.json(); // action: "promote" | "demote"
    if (!targetEmail?.trim()) throw new Error("targetEmail is required");
    if (action !== "promote" && action !== "demote") throw new Error("action must be 'promote' or 'demote'");

    const newRole = action === "promote" ? "admin" : "viewer";

    // Find the profile by email
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
      .update({ role: newRole })
      .eq("id", profile.id);

    if (updateErr) throw new Error(updateErr.message);

    return new Response(JSON.stringify({ success: true, email: profile.email, role: newRole }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
