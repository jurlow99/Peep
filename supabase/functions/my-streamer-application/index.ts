import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";

// Signed-in users check the status of / submit their own streamer application.
// Applications are keyed by account email — approve-streamer matches on email too.

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (!user || authErr) return errorResponse("Unauthorized", 401);

    const email = user.email?.toLowerCase();
    if (!email) return errorResponse("Account has no email", 400);

    const { data: existingStream } = await supabase
      .from("live_streams")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: application } = await supabase
      .from("streamer_applications")
      .select("id, name, status, notes, created_at")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (req.method === "GET") {
      return jsonResponse({ application: application ?? null, has_channel: !!existingStream });
    }

    if (req.method !== "POST") return errorResponse("Method not allowed", 405);

    if (existingStream) return errorResponse("You already have a channel.", 409);
    if (application?.status === "pending") return errorResponse("Your application is already under review.", 409);
    if (application?.status === "approved") return errorResponse("You're already approved — refresh your dashboard.", 409);

    const body = await req.json();
    const name = (body.name || "").trim();
    const why = (body.why || "").trim();
    const social = (body.social_links || "").trim();
    if (name.length < 2) return errorResponse("Name is required.");
    if (why.length < 20) return errorResponse("Tell us a bit more about what you'd stream (at least 20 characters).");
    if (name.length > 100 || why.length > 2000 || social.length > 1000) return errorResponse("One of the fields is too long.");

    const { data: created, error: insertErr } = await supabase
      .from("streamer_applications")
      .insert({
        name,
        email,
        why_they_want_to_stream: why,
        social_links: social || null,
        status: "pending",
      })
      .select("id, name, status, notes, created_at")
      .single();
    if (insertErr) return errorResponse(`Could not submit application: ${insertErr.message}`);

    return jsonResponse({ application: created });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Unexpected error", 400);
  }
});
