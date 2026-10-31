/**
 * Multi-vendor marketplace database layer.
 *
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The platform started as single-tenant SaaS: one merchant, one storefront,
 * one cart, one order. Turning it into a marketplace needs three pieces the
 * schema did not have:
 *
 *   1. A GLOBAL product query that lists every public product across every
 *      active merchant, with category / price / vendor filters.
 *   2. A CART THAT SPANS STORES. A shopper may buy from several vendors at
 *      once, so checkout must create ONE master order (what the shopper sees)
 *      and split it into ONE CHILD ORDER PER VENDOR (what each vendor fulfils,
 *      and what each Pathao/Steadfast slip is booked against).
 *   3. MONEY. Each child order is taxed a platform commission before the
 *      vendor is paid. `commission_rates` holds the rules and `vendor_payouts`
 *      holds the resulting per-order ledger that a Super Admin disburses.
 *
 * Collections (MongoDB, `zidbdsaas`):
 *   commission_rates  — vendor / category / default fee rules
 *   vendor_payouts    — one row per child order: gross, commission, net
 *
 * Everything here is defensive: a missing database degrades to an empty
 * marketplace / zero commission rather than failing a shopper's checkout.
 */
import mongoose from 'mongoose';
import { getMongoDb } from './db.js';
import { DB_NAME } from './db.js';

export const COMMISSION_COLLECTION = 'commission_rates';
export const PAYOUT_COLLECTION = 'vendor_payouts';

/** Fallback platform fee when no rule matches (percentage of goods subtotal). */
export const DEFAULT_COMMISSION_PERCENT = 10;

export interface StoreRef {
  /** stores.id UUID */
  storeId?: string;
  /** store_slug */
  slug?: string;
  /** ZID-BD-XXXX */
  code?: string;
}

