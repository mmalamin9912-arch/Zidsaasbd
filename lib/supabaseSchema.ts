/**
 * Supabase mirror payload builder — schema-guarded.
 *
 * THE PROBLEM
 * -----------
 * The categories mirror sent this row to the Supabase `categories` table:
 *
 *   { id, title, name, image_url, image, category_id, status,
 *     is_published, parent_id, slug, store_slug }
 *
 * PostgREST REJECTS the WHOLE request if a single key is not a real column, and
 * it answers `PGRST204: Could not find the 'category_id' column of 'categories'
 * in the schema cache`. That is what the
 * `Supabase category mirror skipped: …` warning was: the mirror silently wrote
 * NOTHING, on every category, for every save. MongoDB stays authoritative, so
 * nothing visibly broke — the mirror was just dead.
 *
 * WHY A BUILDER INSTEAD OF A RENAME
 * ---------------------------------
 * Simply deleting `category_id` would fix today's schema and re-break the day
 * a tenant's table DOES have the column. This module asks the table what columns
 * it actually has (cached briefly) and emits only those, so the mirror adapts to
 * each project instead of guessing. When introspection is unavailable — RLS
 * blocked, offline, or the table is missing — it falls back to a conservative
 * known-good core rather than sending unknown keys.
 *
 * Pure and dependency-free, so it is safe to import from both `lib/` (the
 * serverless `api/index.ts` bundle) and the browser bundle.
 */

/** Columns every reasonable `categories` table is expected to have. */
const CATEGORY_CORE_COLUMNS = ['id', 'name', 'store_slug'] as const;

/**
 * Per-column fallbacks: `[preferred, ...alternates]`. The first column that the
 * table actually has is used; if none do, the key is omitted.
 */
const CATEGORY_COLUMN_FALLBACKS: Record<string, string[]> = {
  id: ['id', 'category_id'],
  name: ['name', 'title', 'category_name'],
  title: ['title', 'name'],
  image: ['image', 'image_url', 'cover_image'],
  image_url: ['image_url', 'image', 'cover_image'],
  status: ['status', 'category_status'],
  is_published: ['is_published', 'published', 'is_active'],
  parent_id: ['parent_id', 'parent', 'parent_category_id'],
  slug: ['slug', 'category_slug', 'handle'],
  store_slug: ['store_slug', 'storeSlug', 'store_id'],
  // Legacy alias some older tables still carry. Only sent when it exists.
  category_id: ['category_id'],
  category_name: ['category_name'],
  cover_image: ['cover_image'],
  sort_order: ['sort_order', 'position', 'sort'],
};

/**
 * A tiny time-bounded cache. Column sets are stable for the life of a
 * deployment, so re-introspecting on every category save is pure waste.
 */
const columnCache = new Map<string, { columns: string[] | null; expiresAt: number }>();
const COLUMN_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Is this key a JWT (legacy `anon` key) rather than a `sb_publishable_…` key?
 *
 * Supabase's new publishable keys are opaque strings; the REST gateway cannot
 * read a role from them, so cross-checks that rely on a per-role request are
 * meaningless and would only add a rejected row to the console.
 */
function isJwt(key: string): boolean {
  return /^[\w-]+\.[\w-]+\.[\w-]+$/.test(String(key || '').trim());
}

/**
 * Read the table's columns without dumping a rejected request per absent column.
 *
 * WHY THE OLD PROBING WAS THE "400 SPAM"
 * --------------------------------------
 * The previous version fired ~20 `?select=<column>&limit=1` requests for EVERY
 * table it introspected. On the deployed project the `categories` table only has
 * `id`, `name`, `slug`, `store_slug` — every other candidate necessarily answered
 * HTTP 400 (`42703 column categories.parent_id does not exist`), so ONE dashboard
 * load printed 17-18 red rows, and every save probed again.
 *
 * ONLY THE FIRST DISCOVERY COSTS A 400
 * ------------------------------------
 * PostgREST cannot report a table's columns to a public key (`GET /rest/v1/`
 * needs a secret key, and an empty table returns `[]`, not a shape), so the
 * column set can only be learned by asking. The probing here is:
 *   • `select=*&limit=1` — when the table has a row, its keys ARE the columns
 *     (a single 200, no error).
 *   • otherwise each candidate is probed as a FILTER (`?select=id&<col>=is.null`),
 *     projected on `id`, the one column every mirrored table has. This only runs
 *     when the public key is a legacy JWT — see `isJwt`.
 *   • the answer is cached for 5 minutes, so a discovery costs at most one
 *     `select=*` per table per window instead of on every render / every save.
 *
 * `null` means "unknown", and every caller then falls back to its documented
 * core payload, which is guaranteed valid for that table.
 */
