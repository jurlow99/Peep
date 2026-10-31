import {deliveryKinds,requiredRoles,allowedReference} from './deliveryTypes.ts';
import {jsonResponse,errorResponse} from '../_shared/cors.ts';
export async function deliveryAction(body:any,user:any,admin:boolean,service:any,req:Request){
 const action=body.action;
 const fail=(message:string,status=400)=>errorResponse(message,status);
 if(action==='delivery-series'){
  if(!admin)return fail('Admin access required.',403);
  if(body.showID){
   const {data:provider}=await service.from('creators').select('id').eq('id',body.providerID).maybeSingle();
   const {data:show}=await service.from('shows').select('id').eq('id',body.showID).maybeSingle();
   if(!provider||!show)return fail('Choose an existing provider and series.');
   const {error}=await service.from('content_creators').upsert({creator_id:provider.id,content_id:String(show.id),content_type:'show'},{onConflict:'creator_id,content_id,content_type'});
   if(error)return fail('Could not assign this series.');
  }
  const [shows,links]=await Promise.all([service.from('shows').select('id,title').order('title'),service.from('content_creators').select('creator_id,content_id').eq('content_type','show')]);
  if(shows.error||links.error)return fail('Could not load series assignments.');
  return jsonResponse({series:shows.data||[],links:links.data||[]});
 }
 if(action==='delivery-account-search'){
  if(!admin)return fail('Admin access required.',403);
  const email=String(body.email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return fail('Enter the account’s full email address.');
  const {data,error}=await service.from('profiles').select('id,email,full_name').ilike('email',email.replace(/[\\%_]/g,'\\$&')).limit(2);
  if(error)return fail('Could not look up the account.');
  if(!data?.length)return fail('No Peep account found. Ask the provider to sign up first.',404);
  if(data.length!==1)return fail('Multiple accounts match. Contact support before granting access.',409);
  return jsonResponse({account:data[0]});
 }
 if(action==='delivery-members'){
  if(!admin)return fail('Admin access required.',403);
  if(body.userID){
   const {data:p}=await service.from('profiles').select('id').eq('id',body.userID).maybeSingle();
   const {data:c}=await service.from('creators').select('id').eq('id',body.providerID).maybeSingle();
   if(!p||!c)return fail('Choose an existing provider and account ID.');
   const {error}=body.revoke?await service.from('provider_members').delete().eq('provider_id',body.providerID).eq('user_id',body.userID):await service.from('provider_members').upsert({provider_id:body.providerID,user_id:body.userID});
   if(error)return fail('Could not update provider access.');
  }
  const {data,error}=await service.from('provider_members').select('*');
  if(error)return fail('Could not load access.');
  const ids=[...new Set((data||[]).map((m:any)=>m.user_id))];
  const {data:accounts}=ids.length?await service.from('profiles').select('id,email,full_name').in('id',ids):{data:[]};
  return jsonResponse({members:(data||[]).map((m:any)=>({...m,account:accounts?.find((a:any)=>a.id===m.user_id)||null}))});
 }
 const {data:members,error:memberError}=await service.from('provider_members').select('provider_id').eq('user_id',user.id);
 if(memberError)return fail('Provider access is unavailable.',503);
 const ids=(members||[]).map((m:any)=>m.provider_id);
 if(action==='delivery-list'){
  let query=service.from('provider_deliveries').select('*').order('created_at',{ascending:false}).limit(200);
  query=body.trash?query.not('deleted_at','is',null):query.is('deleted_at',null);
  if(!admin)query=query.in('provider_id',ids);
  const {data,error}=await query;
  if(error)return fail('Could not load deliveries.');
  const {data:providers}=await service.from('creators').select('id,name').in('id',admin?(await service.from('creators').select('id')).data?.map((p:any)=>p.id)||[]:ids);
  let linksQuery=service.from('content_creators').select('creator_id,content_id,content_type').in('content_type',['show','movie']);
  if(!admin)linksQuery=linksQuery.in('creator_id',ids);
  const {data:links}=await linksQuery;
  const showIDs=(links||[]).filter((l:any)=>l.content_type==='show').map((l:any)=>l.content_id);
  const movieIDs=(links||[]).filter((l:any)=>l.content_type==='movie').map((l:any)=>l.content_id);
  const [showResult,movieResult]=await Promise.all([showIDs.length?service.from('shows').select('id,title').in('id',showIDs):{data:[]},movieIDs.length?service.from('videos').select('id,title').in('id',movieIDs):{data:[]}]);
  const catalog=(links||[]).map((l:any)=>{const kind=l.content_type==='show'?'series':'movie';const item=(kind==='series'?showResult.data:movieResult.data)?.find((i:any)=>String(i.id)===l.content_id);return item?{provider_id:l.creator_id,ref:`${kind}:${item.id}`,type:kind,title:item.title}:null;}).filter(Boolean);
  let deliveries=data||[];
  if(admin&&deliveries.length){
   const userIDs=[...new Set(deliveries.map((d:any)=>d.submitted_by).filter(Boolean))];
   const {data:accounts}=await service.from('profiles').select('id,email').in('id',userIDs);
   deliveries=deliveries.map((d:any)=>({...d,submitter_email:accounts?.find((a:any)=>a.id===d.submitted_by)?.email||null}));
  }
  return jsonResponse({deliveries,providers:providers||[],catalog});
 }
 if(action==='delivery-create'){
  if(!admin&&!ids.includes(body.providerID))return fail('Provider access required.',403);
  const title=String(body.title||'').trim();if(!title||title.length>200)return fail('Add a title up to 200 characters.');
  const type=body.type||'movie';if(!deliveryKinds.includes(type))return fail('Choose a delivery type.');
  const details:any={type};
  if(body.seriesRef){if(type!=='episode'||!await allowedReference(service,body.providerID,body.seriesRef,['series']))return fail('Choose one of this provider’s series.');details.series_ref=body.seriesRef;}
  const {data,error}=await service.from('provider_deliveries').insert({provider_id:body.providerID,submitted_by:user.id,title,details}).select().single();
  return error?fail('Could not create delivery.'):jsonResponse({delivery:data});
 }
 const {data:d}=await service.from('provider_deliveries').select('*').eq('id',body.id).maybeSingle();
 if(!d||!admin&&!ids.includes(d.provider_id))return fail('Delivery unavailable.',404);
 if(action==='delivery-delete'||action==='delivery-restore'){
  if(!['draft','changes_requested'].includes(d.status))return fail('Only drafts can be deleted or restored.',409);
  if(action==='delivery-delete'){
   const {data:children,error}=await service.from('provider_deliveries').select('id').eq('provider_id',d.provider_id).contains('details',{series_ref:`delivery:${d.id}`}).is('deleted_at',null).limit(1);
   if(error)return fail('Could not check series episodes.');
   if(children?.length)return fail('Delete the episode drafts in this series first. Submitted episodes must be reviewed before removing their series.',409);
  }else if(d.details.series_ref?.startsWith('delivery:')){
   const {data:parent}=await service.from('provider_deliveries').select('deleted_at').eq('id',d.details.series_ref.slice(9)).maybeSingle();
   if(parent?.deleted_at)return fail('Restore the series draft first.',409);
  }
  const {error}=await service.from('provider_deliveries').update({deleted_at:action==='delivery-delete'?new Date().toISOString():null}).eq('id',d.id).eq('status',d.status);
  return error?fail('Could not update draft.'):jsonResponse({saved:true});
 }
 if(d.deleted_at)return fail('This draft is in Trash. Restore it before editing.',409);
 if(action==='delivery-assets'){
  const {data,error}=await service.from('r2_vod_uploads').select('id,object_key,state,asset_role,byte_size').eq('delivery_id',d.id).order('created_at');
  return error?fail('Could not load files.'):jsonResponse({assets:data});
 }
 if(action==='delivery-save'){
  if(!['draft','changes_requested'].includes(d.status))return fail('This delivery is locked for review.',409);
  const details=body.details||{};
  // Only descriptive metadata; provider input cannot choose access tiers or catalog IDs.
  if(!deliveryKinds.includes(details.type||'movie'))return fail('Choose a delivery type.');
  const safe:any={};for(const key of ['type','series_title','season','episode_number','description','duration','year','category','rights_note','available_from','available_until','territories','series_ref','target_ref'])safe[key]=String(details[key]||'').slice(0,4000);
  safe.type=safe.type||'movie';
  for(const [key,types] of [['series_ref',['series']],['target_ref',['series','movie']]] as any){
   if(safe[key]&&!await allowedReference(service,d.provider_id,safe[key],types))return fail('Choose content belonging to this provider.');
  }
  const title=String(body.title||'').trim();if(!title||title.length>200)return fail('Add a title up to 200 characters.');
  const {error}=await service.from('provider_deliveries').update({title,details:safe}).eq('id',d.id).eq('status',d.status);
  return error?fail('Could not save delivery.'):jsonResponse({saved:true});
 }
 if(action==='delivery-submit'){
  if(!['draft','changes_requested'].includes(d.status))return fail('Delivery is already submitted.',409);
  const {data:assets}=await service.from('r2_vod_uploads').select('asset_role,state').eq('delivery_id',d.id);
  const type=d.details.type||'movie';
  if(requiredRoles(type).some(role=>!assets?.some((a:any)=>a.asset_role===role&&a.state==='ready')))return fail(`Upload the required files: ${requiredRoles(type).join(', ')}.`);
  if(type==='episode'){
   if(!await allowedReference(service,d.provider_id,d.details.series_ref,['series']))return fail('Choose one of your series.');
   if(![d.details.season||1,d.details.episode_number||1].every(n=>Number.isInteger(Number(n))&&Number(n)>0))return fail('Season and episode numbers must be positive whole numbers.');
  }
  if(type==='trailer'&&d.details.target_ref&&!await allowedReference(service,d.provider_id,d.details.target_ref,['series','movie']))return fail('Choose one of your movies or series.');
  if(!d.details.rights_note?.trim())return fail('Add distribution rights and availability information before submitting.');
  const {error}=await service.from('provider_deliveries').update({status:'submitted',submitted_at:new Date().toISOString()}).eq('id',d.id).eq('status',d.status);
  return error?fail('Could not submit.'):jsonResponse({submitted:true});
 }
 if(!admin)return fail('Admin access required.',403);
 if(action==='delivery-review'){
  if(!['submitted','approved'].includes(d.status)||!['approved','changes_requested'].includes(body.status))return fail('Invalid review transition.',409);
  if(body.status==='changes_requested'&&!String(body.note||'').trim())return fail('Tell the provider what needs changing.');
  const {error}=await service.from('provider_deliveries').update({status:body.status,review_note:String(body.note||'').slice(0,4000),reviewed_at:new Date().toISOString()}).eq('id',d.id).eq('status',d.status);
  return error?fail('Could not save review.'):jsonResponse({reviewed:true});
 }
 // Publishing remains in the normal admin upload workflow; review approval alone never publishes.
 return fail('Unknown delivery action.');
}
