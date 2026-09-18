// =============================================================================
// Store API client — the ONE place the browser talks to the store endpoints.
// -----------------------------------------------------------------------------
// WHY THIS EXISTS
//   Fetching a store used to be spread across components, each building its own
//   URL and calling `res.json()` unconditionally. When a request missed the API
//   (an unknown slug, or a path the edge did not route) the response was the
//   platform's 404 **HTML** page, `res.json()` threw a SyntaxError, and the
//   caller either crashed or silently swallowed the failure — which is what
//   surfaced in DevTools as "The page could not be found" (NOT_FOUND).
//
//   Every helper here therefore:
//     1. uses a URL under /api/ that the deployed routers actually serve,
//     2. checks res.ok AND the content-type BEFORE parsing, and
//     3. returns null / false instead of throwing when a store is missing.
//
// The store reference may be a slug ("dhaka-threads"), a permanent store code
// ("ZID-BD-5150") or a stores.id UUID — the backend resolves all three.
// =============================================================================

import { isStoreCode, isUuid } from './storeId';
import { safeParseJson as parseJsonSafely } from './safeFetch';

/** Normalised store lookup result. `merchant` is null when nothing matched. */
export interface StoreLookupResult {
  /** true only when a real store record came back. */
  found: boolean;
  /** The reference as resolved by the server (normalised slug when known). */
  storeSlug: string;
  /** The store record, or null when the store does not exist. */
  merchant: Record<string, any> | null;
  /** Populated when the request itself failed (network / non-JSON response). */
  error?: string;
}

const NOT_FOUND: StoreLookupResult = { found: false, storeSlug: '', merchant: null };

/**
 * Read a Response as JSON without ever throwing.
 *
 * Delegates to src/lib/safeFetch.ts, which already guards against an empty body,
 * a non-JSON content-type, and an HTML error page (the platform's 404 response).
 * That HTML page is exactly what made the previous unconditional `res.json()`
 * calls throw "Unexpected token < in JSON at position 0".
 */
export async function safeJson<T = any>(res: Response): Promise<T | null> {
  return parseJsonSafely<T>(res, null);
}

/** True when a reference is worth sending (non-empty, not a routing word). */
export function isUsableStoreRef(ref: unknown): boolean {
  const clean = String(ref ?? '').split(':')[0].trim();
  if (!clean) return false;
  return !['stores', 'store', 'api', 'slug', 'undefined', 'null'].includes(clean.toLowerCase());
}

/**
 * Build the canonical store-lookup URL for any reference.
 *
 * Uses the query-string form (`/api/stores/by-slug?slug=…`) by default because
 * it survives every rewrite chain, and falls back to the path form for a plain
 * slug. Both are real routes in api/server.ts and app/api/stores/[slug].
 */
export function buildStoreLookupUrl(ref: string): string {
  const clean = String(ref || '').split(':')[0].trim();
  const encoded = encodeURIComponent(clean);
  // Codes and UUIDs must go through the flexible `slug` route so the backend can
  // resolve them; a plain slug can use the cleaner by-slug query form.
  if (isStoreCode(clean) || isUuid(clean)) return `/api/stores/slug/${encoded}`;
  return `/api/stores/by-slug?slug=${encoded}`;
}

/**
 * Look up a store by slug, permanent code (ZID-BD-XXXX) or UUID.
 *
 * Never throws. An unknown store yields `{ found: false, merchant: null }` so
 * callers can render a friendly "store not found" state instead of a 404 page.
 * Tries the query form first, then the path form, covering both router layouts.
 */
export async function fetchStoreByRef(ref: string | null | undefined): Promise<StoreLookupResult> {
  if (!isUsableStoreRef(ref)) return NOT_FOUND;

  const clean = String(ref).split(':')[0].trim();
  const urls = [buildStoreLookupUrl(clean)];
  // Retry with the alternate shape so an older deployment still resolves.
  const pathForm = `/api/stores/slug/${encodeURIComponent(clean)}`;
  if (!urls.includes(pathForm)) urls.push(pathForm);

  let lastError: string | undefined;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      // A 404/405 means this path shape is not deployed — try the next one.
      if (res.status === 404 || res.status === 405) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const data = await safeJson<{ ok?: boolean; store_slug?: string; merchant?: Record<string, any> | null; error?: string }>(res);
      if (!data) {
        lastError = 'non-JSON response';
        continue;
      }
      const merchant = data.merchant ?? null;
      return {
        found: Boolean(merchant),
        storeSlug: String(data.store_slug || clean).toLowerCase(),
        merchant,
        ...(data.error ? { error: data.error } : {}),
      };
    } catch (e: any) {
      lastError = e?.message || 'network error';
    }
  }

  // Every endpoint shape failed — report it without throwing.
  return { ...NOT_FOUND, error: lastError || 'store lookup failed' };
}

/** Convenience wrapper returning just the merchant record (or null). */
export async function fetchStoreMerchant(ref: string | null | undefined): Promise<Record<string, any> | null> {
  const result = await fetchStoreByRef(ref);
  return result.merchant;
}

/** Extract a canonical store id (UUID) from a store record, when present. */
export function storeIdFromRecord(merchant: Record<string, any> | null | undefined): string | null {
  if (!merchant) return null;
  const candidate = merchant.id ?? merchant.storeId ?? merchant.store_id;
  return isUuid(candidate) ? String(candidate) : null;
}

/** Extract the permanent ZID-BD code from a store record, when present. */
export function storeCodeFromRecord(merchant: Record<string, any> | null | undefined): string | null {
  if (!merchant) return null;
  const candidate = merchant.storeCode ?? merchant.store_code ?? merchant.storeSlug ?? merchant.store_slug;
  return candidate ? String(candidate).toUpperCase() : null;
}
