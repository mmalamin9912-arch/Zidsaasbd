import { getTenant, publicTenant, saveTenant } from './tenantStore';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type Request = { method?: string; query: Record<string, string | string[] | undefined>; body?: Record<string, unknown>; url?: string; params?: Record<string, string> };
type Response = { status: (status: number) => Response; json: (body: unknown) => unknown; setHeader: (name: string, value: string) => void };
const reply = (res: Response, status: number, body: Record<string, unknown> | unknown) => res.status(status).json(body);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORE_CODE_RE = /^ZID-BD-\d{4,}$/i;

let cachedSupabase: SupabaseClient | null = null;

function getDatabaseClient(): SupabaseClient | null {
  try {
    if (cachedSupabase) return cachedSupabase;
    const rawSupabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || process.env.DATABASE_URL || '';
    const rawSupabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
    const supabaseUrl = String(rawSupabaseUrl || '').replace(/^["'`\\]+|["'`\\]+$/g, '').trim().replace(/\/+$/, '');
    const supabaseKey = String(rawSupabaseKey || '').replace(/^["'`\\]+|["'`\\]+$/g, '').trim();
    if (!supabaseUrl || !supabaseKey) return null;
    try {
      const parsed = new URL(supabaseUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    } catch { return null; }
    cachedSupabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return cachedSupabase;
  } catch { return null; }
}

/** Extract store_id from request (query params, body, or URL search params) */
function extractStoreId(req: Request): string | null {
  try {
    // 1. Query parameter
    const qStoreId = req.query?.store_id || req.query?.storeId;
    if (typeof qStoreId === 'string' && qStoreId.trim()) return qStoreId.trim().toLowerCase();

    // 2. Body parameter
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      const bStoreId = (req.body as Record<string, any>).store_id || (req.body as Record<string, any>).storeId;
      if (typeof bStoreId === 'string' && bStoreId.trim()) return bStoreId.trim().toLowerCase();
    }

    // 3. URL search params
    if (req.url) {
      try {
        const urlObj = new URL(req.url, 'http://localhost');
        const sStoreId = urlObj.searchParams.get('store_id') || urlObj.searchParams.get('storeId');
        if (sStoreId && sStoreId.trim()) return sStoreId.trim().toLowerCase();
      } catch {}
    }
  } catch (err: any) {
    console.warn('[Vercel Serverless /api/storefront] Error extracting store_id:', err?.message || err);
  }
  return null;
}

/** Resolve store_id (canonical UUID) from store_slug by querying the stores table */
async function resolveStoreIdBySlug(storeSlug: string): Promise<string | null> {
  if (!storeSlug || !storeSlug.trim()) return null;
  const clean = storeSlug.trim().toLowerCase();
  const supabase = getDatabaseClient();
  if (!supabase) return null;

  // If it's already a UUID, return it directly (validate against stores table)
  if (UUID_RE.test(clean)) {
    try {
      const { data } = await supabase.from('stores').select('id').eq('id', clean).maybeSingle();
      return data?.id || null;
    } catch (e) {
      console.warn('[Vercel /api/storefront] store_id UUID validation failed:', e);
    }
    return null;
  }

  // If it's a store_code (ZID-BD-XXXX), resolve to UUID
  if (STORE_CODE_RE.test(clean)) {
    try {
      const { data } = await supabase.from('stores').select('id').ilike('store_code', clean).maybeSingle();
      if (data?.id) return data.id;
    } catch (e) {
      console.warn('[Vercel /api/storefront] ZID-BD store_code -> store_id lookup failed:', e);
    }
    return null;
  }

  // It's a slug — resolve to store_id from stores table
  try {
    const { data } = await supabase.from('stores').select('id').eq('store_slug', clean).maybeSingle();
    if (data?.id) return data.id;
  } catch (e) {
    console.warn('[Vercel /api/storefront] store_slug -> store_id lookup failed:', e);
  }
  return null;
}

/** Resolve store_slug from a store_id UUID or ZID-BD code */
async function resolveStoreSlugByRef(ref: string): Promise<string | null> {
  if (!ref || !ref.trim()) return null;
  const clean = ref.trim();
  const supabase = getDatabaseClient();
  if (!supabase) return null;

  if (UUID_RE.test(clean)) {
    try {
      const { data } = await supabase.from('stores').select('store_slug').eq('id', clean).maybeSingle();
      if (data?.store_slug) return data.store_slug;
    } catch (e) { console.warn('[Vercel /api/storefront] store_id UUID lookup failed:', e); }
  }
  if (STORE_CODE_RE.test(clean)) {
    try {
      const { data } = await supabase.from('stores').select('store_slug').ilike('store_code', clean).maybeSingle();
      if (data?.store_slug) return data.store_slug;
    } catch (e) { console.warn('[Vercel /api/storefront] ZID-BD store_code lookup failed:', e); }
  }
  return null;
}

/** Fetch products from Supabase by store_slug and store_id, deduplicating by product id */
async function fetchProducts(storeSlug: string, storeId: string | null): Promise<any[]> {
  const supabase = getDatabaseClient();
  if (!supabase) return [];

  try {
    const allProducts: any[] = [];

    // Query by store_slug
    const { data: slugData, error: slugErr } = await supabase
      .from('products')
      .select('*')
      .eq('store_slug', storeSlug);

    if (!slugErr && Array.isArray(slugData) && slugData.length > 0) {
      allProducts.push(...slugData);
    }

    // Query by store_id if resolved
    if (storeId) {
      const { data: idData, error: idErr } = await supabase
        .from('products')
        .select('*')
        .eq('store_id', storeId);

      if (!idErr && Array.isArray(idData) && idData.length > 0) {
        allProducts.push(...idData);
      }
    }

    // Deduplicate by product id
    if (allProducts.length > 0) {
      const seen = new Set<string>();
      return allProducts.filter(p => {
        const key = String(p.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  } catch (e: any) {
    console.warn('[Vercel Serverless /api/storefront] fetchProducts warning:', e?.message || e);
  }
  return [];
}

export default async function handler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

  try {
    // 1. Try path params (e.g., /api/storefront/:slug or /api/storefront/:slug?store_id=xxx)
    let rawSlug;
    if (req.params && typeof req.params.store_slug === 'string' && req.params.store_slug.trim()) {
      rawSlug = req.params.store_slug;
    } else if (req.params && typeof req.params.slug === 'string' && req.params.slug.trim()) {
      rawSlug = req.params.slug;
    }
    // 2. Fallback: query string or body
    else if (typeof req.query?.store_slug === 'string') {
      rawSlug = req.query.store_slug;
    } else if (typeof req.body?.store_slug === 'string') {
      rawSlug = req.body.store_slug;
    } else if (typeof req.query?.slug === 'string') {
      rawSlug = req.query.slug;
    } else if (typeof req.query?.store_id === 'string') {
      rawSlug = req.query.store_id;
    } else if (typeof req.query?.store_code === 'string') {
      rawSlug = req.query.store_code;
    }
    // 3. Fallback: parse from URL pathname for path-based routing (e.g., /api/storefront/abc123)
    else if (req.url) {
      try {
        const u = new URL(req.url, 'http://localhost');
        const parts = u.pathname.split('/').filter(Boolean);
        // Remove 'api' and 'storefront' to get path segments
        const segments = parts.filter(p => p !== 'api' && p !== 'storefront');
        if (segments.length > 0) {
          rawSlug = segments[segments.length - 1];
        }
      } catch {}
    }
    if (!rawSlug || !String(rawSlug || '').trim()) rawSlug = 'bd';

    let cleanSlug = String(rawSlug || '').split(':')[0].trim().toLowerCase() || 'bd';

    // If the slug is a UUID or ZID-BD code, resolve to store_slug
    const isRef = UUID_RE.test(cleanSlug) || STORE_CODE_RE.test(cleanSlug);
    if (isRef) {
      const resolved = await resolveStoreSlugByRef(cleanSlug);
      if (resolved) cleanSlug = resolved;
    }

    if (req.method === 'GET' || !req.method) {
      // Always resolve store_id from the slug so products can be filtered
      // by store_id in addition to store_slug
      const querySlug = UUID_RE.test(cleanSlug) && !STORE_CODE_RE.test(cleanSlug) ? await resolveStoreSlugByRef(cleanSlug) : cleanSlug;
      const slugForProducts = querySlug || cleanSlug;
      const storeIdForProducts = await resolveStoreIdBySlug(slugForProducts);

      const tenantData = await getTenant(slugForProducts);
      const storefront = publicTenant(tenantData);

      // Fetch products from Supabase using both store_slug and store_id
      const sbProducts = await fetchProducts(slugForProducts, storeIdForProducts);
      if (Array.isArray(sbProducts) && sbProducts.length > 0) {
        storefront.products = sbProducts;
      }

      return reply(res, 200, { ok: true, store_slug: cleanSlug, storefront });
    }

    if (req.method === 'POST') {
      const tenant = req.body?.tenant;
      const patch = req.body?.patch;
      if ((!tenant || typeof tenant !== 'object' || Array.isArray(tenant)) && (!patch || typeof patch !== 'object' || Array.isArray(patch))) {
        return reply(res, 400, { ok: false, error: 'tenant or patch must be an object' });
      }
      const next = (tenant as Record<string, unknown>) || { ...(await getTenant(cleanSlug) || {}), ...(patch as Record<string, unknown>) };
      await saveTenant(cleanSlug, next);
      return reply(res, 200, { ok: true, store_slug: cleanSlug });
    }

    res.setHeader('Allow', 'GET, POST');
    return reply(res, 405, { ok: false, error: `Method ${req.method || 'UNKNOWN'} is not allowed` });
  } catch (err: any) {
    console.error('[Vercel Serverless] /api/storefront error:', err);
    return reply(res, 200, { ok: true, store_slug: 'bd', storefront: {} });
  }
}
