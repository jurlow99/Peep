import { supabase } from '../supabase';
export const TEST_VAST_URL = 'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_ad_samples&sz=640x480&cust_params=sample_ct%3Dlinear&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&correlator=';
export function selectAdTag(tags, scope, contentId, platform = 'web') {
  return (tags || []).filter(t => t.active !== false && t.platforms?.includes(platform) && /^https:\/\//i.test(t.tag_url) && (t.scope === scope || t.scope === 'global') &&
    (t.content_id == null || t.content_id === '' || (t.scope === scope && String(t.content_id) === String(contentId))))
    .sort((a,b) => ((b.content_id ? 2 : b.scope === scope ? 1 : 0) - (a.content_id ? 2 : a.scope === scope ? 1 : 0)) || Number(a.id)-Number(b.id))[0] || null;
}
export async function recordAdEvent(tag, sessionId, event, scope, contentId, adId = '') {
  // Provider tracking is handled by IMA for all viewers. Internal telemetry uses
  // the existing own-account INSERT policy; guests do not write to this table.
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    const result = await supabase.from('ad_impressions').insert({ vast_tag_id: tag.id,
      session_id: sessionId, event, content_id: String(contentId ?? ''), content_type: scope,
      platform: 'web', ad_id: adId, user_id: session.user.id,
      is_test: tag.is_test || tag.tag_url.includes('/external/') });
    if (result.error && result.error.code !== '23505') console.warn('Ad delivery event was not recorded', result.error.code);
  } catch { /* Measurement never blocks content. */ }
}

export function appleTVPlacementError(form,isDevelopment){
  if(!form.platforms?.includes('tvos')||form.ad_type==='pre_roll')return null;
  if(isDevelopment&&form.ad_type==='mid_roll'&&form.scope==='live'&&form.is_test&&/^-?[1-9]\d*$/.test(String(form.content_id)))return null;
  return 'Apple TV mid-roll testing requires FARRIS dev, a test tag, Live Channels scope and one channel ID. Post-roll is not supported.';
}
