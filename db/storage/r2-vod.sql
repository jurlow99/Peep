-- FARRIS dev only, after vod-upload-first.sql. No existing videos moved.
begin;
create table public.r2_vod_uploads (
  id uuid primary key,
  owner_id uuid references auth.users(id) on delete set null,
  bucket text not null,
  object_key text not null unique,
  byte_size bigint not null check (byte_size>0 and byte_size<=10737418240),
  multipart_id text not null,
  state text not null check (state in ('uploading','ready')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index r2_vod_uploads_owner_idx on public.r2_vod_uploads(owner_id);
alter table public.r2_vod_uploads enable row level security;
revoke all on public.r2_vod_uploads from anon,authenticated;
grant select on public.r2_vod_uploads to authenticated;
grant all on public.r2_vod_uploads to service_role;
create policy r2_vod_admin_read on public.r2_vod_uploads for select to authenticated
using ((select peep_private.is_admin()));
-- Only the authenticated admin Edge Function can mark files ready using its
-- server credential after R2 verifies object size/type. Clients cannot forge it.
create or replace function public.save_uploaded_vod(p_upload_id uuid, p_path text, p_details jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  playback_url text;
  found_id text;
  series_id bigint;
  episode_id bigint;
  movie_id uuid;
  poster_url text := nullif(trim(p_details->>'poster'),'');
  content_title text := trim(p_details->>'title');
  kind text := p_details->>'type';
  season_no integer;
  episode_no integer;
begin
  if peep_private.is_admin() is not true then raise exception 'Admin access required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_upload_id::text,0));
  if p_details->>'storage_provider'='r2' then
    if not exists(select 1 from public.r2_vod_uploads where id=p_upload_id and object_key=p_path and state='ready') then
      raise exception 'R2 video upload has not completed verification';
    end if;
    playback_url := 'https://cuwdyedmmnpklufduaho.supabase.co/functions/v1/r2-vod/play/' || p_upload_id::text;
  else
  if p_path !~ ('^inbox/' || p_upload_id::text || '/playback/[a-zA-Z0-9._-]+\.mp4$') then
    raise exception 'Invalid uploaded video';
  end if;
    if not exists(select 1 from storage.objects where bucket_id='vod-playback' and name=p_path) then
      raise exception 'Video upload has not completed';
    end if;
    playback_url := 'https://cuwdyedmmnpklufduaho.supabase.co/storage/v1/object/authenticated/vod-playback/' || p_path;
  end if;
  select id::text into found_id from public.videos where url=playback_url limit 1;
  if found_id is not null then return jsonb_build_object('type','movie','id',found_id); end if;
  select id,show_id into episode_id,series_id from public.episodes where url=playback_url limit 1;
  if episode_id is not null then return jsonb_build_object('type','episode','id',episode_id,'show_id',series_id); end if;
  if content_title is null or content_title='' then raise exception 'Title is required'; end if;
  if kind='movie' then
    if poster_url is null then raise exception 'Poster is required'; end if;
    insert into public.videos(title,description,poster,thumbnail,url,duration,year,category,is_premium,visibility_tier)
    values(content_title,p_details->>'description',poster_url,p_details->>'thumbnail',playback_url,
      p_details->>'duration',nullif(p_details->>'year','')::integer,nullif(p_details->>'category',''),
      coalesce((p_details->>'is_premium')::boolean,false),coalesce(nullif(p_details->>'visibility_tier',''),'production'))
    returning id into movie_id;
    return jsonb_build_object('type','movie','id',movie_id);
  elsif kind='episode' then
    series_id := nullif(p_details->>'show_id','')::bigint;
    if series_id is null then
      if nullif(trim(p_details->>'series_title'),'') is null or poster_url is null then
        raise exception 'Series title and poster are required';
      end if;
      insert into public.shows(title,poster,is_premium,visibility_tier)
      values(trim(p_details->>'series_title'),poster_url,coalesce((p_details->>'is_premium')::boolean,false),
        coalesce(nullif(p_details->>'visibility_tier',''),'production')) returning id into series_id;
    else
      perform 1 from public.shows where id=series_id for update;
      if not found then raise exception 'Series not found'; end if;
      if exists(select 1 from public.shows where id=series_id and nullif(trim(poster),'') is null) then
        if poster_url is null then raise exception 'This series needs a poster'; end if;
        update public.shows set poster=poster_url where id=series_id;
      end if;
    end if;
    season_no := coalesce(nullif(p_details->>'season','')::integer,1);
    episode_no := coalesce(nullif(p_details->>'episode_number','')::integer,1);
    if season_no<1 or episode_no<1 then raise exception 'Season and episode must be positive numbers'; end if;
    if exists(select 1 from public.episodes where show_id=series_id and season=season_no and episode_number=episode_no) then
      raise exception 'That season and episode number already exists. Edit it in Episodes instead.';
    end if;
    insert into public.episodes(show_id,title,description,season,episode_number,url,thumbnail,duration,status,is_premium)
    values(series_id,content_title,p_details->>'description',season_no,episode_no,playback_url,p_details->>'thumbnail',
      p_details->>'duration','approved',coalesce((p_details->>'is_premium')::boolean,false)) returning id into episode_id;
    return jsonb_build_object('type','episode','id',episode_id,'show_id',series_id);
  else raise exception 'Choose Movie or Episode';
  end if;
end;
$$;
revoke all on function public.save_uploaded_vod(uuid,text,jsonb) from public,anon;
grant execute on function public.save_uploaded_vod(uuid,text,jsonb) to authenticated;

commit;
