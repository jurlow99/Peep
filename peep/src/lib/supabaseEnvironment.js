// Pure resolver shared by Vite configuration and offline regression tests.
export function resolveSupabaseEnvironment(env) {
  const environment = env.VITE_PEEP_ENV;
  if (!['development', 'production'].includes(environment)) {
    throw new Error('Peep setup: set VITE_PEEP_ENV to development or production.');
  }
  const rawUrl = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!rawUrl || !key || /NEW-|REPLACE|YOUR-/i.test(rawUrl + key)) {
    throw new Error('Peep setup: configure the new project URL and public Supabase key.');
  }
  let url;
  try { url = new URL(rawUrl); } catch {
    throw new Error('Peep setup: VITE_SUPABASE_URL must be a valid URL.');
  }
  const legacy = ['iuozujwtuzuwubhsnhix.supabase.co', 'fzrfevzrfurmszdjauov.supabase.co'];
  if (legacy.includes(url.hostname)) throw new Error('Peep setup: legacy Supabase projects are disabled.');
  const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)
      || (url.protocol !== 'https:' && !(environment === 'development' && localhost && url.protocol === 'http:'))
      || (environment === 'production' && localhost)) {
    throw new Error('Peep setup: use an HTTPS project origin (local HTTP is development only).');
  }
  if (key.startsWith('sb_secret_')) throw new Error('Peep setup: a secret key must never be used in a client.');
  return { url: url.origin, publicKey: key, isDevelopment: environment === 'development' };
}
