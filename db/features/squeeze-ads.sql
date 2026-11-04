-- Squeeze ads (L-bar): a full-screen picture (VAST NonLinear) while the show keeps
-- playing, shrunk to 75% into the top-right corner. Players ask the active `squeeze`
-- tag about every N minutes of playback (Ad rules `squeeze_enabled` /
-- `squeeze_every_minutes` in app_settings.ads_policy), never during or within two
-- minutes after an ad break, never while paused. Apply to dev after pause-ads.sql.
alter table public.vast_tags drop constraint if exists vast_ad_type_valid;
alter table public.vast_tags add constraint vast_ad_type_valid
  check (ad_type = any (array['pre_roll', 'mid_roll', 'post_roll', 'pause', 'squeeze']));
-- [CT] is filled with live or vod by the players.
insert into public.vast_tags (name, tag_url, ad_type, scope, content_id, active, is_test, platforms)
select 'Steep — During the show, everything',
       'https://steep.jurlow99.workers.dev/v1/vast?p=peep-squeeze&channel=[CHANNEL]&show=[SHOW]&genre=[GENRE]&device=[DEVICE]&did=[DEVICE_ID]&lmt=[LMT]&ct=[CT]',
       'squeeze', 'global', null, true, false, array['web', 'tvos']
where not exists (select 1 from public.vast_tags where ad_type = 'squeeze' and tag_url like 'https://steep.jurlow99.workers.dev/%');
-- Peep's own test picture, off by default: switch it on in Monetization → Ads to try the layout.
insert into public.vast_tags (name, tag_url, ad_type, scope, content_id, active, is_test, platforms)
select 'Peep test — During the show (Farris Cola L-bar)',
       'https://cuwdyedmmnpklufduaho.supabase.co/functions/v1/iab-vast-sample?variant=squeeze',
       'squeeze', 'global', null, false, true, array['web', 'tvos']
where not exists (select 1 from public.vast_tags where ad_type = 'squeeze' and tag_url like '%variant=squeeze%');
