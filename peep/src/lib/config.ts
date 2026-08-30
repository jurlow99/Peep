// Single source of truth for "which Supabase project is this build pointed at?"
// The client, every edge-function fetch, the FARRIS dev UI, and tier gating all
// read from here — so a build can never be half-dev, half-prod.

const PROD_REF = "iuozujwtuzuwubhsnhix";

// Falls back to prod so a missing env var degrades toward the real database
// instead of looking like dev (see IS_DEV_DB below).
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || `https://${PROD_REF}.supabase.co`;

export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// "This build is pointed at a non-prod database." Drives all the FARRIS/dev-only
// UI and disables tier filtering. Derived from the RESOLVED url above, so a build
// with no env var reads as prod (gating on) rather than dev (gating off).
export const IS_DEV_DB = !SUPABASE_URL.includes(PROD_REF);