export async function fetchTableColumns(
  supabaseUrl: string,
  supabaseKey: string,
  table: string,
  candidateColumns?: string[]
): Promise<string[] | null> {
  const now = Date.now();
  const cached = columnCache.get(table);
  if (cached && cached.expiresAt > now) return cached.columns;

  let columns: string[] = [];
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: 'application/json',
        Prefer: 'count=none',
      },
    });
    if (!res.ok) {
      columnCache.set(table, { columns: null, expiresAt: now + COLUMN_CACHE_TTL_MS });
      return null;
    }

    const body: any = await res.json().catch(() => null);
    const row = Array.isArray(body) ? body[0] : body;
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      columns = Object.keys(row);
    }
  } catch {
    columns = [];
  }

  if (columns.length === 0 && candidateColumns && candidateColumns.length > 0) {
    columns = await probeColumnsByFilter(supabaseUrl, supabaseKey, table, candidateColumns);
  }

  // A table we could not read a single column from is not usable for mirroring;
  // report `null` so the caller falls back to the conservative core.
  const resolved = columns.length > 0 ? columns : null;
  columnCache.set(table, { columns: resolved, expiresAt: now + COLUMN_CACHE_TTL_MS });
  return resolved;
}

/**
 * The columns a dashboard update needs to know about, per table, in the
 * documented order (preferred spelling first, legacy aliases after — this is the
 * same order `buildCategoryMirrorPayload` maps values into).
 *
 * Only used when a table is EMPTY and a row therefore cannot reveal its columns.
 */
export const CANDIDATE_COLUMNS: Record<string, string[]> = {
  categories: Array.from(new Set(Object.values(CATEGORY_COLUMN_FALLBACKS).flat())),
  products: ['id', 'name', 'title', 'store_slug', 'storeSlug', 'price', 'price_bdt', 'priceBDT', 'stock_quantity', 'stock', 'category', 'image_url', 'image', 'created_at'],
  stores: ['id', 'store_code', 'store_slug', 'storeSlug', 'email', 'status', 'created_at'],
};

/** Resolve a table's columns, probing `CANDIDATE_COLUMNS[table]` when it is empty. */
export async function fetchKnownColumns(
  supabaseUrl: string,
  supabaseKey: string,
  table: string
): Promise<string[] | null> {
  return fetchTableColumns(supabaseUrl, supabaseKey, table, CANDIDATE_COLUMNS[table]);
}

/**
 * Ask PostgREST whether each candidate column exists, using a FILTER instead of
 * a projection: `?select=<required column>&<col>=is.null&limit=1`.
 *
 * The projection names only a column the caller has established is required, so
 * an existing column returns 200 / `[]` and only a genuinely absent column
 * answers 400 (`42703`). Sequential on purpose — a burst of parallel requests is
 * what made the console look like a failing endpoint.
 */
