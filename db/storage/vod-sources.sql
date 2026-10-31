-- FARRIS dev: immutable private VOD originals. Does not change viewer playback.
-- Reuses the existing audited admin helper; no new privileged function.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vod-sources', 'vod-sources', false, 52428800,
  array['video/mp4','video/quicktime','video/webm','video/x-matroska',
        'image/jpeg','image/png','image/webp','text/vtt','application/x-subrip','text/plain'])
on conflict (id) do nothing;

create policy vod_sources_admin_select on storage.objects for select to authenticated
using (bucket_id = 'vod-sources' and (select peep_private.is_admin()));

create policy vod_sources_admin_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'vod-sources' and (select peep_private.is_admin())
  and name ~ '^(movies/[a-f0-9-]{36}|series/[0-9]+(/episodes/[0-9]+)?|inbox/[a-f0-9-]{36})/(masters|trailers|artwork|captions)/[a-zA-Z0-9._-]+$'
);
-- No UPDATE/DELETE: replacement uploads get a new versioned name.
commit;

-- Finished MP4 renditions. Catalog RLS controls who may sign a playback URL.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('vod-playback','vod-playback',false,52428800,array['video/mp4'])
on conflict(id) do nothing;
create policy vod_playback_admin_insert on storage.objects for insert to authenticated
with check(bucket_id='vod-playback' and (select peep_private.is_admin())
  and name ~ '^(movies/[a-f0-9-]{36}|series/[0-9]+/episodes/[0-9]+)/playback/[a-zA-Z0-9._-]+\.mp4$');
create policy vod_playback_authorized_select on storage.objects for select to authenticated
using(bucket_id='vod-playback' and (
  (select peep_private.is_admin())
  or exists(select 1 from public.videos v where split_part(v.url,'/storage/v1/object/authenticated/vod-playback/',2)=storage.objects.name)
  or exists(select 1 from public.episodes e where split_part(e.url,'/storage/v1/object/authenticated/vod-playback/',2)=storage.objects.name)
));
-- Catalog subqueries run as the requester, preserving premium/tier/approval RLS.
-- No anon SELECT, no UPDATE/DELETE, and no access to masters through this policy.
commit;
