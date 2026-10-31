-- FARRIS dev scheduler: dedicated random token kept inside Vault, never a user JWT.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
do $$ begin
 if not exists(select 1 from vault.secrets where name='peep_epg_job_token') then
  perform vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'peep_epg_job_token','Dedicated EPG scheduler token');
 end if;
end $$;
create table if not exists peep_private.epg_job_auth(singleton boolean primary key default true check(singleton),token_hash text not null);
alter table peep_private.epg_job_auth enable row level security;
drop policy if exists scheduler_service_read on peep_private.epg_job_auth;
create policy scheduler_service_read on peep_private.epg_job_auth for select to service_role using (true);
revoke all on peep_private.epg_job_auth from public,anon,authenticated;
grant usage on schema peep_private to service_role;
grant select on peep_private.epg_job_auth to service_role;
insert into peep_private.epg_job_auth(singleton,token_hash)
select true,encode(extensions.digest(decrypted_secret,'sha256'),'hex') from vault.decrypted_secrets where name='peep_epg_job_token'
on conflict(singleton) do update set token_hash=excluded.token_hash;
create or replace function public.authorize_epg_refresh(p_token text) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from peep_private.epg_job_auth where token_hash=encode(extensions.digest(p_token,'sha256'),'hex'));
$$;
revoke all on function public.authorize_epg_refresh(text) from public,anon,authenticated;
grant execute on function public.authorize_epg_refresh(text) to service_role;
-- Activate only after deploying the authenticated refresh-epg function.
select cron.schedule('peep-epg-refresh','15 */6 * * *',
 $job$select net.http_post(
  url:='https://cuwdyedmmnpklufduaho.supabase.co/functions/v1/refresh-epg',
  headers:=jsonb_build_object('Content-Type','application/json','x-epg-job-token',(select decrypted_secret from vault.decrypted_secrets where name='peep_epg_job_token')),
  body:='{}'::jsonb,timeout_milliseconds:=10000
 );$job$);
