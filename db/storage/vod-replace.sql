-- Replace the video file behind an existing movie or episode. The new file is
-- uploaded to the private inbox exactly like Add VOD; this swaps the playback
-- link once the upload has been verified. Admin only (RLS admin_manage).
-- Applied to dev (cuwdyedmmnpklufduaho) by hand on 2026-11-01.
create or replace function public.replace_vod_file(p_type text, p_id text, p_upload_id uuid, p_path text, p_storage_provider text default 'supabase')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  playback_url text;
  previous_url text;
  touched integer;
begin
  if peep_private.is_admin() is not true then raise exception 'Admin access required'; end if;
  if p_type not in ('movie','episode') then raise exception 'Unknown content type'; end if;
  if p_storage_provider='r2' then
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
  if p_type='movie' then
    select url into previous_url from public.videos where id=p_id::uuid;
    update public.videos set url=playback_url where id=p_id::uuid;
  else
    select url into previous_url from public.episodes where id=p_id::bigint;
    update public.episodes set url=playback_url where id=p_id::bigint;
  end if;
  get diagnostics touched = row_count;
  if touched=0 then raise exception 'Title not found'; end if;
  return jsonb_build_object('type',p_type,'id',p_id,'url',playback_url,'previous_url',previous_url);
end $$;
revoke all on function public.replace_vod_file(text,text,uuid,text,text) from public,anon;
grant execute on function public.replace_vod_file(text,text,uuid,text,text) to authenticated;
