import assert from 'node:assert/strict';
import { resolveSupabaseEnvironment as resolve } from '../../../peep/src/lib/supabaseEnvironment.js';
const valid = { VITE_PEEP_ENV:'development', VITE_SUPABASE_URL:'https://example.supabase.co', VITE_SUPABASE_ANON_KEY:'sb_publishable_test' };
assert.equal(resolve(valid).isDevelopment,true);
assert.equal(resolve({...valid,VITE_PEEP_ENV:'production'}).isDevelopment,false);
for (const change of [{VITE_PEEP_ENV:undefined},{VITE_SUPABASE_URL:undefined},{VITE_SUPABASE_ANON_KEY:undefined}, {VITE_SUPABASE_URL:'https://iuozujwtuzuwubhsnhix.supabase.co'},{VITE_SUPABASE_URL:'https://fzrfevzrfurmszdjauov.supabase.co'}, {VITE_SUPABASE_URL:'http://example.supabase.co'},{VITE_SUPABASE_ANON_KEY:'sb_secret_nope'}, {VITE_SUPABASE_URL:'https://user:password@example.supabase.co'}]) assert.throws(()=>resolve({...valid,...change}));
assert.equal(resolve({...valid,VITE_SUPABASE_URL:'http://localhost:54321'}).isDevelopment,true);
assert.throws(()=>resolve({...valid,VITE_PEEP_ENV:'production',VITE_SUPABASE_URL:'http://localhost:54321'}));
console.log('PASS: explicit dev/prod, missing settings, old projects, HTTPS, secret key and credential URL checks');
