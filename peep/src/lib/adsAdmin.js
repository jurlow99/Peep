// Admin-side vocabulary and validation for VAST tags. Pure, so the Ads panel
// stays a thin page and the rules are unit-tested.
import { appleTVPlacementError } from './ads';

export const EMPTY_AD = { name: '', tag_url: '', ad_type: 'pre_roll', scope: 'global', content_id: '', content_label: '', active: true, is_test: true, platforms: ['web', 'tvos'] };

export const POSITIONS = [
  { value: 'pre_roll', title: 'Pre-roll', hint: 'Before a movie, episode, live channel or multiview starts. Browser and Apple TV.' },
  { value: 'mid_roll', title: 'Mid-roll', hint: 'Inside a movie or episode at the times set in Ad rules. Browser only.' },
  { value: 'post_roll', title: 'Post-roll', hint: 'After a movie or episode ends, before Up next. Browser only.' },
];

export const SCOPES = [
  { value: 'global', label: 'All content', positions: ['pre_roll', 'mid_roll', 'post_roll'] },
  { value: 'movie', label: 'Movies', positions: ['pre_roll', 'mid_roll', 'post_roll'], picker: 'movie' },
  { value: 'episode', label: 'Episodes', positions: ['pre_roll', 'mid_roll', 'post_roll'], picker: 'episode' },
  { value: 'live', label: 'Live channels', positions: ['pre_roll', 'mid_roll'], picker: 'live' },
  { value: 'multiview', label: 'Multiview entry', positions: ['pre_roll'] },
];

export const SCOPE_LABELS = Object.fromEntries(SCOPES.map(s => [s.value, s.label]));
export const POSITION_LABELS = Object.fromEntries(POSITIONS.map(p => [p.value, p.title]));

export function scopesForPosition(position) {
  return SCOPES.filter(s => s.positions.includes(position));
}

// First thing stopping this tag from being saved, or null.
export function tagProblem(form, isDevelopment = false) {
  if (!String(form.name || '').trim()) return 'Give the tag a name.';
  try { if (new URL(String(form.tag_url || '').trim()).protocol !== 'https:') throw new Error(); } catch { return 'Paste the full https:// VAST tag URL from your ad server.'; }
  if (!POSITIONS.some(p => p.value === form.ad_type)) return 'Pick a position.';
  const scope = SCOPES.find(s => s.value === form.scope);
  if (!scope) return 'Pick where the tag applies.';
  if (!scope.positions.includes(form.ad_type)) return `${POSITION_LABELS[form.ad_type]} can't run on ${scope.label.toLowerCase()}.`;
  if (!(form.platforms || []).length) return 'Choose at least one player: Browser, Apple TV or both.';
  if (form.ad_type === 'mid_roll' && form.scope === 'live' && !(form.platforms || []).every(p => p === 'tvos')) return 'Live mid-rolls are an Apple TV development test only; untick Browser.';
  return appleTVPlacementError(form, isDevelopment);
}

// Row to store. content_id stays text; blank means "every title of that type".
export function tagPayload(form) {
  const scope = SCOPES.find(s => s.value === form.scope);
  return {
    name: String(form.name).trim(), tag_url: String(form.tag_url).trim(), ad_type: form.ad_type, scope: form.scope,
    content_id: scope?.picker && String(form.content_id || '').trim() !== '' ? String(form.content_id).trim() : null,
    active: !!form.active, is_test: form.is_test !== false, platforms: form.platforms || ['web'],
  };
}

export function describeTarget(tag, titles = {}) {
  const base = SCOPE_LABELS[tag.scope] || tag.scope;
  if (!tag.content_id) return base;
  const title = titles[`${tag.scope}:${tag.content_id}`];
  return title ? `${base} · ${title}` : `${base} · #${tag.content_id}`;
}

export const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value));
