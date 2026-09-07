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

  // 1) Permanent store code (ZID-BD-XXXX) — most stable lookup.
  if (isStoreCode(clean)) {
    const { data } = await supabase
      .from('stores')
      .select('id, store_code, store_slug')
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
      .select('id, store_code, store_slug')
      .eq('id', clean)
      .maybeSingle();
    if (data?.id) {
      return { id: String(data.id), storeCode: data.store_code, storeSlug: data.store_slug };
    }
  }

  // 3) Slug fallback (display reference only — renamed slugs still resolve
  //    here until callers persist the permanent id/code).
  const slug = clean.split(':')[0].trim().toLowerCase();
  if (slug) {
    const { data } = await supabase
      .from('stores')
      .select('id, store_code, store_slug')
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