async function probeColumnsByFilter(
  supabaseUrl: string,
  supabaseKey: string,
  table: string,
  candidates: string[]
): Promise<string[]> {
  // A public (publishable) key is not a JWT, so PostgREST cannot derive a role
  // from it and answers 401 to EVERY request — including the probing below. Skip
  // the whole pass in that case: `null` ("unknown") makes every caller use its
  // documented core payload, which is what worked before.
  if (!isJwt(supabaseKey)) return [];

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    Accept: 'application/json',
    Prefer: 'count=none',
  };

  const found: string[] = [];
  for (const column of candidates) {
    /*
     * `select=id` is the projection every mirrored table has. When a column is
     * present the filter is valid and returns 200; when it is absent PostgREST
     * reports the FILTER column, so the status alone tells us what we need.
     */
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/${table}?select=id&${encodeURIComponent(column)}=is.null&limit=1`,
        { headers }
      );
      if (res.ok) found.push(column);
    } catch {
      /* inconclusive — the column is simply not reported as present */
    }
  }
  return found;
}

/** Clear the cached column sets (used by tests and after a schema change). */
export function clearColumnCache(): void {
  columnCache.clear();
}

/* ──────────────── Browser mirror writability (circuit breaker) ──────────────── */

/**
 * A dashboard mirror into Supabase must not keep re-sending a write that the
 * database has already refused with 401 / 403.
 *
 * Migration 0016 enables RLS on every table with NO client policy, so the public
 * key that ships in the browser may not INSERT into `categories` — PostgREST
 * answers HTTP 401 (`42501 new row violates row-level security policy`). MongoDB
 * (`/api/*`) stays authoritative and the server mirrors with the service-role
 * key, which bypasses RLS. The mirror is therefore best-effort by design.
 *
 * The bug was repetition: `CategoriesView` mirrors EVERY category on every load
 * and every reorder, so one page view produced a 401 for each row, on each
 * render, plus the same doomed `?on_conflict=id` upsert — the "220 errors".
 *
 * So the FIRST refusal is remembered per table for a few minutes and later
 * attempts are not sent at all. It is not a write: nothing is ever inserted to
 * "test" permission, and the guard clears itself, so a table whose policy is
 * later opened starts mirroring again without a reload.
 */
const mirrorWriteRefused = new Map<string, { status: number; message: string; expiresAt: number }>();
const MIRROR_REFUSAL_TTL_MS = 10 * 60 * 1000;

/** Why `table` is currently known to refuse writes, or `null` when allowed. */
export function mirrorWriteRefusedReason(table: string): string | null {
  const entry = mirrorWriteRefused.get(table);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    mirrorWriteRefused.delete(table);
    return null;
  }
  return `The ${table} table rejected the last write (${entry.status}).`;
}

/** Remember a 401/403 so the next mirror attempt short-circuits. */
export function rememberMirrorWriteRefusal(table: string, status: number, message: string): void {
  mirrorWriteRefused.set(table, {
    status,
    message: String(message || '').slice(0, 200),
    expiresAt: Date.now() + MIRROR_REFUSAL_TTL_MS,
  });
}

/** Clear the refusal record (used by tests and after a policy change). */
export function clearMirrorWriteRefusals(): void {
  mirrorWriteRefused.clear();
}

/**
 * Build a `select=` list that only names columns the table really has.
 *
 * PostgREST answers 400 / `42703` when ANY name in the projection is missing,
 * and the aliases come back under the names the table uses (`store_slug`, …).
 * When the schema is unknown the caller's preferred list is returned unchanged
 * so behaviour on a fully-migrated table is identical.
 */
export function buildSafeSelect(preferred: string[], knownColumns: string[] | null): string {
  if (!knownColumns || knownColumns.length === 0) return preferred.join(', ');
  const present = new Set(knownColumns.map((c) => c.toLowerCase()));
  const kept = preferred.filter((c) => present.has(c.toLowerCase()));
  return kept.length > 0 ? kept.join(', ') : '*';
}

/** Keep only the keys the table REALLY has (camelCase aliases included). */
export function restrictToKnownColumns(
  row: Record<string, any>,
  knownColumns: string[] | null
): Record<string, any> {
  if (!knownColumns || knownColumns.length === 0) return { ...row };
  const present = new Set(knownColumns.map((c) => c.toLowerCase()));
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    if (present.has(key.toLowerCase())) out[key] = value;
  }
  return out;
}

/**
 * Map a product row onto the columns the deployed `products` table actually has.
 *
 * The live table is `id, name, store_slug, price, stock_quantity, category,
 * image_url, created_at`; the dashboard's product object is much wider. Writing
 * the wide object (with `title`, `priceBDT`, `status`, `sku`, …) made PostgREST
 * reject the request with PGRST204 for the first unknown key, so nothing was
 * ever mirrored. Here the value is renamed into whichever spelling the table
 * uses and unknown keys simply never leave the browser.
 */
