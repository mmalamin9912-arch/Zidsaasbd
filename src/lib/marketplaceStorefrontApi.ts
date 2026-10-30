/**
 * Client helpers for the marketplace STOREFRONT control plane.
 *
 * Mirrors the routes added in lib/serverApp.ts (backed by
 * lib/marketplaceStorefront.ts):
 *
 *   PUBLIC
 *     GET  /api/marketplace/storefront   → banners + categories + strip + featured
 *     GET  /api/marketplace/featured     → resolved featured / deal products
 *
 *   ADMIN
 *     GET/POST/DELETE /api/admin/marketplace/banners[/:id]
 *     POST            /api/admin/marketplace/banners/reorder
 *     GET/POST/DELETE /api/admin/marketplace/categories[/:id]
 *     POST            /api/admin/marketplace/categories/reorder | /seed
 *     GET/POST        /api/admin/marketplace/strip
 *     GET/POST        /api/admin/marketplace/featured
 *     GET             /api/admin/marketplace/products
 *
 * Every helper resolves rather than throwing: the marketplace homepage must
 * still render when the API hiccups.
 */

/* ─────────────────────────────── types ─────────────────────────────── */

export interface MarketplaceBanner {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  gradient: string;
  image?: string;
  category?: string;
  search?: string;
  accentText?: string;
  isActive: boolean;
  sortOrder: number;
}

export interface MarketplaceCategoryRow {
  id: string;
  name: string;
  emoji?: string;
  image?: string;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
}

export interface UtilityStripItem {
  id: string;
  icon: string;
  text: string;
  isActive: boolean;
}

export interface UtilityStripConfig {
  isActive: boolean;
  phone: string;
  sellLabel: string;
  merchantLoginLabel: string;
  items: UtilityStripItem[];
}

export interface FeaturedConfig {
  productIds: string[];
  vendorRefs: string[];
  dealsEnabled: boolean;
  featuredTitle: string;
  featuredSubtitle: string;
  dealsTitle: string;
  dealsSubtitle: string;
  featuredLimit: number;
  dealsLimit: number;
}

export interface MarketplaceStorefrontConfig {
  banners: MarketplaceBanner[];
  categories: MarketplaceCategoryRow[];
  strip: UtilityStripConfig;
  featured: FeaturedConfig;
  degraded?: boolean;
}

export interface AdminProductRow {
  id: string;
  title: string;
  price: number;
  image: string;
  vendor_name: string;
  vendor_slug: string;
  category: string;
  status: string;
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text || text.trimStart().startsWith('<')) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const data = await safeJson<T>(res);
    return (data ?? fallback) as T;
  } catch (err) {
    console.warn('[marketplaceStorefrontApi] GET failed:', url, err);
    return fallback;
  }
}

async function sendJson<T>(url: string, method: 'POST' | 'DELETE', body?: unknown, fallback?: T): Promise<T> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await safeJson<T>(res);
    return (data ?? (fallback ?? ({ ok: false } as unknown as T))) as T;
  } catch (err: any) {
    console.warn('[marketplaceStorefrontApi] write failed:', url, err);
    return (fallback ?? ({ ok: false, error: err?.message || 'Network error.' } as unknown as T));
  }
}

/* ─────────────────────────── public reads ─────────────────────────── */

export const EMPTY_STRIP: UtilityStripConfig = {
  isActive: true,
  phone: '09600-000000',
  sellLabel: 'Sell on ZID',
  merchantLoginLabel: 'Merchant login',
  items: [],
};

export const EMPTY_FEATURED: FeaturedConfig = {
  productIds: [],
  vendorRefs: [],
  dealsEnabled: true,
  featuredTitle: 'Featured picks',
  featuredSubtitle: '',
  dealsTitle: 'Today’s best deals',
  dealsSubtitle: '',
  featuredLimit: 12,
  dealsLimit: 12,
};

export const EMPTY_STOREFRONT: MarketplaceStorefrontConfig = {
  banners: [],
  categories: [],
  strip: EMPTY_STRIP,
  featured: EMPTY_FEATURED,
};

/** Everything the public marketplace homepage needs, in one request. */
export async function fetchMarketplaceStorefront(): Promise<MarketplaceStorefrontConfig> {
  const data = await getJson<any>('/api/marketplace/storefront', null as any);
  if (!data) return EMPTY_STOREFRONT;
  return {
    banners: Array.isArray(data.banners) ? data.banners : [],
    categories: Array.isArray(data.categories) ? data.categories : [],
    strip: data.strip && typeof data.strip === 'object'
      ? { ...EMPTY_STRIP, ...data.strip, items: Array.isArray(data.strip.items) ? data.strip.items : [] }
      : EMPTY_STRIP,
    featured: data.featured && typeof data.featured === 'object'
      ? { ...EMPTY_FEATURED, ...data.featured }
      : EMPTY_FEATURED,
    degraded: Boolean(data.degraded),
  };
}

