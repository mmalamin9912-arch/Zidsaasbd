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
        // Session persistence + URL detection are ON so the OAuth redirect back
        // from Google/Facebook is parsed for the `?code=`/`#access_token` pair.
        // With these off, the provider round-trip returned a valid session that
        // the client silently discarded — the merchant landed on the login form
        // again and reported "Google login is broken".
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // PKCE keeps the auth code exchange safe for a SPA without a server
        // secret; both providers share this flow.
        flowType: 'pkce',
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

/* ══════════════════════════════════════════════════════════════════════════
 * Safe request helpers — 400 Bad Request hardening
 *
 * PostgREST rejects an ENTIRE write with HTTP 400 when a single payload key is
 * not a real column (PGRST204), when a value cannot be cast to the column type
 * (SQLSTATE 22P02), or when `on_conflict=<col>` names a column without a
 * matching unique constraint (SQLSTATE 42P10). GoTrue answers HTTP 400 for
 * malformed credentials on `token?grant_type=password` too.
 *
 * The helpers below validate input BEFORE the request, sanitise payloads to
 * Supabase's expected JSON schema, and — when a 400 still arrives — retry with
 * the offending field removed or fall back to a natural-key update, so a
 * schema mismatch can never throw into a UI action.
 * ══════════════════════════════════════════════════════════════════════════ */

export interface SafeWriteResult {
  ok: boolean;
  /** HTTP status of the failing request, when one completed. */
  status?: number;
  /** Readable error message (never throws, never empty on failure). */
  error?: string;
  /** PostgREST/PG error code (e.g. PGRST204, 42P10, 22P02) when available. */
  code?: string;
  /** Columns that were dropped from the payload after a PGRST204 rejection. */
  droppedColumns?: string[];
  /** True when the natural-key fallback (update → insert) was used. */
  fallbackUsed?: boolean;
}

export interface SafeAuthResult<T = any> {
  ok: boolean;
  /** True when the request was intentionally NOT sent (invalid input / no client). */
  skipped: boolean;
  data?: T | null;
  error?: string;
  status?: number;
  reason?: 'invalid_input' | 'no_client' | 'request_failed';
}

/** Per-table cache of columns PostgREST rejected, so we probe only once. */
const droppedColumnCache = new Map<string, { cols: Set<string>; expiresAt: number }>();
const DROPPED_COLUMN_TTL_MS = 5 * 60 * 1000;

function rememberDroppedColumn(table: string, column: string): void {
  const now = Date.now();
  const entry = droppedColumnCache.get(table);
  if (entry && entry.expiresAt > now) {
    entry.cols.add(column);
    return;
  }
  droppedColumnCache.set(table, { cols: new Set([column]), expiresAt: now + DROPPED_COLUMN_TTL_MS });
}

function preDroppedColumns(table: string): string[] {
  const entry = droppedColumnCache.get(table);
  if (!entry || entry.expiresAt <= Date.now()) return [];
  return Array.from(entry.cols);
}

/** Extract the offending column name from a PostgREST/PG error message. */
function extractUnknownColumn(message: string): string | null {
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column "([^"]+)" of (?:relation|table) "[^"]+" does not exist/i,
    /column ([a-zA-Z0-9_]+) of relation/i,
  ];
  for (const re of patterns) {
    const m = re.exec(message);
    if (m && m[1]) return m[1];
  }
  return null;
}

/**
 * Normalise an arbitrary thrown value / Supabase error into a readable message.
 * Handles AuthApiError (`msg`), PostgrestError (`message` + `code`), plain
 * strings and unknown objects without ever throwing.
 */
export function supabaseErrorMessage(err: any, fallback = 'Supabase request failed.'): string {
  if (err === null || err === undefined) return fallback;
  if (typeof err === 'string') return err.trim() || fallback;
  try {
    const msg = err.message || err.msg || err.error_description || err.error || '';
    if (typeof msg === 'string' && msg.trim()) {
      const code = err.code || err.status;
      return code ? `${msg} (code: ${code})` : msg;
    }
    if (typeof err.status === 'number') return `Supabase responded ${err.status}.`;
  } catch {
    /* fall through */
  }
  return fallback;
}