export function buildProductMirrorPayload(
  product: Record<string, any>,
  knownColumns: string[] | null
): Record<string, any> {
  const columns =
    knownColumns && knownColumns.length > 0
      ? knownColumns
      : ['id', 'name', 'store_slug', 'price', 'stock_quantity', 'category', 'image_url', 'created_at'];
  const present = new Set(columns.map((c) => c.toLowerCase()));

  const wanted: Record<string, unknown> = {
    id: product.id,
    name: product.name,
    title: product.name,
    store_slug: product.store_slug,
    storeSlug: product.store_slug,
    price: product.price,
    price_bdt: product.price,
    priceBDT: product.price,
    stock_quantity: product.stock_quantity,
    stock: product.stock_quantity,
    category: product.category,
    image_url: product.image_url,
    image: product.image_url,
    created_at: new Date().toISOString(),
  };

  const aliases: Array<[string[], unknown]> = [
    [['id'], wanted.id],
    [['name', 'title'], wanted.name],
    [['store_slug', 'storeSlug'], wanted.store_slug],
    [['price', 'price_bdt', 'priceBDT'], wanted.price],
    [['stock_quantity', 'stock'], wanted.stock_quantity],
    [['category'], wanted.category],
    [['image_url', 'image'], wanted.image_url],
    [['created_at'], wanted.created_at],
  ];

  const out: Record<string, any> = {};
  for (const [keys, value] of aliases) {
    if (value === undefined || value === null) continue;
    const column = keys.find((k) => present.has(k.toLowerCase()));
    if (column) out[column] = value;
  }
  /*
   * `id` is a bigint column on the deployed tables, so a UUID / `MP-…` string
   * answers 22P02 ("invalid input syntax for type bigint") and the row is lost.
   * The dashboard's own ids are mapped to the stable numeric form the category
   * mirror already uses, so the same product always lands on the same row.
   *
   * Only DROP the key when there is no usable id at all — a row then gets the
   * column default instead of losing its whole insert.
   */
  if ('id' in out && out.id !== null && out.id !== undefined && out.id !== '') {
    // A non-numeric id cannot be cast to bigint — omit it and let the column
    // default apply instead of losing the whole row.
    const numericId = toSafeBigIntId(out.id);
    if (numericId === null) delete out.id;
    else out.id = numericId;
  } else {
    delete out.id;
  }
  return out;
}

/**
 * Safely converts an arbitrary ID (MongoDB ObjectId, slug string, or numeric ID)
 * into a safe, positive integer compatible with PostgreSQL `bigint` columns.
 *
 * PostgreSQL error 22P02 ("invalid input syntax for type bigint") occurs when
 * non-numeric strings such as 24-hex MongoDB ObjectIds ("65e8a...") or string keys
 * ("cat-home") are passed to `bigint` columns in PostgREST queries (e.g. `categories?on_conflict=id`).
 */
export function toSafeBigIntId(rawId: unknown): number | null {
  if (rawId === null || rawId === undefined || rawId === '') return null;

  if (typeof rawId === 'number') {
    if (Number.isFinite(rawId) && rawId > 0) return Math.floor(rawId);
    return null;
  }

  const str = String(rawId).trim();
  if (!str) return null;

  // 1. Pure digits string
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    if (num > 0 && Number.isSafeInteger(num)) {
      return num;
    }
    try {
      const b = BigInt(str);
      if (b > 0n) {
        return Number(b % 9007199254740990n) + 1;
      }
    } catch {
      // Fall through to hash
    }
  }

  // 2. Prefixed timestamp like "cat-1727378901234"
  const tsMatch = str.match(/^cat-(\d{9,14})$/i);
  if (tsMatch) {
    const num = Number(tsMatch[1]);
    if (num > 0 && Number.isSafeInteger(num)) {
      return num;
    }
  }

  // 3. MongoDB 24-character hexadecimal ObjectId (e.g. "65e8a002b88df0537d8847aa")
  // Extract lower 13 hex chars (52 bits), which comfortably fits within JavaScript's 53-bit MAX_SAFE_INTEGER
  if (/^[0-9a-fA-F]{24}$/.test(str)) {
    try {
      const hexSlice = str.slice(-13);
      const parsed = parseInt(hexSlice, 16);
      if (parsed > 0 && Number.isSafeInteger(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to general hash
    }
  }

  // 4. Deterministic 64-bit FNV-1a hash algorithm for arbitrary string IDs (e.g. "cat-home", "cat-womens-fashion")
  // Yields consistent, positive integers in the range [1, 9007199254740990] (safe for Postgres bigint and JS number)
  try {
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    for (let i = 0; i < str.length; i++) {
      hash ^= BigInt(str.charCodeAt(i));
      hash = (hash * prime) & 0xffffffffffffffffn;
    }
    const positive = hash & 0x7fffffffffffffffn;
    const safeInt = Number(positive % 9007199254740990n) + 1;
    return safeInt;
  } catch {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) + str.charCodeAt(i);
      h = h & 0x7fffffff;
    }
    return (Math.abs(h) % 9007199254740990) + 1;
  }
}

