/**
 * Theme registry — the single source of truth that binds a theme ID (from the
 * Super Admin Theme Manager / the Supabase+Mongo platform catalogue) to an
 * actual STOREFRONT LAYOUT.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Theme Manager previously only stored cosmetic metadata (name, price,
 * thumbnail). Nothing mapped a theme to a rendered layout, so selecting a theme
 * changed nothing on `/store/:slug`. This module closes that gap:
 *
 *   theme id  →  layout key  → <Layout /> renderer
 *
 * Layouts:
 *   - 'classic'    → the full luxury storefront (TenantStorefrontView)
 *   - 'supermarket'→ the supermarket & tech mega-store mockup
 *   - 'fashion'    → the elegant fashion/boutique mockup
 *
 * Any theme the admin creates WITHOUT an explicit layout is resolved by
 * category/name heuristics (see resolveLayoutForTheme), so brand-new admin
 * themes still render a sensible layout instead of falling back to nothing.
 *
 * This module is import-safe from both the merchant dashboard and the Super
 * Admin portal (no React / DOM dependency; pure data + string logic).
 */

/** The set of layout renderers the storefront can mount. */
export type ThemeLayoutKey = 'classic' | 'supermarket' | 'fashion';

/** Minimal shape shared by every theme source (platform themes + market items). */
export interface ThemeRegistryEntry {
  /** Stable theme id. */
  id: string;
  name: string;
  category?: string;
  /** Explicit layout. When omitted, it is derived from category/name. */
  layout?: ThemeLayoutKey;
  /** Accent / primary colour applied as a CSS variable on the storefront. */
  primaryColor?: string;
  isFree?: boolean;
  price?: number;
  thumbnailUrl?: string;
  previewUrl?: string;
  status?: string;
}

/** Human-readable label for each layout (used in the admin/merchant UI). */
export const LAYOUT_LABELS: Record<ThemeLayoutKey, string> = {
  classic: 'Classic Luxury (default storefront)',
  supermarket: 'Supermarket & Tech Mega-Store',
  fashion: 'Elegant Fashion & Boutique',
};

/**
 * Local, always-available fallback used whenever a theme has no thumbnail or
 * its remote thumbnail fails to load. The asset ships with the app, so this
 * never leaves a broken-image box behind.
 */
export const THEME_THUMBNAIL_PLACEHOLDER = '/theme-placeholder.svg';

/**
 * Canonical preview thumbnails for the platform themes.
 *
 * The Super Admin catalogue stores only cosmetic metadata and frequently ships
 * an EMPTY `thumbnail_url` / `preview_url` (see the `themes` seed), which is why
 * the merchant-facing Themes view used to show broken thumbnails. This map is
 * the single source of truth that back-fills a real image for every built-in /
 * well-known theme, keyed by BOTH the theme id (lower-cased) and the theme name
 * (lower-cased, trimmed) so renamed/legacy rows still resolve.
 */
const THEME_THUMBNAILS: Record<string, string> = {
  // Canonical built-in ids
  'growth-1':
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=800',
  'modern-gold-luxury':
    'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&q=80&w=800',
  'supermarket-tech':
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=800',
  'elegant-fashion':
    'https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&q=80&w=800',

  // Seed / legacy ids used by the Super Admin theme manager
  'theme-1':
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=800',
  'theme-2':
    'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&q=80&w=800',
  'theme-3':
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=800',

  // Well-known theme names (matched case-insensitively)
  'default modern':
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=800',
  'luxury boutique':
    'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&q=80&w=800',
  'tech store pro':
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=800',
  'growth (free standard)':
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=800',
  'modern gold luxury':
    'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&q=80&w=800',
  'supermarket & tech mega-store':
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=800',
  'elegant fashion & lifestyle':
    'https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&q=80&w=800',
};

/** True when a string is a usable remote image URL (not empty / `'#'`). */
function isUsableThumbnail(value?: string | null): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.trim() !== '#';
}

/**
 * Resolve the best available preview thumbnail for a theme.
 *
 * Priority:
 *   1. An explicitly supplied thumbnail/preview URL from the source row.
 *   2. The canonical registry thumbnail (by id, then by name).
 *   3. The bundled local placeholder — so the UI NEVER renders a broken image.
 */
export function resolveThemeThumbnail(theme?: Partial<ThemeRegistryEntry> | null): string {
  if (!theme) return THEME_THUMBNAIL_PLACEHOLDER;

  if (isUsableThumbnail(theme.thumbnailUrl)) return theme.thumbnailUrl.trim();
  if (isUsableThumbnail(theme.previewUrl)) return theme.previewUrl.trim();

  const id = String(theme.id || '').trim().toLowerCase();
  if (id && THEME_THUMBNAILS[id]) return THEME_THUMBNAILS[id];

  const name = String(theme.name || '').trim().toLowerCase();
  if (name && THEME_THUMBNAILS[name]) return THEME_THUMBNAILS[name];

  return THEME_THUMBNAIL_PLACEHOLDER;
}