/**
 * Build a Supabase-ready row payload:
 *  - drops `undefined` / functions / symbols (never valid JSON values),
 *  - converts `Date` objects to ISO-8601 strings,
 *  - coerces non-finite numbers to `null`,
 *  - validates `*_at` / `*_timestamp` strings — an unparseable timestamp is
 *    dropped instead of reaching PostgREST as SQLSTATE 22P02 (HTTP 400),
 *  - keeps `null` (explicit clear) and booleans/objects untouched.
 */
export function sanitizeSupabaseRow(row: Record<string, any> | null | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  if (!row || typeof row !== 'object' || Array.isArray(row)) return out;
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue;
    if (typeof value === 'function' || typeof value === 'symbol') continue;
    if (typeof value === 'number') {
      out[key] = Number.isFinite(value) ? value : null;
      continue;
    }
    if (value instanceof Date) {
      const iso = Number.isNaN(value.getTime()) ? '' : value.toISOString();
      if (!iso) continue; // invalid Date would serialise as null → 22P02 on *_at
      out[key] = iso;
      continue;
    }
    if (typeof value === 'string' && /(_at|_timestamp)$/.test(key)) {
      const parsed = Date.parse(value);
      // Invalid timestamp strings are dropped — sending them 400s the whole row.
      if (Number.isNaN(parsed)) continue;
      out[key] = new Date(parsed).toISOString();
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Validate credentials BEFORE hitting GoTrue.
 *
 * Returns `null` when the payload is safe to send, or a human-readable reason
 * when firing the request would guarantee a 400 (`token?grant_type=password`
 * rejects malformed emails, empty passwords and passwords shorter than 6
 * characters on every GoTrue validation path).
 */
export function validateSupabaseCredentials(
  creds: { email?: string; password?: string },
  opts: { minPasswordLength?: number } = {}
): string | null {
  const email = String(creds?.email ?? '').trim().toLowerCase();
  const password = String(creds?.password ?? '');
  if (!email) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    return 'Enter a valid email address.';
  }
  if (!password) return 'Password is required.';
  const min = opts.minPasswordLength ?? 0;
  if (min > 0 && password.length < min) {
    return `Password must be at least ${min} characters.`;
  }
  return null;
}

/**
 * `supabase.auth.signInWithPassword` that NEVER throws.
 *
 * Invalid input returns `{ skipped: true }` WITHOUT sending the request (so a
 * doomed GoTrue `token?grant_type=password` call never appears in the Network
 * tab as a 400), and any GoTrue 400 (`invalid_credentials`, `user_not_found`,
 * validation errors) is returned as `{ ok: false, error, status }` for the
 * caller to route gracefully instead of crashing the UI action.
 */
export async function safeSignInWithPassword(
  client: SupabaseClient | null,
  creds: { email: string; password: string },
  opts: { minPasswordLength?: number } = { minPasswordLength: 6 }
): Promise<SafeAuthResult> {
  const inputIssue = validateSupabaseCredentials(creds, opts);
  if (inputIssue) return { ok: false, skipped: true, error: inputIssue, reason: 'invalid_input' };
  if (!client) return { ok: false, skipped: true, error: 'Supabase client unavailable.', reason: 'no_client' };
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: String(creds.email).trim().toLowerCase(),
      password: String(creds.password),
    });
    if (error) {
      const status = (error as any)?.status;
      return { ok: false, skipped: false, data: data ?? null, error: supabaseErrorMessage(error), status };
    }
    return { ok: true, skipped: false, data };
  } catch (err) {
    return { ok: false, skipped: false, error: supabaseErrorMessage(err), reason: 'request_failed' };
  }
}

/**
 * `supabase.auth.updateUser({ password })` that NEVER throws.
 *
 * GoTrue rejects passwords shorter than 6 characters with HTTP 400, so invalid
 * input short-circuits before the request. Optional `data` metadata is merged
 * only when the password itself is valid, keeping profile updates atomic.
 */
