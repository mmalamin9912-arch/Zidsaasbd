import { createClient, SupabaseClient } from '@supabase/supabase-js';

function cleanEnvUrl(raw?: string): string {
  if (!raw) return '';
  let str = String(raw).trim();
  str = str.replace(/^["'`\\]+|["'`\\]+$/g, '').trim();
  str = str.replace(/^["'`\\]+|["'`\\]+$/g, '').trim();
  return str.replace(/\/+$/, '');
}

function cleanEnvKey(raw?: string): string {
  if (!raw) return '';
  let str = String(raw).trim();
  str = str.replace(/^["'`\\]+|["'`\\]+$/g, '').trim();
  return str.replace(/^["'`\\]+|["'`\\]+$/g, '').trim();
}

function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Safely read env — works in both Vite (import.meta.env) and Node (process.env)
const metaEnv = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
const procEnv = (typeof process !== 'undefined' && process.env) || {};

const rawSupabaseUrl =
  metaEnv.VITE_SUPABASE_URL ||
  procEnv.VITE_SUPABASE_URL ||
  metaEnv.NEXT_PUBLIC_SUPABASE_URL ||
  procEnv.NEXT_PUBLIC_SUPABASE_URL ||
  metaEnv.SUPABASE_URL ||
  procEnv.SUPABASE_URL ||
  '';

const rawSupabaseAnonKey =
  metaEnv.VITE_SUPABASE_ANON_KEY ||
  procEnv.VITE_SUPABASE_ANON_KEY ||
  metaEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  procEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  metaEnv.SUPABASE_ANON_KEY ||
  procEnv.SUPABASE_ANON_KEY ||
  metaEnv.SUPABASE_SERVICE_ROLE_KEY ||
  procEnv.SUPABASE_SERVICE_ROLE_KEY ||
  metaEnv.VITE_SUPABASE_KEY ||
  metaEnv.SUPABASE_KEY ||
  procEnv.VITE_SUPABASE_KEY ||
  procEnv.SUPABASE_KEY ||
  '';

export const supabaseUrl = cleanEnvUrl(rawSupabaseUrl);
export const supabaseAnonKey = cleanEnvKey(rawSupabaseAnonKey);

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  isValidUrl(supabaseUrl)
);

// Lazy singleton — never throws at module load time
let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (_client) return _client;
  if (!isSupabaseConfigured) {
    console.warn(
      '[supabase] Missing or invalid environment configuration. ' +
      'Set VITE_SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and ' +
      'VITE_SUPABASE_ANON_KEY in your environment variables.'
    );
    return null;
  }
  try {
    _client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    });
    return _client;
  } catch (err) {
    console.error('[supabase] createClient failed:', err);
    return null;
  }
}

// Convenience export — returns the singleton (creates it on first call)
// DOES NOT throw; callers must check for null if env is not configured.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error(
        `[supabase] Client not initialised — env vars missing. ` +
        `Tried to access property "${String(prop)}".`
      );
    }
    return (client as any)[prop];
  },
});