export interface FeaturedProductsResponse {
  ok: boolean;
  config: FeaturedConfig;
  /** Resolved catalogue rows (same shape the marketplace grid renders). */
  products: any[];
  deals: any[];
  productIds: string[];
  dealIds: string[];
}

/** The resolved featured + deals catalogue rows (admin pins applied). */
export async function fetchFeaturedProducts(): Promise<FeaturedProductsResponse> {
  const empty: FeaturedProductsResponse = {
    ok: false, config: EMPTY_FEATURED, products: [], deals: [], productIds: [], dealIds: [],
  };
  const data = await getJson<any>('/api/marketplace/featured', null as any);
  if (!data) return empty;
  return {
    ok: Boolean(data.ok),
    config: data.config && typeof data.config === 'object' ? { ...EMPTY_FEATURED, ...data.config } : EMPTY_FEATURED,
    products: Array.isArray(data.products) ? data.products : [],
    deals: Array.isArray(data.deals) ? data.deals : [],
    productIds: Array.isArray(data.productIds) ? data.productIds : [],
    dealIds: Array.isArray(data.dealIds) ? data.dealIds : [],
  };
}

/** Map a raw Mongo product row onto the MarketplaceProduct shape the cards use. */
export function toMarketplaceProduct(raw: any): any {
  const price = Number(raw?.priceBDT ?? raw?.price ?? raw?.price_bdt ?? 0) || 0;
  const compareAt = Number(
    raw?.compare_at_price ?? raw?.compareAtPriceBDT ?? raw?.compare_at_price_bdt ?? raw?.compareAtPrice ?? 0
  ) || 0;
  const id = String(raw?.id ?? raw?._id ?? '');
  const category = String(raw?.category || 'Uncategorized');
  return {
    ...raw,
    id,
    title: String(raw?.title || raw?.name || 'Untitled product'),
    // The seller's Bangla name travels with the product so the marketplace can
    // render it when the shopper reads Bangla. Kept separate from `title`: the
    // cards fall back to English, and no search or facet key changes.
    titleBn: String(raw?.titleBn || raw?.title_bn || raw?.nameBn || ''),
    priceBDT: price,
    image: raw?.image || raw?.image_url || raw?.imageUrl || raw?.thumbnail || '',
    vendor_id: String(raw?.vendor_id || raw?.store_id || raw?.storeId || raw?.store_slug || ''),
    vendor_name: String(raw?.vendor_name || raw?.store_name || raw?.storeName || raw?.store_slug || 'Store'),
    vendor_slug: String(raw?.vendor_slug || raw?.store_slug || raw?.storeSlug || ''),
    category,
    category_tags: [category],
    compare_at_price: compareAt > price ? compareAt : null,
    discount_percent: compareAt > price && price > 0 ? Math.round(((compareAt - price) / compareAt) * 100) : 0,
    stock_quantity: Number(raw?.stock_quantity ?? raw?.stock ?? 0) || 0,
    stock_status: Number(raw?.stock_quantity ?? raw?.stock ?? 0) > 0 ? 'in_stock' : 'out_of_stock',
    rating: Number(raw?.rating ?? 0) || 0,
    review_count: Number(raw?.review_count ?? 0) || 0,
  };
}

/* ─────────────────────────── admin: banners ─────────────────────────── */

export async function fetchAdminBanners(): Promise<MarketplaceBanner[]> {
  const data = await getJson<{ ok: boolean; banners: MarketplaceBanner[] }>(
    '/api/admin/marketplace/banners',
    { ok: false, banners: [] }
  );
  return Array.isArray(data.banners) ? data.banners : [];
}

export const saveBanner = (banner: Partial<MarketplaceBanner>) =>
  sendJson<{ ok: boolean; banner?: MarketplaceBanner; error?: string }>(
    '/api/admin/marketplace/banners', 'POST', banner
  );

export const removeBanner = (id: string) =>
  sendJson<{ ok: boolean; error?: string }>(
    `/api/admin/marketplace/banners/${encodeURIComponent(id)}`, 'DELETE'
  );

export const reorderBanners = (ids: string[]) =>
  sendJson<{ ok: boolean; error?: string }>(
    '/api/admin/marketplace/banners/reorder', 'POST', { ids }
  );

/* ────────────────────────── admin: categories ────────────────────────── */

