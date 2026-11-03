-- Pause ads: a picture (VAST NonLinear) shown while a viewer has paused a movie,
-- episode or channel. Players ask the active `pause` tag after ~2 s paused, once
-- per pause, and hide the picture the moment play resumes. Ad rules carry
-- `pause_enabled` (app_settings.ads_policy). Applied to dev by hand on 2026-11-03.
alter table public.vast_tags drop constraint if exists vast_ad_type_valid;
alter table public.vast_tags add constraint vast_ad_type_valid
  check (ad_type = any (array['pre_roll', 'mid_roll', 'post_roll', 'pause']));
insert into public.vast_tags (name, tag_url, ad_type, scope, content_id, active, is_test, platforms)
select 'Steep — Pause ad, everything',
       'https://steep.jurlow99.workers.dev/v1/vast?p=peep-pause&channel=[CHANNEL]&show=[SHOW]&genre=[GENRE]&device=[DEVICE]&did=[DEVICE_ID]&lmt=[LMT]',
       'pause', 'global', null, true, false, array['web', 'tvos']
where not exists (select 1 from public.vast_tags where ad_type = 'pause' and tag_url like 'https://steep.jurlow99.workers.dev/%');
