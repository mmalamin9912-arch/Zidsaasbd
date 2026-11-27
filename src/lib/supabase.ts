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

/*
 * NEVER FALL BACK TO THE SERVICE-ROLE KEY HERE.
 *
 * This module is bundled into the BROWSER. Vite inlines `VITE_*` values at
 * build time, so listing `SUPABASE_SERVICE_ROLE_KEY` as a fallback shipped the
 * key that BYPASSES Row Level Security to every visitor — anyone could read the
 * whole database (orders, customers, OTPs) with `curl`. It also silently defeated
 * any RLS we enable: the browser would keep bypassing it.
 *
 * Only the public anon key belongs in a client bundle. Server-side code that
 * genuinely needs elevated access must use the server Supabase client (it runs
 * in Node and can read the service key at request time).
 */
const rawSupabaseAnonKey =
  metaEnv.VITE_SUPABASE_ANON_KEY ||
  metaEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  procEnv.VITE_SUPABASE_ANON_KEY ||
  procEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  metaEnv.SUPABASE_ANON_KEY ||
  procEnv.SUPABASE_ANON_KEY ||
  metaEnv.VITE_SUPABASE_KEY ||
  metaEnv.SUPABASE_KEY ||
  procEnv.VITE_SUPABASE_KEY ||
  procEnv.SUPABASE_KEY ||
  '';

export const supabaseUrl = cleanEnvUrl(rawSupabaseUrl);
export const supabaseAnonKey = cleanEnvKey(rawSupabaseAnonKey);

/** True inside the BROWSER bundle (Vite client), false on the Node server. */
const isBrowserRuntimeGlobal = typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * TABLES THAT MUST NEVER BE READ FROM THE BROWSER WITH THE PUBLIC KEY.
 *
 * Every one is protected by Row Level Security with no client SELECT policy, so
 * `GET <url>/rest/v1/<table>?store_slug=eq.…` answers `401 Unauthorized`. Those
 * were the red rows on the live dashboard console, and not one of them could
 * ever return data. The authoritative read for all of them is the backend
 * (`/api/products`, `/api/orders`, `/api/categories`, `/api/stores/…`), which
 * uses the service-role key server-side.
 *
 * Guarding at the CLIENT level (rather than at each call site) means a future
 * `supabase.from('products')` somewhere cannot bring those 401s back.
 */
const BROWSER_BLOCKED_TABLES = new Set([
  'stores',
  'products',
  'orders',
  'categories',
  'courier_orders',
  'subscriptions',
  'subscription_plans',
]);

/** A PostgREST-like result for a browser read that is refused WITHOUT a request. */
function blockedTableResult(table: string, method: string) {
  const message =
    `[supabase] ${method} on "${table}" is served by the backend API, not the browser ` +
    `(the public key cannot read this RLS-protected table).`;
  return { data: null, error: { message, code: 'BROWSER_READ_BLOCKED', status: 401 } };
}

/**
 * Wrap a Supabase client so BROWSER reads of {@link BROWSER_BLOCKED_TABLES}
 * short-circuit instead of sending a request that is guaranteed to answer 401.
 *
 * Only `select` is intercepted: the mirror WRITES those call sites already do
 * (each guarded by its own circuit breaker) keep their present behaviour, and
 * nothing that used to succeed changes — these tables never returned rows to the
 * browser in the first place.
 */
function guardBrowserTableReads<T extends SupabaseClient>(client: T): T {
  if (!isBrowserRuntimeGlobal) return client;
  const originalFrom = (client as any).from.bind(client);
  (client as any).from = (table: string) => {
    const query = originalFrom(table as any);
    if (!BROWSER_BLOCKED_TABLES.has(String(table || '').toLowerCase())) return query;
    const originalSelect = (query as any).select;
    if (typeof originalSelect !== 'function') return query;
    (query as any).select = () => {
      const result = blockedTableResult(table, 'SELECT');
      // Chainable terminal: `…select(…).eq(…).limit(1)` resolves to `result`.
      const terminal: any = {
        ...result,
        eq: () => terminal,
        neq: () => terminal,
        in: () => terminal,
        or: () => terminal,
        order: () => terminal,
        limit: () => terminal,
        range: () => terminal,
        maybeSingle: async () => result,
        single: async () => result,
        then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
      };
      return terminal;
    };
    return query;
  };
  return client;
}

