-- Test vs Production regions for curation.
-- Existing rows default to 'production' so nothing disappears from the live site.
-- New rows created in admin default to 'test' (see EMPTY_CAROUSEL) until published.

alter table public.carousels
  add column if not exists environment text not null default 'production';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'carousels_environment_check') then
    alter table public.carousels
      add constraint carousels_environment_check
      check (environment in ('test', 'production'));
  end if;
end $$;
