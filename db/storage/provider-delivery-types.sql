-- Admin publication needs row locks and status updates; providers remain read-only under RLS.
grant update on public.provider_deliveries to authenticated;
create policy provider_deliveries_admin_update on public.provider_deliveries for update to authenticated
using ((select peep_private.is_admin())) with check ((select peep_private.is_admin()));
-- After provider-deliveries.sql. Admin-only transactional catalog publication.
create or replace function public.publish_provider_delivery(p_id uuid,p_poster text default null,p_target_ref text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.provider_deliveries; parent public.provider_deliveries; kind text; ref text; source text; target text; target_kind text; vid public.r2_vod_uploads; result jsonb; show_id bigint;
begin
 if peep_private.is_admin() is not true then raise exception 'Admin access required'; end if;
 select * into d from public.provider_deliveries where id=p_id for update;
 if not found then raise exception 'Delivery unavailable'; end if;
 if d.status='published' then return d.published_content; end if;
 if d.status<>'approved' then raise exception 'Approve this delivery first'; end if;
 kind:=coalesce(d.details->>'type','movie');
 if kind in ('episode','trailer') then
  ref:=case when kind='episode' then d.details->>'series_ref' else coalesce(nullif(p_target_ref,''),d.details->>'target_ref') end;
  source:=split_part(ref,':',1);target:=split_part(ref,':',2);
  if source='delivery' then
   select * into parent from public.provider_deliveries where id=target::uuid and provider_id=d.provider_id;
   if not found or parent.status<>'published' then raise exception 'Publish the parent movie or series first'; end if;
   target:=parent.published_content->>'id';target_kind:=parent.published_content->>'type';
  else target_kind:=case when source='series' then 'show' else source end;
  end if;
  if target_kind not in ('show','movie') or (kind='episode' and target_kind<>'show') or target is null then raise exception 'Choose a movie or series for this delivery'; end if;
  if not exists(select 1 from public.content_creators where creator_id=d.provider_id and content_type=target_kind and content_id=target) then raise exception 'Content does not belong to this provider'; end if;
 end if;
 if kind='series' then
  if nullif(p_poster,'') is null then raise exception 'Poster is required'; end if;
  insert into public.shows(title,description,poster,year,category,visibility_tier,is_premium)
   values(d.title,d.details->>'description',p_poster,nullif(d.details->>'year','')::integer,d.details->>'category','production',false) returning id into show_id;
  result:=jsonb_build_object('type','show','id',show_id);
 elsif kind='trailer' then
  select * into vid from public.r2_vod_uploads where delivery_id=d.id and asset_role='trailer' and state='ready' order by created_at desc limit 1;
  if not found then raise exception 'Verified trailer required'; end if;
  ref:='https://cuwdyedmmnpklufduaho.supabase.co/functions/v1/r2-vod/play/'||vid.id;
  if target_kind='show' then update public.shows set trailer_url=ref where id=target::bigint;
  else update public.videos set trailer_url=ref where id=target::uuid; end if;
  if not found then raise exception 'Target content unavailable'; end if;
  result:=jsonb_build_object('type','trailer','id',target,'target_type',target_kind);
 elsif kind in ('movie','episode') then
  select * into vid from public.r2_vod_uploads where delivery_id=d.id and asset_role='video' and state='ready' order by created_at desc limit 1;
  if not found then raise exception 'Verified video required'; end if;
  result:=public.save_uploaded_vod(vid.id,vid.object_key,d.details||jsonb_build_object('title',d.title,'type',kind,'show_id',case when kind='episode' then target else null end,'poster',case when kind='episode' then null else p_poster end,'thumbnail',case when kind='episode' then p_poster else null end,'storage_provider','r2','visibility_tier','production','is_premium',false));
 else raise exception 'Invalid delivery type'; end if;
 if kind<>'trailer' then
  insert into public.content_creators(creator_id,content_id,content_type) values(d.provider_id,result->>'id',result->>'type') on conflict(creator_id,content_id,content_type) do nothing;
 end if;
 update public.provider_deliveries set status='published',published_content=result where id=d.id;
 return result;
end $$;
revoke all on function public.publish_provider_delivery(uuid,text,text) from public,anon;
grant execute on function public.publish_provider_delivery(uuid,text,text) to authenticated;
