-- Delivery telemetry only: these events are not a financial ledger.
alter table public.vast_tags add column is_test boolean not null default true;
alter table public.vast_tags add column platforms text[] not null default array['web'];
alter table public.vast_tags add constraint vast_platforms_valid check (cardinality(platforms)>0 and platforms <@ array['web','tvos']);
alter table public.ad_impressions add column is_test boolean not null default true;
alter table public.ad_impressions add column platform text;
alter table public.ad_impressions add column ad_id text;
create unique index ad_delivery_event_once on public.ad_impressions(session_id,event,ad_id) where session_id is not null and ad_id is not null;
