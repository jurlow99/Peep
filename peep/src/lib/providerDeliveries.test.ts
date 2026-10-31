import {expect,it} from 'vitest';
import {deliveryAction} from '../../../supabase/functions/r2-vod/deliveries';
function service(fixtures:any){const writes:any[]=[];return {writes,from(table:string){let operation='read';const q:any={select(){return q;},contains(){return q;},is(){return q;},not(){return q;},ilike(){return q;},eq(){return q;},in(){return q;},order(){return q;},limit(){return q;},single(){return q;},maybeSingle(){return q;},insert(v:any){writes.push({table,v});operation='write';return q;},update(v:any){writes.push({table,v});operation='write';return q;},then(resolve:any){return Promise.resolve({data:operation==='write'?{}:fixtures[table],error:null}).then(resolve);}};return q;}};}
const user={id:'user-a'},req=new Request('https://example.test');
it('denies other providers and admin review to provider accounts',async()=>{
 const s=service({provider_members:[{provider_id:'a'}],provider_deliveries:{id:'d',provider_id:'b',status:'submitted'}});
 expect((await deliveryAction({action:'delivery-assets',id:'d'},user,false,s,req)).status).toBe(404);
 expect(s.writes).toHaveLength(0);
 const own=service({provider_members:[{provider_id:'a'}],provider_deliveries:{id:'d',provider_id:'a',status:'submitted'}});
 expect((await deliveryAction({action:'delivery-review',id:'d',status:'approved'},user,false,own,req)).status).toBe(403);
});
it('strips publication and access settings from provider metadata',async()=>{
 const s=service({provider_members:[{provider_id:'a'}],provider_deliveries:{id:'d',provider_id:'a',status:'draft'}});
 const r=await deliveryAction({action:'delivery-save',id:'d',title:'Film',details:{type:'movie',visibility_tier:'production',show_id:123,status:'published',rights_note:'Agreement 1'}},user,false,s,req);
 expect(r.status).toBe(200);expect(s.writes[0].v.details).not.toHaveProperty('status');expect(s.writes[0].v.details).not.toHaveProperty('visibility_tier');expect(s.writes[0].v.details).not.toHaveProperty('show_id');
});
it('requires verified video and poster before submission',async()=>{
 const s=service({provider_members:[{provider_id:'a'}],provider_deliveries:{id:'d',provider_id:'a',status:'draft',details:{}},r2_vod_uploads:[{asset_role:'video',state:'ready'},{asset_role:'poster',state:'uploading'}]});
 expect((await deliveryAction({action:'delivery-submit',id:'d'},user,false,s,req)).status).toBe(400);expect(s.writes).toHaveLength(0);
});
it('locks submitted metadata and requires feedback for changes',async()=>{
 const s=service({provider_members:[],provider_deliveries:{id:'d',provider_id:'a',status:'submitted'}});
 expect((await deliveryAction({action:'delivery-save',id:'d',title:'Changed'},user,true,s,req)).status).toBe(409);
 expect((await deliveryAction({action:'delivery-review',id:'d',status:'changes_requested',note:''},user,true,s,req)).status).toBe(400);
 expect(s.writes).toHaveLength(0);
});

it('allows account lookup only for admins and returns a clear missing-account error',async()=>{
 const s=service({profiles:[]});
 expect((await deliveryAction({action:'delivery-account-search',email:'person@example.com'},user,false,s,req)).status).toBe(403);
 expect((await deliveryAction({action:'delivery-account-search',email:'person@example.com'},user,true,s,req)).status).toBe(404);
 expect((await deliveryAction({action:'delivery-account-search',email:'person'},user,true,s,req)).status).toBe(400);
});
it('finds an existing account by email without requiring a copied UUID',async()=>{
 const s=service({profiles:[{id:'account-1',email:'person@example.com',full_name:'Provider'}]});
 const r=await deliveryAction({action:'delivery-account-search',email:'person@example.com'},user,true,s,req);
 expect(r.status).toBe(200);expect((await r.json()).account.id).toBe('account-1');
});

it('uses different file requirements for series, trailers and full videos',async()=>{
 const {requiredRoles}=await import('../../../supabase/functions/r2-vod/deliveryTypes');
 expect(requiredRoles('series')).toEqual(['poster']);expect(requiredRoles('trailer')).toEqual(['trailer']);expect(requiredRoles('episode')).toEqual(['video']);
});
it('rejects references to another provider’s series',async()=>{
 const {allowedReference}=await import('../../../supabase/functions/r2-vod/deliveryTypes');
 const s=service({provider_deliveries:{id:'series',provider_id:'other',details:{type:'series'}}});
 expect(await allowedReference(s,'a','delivery:series',['series'])).toBeNull();
});
it('lets a new series submit artwork without requiring an episode video',async()=>{
 const s=service({provider_members:[{provider_id:'a'}],provider_deliveries:{id:'d',provider_id:'a',status:'draft',details:{type:'series',rights_note:'Agreement 1'}},r2_vod_uploads:[{asset_role:'poster',state:'ready'}]});
 expect((await deliveryAction({action:'delivery-submit',id:'d'},user,false,s,req)).status).toBe(200);
 expect(s.writes[0].v.status).toBe('submitted');
});
it('lets a standalone trailer submit without a movie file or poster',async()=>{
 const s=service({provider_members:[{provider_id:'a'}],provider_deliveries:{id:'d',provider_id:'a',status:'draft',details:{type:'trailer',rights_note:'Agreement 1'}},r2_vod_uploads:[{asset_role:'trailer',state:'ready'}]});
 expect((await deliveryAction({action:'delivery-submit',id:'d'},user,false,s,req)).status).toBe(200);
});
it('restricts series assignment to admins',async()=>{
 const s=service({});
 expect((await deliveryAction({action:'delivery-series',providerID:'a',showID:12},user,false,s,req)).status).toBe(403);
 expect(s.writes).toHaveLength(0);
});

it('requires only the episode video when a provider-owned series is selected',async()=>{
 const {requiredRoles}=await import('../../../supabase/functions/r2-vod/deliveryTypes');
 expect(requiredRoles('episode')).not.toContain('poster');
});

it('does not allow submitted deliveries to be deleted',async()=>{
 const s=service({provider_members:[{provider_id:'a'}],provider_deliveries:{id:'d',provider_id:'a',status:'submitted',details:{}}});
 expect((await deliveryAction({action:'delivery-delete',id:'d'},user,false,s,req)).status).toBe(409);expect(s.writes).toHaveLength(0);
});
it('restores an owned deleted draft without deleting its files',async()=>{
 const s=service({provider_members:[{provider_id:'a'}],provider_deliveries:{id:'d',provider_id:'a',status:'draft',details:{},deleted_at:'2026-10-27'}});
 expect((await deliveryAction({action:'delivery-restore',id:'d'},user,false,s,req)).status).toBe(200);expect(s.writes).toEqual([{table:'provider_deliveries',v:{deleted_at:null}}]);
});
it('blocks editing an archived draft until restored',async()=>{
 const s=service({provider_members:[{provider_id:'a'}],provider_deliveries:{id:'d',provider_id:'a',status:'draft',details:{},deleted_at:'2026-10-27'}});
 expect((await deliveryAction({action:'delivery-save',id:'d',title:'Changed'},user,false,s,req)).status).toBe(409);expect(s.writes).toHaveLength(0);
});