/**
 * Build a `categories` row that is guaranteed to match the table's real schema.
 *
 * @param category      the source category object
 * @param storeSlug     the active tenant slug
 * @param knownColumns  columns the table actually has, or `null` when unknown
 */
export function buildCategoryMirrorPayload(
  category: any,
  storeSlug: string,
  knownColumns: string[] | null
): Record<string, any> {
  const slug = String(storeSlug || 'bd').toLowerCase().trim();

  const rawId = category?._id ?? category?.id ?? '';
  const safeId = toSafeBigIntId(rawId);

  // An `id` is mandatory: it is the upsert conflict target.
  // Using toSafeBigIntId guarantees we never pass a non-numeric string (such as
  // a MongoDB ObjectId or "cat-home") to a PostgreSQL `bigint` column (SQLSTATE 22P02).
  if (safeId === null) return {};

  const rawParentId = category?.parentId ?? category?.parent_id ?? null;
  const safeParentId = rawParentId ? toSafeBigIntId(rawParentId) : null;

  // The source values, keyed by the column the code WANTS to write.
  const wanted: Record<string, any> = {
    id: safeId,
    name: String(category?.name || category?.title || 'Category'),
    title: String(category?.name || category?.title || 'Category'),
    image: String(category?.image || category?.coverImage || category?.image_url || ''),
    image_url: String(category?.image || category?.coverImage || category?.image_url || ''),
    status: category?.status || 'active',
    is_published: category?.status !== 'hidden',
    parent_id: safeParentId,
    slug: String(category?.slug || ''),
    store_slug: slug,
    // Legacy aliases: only emitted if the table really has them.
    category_id: safeId,
    category_name: String(category?.name || category?.title || 'Category'),
    cover_image: String(category?.image || category?.coverImage || category?.image_url || ''),
    sort_order: Number.isFinite(Number(category?.sortOrder ?? category?.sort_order))
      ? Number(category?.sortOrder ?? category?.sort_order)
      : 0,
  };

  // ── Schema known → emit exactly the columns that exist. ────────────────────
  if (knownColumns) {
    const present = new Set(knownColumns.map((c) => c.toLowerCase()));
    const payload: Record<string, any> = {};

    for (const [key, fallbacks] of Object.entries(CATEGORY_COLUMN_FALLBACKS)) {
      const match = fallbacks.find((c) => present.has(c.toLowerCase()));
      if (!match) continue;
      if (match === key) {
        payload[key] = wanted[key];
      } else {
        // Write the value into whichever alias the table actually has.
        payload[match] = wanted[key];
      }
    }
    // Never let a fallback clobber the conflict target.
    if (!present.has('id')) {
      const idAlias = CATEGORY_COLUMN_FALLBACKS.id.find((c) => present.has(c.toLowerCase()));
      if (!idAlias) return {};
      payload[idAlias] = wanted.id;
    }
    return payload;
  }

  // ── Schema UNKNOWN → conservative core, guaranteed minimal. ────────────────
  // Deliberately excludes `category_id`, `image`, `title` and every other
  // optional alias: an unknown column rejects the entire request, so fewer keys
  // is strictly safer than more.
  const core: Record<string, any> = {};
  for (const col of CATEGORY_CORE_COLUMNS) {
    if (col === 'id') core.id = wanted.id;
    else if (col === 'name') core.name = wanted.name;
    else if (col === 'store_slug') core.store_slug = wanted.store_slug;
  }
  return core;
}

/* ─────────────────── Schema-tolerant REST write helper ─────────────────── */

/**
 * Per-table cache of columns PostgREST rejected on WRITE (PGRST204/42703).
 * Shared by every server route that mirrors into Supabase, so a column is only
 * ever discovered once per TTL window instead of 400ing on every save.
 */
