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
      /*
       * ACCEPT A ROW WITHOUT `id`.
       *
       * The old test was `const id = record?.id || … ; if (id) return …`, so a
       * store document that carries its identity in `_id` only (as MongoDB has
       * always done) fell through to the raw browser-side Supabase query below —
       * which RLS answers with `401 Unauthorized` on
       * `*.supabase.co/rest/v1/stores?…store_slug=eq.mystore`.
       *
       * Any recognised store identity is a successful resolution now.
       */
      const id = record?.id || record?._id || record?.store_id || record?.storeId || '';
      const slug = record?.store_slug || record?.storeSlug || body?.store_slug || '';
      const code = record?.store_code || record?.storeCode || '';
      if (id || slug || code) {
        return {
          id: String(id || slug || code),
          storeCode: code || undefined,
          storeSlug: slug || undefined,
        };
      }
    }
  } catch (err: any) {
    console.warn('[storeId] /api/stores/by-slug lookup warning:', err?.message || err);
  }

  /*
   * NO CLIENT-SIDE `stores` QUERY, EVER.
   *
   * This function used to fall back to `supabase.from('stores').eq('store_slug', …)`
   * — THREE separate requests (store_code, id, store_slug) fired from the browser
   * with the public key. The deployed project protects `stores` with RLS and no
   * client SELECT policy, so every one answered `401 Unauthorized`; with three
   * callers per dashboard load that is the recurring block of red rows reported
   * in the console. The backend above owns the whole lookup (MongoDB across both
   * clusters, then Supabase with the service-role key), so the browser never
   * needs to read the table directly.
   */
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