export async function fetchAdminCategories(): Promise<MarketplaceCategoryRow[]> {
  const data = await getJson<{ ok: boolean; categories: MarketplaceCategoryRow[] }>(
    '/api/admin/marketplace/categories',
    { ok: false, categories: [] }
  );
  return Array.isArray(data.categories) ? data.categories : [];
}

export const saveCategory = (category: Partial<MarketplaceCategoryRow>) =>
  sendJson<{ ok: boolean; category?: MarketplaceCategoryRow; error?: string }>(
    '/api/admin/marketplace/categories', 'POST', category
  );

export const removeCategory = (id: string) =>
  sendJson<{ ok: boolean; error?: string }>(
    `/api/admin/marketplace/categories/${encodeURIComponent(id)}`, 'DELETE'
  );

export const reorderCategories = (ids: string[]) =>
  sendJson<{ ok: boolean; error?: string }>(
    '/api/admin/marketplace/categories/reorder', 'POST', { ids }
  );

export const seedCategories = () =>
  sendJson<{ ok: boolean; categories?: MarketplaceCategoryRow[]; error?: string }>(
    '/api/admin/marketplace/categories/seed', 'POST', {}
  );

/* ──────────────────────────── admin: strip ──────────────────────────── */

export async function fetchAdminStrip(): Promise<UtilityStripConfig> {
  const data = await getJson<{ ok: boolean; strip: UtilityStripConfig }>(
    '/api/admin/marketplace/strip',
    { ok: false, strip: EMPTY_STRIP }
  );
  return data.strip && typeof data.strip === 'object'
    ? { ...EMPTY_STRIP, ...data.strip, items: Array.isArray(data.strip.items) ? data.strip.items : [] }
    : EMPTY_STRIP;
}

export const saveStrip = (strip: UtilityStripConfig) =>
  sendJson<{ ok: boolean; strip?: UtilityStripConfig; error?: string }>(
    '/api/admin/marketplace/strip', 'POST', strip
  );

/* ────────────────────────── admin: featured ────────────────────────── */

export async function fetchAdminFeatured(): Promise<{
  featured: FeaturedConfig;
  products: AdminProductRow[];
  deals: AdminProductRow[];
}> {
  const data = await getJson<{ ok: boolean; featured: FeaturedConfig; products: any[]; deals: any[] }>(
    '/api/admin/marketplace/featured',
    { ok: false, featured: EMPTY_FEATURED, products: [], deals: [] }
  );
  const normalize = (rows: any[]): AdminProductRow[] =>
    (Array.isArray(rows) ? rows : []).map((row) => ({
      id: String(row?.id ?? row?._id ?? ''),
      title: String(row?.title || row?.name || 'Untitled'),
      price: Number(row?.priceBDT ?? row?.price ?? 0) || 0,
      image: row?.image || row?.image_url || row?.imageUrl || row?.thumbnail || '',
      vendor_name: String(row?.vendor_name || row?.store_name || row?.store_slug || ''),
      vendor_slug: String(row?.vendor_slug || row?.store_slug || ''),
      category: String(row?.category || ''),
      status: String(row?.status || 'active'),
    }));
  return {
    featured: data.featured && typeof data.featured === 'object'
      ? { ...EMPTY_FEATURED, ...data.featured }
      : EMPTY_FEATURED,
    products: normalize(data.products),
    deals: normalize(data.deals),
  };
}

export const saveFeatured = (featured: FeaturedConfig) =>
  sendJson<{ ok: boolean; featured?: FeaturedConfig; error?: string }>(
    '/api/admin/marketplace/featured', 'POST', featured
  );

export async function searchProductsForPicker(params: { q?: string; vendor?: string }): Promise<AdminProductRow[]> {
  const qs = new URLSearchParams();
  if (params.q?.trim()) qs.set('q', params.q.trim());
  if (params.vendor?.trim()) qs.set('vendor', params.vendor.trim());
  qs.set('limit', '30');
  const data = await getJson<{ ok: boolean; products: AdminProductRow[] }>(
    `/api/admin/marketplace/products?${qs.toString()}`,
    { ok: false, products: [] }
  );
  return Array.isArray(data.products) ? data.products : [];
}

export default {
  fetchMarketplaceStorefront,
  fetchFeaturedProducts,
  toMarketplaceProduct,
  fetchAdminBanners,
  saveBanner,
  removeBanner,
  reorderBanners,
  fetchAdminCategories,
  saveCategory,
  removeCategory,
  reorderCategories,
  seedCategories,
  fetchAdminStrip,
  saveStrip,
  fetchAdminFeatured,
  saveFeatured,
  searchProductsForPicker,
};