/*
 * Fail loudly (in dev) if a privileged key reached the browser bundle. A
 * service-role JWT carries `"role":"service_role"` in its payload, so it is
 * detectable without verifying the signature.
 */
(function assertNoPrivilegedKeyInBrowser() {
  if (typeof window === 'undefined' || !supabaseAnonKey) return;
  try {
    const payload = supabaseAnonKey.split('.')[1];
    if (!payload) return;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (json?.role && json.role !== 'anon') {
      console.error(
        '[supabase] SECURITY: a privileged key (role=' + json.role + ') was exposed to the browser ' +
        'bundle. Remove SUPABASE_SERVICE_ROLE_KEY from any NEXT_PUBLIC_/VITE_ variable and rebuild.'
      );
    }
  } catch {
    // Not a JWT (newer publishable keys) — nothing to inspect.
  }
})();

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
    /*
     * LAST LINE OF DEFENCE AGAINST THE 401 STORM.
     *
     * A `select` on `stores` / `products` / `orders` / `categories` from this
     * bundle can only ever answer `401 Unauthorized` (RLS, no client policy), so
     * the client is wrapped to answer those reads locally and never send them.
     */
    _client = guardBrowserTableReads(_client);
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
  /**
   * True when the request was intentionally NOT sent — either the column set or
   * a schema/permission failure is already known for this table (see the write
   * failure guard), so retrying would only repeat a guaranteed 400/401.
   */
  skipped?: boolean;
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

/* ── Write failure guard (circuit breaker) ──────────────────────────────────
 *
 * WHY THIS EXISTS
 * ---------------
 * A `400` on `subscriptions?on_conflict=merchant_email` (no unique index on the
 * deployed table) or a `401` on `stores?on_conflict=email` (the anon key is not
 * allowed to write, e.g. RLS enabled with no policy) is a SCHEMA / PERMISSION
 * condition: the identical request can never start succeeding on its own. Yet
 * every dashboard action re-ran the whole retry ladder, so the Network tab
 * filled with the SAME failing URL — the "please retry" experience the merchant
 * reported.
 *
 * Once a table+endpoint combination has failed this way, the next writes to it
 * short-circuit for a few minutes and are reported as `skipped` instead of
 * hitting the network again. The caller's write is already best-effort (MongoDB
 * and the /api server are the authoritative paths), so skipping it costs
 * nothing except a request that was guaranteed to fail.
 *
 * The guard is per TABLE and clears on its own, so a fixed schema (index added)
 * starts writing again without a reload.
 */
const writeFailureCache = new Map<string, { reason: string; expiresAt: number }>();
const WRITE_FAILURE_TTL_MS = 2 * 60 * 1000;

/** Read the active block reason for `table`, or null when writing is allowed. */
function blockedWriteReason(table: string): string | null {
  const entry = writeFailureCache.get(table);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    writeFailureCache.delete(table);
    return null;
  }
  return entry.reason;
}

/** Block further writes to `table` for the TTL window. */
function blockWrites(table: string, reason: string): void {
  writeFailureCache.set(table, { reason, expiresAt: Date.now() + WRITE_FAILURE_TTL_MS });
}

/*
 * Rejected `on_conflict` TARGETS.
 *
 * SQLSTATE 42P10 means "there is no unique or exclusion constraint matching the
 * ON CONFLICT specification" — the upsert will ALWAYS answer 400 on this table
 * until the index is created. The natural-key fallback still saves the row, so
 * the write succeeds, but the doomed `?on_conflict=…` request was re-sent on
 * every save, which is exactly the repeated 400 in the Network tab.
 *
 * Remembering the target lets the next call skip that request and go straight to
 * the fallback that works. Keyed per table+column and self-clearing, so adding
 * the unique index restores the single-request upsert on its own.
 */
