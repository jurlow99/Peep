import {corsHeaders,handleCors,errorResponse} from '../_shared/cors.ts';
import {requireAdmin} from '../_shared/supabase.ts';
import {fetchPublicFeed,boundedBytes,decodedFeedStream} from '../_shared/xmltvFetch.ts';
Deno.serve(async req=>{
 const cors=handleCors(req);if(cors)return cors;
 try{await requireAdmin(req);}catch{return errorResponse('Admin access required.',403);}
 try{
  const url=new URL(req.url).searchParams.get('url');if(!url)return errorResponse('URL required.');
  const response=await fetchPublicFeed(url);if(!response.body)throw new Error('Empty feed.');
  const bytes=await boundedBytes(await decodedFeedStream(response));
  return new Response(new TextDecoder().decode(bytes),{headers:{...corsHeaders,'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store'}});
 }catch(e){return errorResponse(e instanceof Error?e.message:'Could not load feed.',502);}
});
