import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

// Daily EPG refresh. For every channel whose guide was imported from a URL feed
// (epg_channel_sources.source_url + xmltv_channel_id), re-fetch the feed and
// replace that channel's upcoming programs.
//
// The actual work runs in the background (EdgeRuntime.waitUntil) and the request
// returns immediately, so a cron caller with a short HTTP timeout never times out.

function clean(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function parseXmltvDate(s: string | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?/);
  if (!m) return null;
  const [, Y, Mo, D, H, Mi, S, tz] = m;
  const off = tz ? `${tz.slice(0, 3)}:${tz.slice(3)}` : "Z";
  const d = new Date(`${Y}-${Mo}-${D}T${H}:${Mi}:${S}${off}`);
  return isNaN(d.getTime()) ? null : d;
}

function parseProgrammesByChannel(xml: string): Record<string, any[]> {
  const out: Record<string, any[]> = {};
  const re = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1], inner = m[2];
    const channel = (attrs.match(/channel="([^"]+)"/) || [])[1];
    const start = parseXmltvDate((attrs.match(/start="([^"]+)"/) || [])[1]);
    const stop = parseXmltvDate((attrs.match(/stop="([^"]+)"/) || [])[1]);
    if (!channel || !start || !stop) continue;
    const title = clean((inner.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]) || "(Untitled)";
    const desc = clean((inner.match(/<desc[^>]*>([\s\S]*?)<\/desc>/i) || [])[1]);
    const icon = (inner.match(/<icon[^>]*src="([^"]+)"/i) || [])[1] || "";
    (out[channel] ||= []).push({
      start_time: start.toISOString(),
      end_time: stop.toISOString(),
      title,
      description: desc || null,
      thumbnail: icon || null,
    });
  }
  return out;
}

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Peep-EPG-Refresh/1.0" }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return new TextDecoder().decode(bytes);
}

async function doRefresh() {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: sources, error } = await supabase
    .from("epg_channel_sources")
    .select("channel_id, source_url, xmltv_channel_id")
    .not("source_url", "is", null)
    .not("xmltv_channel_id", "is", null);
  if (error) return { error: error.message };
  if (!sources?.length) return { refreshed_channels: 0, programs: 0, note: "No URL-based EPG sources to refresh." };

  const byUrl: Record<string, typeof sources> = {};
  for (const s of sources) (byUrl[s.source_url!] ||= []).push(s);

  const nowIso = new Date().toISOString();
  let refreshedChannels = 0, totalPrograms = 0;
  const failures: string[] = [];

  for (const [url, rows] of Object.entries(byUrl)) {
    let byChan: Record<string, any[]>;
    try {
      byChan = parseProgrammesByChannel(await fetchXml(url));
    } catch (e) {
      failures.push(`${url}: ${e instanceof Error ? e.message : "fetch failed"}`);
      continue;
    }
    for (const row of rows) {
      const progs = byChan[row.xmltv_channel_id!] || [];
      if (!progs.length) continue;
      const entries = progs.map(p => ({ channel_id: row.channel_id, ...p }));
      const starts = entries.map(e => e.start_time).sort();
      const ends = entries.map(e => e.end_time).sort();
      const minStart = starts[0], maxEnd = ends[ends.length - 1];

      await supabase.from("epg_entries").delete()
        .eq("channel_id", row.channel_id).gte("start_time", minStart).lte("end_time", maxEnd);
      for (let i = 0; i < entries.length; i += 500) {
        const { error: insErr } = await supabase.from("epg_entries").insert(entries.slice(i, i + 500));
        if (insErr) { failures.push(`channel ${row.channel_id}: ${insErr.message}`); break; }
      }
      await supabase.from("epg_channel_sources")
        .update({ imported_at: nowIso, program_count: entries.length })
        .eq("channel_id", row.channel_id);
      refreshedChannels++;
      totalPrograms += entries.length;
    }
  }

  return { refreshed_channels: refreshedChannels, programs: totalPrograms, feeds: Object.keys(byUrl).length, failures };
}

Deno.serve((req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const task = doRefresh()
    .then(r => console.log("[refresh-epg]", JSON.stringify(r)))
    .catch(e => console.error("[refresh-epg] failed:", e instanceof Error ? e.message : e));

  // Keep the function alive to finish the work after the response is sent.
  try { (globalThis as any).EdgeRuntime?.waitUntil(task); } catch { /* local dev */ }

  return jsonResponse({ started: true, note: "EPG refresh running in background — see function logs for the result." }, 202);
});
