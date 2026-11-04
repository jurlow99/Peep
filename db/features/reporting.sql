-- Reporting: on-demand watch sessions (the movie/episode twin of live_watch_sessions)
-- and the admin report RPCs behind Reports → Overview, Channels and MOU.
-- MOU (minutes of usage) = media time actually played. Paused, buffering and ad
-- time are never counted; sessions count on the day they started (in p_tz).
-- Apply to dev after live-viewing.sql and live-viewing-test-activity.sql.

create table public.vod_watch_sessions (
 id uuid primary key,
 ingest_token uuid not null,
 device_id uuid not null,
 user_id uuid references public.profiles(id) on delete set null,
 content_type text not null check (content_type in ('movie','episode')),
 content_id text not null,
 show_id bigint references public.shows(id) on delete set null,
 title text not null,
 platform text not null check (platform in ('tvos','web','mobile_web')),
 started_at timestamptz not null default now(),
 last_ping timestamptz not null default now(),
 ended_at timestamptz,
 watched_seconds numeric not null default 0 check (watched_seconds >= 0),
 is_test boolean not null default false
);
create index vod_watch_sessions_time_idx on public.vod_watch_sessions(started_at desc);
create index vod_watch_sessions_content_idx on public.vod_watch_sessions(content_type,content_id);
create index vod_watch_sessions_show_idx on public.vod_watch_sessions(show_id);
alter table public.vod_watch_sessions enable row level security;
revoke all on public.vod_watch_sessions from public, anon, authenticated;
grant select on public.vod_watch_sessions to authenticated;
create policy admin_read on public.vod_watch_sessions for select to authenticated using ((select peep_private.is_admin()));