const writeDroppedColumns = new Map<string, { cols: Set<string>; expiresAt: number }>();
const WRITE_DROPPED_TTL_MS = 5 * 60 * 1000;

/** Extract the offending column name from a PostgREST/PG error body. */
function extractUnknownColumnFrom(detail: string): string | null {
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column "([^"]+)" of (?:relation|table) "[^"]+" does not exist/i,
    /column ([a-zA-Z0-9_]+) of relation/i,
  ];
  for (const re of patterns) {
    const m = re.exec(detail);
    if (m && m[1]) return m[1];
  }
  /*
   * Schema-cache drift: the column EXISTS in Postgres but not in PostgREST's
   * cached schema (
   *   PGRST204: Could not find the 'x' column of 'orders' in the schema cache
   * ). Retrying the same body can never succeed and the whole row is lost, so
   * this is treated exactly like an unknown column.
   */
  const cacheMiss = /'([^']+)' column of '[^']+' in the schema cache/i.exec(detail);
  return cacheMiss?.[1] ?? null;
}

function tableFromPath(path: string): string {
  const m = /\/rest\/v1\/([A-Za-z0-9_]+)/.exec(path);
  return m ? m[1] : path;
}

function rememberWriteDroppedColumn(table: string, column: string): void {
  const now = Date.now();
  const entry = writeDroppedColumns.get(table);
  if (entry && entry.expiresAt > now) {
    entry.cols.add(column);
    return;
  }
  writeDroppedColumns.set(table, { cols: new Set([column]), expiresAt: now + WRITE_DROPPED_TTL_MS });
}

export interface PostgrestWriteResult {
  ok: boolean;
  /** HTTP status; 0 when the request never completed (network/timeout). */
  status: number;
  /** Response body of a failed request (truncated by the caller if logged). */
  detail: string;
  /** Columns removed from the payload after a schema rejection. */
  droppedColumns: string[];
  /** True when the unique-violation PATCH fallback executed instead of POST. */
  fallbackUsed?: boolean;
}

/**
 * Perform a PostgREST write (POST/PATCH/PUT/DELETE) that SURVIVES schema drift.
 *
 * A raw `fetch` + `JSON.stringify` mirror 400s the moment the payload names a
 * column the deployed table does not have (PGRST204), carries a value that
 * cannot be cast (22P02 — e.g. a non-UUID `id`, a malformed `updated_at`), or
 * collides with a unique constraint PostgREST cannot resolve (23505/409). This
 * helper turns each of those into a SAFE retry instead of an unhandled 400:
 *
 *  1. Pre-drops columns already rejected for this table (cached, 5 min TTL).
 *  2. Serialises the body as proper JSON (`Content-Type: application/json`).
 *  3. On PGRST204/42703 → drops that column from the body and retries.
 *  4. On 22P02 "invalid input syntax" → drops every key whose value is quoted
 *     in the error detail (bad `id`, bad `updated_at`, …) and retries.
 *  5. On 23505/409/unique-violation during an upsert → PATCHes the SAME body to
 *     `conflictPatchPath` (the natural key, e.g. `?email=eq.…`) when supplied.
 *
 * NEVER throws — every failure path returns `{ ok:false, status, detail }`.
 */
