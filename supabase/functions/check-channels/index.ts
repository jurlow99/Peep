// Server-side channel health check.
// Client-side testing via public CORS proxies is unreliable (proxies go down,
// rate-limit, run from the wrong region, and strip headers streams need). This runs
// on Supabase's servers: no CORS, a real browser User-Agent, and the true HTTP status.
//
// POST { channels: [{ id, url }] }  ->  { results: { [id]: "ok" | "dead" } }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const PROBE_TIMEOUT_MS = 8000;

async function doProbe(url: string, ctrl: AbortController): Promise<"ok" | "dead"> {
  const res = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": UA, "Accept": "*/*", "Range": "bytes=0-4095" },
    redirect: "follow",
    signal: ctrl.signal,
  });
  // 206 = partial content (honored our Range); 200 = full.
  if (!res.ok && res.status !== 206) { try { await res.body?.cancel(); } catch { /* noop */ } return "dead"; }
  const ctype = (res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();
  if (text.includes("#EXTM3U") || text.includes("#EXT")) return "ok";
  if (ctype.includes("mpegurl") || ctype.includes("octet-stream")) return "ok";
  return "dead";
}

// Hard-cap every probe: a stalled TCP connect can outlive AbortController, so we
// race the fetch against a timer and treat a timeout as "dead". Guarantees the
// whole batch finishes predictably instead of hanging on a few unreachable hosts.
async function probe(url: string): Promise<"ok" | "dead"> {
  if (!url || !/^https?:\/\//i.test(url)) return "dead";
  const ctrl = new AbortController();
  const timeout = new Promise<"dead">((resolve) =>
    setTimeout(() => { try { ctrl.abort(); } catch { /* noop */ } resolve("dead"); }, PROBE_TIMEOUT_MS)
  );
  try {
    return await Promise.race([doProbe(url, ctrl), timeout]);
  } catch {
    return "dead";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const { channels } = await req.json();
    if (!Array.isArray(channels)) throw new Error("Expected { channels: [{id, url}] }");

    const results: Record<string, "ok" | "dead"> = {};
    const CONCURRENCY = 10;
    for (let i = 0; i < channels.length; i += CONCURRENCY) {
      const batch = channels.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (c: { id: string | number; url: string }) => {
          results[c.id] = await probe(c.url);
        }),
      );
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
