import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CORS_ORIGIN = Deno.env.get("SITE_URL") || "https://watchpeep.tv";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": CORS_ORIGIN, "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) throw new Error("Unauthorized");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (!user || authErr) throw new Error("Unauthorized");

    const { uid } = await req.json();
    if (!uid) throw new Error("uid is required");

    // Verify the VOD belongs to this user's stream
    const { data: stream } = await supabase
      .from("live_streams")
      .select("id, slug, username, channel_name, title")
      .eq("user_id", user.id)
      .single();
    if (!stream) throw new Error("Stream not found");

    // Block deletion if there's an open moderation report against this channel
    const slug = stream.slug || stream.username || (stream.channel_name || stream.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const { count } = await supabase
      .from("content_reports")
      .select("id", { count: "exact", head: true })
      .eq("content_id", slug)
      .eq("status", "pending");
    if ((count ?? 0) > 0) {
      throw new Error("This channel has a pending moderation review. VODs cannot be deleted until the report is resolved.");
    }

    const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN")!;

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/${uid}`,
      { method: "DELETE", headers: { "Authorization": `Bearer ${cfToken}` } }
    );

    if (!res.ok) {
      const data = await res.json();
      throw new Error(`Cloudflare error: ${JSON.stringify(data.errors)}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": CORS_ORIGIN },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": CORS_ORIGIN },
    });
  }
});
