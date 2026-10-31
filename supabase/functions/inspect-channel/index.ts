import {handleCors,jsonResponse,errorResponse} from '../_shared/cors.ts';
import {requireAdmin,getServiceClient} from '../_shared/supabase.ts';
import {fetchPublicFeed,boundedBytes} from '../_shared/xmltvFetch.ts';
import {parseHLS} from './hls.ts';
import {inspectTransport} from './transport.ts';
async function prefix(response:Response,limit:number){
 if(!response.body)throw Error('Empty sample');const reader=response.body.getReader();const chunks:Uint8Array[]=[];let count=0,complete=false;
 try{while(count<limit){const {value,done}=await reader.read();if(done){complete=true;break;}const chunk=value.subarray(0,limit-count);chunks.push(chunk);count+=chunk.length;}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const data=new Uint8Array(count);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}return {data,complete};
}
Deno.serve(async req=>{
 const cors=handleCors(req);if(cors)return cors;
 if(req.method!=='POST')return errorResponse('Use POST.',405);
 const client=getServiceClient();try{await requireAdmin(req,client);}catch{return errorResponse('Admin access required.',403);}
 try{
  const {channel_id}=await req.json();if(!Number.isSafeInteger(channel_id))return errorResponse('A saved channel ID is required.');
  const {data:channel,error}=await client.from('channels').select('id,name,hls_url,stream_uid,live_feed_id').eq('id',channel_id).single();if(error||!channel)return errorResponse('Channel not found.',404);
  let source=channel.hls_url;
  if(channel.live_feed_id){const {data:feed,error}=await client.from('public_live_feeds').select('cloudflare_hls_url').eq('id',channel.live_feed_id).single();if(error||!feed?.cloudflare_hls_url)return errorResponse('The linked feed has no inspectable playback URL.',422);source=feed.cloudflare_hls_url;}
  else if(!source&&channel.stream_uid)source=`https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com/${encodeURIComponent(channel.stream_uid)}/manifest/video.m3u8`;
  if(!source||!/^https?:\/\//i.test(source))return errorResponse('This inspector needs an HLS playback URL. SRT/RTMP ingest inspection requires the relay probe.',422);
  const signal=AbortSignal.timeout(25000),started=Date.now(),response=await fetchPublicFeed(source,signal);
  const master=parseHLS(new TextDecoder().decode(await boundedBytes(response.body!,1024*1024)));
  let media=master,base=response.url,selected:any=null;
  if(master.variants.length){selected=[...master.variants].sort((a,b)=>(b.bandwidth??-1)-(a.bandwidth??-1))[0];const child=await fetchPublicFeed(new URL(selected.uri,base).href,signal);base=child.url;media=parseHLS(new TextDecoder().decode(await boundedBytes(child.body!,1024*1024)));}
  let transport:any=null,sampleNote='No complete media segment was available.';
  if(media.encrypted)sampleNote='Encrypted segments were not decrypted or inspected.';
  else if(media.byteRanges)sampleNote='Byte-range media is not sampled by this inspector.';
  else if(media.fragmented)sampleNote='Fragmented MP4 does not expose an MPEG-TS PMT/PID table.';
  else if(media.segments.length){try{const segment=await fetchPublicFeed(new URL(media.segments[media.segments.length-1],base).href,signal);const sample=await prefix(segment,16*1024*1024);transport=inspectTransport(sample.data,sample.complete?media.segmentDurations[media.segmentDurations.length-1]:null);sampleNote=transport.pmtDetected?'PMT decoded from a bounded MPEG-TS sample.':'No PMT decoded in this bounded sample; this does not prove absence.';}catch{sampleNote='The media sample could not be inspected. Playlist details remain available.';}}
  return jsonResponse({channel:{id:channel.id,name:channel.name},checkedAt:new Date().toISOString(),elapsedMs:Date.now()-started,input:{format:'HLS playback',host:new URL(source).hostname,linkedFeed:!!channel.live_feed_id},live:media.live,variants:master.variants.map(({uri,...v})=>v),selected:selected?{bandwidth:selected.bandwidth,resolution:selected.resolution,frameRate:selected.frameRate,codecs:selected.codecs}:null,audio:master.audio,tracks:transport?.tracks||[],pmtDetected:transport?.pmtDetected||false,sampleNote,events:[...media.events,...(transport?.events||[])],bitrate:transport?.bitrate??null,sampleDuration:transport?.durationSeconds??null,packetCount:transport?.packets||0,invalidSections:transport?.invalidSections||0});
 }catch{return errorResponse('Could not inspect this feed. It may be blocked, timed out, or not valid HLS.',502);}
});
