import { handleCors, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient, requireAdmin } from "../_shared/supabase.ts";

// Create/update a Live Feed. The passphrase (if provided) is written to the
// service-role-only live_feed_secrets table — it never travels via a client write
// and is never returned. Admin-only.

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  try {
    const supabase = getServiceClient();
    await requireAdmin(req, supabase);

    const b = await req.json();
    if (!b.name || !String(b.name).trim()) throw new Error("Name is required");
    if (b.source_mode && !["caller", "listener", "rendezvous"].includes(b.source_mode)) throw new Error("Invalid mode");

    // "push": the provider sends to our Cloudflare input directly; no relay source to keep.
    const sourceType = ["srt", "push"].includes(b.source_type) ? b.source_type : "srt";
    const push = sourceType === "push";
    const fields = {
      name: String(b.name).trim(),
      source_type: sourceType,
      source_host: push ? null : b.source_host?.trim() || null,
      source_port: push ? null : b.source_port ? Number(b.source_port) : null,
      source_mode: b.source_mode || "caller",
      source_stream_id: push ? null : b.source_stream_id?.trim() || null,
      source_latency: b.source_latency ? Number(b.source_latency) : 200,
      notes: b.notes?.trim() || null,
      enabled: b.enabled !== false,
    };

    let feedId = b.id || null;
    if (feedId) {
      const { error } = await supabase.from("live_feeds").update(fields).eq("id", feedId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("live_feeds").insert(fields).select("id").single();
      if (error) throw error;
      feedId = data.id;
    }

    // Passphrase handling (secret-safe):
    //  - non-empty string  -> upsert secret + flag has_passphrase
    //  - clear_passphrase   -> remove secret + clear flag
    //  - undefined/empty    -> leave as-is
    if (b.clear_passphrase === true || push) {
      await supabase.from("live_feed_secrets").delete().eq("feed_id", feedId);
      await supabase.from("live_feeds").update({ has_passphrase: false }).eq("id", feedId);
    } else if (typeof b.passphrase === "string" && b.passphrase.length > 0) {
      await supabase.from("live_feed_secrets").upsert({ feed_id: feedId, passphrase: b.passphrase, updated_at: new Date().toISOString() }, { onConflict: "feed_id" });
      await supabase.from("live_feeds").update({ has_passphrase: true }).eq("id", feedId);
    }

    return jsonResponse({ ok: true, id: feedId });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : "error", 400);
  }
});
