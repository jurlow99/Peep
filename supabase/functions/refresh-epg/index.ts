import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {requireAdmin} from "../_shared/supabase.ts";
import {fetchPublicFeed,decodedFeedStream} from "../_shared/xmltvFetch.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

// Daily EPG refresh. For every channel whose guide was imported from a URL feed
// (epg_channel_sources.source_url + xmltv_channel_id), re-fetch the feed and
// replace that channel's programs.
//
// Feeds are STREAMED + decompressed on the fly and scanned for only the target
// channels' programmes, so huge aggregate feeds (e.g. epgshare01 US2 is ~70MB /
// 77k programmes) never get loaded whole into memory. Runs in the background
// (EdgeRuntime.waitUntil) so a cron caller with a short HTTP timeout is fine.

function clean(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function attribute(source: string, name: string): string | undefined {
  const match=source.match(new RegExp(`\\b${name}\\s*=\\s*(['"])(.*?)\\1`));
  return match?clean(match[2]):undefined;
}

function parseXmltvDate(s: string | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(?:(\d{2})(\d{2})?)?(?:\s*([+-]\d{4}))?$/);
  if (!m) return null;
  const [, Y, Mo, D, H, Mi='00', S='00', tz] = m;
  const off = tz ? `${tz.slice(0, 3)}:${tz.slice(3)}` : 'Z';
  const d = new Date(`${Y}-${Mo}-${D}T${H}:${Mi}:${S}${off}`);
  return isNaN(d.getTime()) ? null : d;
}

// Stream a (optionally gzipped) XMLTV feed and collect programmes for the given
// channel ids only. Memory stays bounded no matter how large the feed is.
async function streamExtract(url: string, ids: string[]): Promise<Record<string, any[]>> {
  const idSet = new Set(ids);
  const out: Record<string, any[]> = {};
  const seen: Record<string, Set<string>> = {};
  for (const id of ids) { out[id] = []; seen[id] = new Set(); }

  const res = await fetchPublicFeed(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const stream=await decodedFeedStream(res);
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();

  const progRe = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (value) buf += value;

    progRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    let lastEnd = 0;
    while ((m = progRe.exec(buf)) !== null) {
      lastEnd = progRe.lastIndex;
      const attrs = m[1], inner = m[2];
      const ch = attribute(attrs,"channel");
      if (!ch || !idSet.has(ch)) continue;
      const start = parseXmltvDate(attribute(attrs,"start"));
      const stop = parseXmltvDate(attribute(attrs,"stop"));
      if (!start || !stop || stop<=start) continue;
      const st = start.toISOString();
      if (seen[ch].has(st)) continue;
      seen[ch].add(st);
      const title = clean((inner.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]) || "(Untitled)";
      const desc = clean((inner.match(/<desc[^>]*>([\s\S]*?)<\/desc>/i) || [])[1]);
      const icon = (inner.match(/<icon[^>]*src="([^"]+)"/i) || [])[1] || "";
      out[ch].push({ start_time: st, end_time: stop.toISOString(), title, description: desc || null, thumbnail: icon || null });
    }

    if (done) break;
    if (lastEnd > 0) buf = buf.slice(lastEnd);                 // drop fully-consumed programmes
    if (buf.length > 4_000_000) buf = buf.slice(-1_000_000);   // safety cap for pathological input
  }
  return out;
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
      byChan = await streamExtract(url, rows.map(r => r.xmltv_channel_id!));
    } catch (e) {
      failures.push('Feed refresh failed.');
      for(const row of rows)await supabase.from('epg_channel_sources').update({refresh_error:'Feed refresh failed. Existing schedule retained.'}).eq('channel_id',row.channel_id);
      continue;
    }
    for (const row of rows) {
      const progs = byChan[row.xmltv_channel_id!] || [];
      if (!progs.length) {
        failures.push(`channel ${row.channel_id}: no valid programs`);
        await supabase.from('epg_channel_sources').update({refresh_error:'No valid programs found. Existing schedule retained.'}).eq('channel_id',row.channel_id);
        continue;
      }
      const entries = progs.map(p => ({ channel_id: row.channel_id, ...p }));
      const {error: saveError}=await supabase.rpc('save_channel_guide',{
        p_channel_id:row.channel_id,p_entries:entries,p_source_name:'XMLTV feed',
        p_source_url:url,p_xmltv_channel_id:row.xmltv_channel_id,p_xml_content:null,
      });
      if(saveError){failures.push(`channel ${row.channel_id}: schedule update failed`);continue;}

      refreshedChannels++;
      totalPrograms += entries.length;
    }
  }

  return { refreshed_channels: refreshedChannels, programs: totalPrograms, feeds: Object.keys(byUrl).length, failures };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const service = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let authorized=false;
  const jobToken=req.headers.get('x-epg-job-token');
  if(jobToken){const {data,error}=await service.rpc('authorize_epg_refresh',{p_token:jobToken});authorized=!error&&data===true;}
  if(!authorized){try{await requireAdmin(req,service);authorized=true;}catch{/* deny below */}}
  if(!authorized)return jsonResponse({error:'Admin or scheduler access required.'},403);
  if(req.method!=='POST')return jsonResponse({error:'POST required'},405);
  const task = doRefresh()
    .then(r => console.log("[refresh-epg]", JSON.stringify(r)))
    .catch(e => console.error("[refresh-epg] failed:", e instanceof Error ? e.message : e));

  // Keep the function alive to finish the work after the response is sent.
  try { (globalThis as any).EdgeRuntime?.waitUntil(task); } catch { /* local dev */ }

  return jsonResponse({ started: true, note: "EPG refresh running in background — see function logs for the result." }, 202);
});
