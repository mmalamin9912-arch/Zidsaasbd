/**
 * MARKETPLACE STOREFRONT — admin-owned presentation layer.
 *
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The marketplace front door (`MegaMarketplaceView`) shipped with its hero
 * slides, "shop by category" rail, utility strip and deals strip hardcoded in
 * the component. That is fine for a demo and useless for an operator: changing
 * "Up to 60% off" required a code deploy, and there was no way to promote a
 * particular vendor or pin a product into the featured grid.
 *
 * This module is the missing control plane. It stores everything the
 * marketplace SHOWS (as opposed to what it SELLS) in one MongoDB collection:
 *
 *   marketplace_config  (one document per config_key)
 *
 *     config_key = 'banners'     → { banners: BannerRecord[] }
 *     config_key = 'categories'  → { categories: MarketplaceCategoryRecord[] }
 *     config_key = 'strip'       → { strip: UtilityStripConfig }
 *     config_key = 'featured'    → { featured: FeaturedConfig }
 *
 * WHY MONGO AND NOT THE `platform_config` SINGLETON
 * ---------------------------------------------------------------------------
 * The public marketplace reads this on every anonymous page view. The
 * `platform_config` document also carries payment-gateway secrets; serving it
 * on a public endpoint would leak them. Keeping the storefront config in its
 * own collection means the public read is a small, secret-free document.
 *
 * WHY A DEDICATED CATEGORY LIST AT ALL
 * ---------------------------------------------------------------------------
 * The marketplace already derives category facets from the product catalogue,
 * and those stay: they are the truth about what can actually be bought. But an
 * operator needs to (a) choose the ORDER of the rail, (b) give a category a
 * real cover image/emoji instead of a hash-chosen glyph, and (c) HIDE a
 * category that is technically populated but off-brand this week. The admin
 * list therefore OVERLAYS the facet list — it never subtracts products.
 *
 * Every function is defensive: a missing database degrades to the built-in
 * defaults rather than blanking the marketplace.
 */

import mongoose from 'mongoose';
import { getMongoDb, DB_NAME } from './db.js';
import { toJsonPlain } from './hybridDb.js';

export const MARKETPLACE_CONFIG_COLLECTION = 'marketplace_config';

export const CONFIG_KEY_BANNERS = 'banners';
export const CONFIG_KEY_CATEGORIES = 'categories';
export const CONFIG_KEY_STRIP = 'strip';
export const CONFIG_KEY_FEATURED = 'featured';



/* ─────────────────────────────── banners ─────────────────────────────── */

export interface MarketplaceBanner {
  id: string;
  /** Small uppercase kicker ("MEGA MARKETPLACE SALE"). */
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  /** CSS gradient — the slide background when `image` is absent. */
  gradient: string;
  /** Optional hero image (URL or uploaded data-URL). */
  image?: string;
  /** Category the CTA opens. Blank → clears the category filter. */
  category?: string;
  /** Optional free-form search term the CTA runs instead of a category. */
  search?: string;
  /** Tailwind text colour class for the eyebrow. */
  accentText?: string;
  isActive: boolean;
  sortOrder: number;
  created_at?: string;
  updated_at?: string;
}

/* ────────────────────────────── categories ────────────────────────────── */

export interface MarketplaceCategory {
  id: string;
  /** Must match a product `category` value to filter correctly. */
  name: string;
  /** Emoji shown in the circular tile. */
  emoji?: string;
  image?: string;
  isActive: boolean;
  /** Marks the category as "featured" (shown in the top rail / tiles). */
  isFeatured: boolean;
  sortOrder: number;
  created_at?: string;
  updated_at?: string;
}

/* ─────────────────────────── utility strip ─────────────────────────── */

export interface UtilityStripItem {
  id: string;
  /** MapPin | Truck | RotateCcw | ShieldCheck | BadgePercent | store */
  icon: string;
  text: string;
  isActive: boolean;
}

export interface UtilityStripConfig {
  isActive: boolean;
  /** Right-hand links (Sell on ZID, Merchant login, hotline). */
  phone: string;
  sellLabel: string;
  merchantLoginLabel: string;
  items: UtilityStripItem[];
}

