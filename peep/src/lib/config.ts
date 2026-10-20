// Explicit environment selection; missing configuration must never contact an old project.
import { resolveSupabaseEnvironment } from './supabaseEnvironment.js';
const config = resolveSupabaseEnvironment(import.meta.env);
export const SUPABASE_URL = config.url;
export const SUPABASE_ANON_KEY = config.publicKey;
export const IS_DEV_DB = config.isDevelopment;
