-- Live moments: an operator presses "Halftime now" (Live TV → Live moments) and players
-- watching that channel ask for one L ad with Steep's moment= (halftime, between_matches,
-- intermission, lobby). Players read the current row in their 10 s channel check; a
-- moment lasts 15 minutes unless ended early. Dev add-on, applied by hand.
create table if not exists public.channel_moments (
  id bigint generated always as identity primary key,
  channel_id bigint not null references public.channels(id) on delete cascade,
  moment text not null check (moment in ('halftime', 'between_matches', 'intermission', 'lobby')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_by uuid default auth.uid(),
  check (expires_at > started_at - interval '1 second')
);
create index if not exists channel_moments_current on public.channel_moments (channel_id, expires_at desc);

alter table public.channel_moments enable row level security;
revoke all on public.channel_moments from public, anon, authenticated;
grant select on public.channel_moments to anon, authenticated;
grant insert, update, delete on public.channel_moments to authenticated;

-- Anyone may see a moment (it's only "halftime on channel X"); only admins start or end one.
drop policy if exists read_all on public.channel_moments;
create policy read_all on public.channel_moments for select to anon, authenticated using (true);
drop policy if exists admin_write on public.channel_moments;
create policy admin_write on public.channel_moments for all to authenticated
  using ((select peep_private.is_admin())) with check ((select peep_private.is_admin()));
