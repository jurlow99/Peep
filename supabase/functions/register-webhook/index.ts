Deno.serve(async () => {
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
