// =============================================================================
// Online Store modules API client.
// -----------------------------------------------------------------------------
// The Brand / Menu / Blog / Pages / SEO / FAQ panels used to keep their data in
// component state only: every edit was lost on reload and nothing ever reached
// the customer storefront. This module is the ONE place the browser reads and
// writes those modules, so the dashboard and the storefront agree.
//
// Contract (mirrors src/lib/storeApi.ts):
//   • every helper resolves against a real /api/ route,
//   • a failed request returns the supplied fallback instead of throwing,
//   • the server is the source of truth — the caller never has to reconcile.
// =============================================================================

import { safeJson, isUsableStoreRef } from './storeApi';

/** A single header/footer navigation link. */
export interface NavLink {
  id: string;
  title: string;
  url: string;
}

/** Brand identity — logo, favicon, accent colour and announcement banner. */
export interface BrandConfig {
  logoUrl: string;
  faviconUrl: string;
  brandColor: string;
  announcementText: string;
  announcementBg: string;
  showAnnouncement: boolean;
  storeName: string;
}

/** Header + footer navigation menus. */
export interface NavigationMenus {
  header: NavLink[];
  footer: NavLink[];
}

/** A merchant-authored content page, reachable at /pages/<slug>. */
export interface CustomPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  status: string;
  seoTitle?: string;
  seoDescription?: string;
}

/** A blog / article post. */
export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  author: string;
  content: string;
  excerpt?: string;
  coverImage?: string;
  date: string;
  status: string;
  views: number;
}

/** A storefront FAQ entry. */
export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

/** SEO metadata injected into the storefront document head. */
export interface SeoConfig {
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  ogImage: string;
}

/** Every module, keyed by the name the server writes it under. */
export interface StorefrontModules {
  brandConfig: BrandConfig;
  navigationMenus: NavigationMenus;
  customPages: CustomPage[];
  blogPosts: BlogPost[];
  faqs: FaqItem[];
  seoConfig: SeoConfig;
}

export const EMPTY_MODULES: StorefrontModules = {
  brandConfig: {
    logoUrl: '',
    faviconUrl: '',
    brandColor: '',
    announcementText: '',
    announcementBg: '',
    showAnnouncement: true,
    storeName: '',
  },
  navigationMenus: { header: [], footer: [] },
  customPages: [],
  blogPosts: [],
  faqs: [],
  seoConfig: { metaTitle: '', metaDescription: '', metaKeywords: '', ogImage: '' },
};

/** REST segment per module, matching the server's STORE_MODULES registry. */
const MODULE_PATHS = {
  brand: 'brand',
  navigation: 'navigation',
  pages: 'pages',
  blog: 'blog',
  faqs: 'faqs',
  seo: 'seo',
} as const;

export type StoreModuleKey = keyof typeof MODULE_PATHS;

/**
 * Persist one module for a store.
 *
 * Returns the server's normalised copy so the caller can adopt it verbatim
 * (rather than keeping its own optimistic version, which is how the dashboard
 * and the storefront drifted apart).
 */
