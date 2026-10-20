-- Forward hardening for baseline v1. Apply once in a transaction.
-- Keep peep_private OUT of the Data API exposed-schema list.
CREATE SCHEMA peep_private;
REVOKE ALL ON SCHEMA peep_private FROM PUBLIC;
GRANT USAGE ON SCHEMA peep_private TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA peep_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER FUNCTION public.is_admin() SET SCHEMA peep_private;
ALTER FUNCTION public.has_active_subscription() SET SCHEMA peep_private;
ALTER FUNCTION public.can_read_tier(text) SET SCHEMA peep_private;
ALTER FUNCTION public.can_read_content(text,boolean) SET SCHEMA peep_private;
-- ALTER FUNCTION preserves object identities and policy dependencies. SQL string
-- bodies are replaced explicitly because their qualified names are not rewritten.
CREATE OR REPLACE FUNCTION peep_private.can_read_content(tier text, premium boolean)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
 SELECT peep_private.is_admin() OR (peep_private.can_read_tier(tier)
 AND (premium IS FALSE OR peep_private.has_active_subscription()));
$$;
CREATE OR REPLACE FUNCTION public.guard_profile_entitlements()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF current_user IN ('anon','authenticated') AND NOT peep_private.is_admin() THEN
  IF TG_OP='INSERT' THEN
   IF NEW.role <> 'viewer' OR NEW.is_admin OR NEW.access_tier <> 'production' THEN
    RAISE EXCEPTION 'Profile entitlements are server-managed' USING ERRCODE='42501';
   END IF;
  ELSIF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_admin IS DISTINCT FROM OLD.is_admin
     OR NEW.access_tier IS DISTINCT FROM OLD.access_tier OR NEW.id IS DISTINCT FROM OLD.id THEN
   RAISE EXCEPTION 'Profile entitlements are server-managed' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA peep_private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION peep_private.is_admin(), peep_private.has_active_subscription(),
 peep_private.can_read_tier(text), peep_private.can_read_content(text,boolean)
 TO anon, authenticated, service_role;
-- Column ACLs apply independently of RLS. No source/ingest/admin metadata becomes
-- readable merely because a channel is public. Admin full reads use guarded RPC.
REVOKE SELECT ON public.live_feeds FROM PUBLIC, anon, authenticated;
GRANT SELECT(id,cloudflare_hls_url,playback_status,enabled) ON public.live_feeds TO anon, authenticated;
CREATE POLICY entitled_playback ON public.live_feeds FOR SELECT TO anon, authenticated
 USING (enabled IS TRUE AND EXISTS (
  SELECT FROM public.channels c WHERE c.live_feed_id=live_feeds.id
   AND c.is_active IS TRUE
   AND peep_private.can_read_content(c.visibility_tier,c.is_premium)
 ));
CREATE OR REPLACE VIEW public.public_live_feeds
 WITH (security_invoker=true,security_barrier=true) AS
 SELECT f.id,f.cloudflare_hls_url,f.playback_status,f.enabled FROM public.live_feeds f
 WHERE f.enabled IS TRUE AND EXISTS (
  SELECT FROM public.channels c WHERE c.live_feed_id=f.id AND c.is_active IS TRUE
   AND peep_private.can_read_content(c.visibility_tier,c.is_premium)
 );
REVOKE ALL ON public.public_live_feeds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_live_feeds TO anon, authenticated;
-- Preserve full admin field contracts without granting metadata SELECT to viewers.
CREATE FUNCTION peep_private.admin_live_feeds()
RETURNS SETOF public.live_feeds LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT peep_private.is_admin() THEN
  RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT * FROM public.live_feeds ORDER BY created_at DESC;
END $$;
REVOKE ALL ON FUNCTION peep_private.admin_live_feeds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION peep_private.admin_live_feeds() TO authenticated, service_role;
CREATE FUNCTION public.admin_live_feeds()
RETURNS SETOF public.live_feeds LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT * FROM peep_private.admin_live_feeds();
$$;
REVOKE ALL ON FUNCTION public.admin_live_feeds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_live_feeds() TO authenticated, service_role;
-- Remaining public definer functions are trigger-only or service-only.
NOTIFY pgrst, 'reload schema';