/**
 * Canonical, built-in themes. These IDs match `themeCatalog` in OnlineStoreView
 * and the mockups in ThemeMockups.tsx, so a merchant picking any of them sees an
 * actual, distinct layout on the live storefront.
 */
export const BUILTIN_THEMES: ThemeRegistryEntry[] = [
  {
    id: 'growth-1',
    name: 'Growth (Free Standard)',
    category: 'General E-Commerce',
    layout: 'classic',
    primaryColor: '#00D68F',
    isFree: true,
    price: 0,
    thumbnailUrl: THEME_THUMBNAILS['growth-1'],
  },
  {
    id: 'modern-gold-luxury',
    name: 'Modern Gold Luxury',
    category: 'Luxury & Jewelry',
    layout: 'classic',
    primaryColor: '#D4AF37',
    isFree: false,
    price: 1999,
    thumbnailUrl: THEME_THUMBNAILS['modern-gold-luxury'],
  },
  {
    id: 'supermarket-tech',
    name: 'Supermarket & Tech Mega-Store',
    category: 'Supermarket & Tech',
    layout: 'supermarket',
    primaryColor: '#00D68F',
    isFree: false,
    price: 2499,
    thumbnailUrl: THEME_THUMBNAILS['supermarket-tech'],
  },
  {
    id: 'elegant-fashion',
    name: 'Elegant Fashion & Lifestyle',
    category: 'Fashion & Apparel',
    layout: 'fashion',
    primaryColor: '#111827',
    isFree: false,
    price: 1999,
    thumbnailUrl: THEME_THUMBNAILS['elegant-fashion'],
  },
];

/** Fast id → entry lookup for the built-ins. */
const BUILTIN_BY_ID = new Map(BUILTIN_THEMES.map((theme) => [theme.id.toLowerCase(), theme]));

/**
 * Resolve the layout a theme should render.
 *
 * Priority:
 *   1. An explicit `layout` on the theme entry.
 *   2. A built-in theme with the same id.
 *   3. Heuristics on the category + name (so admin-created themes map sensibly).
 *   4. 'classic' (always renders a valid storefront).
 */
export function resolveLayoutForTheme(theme?: Partial<ThemeRegistryEntry> | null): ThemeLayoutKey {
  if (!theme) return 'classic';
  if (theme.layout) return theme.layout;

  const id = String(theme.id || '').toLowerCase();
  const builtin = BUILTIN_BY_ID.get(id);
  if (builtin?.layout) return builtin.layout;

  const haystack = `${theme.category || ''} ${theme.name || ''} ${id}`.toLowerCase();

  if (/supermarket|grocery|mega-?store|tech|electronics|catch|luzuk/.test(haystack)) return 'supermarket';
  if (/fashion|boutique|apparel|clothing|lifestyle|elegant|fashion-?wear/.test(haystack)) return 'fashion';
  return 'classic';
}

/**
 * Normalise any theme source into a registry entry, filling the id/name and
 * deriving the layout. Accepts the Super Admin `PlatformTheme` shape, the
 * merchant `ThemeMarketItem` shape, or a raw DB row.
 */
export function toRegistryEntry(theme: Record<string, any>): ThemeRegistryEntry {
  const id = String(theme.id || theme.slug || theme.theme_id || theme.code || '').trim();
  const name = String(theme.name || theme.title || theme.theme_name || id || 'Theme').trim();
  const category = theme.category ? String(theme.category) : undefined;
  const entry: ThemeRegistryEntry = {
    id,
    name,
    category,
    layout: theme.layout || theme.themeLayout,
    primaryColor: theme.primaryColor || theme.primary_color || theme.themePrimaryColor,
    isFree: theme.isFree ?? theme.is_free ?? (Number(theme.price ?? theme.priceBDT ?? 0) === 0),
    price: Number(theme.price ?? theme.priceBDT ?? theme.price_bdt ?? 0) || 0,
    thumbnailUrl: theme.thumbnailUrl || theme.thumbnail_url || '',
    previewUrl: theme.previewUrl || theme.preview_url || '',
    status: theme.status ? String(theme.status) : undefined,
  };
  // Back-fill a real preview image so the catalogue never ships a broken
  // thumbnail just because the DB row stored an empty URL.
  entry.thumbnailUrl = resolveThemeThumbnail({ ...entry, id, name });

  // Ensure a deterministic layout even when the source omitted one.
  entry.layout = resolveLayoutForTheme(entry);
  return entry;
}

/**
 * Merge platform (admin) themes with the built-ins so the merchant selector
 * always offers the built-ins while also surfacing admin-created themes.
 * Admin themes win on id collisions (they are the current platform truth).
 */