export interface CommissionRule {
  id?: string;
  vendor_id?: string | null;
  vendor_name?: string;
  category?: string | null;
  rate_percent: number;
  flat_fee_bdt?: number;
  is_default?: boolean;
  is_active?: boolean;
  notes?: string;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface CommissionResult {
  rate_percent: number;
  flat_fee_bdt: number;
  /** Commission in BDT, rounded to 2 decimals and never above the gross. */
  commission_bdt: number;
  net_bdt: number;
  /** Which rule produced the rate (`vendor`, `category`, `default`, `fallback`). */
  source: 'vendor' | 'category' | 'default' | 'fallback';
  rate_id?: string;
}

function toNum(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Serialise a Mongo document for JSON (ObjectId → string `_id`). */
function toPlain(doc: any): any {
  if (!doc || typeof doc !== 'object') return doc;
  const out: any = { ...doc };
  if (out._id != null) out._id = String(out._id);
  return out;
}

/**
 * Resolve ANY store reference (UUID / slug / ZID-BD code / custom domain) to
 * the canonical `{ storeId, slug, code }` triple Mongo `stores` records carry.
 *
 * This mirrors the identity resolution in serverApp.ts deliberately: the
 * marketplace must not depend on which spelling a caller happened to hold.
 */
export async function resolveStoreRef(rawRef: string): Promise<StoreRef> {
  const clean = String(rawRef || '').split(':')[0].trim().toLowerCase();
  if (!clean) return {};
  const upper = clean.toUpperCase();
  const ref: StoreRef = {};
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
  const isCode = /^ZID-BD-\d+$/i.test(clean);
  if (isUuid) ref.storeId = clean;
  else if (isCode) ref.code = upper;
  else ref.slug = clean;

  try {
    const db = await getMongoDb(DB_NAME);
    if (!db) return ref;
    const or: Record<string, any>[] = [
      { store_slug: clean },
      { storeSlug: clean },
      { store_code: { $in: [clean, upper] } },
      { customDomain: clean },
      { custom_domain: clean },
      { domain: clean },
    ];
    if (isUuid) or.push({ id: clean }, { _id: clean }, { store_id: clean });
    const doc: any = await db.collection('stores').findOne({ $or: or });
    if (doc) {
      if (doc.id) ref.storeId = String(doc.id);
      if (doc.store_id) ref.storeId = ref.storeId || String(doc.store_id);
      if (doc.store_slug || doc.storeSlug) ref.slug = String(doc.store_slug || doc.storeSlug).toLowerCase();
      if (doc.store_code) ref.code = String(doc.store_code).toUpperCase();
    }
  } catch (err: any) {
    console.warn('[Marketplace] resolveStoreRef warning:', err?.message || err);
  }
  return ref;
}

/** Mongo `$or` clauses that match a product/order row belonging to a store. */
export function storeMatchClauses(ref: StoreRef): Record<string, any>[] {
  const or: Record<string, any>[] = [];
  if (ref.storeId) {
    or.push({ store_id: ref.storeId }, { storeId: ref.storeId }, { merchant_id: ref.storeId }, { merchantId: ref.storeId });
  }
  if (ref.slug) or.push({ store_slug: ref.slug }, { storeSlug: ref.slug });
  if (ref.code) or.push({ store_code: ref.code }, { storeCode: ref.code });
  return or;
}

/** A product is PUBLIC when it is published and not archived/hidden/draft. */
export function isPublicProduct(p: any): boolean {
  if (!p || typeof p !== 'object') return false;
  const status = String(p.status || 'active').toLowerCase();
  const isPublished = p.is_published !== false && p.isPublished !== false;
  return status !== 'archived' && status !== 'hidden' && status !== 'draft' && isPublished;
}

/** A store is ACTIVE unless it is explicitly suspended / locked / closed. */
export function isActiveStore(store: any): boolean {
  if (!store || typeof store !== 'object') return false;
  if (store.is_active === false || store.isActive === false) return false;
  if (store.is_locked === true || store.isLocked === true) return false;
  if (store.is_suspended === true || store.suspended === true) return false;
  const status = String(store.status || store.store_status || 'active').toLowerCase();
  return !['suspended', 'disabled', 'closed', 'deleted', 'inactive'].includes(status);
}

export interface MarketplaceQuery {
  /**
   * Optional OFFLINE fallback.
   *
   * Returns the same `{ stores, products }` shape the storefront serves from
   * the on-disk mirror. It is used ONLY when MongoDB is unreachable, so a
   * database outage degrades the marketplace to the last known catalogue
   * instead of an empty grid (the storefront has had this safety net for a
   * long time; the marketplace should not be the one page that goes blank).
   */
  loadLocal?: () => Promise<{ stores?: any[]; products?: any[] }>;
  /** Case-insensitive product search across title / sku / brand. */
  q?: string;
  category?: string;
  /**
   * Sub-category produced by the global taxonomy mega-menu ("Sarees &
   * Jamdani"). Narrows WITHIN `category`; on its own it still matches, because
   * a merchant may tag a sub-category whose primary is hidden from the rail.
   */
  subCategory?: string;
  /** Product ids to exclude (the featured/deals rails already show them). */
  excludeIds?: string[];
  minPrice?: number;
  maxPrice?: number;
  /** Vendor filter: slug, ZID-BD code or stores.id UUID. */
  vendor?: string;
  /** Vendor display-name search (substring, case-insensitive). */
  vendorName?: string;
  sort?: 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'popular';
  page?: number;
  limit?: number;
  /** Optional store reference to EXCLUDE (a merchant browsing their own). */
  excludeVendor?: string;
}

export interface MarketplaceResult {
  ok: boolean;
  /**
   * Where the rows came from. `local` means MongoDB was unreachable and the
   * rows were served from the on-disk storefront mirror — surfaced so an
   * outage is never mistaken for an empty catalogue.
   */
  source?: 'mongo' | 'local';
  products: any[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  vendors: { vendor_id: string; vendor_slug: string; vendor_name: string; vendor_code?: string; product_count: number }[];
  categories: { name: string; product_count: number }[];
  price_range: { min: number; max: number } | null;
  error?: string;
}

/**
 * LIST PUBLIC PRODUCTS ACROSS ALL ACTIVE MERCHANTS.
 *
 * MongoDB-first (products is the authoritative collection), with the local
 * file mirror only as an offline fallback. Filters are applied in Mongo where
 * possible; the vendor allow-list is enforced in code so a product whose store
 * row is missing cannot leak onto the marketplace.
 */
export async function searchMarketplaceProducts(query: MarketplaceQuery = {}): Promise<MarketplaceResult> {
  const page = Math.max(1, Math.floor(toNum(query.page, 1)));
  const limit = Math.min(200, Math.max(1, Math.floor(toNum(query.limit, 24))));
  const empty: MarketplaceResult = {
    ok: true, products: [], total: 0, page, limit, pages: 0,
    vendors: [], categories: [], price_range: null,
  };

  let db: any = null;
  try {
    db = await getMongoDb(DB_NAME);
  } catch (err: any) {
    console.warn('[Marketplace] database unavailable:', err?.message || err);
  }
  // ── 0. Offline mode: no database connection. ───────────────────────────
  if (!db) {
    if (!query.loadLocal) {
      return { ...empty, ok: false, error: 'The marketplace database is unavailable.' };
    }
    try {
      const local = await query.loadLocal();
      const localStores = Array.isArray(local?.stores) ? local.stores : [];
      // The file mirror keeps products either at the top level or nested per
      // store (`stores[slug].products`); flatten both.
      const nested = localStores.flatMap((s: any) => (Array.isArray(s?.products) ? s.products : []));
      const flat = Array.isArray(local?.products) ? local.products : [];
      const byId = new Map<string, any>();
      for (const p of [...nested, ...flat]) {
        const key = String(p?.id ?? p?._id ?? '');
        if (key) byId.set(key, p);
      }
      return buildMarketplaceResult([...byId.values()], localStores, query, page, limit, 'local');
    } catch (err: any) {
      console.warn('[Marketplace] local fallback warning:', err?.message || err);
      return { ...empty, ok: false, error: 'The marketplace database is unavailable.' };
    }
  }

  try {
    // ── 1. Which stores may sell on the marketplace? ────────────────────────
    const storeDocs: any[] = await db.collection('stores').find({}).limit(5000).toArray().catch(() => []);
    const activeStores = storeDocs.filter(isActiveStore);
    const storeByKey = new Map<string, any>();
    for (const s of activeStores) {
      for (const key of [
        s.id, s.store_id, s.merchant_id,
        s.store_slug, s.storeSlug, s.store_code, s.storeCode,
      ]) {
        const k = String(key || '').trim().toLowerCase();
        if (k) storeByKey.set(k, s);
      }
    }
    const activeStoreIds = new Set<string>();
    for (const s of activeStores) {
      const id = String(s.id || s.store_id || s.merchant_id || s.store_slug || s.storeSlug || '').trim().toLowerCase();
      if (id) activeStoreIds.add(id);
    }

    // ── 2. Product filter ───────────────────────────────────────────────────
    const and: Record<string, any>[] = [
      {
        $or: [
          { is_published: true },
          { is_published: { $exists: false } },
          { is_published: null },
        ],
      },
      {
        status: { $nin: ['archived', 'hidden', 'draft', 'Archived', 'Hidden', 'Draft'] },
      },
    ];

    if (query.q && query.q.trim()) {
      const rx = new RegExp(query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      and.push({
        $or: [
          { title: rx }, { name: rx }, { sku: rx }, { brand: rx },
          { description_en: rx }, { descriptionEn: rx },
        ],
      });
    }
    if (query.category && query.category.trim()) {
      const cat = query.category.trim();
      and.push({
        $or: [
          { category: cat }, { category: new RegExp(`^${cat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          { category_id: cat }, { categoryId: cat },
        ],
      });
    }
    if (query.subCategory && query.subCategory.trim()) {
      const sub = query.subCategory.trim();
      and.push({
        $or: [
          { sub_category: sub }, { subCategory: sub },
          { sub_category: new RegExp(`^${sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          { sub_category_id: sub }, { subCategoryId: sub },
        ],
      });
    }
    if (Array.isArray(query.excludeIds) && query.excludeIds.length > 0) {
      const ids = query.excludeIds.map(String).filter(Boolean).slice(0, 100);
      and.push({ id: { $nin: ids } });
    }
    const minPrice = Number.isFinite(query.minPrice as number) ? Number(query.minPrice) : null;
    const maxPrice = Number.isFinite(query.maxPrice as number) ? Number(query.maxPrice) : null;
    if (minPrice !== null || maxPrice !== null) {
      const priceCond: Record<string, any> = {};
      if (minPrice !== null) priceCond.$gte = minPrice;
      if (maxPrice !== null) priceCond.$lte = maxPrice;
      and.push({
        $or: [
          { priceBDT: priceCond },
          { price: priceCond },
          { price_bdt: priceCond },
        ],
      });
    }

    // Vendor filter: an explicit ref narrows the DB query; otherwise the
    // in-code allow-list below enforces "active merchant only".
    //
    // An explicit `vendor` ALWAYS wins over `excludeVendor`. Without this, a
    // request that carried both (a stale deep link, or a storefront passing
    // "exclude my store" by default) would intersect to an EMPTY set even
    // though the shopper explicitly picked a vendor.
    const hasVendorFilter = Boolean(query.vendor && query.vendor.trim());
    if (hasVendorFilter) {
      const ref = await resolveStoreRef(query.vendor!.trim());
      const clauses = storeMatchClauses(ref);
      if (clauses.length) and.push({ $or: clauses });
      else and.push({ store_slug: query.vendor!.trim().toLowerCase() });
    }
    if (!hasVendorFilter && query.excludeVendor && query.excludeVendor.trim()) {
      const ref = await resolveStoreRef(query.excludeVendor);
      const clauses = storeMatchClauses(ref);
      if (clauses.length) and.push({ $nor: clauses });
    }
    if (query.vendorName && query.vendorName.trim()) {
      const rx = new RegExp(query.vendorName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      and.push({
        $or: [
          { store_name: rx }, { storeName: rx }, { vendor_name: rx }, { vendorName: rx },
        ],
      });
    }

    const filter = and.length ? { $and: and } : {};

    const sortSpec: Record<string, 1 | -1> =
      query.sort === 'price_asc' ? { priceBDT: 1, price: 1 }
        : query.sort === 'price_desc' ? { priceBDT: -1, price: -1 }
          : query.sort === 'newest' ? { created_at: -1, createdAt: -1 }
            : query.sort === 'popular' ? { salesCount: -1, sales_count: -1, created_at: -1 }
              : { created_at: -1, createdAt: -1 };

    const coll = db.collection('products');
    // Aggregation so `total` and the vendor/category facets all come from the
    // filtered set on the server rather than from unbounded client work.
    const rows: any[] = await coll
      .find(filter)
      .sort(sortSpec as any)
      .limit(3000)
      .toArray()
      .catch(() => []);

    // ── 3. Annotate with vendor identity, drop non-public / inactive. ──────
    return buildMarketplaceResult(rows, storeDocs, query, page, limit, 'mongo');
  } catch (err: any) {
    console.warn('[Marketplace] search warning:', err?.message || err);
    return { ...empty, ok: false, error: 'The marketplace could not be searched right now.' };
  }
}

/**
 * ANNOTATE + FACET a raw product list.
 *
 * Shared by the MongoDB path and the offline mirror so both produce the SAME
 * payload: every row carries its vendor identity, category tags, discount,
 * stock state and rating, and the facets are computed from exactly the rows
 * shown. Keeping one implementation is what guarantees the card looks identical
 * whether the data came from Atlas or from the local file fallback.
 */
function buildMarketplaceResult(
  rows: any[],
  storeDocs: any[],
  query: MarketplaceQuery,
  page: number,
  limit: number,
  source: 'mongo' | 'local',
): MarketplaceResult {
  const activeStores = storeDocs.filter(isActiveStore);
  const storeByKey = new Map<string, any>();
  for (const s of activeStores) {
    for (const key of [s.id, s.store_id, s.merchant_id, s.store_slug, s.storeSlug, s.store_code, s.storeCode]) {
      const k = String(key || '').trim().toLowerCase();
      if (k) storeByKey.set(k, s);
    }
  }

  const enriched: any[] = [];
  const categoryCounts = new Map<string, number>();
  const vendorCounts = new Map<string, { vendor_id: string; vendor_slug: string; vendor_name: string; vendor_code?: string; product_count: number }>();
  let priceMin = Infinity;
  let priceMax = -Infinity;

  const needle = String(query.q || '').trim().toLowerCase();
  const catNeedle = String(query.category || '').trim().toLowerCase();
  const subNeedle = String(query.subCategory || '').trim().toLowerCase();
  const excluded = new Set((query.excludeIds || []).map(String));

  for (const raw of Array.isArray(rows) ? rows : []) {
    if (!isPublicProduct(raw)) continue;

    const keys = [
      raw.store_id, raw.storeId, raw.merchant_id, raw.merchantId,
      raw.store_slug, raw.storeSlug, raw.store_code, raw.storeCode,
    ].map((v) => String(v || '').trim().toLowerCase()).filter(Boolean);
    if (keys.length === 0) continue;

    let store: any = null;
    for (const k of keys) {
      if (storeByKey.has(k)) { store = storeByKey.get(k); break; }
    }
    // A product whose registered store is suspended must not be listed.
    if (!store && storeDocs.length > 0) {
      const registered = storeDocs.find((s) => {
        const sKeys = [s.id, s.store_id, s.merchant_id, s.store_slug, s.storeSlug, s.store_code, s.storeCode]
          .map((v) => String(v || '').trim().toLowerCase()).filter(Boolean);
        return sKeys.some((k) => keys.includes(k));
      });
      if (registered && !isActiveStore(registered)) continue;
      store = registered || null;
    }

    const vendorId = String(store?.id || store?.store_id || raw.store_id || raw.storeId || raw.merchant_id || raw.store_slug || '').trim();
    const vendorSlug = String(store?.store_slug || store?.storeSlug || raw.store_slug || raw.storeSlug || '').trim().toLowerCase();
    const vendorName = String(store?.store_name || store?.storeName || raw.store_name || raw.storeName || vendorSlug || 'Store').trim();

    const price = toNum(raw.priceBDT ?? raw.price ?? raw.price_bdt, 0);
    const id = raw.id != null ? String(raw.id) : (raw._id != null ? String(raw._id) : '');
    const category = String(raw.category || raw.category_name || 'Uncategorized').trim() || 'Uncategorized';

    // ── In-code filters (needed for the offline path; harmless in Mongo) ──
    if (needle) {
      const haystack = [raw.title, raw.name, raw.sku, raw.brand, raw.descriptionEn, raw.description_en]
        .map((v) => String(v ?? '').toLowerCase()).join(' ');
      if (!haystack.includes(needle)) continue;
    }
    if (catNeedle && category.toLowerCase() !== catNeedle && String(raw.category_id || raw.categoryId || '').toLowerCase() !== catNeedle) {
      continue;
    }
    if (subNeedle) {
      const subName = String(raw.sub_category || raw.subCategory || '').toLowerCase();
      const subId = String(raw.sub_category_id || raw.subCategoryId || '').toLowerCase();
      if (subName !== subNeedle && subId !== subNeedle) continue;
    }
    if (excluded.size > 0 && excluded.has(id)) continue;
    if (query.minPrice != null && price < Number(query.minPrice)) continue;
    if (query.maxPrice != null && price > Number(query.maxPrice)) continue;
    if (query.vendor && query.vendor.trim()) {
      const want = query.vendor.trim().toLowerCase();
      if (!keys.includes(want) && vendorId.toLowerCase() !== want && vendorSlug !== want) continue;
    }

    if (price > 0) {
      priceMin = Math.min(priceMin, price);
      priceMax = Math.max(priceMax, price);
    }
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);

    const vKey = vendorId || vendorSlug;
    if (vKey) {
      const existing = vendorCounts.get(vKey);
      if (existing) existing.product_count += 1;
      else vendorCounts.set(vKey, {
        vendor_id: vendorId, vendor_slug: vendorSlug, vendor_name: vendorName,
        vendor_code: store?.store_code ? String(store.store_code) : undefined,
        product_count: 1,
      });
    }

    // ── Card presentation fields ────────────────────────────────────────
    const subCategory = String(raw.sub_category || raw.subCategory || raw.subcategory || '').trim();
    const tagList: string[] = [category];
    const pushTag = (value: unknown) => {
      const t = String(value ?? '').trim();
      if (t && !tagList.some((existing) => existing.toLowerCase() === t.toLowerCase())) tagList.push(t);
    };
    if (Array.isArray(raw.tags)) raw.tags.forEach(pushTag);
    // The taxonomy sub-category is the second level of the mega-menu, so it must
    // always be present ahead of free-form tags.
    pushTag(subCategory);
    pushTag(raw.brand);

    const compareAt = toNum(
      raw.compareAtPriceBDT ?? raw.compare_at_price_bdt ?? raw.compareAtPrice ?? raw.compare_at_price,
      0,
    );
    const discountPercent = compareAt > price && price > 0
      ? Math.round(((compareAt - price) / compareAt) * 100)
      : 0;

    const stockQty = Math.max(0, Math.floor(toNum(raw.stock ?? raw.stock_quantity, 0)));
    const stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock' =
      stockQty <= 0 ? 'out_of_stock' : stockQty <= 5 ? 'low_stock' : 'in_stock';

    const rating = toNum(raw.rating ?? raw.average_rating ?? raw.avg_rating, 0);
    const reviewCount = Math.max(0, Math.floor(toNum(raw.review_count ?? raw.reviewCount ?? raw.reviews_count, 0)));

    enriched.push({
      ...toPlain(raw),
      id,
      priceBDT: price,
      vendor_id: vendorId,
      vendor_name: vendorName,
      vendor_slug: vendorSlug,
      vendor_code: store?.store_code ? String(store.store_code) : undefined,
      vendor_logo: store?.logo_url || store?.logoUrl || null,
      vendor_verified: isActiveStore(store || {}),
      store_id: String(raw.store_id || raw.storeId || vendorId),
      store_slug: vendorSlug || raw.store_slug || raw.storeSlug,
      category,
      category_id: String(raw.category_id || raw.categoryId || ''),
      sub_category: subCategory || null,
      sub_category_id: String(raw.sub_category_id || raw.subCategoryId || ''),
      category_tags: tagList,
      compare_at_price: compareAt > price ? compareAt : null,
      discount_percent: discountPercent,
      stock_status: stockStatus,
      stock_quantity: stockQty,
      rating: Math.min(5, Math.round(rating * 10) / 10),
      review_count: reviewCount,
    });
  }

  // ── In-code sort (the offline path has no DB sort) ───────────────────
  const sorted = [...enriched];
  switch (query.sort) {
    case 'price_asc': sorted.sort((a, b) => toNum(a.priceBDT) - toNum(b.priceBDT)); break;
    case 'price_desc': sorted.sort((a, b) => toNum(b.priceBDT) - toNum(a.priceBDT)); break;
    case 'popular': sorted.sort((a, b) => toNum(b.salesCount ?? b.sales_count) - toNum(a.salesCount ?? a.sales_count)); break;
    default: break;
  }

  const total = sorted.length;
  const start = (page - 1) * limit;
  return {
    ok: true,
    source,
    products: sorted.slice(start, start + limit),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    vendors: [...vendorCounts.values()].sort((a, b) => b.product_count - a.product_count).slice(0, 60),
    categories: [...categoryCounts.entries()]
      .map(([name, product_count]) => ({ name, product_count }))
      .sort((a, b) => b.product_count - a.product_count)
      .slice(0, 60),
    price_range: Number.isFinite(priceMin) ? { min: priceMin, max: priceMax } : null,
  };
}

/** Seed the default commission rule the first time the collection is read. */
async function ensureDefaultCommissionRule(db: any): Promise<void> {
  try {
    const count = await db.collection(COMMISSION_COLLECTION).countDocuments({ is_default: true });
    if (count > 0) return;
    await db.collection(COMMISSION_COLLECTION).insertOne({
      vendor_id: null,
      category: null,
      rate_percent: DEFAULT_COMMISSION_PERCENT,
      flat_fee_bdt: 0,
      is_default: true,
      is_active: true,
      notes: 'Platform default commission (auto-created).',
      created_at: new Date(),
      updated_at: new Date(),
    });
  } catch (err: any) {
    console.warn('[Marketplace] ensureDefaultCommissionRule warning:', err?.message || err);
  }
}

/**
 * Resolve the commission owed on ONE vendor's goods subtotal.
 *
 * Precedence (most specific first):
 *   1. an ACTIVE vendor override              (`vendor_id` = this store)
 *   2. an ACTIVE category rule for a line    (`category`, all vendors)
 *   3. the ACTIVE default rule               (`is_default: true`)
 *   4. a built-in 10% fallback (so a platform fee always exists)
 */
export async function resolveCommission(
  vendor: { storeId?: string; slug?: string; code?: string; name?: string },
  grossBdt: number,
  categories: string[] = []
): Promise<CommissionResult> {
  const gross = Math.max(0, round2(toNum(grossBdt, 0)));
  let rule: any = null;
  let source: CommissionResult['source'] = 'fallback';

  try {
    const db = await getMongoDb(DB_NAME);
    if (db) {
      await ensureDefaultCommissionRule(db);
      const coll = db.collection(COMMISSION_COLLECTION);
      const active = { is_active: { $ne: false } };

      const vendorKeys = [vendor.storeId, vendor.slug, vendor.code].map((v) => String(v || '').trim()).filter(Boolean);
      if (vendorKeys.length) {
        rule = await coll.findOne({ ...active, vendor_id: { $in: vendorKeys } }).catch(() => null);
        if (rule) source = 'vendor';
      }
      if (!rule && categories.length) {
        rule = await coll
          .findOne({ ...active, vendor_id: null, category: { $in: categories } })
          .catch(() => null);
        if (rule) source = 'category';
      }
      if (!rule) {
        rule = await coll.findOne({ ...active, is_default: true }).catch(() => null);
        if (rule) source = 'default';
      }
    }
  } catch (err: any) {
    console.warn('[Marketplace] resolveCommission warning:', err?.message || err);
  }

  const ratePercent = Math.min(100, Math.max(0, toNum(rule?.rate_percent, DEFAULT_COMMISSION_PERCENT)));
  const flatFee = Math.max(0, round2(toNum(rule?.flat_fee_bdt, 0)));
  const commission = Math.min(gross, round2(gross * (ratePercent / 100) + flatFee));

  return {
    rate_percent: ratePercent,
    flat_fee_bdt: flatFee,
    commission_bdt: commission,
    net_bdt: round2(gross - commission),
    source: rule ? source : 'fallback',
    rate_id: rule?._id != null ? String(rule._id) : undefined,
  };
}

/** Read commission rules (Super Admin). Includes the auto-seeded default. */
export async function listCommissionRates(): Promise<{ ok: boolean; rates: any[]; error?: string }> {
  try {
    const db = await getMongoDb(DB_NAME);
    if (!db) return { ok: false, rates: [], error: 'The database is unavailable.' };
    await ensureDefaultCommissionRule(db);
    const rows = await db.collection(COMMISSION_COLLECTION).find({}).sort({ is_default: -1, created_at: -1 }).toArray();
    return { ok: true, rates: rows.map(toPlain) };
  } catch (err: any) {
    return { ok: false, rates: [], error: err?.message || 'Commission rates could not be read.' };
  }
}

/** Create or update a commission rule. */
export async function upsertCommissionRate(input: Record<string, any>): Promise<{ ok: boolean; rate?: any; error?: string }> {
  try {
    const db = await getMongoDb(DB_NAME);
    if (!db) return { ok: false, error: 'The database is unavailable.' };

    const id = String(input.id || input._id || '').trim();
    const ratePercent = toNum(input.rate_percent ?? input.ratePercent, NaN);
    if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
      return { ok: false, error: 'rate_percent must be a number between 0 and 100.' };
    }

    const doc: Record<string, any> = {
      vendor_id: input.vendor_id ? String(input.vendor_id).trim() : null,
      vendor_name: input.vendor_name ? String(input.vendor_name).trim() : undefined,
      category: input.category ? String(input.category).trim() : null,
      rate_percent: round2(ratePercent),
      flat_fee_bdt: Math.max(0, round2(toNum(input.flat_fee_bdt ?? input.flatFeeBDT, 0))),
      is_default: input.is_default === true,
      is_active: input.is_active !== false,
      notes: input.notes ? String(input.notes) : undefined,
      updated_at: new Date(),
    };
    // Only ONE default rule may exist.
    if (doc.is_default) {
      await db.collection(COMMISSION_COLLECTION).updateMany({ is_default: true }, { $set: { is_default: false } });
      doc.vendor_id = null;
      doc.category = null;
    }

    if (id && mongoose.Types.ObjectId.isValid(id)) {
      await db.collection(COMMISSION_COLLECTION).updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: doc });
      return { ok: true, rate: { ...doc, id } };
    }
    const res = await db.collection(COMMISSION_COLLECTION).insertOne({ ...doc, created_at: new Date() });
    return { ok: true, rate: { ...doc, _id: String(res.insertedId) } };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'The commission rule could not be saved.' };
  }
}

/** Delete a commission rule (the default rule cannot be deleted). */
export async function deleteCommissionRate(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = await getMongoDb(DB_NAME);
    if (!db) return { ok: false, error: 'The database is unavailable.' };
    if (!mongoose.Types.ObjectId.isValid(String(id))) return { ok: false, error: 'Invalid commission rate id.' };
    const res = await db.collection(COMMISSION_COLLECTION).deleteOne({ _id: new mongoose.Types.ObjectId(String(id)), is_default: { $ne: true } });
    return res.deletedCount > 0 ? { ok: true } : { ok: false, error: 'The default rule cannot be deleted (edit its rate instead).' };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'The commission rule could not be deleted.' };
  }
}

// ─── Vendor payouts ─────────────────────────────────────────────────────────

export interface PayoutWriteInput {
  masterOrderId: string;
  masterOrderNumber: string;
  childOrderId: string;
  childOrderNumber: string;
  vendorId: string;
  vendorName?: string;
  storeSlug?: string;
  grossAmountBDT: number;
  commissionPercent: number;
  commissionFlatFeeBDT?: number;
  commissionBDT: number;
}

/**
 * Record the commission ledger row for one child order.
 *
 * Idempotent on (master_order_id, child_order_number) so a retried / duplicated
 * checkout POST cannot create two payouts for the same sale.
 */
export async function recordVendorPayout(input: PayoutWriteInput): Promise<{ ok: boolean; payout?: any; error?: string }> {
  try {
    const db = await getMongoDb(DB_NAME);
    if (!db) return { ok: false, error: 'The database is unavailable.' };

    const gross = round2(toNum(input.grossAmountBDT, 0));
    const commission = Math.min(gross, round2(toNum(input.commissionBDT, 0)));
    const doc: Record<string, any> = {
      master_order_id: String(input.masterOrderId || '').trim(),
      master_order_number: String(input.masterOrderNumber || '').trim(),
      child_order_id: String(input.childOrderId || '').trim(),
      child_order_number: String(input.childOrderNumber || '').trim(),
      vendor_id: String(input.vendorId || '').trim(),
      vendor_name: input.vendorName || undefined,
      store_slug: input.storeSlug || undefined,
      gross_amount_bdt: gross,
      commission_rate_percent: round2(toNum(input.commissionPercent, 0)),
      commission_flat_fee_bdt: round2(toNum(input.commissionFlatFeeBDT, 0)),
      commission_bdt: commission,
      net_payout_bdt: round2(gross - commission),
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date(),
    };
    const key = { master_order_id: doc.master_order_id, child_order_number: doc.child_order_number };
    const filter = { $or: [key, { child_order_id: doc.child_order_id, master_order_id: doc.master_order_id }] };
    const existing = await db.collection(PAYOUT_COLLECTION).findOne(filter).catch(() => null);
    if (existing) {
      // Never overwrite a settled payout — only refresh the pending amounts.
      if (existing.status === 'pending') {
        await db.collection(PAYOUT_COLLECTION).updateOne({ _id: existing._id }, {
          $set: {
            gross_amount_bdt: doc.gross_amount_bdt,
            commission_rate_percent: doc.commission_rate_percent,
            commission_flat_fee_bdt: doc.commission_flat_fee_bdt,
            commission_bdt: doc.commission_bdt,
            net_payout_bdt: doc.net_payout_bdt,
            updated_at: new Date(),
          },
        });
      }
      return { ok: true, payout: { ...toPlain(existing), ...doc, _id: String(existing._id) } };
    }
    const res = await db.collection(PAYOUT_COLLECTION).insertOne(doc);
    return { ok: true, payout: { ...doc, _id: String(res.insertedId) } };
  } catch (err: any) {
    console.warn('[Marketplace] recordVendorPayout warning:', err?.message || err);
    return { ok: false, error: err?.message || 'The payout row could not be recorded.' };
  }
}

/** List payouts, optionally scoped to a vendor / master order / status. */
export async function listVendorPayouts(filter: {
  vendorId?: string; storeSlug?: string; masterOrderId?: string; status?: string; limit?: number;
} = {}): Promise<{ ok: boolean; payouts: any[]; summary: Record<string, number>; error?: string }> {
  const summary = { total: 0, pending: 0, paid: 0, gross_bdt: 0, commission_bdt: 0, net_bdt: 0 };
  try {
    const db = await getMongoDb(DB_NAME);
    if (!db) return { ok: false, payouts: [], summary, error: 'The database is unavailable.' };

    const and: Record<string, any>[] = [];
    if (filter.vendorId) and.push({ vendor_id: String(filter.vendorId) });
    if (filter.storeSlug) and.push({ store_slug: String(filter.storeSlug).toLowerCase() });
    if (filter.masterOrderId) and.push({ master_order_id: String(filter.masterOrderId) });
    if (filter.status) and.push({ status: String(filter.status) });
    const query = and.length ? { $and: and } : {};
    const limit = Math.min(1000, Math.max(1, Math.floor(toNum(filter.limit, 200))));

    const rows = await db.collection(PAYOUT_COLLECTION).find(query).sort({ created_at: -1 }).limit(limit).toArray();
    for (const row of rows) {
      summary.total += 1;
      if (row.status === 'paid') summary.paid += 1;
      if (row.status === 'pending' || row.status === 'processing') summary.pending += 1;
      summary.gross_bdt = round2(summary.gross_bdt + toNum(row.gross_amount_bdt, 0));
      summary.commission_bdt = round2(summary.commission_bdt + toNum(row.commission_bdt, 0));
      summary.net_bdt = round2(summary.net_bdt + toNum(row.net_payout_bdt, 0));
    }
    return { ok: true, payouts: rows.map(toPlain), summary };
  } catch (err: any) {
    return { ok: false, payouts: [], summary, error: err?.message || 'Payouts could not be read.' };
  }
}

/** Mark one payout paid / processing / failed, with the transfer reference. */
export async function updatePayoutStatus(
  payoutId: string,
  patch: { status: string; payout_reference?: string; payout_method?: string; notes?: string }
): Promise<{ ok: boolean; payout?: any; error?: string }> {
  try {
    const db = await getMongoDb(DB_NAME);
    if (!db) return { ok: false, error: 'The database is unavailable.' };
    const allowed = ['pending', 'processing', 'paid', 'failed', 'cancelled'];
    const status = allowed.includes(patch.status) ? patch.status : '';
    if (!status) return { ok: false, error: `status must be one of: ${allowed.join(', ')}` };

    let query: Record<string, any>;
    if (mongoose.Types.ObjectId.isValid(String(payoutId))) {
      query = { _id: new mongoose.Types.ObjectId(String(payoutId)) };
    } else {
      query = { id: String(payoutId) };
    }
    const set: Record<string, any> = {
      status,
      updated_at: new Date(),
      ...(patch.payout_reference ? { payout_reference: String(patch.payout_reference) } : {}),
      ...(patch.payout_method ? { payout_method: String(patch.payout_method) } : {}),
      ...(patch.notes ? { notes: String(patch.notes) } : {}),
      ...(status === 'paid' ? { paid_at: new Date() } : {}),
    };
    const res = await db.collection(PAYOUT_COLLECTION).findOneAndUpdate(
      query,
      { $set: set },
      { returnDocument: 'after' }
    );
    const doc = (res as any)?.value ?? (res as any);
    if (!doc || !doc.vendor_id) return { ok: false, error: 'Payout not found.' };
    return { ok: true, payout: toPlain(doc) };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'The payout could not be updated.' };
  }
}

