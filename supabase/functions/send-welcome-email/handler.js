import { welcomeHtml } from './template.js';

export function readWelcomeConfig(env) {
  const environment = env('PEEP_ENV');
  const project = env('SUPABASE_URL');
  const site = env('SITE_URL');
  const expected = { development: 'https://cuwdyedmmnpklufduaho.supabase.co', production: 'https://ffoiacnvcjlkgsazacrk.supabase.co' };
  if (!expected[environment] || project !== expected[environment]) throw new Error('Environment/project mismatch');
  const allowed = environment === 'development' ? ['http://127.0.0.1:5173', 'http://localhost:5173'] : ['https://watchpeep.tv'];
  if (!allowed.includes(site)) throw new Error('Environment/site mismatch');
  if (!env('RESEND_API_KEY')) throw new Error('Email provider not configured');
  return { environment, project, site, enabled: env('WELCOME_EMAIL_ENABLED') === 'true' };
}

export function createWelcomeHandler({ config, authenticate, reserve, send, finish }) {
  return async req => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': config.site, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (req.headers.get('Origin') && req.headers.get('Origin') !== config.site) return reply(403, { error: 'Origin not allowed' });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return reply(405, { error: 'POST required' });
    if (!config.enabled) return reply(503, { error: 'Welcome delivery not enabled' });
    const match = /^Bearer (\S+)$/i.exec(req.headers.get('Authorization') || '');
    if (!match) return reply(401, { error: 'Sign in required' });
    let user;
    try { user = await authenticate(match[1]); } catch { return reply(401, { error: 'Sign in required' }); }
    if (!user?.id || !user.email || !user.email_confirmed_at || user.is_anonymous) return reply(403, { error: 'Verified email required' });
    // Ignore request body entirely: recipient and display name come from validated Auth user.
    const message = { from: 'Peep <noreply@watchpeep.tv>', to: user.email, subject: 'Welcome to Peep 👋', html: welcomeHtml(user.user_metadata?.full_name, config.site) };
    try {
      // Unique user_id atomically reserves one attempt, even across concurrent requests.
      const claim = await reserve(user.id);
      if (!claim) return reply(200, { status: 'already_reserved', detail: 'No additional email requested' });
      try {
        const result = await send(message, `peep-welcome/${config.environment}/${user.id}`);
        await finish(user.id, result.id);
        return reply(200, { status: 'sent' });
      } catch {
        // Preserve reservation on ALL failures, including ambiguous provider timeouts.
        // Operator must reconcile provider result before any separately approved retry.
        return reply(502, { error: 'Delivery outcome requires review; no automatic resend' });
      }
    } catch { return reply(503, { error: 'Welcome delivery unavailable' }); }
  };
}