const rejectedConflictTargets = new Map<string, number>();

function conflictTargetKey(table: string, onConflict: string): string {
  return `${table}:${onConflict}`;
}

function conflictTargetRejected(table: string, onConflict?: string): boolean {
  if (!onConflict) return false;
  const key = conflictTargetKey(table, onConflict);
  const expiresAt = rejectedConflictTargets.get(key);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    rejectedConflictTargets.delete(key);
    return false;
  }
  return true;
}

function rememberRejectedConflictTarget(table: string, onConflict?: string): void {
  if (!onConflict) return;
  rejectedConflictTargets.set(
    conflictTargetKey(table, onConflict),
    Date.now() + WRITE_FAILURE_TTL_MS,
  );
}

/**
 * Is this failure PERMANENT (schema / permission) rather than transient?
 *
 *  - 401 / 403 / 42501 : the key may not write at all (RLS, grants).
 *  - 42P10            : `on_conflict` targets a column with no unique index.
 *  - PGRST204 / 42703 : the column does not exist in the deployed table.
 *
 * A network timeout or a 5xx is deliberately NOT permanent — those recover.
 */
function isPermanentWriteFailure(status?: number, code?: string, message?: string): boolean {
  if (status === 401 || status === 403) return true;
  const normalized = String(code || '').toUpperCase();
  if (normalized === '42P10' || normalized === '42501') return true;
  if (normalized === 'PGRST204' || normalized === '42703') return true;
  // 400 carrying a schema/permission hint in the body.
  if (status === 400 && /on conflict|unique or exclusion constraint|permission denied|does not exist|row-level security/i.test(String(message || ''))) {
    return true;
  }
  return false;
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
 *     A 42P10 target is REMEMBERED, so later saves skip the doomed `on_conflict`
 *     request and go straight to the fallback (no repeated 400).
 *
 * Permanent schema/permission failures (401/403/42P10/PGRST204) put the table in
 * a short "paused" window, so a dashboard action cannot keep re-sending a
 * request that is guaranteed to fail. Paused calls return `{ skipped: true }`.
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

  /*
   * CIRCUIT BREAKER — do not re-send a request that already failed for a
   * schema / permission reason. The caller treats `skipped` exactly like the
   * failure it would have received, so nothing in the UI changes; the only
   * difference is that the Network tab stops filling with the same 400/401.
   */
  const blocked = blockedWriteReason(table);
  if (blocked) {
    return {
      ok: false,
      skipped: true,
      code: 'WRITE_BLOCKED',
      error: `${table} writes are paused for a moment (last error: ${blocked}).`,
    };
  }

  const row = sanitizeSupabaseRow(payload);
  for (const stale of preDroppedColumns(table)) delete row[stale];
  if (Object.keys(row).length === 0) {
    return { ok: false, error: 'Empty payload after sanitisation.', code: 'EMPTY_PAYLOAD' };
  }

  const dropped = new Set<string>();
  const maxRetries = opts.maxRetries ?? 8;

  /*
   * SKIP A CONFLICT TARGET ALREADY PROVEN INVALID (42P10).
   *
   * The natural-key fallback below succeeds, so the previous write looked fine —
   * but the `?on_conflict=…` request before it can never succeed without the
   * unique index, and it was re-sent on every save. Going straight to the
   * fallback keeps the write working and stops the repeated 400.
   */
  if (
    conflictTargetRejected(table, opts.onConflict) &&
    opts.matchColumn &&
    row[opts.matchColumn] !== undefined &&
    row[opts.matchColumn] !== null &&
    String(row[opts.matchColumn]).trim() !== ''
  ) {
    return await upsertByNaturalKey(client, table, row, opts.matchColumn);
  }

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
        /*
         * 42P10 = "no unique constraint matching ON CONFLICT". The fallback saves
         * the row, so this is NOT a dead end — but the conflict target itself is
         * unusable until the index exists, so remember it and stop re-sending
         * the doomed `?on_conflict=…` request on every later save.
         *
         * A plain 23505/409 (a real duplicate) is data, not schema: not cached.
         */
        if (code === '42P10' || /no unique or exclusion constraint matching/i.test(message)) {
          rememberRejectedConflictTarget(table, opts.onConflict);
        }
        const fallback = await upsertByNaturalKey(client, table, row, matchColumn);
        return {
          ...fallback,
          fallbackUsed: true,
          droppedColumns: dropped.size ? Array.from(dropped) : undefined,
        };
      }

      // Remember a permanent rejection (schema / permission) so the next write
      // short-circuits instead of repeating this exact request.
      const permanent = isPermanentWriteFailure(status, code, message);
      if (permanent) blockWrites(table, `${status || code} ${message || 'rejected'}`.trim());

      return {
        ok: false,
        status,
        code: code || undefined,
        error: message || 'Supabase upsert failed.',
        droppedColumns: dropped.size ? Array.from(dropped) : undefined,
        ...(permanent ? { skipped: true } : {}),
      };
    } catch (err) {
      return { ok: false, error: supabaseErrorMessage(err, `Supabase ${table} upsert failed.`) };
    }
  }

  // Retry budget exhausted (only reachable for repeated unknown-column drops).
  blockWrites(table, 'PGRST204 columns still unknown after retries');
  return {
    ok: false,
    status: 400,
    code: 'PGRST204',
    error: `Payload still contains columns unknown to ${table} after ${maxRetries} retries.`,
    droppedColumns: dropped.size ? Array.from(dropped) : undefined,
    skipped: true,
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
  /*
   * The fallback issues up to three more requests (update → select → insert).
   * When the table is already known to reject writes (401 on `stores` with a
   * read-only key, for example) those three would each fail too — that triple
   * is what made the Network tab look like a retry loop. Stop before sending.
   */
  const blocked = blockedWriteReason(table);
  if (blocked) {
    return {
      ok: false,
      skipped: true,
      code: 'WRITE_BLOCKED',
      fallbackUsed: true,
      error: `${table} writes are paused for a moment (last error: ${blocked}).`,
    };
  }

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
      // A 401 here is the "read-only key / RLS" case: record it so the next
      // save does not re-run update → select → insert against the same wall.
      const permanentUpdate = isPermanentWriteFailure(status, String(updateError?.code ?? ''), message);
      if (permanentUpdate) blockWrites(table, `${status || updateError?.code} ${message || 'rejected'}`.trim());

      return {
        ok: false,
        status,
        code: String(updateError?.code ?? '') || undefined,
        error: message || 'Fallback update failed.',
        ...(permanentUpdate ? { skipped: true } : {}),
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
        const retryStatus = (retry.error as any)?.status;
        const retryMessage = String(retry.error?.message || '');
        // The retry itself may be the permanent failure (e.g. 401) — record it
        // so the pattern does not repeat on the next save.
        const permanentRetry = isPermanentWriteFailure(
          retryStatus,
          String((retry.error as any)?.code ?? ''),
          retryMessage,
        );
        if (permanentRetry) blockWrites(table, `${retryStatus} ${retryMessage || 'rejected'}`.trim());
        return {
          ok: false,
          status: retryStatus,
          error: retryMessage,
          ...(permanentRetry ? { skipped: true } : {}),
        };
      }
      const permanentInsert = isPermanentWriteFailure(status, String(insertError?.code ?? ''), message);
      if (permanentInsert) blockWrites(table, `${status || insertError?.code} ${message || 'rejected'}`.trim());

      return {
        ok: false,
        status,
        code: String(insertError?.code ?? '') || undefined,
        error: message || 'Fallback insert failed.',
        ...(permanentInsert ? { skipped: true } : {}),
      };
    }
    return { ok: true, fallbackUsed: true };
  } catch (err) {
    return { ok: false, error: supabaseErrorMessage(err, `Fallback ${table} write failed.`) };
  }
}