/* ─────────────────────────────── featured ─────────────────────────────── */

export interface FeaturedConfig {
  /** Products pinned into the "Featured" grid, highest priority first. */
  productIds: string[];
  /** Vendor refs (slug / ZID-BD code / UUID) highlighted for the operator. */
  vendorRefs: string[];
  /** Show the "Today's best deals" strip (auto-aggregated from discounts). */
  dealsEnabled: boolean;
  /** Headings the admin can rename. */
  featuredTitle: string;
  featuredSubtitle: string;
  dealsTitle: string;
  dealsSubtitle: string;
  /** Max products shown in each strip. */
  featuredLimit: number;
  dealsLimit: number;
}

/* ─────────────────────────────── defaults ─────────────────────────────── */

export const DEFAULT_BANNERS: MarketplaceBanner[] = [
  {
    id: 'mega-sale',
    eyebrow: 'MEGA MARKETPLACE SALE',
    title: 'Up to 60% off across 1,000+ stores',
    subtitle: 'One basket, many sellers — delivered nationwide with cash on delivery.',
    cta: 'Shop the sale',
    gradient: 'from-[#3b2fd6] via-[#5b4bff] to-[#8b5cf6]',
    accentText: 'text-amber-300',
    isActive: true,
    sortOrder: 0,
  },
  {
    id: 'fashion',
    eyebrow: 'FASHION & LIFESTYLE',
    title: 'Jamdani, muslin & silk sarees',
    subtitle: 'Hand-picked collections from Bangladesh’s finest weavers.',
    cta: 'Explore fashion',
    gradient: 'from-[#7c2d12] via-[#b45309] to-[#f59e0b]',
    category: 'fashion',
    accentText: 'text-amber-100',
    isActive: true,
    sortOrder: 1,
  },
  {
    id: 'electronics',
    eyebrow: 'GADGETS & TECH',
    title: 'New arrivals in electronics',
    subtitle: 'Verified sellers, genuine warranty, easy returns within 7 days.',
    cta: 'Browse electronics',
    gradient: 'from-[#0f172a] via-[#1e293b] to-[#0ea5e9]',
    category: 'electronics',
    accentText: 'text-sky-300',
    isActive: true,
    sortOrder: 2,
  },
  {
    id: 'free-delivery',
    eyebrow: 'PLATFORM OFFER',
    title: 'Free delivery over ৳2,000',
    subtitle: 'Across every seller in the marketplace — no coupon required.',
    cta: 'Start shopping',
    gradient: 'from-[#064e3b] via-[#047857] to-[#10b981]',
    accentText: 'text-emerald-200',
    isActive: true,
    sortOrder: 3,
  },
];

export const DEFAULT_STRIP: UtilityStripConfig = {
  isActive: true,
  phone: '09600-000000',
  sellLabel: 'Sell on ZID',
  merchantLoginLabel: 'Merchant login',
  items: [
    { id: 'districts', icon: 'MapPin', text: 'Deliver to all 64 districts', isActive: true },
    { id: 'free-delivery', icon: 'Truck', text: 'Free delivery over ৳2,000', isActive: true },
    { id: 'returns', icon: 'RotateCcw', text: '7-day easy returns', isActive: true },
  ],
};

export const DEFAULT_FEATURED: FeaturedConfig = {
  productIds: [],
  vendorRefs: [],
  dealsEnabled: true,
  featuredTitle: 'Featured picks',
  featuredSubtitle: 'Hand-picked by the ZID team from across the marketplace.',
  dealsTitle: 'Today’s best deals',
  dealsSubtitle: 'Every discounted product across every seller, in one place.',
  featuredLimit: 12,
  dealsLimit: 12,
};

/**
 * Seed categories mirror the built-in emoji table in the marketplace view, so
 * the rail looks identical before the operator touches anything — but now each
 * row is editable.
 */