export async function postgrestWrite(
  supabaseUrl: string,
  supabaseKey: string,
  path: string,
  options: {
    method?: string;
    body?: Record<string, any> | null;
    headers?: Record<string, string>;
    /** Path used to PATCH the existing row when an upsert collides (409/23505). */
    conflictPatchPath?: string;
    timeoutMs?: number;
    maxRetries?: number;
  } = {}
): Promise<PostgrestWriteResult> {
  const method = (options.method || 'POST').toUpperCase();
  const table = tableFromPath(path);
  const droppedColumns: string[] = [];
  const maxRetries = options.maxRetries ?? 8;
  const body = options.body && typeof options.body === 'object' ? { ...options.body } : null;
  if (body) {
    for (const stale of writeDroppedColumns.get(table)?.cols ?? []) {
      if (stale in body) {
        delete body[stale];
        if (!droppedColumns.includes(stale)) droppedColumns.push(stale);
      }
    }
  }

  let lastDetail = '';
  let lastStatus = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (body && Object.keys(body).length === 0 && method !== 'GET' && method !== 'DELETE') {
      return {
        ok: false,
        status: lastStatus || 400,
        detail: lastDetail || `All payload fields were rejected as unknown columns of ${table}.`,
        droppedColumns,
      };
    }

    try {
      const hasBody = body !== null && method !== 'GET' && method !== 'DELETE';
      const res = await fetch(`${supabaseUrl}${path}`, {
        method,
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {}),
        },
        ...(hasBody ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout ? AbortSignal.timeout(options.timeoutMs ?? 8000) : undefined,
      });

      if (res.ok) {
        return { ok: true, status: res.status, detail: '', droppedColumns };
      }

      lastStatus = res.status;
      lastDetail = await res.text().catch(() => '');

      // 3) Unknown column → drop and retry.
      const unknownCol = extractUnknownColumnFrom(lastDetail);
      if (unknownCol && body && Object.prototype.hasOwnProperty.call(body, unknownCol)) {
        delete body[unknownCol];
        if (!droppedColumns.includes(unknownCol)) droppedColumns.push(unknownCol);
        rememberWriteDroppedColumn(table, unknownCol);
        console.warn(`[postgrestWrite] Dropped unknown column "${unknownCol}" from ${table} payload.`);
        continue;
      }

      /*
       * 3b) "Column specified more than once" — an upsert body listed the same
       * column twice (e.g. legacy `created_at` + camelCase `createdAt` aliases
       * in one PATCH). The duplicated column is owned by the database, so it is
       * removed from the payload and the write retried instead of failing.
       */
      const duplicateCol = /column "([^"]+)" specified more than once/i.exec(lastDetail)?.[1]
        || /multiple assignments to same column "([^"]+)"/i.exec(lastDetail)?.[1];
      if (duplicateCol && body && Object.prototype.hasOwnProperty.call(body, duplicateCol)) {
        delete body[duplicateCol];
        if (!droppedColumns.includes(duplicateCol)) droppedColumns.push(duplicateCol);
        console.warn(`[postgrestWrite] Dropped duplicated column "${duplicateCol}" from ${table} payload.`);
        continue;
      }

      // 4) Cast failure → drop every key whose value is quoted in the detail.
      if (/invalid input syntax for type/i.test(lastDetail) && body) {
        let removedAny = false;
        for (const [key, value] of Object.entries(body)) {
          if (typeof value === 'string' && value.length >= 3 && lastDetail.includes(`"${value}"`)) {
            delete body[key];
            if (!droppedColumns.includes(key)) droppedColumns.push(key);
            rememberWriteDroppedColumn(table, key);
            removedAny = true;
          }
        }
        if (removedAny) {
          console.warn(`[postgrestWrite] Dropped uncastable value(s) from ${table} payload.`);
          continue;
        }
      }

      // 5) Unique violation / conflict → natural-key PATCH fallback.
      const conflictRejected =
        lastStatus === 409 ||
        /23505|unique constraint|duplicate key|on conflict/i.test(lastDetail);
      if (conflictRejected && options.conflictPatchPath && method === 'POST' && body) {
        const patchResult = await postgrestWrite(supabaseUrl, supabaseKey, options.conflictPatchPath, {
          method: 'PATCH',
          body,
          headers: options.headers,
          timeoutMs: options.timeoutMs,
          maxRetries,
        });
        return {
          ...patchResult,
          droppedColumns: [...droppedColumns, ...patchResult.droppedColumns],
          fallbackUsed: true,
        };
      }

      return { ok: false, status: lastStatus, detail: lastDetail, droppedColumns };
    } catch (err: any) {
      // Network / timeout / abort — never throw into the route handler.
      return { ok: false, status: 0, detail: err?.message || String(err), droppedColumns };
    }
  }

  return {
    ok: false,
    status: lastStatus || 400,
    detail: lastDetail || `Retries exhausted writing to ${table}.`,
    droppedColumns,
  };
}

export default {
  buildCategoryMirrorPayload,
  buildProductMirrorPayload,
  restrictToKnownColumns,
  buildSafeSelect,
  fetchKnownColumns,
  CANDIDATE_COLUMNS,
  mirrorWriteRefusedReason,
  rememberMirrorWriteRefusal,
  clearMirrorWriteRefusals,
  toSafeBigIntId,
  fetchTableColumns,
  clearColumnCache,
};