create function peep_private.record_vod_viewing(p_session_id uuid,p_token uuid,p_device_id uuid,p_content_type text,p_content_id text,p_platform text,p_seconds numeric default 0,p_end boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare v_title text; v_show bigint; v_session public.vod_watch_sessions%rowtype;
begin
 if p_session_id is null or p_token is null or p_device_id is null or p_content_type not in ('movie','episode') or coalesce(p_content_id,'')=''
    or p_platform not in ('tvos','tvos_simulator','web','mobile_web') or p_seconds is null or p_seconds < 0 or p_seconds > 30 then raise exception 'Invalid viewing heartbeat'; end if;
 select * into v_session from public.vod_watch_sessions where id=p_session_id for update;
 if found then
   if v_session.ingest_token <> p_token or v_session.device_id <> p_device_id or v_session.user_id is distinct from auth.uid()
      or v_session.content_type <> p_content_type or v_session.content_id <> p_content_id then raise exception 'Invalid viewing session'; end if;
   if v_session.ended_at is not null then return; end if;
   update public.vod_watch_sessions set watched_seconds=watched_seconds+least(p_seconds,greatest(0,extract(epoch from (now()-last_ping)))),last_ping=now(),ended_at=case when p_end then now() else null end where id=p_session_id;
 else
   if p_end then return; end if;
   if p_content_type='movie' and p_content_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
     select title into v_title from public.videos where id=p_content_id::uuid and peep_private.can_read_content(visibility_tier,is_premium);
   elsif p_content_type='episode' and p_content_id ~ '^[0-9]{1,18}$' then
     select e.title,e.show_id into v_title,v_show from public.episodes e join public.shows s on s.id=e.show_id
      where e.id=p_content_id::bigint and e.status='approved' and peep_private.can_read_content(s.visibility_tier,s.is_premium) and peep_private.can_read_content('production',e.is_premium);
   end if;
   if v_title is null then raise exception 'Title unavailable'; end if;
   insert into public.vod_watch_sessions(id,ingest_token,device_id,user_id,content_type,content_id,show_id,title,platform,is_test)
   values(p_session_id,p_token,p_device_id,auth.uid(),p_content_type,p_content_id,v_show,v_title,case when p_platform='tvos_simulator' then 'tvos' else p_platform end,
     p_platform='tvos_simulator' or exists(select 1 from public.live_watch_sessions where device_id=p_device_id and is_test));
 end if;
end $$;
revoke all on function peep_private.record_vod_viewing(uuid,uuid,uuid,text,text,text,numeric,boolean) from public;
grant execute on function peep_private.record_vod_viewing(uuid,uuid,uuid,text,text,text,numeric,boolean) to anon,authenticated;
create function public.record_vod_viewing(p_session_id uuid,p_token uuid,p_device_id uuid,p_content_type text,p_content_id text,p_platform text,p_seconds numeric default 0,p_end boolean default false)
returns void language sql security invoker set search_path='' as $$ select peep_private.record_vod_viewing(p_session_id,p_token,p_device_id,p_content_type,p_content_id,p_platform,p_seconds,p_end); $$;
revoke all on function public.record_vod_viewing(uuid,uuid,uuid,text,text,text,numeric,boolean) from public;
grant execute on function public.record_vod_viewing(uuid,uuid,uuid,text,text,text,numeric,boolean) to anon,authenticated;

-- Every play in one shape: live channel sessions and on-demand sessions. Episodes
-- report under their series. Admin-only through the tables' RLS (security invoker).
create function peep_private.report_plays(p_from timestamptz,p_to timestamptz,p_include_test boolean)
returns table(kind text,item_id text,item_name text,device_id uuid,user_id uuid,platform text,started_at timestamptz,seconds numeric)
language sql stable security invoker set search_path='' as $$
 select 'channel',l.channel_id::text,coalesce(c.name,l.channel_name),l.device_id,l.user_id,l.platform,l.started_at,l.watched_seconds
  from public.live_watch_sessions l left join public.channels c on c.id=l.channel_id
  where l.started_at>=p_from and l.started_at<p_to and (p_include_test or not l.is_test)
 union all
 select case when v.content_type='episode' then 'series' else 'movie' end,
   case when v.content_type='episode' then coalesce(v.show_id::text,'') else v.content_id end,
   case when v.content_type='episode' then coalesce(s.title,v.title) else coalesce(m.title,v.title) end,
   v.device_id,v.user_id,v.platform,v.started_at,v.watched_seconds
  from public.vod_watch_sessions v
  left join public.shows s on s.id=v.show_id
  left join public.videos m on v.content_type='movie' and m.id::text=v.content_id
  where v.started_at>=p_from and v.started_at<p_to and (p_include_test or not v.is_test);
$$;
revoke all on function peep_private.report_plays(timestamptz,timestamptz,boolean) from public,anon;
grant execute on function peep_private.report_plays(timestamptz,timestamptz,boolean) to authenticated;

create function peep_private.report_window(p_from timestamptz,p_to timestamptz) returns void
language plpgsql stable set search_path='' as $$
begin
 if not peep_private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval '400 days' then raise exception 'Invalid reporting window'; end if;
end $$;
revoke all on function peep_private.report_window(timestamptz,timestamptz) from public,anon;
grant execute on function peep_private.report_window(timestamptz,timestamptz) to authenticated;

-- Reports → Overview: headline MOU, audience, the same numbers for the previous
-- period of equal length, a daily series, platforms, hour of day and top items.
create function public.platform_report(p_from timestamptz,p_to timestamptz,p_include_test boolean default false,p_tz text default 'UTC') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; v_prev timestamptz := p_from-(p_to-p_from);
begin
 perform peep_private.report_window(p_from,p_to);
 with plays as (select * from peep_private.report_plays(v_prev,p_to,p_include_test)),
 cur as (select * from plays where started_at>=p_from),
 prev as (select * from plays where started_at<p_from),
 totals as (select
   round(coalesce(sum(seconds),0)/60) as minutes,
   round(coalesce(sum(seconds) filter (where kind='channel'),0)/60) as live_minutes,
   round(coalesce(sum(seconds) filter (where kind<>'channel'),0)/60) as vod_minutes,
   count(*) as sessions, count(distinct device_id) as devices, count(distinct user_id) as viewers from cur),
 prev_totals as (select round(coalesce(sum(seconds),0)/60) as minutes, count(*) as sessions, count(distinct device_id) as devices, count(distinct user_id) as viewers from prev),
 daily as (select to_char(started_at at time zone p_tz,'YYYY-MM-DD') as day,
   round(coalesce(sum(seconds) filter (where kind='channel'),0)/60) as live_minutes,
   round(coalesce(sum(seconds) filter (where kind<>'channel'),0)/60) as vod_minutes,
   count(distinct device_id) as devices from cur group by 1),
 platforms as (select platform,round(sum(seconds)/60) as minutes,count(distinct device_id) as devices from cur group by platform),
 hours as (select extract(hour from started_at at time zone p_tz)::int as hour,round(sum(seconds)/60) as minutes from cur group by 1),
 items as (select kind,item_id,max(item_name) as name,round(sum(seconds)/60) as minutes,count(*) as sessions,count(distinct device_id) as devices from cur group by kind,item_id)
 select jsonb_build_object(
  'totals',(select to_jsonb(t)||jsonb_build_object('minutes_per_device',case when t.devices>0 then round(t.minutes/t.devices,1) else 0 end) from totals t),
  'previous',(select to_jsonb(p) from prev_totals p),
  'signups',(select count(*) from public.profiles where created_at>=p_from and created_at<p_to),
  'ad_impressions',(select count(*) from public.ad_impressions where event='impression' and created_at>=p_from and created_at<p_to and (p_include_test or not is_test)),
  'daily',coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from daily d),'[]'),
  'platforms',coalesce((select jsonb_agg(to_jsonb(p) order by p.minutes desc) from platforms p),'[]'),
  'hours',coalesce((select jsonb_agg(to_jsonb(h) order by h.hour) from hours h),'[]'),
  'top_channels',coalesce((select jsonb_agg(to_jsonb(i) order by i.minutes desc) from (select * from items where kind='channel' order by minutes desc limit 10) i),'[]'),
  'top_titles',coalesce((select jsonb_agg(to_jsonb(i) order by i.minutes desc) from (select * from items where kind<>'channel' order by minutes desc limit 10) i),'[]'),
  'updated_at',now()) into result;
 return result;
