import {handleCors,jsonResponse,errorResponse} from '../_shared/cors.ts';
import {requireAdmin} from '../_shared/supabase.ts';
import {publicFeedURL,privateAddress} from '../_shared/xmltvFetch.ts';
import {httpCheckResult,isHLSManifest} from './manifest.ts';

// Reachability of a manifest is not proof that every media segment plays.
type Check = {status:'ok'|'dead'|'unknown';reason:string};
async function inspect(value: string, signal: AbortSignal): Promise<Check> {
 let url=publicFeedURL(value);
 for(let hop=0;hop<5;hop++) {
  const host=url.hostname.replace(/^\[|\]$/g,'');
  const addresses=/^[\d.]+$/.test(host)||host.includes(':')?[host]:(await Promise.allSettled([Deno.resolveDns(host,'A'),Deno.resolveDns(host,'AAAA')])).flatMap(r=>r.status==='fulfilled'?r.value:[]);
  if(!addresses.length)return {status:'unknown',reason:'DNS lookup failed'};
  if(addresses.some(privateAddress))return {status:'unknown',reason:'Private network URLs cannot be checked'};
  let response=await fetch(url,{signal,redirect:'manual',headers:{'User-Agent':'Peep-ChannelCheck/1.0','Accept':'application/vnd.apple.mpegurl,application/x-mpegURL,*/*','Range':'bytes=0-4095'}});
  if(response.status===416) {
   await response.body?.cancel();
   response=await fetch(url,{signal,redirect:'manual',headers:{'User-Agent':'Peep-ChannelCheck/1.0','Accept':'application/vnd.apple.mpegurl,*/*'}});
  }
  if([301,302,303,307,308].includes(response.status)) {
   const next=response.headers.get('location');await response.body?.cancel();
   if(!next)throw new Error('Missing redirect');url=publicFeedURL(new URL(next,url).toString());continue;
  }
  if(!response.ok){await response.body?.cancel();return httpCheckResult(response.status);}
  if(!response.body)return {status:'dead',reason:'Empty playlist response'};
  const reader=response.body.getReader();const decoder=new TextDecoder();let text='',size=0;
  try {
   while(size<4096) {
    const {value,done}=await reader.read();if(done)break;
    const part=value.subarray(0,4096-size);size+=part.length;text+=decoder.decode(part,{stream:true});
    if(isHLSManifest(text))return {status:'ok',reason:'HLS playlist reachable'};
   }
   return {status:'dead',reason:'Response is not a valid HLS playlist'};
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
 }
 return {status:'unknown',reason:'Too many redirects'};
}
async function probe(url: string): Promise<Check> {
 const controller=new AbortController();let timer: ReturnType<typeof setTimeout>|undefined;
 try {
  return await Promise.race([inspect(url,controller.signal),new Promise<Check>(resolve=>{timer=setTimeout(()=>{resolve({status:'unknown',reason:'Timed out after 12 seconds'});controller.abort();},12000);})]);
 }catch{return {status:'unknown',reason:controller.signal.aborted?'Timed out after 12 seconds':'Connection failed or source rejected the request'};}finally{if(timer)clearTimeout(timer);controller.abort();}
}
Deno.serve(async req=>{
 const cors=handleCors(req);if(cors)return cors;
 if(req.method!=='POST')return errorResponse('Use POST.',405);
 try{await requireAdmin(req);}catch{return errorResponse('Admin access required.',403);}
 try {
  const {channels}=await req.json();
  if(!Array.isArray(channels)||channels.length<1||channels.length>40||channels.some(c=>!c||!['string','number'].includes(typeof c.id)||typeof c.url!=='string'||c.url.length>8192))return errorResponse('Provide 1–40 channels with IDs and playback URLs.');
  const results: Record<string,'ok'|'dead'|'unknown'>=Object.create(null);
  const details: Record<string,string>=Object.create(null);
  for(let i=0;i<channels.length;i+=10)await Promise.all(channels.slice(i,i+10).map(async c=>{const check=await probe(c.url);results[String(c.id)]=check.status;details[String(c.id)]=check.reason;}));
  return jsonResponse({results,details});
 }catch{return errorResponse('Could not check channels.',400);}
});
