import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CORS_ORIGIN = Deno.env.get("SITE_URL") || "https://watchpeep.tv";

const CORS = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) throw new Error("Unauthorized");

    const uid = new URL(req.url).searchParams.get("uid");
    if (!uid) throw new Error("uid is required");

    const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN")!;

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/${uid}`,
      { headers: { "Authorization": `Bearer ${cfToken}` } },
    );
    const data = await res.json();
    if (!data.success) throw new Error("Failed to fetch video status");

    const v = data.result;
    return new Response(
      JSON.stringify({
        uid: v.uid,
        readyToStream: v.readyToStream ?? false,
        pctComplete: v.status?.pctComplete ?? null,
        state: v.status?.state ?? "unknown",
      }),
      { headers: { "Content-Type": "application/json", ...CORS } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }
});
