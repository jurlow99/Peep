-- Staff accounts with roles. Every staff member is role='admin' for RLS (the
-- catalog policies key off peep_private.is_admin()); staff_role says what the admin
-- UI shows them and who may manage other staff:
--   owner  · everything, including other owners
--   admin  · everything except owners
--   editor · content, curation and Live TV screens only
-- Roles are changed only by the manage-staff edge function (service role).
-- Applied to dev (cuwdyedmmnpklufduaho) by hand on 2026-11-01.

alter table public.profiles add column if not exists staff_role text
  check (staff_role in ('owner', 'admin', 'editor'));

create table if not exists public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null check (role in ('owner', 'admin', 'editor')),
  invited_by uuid references public.profiles(id) on delete set null,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
alter table public.staff_invitations enable row level security;
revoke all on public.staff_invitations from public, anon, authenticated;
grant select on public.staff_invitations to authenticated;
grant all on public.staff_invitations to service_role;
drop policy if exists staff_read on public.staff_invitations;
create policy staff_read on public.staff_invitations for select to authenticated using (peep_private.is_admin());

-- The caller's staff role, or null for non-staff. Legacy admins without a
-- staff_role count as 'admin' so nobody is locked out.
create or replace function peep_private.staff_role() returns text
language sql stable security definer set search_path = '' as $$
  select case when role = 'admin' or is_admin then coalesce(staff_role, 'admin') end
  from public.profiles where id = auth.uid()
$$;
revoke all on function peep_private.staff_role() from public, anon;
grant execute on function peep_private.staff_role() to authenticated;

-- Entitlements (role, is_admin, staff_role) change only through the service
-- role now; admins keep the ability to set a viewer's access_tier.
create or replace function public.guard_profile_entitlements() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.role <> 'viewer' or new.is_admin or new.staff_role is not null then
        raise exception 'Profile entitlements are server-managed' using errcode = '42501';
      end if;
      if not peep_private.is_admin() and new.access_tier <> 'production' then
        raise exception 'Profile entitlements are server-managed' using errcode = '42501';
      end if;
    else
      if new.role is distinct from old.role or new.is_admin is distinct from old.is_admin
         or new.staff_role is distinct from old.staff_role or new.id is distinct from old.id then
        raise exception 'Profile entitlements are server-managed' using errcode = '42501';
      end if;
      if not peep_private.is_admin() and new.access_tier is distinct from old.access_tier then
        raise exception 'Profile entitlements are server-managed' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;

-- The account that built the platform is the first owner.
update public.profiles set staff_role = 'owner'
where email = 'jurlow99@gmail.com' and (role = 'admin' or is_admin) and staff_role is null;