export async function safeUpdateAuthPassword(
  client: SupabaseClient | null,
  password: string,
  opts: { data?: Record<string, any>; minPasswordLength?: number } = {}
): Promise<SafeAuthResult> {
  const min = opts.minPasswordLength ?? 6;
  const clean = String(password ?? '');
  if (!clean) return { ok: false, skipped: true, error: 'Password is required.', reason: 'invalid_input' };
  if (clean.length < min) {
    return {
      ok: false,
      skipped: true,
      error: `Password must be at least ${min} characters.`,
      reason: 'invalid_input',
    };
  }
  if (!client) return { ok: false, skipped: true, error: 'Supabase client unavailable.', reason: 'no_client' };
  try {
    const payload: Record<string, any> = { password: clean };
    if (opts.data && typeof opts.data === 'object') payload.data = opts.data;
    const { data, error } = await (client.auth.updateUser as any)(payload);
    if (error) {
      const status = (error as any)?.status;
      return { ok: false, skipped: false, data: data ?? null, error: supabaseErrorMessage(error), status };
    }
    return { ok: true, skipped: false, data };
  } catch (err) {
    return { ok: false, skipped: false, error: supabaseErrorMessage(err), reason: 'request_failed' };
  }
}

/**
 * `upsert` that survives PostgREST 400s. Strategy, in order:
 *
 *  1. Sanitise the payload (types, timestamps, optional fields).
 *  2. Drop any column previously rejected for this table (cached).
 *  3. Attempt the upsert (with `onConflict` when supplied).
 *  4. On PGRST204 "Could not find the '<col>' column" → drop that column, cache
 *     it, and retry — a speculative column can no longer poison the whole write.
 *  5. On 22P02 "invalid input syntax" → drop the key(s) whose value appears in
 *     the error message and retry.
 *  6. On 42P10/409/unique-constraint rejection of `on_conflict` → fall back to
 *     `update().eq(matchColumn, …)` and insert only when nothing matched, so a
 *     missing unique constraint on `email` degrades gracefully instead of 400ing.
 *
 * Never throws — callers get `{ ok, error, status }` and decide how loud to be.
 */
export async function safeUpsertRow(
  client: SupabaseClient | null,
  table: string,
  payload: Record<string, any>,
  opts: { onConflict?: string; matchColumn?: string; maxRetries?: number } = {}
): Promise<SafeWriteResult> {
  if (!client) return { ok: false, error: 'Supabase client unavailable.', code: 'NO_CLIENT' };
  const row = sanitizeSupabaseRow(payload);
  for (const stale of preDroppedColumns(table)) delete row[stale];
  if (Object.keys(row).length === 0) {
    return { ok: false, error: 'Empty payload after sanitisation.', code: 'EMPTY_PAYLOAD' };
  }

  const dropped = new Set<string>();
  const maxRetries = opts.maxRetries ?? 8;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const upsertOpts = opts.onConflict ? { onConflict: opts.onConflict } : undefined;
      const { error } = await (client.from(table).upsert as any)(row, upsertOpts);
      if (!error) {
        return { ok: true, droppedColumns: dropped.size ? Array.from(dropped) : undefined };
      }

      const status = (error as any)?.status;
      const code = String(error?.code ?? '');
      const message = String(error?.message ?? (error as any)?.msg ?? '');

      // (4) Unknown column → drop it and retry.
      const unknownCol =
        extractUnknownColumn(message) || extractUnknownColumn(String((error as any)?.details || ''));
      if (unknownCol && Object.prototype.hasOwnProperty.call(row, unknownCol)) {
        delete row[unknownCol];
        dropped.add(unknownCol);
        rememberDroppedColumn(table, unknownCol);
        console.warn(`[supabase] Dropped unknown column "${unknownCol}" from ${table} upsert payload.`);
        continue;
      }

      // (5) Cast failure → drop every key whose value is quoted in the message.
      if (status === 400 && /invalid input syntax for type/i.test(message)) {
        let removedAny = false;
        for (const [key, value] of Object.entries(row)) {
          if (typeof value === 'string' && value.length >= 3 && message.includes(`"${value}"`)) {
            delete row[key];
            dropped.add(key);
            rememberDroppedColumn(table, key);
            removedAny = true;
          }
        }
        if (removedAny) {
          console.warn(`[supabase] Dropped uncastable value(s) from ${table} upsert payload.`);
          continue;
        }
      }

      // (6) on_conflict / unique violation → natural-key fallback.
      const conflictRejected =
        status === 409 ||
        code === '42P10' ||
        code === '23505' ||
        /unique or exclusion constraint|on conflict|duplicate key/i.test(message);
      const matchColumn = opts.matchColumn;
      if (
        conflictRejected &&
        matchColumn &&
        row[matchColumn] !== undefined &&
        row[matchColumn] !== null &&
        row[matchColumn] !== ''
      ) {
        const fallback = await upsertByNaturalKey(client, table, row, matchColumn);
        return {
          ...fallback,
          fallbackUsed: true,
          droppedColumns: dropped.size ? Array.from(dropped) : undefined,
        };
      }

      return {
        ok: false,
        status,
        code: code || undefined,
        error: message || 'Supabase upsert failed.',
        droppedColumns: dropped.size ? Array.from(dropped) : undefined,
      };
    } catch (err) {
      return { ok: false, error: supabaseErrorMessage(err, `Supabase ${table} upsert failed.`) };
    }
  }

  return {
    ok: false,
    status: 400,
    code: 'PGRST204',
    error: `Payload still contains columns unknown to ${table} after ${maxRetries} retries.`,
    droppedColumns: dropped.size ? Array.from(dropped) : undefined,
  };
}

