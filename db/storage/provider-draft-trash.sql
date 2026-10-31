-- Recoverable draft removal; media objects are retained.
alter table public.provider_deliveries add column deleted_at timestamptz;
