import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';
import { createWelcomeHandler, readWelcomeConfig } from './handler.js';

const config = readWelcomeConfig(name => Deno.env.get(name));
const client = createClient(config.project, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(createWelcomeHandler({
  config,
  authenticate: async token => {
    const { data, error } = await client.auth.getUser(token);
    if (error) throw error;
    return data.user;
  },
  reserve: async userId => {
    const { error } = await client.from('welcome_email_deliveries').insert({ user_id: userId });
    if (error?.code === '23505') return false;
    if (error) throw error;
    return true;
  },
  send: async (message, key) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(message),
    });
    const result = await response.json();
    if (!response.ok || result.error || !result.id) throw new Error('Provider rejected or uncertain');
    return result;
  },
  finish: async (userId, providerId) => {
    const { data, error } = await client.from('welcome_email_deliveries').update({ status: 'sent', provider_id: providerId, sent_at: new Date().toISOString() }).eq('user_id', userId).eq('status', 'reserved').select('user_id');
    if (error || data?.length !== 1) throw new Error('Delivery receipt not saved');
  },
}));