export const DEFAULT_MARKETPLACE_CATEGORIES: MarketplaceCategory[] = [
  { id: 'cat-fashion', name: 'fashion', emoji: '👗', isActive: true, isFeatured: true, sortOrder: 0 },
  { id: 'cat-electronics', name: 'electronics', emoji: '📱', isActive: true, isFeatured: true, sortOrder: 1 },
  { id: 'cat-beauty', name: 'beauty', emoji: '💄', isActive: true, isFeatured: true, sortOrder: 2 },
  { id: 'cat-home', name: 'home', emoji: '🏠', isActive: true, isFeatured: true, sortOrder: 3 },
  { id: 'cat-food', name: 'food', emoji: '🛒', isActive: true, isFeatured: true, sortOrder: 4 },
  { id: 'cat-health', name: 'health', emoji: '💊', isActive: true, isFeatured: true, sortOrder: 5 },
  { id: 'cat-sports', name: 'sports', emoji: '🏏', isActive: true, isFeatured: true, sortOrder: 6 },
  { id: 'cat-toys', name: 'toys', emoji: '🧸', isActive: true, isFeatured: true, sortOrder: 7 },
  { id: 'cat-books', name: 'books', emoji: '📚', isActive: true, isFeatured: true, sortOrder: 8 },
  { id: 'cat-jewellery', name: 'jewellery', emoji: '💎', isActive: true, isFeatured: true, sortOrder: 9 },
];

/* ─────────────────────────────── helpers ─────────────────────────────── */

function toNum(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const s = String(value).toLowerCase();
  return !['false', '0', 'no', 'off', 'hidden', 'inactive'].includes(s);
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function safeDb() {
  try {
    return await getMongoDb(DB_NAME);
  } catch (err: any) {
    console.warn('[MarketplaceStorefront] database unavailable:', err?.message || err);
    return null;
  }
}

async function readConfigDoc(configKey: string): Promise<Record<string, any> | null> {
  const db = await safeDb();
  if (!db) return null;
  try {
    const doc: any = await db.collection(MARKETPLACE_CONFIG_COLLECTION).findOne({ config_key: configKey });
    return doc ? toJsonPlain(doc) : null;
  } catch (err: any) {
    console.warn(`[MarketplaceStorefront] read ${configKey} warning:`, err?.message || err);
    return null;
  }
}

async function writeConfigDoc(configKey: string, payload: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
  const db = await safeDb();
  if (!db) return { ok: false, error: 'The database is unavailable.' };
  try {
    const now = new Date().toISOString();

    // Large base64 uploads (a hero image saved as a data-URL when no object
    // store is wired up) would push this document toward Mongo's 16MB ceiling
    // and make every read pay for the payload. Uploads are downscaled client
    // side to keep this rare; the guard below is the backstop.
    const clean = toJsonPlain({ ...payload, config_key: configKey, updated_at: now }) as Record<string, any>;
    const estimate = JSON.stringify(clean, (key, value) => {
      if (key === 'image' || key === 'cover' || key === 'imageUrl') return undefined;
      return value;
    }).length;
    const images = JSON.stringify(clean).length - estimate;
    if (images > 6 * 1024 * 1024) {
      return { ok: false, error: 'The uploaded image is too large to store. Use an image under ~4MB or host it on a CDN.' };
    }

    await db.collection(MARKETPLACE_CONFIG_COLLECTION).updateOne(
      { config_key: configKey },
      { $set: clean, $setOnInsert: { created_at: now } },
      { upsert: true }
    );
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'The configuration could not be saved.' };
  }
}

/* ─────────────────────────────── banners API ─────────────────────────────── */

function normalizeBanner(raw: any, index: number): MarketplaceBanner {
  return {
    id: String(raw?.id || makeId('banner')),
    eyebrow: String(raw?.eyebrow ?? ''),
    title: String(raw?.title ?? ''),
    subtitle: String(raw?.subtitle ?? ''),
    cta: String(raw?.cta ?? 'Shop now'),
    gradient: String(raw?.gradient || 'from-[#3b2fd6] via-[#5b4bff] to-[#8b5cf6]'),
    image: raw?.image ? String(raw.image) : undefined,
    category: raw?.category ? String(raw.category) : undefined,
    search: raw?.search ? String(raw.search) : undefined,
    accentText: raw?.accentText ? String(raw.accentText) : undefined,
    isActive: toBool(raw?.isActive ?? raw?.is_active, true),
    sortOrder: toNum(raw?.sortOrder ?? raw?.sort_order, index),
    created_at: raw?.created_at ? String(raw.created_at) : undefined,
    updated_at: raw?.updated_at ? String(raw.updated_at) : undefined,
  };
}

