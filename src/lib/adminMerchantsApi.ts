/** Defensive client helpers for Super Admin merchant slug updates. */

export interface MerchantSlugUpdateResult {
  ok: boolean;
  merchant?: Record<string, unknown>;
  error?: string;
  code?: string;
  warning?: string;
}

const RESERVED_MERCHANT_SLUGS = new Set([
  // Keep synchronized with RESERVED_ROOT_SEGMENTS in src/App.tsx and server validation.
  'admin', 'super-admin', 'admin-login', 'super-admin-gateway',
  'dashboard', 'store', 'e', 'pricing', 'landing', 'login', 'signin',
  'register', 'signup', 'checkout', 'api', 'assets', 'static',
  'www', 'zid', 'zid-bd', 'app', 'portal', 'support', 'help', 'docs', 'status', 'auth',
]);

export function normalizeMerchantSlug(requestedSlug: unknown): string {
  return String(requestedSlug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function validateMerchantSlug(slug: string): { valid: boolean; code?: string; message?: string } {
  if (slug.length < 3 || slug.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { valid: false, code: 'invalid_slug', message: 'Use 3-63 lowercase letters or numbers separated by single hyphens.' };
  }
  if (RESERVED_MERCHANT_SLUGS.has(slug) || /^zid-bd-\d+$/i.test(slug)) {
    return { valid: false, code: 'reserved_slug', message: 'This slug is reserved by the platform or storefront routes.' };
  }
  return { valid: true };
}

async function safeJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const text = await res.text();
    if (!text.trim() || text.trimStart().startsWith('<')) return null;
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export async function updateMerchantSlug(ref: string, slug: string): Promise<MerchantSlugUpdateResult> {
  try {
    const res = await fetch(`/api/admin/merchants/${encodeURIComponent(ref)}/slug`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_slug: slug }),
    });
    const data = await safeJson(res);
    if (!data) return { ok: false, error: 'The merchant service returned an unreadable response.' };
    return {
      ok: data.ok === true,
      merchant: data.merchant && typeof data.merchant === 'object'
        ? data.merchant as Record<string, unknown>
        : undefined,
      error: typeof data.error === 'string' ? data.error : undefined,
      code: typeof data.code === 'string' ? data.code : undefined,
      warning: typeof data.warning === 'string' ? data.warning : undefined,
    };
  } catch (err) {
    console.warn('[adminMerchantsApi] updateMerchantSlug failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Could not update the store slug.' };
  }
}
