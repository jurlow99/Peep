-- FARRIS dev: existing referral codes are preserved.
alter table public.creators alter column referral_code
set default ('PEEP-' || upper(replace(gen_random_uuid()::text,'-','')));
