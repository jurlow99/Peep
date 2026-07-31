import { supabase } from "../supabase";

// Lightweight feature flags, stored as app_settings rows keyed `flag_<key>` ("true"/"false").
// Add a new flag by adding it to this registry — the CMS panel and app both read from here.
export const FEATURE_FLAGS = [
  { key: "live_now_home", label: "Live Now on homepage", description: "Show a 'Live Now' row of live TV channels & live streamers on the browse home.", default: true },
  { key: "show_podcasts", label: "Podcasts tab", description: "Show the Podcasts tab in the main navigation.", default: true },
];

const DEFAULTS = Object.fromEntries(FEATURE_FLAGS.map(f => [f.key, f.default]));
let cache = { ...DEFAULTS };

export function getFlags() { return cache; }

export async function loadFlags() {
  const { data, error } = await supabase.from("app_settings").select("key, value").like("key", "flag_%");
  const next = { ...DEFAULTS };
  if (!error) (data || []).forEach(r => { next[r.key.replace(/^flag_/, "")] = r.value === "true"; });
  cache = next;
  return next;
}

export async function setFlag(key, on) {
  const { error } = await supabase.from("app_settings").upsert({ key: `flag_${key}`, value: on ? "true" : "false" }, { onConflict: "key" });
  if (!error) cache = { ...cache, [key]: on };
  return { error };
}
