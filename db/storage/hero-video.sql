-- Enable only the currently published Home hero trailer for authenticated viewers.
-- Originals/master files remain private; promo artwork/public access is unchanged.
create policy vod_sources_published_hero_select on storage.objects
for select to authenticated
using (
  bucket_id = 'vod-sources'
  and name ~ '^(movies/[a-f0-9-]{36}|series/[0-9]+(/episodes/[0-9]+)?|inbox/[a-f0-9-]{36})/trailers/[a-zA-Z0-9._-]+\.mp4$'
  and exists (
    select 1 from public.app_settings s
    where s.key = 'home_hero'
      and (case when pg_input_is_valid(s.value,'jsonb') then s.value::jsonb else '{}'::jsonb end)->>'enabled' = 'true'
      and split_part((case when pg_input_is_valid(s.value,'jsonb') then s.value::jsonb else '{}'::jsonb end)->>'video_url',
        '/storage/v1/object/authenticated/vod-sources/', 2) = storage.objects.name
  )
);
