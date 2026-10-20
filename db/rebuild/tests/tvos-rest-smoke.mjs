// Save as .mjs; run with Node 20+. READ ONLY. No fixture or credential writes.
// PEEP_DEV_PUBLIC_KEY must be the new dev publishable/anon key.
// Optional PEEP_DEV_ACCESS_TOKEN + PEEP_DEV_USER_ID from a genuine dev sign-in.
// Never use service-role keys. Does not print keys, tokens or user rows.
// SQL rollback fixtures are not visible across REST sessions. Empty arrays are
// expected on the initial database and prove route/query validity only, not decoding
// of populated models or API-level negative tests. See notes below.
import assert from 'node:assert/strict';
const base='https://cuwdyedmmnpklufduaho.supabase.co';
const key=process.env.PEEP_DEV_PUBLIC_KEY;
assert(key && !key.startsWith('sb_secret_'),'Supply dev public key only');
if(key.startsWith('eyJ')) {
 const payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());
 assert.equal(payload.role,'anon','Legacy key must have anon role');
 if(payload.ref) assert.equal(payload.ref,'cuwdyedmmnpklufduaho');
}
const headers={apikey:key};
if(key.startsWith('eyJ'))headers.Authorization=`Bearer ${key}`;
async function get(table,q,requestHeaders=headers){
 const url=new URL(`/rest/v1/${table}`,base);
 for(const [k,v] of Object.entries(q))url.searchParams.set(k,String(v));
 const res=await fetch(url,{headers:requestHeaders,signal:AbortSignal.timeout(25000)});
 assert.equal(res.status,200,`${table}: HTTP ${res.status}`);
 const rows=await res.json(); assert(Array.isArray(rows),`${table}: expected JSON array`);
 return rows;
}
async function all(table,q){
 const result=[];
 for(let offset=0;offset<100000;offset+=200){
  const page=await get(table,{...q,limit:200,offset});result.push(...page);
  if(page.length<200)return result;
 }
 throw Error('Safety cap: over 100000 rows');
}
const video=await all('videos',{select:'*',order:'id.desc'});
const shows=await all('shows',{select:'*',order:'id.desc'});
const channels=await all('channels',{select:'*',order:'sort_order.asc,id.asc',is_active:'eq.true'});
const episodes=await all('episodes',{show_id:`eq.${shows[0]?.id??-7101}`,order:'season.asc,episode_number.asc,id.asc'});
const now=new Date();
const guide=await all('epg_entries',{end_time:`gt.${now.toISOString()}`,start_time:`lt.${new Date(+now+6*3600000).toISOString()}`,order:'start_time.asc,id.asc'});
const feeds=await all('public_live_feeds',{select:'id,cloudflare_hls_url',order:'id.asc'});
for(const r of video){assert.equal(typeof r.id,'string');assert.equal(typeof r.title,'string');assert(r.year===null||Number.isInteger(r.year));assert(r.duration===null||typeof r.duration==='string');}
for(const rows of [shows,channels,episodes,guide])for(const r of rows)assert(Number.isSafeInteger(r.id));
for(const rows of [video,shows,channels])for(const r of rows){assert.equal(r.visibility_tier,'production');assert.equal(r.is_premium,false);}
for(const r of episodes){assert.equal(r.is_premium,false);assert.equal(r.status,'approved');}
for(const r of guide){assert(Number.isSafeInteger(r.channel_id));assert(Number.isFinite(Date.parse(r.start_time)));assert(Number.isFinite(Date.parse(r.end_time)));}
for(const r of feeds){assert.equal(typeof r.id,'string');assert.deepEqual(Object.keys(r).sort(),['cloudflare_hls_url','id']);}
// Also validate the production-mode query shape against DEV, never prod itself.
for(const table of ['videos','shows','channels'])await get(table,{select:'*',order:table==='channels'?'sort_order.asc,id.asc':'id.desc',or:'(visibility_tier.eq.production,visibility_tier.is.null)',...(table==='channels'?{is_active:'eq.true'}:{}),limit:200,offset:0});
console.log('PASS: guest tvOS query shapes, paging, production filter syntax; row counts:',{videos:video.length,shows:shows.length,episodes:episodes.length,channels:channels.length,guide:guide.length,feeds:feeds.length});
if(process.env.PEEP_DEV_ACCESS_TOKEN){
 assert(process.env.PEEP_DEV_USER_ID,'User ID required with genuine session');
 const profiles=await get('viewer_profiles',{user_id:`eq.${process.env.PEEP_DEV_USER_ID}`,order:'created_at.asc'},{apikey:key,Authorization:`Bearer ${process.env.PEEP_DEV_ACCESS_TOKEN}`});
 for(const r of profiles){assert.equal(r.user_id,process.env.PEEP_DEV_USER_ID);assert.equal(typeof r.id,'string');}
 console.log('PASS: authenticated viewer_profiles query; count',profiles.length);
}else console.log('PENDING: genuine Auth sign-in and authenticated profiles REST check');
// Remaining real API acceptance:
// 1. Actual Auth signup/login/refresh requires separately authorized test accounts
//    and email setup. SQL-created rollback users have no credentials or identities.
// 2. Real fixture REST checks require committed dev-only owned content/test users,
//    with an explicit cleanup plan; don't replace SQL ROLLBACK with COMMIT.
// 3. Once such fixtures exist, request known premium/preview IDs as guest and
//    expect []; use two genuine sessions to prove cross-user isolation via REST.
// 4. Successful empty responses do not prove media playback or Swift decoding.