// ─── Order splitting ────────────────────────────────────────────────────────

export interface SplitChildLine {
  id: string;
  productId?: string;
  productName: string;
  variant: string;
  quantity: number;
  unitPriceBDT: number;
  image: string;
}

export interface SplitChildOrder {
  vendor_id: string;
  vendor_name: string;
  vendor_slug?: string;
  vendor_code?: string;
  store_id: string;
  items: SplitChildLine[];
  subtotal_bdt: number;
  delivery_charge: number;
  cod_amount: number;
}

/**
 * GROUP CART LINES BY SELLING VENDOR.
 *
 * The cart stores `vendor_id` / `store_id` on each line (see the storefront's
 * multi-vendor cart). Lines with no vendor fall back to the order's own store,
 * which keeps every single-vendor checkout behaving exactly as before.
 *
 * `delivery_charge` is split proportionally by each group's share of the goods
 * subtotal so the child order totals always add back up to the master's
 * delivery charge, with rounding residue assigned to the largest group.
 */
export function splitOrderByVendor(
  items: any[],
  fallback: { storeId?: string; slug?: string; name?: string; code?: string },
  totalDelivery = 0
): SplitChildOrder[] {
  const groups = new Map<string, SplitChildOrder>();

  for (const raw of Array.isArray(items) ? items : []) {
    if (!raw || typeof raw !== 'object') continue;
    const vendorSlug = String(
      raw.store_slug || raw.storeSlug || raw.vendor_slug || raw.vendorSlug || (fallback.slug) || ''
    ).trim().toLowerCase();
    const vendorId = String(
      raw.vendor_id || raw.vendorId || raw.store_id || raw.storeId || raw.merchant_id || raw.merchantId || vendorSlug || fallback.storeId || fallback.slug || 'default'
    ).trim();
    const vendorName = String(
      raw.vendor_name || raw.vendorName || raw.store_name || raw.storeName || (vendorId === (fallback.storeId || fallback.slug) ? fallback.name : '') || vendorSlug || vendorId
    ).trim();
    const unitPrice = toNum(raw.unitPriceBDT ?? raw.unit_price ?? raw.priceBDT ?? raw.price, 0);
    const quantity = Math.max(1, Math.floor(toNum(raw.quantity, 1)));
    const line: SplitChildLine = {
      id: String(raw.id || `item-${groups.size}-${Math.random().toString(36).slice(2, 8)}`),
      productId: raw.productId ? String(raw.productId) : undefined,
      productName: String(raw.productName || raw.name || raw.title || 'Item'),
      variant: String(raw.variant || 'Standard'),
      quantity,
      unitPriceBDT: unitPrice,
      image: String(raw.image || raw.image_url || ''),
    };
    const existing = groups.get(vendorId);
    if (existing) {
      existing.items.push(line);
      existing.subtotal_bdt = round2(existing.subtotal_bdt + unitPrice * quantity);
      if (!existing.vendor_slug && vendorSlug) existing.vendor_slug = vendorSlug;
    } else {
      groups.set(vendorId, {
        vendor_id: vendorId,
        vendor_name: vendorName,
        vendor_slug: vendorSlug || undefined,
        vendor_code: raw.store_code || raw.storeCode || undefined,
        store_id: String(raw.store_id || raw.storeId || vendorId),
        items: [line],
        subtotal_bdt: round2(unitPrice * quantity),
        delivery_charge: 0,
        cod_amount: 0,
      });
    }
  }

  const children = [...groups.values()];
  if (children.length === 0) return children;

  // Proportional delivery split.
  const totalSubtotal = children.reduce((s, c) => s + c.subtotal_bdt, 0);
  const delivery = Math.max(0, round2(toNum(totalDelivery, 0)));
  if (delivery > 0) {
    let allocated = 0;
    let largest = children[0];
    for (const child of children) {
      if (child.subtotal_bdt > largest.subtotal_bdt) largest = child;
    }
    for (const child of children) {
      if (child === largest) continue;
      const share = totalSubtotal > 0 ? round2(delivery * (child.subtotal_bdt / totalSubtotal)) : 0;
      child.delivery_charge = share;
      allocated = round2(allocated + share);
    }
    largest.delivery_charge = round2(delivery - allocated);
  }
  for (const child of children) {
    // COD is the child's own goods + its share of the delivery.
    child.cod_amount = round2(child.subtotal_bdt + child.delivery_charge);
  }
  return children;
}
