export const deliveryKinds=['movie','series','episode','trailer'];
export function requiredRoles(type:string){return type==='series'?['poster']:type==='trailer'?['trailer']:type==='episode'?['video']:['video','poster'];}
export async function allowedReference(service:any,providerID:string,reference:string,types:string[]){
 const [source,id]=String(reference||'').split(':');
 if(source==='delivery'){
  const {data:d}=await service.from('provider_deliveries').select('id,provider_id,title,details,status,published_content,deleted_at').eq('id',id).maybeSingle();
  return d&&!d.deleted_at&&d.provider_id===providerID&&types.includes(d.details.type)?d:null;
 }
 if(!types.includes(source)||!id)return null;
 const type=source==='series'?'show':source;
 const {data:link}=await service.from('content_creators').select('content_id').eq('creator_id',providerID).eq('content_type',type).eq('content_id',id).maybeSingle();
 if(!link)return null;
 const {data:item}=await service.from(source==='series'?'shows':'videos').select('id,title').eq('id',id).maybeSingle();
 return item?{...item,details:{type:source},published_content:{id:item.id,type:source==='series'?'show':source},status:'published'}:null;
}