/** Admin read — every banner, including inactive ones. */
export async function listMarketplaceBanners(): Promise<{ ok: boolean; banners: MarketplaceBanner[]; seeded: boolean; error?: string }> {
  const doc = await readConfigDoc(CONFIG_KEY_BANNERS);
  const rows = Array.isArray(doc?.banners) ? doc!.banners : null;
  if (!rows) {
    // First run: persist the defaults so the admin edits a real record set.
    await writeConfigDoc(CONFIG_KEY_BANNERS, { banners: DEFAULT_BANNERS });
    return { ok: true, banners: DEFAULT_BANNERS, seeded: true };
  }
  const banners = rows
    .map((row: any, i: number) => normalizeBanner(row, i))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return { ok: true, banners, seeded: false };
}

/** Public read — active banners only, in display order. */
export async function getActiveMarketplaceBanners(): Promise<MarketplaceBanner[]> {
  const { banners } = await listMarketplaceBanners();
  return banners.filter((b) => b.isActive && (b.title || b.image));
}

export async function saveMarketplaceBanner(input: any): Promise<{ ok: boolean; banner?: MarketplaceBanner; error?: string }> {
  const { banners } = await listMarketplaceBanners();
  const rawId = String(input?.id || '').trim();
  const existingIndex = rawId ? banners.findIndex((b) => b.id === rawId) : -1;

  const merged = normalizeBanner(
    {
      ...(existingIndex >= 0 ? banners[existingIndex] : {}),
      ...input,
      id: rawId || makeId('banner'),
    },
    existingIndex >= 0 ? banners[existingIndex].sortOrder : banners.length
  );

  if (!merged.title.trim() && !merged.image) {
    return { ok: false, error: 'A banner needs a title or an image.' };
  }

  const next = existingIndex >= 0
    ? banners.map((b, i) => (i === existingIndex ? { ...merged, created_at: b.created_at } : b))
    : [...banners, merged];

  const result = await writeConfigDoc(CONFIG_KEY_BANNERS, { banners: next });
  return result.ok ? { ok: true, banner: merged } : { ok: false, error: result.error };
}