export async function saveStoreModule<T = any>(
  module: StoreModuleKey,
  storeRef: string | null | undefined,
  payload: unknown
): Promise<T | null> {
  if (!isUsableStoreRef(storeRef)) return null;
  const store_slug = String(storeRef).split(':')[0].trim();
  try {
    const res = await fetch(`/api/store/${MODULE_PATHS[module]}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_slug, [module]: payload }),
    });
    const data = await safeJson<Record<string, any>>(res);
    if (!data || data.ok === false) {
      if (data?.error) console.warn(`[storeModulesApi] ${module} save rejected:`, data.error);
      return null;
    }
    // The server echoes the module under its own field name.
    const field = module === 'navigation' ? 'navigationMenus' : module === 'brand' ? 'brandConfig' : module === 'seo' ? 'seoConfig' : module === 'pages' ? 'customPages' : module === 'blog' ? 'blogPosts' : 'faqs';
    return (data[field] ?? null) as T | null;
  } catch (e: any) {
    console.warn(`[storeModulesApi] ${module} save failed:`, e?.message || e);
    return null;
  }
}

/** Load one module for a store. Returns null when unavailable. */
export async function loadStoreModule<T = any>(
  module: StoreModuleKey,
  storeRef: string | null | undefined
): Promise<T | null> {
  if (!isUsableStoreRef(storeRef)) return null;
  const store_slug = String(storeRef).split(':')[0].trim();
  try {
    const res = await fetch(`/api/store/${MODULE_PATHS[module]}?store_slug=${encodeURIComponent(store_slug)}`);
    const data = await safeJson<Record<string, any>>(res);
    if (!data || data.ok === false) return null;
    const field = module === 'navigation' ? 'navigationMenus' : module === 'brand' ? 'brandConfig' : module === 'seo' ? 'seoConfig' : module === 'pages' ? 'customPages' : module === 'blog' ? 'blogPosts' : 'faqs';
    return (data[field] ?? null) as T | null;
  } catch (e: any) {
    console.warn(`[storeModulesApi] ${module} load failed:`, e?.message || e);
    return null;
  }
}

/**
 * Load every storefront module for a store in one pass.
 *
 * Uses the aggregated `/api/storefront/:slug` payload so the storefront needs a
 * single round-trip; falls back to per-module reads when that payload predates
 * the modules (an older deployment), so the page still renders.
 */
export async function loadStorefrontModules(storeRef: string | null | undefined): Promise<StorefrontModules> {
  if (!isUsableStoreRef(storeRef)) return EMPTY_MODULES;
  const store_slug = String(storeRef).split(':')[0].trim();

  try {
    const res = await fetch(`/api/storefront/${encodeURIComponent(store_slug)}`);
    const data = await safeJson<{ storefront?: Record<string, any> }>(res);
    const sf = data?.storefront;
    if (sf && (sf.brandConfig || sf.navigationMenus || sf.customPages || sf.blogPosts || sf.faqs || sf.seoConfig)) {
      return {
        brandConfig: { ...EMPTY_MODULES.brandConfig, ...(sf.brandConfig || {}) },
        navigationMenus: {
          header: Array.isArray(sf.navigationMenus?.header) ? sf.navigationMenus.header : [],
          footer: Array.isArray(sf.navigationMenus?.footer) ? sf.navigationMenus.footer : [],
        },
        customPages: Array.isArray(sf.customPages) ? sf.customPages : [],
        blogPosts: Array.isArray(sf.blogPosts) ? sf.blogPosts : [],
        faqs: Array.isArray(sf.faqs) ? sf.faqs : [],
        seoConfig: { ...EMPTY_MODULES.seoConfig, ...(sf.seoConfig || {}) },
      };
    }
  } catch (e: any) {
    console.warn('[storeModulesApi] aggregated storefront load failed:', e?.message || e);
  }

  // Fallback: independent reads, each tolerant of its own failure.
  const [brandConfig, navigationMenus, customPages, blogPosts, faqs, seoConfig] = await Promise.all([
    loadStoreModule<BrandConfig>('brand', store_slug),
    loadStoreModule<NavigationMenus>('navigation', store_slug),
    loadStoreModule<CustomPage[]>('pages', store_slug),
    loadStoreModule<BlogPost[]>('blog', store_slug),
    loadStoreModule<FaqItem[]>('faqs', store_slug),
    loadStoreModule<SeoConfig>('seo', store_slug),
  ]);

  return {
    brandConfig: { ...EMPTY_MODULES.brandConfig, ...(brandConfig || {}) },
    navigationMenus: {
      header: Array.isArray(navigationMenus?.header) ? navigationMenus!.header : [],
      footer: Array.isArray(navigationMenus?.footer) ? navigationMenus!.footer : [],
    },
    customPages: Array.isArray(customPages) ? customPages : [],
    blogPosts: Array.isArray(blogPosts) ? blogPosts : [],
    faqs: Array.isArray(faqs) ? faqs : [],
    seoConfig: { ...EMPTY_MODULES.seoConfig, ...(seoConfig || {}) },
  };
}

/**
 * Inject the merchant's SEO metadata into the document head.
 *
 * The dashboard runs client-side (Vite SPA), so "SSR meta" is applied by
 * updating the live document — which is what crawlers that execute JS and every
 * social-share preview scraper actually read. Existing tags are reused so
 * repeated navigation never stacks duplicates.
 */
export function applyStoreSeo(seo: Partial<SeoConfig> | null | undefined, storeName?: string) {
  if (typeof document === 'undefined') return;
  const title = (seo?.metaTitle || '').trim() || (storeName ? `${storeName}` : '');
  if (title) document.title = title;

  const setMeta = (attr: 'name' | 'property', key: string, content: string) => {
    if (!content) return;
    let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  setMeta('name', 'description', (seo?.metaDescription || '').trim());
  setMeta('name', 'keywords', (seo?.metaKeywords || '').trim());
  // Open Graph mirrors so shared links preview correctly.
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', (seo?.metaDescription || '').trim());
  setMeta('property', 'og:image', (seo?.ogImage || '').trim());
}

/** Apply the merchant's favicon to the document head. */
export function applyStoreFavicon(faviconUrl: string | null | undefined) {
  if (typeof document === 'undefined') return;
  const href = (faviconUrl || '').trim();
  if (!href) return;
  const el = document.getElementById('app-favicon') as HTMLLinkElement | null;
  if (el) el.href = href;
}