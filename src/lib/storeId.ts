// =============================================================================
// Permanent Store Identification (ZID-BD-XXXX)
// -----------------------------------------------------------------------------
// Every merchant store has TWO permanent identifiers:
//   1. `id`        — the canonical Supabase UUID (stores.id), used for all
//                    database queries (orders, products, sessions).
//   2. `storeCode` — a permanent human-readable system ID "ZID-BD-1001",
//                    saved once at registration and never changed.
//
// Store names and custom slugs are DISPLAY metadata only: they never appear
// in database keys. resolveStoreRef() always funnels any reference (code,
// UUID or slug) back to the canonical UUID so renaming a store can never
// break order/product/session resolution.
// =============================================================================

import { buildSafeSelect, fetchKnownColumns } from '../../lib/supabaseSchema';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORE_CODE_RE = /^ZID-BD-\d{4,}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export function isStoreCode(value: unknown): value is string {
  return typeof value === 'string' && STORE_CODE_RE.test(value.trim());
}

/** Short deterministic hash of a string (for fallback code generation). */
function shortHash(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Generates a permanent store code, e.g. "ZID-BD-1001".
 * Deterministic hash of the seed so the same store always derives the
 * same code; the DB sequence backfill in migration 0002 is authoritative
 * when the row already exists.
 */
export function generateStoreCode(seed: string): string {
  const n = (shortHash(seed) % 8999) + 1001;
  return `ZID-BD-${String(n).padStart(4, '0')}`;
}

export interface StoreRef {
  id: string;          // canonical stores.id UUID
  storeCode?: string;  // permanent ZID-BD-XXXX
  storeSlug?: string;  // display-only slug (never used for queries)
}

type SupabaseLike = {
  from: (table: string) => any;
};

/**
 * May this browser send a direct `SELECT` to Supabase at all?
 *
 * The deployed project protects `stores` (and every other mirrored table) with
 * Row Level Security and ships the PUBLIC key to the browser, so a direct read
 * is answered with HTTP 401 (`Unauthorized`) — one red console row per lookup.
 * A legacy anon JWT may still be readable, so those deployments keep working.
 * The backend (`/api/stores/by-slug`) is asked FIRST either way.
 */
async function supabaseSelectAllowed(): Promise<boolean> {
  try {
    const { isSupabaseConfigured, supabaseAnonKey } = await import('./supabase');
    if (!isSupabaseConfigured) return false;
    // Legacy anon key = JWT (`aaa.bbb.ccc`). A `sb_publishable_…` key is opaque
    // to PostgREST and answers 401 to every direct table request.
    return /^[\w-]+\.[\w-]+\.[\w-]+$/.test(String(supabaseAnonKey || '').trim());
  } catch {
    return false;
  }
}

/**
 * Resolves ANY store reference (permanent code, UUID, or slug) to the
 * canonical store record. The returned `id` UUID is what must be attached
 * to every product create, customer session and order insert.
 */
export async function resolveStoreRef(
  supabase: SupabaseLike | null | undefined,
  ref: string | null | undefined
): Promise<StoreRef | null> {
  const clean = String(ref || '').trim();
  if (!clean || !supabase) return null;

  /*
   * READ ONLY THE COLUMNS THE DEPLOYED `stores` TABLE HAS.
   *
   * PostgREST rejects the WHOLE projection with HTTP 400 (`42703 column
   * stores.store_slug does not exist`) when a single name is absent, and this
   * helper is called from the login / registration path on the dashboard. The
   * column set is read once per session (cached) and the projection is trimmed
   * to it; on a table whose shape is unknown the original list is kept.
   */
  const { supabaseUrl, supabaseAnonKey } = await import('./supabase');
  const storesColumns = await fetchKnownColumns(supabaseUrl, supabaseAnonKey, 'stores');
  const select = buildSafeSelect(['id', 'store_code', 'store_slug'], storesColumns);
  const hasColumn = (name: string) =>
    !storesColumns || storesColumns.some((c) => c.toLowerCase() === name.toLowerCase());

  /*
   * BACKEND FIRST — NEVER A BARE CLIENT-SIDE SUPABASE `store_slug` QUERY.
   *
   * Every `stores` request below used the public key straight from the browser.
   * RLS protects the `stores` table with no client SELECT policy, so each one
   * answered `401 Unauthorized` on `*.supabase.co/rest/v1/stores?...store_slug=eq.…`
   * — the exact red rows reported on the live dashboard — and the returned
   * `null` then made login fall back to a synthetic store identity.
   *
   * `GET /api/stores/by-slug?slug=…` resolves the SAME store server-side (MongoDB
   * first, Supabase with the service-role key as a fallback) and answers
   * `{ ok, store_slug, merchant }`. The canonical `id`, `store_code` and
   * `store_slug` are read from `merchant`, whatever spelling the row carries.
   */
  try {
    const res = await fetch(`/api/stores/by-slug?slug=${encodeURIComponent(clean)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) {
      const body: any = await res.json().catch(() => null);
      const record: any = body?.merchant || null;
      const id = record?.id || record?._id || record?.store_id || '';
      if (id) {
        return {
          id: String(id),
          storeCode: record.store_code || record.storeCode,
          storeSlug: record.store_slug || record.storeSlug || body?.store_slug,
        };
      }
    }
  } catch (err: any) {
    console.warn('[storeId] /api/stores/by-slug lookup warning:', err?.message || err);
  }

  // Supplemental client-side lookups below only run when the backend could not
  // answer AND Supabase is actually usable from this browser: `fetchKnownColumns`
  // returns `null` in the browser, `select` then stays the documented core list,
  // and a project whose RLS denies the public key is never queried (see
  // `supabaseSelectAllowed`).
  if (!(await supabaseSelectAllowed())) return null;

  // 1) Permanent store code (ZID-BD-XXXX) — most stable lookup.
  if (isStoreCode(clean) && hasColumn('store_code')) {
    const { data } = await supabase
      .from('stores')
      .select(select)
      .ilike('store_code', clean)
      .maybeSingle();
    if (data?.id) {
      return { id: String(data.id), storeCode: data.store_code, storeSlug: data.store_slug };
    }
  }

  // 2) Canonical UUID.
  if (isUuid(clean)) {
    const { data } = await supabase
      .from('stores')
      .select(select)
      .eq('id', clean)
      .maybeSingle();
    if (data?.id) {
      return { id: String(data.id), storeCode: data.store_code, storeSlug: data.store_slug };
    }
  }

  // 3) Slug fallback (display reference only — renamed slugs still resolve
  //    here until callers persist the permanent id/code).
  const slug = clean.split(':')[0].trim().toLowerCase();
  if (slug && hasColumn('store_slug')) {
    const { data } = await supabase
      .from('stores')
      .select(select)
      .eq('store_slug', slug)
      .maybeSingle();
    if (data?.id) {
      return { id: String(data.id), storeCode: data.store_code, storeSlug: data.store_slug };
    }
  }

  return null;
}

/**
 * Ensures a merchant profile carries a permanent store identity: the
 * Supabase UUID (`id`) and the permanent `ZID-BD-XXXX` code. Called after
 * login/registration and before any data write.
 */
export function withPermanentStoreId<T extends Record<string, any>>(merchant: T, storeRef?: StoreRef | null): T {
  const id = merchant?.id || storeRef?.id || undefined;
  const storeCode =
    merchant?.storeCode ||
    storeRef?.storeCode ||
    (merchant?.store_code as string | undefined) ||
    generateStoreCode(String(merchant?.email || merchant?.storeSlug || merchant?.id || 'store'));
  return {
    ...merchant,
    ...(id ? { id } : {}),
    storeCode,
    store_code: storeCode,
    ...(id ? { storeId: id } : {}),
  };
}