export function mergeThemeCatalog(platformThemes: Array<Record<string, any>> = []): ThemeRegistryEntry[] {
  const byId = new Map<string, ThemeRegistryEntry>();
  for (const builtin of BUILTIN_THEMES) byId.set(builtin.id.toLowerCase(), builtin);
  for (const raw of platformThemes) {
    const entry = toRegistryEntry(raw);
    if (entry.id) byId.set(entry.id.toLowerCase(), entry);
  }
  return [...byId.values()];
}

/** Look up a single merged theme by id (falls back to the free classic theme). */
export function findThemeById(
  id: string | undefined | null,
  platformThemes: Array<Record<string, any>> = []
): ThemeRegistryEntry {
  const merged = mergeThemeCatalog(platformThemes);
  const key = String(id || '').toLowerCase();
  return merged.find((theme) => theme.id.toLowerCase() === key) || merged[0];
}

/* ────────────────────────── sample demo data ────────────────────────── */

/** A representative sample product used for live demo previews. */
export interface SampleProduct {
  id: string;
  title: string;
  name: string;
  price: number;
  priceBDT: number;
  image: string;
  category: string;
  stock: number;
  status: string;
  is_published: boolean;
}

/**
 * Sample store data so the Super Admin can preview ANY theme without a real
 * store existing. This is what makes the eye-icon preview self-contained and
 * independent of the currently logged-in merchant (no login redirect).
 */
export const SAMPLE_STORE = {
  slug: 'demo-store',
  merchant: {
    id: 'demo-store',
    storeId: 'demo-store',
    storeCode: 'ZID-BD-DEMO',
    storeName: 'Demo Store',
    storeSlug: 'demo-store',
    ownerName: 'Demo Merchant',
    email: 'demo@zidbd.com',
    phone: '+8801700000',
    subscriptionPlan: 'pro_6m',
    logoUrl: '',
    heroTitle: 'Welcome to Your Store',
    heroSubtitle: 'Discover our curated collection of products',
    announcementText: 'Free delivery on orders over ৳1000',
    primaryColor: '#00D68F',
    paymentMethods: { cod: true },
    themeConfig: {
      primaryColor: '#00D68F',
      showAnnouncement: true,
      showHeroBanner: true,
      heroTitle: 'Welcome to Your Store',
      heroSubtitle: 'Discover our curated collection of products',
      showCategories: true,
      showFeaturedGrid: true,
      showCountdown: true,
      showGallery: false,
      showSocialBlock: false,
    },
  },
};

/** Sample products (valid `Product`-compatible shape) for demo previews. */
export const SAMPLE_PRODUCTS: SampleProduct[] = [
  {
    id: 'demo-1',
    title: 'Premium Wireless Headphones',
    name: 'Premium Wireless Headphones',
    price: 4500,
    priceBDT: 4500,
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=400&q=80',
    category: 'Electronics',
    stock: 25,
    status: 'active',
    is_published: true,
  },
  {
    id: 'demo-2',
    title: 'Organic Cotton T-Shirt',
    name: 'Organic Cotton T-Shirt',
    price: 890,
    priceBDT: 890,
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=400&q=80',
    category: 'Fashion',
    stock: 120,
    status: 'active',
    is_published: true,
  },
  {
    id: 'demo-3',
    title: 'Smart Watch Series 8',
    name: 'Smart Watch Series 8',
    price: 12500,
    priceBDT: 12500,
    image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=400&q=80',
    category: 'Electronics',
    stock: 15,
    status: 'active',
    is_published: true,
  },
  {
    id: 'demo-4',
    title: 'Leather Handbag',
    name: 'Leather Handbag',
    price: 3200,
    priceBDT: 3200,
    image: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=400&q=80',
    category: 'Fashion',
    stock: 40,
    status: 'active',
    is_published: true,
  },
];

/** Sample categories for demo previews. */
export const SAMPLE_CATEGORIES = [
  { id: 'demo-cat-1', name: 'Electronics', title: 'Electronics', status: 'published', productCount: 2 },
  { id: 'demo-cat-2', name: 'Fashion', title: 'Fashion', status: 'published', productCount: 2 },
  { id: 'demo-cat-3', name: 'Home & Living', title: 'Home & Living', status: 'published', productCount: 0 },
];

export default {
  BUILTIN_THEMES,
  LAYOUT_LABELS,
  THEME_THUMBNAIL_PLACEHOLDER,
  resolveLayoutForTheme,
  resolveThemeThumbnail,
  toRegistryEntry,
  mergeThemeCatalog,
  findThemeById,
  SAMPLE_STORE,
  SAMPLE_PRODUCTS,
  SAMPLE_CATEGORIES,
};
