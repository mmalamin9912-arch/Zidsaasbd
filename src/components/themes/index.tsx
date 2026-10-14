/**
 * Theme Component Mapping Directory — dynamic storefront theme switching.
 *
 * Maps a published `activeThemeId` (MongoDB `stores.activeThemeId`) to the
 * ACTUAL layout component the customer storefront must mount, so publishing
 * "Luxury Boutique" (or any paid/premium theme) renders that theme's real
 * layout instead of falling back to the default free template.
 *
 *   activeThemeId ──► layout key ──► <Layout /> renderer
 *
 *   - DefaultModern  → 'classic'     (full luxury storefront)
 *   - TechStorePro   → 'supermarket' (mega-store mockup)
 *   - LuxuryBoutique → 'fashion'     (boutique mockup)
 *
 * Unknown / admin-created theme ids still resolve via the shared registry
 * heuristics (category + name), so a brand-new catalogue entry never renders
 * a blank storefront.
 */
import React from 'react';
import { SupermarketTechMockup, ElegantFashionMockup } from '../ThemeMockups';
import { resolveLayoutForTheme, type ThemeLayoutKey } from '../../lib/themeRegistry';

/** Layout renderer mounted for each component key. */
export type StorefrontThemeComponentKey = 'DefaultModern' | 'LuxuryBoutique' | 'TechStorePro';

/**
 * Complete per-theme style contract: header variant, page background, and
 * which promo sections render. Every field is optional with a safe default so
 * a missing / undefined property can never crash the storefront.
 */
export interface StorefrontThemeStyle {
  /** Light minimalist boutique header vs dark standard header. */
  headerVariant: 'luxury' | 'standard';
  /** Page + shell background tokens. */
  background: string;
  shellBackground: string;
  foreground: string;
  /** Brand wordmark shown when the merchant has no logo (luxury header). */
  brandWordmark: string;
  /** Minimalist category rail under a luxury header. */
  showCategoryRail: boolean;
  /** Top announcement / promo banner strip. */
  showAnnouncementBar: boolean;
  /** Flash-sale countdown timer ("FLASH SALE ENDS IN"). */
  showFlashSale: boolean;
  /** Gallery section. */
  showGallerySection: boolean;
  /** Product collection layout inside the classic shell. */
  collectionLayout: 'trending' | 'standard';
}

/** Full style preset per named theme component. */
export const THEME_STYLE_PRESETS: Record<StorefrontThemeComponentKey, StorefrontThemeStyle> = {
  LuxuryBoutique: {
    headerVariant: 'luxury',
    background: '#F8FAFC',
    shellBackground: '#F8FAFC',
    foreground: '#0F172A',
    brandWordmark: 'AURA',
    showCategoryRail: true,
    showAnnouncementBar: false,
    showFlashSale: false,
    showGallerySection: false,
    collectionLayout: 'trending',
  },
  DefaultModern: {
    headerVariant: 'standard',
    background: '#0F172A',
    shellBackground: '#0F172A',
    foreground: '#F1F5F9',
    brandWordmark: 'STORE',
    showCategoryRail: false,
    showAnnouncementBar: true,
    showFlashSale: true,
    showGallerySection: true,
    collectionLayout: 'standard',
  },
  TechStorePro: {
    headerVariant: 'standard',
    background: '#0F172A',
    shellBackground: '#0F172A',
    foreground: '#F1F5F9',
    brandWordmark: 'STORE',
    showCategoryRail: false,
    showAnnouncementBar: true,
    showFlashSale: true,
    showGallerySection: true,
    collectionLayout: 'standard',
  },
};

/** Safe fallback when nothing resolves — the standard dark preset. */
export const DEFAULT_THEME_STYLE: StorefrontThemeStyle = THEME_STYLE_PRESETS.DefaultModern;

/**
 * Resolve the full style contract for a published theme reference.
 * Never throws and never returns undefined fields.
 */
export function resolveThemeStyle(
  ref?: { id?: string | null; name?: string | null; category?: string | null; layout?: ThemeLayoutKey | string | null } | string | null
): StorefrontThemeStyle {
  try {
    return THEME_STYLE_PRESETS[resolveThemeComponentKey(ref)] || DEFAULT_THEME_STYLE;
  } catch {
    return DEFAULT_THEME_STYLE;
  }
}

