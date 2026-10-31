import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CORS_ORIGIN = Deno.env.get("SITE_URL") || "https://watchpeep.tv";

// Cloudflare signs each webhook: `Webhook-Signature: time=<unix>,sig1=<hex>`,
// where sig1 = HMAC-SHA256(secret, "<time>.<raw body>"). The secret comes from
// register-webhook. Fails closed when the secret isn't configured.
const MAX_SIGNATURE_AGE_SECONDS = 300;

async function verifySignature(header: string | null, body: string): Promise<boolean> {
  const secret = Deno.env.get("CLOUDFLARE_STREAM_WEBHOOK_SECRET");
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map(p => p.trim().split("=", 2)));
  const time = Number(parts.time);
  const sig = parts.sig1;
  if (!Number.isFinite(time) || !sig) return false;
  if (Math.abs(Date.now() / 1000 - time) > MAX_SIGNATURE_AGE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${parts.time}.${body}`)));
  const expected = Array.from(mac, b => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": CORS_ORIGIN, "Access-Control-Allow-Headers": "authorization, content-type, webhook-signature" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const raw = await req.text();
    if (!(await verifySignature(req.headers.get("Webhook-Signature"), raw))) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const body = JSON.parse(raw);
    const event = body?.event ?? body?.action;

    if (event === "live_input.connected" || event === "stream.live_input.connected") {
      const uid = body?.uid ?? body?.stream_uid;
      if (!uid) throw new Error("No UID in payload");

      const { data: stream } = await supabase
        .from("live_streams")
        .update({ is_live: true, live_started_at: new Date().toISOString() })
        .eq("stream_uid", uid)
        .select("id")
        .maybeSingle();

      if (stream?.id) {
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-go-live`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ stream_id: stream.id }),
        }).catch(() => {});
      }

    } else if (event === "live_input.disconnected" || event === "stream.live_input.disconnected") {
      const uid = body?.uid ?? body?.stream_uid;
      if (!uid) throw new Error("No UID in payload");

      await supabase
        .from("live_streams")
        .update({ is_live: false })
        .eq("stream_uid", uid);

    } else if (event === "stream.ready") {
      // uid = video UID of the finished VOD; liveInput = the live input UID
      const videoUid = body?.uid;
      const liveInputUid = body?.liveInput ?? body?.live_input;

      // Flip is_live using the live input UID (not the video UID)
      if (liveInputUid) {
        await supabase
          .from("live_streams")
          .update({ is_live: false })
          .eq("stream_uid", liveInputUid);
      }

      // Tag the VOD with the stream title from our DB so past streams show the right name
      if (videoUid && liveInputUid) {
        const { data: stream } = await supabase
          .from("live_streams")
          .select("stream_title, channel_name, title")
          .eq("stream_uid", liveInputUid)
          .maybeSingle();

        const title = stream?.stream_title || stream?.channel_name || stream?.title;
        if (title) {
          const cfAccountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
          const cfToken = Deno.env.get("CLOUDFLARE_API_TOKEN")!;
          await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/stream/${videoUid}`,
            {
              method: "POST",
              headers: { "Authorization": `Bearer ${cfToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ meta: { name: title } }),
            }
          );
        }
      }
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
