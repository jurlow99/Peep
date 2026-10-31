import {deliveryAction} from './deliveries.ts';
import {AwsClient} from 'npm:aws4fetch@1.0.20';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {handleCors,jsonResponse,errorResponse} from '../_shared/cors.ts';
import {getServiceClient,requireUser} from '../_shared/supabase.ts';
const MAX_SIZE=10*1024**3,PART_SIZE=16*1024**2;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const xml=(value:string)=>value.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));
const tag=(source:string,name:string)=>source.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.replace(/&quot;/g,'"').replace(/&amp;/g,'&');
Deno.serve(async req=>{
  const cors=handleCors(req);if(cors)return cors;
  if(req.method!=='POST')return errorResponse('POST required',405);
  const service=getServiceClient();
  let user;
  try{user=await requireUser(req,service);}catch{return errorResponse('Sign in to continue.',401);}
  let body;
  try{body=await req.json();}catch{return errorResponse('Invalid request',400);}
  const {data:profile}=await service.from('profiles').select('role').eq('id',user.id).maybeSingle();
  const admin=profile?.role==='admin';
  const action=body.action;
  if(action?.startsWith('delivery-')&&action!=='delivery-publish')return await deliveryAction(body,user,admin,service,req);
  let delivery:any=null;
  if(body.deliveryID){
    const {data:d}=await service.from('provider_deliveries').select('*').eq('id',body.deliveryID).maybeSingle();
    const {data:membership}=await service.from('provider_members').select('provider_id').eq('provider_id',d?.provider_id||'00000000-0000-0000-0000-000000000000').eq('user_id',user.id).maybeSingle();
    if(!d||d.deleted_at||!admin&&!membership)return errorResponse('Delivery access required.',403);
    delivery=d;
    if(['create','part','complete'].includes(action)&&!['draft','changes_requested'].includes(d.status))return errorResponse('Delivery is locked for review.',409);
  }
  if(action!=='playback'&&!admin&&!delivery)return errorResponse('Provider or admin access required.',403);
  const account=Deno.env.get('R2_ACCOUNT_ID'),access=Deno.env.get('R2_ACCESS_KEY_ID'),secret=Deno.env.get('R2_SECRET_ACCESS_KEY'),bucket=Deno.env.get('R2_BUCKET_NAME');
  const configured=!!(account&&/^[a-f0-9]{32}$/.test(account)&&access&&secret&&bucket&&/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket));
  if(action==='status')return jsonResponse({configured,maxSize:MAX_SIZE,partSize:PART_SIZE});
  if(!configured)return errorResponse('R2 needs setup: private bucket, CORS and server credentials.',503);
  const aws=new AwsClient({accessKeyId:access!,secretAccessKey:secret!,service:'s3',region:'auto'});
  const endpoint=`https://${account}.r2.cloudflarestorage.com`;
  const objectURL=(key:string)=>`${endpoint}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const queryURL=(key:string,query:Record<string,string>)=>{const url=new URL(objectURL(key));for(const[k,v]of Object.entries(query))url.searchParams.set(k,v);return url.toString();};
  const fetchS3=(url:string,init:RequestInit={})=>aws.fetch(url,{...init,signal:AbortSignal.timeout(25000)});
  const assetType=(role:string,name:string)=>role==='poster'||role==='hero'?(name.endsWith('.png')?'image/png':name.endsWith('.webp')?'image/webp':'image/jpeg'):role==='captions'?'text/vtt':'video/mp4';
  async function ready(row:any){
    const head=await fetchS3(objectURL(row.object_key),{method:'HEAD'});
    if(!head.ok||Number(head.headers.get('content-length'))!==Number(row.byte_size)||head.headers.get('content-type')?.split(';')[0]!==assetType(row.asset_role,row.object_key))return false;
    const {error}=await service.from('r2_vod_uploads').update({state:'ready',completed_at:new Date().toISOString()}).eq('id',row.id);
    if(error)throw new Error('Could not verify upload. Retry completion.');return true;
  }
  try{
    if(action==='delivery-publish'){
      if(!admin)return errorResponse('Admin access required.',403);
      const {data:d}=await service.from('provider_deliveries').select('*').eq('id',body.id).maybeSingle();
      if(d?.status==='published')return jsonResponse({published:d.published_content});
      if(d?.status!=='approved')return errorResponse('Approve this delivery before publishing.',409);
      const {data:assets}=await service.from('r2_vod_uploads').select('*').eq('delivery_id',d.id).eq('state','ready').order('created_at',{ascending:false});
      const kind=d.details.type||'movie';
      const poster=assets?.find((a:any)=>a.asset_role==='poster');
      let posterURL=null;
      if(['movie','series'].includes(kind)&&!poster)return errorResponse('A verified poster is required.',409);
      if(kind!=='trailer'&&poster){
        const image=await fetchS3(objectURL(poster.object_key));if(!image.ok)throw new Error('Poster unavailable.');
        const artPath=`hero/providers/${d.provider_id}/${poster.id}.${poster.object_key.split('.').pop()}`;
        const {error:artError}=await service.storage.from('promo-images').upload(artPath,await image.arrayBuffer(),{contentType:assetType(poster.asset_role,poster.object_key),upsert:true});
        if(artError)throw new Error('Could not publish poster.');
        posterURL=service.storage.from('promo-images').getPublicUrl(artPath).data.publicUrl;
      }
      const caller=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization')!}},auth:{persistSession:false}});
      const {data:content,error:publishError}=await caller.rpc('publish_provider_delivery',{p_id:d.id,p_poster:posterURL,p_target_ref:body.targetRef||null});
      if(publishError)return errorResponse(publishError.message,400);
      return jsonResponse({published:content});
    }
    if(!UUID.test(body.id||''))return errorResponse('Invalid upload ID.',400);
    if(action==='create'){
      const role=delivery?body.assetRole||'video':null;
      const validName=!role||role==='video'||role==='trailer'?/\.mp4$/i.test(body.name||''):role==='poster'||role==='hero'?/\.(jpg|jpeg|png|webp)$/i.test(body.name||''):role==='captions'?/\.vtt$/i.test(body.name||''):false;
      const limit=role&&['poster','hero','captions'].includes(role)?10*1024**2:MAX_SIZE;
      if(!Number.isSafeInteger(body.size)||body.size<1||body.size>limit||!validName)return errorResponse('Choose an allowed file: MP4 up to 10 GiB, or artwork/WebVTT up to 10 MiB.',400);
      const {data:existing,error:lookupError}=await service.from('r2_vod_uploads').select('*').eq('id',body.id).maybeSingle();
      if(lookupError)throw new Error('Upload registry unavailable.');
      if(existing){
        if(existing.owner_id!==user.id||Number(existing.byte_size)!==body.size||existing.bucket!==bucket||(existing.delivery_id||null)!==(delivery?.id||null))return errorResponse('Upload identity does not match.',409);
        return jsonResponse({id:existing.id,path:existing.object_key,partSize:PART_SIZE,complete:existing.state==='ready'});
      }
      const name=String(body.name).normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(-160).replace(/\.([^.]+)$/,(_,ext)=>'.'+ext.toLowerCase());
      const providerID=delivery?.provider_id||body.providerID||null;
      if(providerID){
        if(!UUID.test(providerID))return errorResponse('Choose a valid content provider.',400);
        const {data:provider,error:providerError}=await service.from('creators').select('id').eq('id',providerID).maybeSingle();
        if(providerError||!provider)return errorResponse('Content provider not found.',400);
      }
      const key=`providers/${providerID||'peep'}/deliveries/${delivery?.id||body.id}/${role||'playback'}/${body.id}-${name}`;
      const response=await fetchS3(queryURL(key,{uploads:''}),{method:'POST',headers:{'content-type':assetType(role,name)}});
      if(!response.ok)throw new Error('R2 could not start the upload. Check bucket credentials.');
      const uploadID=tag(await response.text(),'UploadId');if(!uploadID)throw new Error('Invalid R2 upload response.');
      const {error}=await service.from('r2_vod_uploads').insert({id:body.id,owner_id:user.id,bucket,object_key:key,byte_size:body.size,multipart_id:uploadID,state:'uploading',delivery_id:delivery?.id||null,asset_role:role});
      if(error){await fetchS3(queryURL(key,{uploadId:uploadID}),{method:'DELETE'});throw new Error('Upload registry could not be saved. Retry.');}
      return jsonResponse({id:body.id,path:key,partSize:PART_SIZE,complete:false});
    }
    const {data:row,error}=await service.from('r2_vod_uploads').select('*').eq('id',body.id).maybeSingle();
    if(error||!row||row.bucket!==bucket)return errorResponse('Video unavailable.',404);
    if(row.delivery_id){
      if(delivery?.id!==row.delivery_id&&!admin&&(action!=='playback'||delivery))return errorResponse('Delivery access required.',403);
    }else if(delivery)return errorResponse('File is not in this delivery.',403);
    if(action==='playback'){
      if(row.state!=='ready')return errorResponse('Video upload is not complete.',409);
      if(!admin&&!delivery){
        const caller=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization')!}},auth:{persistSession:false}});
        const reference=`${Deno.env.get('SUPABASE_URL')}/functions/v1/r2-vod/play/${row.id}`;
        const [movies,episodes,shows]=await Promise.all([caller.from('videos').select('id').or(`url.eq.${reference},trailer_url.eq.${reference}`).limit(1),caller.from('episodes').select('id').eq('url',reference).limit(1),caller.from('shows').select('id').eq('trailer_url',reference).limit(1)]);
        if(movies.error||episodes.error||shows.error||(!movies.data?.length&&!episodes.data?.length&&!shows.data?.length))return errorResponse('Your account does not have access to this video.',403);
      }
      const expires=Math.max(60,Math.min(21600,Number(body.expiresIn)||21600));
      const url=queryURL(row.object_key,{'X-Amz-Expires':String(Math.floor(expires))});
      const signed=await aws.sign(url,{method:'GET',aws:{signQuery:true}});
      return jsonResponse({signedURL:signed.url});
    }
    if(row.owner_id!==user.id)return errorResponse('This upload belongs to another admin.',403);
    if(action==='part'){
      if(row.state!=='uploading')return errorResponse('Upload is already complete.',409);
      if(!Number.isInteger(body.part)||body.part<1||body.part>Math.ceil(Number(row.byte_size)/PART_SIZE))return errorResponse('Invalid part.',400);
      const signed=await aws.sign(queryURL(row.object_key,{uploadId:row.multipart_id,partNumber:String(body.part),'X-Amz-Expires':'900'}),{method:'PUT',headers:{'content-type':'application/octet-stream'},aws:{signQuery:true,allHeaders:true}});
      return jsonResponse({url:signed.url});
    }
    if(action==='complete'){
      if(row.state==='ready')return jsonResponse({complete:true,path:row.object_key});
      // A lost completion response is safe to retry: verify the final object first.
      if(await ready(row))return jsonResponse({complete:true,path:row.object_key});
      const listed=await fetchS3(queryURL(row.object_key,{uploadId:row.multipart_id}),{method:'GET'});
      if(!listed.ok)throw new Error('Could not read uploaded parts. Retry the upload.');
      const source=await listed.text();
      const parts=[...source.matchAll(/<Part>([\s\S]*?)<\/Part>/g)].map(match=>({number:Number(tag(match[1],'PartNumber')),etag:tag(match[1],'ETag')||'',size:Number(tag(match[1],'Size'))}));
      const count=Math.ceil(Number(row.byte_size)/PART_SIZE);
      if(tag(source,'IsTruncated')==='true'||parts.length!==count||parts.some((p,i)=>p.number!==i+1||p.size!==Math.min(PART_SIZE,Number(row.byte_size)-i*PART_SIZE)||!/^"?[a-f0-9]{32}"?$/i.test(p.etag)))return errorResponse('Upload is incomplete. Resume it before saving.',409);
      const payload=`<CompleteMultipartUpload>${parts.map(p=>`<Part><PartNumber>${p.number}</PartNumber><ETag>${xml(p.etag)}</ETag></Part>`).join('')}</CompleteMultipartUpload>`;
      const completed=await fetchS3(queryURL(row.object_key,{uploadId:row.multipart_id}),{method:'POST',headers:{'content-type':'application/xml'},body:payload});
      if(!completed.ok||(await completed.text()).includes('<Error>'))throw new Error('R2 could not finish the upload. Retry completion.');
      if(!await ready(row))throw new Error('Uploaded video did not pass verification.');
      return jsonResponse({complete:true,path:row.object_key});
    }
    return errorResponse('Unknown action.',400);
  }catch(e){return errorResponse(e instanceof Error?e.message:'R2 request failed.',502);}
});
