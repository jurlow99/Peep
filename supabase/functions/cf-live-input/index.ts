import { corsHeaders, handleCors, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient, requireAdmin } from "../_shared/supabase.ts";

// Manage a Cloudflare Stream Live Input for a Feed (the DESTINATION the Pi pushes to).
// action: "create" | "status" | "delete". Admin-only. Cloudflare creds stay server-side.

const CF_CUSTOMER = "customer-x9w8t8qxjaf49jqb.cloudflarestream.com";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const supabase = getServiceClient();
    await requireAdmin(req, supabase);

    const { action, feed_id } = await req.json();
    if (!feed_id) throw new Error("feed_id is required");
    if (!["create", "status", "delete"].includes(action)) throw new Error("Unknown action");

    const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
    const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN")!;
    const cfBase = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/live_inputs`;
    const cfHeaders = { "Authorization": `Bearer ${cfToken}`, "Content-Type": "application/json" };

    const { data: feed, error: feedErr } = await supabase.from("live_feeds").select("*").eq("id", feed_id).maybeSingle();
    if (feedErr || !feed) throw new Error("Feed not found");

    // ── CREATE ──
    if (action === "create") {
      if (feed.cloudflare_live_input_uid) {
        return jsonResponse({ ok: true, already: true, uid: feed.cloudflare_live_input_uid, hls_url: feed.cloudflare_hls_url });
      }
      const res = await fetch(cfBase, {
        method: "POST",
        headers: cfHeaders,
        body: JSON.stringify({ meta: { name: `peep-feed-${feed.name}`.slice(0, 80) }, recording: { mode: "off" } }),
      });
      const data = await res.json();
      if (!data.success) throw new Error("Cloudflare: " + (data.errors?.[0]?.message || "live input create failed"));
      const uid = data.result.uid;
      const srtUrl = data.result.srt?.url || null; // DESTINATION srt push target (Pi pushes here)
      const hls = `https://${CF_CUSTOMER}/${uid}/manifest/video.m3u8`;
      const dash = `https://${CF_CUSTOMER}/${uid}/manifest/video.mpd`;
      await supabase.from("live_feeds").update({
        cloudflare_live_input_uid: uid,
        cloudflare_srt_url: srtUrl,
        cloudflare_hls_url: hls,
        cloudflare_dash_url: dash,
        cloudflare_status: "created",
      }).eq("id", feed_id);
      return jsonResponse({ ok: true, uid, hls_url: hls });
    }

    // ── STATUS ──
    if (action === "status") {
      if (!feed.cloudflare_live_input_uid) return jsonResponse({ ok: true, cloudflare_status: "none", playback_status: "unknown" });
      const res = await fetch(`${cfBase}/${feed.cloudflare_live_input_uid}`, { headers: cfHeaders });
      const data = await res.json();
      if (!data.success) throw new Error("Cloudflare: " + (data.errors?.[0]?.message || "status failed"));
      const state = data.result?.status?.current?.state || null; // "connected" | "disconnected" | null
      const cfStatus = state === "connected" ? "live" : feed.cloudflare_live_input_uid ? "receiving" : "unknown";
      const playback = state === "connected" ? "available" : "unavailable";
      await supabase.from("live_feeds").update({
        cloudflare_status: cfStatus, playback_status: playback, last_checked_at: new Date().toISOString(),
      }).eq("id", feed_id);
      return jsonResponse({ ok: true, cloudflare_status: cfStatus, playback_status: playback, state });
    }

    // ── DELETE ──
    if (action === "delete") {
      if (feed.cloudflare_live_input_uid) {
        await fetch(`${cfBase}/${feed.cloudflare_live_input_uid}`, { method: "DELETE", headers: cfHeaders }).catch(() => {});
      }
      await supabase.from("live_feeds").update({
        cloudflare_live_input_uid: null, cloudflare_srt_url: null, cloudflare_hls_url: null,
        cloudflare_dash_url: null, cloudflare_status: "unknown", playback_status: "unknown",
      }).eq("id", feed_id);
      return jsonResponse({ ok: true });
    }
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "error", 400);
  }
});
