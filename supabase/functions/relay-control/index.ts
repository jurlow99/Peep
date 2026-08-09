import { handleCors, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient, requireAdmin } from "../_shared/supabase.ts";

// Control plane: admin -> this edge function -> (Cloudflare Tunnel) -> Pi relay API.
// The browser never touches the Pi. RELAY_URL + RELAY_TOKEN are server-side secrets.
// action: health | test | start | stop | restart | status

async function callPi(path: string, method: string, body?: unknown) {
  const url = Deno.env.get("RELAY_URL");
  const token = Deno.env.get("RELAY_TOKEN");
  if (!url || !token) throw new Error("Relay not configured — set RELAY_URL and RELAY_TOKEN secrets");
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `relay returned HTTP ${res.status}`);
  return json;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const supabase = getServiceClient();
    await requireAdmin(req, supabase);

    const { action, feed_id } = await req.json();
    if (!["health", "test", "start", "stop", "restart", "status"].includes(action)) throw new Error("Unknown action");

    if (action === "health") return jsonResponse(await callPi("/health", "GET"));

    if (!feed_id) throw new Error("feed_id is required");
    const { data: feed, error: fErr } = await supabase.from("live_feeds").select("*").eq("id", feed_id).maybeSingle();
    if (fErr || !feed) throw new Error("Feed not found");

    // Assemble the SOURCE (incl. passphrase from the secrets table) for the Pi.
    const { data: secret } = await supabase.from("live_feed_secrets").select("passphrase").eq("feed_id", feed_id).maybeSingle();
    const source = {
      host: feed.source_host, port: feed.source_port, mode: feed.source_mode,
      stream_id: feed.source_stream_id || undefined, latency: feed.source_latency || undefined,
      passphrase: secret?.passphrase || undefined,
    };

    if (action === "test") {
      const r = await callPi(`/feeds/${feed_id}/test`, "POST", { source });
      await supabase.from("live_feeds").update({
        source_status: r.status === "CONNECTED" ? "connected" : "error",
        last_checked_at: new Date().toISOString(),
      }).eq("id", feed_id);
      return jsonResponse(r);
    }

    if (action === "start") {
      if (!feed.cloudflare_live_input_uid) throw new Error("Create the Cloudflare input first");
      // Fetch the Cloudflare push endpoint on demand (kept out of the DB).
      const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
      const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN")!;
      const cfRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/live_inputs/${feed.cloudflare_live_input_uid}`, {
        headers: { "Authorization": `Bearer ${cfToken}` },
      });
      const cfd = await cfRes.json();
      const rtmps = cfd.result?.rtmps;
      if (!rtmps?.url || !rtmps?.streamKey) throw new Error("Cloudflare push endpoint unavailable");
      const destination = { type: "rtmps", url: `${rtmps.url}${rtmps.streamKey}` };
      const r = await callPi(`/feeds/${feed_id}/start`, "POST", { source, destination });
      await supabase.from("live_feeds").update({ relay_status: "running", enabled: true }).eq("id", feed_id);
      return jsonResponse(r);
    }

    if (action === "stop") {
      const r = await callPi(`/feeds/${feed_id}/stop`, "POST");
      await supabase.from("live_feeds").update({ relay_status: "stopped" }).eq("id", feed_id);
      return jsonResponse(r);
    }

    if (action === "restart") {
      const r = await callPi(`/feeds/${feed_id}/restart`, "POST");
      await supabase.from("live_feeds").update({ relay_status: "running" }).eq("id", feed_id);
      return jsonResponse(r);
    }

    if (action === "status") {
      const r = await callPi(`/feeds/${feed_id}/status`, "GET");
      await supabase.from("live_feeds").update({
        relay_status: r.running ? "running" : (r.status || "stopped"),
        last_checked_at: new Date().toISOString(),
      }).eq("id", feed_id);
      return jsonResponse(r);
    }
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "error", 400);
  }
});
