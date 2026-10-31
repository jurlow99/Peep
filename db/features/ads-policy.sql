-- Ad rules + tag value checks. Applied to dev 2026-10-31. Prod: not yet.
--
-- * `ads_policy` is one JSON row in app_settings that every player reads (the
--   browser and Apple TV both honour it). Only admins write it.
-- * vast_tags now rejects positions and scopes the players don't know.

alter table public.vast_tags drop constraint if exists vast_ad_type_valid;
alter table public.vast_tags add constraint vast_ad_type_valid
  check (ad_type in ('pre_roll','mid_roll','post_roll'));

alter table public.vast_tags drop constraint if exists vast_scope_valid;
alter table public.vast_tags add constraint vast_scope_valid
  check (scope in ('global','movie','episode','live','multiview'));

drop policy if exists catalog_read on public.app_settings;
create policy catalog_read on public.app_settings for select to anon, authenticated
  using (key in ('maintenance_mode','home_hero','flag_live_now_home','flag_show_podcasts','ads_policy'));

insert into public.app_settings (key, value) values ('ads_policy',
  '{"enabled":true,"min_gap_minutes":30,"live_entry":true,"multiview_entry":true,"midroll_enabled":true,"midroll_min_minutes":20,"midroll_every_minutes":15,"midroll_max_breaks":4,"postroll_enabled":true}')
on conflict (key) do nothing;