end $$;
revoke all on function public.platform_report(timestamptz,timestamptz,boolean,text) from public,anon;
grant execute on function public.platform_report(timestamptz,timestamptz,boolean,text) to authenticated;

-- Reports → Channels: every channel (watched or not) with MOU, share of live
-- minutes, reach, time spent, average minute audience (AMA = minutes ÷ minutes in
-- the window), its busiest hour, platform split and a daily MOU series.
create function public.channel_report(p_from timestamptz,p_to timestamptz,p_include_test boolean default false,p_tz text default 'UTC') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; v_window_minutes numeric := extract(epoch from (least(p_to,now())-p_from))/60;
begin
 perform peep_private.report_window(p_from,p_to);
 with plays as (select * from peep_private.report_plays(p_from,p_to,p_include_test) where kind='channel'),
 live_total as (select greatest(coalesce(sum(seconds),0),1) as seconds from plays),
 per as (select item_id,round(sum(seconds)/60) as minutes,count(*) as sessions,count(distinct device_id) as devices,count(distinct user_id) as viewers,sum(seconds) as seconds from plays group by item_id),
 by_hour as (select distinct on (item_id) item_id,extract(hour from started_at at time zone p_tz)::int as hour from plays group by item_id,2 order by item_id,sum(seconds) desc),
 by_platform as (select item_id,jsonb_object_agg(platform,minutes) as platforms from (select item_id,platform,round(sum(seconds)/60) as minutes from plays group by 1,2) x group by item_id),
 by_day as (select item_id,jsonb_agg(jsonb_build_object('day',day,'minutes',minutes) order by day) as daily from (select item_id,to_char(started_at at time zone p_tz,'YYYY-MM-DD') as day,round(sum(seconds)/60) as minutes from plays group by 1,2) x group by item_id),
 rows as (
  select c.id,c.name,c.is_active,coalesce(p.minutes,0) as minutes,coalesce(p.sessions,0) as sessions,coalesce(p.devices,0) as devices,coalesce(p.viewers,0) as viewers,
   round(coalesce(p.seconds,0)/(select seconds from live_total)*100,1) as share,
   case when p.sessions>0 then round(p.seconds/60/p.sessions,1) else 0 end as minutes_per_session,
   case when p.devices>0 then round(p.seconds/60/p.devices,1) else 0 end as minutes_per_device,
   case when v_window_minutes>0 then round(coalesce(p.seconds,0)/60/v_window_minutes,2) else 0 end as ama,
   h.hour as peak_hour,coalesce(b.platforms,'{}') as platforms,coalesce(d.daily,'[]') as daily
  from public.channels c left join per p on p.item_id=c.id::text left join by_hour h on h.item_id=c.id::text
  left join by_platform b on b.item_id=c.id::text left join by_day d on d.item_id=c.id::text)
 select jsonb_build_object('channels',coalesce((select jsonb_agg(to_jsonb(r) order by r.minutes desc,r.name) from rows r),'[]'),'updated_at',now()) into result;
 return result;
end $$;
revoke all on function public.channel_report(timestamptz,timestamptz,boolean,text) from public,anon;
grant execute on function public.channel_report(timestamptz,timestamptz,boolean,text) to authenticated;

-- Reports → MOU: minutes of usage per channel, movie and series for a window
-- (normally one calendar month), with the content partner that delivered it.
create function public.mou_report(p_from timestamptz,p_to timestamptz,p_include_test boolean default false) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 perform peep_private.report_window(p_from,p_to);
 with plays as (select * from peep_private.report_plays(p_from,p_to,p_include_test)),
 per as (select kind,item_id,max(item_name) as name,round(sum(seconds)/60) as minutes,count(*) as sessions,count(distinct device_id) as devices,count(distinct user_id) as viewers from plays group by kind,item_id),
 owners as (select cc.content_type,cc.content_id,string_agg(distinct cr.name,', ') as partner from public.content_creators cc join public.creators cr on cr.id=cc.creator_id group by 1,2)
 select jsonb_build_object(
  'total_minutes',(select coalesce(sum(minutes),0) from per),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('kind',p.kind,'id',p.item_id,'name',p.name,'partner',o.partner,'minutes',p.minutes,'sessions',p.sessions,'devices',p.devices,'viewers',p.viewers) order by p.minutes desc,p.name)
   from per p left join owners o on o.content_type=case p.kind when 'series' then 'show' when 'movie' then 'movie' end and o.content_id=p.item_id),'[]'),
  'updated_at',now()) into result;
 return result;
end $$;
revoke all on function public.mou_report(timestamptz,timestamptz,boolean) from public,anon;
grant execute on function public.mou_report(timestamptz,timestamptz,boolean) to authenticated;
