// The "to convert" list: files the importer couldn't take, kept until their MP4 twin turns up.
import { supabase } from '../supabase';

export async function listConversions() {
  const { data, error } = await supabase.from('conversion_queue').select('*').is('done_at', null).order('path');
  if (error) throw error;
  return data || [];
}

// items: [{ key, name, size, reason }] from the importer plan
export async function queueConversions(items) {
  const rows = items.map(i => ({ path: i.key, name: i.name, bytes: i.size || null, reason: i.reason || null }));
  const { error } = await supabase.from('conversion_queue').upsert(rows, { onConflict: 'path', ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

export async function finishConversions(paths) {
  if (!paths.length) return;
  const { error } = await supabase.from('conversion_queue').update({ done_at: new Date().toISOString() }).in('path', paths).is('done_at', null);
  if (error) throw error;
}

// One line per file, grouped by folder, ready to paste into a chat.
export function conversionListText(rows) {
  const byFolder = {};
  for (const row of rows) {
    const parts = row.path.split('/');
    const folder = parts.slice(0, -1).join('/') || '(top level)';
    (byFolder[folder] ||= []).push(parts[parts.length - 1]);
  }
  return Object.entries(byFolder).map(([folder, names]) => `${folder}\n${names.map(n => `  - ${n}`).join('\n')}`).join('\n\n');
}