/** Which layout each named component renders. */
export const THEME_COMPONENT_LAYOUTS: Record<StorefrontThemeComponentKey, ThemeLayoutKey> = {
  DefaultModern: 'classic',
  TechStorePro: 'supermarket',
  LuxuryBoutique: 'fashion',
};

/**
 * Alias → layout map for published theme ids/slugs/names.
 *
 * The merchant catalogue stores arbitrary ids (e.g. a Mongo ObjectId or
 * `theme-3`) whose human name is "Luxury Boutique". Matching is therefore done
 * against the id AND the name/category, normalised (lower-case, non-alnum
 * stripped), so every spelling resolves to the right component.
 */
const ALIAS_TO_LAYOUT: Array<{ match: RegExp; layout: ThemeLayoutKey }> = [
  { match: /luxuryboutique|luxurybouquet|boutique|luxury|elegantfashion|fashion/, layout: 'fashion' },
  { match: /techstorepro|techstore|supermarkettech|supermarket|megastore|megamart|tech/, layout: 'supermarket' },
  { match: /defaultmodern|growth|classic|modern/, layout: 'classic' },
];

function normaliseRef(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolve a published theme reference to its layout key.
 * Accepts an id alone, or preferably the full { id, name, category, layout }
 * snapshot so admin-created themes with opaque ids still map correctly.
 */
export function resolveThemeComponentLayout(ref?: {
  id?: string | null;
  name?: string | null;
  category?: string | null;
  layout?: ThemeLayoutKey | string | null;
} | string | null): ThemeLayoutKey {
  if (!ref) return 'classic';
  const entry = typeof ref === 'string' ? { id: ref } : ref;
  const explicit = String(entry.layout || '').toLowerCase().trim() as ThemeLayoutKey;
  if (explicit === 'classic' || explicit === 'supermarket' || explicit === 'fashion') return explicit;
  const haystack = normaliseRef(
    `${(entry as any).id || ''} ${(entry as any).name || ''} ${(entry as any).category || ''}`
  );
  for (const { match, layout } of ALIAS_TO_LAYOUT) {
    if (match.test(haystack)) return layout;
  }
  return resolveLayoutForTheme({
    id: (entry as any).id || '',
    name: (entry as any).name || '',
    category: (entry as any).category || '',
  });
}

/**
 * Resolve a published theme reference to its NAMED component key
 * (DefaultModern / LuxuryBoutique / TechStorePro).
 */
export function resolveThemeComponentKey(
  ref?: { id?: string | null; name?: string | null; category?: string | null; layout?: ThemeLayoutKey | string | null } | string | null
): StorefrontThemeComponentKey {
  const layout = resolveThemeComponentLayout(ref);
  if (layout === 'fashion') return 'LuxuryBoutique';
  if (layout === 'supermarket') return 'TechStorePro';
  return 'DefaultModern';
}

/** Default (free) template — classic luxury storefront shell for this mapping dir. */
export const DefaultModern: React.FC<{ accentColor?: string; storeName?: string }> = ({ accentColor, storeName }) => (
  <div
    data-theme-component="DefaultModern"
    data-layout="classic"
    style={{ ['--primary-accent' as string]: accentColor || '#00D68F' } as React.CSSProperties}
  >
    <div className="max-w-7xl mx-auto px-4 py-10 text-center">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">DefaultModern · Classic Luxury</p>
      <h2 className="mt-2 text-2xl font-black text-slate-900">{storeName || 'Storefront'}</h2>
    </div>
  </div>
);

/** Premium boutique layout — the ACTUAL LuxuryBoutique component. */
export const LuxuryBoutique: React.FC<{ accentColor?: string }> = ({ accentColor }) => (
  <div data-theme-component="LuxuryBoutique" data-layout="fashion">
    <ElegantFashionMockup accentColor={accentColor} />
  </div>
);

/** Premium mega-store layout — the ACTUAL TechStorePro component. */
export const TechStorePro: React.FC<{ accentColor?: string }> = ({ accentColor }) => (
  <div data-theme-component="TechStorePro" data-layout="supermarket">
    <SupermarketTechMockup accentColor={accentColor} />
  </div>
);

/** Named component directory used by the dynamic renderer. */
export const THEME_COMPONENTS = {
  DefaultModern,
  LuxuryBoutique,
  TechStorePro,
} as const;

export default THEME_COMPONENTS;
