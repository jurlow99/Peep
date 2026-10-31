-- Simulator playback remains available for inspection, excluded from normal totals.
alter table public.live_watch_sessions add column is_test boolean not null default false;
create index live_watch_sessions_test_device_idx on public.live_watch_sessions(device_id) where is_test;
create or replace function peep_private.record_live_viewing(p_session_id uuid,p_token uuid,p_device_id uuid,p_channel_id bigint,p_platform text,p_mode text,p_seconds numeric default 0,p_end boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare v_name text; v_session public.live_watch_sessions%rowtype;
begin
 if p_session_id is null or p_token is null or p_device_id is null or p_platform not in ('tvos','tvos_simulator','web','mobile_web') or p_mode not in ('single','multiview') or p_seconds is null or p_seconds < 0 or p_seconds > 30 then raise exception 'Invalid viewing heartbeat'; end if;
 select * into v_session from public.live_watch_sessions where id=p_session_id for update;
 if found then
   if v_session.ingest_token <> p_token or v_session.device_id <> p_device_id or v_session.user_id is distinct from auth.uid() or v_session.channel_id is distinct from p_channel_id then raise exception 'Invalid viewing session'; end if;
   if v_session.ended_at is not null then return; end if;
   update public.live_watch_sessions set watched_seconds=watched_seconds+least(p_seconds,greatest(0,extract(epoch from (now()-last_ping)))),last_ping=now(),ended_at=case when p_end then now() else null end where id=p_session_id;
 else
   if p_end then return; end if;
   select name into v_name from public.channels where id=p_channel_id and is_active and not coalesce(is_premium,false) and peep_private.can_read_tier(visibility_tier);
   if not found then raise exception 'Channel unavailable'; end if;
   insert into public.live_watch_sessions(id,ingest_token,device_id,user_id,channel_id,channel_name,platform,mode,is_test) values(p_session_id,p_token,p_device_id,auth.uid(),p_channel_id,v_name,case when p_platform='tvos_simulator' then 'tvos' else p_platform end,p_mode,p_platform='tvos_simulator' or exists(select 1 from public.live_watch_sessions where device_id=p_device_id and is_test));
 end if;
end $$;
create function public.live_tv_dashboard_filtered(p_since timestamptz default now()-interval '24 hours',p_include_test boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not peep_private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_since < now()-interval '90 days' or p_since > now() then raise exception 'Invalid reporting window'; end if;
 with selected as (select * from public.live_watch_sessions where started_at>=p_since and (p_include_test or not is_test)),
 active as (select * from public.live_watch_sessions where ended_at is null and last_ping>now()-interval '45 seconds' and (p_include_test or not is_test)),
 per_channel as (select channel_id,channel_name,count(*) as sessions,round(sum(watched_seconds)/3600,2) as hours from selected group by channel_id,channel_name),
 platforms as (select platform,count(*) as sessions,round(sum(watched_seconds)/3600,2) as hours from selected group by platform),
 daily as (select to_char(started_at at time zone 'UTC','YYYY-MM-DD') as day,count(*) as sessions,round(sum(watched_seconds)/3600,2) as hours from selected group by 1)
 select jsonb_build_object(
 'viewers_now',(select count(distinct device_id) from active),
 'streams_now',(select count(*) from active),
 'sessions',(select count(*) from selected),
 'unique_devices',(select count(distinct device_id) from selected),
 'watch_hours',(select round(coalesce(sum(watched_seconds),0)/3600,2) from selected),
 'average_minutes',(select round(coalesce(avg(watched_seconds),0)/60,1) from selected),
 'channels',coalesce((select jsonb_agg(jsonb_build_object('id',c.channel_id,'name',c.channel_name,'sessions',c.sessions,'hours',c.hours,'now',(select count(*) from active a where a.channel_id=c.channel_id)) order by c.hours desc,c.sessions desc) from per_channel c),'[]'::jsonb),
 'platforms',coalesce((select jsonb_agg(to_jsonb(p)) from platforms p),'[]'::jsonb),
 'daily',coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from daily d),'[]'::jsonb),
 'updated_at',now()) into result;
 return result;
end $$;

revoke all on function public.live_tv_dashboard_filtered(timestamptz,boolean) from public,anon;
grant execute on function public.live_tv_dashboard_filtered(timestamptz,boolean) to authenticated;
create or replace function public.live_tv_dashboard(p_since timestamptz default now()-interval '24 hours') returns jsonb
language sql security invoker set search_path='' as $$
 select public.live_tv_dashboard_filtered(p_since,false);
$$;
