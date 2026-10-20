// Run with Node and PGlite 0.5.10. Every run creates TWO isolated in-memory DBs.
// PGLITE_MODULE may point to an unpacked dist/index.js; no connection URL exists.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const file = async name => readFile(new URL(name, import.meta.url), 'utf8');
for (let pass=1;pass<=2;pass++) {
 const db=new PGlite();
 try {
  await db.exec(await file('bootstrap.sql'));
  await db.exec('BEGIN;'+await file('../migrations/001_schema.sql')+await file('../migrations/002_security.sql')+'COMMIT;');
  const count=async sql=>Number((await db.query(sql)).rows[0].n);
  const role=async (r,uid='')=>db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${uid}',false); SET ROLE ${r};`);
  const denied=async sql=> { await assert.rejects(()=>db.exec(sql)); };
  const a='10000000-0000-0000-0000-000000000001', b='10000000-0000-0000-0000-000000000002', admin='10000000-0000-0000-0000-000000000003';
  await db.exec(`INSERT INTO auth.users(id,email) VALUES ('${a}','a@example.invalid'),('${b}','b@example.invalid'),('${admin}','admin@example.invalid'); UPDATE public.profiles SET role='admin' WHERE id='${admin}';
   INSERT INTO public.videos(title) VALUES ('free'); INSERT INTO public.videos(title,is_premium) VALUES ('premium',true); INSERT INTO public.videos(title,visibility_tier) VALUES ('preview','test');
   INSERT INTO public.shows(id,title,is_premium) VALUES (1,'free show',false),(2,'premium show',true);
   INSERT INTO public.episodes(show_id,title,status) VALUES (1,'approved','approved'),(1,'pending','pending'),(2,'premium parent','approved');
   INSERT INTO public.live_feeds(id,name,cloudflare_hls_url) VALUES ('20000000-0000-0000-0000-000000000001','private feed','https://example.invalid/private');
   INSERT INTO public.channels(id,name,is_premium,live_feed_id) VALUES (1,'free',false,null),(2,'premium',true,'20000000-0000-0000-0000-000000000001');
   INSERT INTO public.epg_entries(channel_id,title,start_time,end_time) VALUES (1,'free guide',now(),now()+interval '1 hour'),(2,'private guide',now(),now()+interval '1 hour');
   INSERT INTO public.app_settings(key,value) VALUES ('maintenance_mode','false'),('admin_pin','never-public');
   INSERT INTO public.watch_progress(user_id,content_id,content_type) VALUES ('${b}','private','movie');`);
  await role('anon');
  for (const t of ['videos','shows','episodes','channels','epg_entries','app_settings']) assert.equal(await count(`SELECT count(*) n FROM public.${t}`),1,t);
  assert.equal(await count('SELECT count(*) n FROM public.public_live_feeds'),0);
  await denied('SELECT * FROM public.profiles');
  await denied('SELECT * FROM public.live_feed_secrets');
  await denied("INSERT INTO public.videos(title) VALUES ('forged')");
  await role('authenticated',a);
  assert.equal(await count('SELECT count(*) n FROM public.profiles'),1);
  assert.equal(await count('SELECT count(*) n FROM public.watch_progress'),0);
  await denied(`UPDATE public.profiles SET role='admin' WHERE id='${a}'`);
  await denied(`UPDATE public.profiles SET is_admin=true WHERE id='${a}'`);
  await denied(`UPDATE public.profiles SET access_tier='test' WHERE id='${a}'`);
  await denied(`INSERT INTO public.subscriptions(user_id,status,plan) VALUES ('${a}','active','comp')`);
  await denied(`INSERT INTO public.watch_progress(user_id,content_id,content_type) VALUES ('${b}','spoof','movie')`);
  await db.exec(`UPDATE public.profiles SET full_name='Allowed' WHERE id='${a}'; INSERT INTO public.watch_progress(user_id,content_id,content_type) VALUES ('${a}','own','movie') ON CONFLICT(user_id,content_id,content_type) DO UPDATE SET progress_seconds=1;`);
  await role('authenticated',admin);
  assert.equal(await count('SELECT count(*) n FROM public.videos'),3);
  await db.exec(`INSERT INTO public.subscriptions(user_id,status,plan,current_period_end) VALUES ('${a}','active','paid',now()+interval '1 day');`);
  await role('authenticated',a);
  assert.equal(await count('SELECT count(*) n FROM public.videos'),2);
  assert.equal(await count('SELECT count(*) n FROM public.public_live_feeds'),1);
  await role('postgres');
  await db.exec(`UPDATE public.subscriptions SET current_period_end=now()-interval '1 day' WHERE user_id='${a}';`);
  await role('authenticated',a);
  assert.equal(await count('SELECT count(*) n FROM public.videos'),1);
  await role('postgres');
  assert.equal(await count("SELECT count(*) n FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity"),0);
  // Repeat application must refuse an existing database, not silently mutate it.
  const again=await file('../migrations/001_schema.sql');
  await assert.rejects(()=>db.exec('BEGIN;'+again), /Refusing bootstrap/);
  await db.exec('ROLLBACK');
  console.log(`PASS ${pass}: schema, anon catalog, inherited premium, preview, feed/EPG isolation, own data, profile escalation, subscription expiry, RLS inventory`);
 } finally { await db.close(); }
}
