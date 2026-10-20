-- Execute entire file in ONE privileged execute_sql call targeting ONLY:
-- peep-dev / cuwdyedmmnpklufduaho. NEVER target production.
-- Actual auth schema/functions required. No auth stubs; no API/network calls.
-- On any exception issue ROLLBACK on that session. Never replace final ROLLBACK with COMMIT.
-- Explicit negative IDs avoid advancing identity sequences (sequences do not roll back).
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
DO $$ BEGIN IF NOT COALESCE((to_regclass('auth.users') IS NOT NULL AND to_regprocedure('auth.uid()') IS NOT NULL),false) THEN RAISE EXCEPTION 'FAIL: real auth prerequisites'; END IF; END $$;
DO $$ DECLARE r text; v text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH v IN ARRAY ARRAY['public.public_live_feeds','public.movies'] LOOP
   IF has_table_privilege(r,v,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'FAIL: inherited write grants on % for %',v,r;
   END IF;
  END LOOP;
  IF EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND CASE WHEN c.relkind='S' THEN has_sequence_privilege(r,c.oid,'UPDATE') ELSE false END) THEN
   RAISE EXCEPTION 'FAIL: inherited sequence UPDATE for %',r;
  END IF;
 END LOOP;
END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ('71000000-0000-0000-0000-000000000001','rebuild-a@example.invalid','{"full_name":"Synthetic A","role":"admin","is_admin":true,"access_tier":"test"}'),('71000000-0000-0000-0000-000000000002','rebuild-b@example.invalid','{}'),('71000000-0000-0000-0000-000000000003','rebuild-admin@example.invalid','{}');
DO $$ BEGIN IF NOT COALESCE(((SELECT count(*)=3 FROM public.profiles WHERE id IN ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000003'))),false) THEN RAISE EXCEPTION 'FAIL: auth trigger creates profiles'; END IF; END $$;
DO $$ BEGIN IF NOT COALESCE(((SELECT role='viewer' AND NOT is_admin AND access_tier='production' AND full_name='Synthetic A' FROM public.profiles WHERE id='71000000-0000-0000-0000-000000000001')),false) THEN RAISE EXCEPTION 'FAIL: signup ignores metadata entitlements'; END IF; END $$;
UPDATE public.profiles SET role='admin',is_admin=true WHERE id='71000000-0000-0000-0000-000000000003';
INSERT INTO public.videos(id,title,is_premium,visibility_tier) VALUES
 ('72000000-0000-0000-0000-000000000001','REBUILD TEST free',false,'production'),
 ('72000000-0000-0000-0000-000000000002','REBUILD TEST premium',true,'production'),
 ('72000000-0000-0000-0000-000000000003','REBUILD TEST preview',false,'test');
INSERT INTO public.shows(id,title,is_premium) VALUES (-7101,'REBUILD TEST free',false),(-7102,'REBUILD TEST premium',true);
INSERT INTO public.episodes(id,show_id,title,status) VALUES (-7101,-7101,'REBUILD TEST approved','approved'),(-7102,-7101,'REBUILD TEST pending','pending'),(-7103,-7102,'REBUILD TEST inherited premium','approved');
INSERT INTO public.live_feeds(id,name,cloudflare_hls_url) VALUES ('73000000-0000-0000-0000-000000000001','REBUILD TEST private','https://example.invalid/no-media');
INSERT INTO public.channels(id,name,is_premium,is_active,live_feed_id) VALUES (-7101,'REBUILD TEST free',false,true,null),(-7102,'REBUILD TEST premium',true,true,'73000000-0000-0000-0000-000000000001'),(-7103,'REBUILD TEST inactive',false,false,null);
INSERT INTO public.epg_entries(id,channel_id,title,start_time,end_time) VALUES (-7101,-7101,'REBUILD TEST free',now(),now()+interval '1 hour'),(-7102,-7102,'REBUILD TEST premium',now(),now()+interval '1 hour');
INSERT INTO public.app_settings(key,value) VALUES ('rebuild_test_private_pin','synthetic');

INSERT INTO public.viewer_profiles(id,user_id,name) VALUES ('74000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002','Synthetic B'); INSERT INTO public.watch_progress(id,user_id,content_id,content_type) VALUES (-7101,'71000000-0000-0000-0000-000000000002','synthetic-b','movie');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',true); SELECT set_config('request.jwt.claims','{"sub":"","role":"anon"}',true); SET LOCAL ROLE anon;
DO $$ BEGIN IF NOT COALESCE(((SELECT count(*)=1 FROM public.videos WHERE title LIKE 'REBUILD TEST%')),false) THEN RAISE EXCEPTION 'FAIL: anon videos'; END IF; END $$;
DO $$ BEGIN IF NOT COALESCE(((SELECT count(*)=1 FROM public.shows WHERE id BETWEEN -7103 AND -7101)),false) THEN RAISE EXCEPTION 'FAIL: anon shows'; END IF; END $$;
DO $$ BEGIN IF NOT COALESCE(((SELECT count(*)=1 FROM public.episodes WHERE id BETWEEN -7103 AND -7101)),false) THEN RAISE EXCEPTION 'FAIL: anon episodes'; END IF; END $$;
DO $$ BEGIN IF NOT COALESCE(((SELECT count(*)=1 FROM public.channels WHERE id BETWEEN -7103 AND -7101)),false) THEN RAISE EXCEPTION 'FAIL: anon channels'; END IF; END $$;
DO $$ BEGIN IF NOT COALESCE(((SELECT count(*)=1 FROM public.epg_entries WHERE id BETWEEN -7103 AND -7101)),false) THEN RAISE EXCEPTION 'FAIL: anon epg_entries'; END IF; END $$;
DO $$ BEGIN IF NOT COALESCE(((SELECT count(*)=0 FROM public.public_live_feeds WHERE id='73000000-0000-0000-0000-000000000001')),false) THEN RAISE EXCEPTION 'FAIL: anon public_live_feeds'; END IF; END $$;
DO $$ BEGIN IF NOT COALESCE(((SELECT count(*)=0 FROM public.app_settings WHERE key='rebuild_test_private_pin')),false) THEN RAISE EXCEPTION 'FAIL: anon app_settings'; END IF; END $$;
DO $$ BEGIN BEGIN SELECT * FROM public.profiles; RAISE EXCEPTION 'FAIL: anon profiles unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
DO $$ BEGIN BEGIN SELECT * FROM public.live_feed_secrets; RAISE EXCEPTION 'FAIL: anon secrets unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true); SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}',true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF NOT COALESCE((auth.uid()='71000000-0000-0000-0000-000000000001'::uuid AND current_user='authenticated'),false) THEN RAISE EXCEPTION 'FAIL: actual uid/role claims'; END IF; END $$;
DO $$ BEGIN IF NOT COALESCE(((SELECT count(*)=1 FROM public.profiles WHERE id IN ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000003'))),false) THEN RAISE EXCEPTION 'FAIL: profile isolation'; END IF; END $$;
DO $$ BEGIN IF NOT COALESCE(((SELECT count(*)=0 FROM public.watch_progress WHERE id=-7101)),false) THEN RAISE EXCEPTION 'FAIL: progress isolation'; END IF; END $$;
DO $$ BEGIN BEGIN UPDATE public.profiles SET role='admin' WHERE id='71000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'FAIL: self escalation role unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
DO $$ BEGIN BEGIN UPDATE public.profiles SET is_admin=true WHERE id='71000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'FAIL: self escalation is_admin unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
DO $$ BEGIN BEGIN UPDATE public.profiles SET access_tier='test' WHERE id='71000000-0000-0000-0000-000000000001'; RAISE EXCEPTION 'FAIL: self escalation access_tier unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
DO $$ BEGIN BEGIN INSERT INTO public.profiles(id,role) VALUES ('71000000-0000-0000-0000-000000000001','admin') ON CONFLICT(id) DO UPDATE SET role=excluded.role; RAISE EXCEPTION 'FAIL: upsert escalation unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
DO $$ BEGIN BEGIN INSERT INTO public.subscriptions(id,user_id,status,plan) VALUES (-7101,'71000000-0000-0000-0000-000000000001','active','comp'); RAISE EXCEPTION 'FAIL: self subscription unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
DO $$ BEGIN BEGIN INSERT INTO public.watch_progress(id,user_id,content_id,content_type) VALUES (-7102,'71000000-0000-0000-0000-000000000002','spoof','movie'); RAISE EXCEPTION 'FAIL: cross user progress unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
DO $$ BEGIN BEGIN INSERT INTO public.watch_progress(id,user_id,profile_id,content_id,content_type) VALUES (-7102,'71000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000001','spoof','movie'); RAISE EXCEPTION 'FAIL: foreign viewer profile unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
UPDATE public.profiles SET full_name='Allowed' WHERE id='71000000-0000-0000-0000-000000000001'; UPDATE public.profiles SET full_name='Wrong' WHERE id='71000000-0000-0000-0000-000000000002'; INSERT INTO public.watch_progress(id,user_id,content_id,content_type) VALUES (-7102,'71000000-0000-0000-0000-000000000001','own','movie') ON CONFLICT(user_id,content_id,content_type) DO UPDATE SET progress_seconds=1;
DO $$ BEGIN IF NOT COALESCE(((SELECT full_name='Allowed' FROM public.profiles WHERE id='71000000-0000-0000-0000-000000000001')),false) THEN RAISE EXCEPTION 'FAIL: allowed own profile'; END IF; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000003',true); SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000003","role":"authenticated"}',true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF NOT COALESCE(((SELECT count(*)=3 FROM public.videos WHERE title LIKE 'REBUILD TEST%')),false) THEN RAISE EXCEPTION 'FAIL: admin catalog'; END IF; END $$;
DO $$ BEGIN IF NOT COALESCE(((SELECT full_name IS NULL FROM public.profiles WHERE id='71000000-0000-0000-0000-000000000002')),false) THEN RAISE EXCEPTION 'FAIL: cross user update had zero effect'; END IF; END $$;
INSERT INTO public.subscriptions(id,user_id,status,plan,current_period_end) VALUES (-7101,'71000000-0000-0000-0000-000000000001','active','paid',now()+interval '1 day');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true); SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}',true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF NOT COALESCE(((SELECT count(*)=2 FROM public.videos WHERE title LIKE 'REBUILD TEST%')),false) THEN RAISE EXCEPTION 'FAIL: active paid access'; END IF; END $$;
DO $$ BEGIN IF NOT COALESCE(((SELECT count(*)=2 FROM public.episodes WHERE id BETWEEN -7103 AND -7101)),false) THEN RAISE EXCEPTION 'FAIL: paid inherited episode access'; END IF; END $$;
DO $$ BEGIN IF NOT COALESCE(((SELECT count(*)=1 FROM public.public_live_feeds WHERE id='73000000-0000-0000-0000-000000000001')),false) THEN RAISE EXCEPTION 'FAIL: paid linked feed access'; END IF; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000003',true); SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000003","role":"authenticated"}',true); SET LOCAL ROLE authenticated;
UPDATE public.subscriptions SET current_period_end=now()-interval '1 day' WHERE user_id='71000000-0000-0000-0000-000000000001';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true); SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}',true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF NOT COALESCE((NOT public.has_active_subscription()),false) THEN RAISE EXCEPTION 'FAIL: expired paid denied'; END IF; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000003',true); SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000003","role":"authenticated"}',true); SET LOCAL ROLE authenticated;
UPDATE public.subscriptions SET plan='comp',current_period_end=null WHERE user_id='71000000-0000-0000-0000-000000000001';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true); SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}',true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF NOT COALESCE((public.has_active_subscription()),false) THEN RAISE EXCEPTION 'FAIL: explicit comp access'; END IF; END $$;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000003',true); SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000003","role":"authenticated"}',true); SET LOCAL ROLE authenticated;
UPDATE public.subscriptions SET status='canceled' WHERE user_id='71000000-0000-0000-0000-000000000001'; UPDATE public.profiles SET access_tier='test' WHERE id='71000000-0000-0000-0000-000000000001';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true); SELECT set_config('request.jwt.claims','{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}',true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF NOT COALESCE(((SELECT count(*)=2 FROM public.videos WHERE title LIKE 'REBUILD TEST%')),false) THEN RAISE EXCEPTION 'FAIL: preview tier does not grant premium'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN IF NOT COALESCE((NOT EXISTS(SELECT FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity)),false) THEN RAISE EXCEPTION 'FAIL: all tables RLS'; END IF; END $$;
ROLLBACK;
SELECT 'PASS: actual Auth trigger and role/claims tests completed; all fixtures rolled back' AS result;
