-- Shared curated pairs. Applied to FARRIS dev; deploy before enabling multiview rows elsewhere.
create table public.multiview_packages (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  description text not null default '',
  left_channel_id bigint not null references public.channels(id),
  right_channel_id bigint not null references public.channels(id),
  enabled boolean not null default false,
  position integer not null default 0,
  visibility_tier text not null default 'production' check (visibility_tier in ('production','stage','test')),
  created_at timestamptz not null default now(),
  constraint distinct_multiview_channels check (left_channel_id <> right_channel_id)
);
create index multiview_packages_left_channel_idx on public.multiview_packages(left_channel_id);
create index multiview_packages_right_channel_idx on public.multiview_packages(right_channel_id);
alter table public.multiview_packages enable row level security;
grant select on public.multiview_packages to anon, authenticated;
grant insert, update on public.multiview_packages to authenticated;
create policy catalog_read on public.multiview_packages for select to anon, authenticated
  using (enabled and peep_private.can_read_tier(visibility_tier));
create policy admin_manage on public.multiview_packages for all to authenticated
  using ((select peep_private.is_admin())) with check ((select peep_private.is_admin()));