export async function deleteMarketplaceBanner(id: string): Promise<{ ok: boolean; error?: string }> {
  const { banners } = await listMarketplaceBanners();
  const next = banners.filter((b) => b.id !== String(id));
  const result = await writeConfigDoc(CONFIG_KEY_BANNERS, { banners: next });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** Persist a whole ordered list in one write (used by the reorder controls). */
export async function reorderMarketplaceBanners(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  const { banners } = await listMarketplaceBanners();
  const rank = new Map(ids.map((id, i) => [String(id), i]));
  const next = banners
    .map((b) => ({ ...b, sortOrder: rank.has(b.id) ? rank.get(b.id)! : b.sortOrder }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((b, i) => ({ ...b, sortOrder: i }));
  const result = await writeConfigDoc(CONFIG_KEY_BANNERS, { banners: next });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/* ────────────────────────────── categories API ────────────────────────────── */

function normalizeCategory(raw: any, index: number): MarketplaceCategory {
  return {
    id: String(raw?.id || makeId('cat')),
    name: String(raw?.name ?? '').trim(),
    emoji: raw?.emoji ? String(raw.emoji) : undefined,
    image: raw?.image ? String(raw.image) : undefined,
    isActive: toBool(raw?.isActive ?? raw?.is_active ?? raw?.status !== 'hidden', true),
    isFeatured: toBool(raw?.isFeatured ?? raw?.is_featured, true),
    sortOrder: toNum(raw?.sortOrder ?? raw?.sort_order, index),
    created_at: raw?.created_at ? String(raw.created_at) : undefined,
    updated_at: raw?.updated_at ? String(raw.updated_at) : undefined,
  };
}

export async function listMarketplaceCategories(): Promise<{ ok: boolean; categories: MarketplaceCategory[]; seeded: boolean; error?: string }> {
  const doc = await readConfigDoc(CONFIG_KEY_CATEGORIES);
  const rows = Array.isArray(doc?.categories) ? doc!.categories : null;
  if (!rows) {
    // Deliberately does NOT seed: an empty catalogue should start empty rather
    // than invent ten categories the operator never created. The DEFAULT list
    // is offered in the UI as a "load suggested set" action.
    return { ok: true, categories: [], seeded: false };
  }
  const categories = rows
    .map((row: any, i: number) => normalizeCategory(row, i))
    .filter((c) => c.name)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return { ok: true, categories, seeded: false };
}

export async function getActiveMarketplaceCategories(): Promise<MarketplaceCategory[]> {
  const { categories } = await listMarketplaceCategories();
  return categories.filter((c) => c.isActive);
}

export async function saveMarketplaceCategory(input: any): Promise<{ ok: boolean; category?: MarketplaceCategory; error?: string }> {
  const { categories } = await listMarketplaceCategories();
  const rawId = String(input?.id || '').trim();
  const existingIndex = rawId ? categories.findIndex((c) => c.id === rawId) : -1;
  const name = String(input?.name ?? '').trim();
  if (!name) return { ok: false, error: 'A category name is required.' };

  // Names are the join key to products, so they must be unique (case-insensitive).
  const clash = categories.find(
    (c, i) => i !== existingIndex && c.name.toLowerCase() === name.toLowerCase()
  );
  if (clash) return { ok: false, error: `“${name}” already exists in the list.` };

  const merged = normalizeCategory(
    {
      ...(existingIndex >= 0 ? categories[existingIndex] : {}),
      ...input,
      name,
      id: rawId || makeId('cat'),
    },
    existingIndex >= 0 ? categories[existingIndex].sortOrder : categories.length
  );

  const next = existingIndex >= 0
    ? categories.map((c, i) => (i === existingIndex ? { ...merged, created_at: c.created_at } : c))
    : [...categories, merged];

  const result = await writeConfigDoc(CONFIG_KEY_CATEGORIES, { categories: next });
  return result.ok ? { ok: true, category: merged } : { ok: false, error: result.error };
}

export async function deleteMarketplaceCategory(id: string): Promise<{ ok: boolean; error?: string }> {
  const { categories } = await listMarketplaceCategories();
  const next = categories.filter((c) => c.id !== String(id));
  const result = await writeConfigDoc(CONFIG_KEY_CATEGORIES, { categories: next });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function reorderMarketplaceCategories(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  const { categories } = await listMarketplaceCategories();
  const rank = new Map(ids.map((id, i) => [String(id), i]));
  const next = categories
    .map((c) => ({ ...c, sortOrder: rank.has(c.id) ? rank.get(c.id)! : c.sortOrder }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c, i) => ({ ...c, sortOrder: i }));
  const result = await writeConfigDoc(CONFIG_KEY_CATEGORIES, { categories: next });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** Seed the suggested category set (one-click "load defaults" in the admin UI). */
export async function seedMarketplaceCategories(): Promise<{ ok: boolean; categories: MarketplaceCategory[]; error?: string }> {
  const { categories } = await listMarketplaceCategories();
  const existing = new Set(categories.map((c) => c.name.toLowerCase()));
  const additions = DEFAULT_MARKETPLACE_CATEGORIES
    .filter((c) => !existing.has(c.name.toLowerCase()))
    .map((c, i) => ({ ...c, sortOrder: categories.length + i }));
  const next = [...categories, ...additions];
  const result = await writeConfigDoc(CONFIG_KEY_CATEGORIES, { categories: next });
  return result.ok ? { ok: true, categories: next } : { ok: false, categories, error: result.error };
}

/* ────────────────────────────── utility strip API ────────────────────────────── */

function normalizeStrip(raw: any): UtilityStripConfig {
  const items = Array.isArray(raw?.items) ? raw!.items : null;
  return {
    isActive: toBool(raw?.isActive, DEFAULT_STRIP.isActive),
    phone: String(raw?.phone ?? DEFAULT_STRIP.phone),
    sellLabel: String(raw?.sellLabel ?? DEFAULT_STRIP.sellLabel),
    merchantLoginLabel: String(raw?.merchantLoginLabel ?? DEFAULT_STRIP.merchantLoginLabel),
    items: (items || DEFAULT_STRIP.items).map((item: any, i: number) => ({
      id: String(item?.id || `strip-${i}`),
      icon: String(item?.icon || 'MapPin'),
      text: String(item?.text ?? ''),
      isActive: toBool(item?.isActive, true),
    })).filter((item: UtilityStripItem) => item.text),
  };
}

export async function getUtilityStrip(): Promise<UtilityStripConfig> {
  const doc = await readConfigDoc(CONFIG_KEY_STRIP);
  return normalizeStrip(doc);
}

export async function saveUtilityStrip(input: any): Promise<{ ok: boolean; strip?: UtilityStripConfig; error?: string }> {
  const strip = normalizeStrip(input);
  const result = await writeConfigDoc(CONFIG_KEY_STRIP, { strip });
  return result.ok ? { ok: true, strip } : { ok: false, error: result.error };
}

/* ────────────────────────────── featured API ────────────────────────────── */

function normalizeFeatured(raw: any): FeaturedConfig {
  const ids = Array.isArray(raw?.productIds)
    ? raw!.productIds
    : Array.isArray(raw?.products) ? raw!.products : [];
  const vendors = Array.isArray(raw?.vendorRefs)
    ? raw!.vendorRefs
    : Array.isArray(raw?.vendors) ? raw!.vendors : [];
  const clampLimit = (v: unknown, fallback: number) => Math.min(48, Math.max(1, Math.floor(toNum(v, fallback))));
  return {
    productIds: ids.map((id: any) => String(id ?? '').trim()).filter(Boolean).slice(0, 60),
    vendorRefs: vendors.map((v: any) => String(v ?? '').trim()).filter(Boolean).slice(0, 40),
    dealsEnabled: toBool(raw?.dealsEnabled, DEFAULT_FEATURED.dealsEnabled),
    featuredTitle: String(raw?.featuredTitle || DEFAULT_FEATURED.featuredTitle),
    featuredSubtitle: String(raw?.featuredSubtitle ?? DEFAULT_FEATURED.featuredSubtitle),
    dealsTitle: String(raw?.dealsTitle || DEFAULT_FEATURED.dealsTitle),
    dealsSubtitle: String(raw?.dealsSubtitle ?? DEFAULT_FEATURED.dealsSubtitle),
    featuredLimit: clampLimit(raw?.featuredLimit, DEFAULT_FEATURED.featuredLimit),
    dealsLimit: clampLimit(raw?.dealsLimit, DEFAULT_FEATURED.dealsLimit),
  };
}

export async function getFeaturedConfig(): Promise<FeaturedConfig> {
  const doc = await readConfigDoc(CONFIG_KEY_FEATURED);
  return normalizeFeatured(doc);
}

export async function saveFeaturedConfig(input: any): Promise<{ ok: boolean; featured?: FeaturedConfig; error?: string }> {
  const featured = normalizeFeatured(input);
  const result = await writeConfigDoc(CONFIG_KEY_FEATURED, { featured });
  return result.ok ? { ok: true, featured } : { ok: false, error: result.error };
}

/* ──────────────────────── public storefront payload ──────────────────────── */

export interface MarketplaceStorefrontConfig {
  banners: MarketplaceBanner[];
  categories: MarketplaceCategory[];
  strip: UtilityStripConfig;
  featured: FeaturedConfig;
  /** True when the database could not be reached (built-in defaults served). */
  degraded: boolean;
}

/**
 * Everything the public marketplace needs, in ONE request.
 *
 * A single round-trip matters here: the hero, the category rail and the strip
 * all render above the fold, and three independent fetches would paint the page
 * in three visible stages.
 */
export async function getMarketplaceStorefrontConfig(): Promise<MarketplaceStorefrontConfig> {
  try {
    const [bannerRes, categoryRes, strip, featured] = await Promise.all([
      listMarketplaceBanners().catch(() => ({ ok: false, banners: DEFAULT_BANNERS, seeded: false })),
      listMarketplaceCategories().catch(() => ({ ok: false, categories: [] as MarketplaceCategory[], seeded: false })),
      getUtilityStrip().catch(() => DEFAULT_STRIP),
      getFeaturedConfig().catch(() => DEFAULT_FEATURED),
    ]);

    const categories = categoryRes.categories;
    return {
      banners: (bannerRes.banners || []).filter((b) => b.isActive && (b.title || b.image)),
      categories: categories.length > 0
        ? categories.filter((c) => c.isActive)
        : DEFAULT_MARKETPLACE_CATEGORIES.filter((c) => c.isActive),
      strip,
      featured,
      degraded: false,
    };
  } catch (err: any) {
    console.warn('[MarketplaceStorefront] storefront config warning:', err?.message || err);
    return {
      banners: DEFAULT_BANNERS,
      categories: DEFAULT_MARKETPLACE_CATEGORIES,
      strip: DEFAULT_STRIP,
      featured: DEFAULT_FEATURED,
      degraded: true,
    };
  }
}

/* ─────────────────────── featured/deals product resolution ─────────────────── */

/** Mongo `$or` that maps a product row back to its selling store. */
function storeClausesFor(vendorRef: string): Record<string, any>[] {
  const ref = String(vendorRef || '').trim();
  if (!ref) return [];
  const lower = ref.toLowerCase();
  return [
    { store_slug: lower },
    { storeSlug: lower },
    { store_id: ref },
    { storeId: ref },
    { merchant_id: ref },
    { merchantId: ref },
    { store_code: ref.toUpperCase() },
    { storeCode: ref.toUpperCase() },
  ];
}

/**
 * Resolve the admin's pinned product ids + highlighted vendors into real,
 * purchasable product rows.
 *
 * Ordering is deliberate: pinned products come first (in the admin's order),
 * then products from highlighted vendors by discount, then (only if still
 * short) the biggest discounted products platform-wide. That way the strip is
 * never half-empty just because an operator pinned two products.
 */
export async function resolveFeaturedProducts(
  productIds: string[],
  vendorRefs: string[],
  limit = 12
): Promise<any[]> {
  const db = await safeDb();
  if (!db) return [];

  try {
    const coll = db.collection('products');
    const publicFilter = {
      is_published: { $ne: false },
      status: { $nin: ['archived', 'hidden', 'draft'] },
    };

    const pinnedIds = (productIds || []).map(String).filter(Boolean).slice(0, 60);
    // Products are keyed by a string `id` in this app, but a row seeded straight
    // into Mongo may only carry an ObjectId `_id`. `_id` is typed as ObjectId in
    // the driver, so the cast keeps both spellings in one $or.
    const objectIds = pinnedIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    const pinned: any[] = pinnedIds.length
      ? await (coll as any).find({
        ...publicFilter,
        $or: [{ id: { $in: pinnedIds } }, { _id: { $in: objectIds } }],
      }).limit(80).toArray().catch(() => [])
      : [];

    // Re-apply the operator's ordering; anything not found is simply skipped.
    const byId = new Map<string, any>();
    for (const row of pinned) byId.set(String(row.id ?? row._id), row);
    const ordered: any[] = [];
    for (const id of pinnedIds) {
      const row = byId.get(id);
      if (row && !ordered.includes(row)) ordered.push(row);
    }

    if (ordered.length >= limit) return ordered.slice(0, limit);

    const vendorOr = (vendorRefs || []).flatMap(storeClausesFor);
    const seen = new Set(ordered.map((p) => String(p.id ?? p._id)));

    const pushUnique = (rows: any[]) => {
      for (const row of rows) {
        if (ordered.length >= limit) break;
        const key = String(row.id ?? row._id);
        if (seen.has(key)) continue;
        seen.add(key);
        ordered.push(row);
      }
    };

    if (vendorOr.length) {
      const fromVendors = await coll
        .find({ ...publicFilter, $or: vendorOr })
        .sort({ created_at: -1 })
        .limit(limit * 3)
        .toArray()
        .catch(() => []);
      pushUnique(fromVendors);
    }

    if (ordered.length < limit) {
      const fill = await coll
        .find(publicFilter)
        .sort({ salesCount: -1, created_at: -1 })
        .limit(limit * 2)
        .toArray()
        .catch(() => []);
      pushUnique(fill);
    }

    return ordered.slice(0, limit);
  } catch (err: any) {
    console.warn('[MarketplaceStorefront] resolveFeaturedProducts warning:', err?.message || err);
    return [];
  }
}

/** The biggest live discounts across every active seller ("Today's deals"). */
export async function resolveDealProducts(limit = 12): Promise<any[]> {
  const db = await safeDb();
  if (!db) return [];
  try {
    const rows = await db.collection('products')
      .find({
        is_published: { $ne: false },
        status: { $nin: ['archived', 'hidden', 'draft'] },
      })
      // Compare-at above price is what makes a product a "deal"; Mongo cannot
      // diff two fields in a plain find sort, so rank by the stored percent
      // first and fall back to recency.
      .sort({ discount_percent: -1, created_at: -1 })
      .limit(Math.max(limit * 6, 60))
      .toArray()
      .catch(() => []);

    return rows.filter((row: any) => {
      const price = toNum(row.priceBDT ?? row.price ?? row.price_bdt, 0);
      const compareAt = toNum(
        row.compareAtPriceBDT ?? row.compare_at_price_bdt ?? row.compareAtPrice ?? row.compare_at_price,
        0
      );
      return compareAt > price && price > 0;
    }).slice(0, limit);
  } catch (err: any) {
    console.warn('[MarketplaceStorefront] resolveDealProducts warning:', err?.message || err);
    return [];
  }
}

/** Candidate products for the admin picker (title search + vendor filter). */
export async function searchAdminProducts(params: {
  q?: string;
  vendor?: string;
  limit?: number;
}): Promise<{ ok: boolean; products: any[]; error?: string }> {
  const db = await safeDb();
  if (!db) return { ok: false, products: [], error: 'The database is unavailable.' };
  const limit = Math.min(60, Math.max(1, Math.floor(toNum(params.limit, 30))));
  try {
    const and: Record<string, any>[] = [];
    if (params.q && params.q.trim()) {
      const rx = new RegExp(params.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      and.push({ $or: [{ title: rx }, { name: rx }, { sku: rx }, { brand: rx }] });
    }
    if (params.vendor && params.vendor.trim()) {
      const clauses = storeClausesFor(params.vendor.trim());
      if (clauses.length) and.push({ $or: clauses });
    }
    const filter = and.length ? { $and: and } : {};
    const rows = await db.collection('products')
      .find(filter)
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();
    return {
      ok: true,
      products: rows.map((row: any) => ({
        id: String(row.id ?? row._id ?? ''),
        title: String(row.title || row.name || 'Untitled'),
        price: toNum(row.priceBDT ?? row.price ?? row.price_bdt, 0),
        image: row.image || row.image_url || row.imageUrl || row.thumbnail || '',
        vendor_name: String(row.store_name || row.storeName || row.vendor_name || row.store_slug || row.storeSlug || ''),
        vendor_slug: String(row.store_slug || row.storeSlug || ''),
        category: String(row.category || ''),
        status: String(row.status || 'active'),
      })),
    };
  } catch (err: any) {
    return { ok: false, products: [], error: err?.message || 'Products could not be searched.' };
  }
}

export default {
  listMarketplaceBanners,
  getActiveMarketplaceBanners,
  saveMarketplaceBanner,
  deleteMarketplaceBanner,
  reorderMarketplaceBanners,
  listMarketplaceCategories,
  getActiveMarketplaceCategories,
  saveMarketplaceCategory,
  deleteMarketplaceCategory,
  reorderMarketplaceCategories,
  seedMarketplaceCategories,
  getUtilityStrip,
  saveUtilityStrip,
  getFeaturedConfig,
  saveFeaturedConfig,
  getMarketplaceStorefrontConfig,
  resolveFeaturedProducts,
  resolveDealProducts,
  searchAdminProducts,
};