/** update-by-key → insert-if-nothing-matched. Used when `on_conflict` is rejected. */
async function upsertByNaturalKey(
  client: SupabaseClient,
  table: string,
  row: Record<string, any>,
  matchColumn: string,
  depth = 0
): Promise<SafeWriteResult> {
  // A missing/empty natural key must NEVER be sent as `?col=eq.undefined` —
  // that is an invalid query parameter that would 400 on every attempt and
  // turn one bad payload into a stream of rapid failing retries.
  const matchValue = row[matchColumn];
  if (
    matchValue === undefined ||
    matchValue === null ||
    (typeof matchValue === 'string' && !matchValue.trim())
  ) {
    return {
      ok: false,
      code: 'NO_MATCH_KEY',
      error: `Cannot fall back to an update on "${table}.${matchColumn}" — the natural key value is missing from the payload.`,
    };
  }
  // Bounded recursion: each level drops at most one rejected column.
  if (depth > 3) {
    return {
      ok: false,
      code: 'MAX_DEPTH',
      error: `Fallback update for ${table}.${matchColumn} exceeded its retry budget.`,
    };
  }

  try {
    const { error: updateError } = await client.from(table).update(row).eq(matchColumn, matchValue);
    if (updateError) {
      const status = (updateError as any)?.status;
      const message = String(updateError?.message || '');
      // The natural-key column itself may be unknown here — drop & retry once.
      const unknownCol = extractUnknownColumn(message);
      if (unknownCol && Object.prototype.hasOwnProperty.call(row, unknownCol)) {
        delete row[unknownCol];
        rememberDroppedColumn(table, unknownCol);
        console.warn(`[supabase] Dropped unknown column "${unknownCol}" from ${table} fallback update.`);
        return upsertByNaturalKey(client, table, row, matchColumn, depth + 1);
      }
      return {
        ok: false,
        status,
        code: String(updateError?.code ?? '') || undefined,
        error: message || 'Fallback update failed.',
      };
    }

    // Confirm the key exists; insert only when it does not (a plain upsert's
    // insert half) — never blind-insert, or duplicate rows would appear.
    const { data: matched, error: selectError } = await client
      .from(table)
      .select('id')
      .eq(matchColumn, matchValue)
      .limit(1);
    if (!selectError && Array.isArray(matched) && matched.length > 0) {
      return { ok: true, fallbackUsed: true };
    }

    const { error: insertError } = await client.from(table).insert(row);
    if (insertError) {
      const status = (insertError as any)?.status;
      const message = String(insertError?.message || '');
      const unknownCol = extractUnknownColumn(message);
      if (unknownCol && Object.prototype.hasOwnProperty.call(row, unknownCol)) {
        delete row[unknownCol];
        rememberDroppedColumn(table, unknownCol);
        console.warn(`[supabase] Dropped unknown column "${unknownCol}" from ${table} fallback insert.`);
        const retry = await client.from(table).insert(row);
        if (!retry.error) return { ok: true, fallbackUsed: true, droppedColumns: [unknownCol] };
        return {
          ok: false,
          status: (retry.error as any)?.status,
          error: String(retry.error?.message || ''),
        };
      }
      return {
        ok: false,
        status,
        code: String(insertError?.code ?? '') || undefined,
        error: message || 'Fallback insert failed.',
      };
    }
    return { ok: true, fallbackUsed: true };
  } catch (err) {
    return { ok: false, error: supabaseErrorMessage(err, `Fallback ${table} write failed.`) };
  }
}
