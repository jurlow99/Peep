import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
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

    const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN")!;

    const body = await req.json().catch(() => ({}));
    const maxDurationSeconds = body.maxDurationSeconds ?? 14400; // 4 hours max

    // Request a direct creator upload from Cloudflare Stream
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/direct_upload`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cfToken}`,
          "Content-Type": "application/json",
          "Tus-Resumable": "1.0.0",
          "Upload-Length": "0",
        },
        body: JSON.stringify({
          maxDurationSeconds,
          requireSignedURLs: false,
          meta: { uploadedBy: user.id },
        }),
      }
    );

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.errors?.[0]?.message ?? "Cloudflare Stream rejected the request");
    }

    return new Response(
      JSON.stringify({ uid: data.result.uid, uploadURL: data.result.uploadURL }),
      { headers: { "Content-Type": "application/json", ...CORS } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }
});
