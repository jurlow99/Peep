import { requireAdmin } from "../_shared/supabase.ts";

// Admin-only: Cloudflare's response includes the webhook signing secret.
// Save that secret as CLOUDFLARE_STREAM_WEBHOOK_SECRET so stream-webhook
// can verify incoming events.
Deno.serve(async (req) => {
  try {
    await requireAdmin(req);
  } catch {
    return new Response(JSON.stringify({ error: "Admin access required" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }

  const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
  const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN")!;
  // Append the anon key so Cloudflare's unauthenticated POST passes Supabase JWT verification
  const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/stream-webhook?apikey=${Deno.env.get("SUPABASE_ANON_KEY")}`;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/webhook`,
    {
      method: "PUT",
      headers: { "Authorization": `Bearer ${cfToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ notificationUrl: webhookUrl }),
    }
  );
  const data = await res.json();
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
});
