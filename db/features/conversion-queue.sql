-- Files the importer flagged as unplayable (.mkv, .webm, AV1/HEVC MP4s), kept as a
-- to-do list on the Add VOD page so the owner can hand them over for converting.
-- Admin only. Applied to dev (cuwdyedmmnpklufduaho) by hand on 2026-11-01.
create table if not exists public.conversion_queue (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,          -- folder path as picked, e.g. "South Park/Season 02/ep01 Title.mkv"
  name text not null,
  bytes bigint,
  reason text,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  done_at timestamptz
);
alter table public.conversion_queue enable row level security;
revoke all on public.conversion_queue from public, anon, authenticated;
grant select, insert, update, delete on public.conversion_queue to authenticated;
grant all on public.conversion_queue to service_role;
drop policy if exists conversion_queue_admin on public.conversion_queue;
create policy conversion_queue_admin on public.conversion_queue for all to authenticated
  using (peep_private.is_admin()) with check (peep_private.is_admin());
