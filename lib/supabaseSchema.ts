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
 * Ask PostgREST which columns a table actually has.
 *
 * We deliberately do NOT use a `select=*` probe: that returns rows, and returns
 * nothing (not an error) for a table the anon key cannot read. Instead a request
 * for a column that does not exist is guaranteed to fail with a `PGRST204`,
 * which is the signal we want.
 */
export async function fetchTableColumns(
  supabaseUrl: string,
  supabaseKey: string,
  table: string
): Promise<string[] | null> {
  const now = Date.now();
  const cached = columnCache.get(table);
  if (cached && cached.expiresAt > now) return cached.columns;

  // Probe every candidate column in parallel. A 2xx proves the column exists; a
  // PGRST204 proves it does not. Anything else is inconclusive and simply does
  // not count towards a positive result.
  const candidates = Array.from(
    new Set(Object.values(CATEGORY_COLUMN_FALLBACKS).flat())
  );
  const results = await Promise.all(
    candidates.map((col) => probeColumn(supabaseUrl, supabaseKey, table, col))
  );

  const columns: string[] = [];
  candidates.forEach((col, i) => {
    if (results[i] && !columns.includes(col)) columns.push(col);
  });

  // A table we could not read a single column from is not usable for mirroring;
  // report `null` so the caller falls back to the conservative core.
  const resolved = columns.length > 0 ? columns : null;
  columnCache.set(table, { columns: resolved, expiresAt: now + COLUMN_CACHE_TTL_MS });
  return resolved;
}

/**
 * Does `column` exist on `table`?
 *
 * `limit=1` (NOT `limit=0`) is the cheapest request PostgREST accepts. `limit=0`
 * is rejected with a 400 Bad Request, so every probe failed and introspection
 * always reported "no columns" — silently forcing the mirror onto the
 * conservative fallback payload.
 *
 * PostgREST validates the selected column against its schema cache BEFORE it
 * returns any row, so a 2xx with a zero-or-one-row body still proves the column
 * exists. `limit=1` keeps that guarantee at the smallest possible cost.
 */
export async function probeColumn(
  supabaseUrl: string,
  supabaseKey: string,
  table: string,
  column: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(column)}&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );
    if (res.ok) return true;

    const text = await res.text().catch(() => '');
    // PGRST204 = column genuinely absent. Any other status is inconclusive
    // (auth, network, missing table) and must not be reported as "absent".
    if (/PGRST204|could not find the .* column/i.test(text)) return false;
    return false;
  } catch {
    return false;
  }
}

/** Clear the cached column sets (used by tests and after a schema change). */
export function clearColumnCache(): void {
  columnCache.clear();
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
  return null;
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
  toSafeBigIntId,
  fetchTableColumns,
  probeColumn,
  clearColumnCache,
};
