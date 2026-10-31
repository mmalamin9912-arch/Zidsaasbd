/**
 * MEGA MARKETPLACE — the platform's own storefront theme.
 *
 * WHY THIS IS A SEPARATE COMPONENT
 * ---------------------------------------------------------------------------
 * `/store/marketplace` used to resolve to `TenantStorefrontView` with the slug
 * "marketplace", so the platform's front door looked like a single merchant's
 * shop — one vendor's theme, one vendor's palette, one vendor's cart. The
 * marketplace is a DIFFERENT THING: a multi-vendor bazaar with its own brand.
 *
 * This view is therefore deliberately styled as a category-defining storefront
 * (Amazon / Daraz / Noon family) rather than a tenant theme:
 *
 *   • Mega-header   — search first, category rail, seller + basket shortcuts
 *   • Hero carousel — auto-rotating platform promotions
 *   • 4-6 column grid with a persistent, faceted filter rail
 *   • Cards that always name the seller ("Sold by: …") and the category
 *
 * It shares NO theme tokens with the tenant storefronts: the palette below is
 * the marketplace's own, so a merchant editing their theme can never restyle
 * the platform's front door.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, ShoppingBasket, Store, User, ChevronDown, ChevronLeft, ChevronRight,
  SlidersHorizontal, X, Star, Truck, ShieldCheck, BadgePercent, Loader2,
  MapPin, TruckIcon, HeadphonesIcon, RotateCcw, Check, Plus, Minus,
  LayoutGrid, Flame, Sparkles, ArrowRight, Menu, ArrowUpDown, LogOut,
  Heart, Receipt, Globe, TrendingUp, Clock, Smartphone, Watch, Gamepad2,
  Sun, Moon,
} from 'lucide-react';
import SafeImage from './SafeImage';
import MarketplaceSeoFooter from './MarketplaceSeoFooter';
import { useToast } from './ToastProvider';
import {
  fetchMarketplaceProducts,
  type MarketplaceResponse,
  type MarketplaceFilters,
  type MarketplaceFacetVendor,
} from '../lib/marketplaceApi';
import {
  fetchMarketplaceStorefront,
  fetchFeaturedProducts,
  toMarketplaceProduct,
  type MarketplaceBanner,
  type MarketplaceCategoryRow,
  type UtilityStripConfig,
  type FeaturedConfig,
} from '../lib/marketplaceStorefrontApi';
import { fetchTaxonomy, type TaxonomyTree } from '../lib/categoryTaxonomyApi';
import { useMarketplaceBasket } from '../lib/useMarketplaceBasket';
import { useMarketplaceWishlist } from '../lib/useMarketplaceWishlist';
import {
  detectLocation,
  getInitialLocation,
  saveManualLocation,
} from '../lib/locationDetection';
import {
  marketplaceCopy,
  productTitle,
  categoryName,
  stripText,
} from '../lib/banglaCatalog';

import type { MarketplaceProduct } from '../types';

/* ─────────────────────────── dark mode hook ─────────────────────────────
   Reads/writes `zid_marketplace_dark` in localStorage and toggles the
   `dark` class on `<html>` so Tailwind's `dark:` utilities activate.     */
const DARK_KEY = 'zid_marketplace_dark';

function useDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(DARK_KEY);
      if (stored !== null) return stored === '1';
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try { localStorage.setItem(DARK_KEY, dark ? '1' : '0'); } catch { /* private mode */ }
  }, [dark]);

  const toggle = useCallback(() => setDark((v) => !v), []);
  return [dark, toggle];
}

/* ─────────────────────────── platform palette ───────────────────────────
   The marketplace's OWN identity. Keyed off `mm-*` CSS variables so the rest
   of the app's Tailwind tokens cannot bleed in and no tenant theme can
   override it. Deep indigo + amber is distinct from every tenant template
   (which are gold/slate, emerald, or white-minimal).

   LIGHT and DARK variants are defined here so every inline `style={{ }}` that
   needs a token can pick the right shade by simply using the `dark` boolean.  */
/* Explicit string-valued shape, NOT `typeof LIGHT_THEME`: the `as const` on the
   literal would pin every token to its light-mode value, so DARK_THEME (and any
   future theme) would fail to type-check. */
type ThemeTokens = { [K in keyof typeof LIGHT_THEME]: string };
const LIGHT_THEME = {
  bg: '#f3f4fb',
  bgMesh: 'radial-gradient(ellipse at 20% 10%, rgba(59,47,214,0.07) 0%, transparent 55%), radial-gradient(ellipse at 80% 90%, rgba(139,92,246,0.07) 0%, transparent 55%), radial-gradient(ellipse at 60% 40%, rgba(255,159,28,0.05) 0%, transparent 45%), #f3f4fb',
  surface: '#ffffff',
  surfaceHover: '#f8f8ff',
  ink: '#111827',
  inkMuted: '#6b7280',
  inkSubtle: '#9ca3af',
  line: '#e5e7eb',
  lineSubtle: '#f3f4f6',
  brand: '#3b2fd6',
  brandDark: '#2a219d',
  brandSoft: '#eef0ff',
  accent: '#ff9f1c',
  accentSoft: '#fff4e0',
  success: '#0f9d58',
  danger: '#e11d48',
  skeleton: '#e5e7eb',
  /* Interaction tints.
     Everything below used to be hard-coded utility classes
     (`hover:bg-[#f4f5ff]`, `bg-white`, `text-slate-900`, …) which stayed white
     and black in dark mode. Inline styles driven by these tokens are what make
     the whole page — header, cards, rail, drawers, menus — follow the theme. */
  hover: '#f4f5ff',
  /** Neutral chip / pill background (category rail, filter buttons). */
  chip: '#f4f5ff',
  /** Brand-tinted chip (active sub-category, wishlist count). */
  brandTint: '#eef0ff',
  /** Dashed "sold by" border on a product card. */
  cardBorder: '#d9dcf5',
  /** Soft neutral block — image wells, empty-thumb backgrounds. */
  well: '#f8fafc',
  /** Dropdown / drawer shadow. */
  shadow: '0 18px 40px -12px rgba(17,24,39,0.28)',
  /** Elevated panel shadow for cards on hover. */
  shadowCard: '0 12px 28px -10px rgba(17,24,39,0.25)',
  overlay: 'rgba(15,23,42,0.55)',
  warningFg: '#92400e',
} as const;

const DARK_THEME: ThemeTokens = {
  bg: '#0d0f1a',
  bgMesh: 'radial-gradient(ellipse at 20% 10%, rgba(91,75,255,0.18) 0%, transparent 55%), radial-gradient(ellipse at 80% 90%, rgba(139,92,246,0.15) 0%, transparent 55%), radial-gradient(ellipse at 60% 40%, rgba(255,159,28,0.07) 0%, transparent 45%), #0d0f1a',
  surface: '#161829',
  surfaceHover: '#1e2035',
  ink: '#e8eaf5',
  inkMuted: '#9fa3c0',
  inkSubtle: '#6b7098',
  line: '#252840',
  lineSubtle: '#1a1d30',
  brand: '#6d63ff',
  brandDark: '#5b4bff',
  brandSoft: '#1e1f3a',
  accent: '#ffb84d',
  accentSoft: '#2a1f0a',
  success: '#34d470',
  danger: '#f05070',
  skeleton: '#252840',
  hover: '#20233a',
  chip: '#1c1f33',
  brandTint: '#23244a',
  cardBorder: '#2b2f4c',
  well: '#12141f',
  shadow: '0 18px 40px -12px rgba(0,0,0,0.75)',
  shadowCard: '0 12px 28px -10px rgba(0,0,0,0.7)',
  overlay: 'rgba(3,5,12,0.72)',
  warningFg: '#fbbf24',
} as const;

/* Module-level alias used by sub-components that don't receive the dark flag.
   The main component overrides this with its runtime `THEME` derived from dark. */
const THEME = LIGHT_THEME;

/**
 * THE DARK / LIGHT SWITCH.
 *
 * A pill with a sliding knob, not a bare icon button: the knob's POSITION is
 * the state (`aria-checked` mirrors it for assistive tech), so a shopper can
 * read the current mode at a glance without decoding an icon. The sun sits on
 * the light side, the moon on the dark side, and the active one gains contrast.
 *
 * Used twice — compact in the mobile bar, labelled in the desktop header — so
 * the whole appearance is driven by tokens rather than by per-placement CSS.
 */
const ThemeSwitch: React.FC<{
  isDark: boolean;
  onToggle: () => void;
  theme: ThemeTokens;
  /** `sm` for the icon-only mobile bar. */
  size?: 'sm' | 'md';
  label: string;
}> = ({ isDark, onToggle, theme, size = 'md', label }) => {
  const compact = size === 'sm';
  const width = compact ? 52 : 60;
  const height = compact ? 28 : 32;
  const knob = compact ? 22 : 26;
  const pad = (height - knob) / 2;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className="relative shrink-0 rounded-full border transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
      style={{
        width,
        height,
        borderColor: theme.line,
        backgroundColor: theme.chip,
        // Ring colour has to come from the palette too: a hard-coded Tailwind
        // ring would be invisible on the dark surface.
        ['--tw-ring-color' as any]: theme.brand,
      }}
    >
      {/* Track icons — both always rendered so the switch reads as a choice.
          Each sits on the side the knob slides AWAY from; the knob covers the
          other. That is why the icons fade: an icon under a 26px knob shows as a
          coloured smudge around its edge otherwise. */}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-between px-[7px]">
        <Sun
          className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}
          style={{
            color: theme.accent,
            opacity: isDark ? 0.55 : 0,
            transition: 'opacity .2s ease',
          }}
        />
        <Moon
          className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}
          style={{
            color: theme.brand,
            opacity: isDark ? 0 : 0.55,
            transition: 'opacity .2s ease',
          }}
        />
      </span>
      {/* Sliding knob */}
      <span
        aria-hidden="true"
        className="absolute top-1/2 flex items-center justify-center rounded-full shadow-md transition-transform duration-300 ease-out"
        style={{
          width: knob,
          height: knob,
          backgroundColor: isDark ? theme.brand : theme.surface,
          border: `1px solid ${isDark ? theme.brand : theme.line}`,
          transform: `translate(${isDark ? width - knob - pad * 2 : 0}px, -50%)`,
          left: pad,
        }}
      >
        {isDark
          ? <Moon className="h-3 w-3 text-white" />
          : <Sun className="h-3 w-3" style={{ color: theme.accent }} />}
      </span>
    </button>
  );
};

const bdt = (value: number) => `৳${Math.round(Number(value) || 0).toLocaleString('en-US')}`;

/**
 * Delivery destinations offered by the header's location selector.
 *
 * A short, high-traffic list rather than all 64 districts: the selector's job is
 * to make the delivery promise concrete and to feel local, and a 64-item menu
 * in a header dropdown is unusable. The full set is reachable at checkout.
 */
const DISTRICT_PRESETS = [
  'Dhaka', 'Chattogram', 'Sylhet', 'Khulna', 'Rajshahi',
  'Barishal', 'Rangpur', 'Mymensingh', 'Cumilla', 'Narayanganj',
] as const;

/**
 * Search placeholders that rotate with the catalogue stop.
 *
 * A static "Search every store…" teaches a first-time shopper nothing about
 * what is actually for sale. Rotating real category names doubles as discovery.
 */
const SEARCH_PLACEHOLDERS = [
  'Search sarees, panjabi, phones, gadgets…',
  'Search across 1,000+ verified stores…',
  'Try “jamdani”, “smart watch”, “rice”…',
  'Search every store — one basket, delivered nationwide…',
] as const;

/**
 * "Trending searches" shown in the search dropdown.
 *
 * A deliberate, hand-picked list rather than a live query log: it has to be
 * useful on a brand-new marketplace with no traffic yet, and it doubles as a
 * merchandising surface. Each entry keeps its own icon so the pills read as a
 * scannable row of categories instead of a wall of text.
 */
const TRENDING_SEARCHES: {
  label: string;
  /** Bangla label shown to a Bangla reader; `label` stays the query term. */
  labelBn: string;
  icon?: React.ComponentType<{ className?: string }>;
}[] = [
  { label: 'mobile phone', labelBn: 'মোবাইল ফোন', icon: Smartphone },
  { label: 'smart watch', labelBn: 'স্মার্ট ওয়াচ', icon: Watch },
  { label: 'headphones', labelBn: 'হেডফোন', icon: HeadphonesIcon },
  { label: 'gaming', labelBn: 'গেমিং', icon: Gamepad2 },
  { label: 'saree', labelBn: 'শাড়ি' },
  { label: 'panjabi', labelBn: 'পাঞ্জাবি' },
  { label: 'laptop', labelBn: 'ল্যাপটপ' },
  { label: 'sneakers', labelBn: 'স্নিকার্স' },
];

/** Recently typed queries — the shopper's own history, newest first. */
const RECENT_SEARCHES_KEY = 'zid_marketplace_recent_searches';
const MAX_RECENT_SEARCHES = 6;

function readRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

function writeRecentSearches(list: string[]): void {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } catch {
    /* private mode — history is simply not persisted */
  }
}

/**
 * Display name for a category.
 *
 * Category names are stored lower-case ("fashion", "electronics") because the
 * taxonomy uses them as a case-insensitive join key against product rows. That
 * is right for matching and wrong for display: a tile reading "fashion" next to
 * "Sports" looks like a data-entry slip. This title-cases ONLY the rendering;
 * the underlying value — and every filter, facet and product tag — is untouched.
 */
function displayCategory(name: string, lang: 'en' | 'bn' = 'en'): string {
  const raw = String(name || '').trim();
  if (!raw) return raw;
  // Bangla renders through the curated glossary (or the seller's own Bangla
  // name when one was supplied); the title-casing below is English-only.
  if (lang === 'bn') return categoryName(raw, 'bn');
  // Words that stay lower-case in title case (English convention).
  const MINOR = new Set(['and', 'or', 'the', 'of', 'for', 'a', 'an', 'to', 'in', 'on', 'with']);
  return raw
    .split(/\s+/)
    .map((word, i) => {
      // Leave already-upper-case acronyms alone ("SME", "TV").
      if (word.length > 1 && word === word.toUpperCase()) return word;
      // Leave mixed-case words alone ("iPhone", "McDonald") — the admin chose them.
      if (word !== word.toLowerCase() && word !== word.toUpperCase()) return word;
      const lower = word.toLowerCase();
      if (i > 0 && MINOR.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * True on touch-only devices, where `hover` never fires.
 *
 * The rail uses it to decide the FIRST tap's meaning: on a phone a tap should
 * open the category's panel; with a mouse it should apply the filter directly
 * (the panel is already open from hover).
 */
function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(hover: none)').matches ?? false;
}

/** Icon name → component, for the admin-authored utility strip items. */
const STRIP_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  MapPin,
  Truck,
  RotateCcw,
  ShieldCheck,
  BadgePercent,
  Store,
  Flame,
};

/* ───────────────────────────── hero banners ───────────────────────────── */

export interface HeroSlide {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  /**
   * Bangla variants. Admin-authored banners leave these empty and keep the
   * admin's own wording; only the built-in preset slides carry a translation.
   */
  eyebrowBn?: string;
  titleBn?: string;
  subtitleBn?: string;
  ctaBn?: string;
  /** Tailwind gradient classes for the slide background. */
  gradient: string;
  /** Optional image; the gradient carries the slide when absent. */
  image?: string;
  /** Category (or search term) the CTA opens. */
  category?: string;
  /** Free-form search the CTA runs (used when no category is set). */
  search?: string;
  accentText?: string;
}

/** Map an admin-authored banner onto the carousel's slide shape. */
function bannerToSlide(banner: MarketplaceBanner): HeroSlide {
  return {
    id: banner.id,
    eyebrow: banner.eyebrow || '',
    title: banner.title || '',
    subtitle: banner.subtitle || '',
    cta: banner.cta || 'Shop now',
    gradient: banner.gradient || 'from-[#3b2fd6] via-[#5b4bff] to-[#8b5cf6]',
    image: banner.image,
    category: banner.category,
    search: banner.search,
    accentText: banner.accentText,
  };
}

const DEFAULT_SLIDES: HeroSlide[] = [
  {
    id: 'mega-sale',
    eyebrow: 'MEGA MARKETPLACE SALE',
    eyebrowBn: 'মেগা মার্কেটপ্লেস সেল',
    title: 'Up to 60% off across 1,000+ stores',
    titleBn: '১,০০০+ স্টোরে ৬০% পর্যন্ত ছাড়',
    subtitle: 'One basket, many sellers — delivered nationwide with cash on delivery.',
    subtitleBn: 'এক কার্টে অনেক সেলার — সারা দেশে ক্যাশ অন ডেলিভারি।',
    cta: 'Shop the sale',
    ctaBn: 'সেল দেখুন',
    gradient: 'from-[#3b2fd6] via-[#5b4bff] to-[#8b5cf6]',
    accentText: 'text-amber-300',
  },
  {
    id: 'fashion',
    eyebrow: 'FASHION & LIFESTYLE',
    eyebrowBn: 'ফ্যাশন ও লাইফস্টাইল',
    title: 'Jamdani, muslin & silk sarees',
    titleBn: 'জামদানি, মসলিন ও সিল্ক শাড়ি',
    subtitle: 'Hand-picked collections from Bangladesh’s finest weavers.',
    subtitleBn: 'বাংলাদেশের সেরা তাঁতিদের বাছাই করা কালেকশন।',
    cta: 'Explore fashion',
    ctaBn: 'ফ্যাশন দেখুন',
    gradient: 'from-[#7c2d12] via-[#b45309] to-[#f59e0b]',
    category: 'fashion',
    accentText: 'text-amber-100',
  },
  {
    id: 'electronics',
    eyebrow: 'GADGETS & TECH',
    eyebrowBn: 'গ্যাজেট ও প্রযুক্তি',
    title: 'New arrivals in electronics',
    titleBn: 'ইলেকট্রনিক্সে নতুন পণ্য',
    subtitle: 'Verified sellers, genuine warranty, easy returns within 7 days.',
    subtitleBn: 'যাচাইকৃত সেলার, আসল ওয়ারেন্টি, ৭ দিনে সহজ রিটার্ন।',
    cta: 'Browse electronics',
    ctaBn: 'ইলেকট্রনিক্স দেখুন',
    gradient: 'from-[#0f172a] via-[#1e293b] to-[#0ea5e9]',
    category: 'electronics',
    accentText: 'text-sky-300',
  },
  {
    id: 'free-delivery',
    eyebrow: 'PLATFORM OFFER',
    eyebrowBn: 'প্ল্যাটফর্ম অফার',
    title: 'Free delivery over ৳2,000',
    titleBn: '৳২,০০০-এর বেশি অর্ডারে ফ্রি ডেলিভারি',
    subtitle: 'Across every seller in the marketplace — no coupon required.',
    subtitleBn: 'মার্কেটপ্লেসের প্রতিটি সেলারে — কোনো কুপন লাগবে না।',
    cta: 'Start shopping',
    ctaBn: 'কেনাকাটা শুরু করুন',
    gradient: 'from-[#064e3b] via-[#047857] to-[#10b981]',
    accentText: 'text-emerald-200',
  },
];

/* ─────────────────────────── small primitives ─────────────────────────── */

/** Star rating row. Renders "New" when the product has no reviews yet. */
const RatingStars: React.FC<{ rating: number; count: number }> = ({ rating, count }) => {
  if (!rating) {
    return <span className="text-[11px] font-semibold text-slate-400">New arrival</span>;
  }
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`w-3 h-3 ${i <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
          />
        ))}
      </div>
      <span className="text-[11px] font-semibold text-slate-500">
        {rating.toFixed(1)}
        {count > 0 ? ` (${count})` : ''}
      </span>
    </div>
  );
};

/**
 * ONE PRODUCT CARD.
 *
 * Deliberately information-dense — the marketplace is a comparison surface, so
 * the card must answer "what, how much, how good, who sells it" at a glance.
 * The "Sold by" row is NOT optional: it is the whole point of a multi-vendor
 * listing, and it links straight to that vendor's own storefront.
 */
const ProductCard: React.FC<{
  product: MarketplaceProduct;
  onAdd: (product: MarketplaceProduct) => void;
  onVisitVendor: (slug: string) => void;
  onOpenProduct: (product: MarketplaceProduct) => void;
  /** True when this product is already saved to the shopper's wishlist. */
  isWishlisted?: boolean;
  onToggleWishlist?: (product: MarketplaceProduct) => void;
  /** Active marketplace language — switches titles and card states to Bangla. */
  lang?: 'en' | 'bn';
  /** Runtime palette — light or dark. */
  theme?: ThemeTokens;
}> = ({ product, onAdd, onVisitVendor, onOpenProduct, isWishlisted, onToggleWishlist, lang: langProp, theme }) => {
  const THEME = theme || LIGHT_THEME;
  // Explicit literal type: a bare `lang = 'en'` default infers `string`, which
  // then fails to match the `'en' | 'bn'` parameters below.
  const lang: 'en' | 'bn' = langProp === 'bn' ? 'bn' : 'en';
  const p = product as any;
  const image = p.image || p.image_url || p.imageUrl || p.thumbnail;
  // The seller's Bangla title when the shopper reads Bangla, English otherwise.
  const title = productTitle(p, lang);
  // A secondary line shows the OTHER language, so a bilingual listing reads as
  // deliberately bilingual instead of leaving one audience in the dark.
  const altTitle = lang === 'bn'
    ? (p.title && p.title !== title ? String(p.title) : '')
    : '';
  const t = (key: string, vars?: Record<string, string | number>) => marketplaceCopy(key, lang, vars);
  const compareAt = Number(p.compare_at_price || 0);
  const discount = Number(p.discount_percent || 0);
  const stockStatus = String(p.stock_status || 'in_stock');
  const tags: string[] = Array.isArray(p.category_tags) && p.category_tags.length
    ? p.category_tags
    : [p.category].filter(Boolean);
  const soldOut = stockStatus === 'out_of_stock';
  const isDarkCard = (theme || LIGHT_THEME).bg !== LIGHT_THEME.bg;

  return (
    <article
      // MOBILE-FIRST CARD.
      //
      // Two cards share a 390px phone, so every element here is sized to a
      // ~170px column: a compact 14px title, a single-line price row and a
      // vendor badge that TRUNCATES rather than pushing the card wider. The
      // `min-w-0` on flex children is what actually stops long vendor names
      // and prices from overflowing — without it a flex item refuses to shrink
      // below its content width and the layout breaks horizontally.
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border transition-all duration-200 sm:hover:-translate-y-0.5"
      style={{
        borderColor: THEME.line,
        backgroundColor: THEME.surface,
        ['--mm-card-shadow' as any]: THEME.shadowCard,
      }}
    >
      {/* Media */}
      <button
        type="button"
        onClick={() => onOpenProduct(product)}
        className="relative block aspect-square w-full overflow-hidden"
        style={{ backgroundColor: THEME.well }}
        aria-label={t('view_product', { name: title })}
      >
        <SafeImage
          src={image}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />
        {discount > 0 && (
          <span
            className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-black tracking-wide text-white shadow-sm"
            style={{ backgroundColor: THEME.danger }}
          >
            -{discount}%
          </span>
        )}
        {soldOut && (
          <span className="absolute inset-0 flex items-center justify-center bg-slate-900/55 text-xs font-black uppercase tracking-widest text-white">
            {t('sold_out')}
          </span>
        )}
        {!soldOut && stockStatus === 'low_stock' && (
          // Amber-on-amber vanishes in dark mode, so the badge is driven by the
          // palette rather than by two fixed utilities.
          <span
            className="absolute bottom-2 left-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
            style={{
              backgroundColor: isDarkCard ? 'rgba(251,191,36,0.18)' : '#fef3c7',
              color: isDarkCard ? '#fcd34d' : '#b45309',
            }}
          >
            {t('only_left', { n: Number(p.stock_quantity || 0) })}
          </span>
        )}
      </button>

      {/* WISHLIST TOGGLE — a sibling of the media button, not a child: a button
          nested inside a button is invalid HTML and swallows the click. */}
      {onToggleWishlist && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleWishlist(product); }}
          aria-pressed={Boolean(isWishlisted)}
          aria-label={isWishlisted ? t('remove_from_wishlist', { name: title }) : t('save_to_wishlist', { name: title })}
          className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full shadow-sm ring-1 ring-black/5 transition hover:scale-105"
          style={{ backgroundColor: THEME.surface, color: THEME.inkMuted }}
        >
          <Heart
            className={`h-4 w-4 transition-colors ${isWishlisted ? 'fill-[#e11d48] text-[#e11d48]' : ''}`}
            style={isWishlisted ? undefined : { color: THEME.inkMuted }}
          />
        </button>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2 sm:p-3">
        {/* Dynamic category tags — ONE line on mobile so the card height stays
            even across a 2-up grid. */}
        <div className="flex min-w-0 flex-wrap items-center gap-1 overflow-hidden">
          {tags.slice(0, 1).map((tag) => (
            <span
              key={tag}
              className="max-w-full truncate rounded px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide sm:text-[10px]"
              style={{ backgroundColor: THEME.brandTint, color: THEME.brand }}
            >
              {tag}
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onOpenProduct(product)}
          // `break-words` guarantees a long unspaced title (a model number, a
          // URL-ish SKU) wraps instead of forcing the grid column wider.
          // `min-h-[44px]` keeps the tap target legal even for a one-line title
          // (it measured 33px for short names).
          className="flex min-h-[44px] items-start break-words text-left text-[12px] font-semibold leading-snug sm:min-h-0 sm:text-[13px]"
          style={{ color: THEME.ink }}
        >
          <span className="line-clamp-2 min-w-0">{title}</span>
        </button>
        {altTitle && (
          <div className="mt-0.5 truncate text-[10.5px] font-medium" style={{ color: THEME.inkSubtle }} lang="en">
            {altTitle}
          </div>
        )}

        <RatingStars rating={Number(p.rating || 0)} count={Number(p.review_count || 0)} />

        {/* Price — the compare-at price drops to its own line on the narrowest
            screens so `৳42,999 ৳46,999` can never clip. */}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0">
          <span className="text-[14px] font-black leading-none sm:text-[15px]" style={{ color: THEME.ink }}>
            {bdt(Number(product.priceBDT || 0))}
          </span>
          {compareAt > Number(product.priceBDT || 0) && (
            <span className="text-[10px] line-through sm:text-[11px]" style={{ color: THEME.inkSubtle }}>{bdt(compareAt)}</span>
          )}
        </div>

        {/* SOLD BY — the multi-vendor badge.
            On mobile the prefix is abbreviated to "Sold by" on one line with
            the store name truncated, because "Sold by: Very Long Store Name"
            in a 170px column used to wrap to three lines and shove the CTA
            off the card. `min-w-0` + `truncate` is what makes that safe. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (product.vendor_slug) onVisitVendor(product.vendor_slug);
          }}
          // 44px minimum touch height on mobile, compact from `sm` up.
          className="mt-auto flex min-h-[44px] w-full min-w-0 items-center gap-1 rounded-md border border-dashed px-1.5 py-1 text-left transition-colors hover:opacity-80 sm:min-h-0 sm:gap-1.5 sm:px-2"
          style={{ borderColor: THEME.cardBorder }}
          title={`Sold by ${product.vendor_name} — visit store`}
          aria-label={`Sold by ${product.vendor_name}. Visit store.`}
        >
          <Store className="h-3 w-3 shrink-0" style={{ color: THEME.brand }} />
          {/* One label, not two. `inline sm:hidden` + `hidden sm:inline` are
              used with explicit `display` utilities so exactly ONE variant is
              ever in the accessibility tree — previously both spans rendered
              and the badge read "Sold by: by dhaka-weaves". */}
          <span className="min-w-0 flex-1 truncate text-[9.5px] leading-tight sm:text-[10.5px]" style={{ color: THEME.inkMuted }}>
            {/* Rendered via a media-query'd ::before rather than two spans:
                Tailwind's `hidden`/`inline` are ordered so the later wins, and
                having two sibling spans emitted BOTH labels. One text node
                with a single prefix cannot double up. */}
            <span className="vendor-prefix font-bold" style={{ color: THEME.ink }}>{product.vendor_name}</span>
          </span>
          {p.vendor_verified && <ShieldCheck className="hidden h-3 w-3 shrink-0 text-emerald-500 sm:block" />}
        </button>

        <button
          type="button"
          onClick={() => onAdd(product)}
          disabled={soldOut}
          // 44px tall on mobile — a comfortable one-thumb target.
          className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg px-2 text-[11.5px] font-bold text-white transition-colors active:opacity-85 disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-[38px] sm:px-3 sm:text-[12px]"
          style={{ backgroundColor: THEME.brand }}
        >
          <ShoppingBasket className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{soldOut ? t('sold_out') : t('add_to_cart')}</span>
        </button>
      </div>
    </article>
  );
};

/* ──────────────────────────── hero carousel ───────────────────────────── */

const HeroCarousel: React.FC<{
  slides: HeroSlide[];
  lang?: 'en' | 'bn';
  onCta: (slide: HeroSlide) => void;
}> = ({ slides, onCta, lang: heroLang }) => {
  const lang: 'en' | 'bn' = heroLang === 'bn' ? 'bn' : 'en';
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (slides.length <= 1 || paused) return;
    timerRef.current = window.setInterval(
      () => setIndex((i) => (i + 1) % slides.length),
      6000,
    );
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [slides.length, paused]);

  if (slides.length === 0) return null;
  const slide = slides[index] ?? slides[0];
  /*
   * Bangla copy wins when the slide has it.
   *
   * PRESET slides carry `*Bn`. Admin-authored banners do not and their wording
   * is DATA — the admin wrote it in the language they chose, so it is shown
   * verbatim rather than machine-translated. This is the same policy as the
   * utility strip: translate what the platform ships, never rewrite what a
   * person typed.
   */
  const bn = lang === 'bn';
  const eyebrow = (bn && slide.eyebrowBn) || slide.eyebrow;
  const title = (bn && slide.titleBn) || slide.title;
  const subtitle = (bn && slide.subtitleBn) || slide.subtitle;
  const ctaText = (bn && slide.ctaBn) || slide.cta;

  return (
    <section
      aria-label="Platform promotions"
      // A single rounded surface for the whole component: the slide, the arrows
      // and the dots all sit inside this radius, so nothing overflows a corner.
      className="relative overflow-hidden rounded-2xl shadow-[0_10px_34px_-18px_rgba(17,24,39,0.42)] ring-1 ring-black/[0.04] sm:rounded-3xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        key={slide.id}
        // `overflow-hidden` + `min-w-0` matter on mobile: without them the
        // absolutely-positioned decorative rings and the 576px `max-w-xl` text
        // block widened the PAGE to 660px on a 390px phone, which in turn made
        // the 2-column grid render at 313px per card and forced the whole
        // marketplace into a horizontal scroll.
        className={`relative flex min-h-[190px] min-w-0 items-center overflow-hidden bg-gradient-to-r ${slide.gradient} px-2 py-6 transition-all duration-500 sm:min-h-[260px] sm:px-10 sm:py-8 lg:px-14`}
      >
        {/* Soft decorative rings — clipped by the overflow above */}
        <div className="pointer-events-none absolute -right-16 -top-20 hidden h-64 w-64 rounded-full bg-white/10 blur-2xl sm:block" />
        <div className="pointer-events-none absolute -bottom-24 right-24 hidden h-56 w-56 rounded-full bg-white/10 blur-2xl sm:block" />

        {/* Horizontal padding keeps the copy clear of the 44px nav arrows that
            sit over the slide on narrow phones. */}
        {/* Uploaded hero image — rendered UNDER the copy with a dark scrim so
            the headline keeps its contrast on photography. */}
        {slide.image && (
          <>
            <SafeImage
              src={slide.image}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-slate-900/55 to-slate-900/25" />
          </>
        )}

        <div className="relative z-10 min-w-0 max-w-xl px-10 sm:px-0">
          <span className={`text-[10px] font-black uppercase tracking-[0.2em] sm:text-[11px] sm:tracking-[0.28em] ${slide.accentText || 'text-white/80'}`}>
            {eyebrow}
          </span>
          <h2 className="mt-1.5 break-words text-[19px] font-black leading-tight text-white sm:mt-2 sm:text-3xl lg:text-4xl">
            {title}
          </h2>
          <p className="mt-1.5 line-clamp-2 max-w-md text-[12px] text-white/85 sm:mt-2 sm:line-clamp-none sm:text-sm">
            {subtitle}
          </p>
          <button
            type="button"
            onClick={() => onCta(slide)}
            // Amber on near-black text is the highest-contrast pairing available
            // on every gradient in the preset list. A crisp hairline ring keeps
            // the edge defined where the button meets a light slide.
            className="group/cta mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#ff9f1c] px-5 text-[12.5px] font-black text-slate-900 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.5)] ring-1 ring-white/25 transition-all duration-200 hover:bg-[#ffb03f] hover:shadow-[0_8px_22px_-6px_rgba(0,0,0,0.55)] active:scale-[0.98] sm:mt-5 sm:px-6 sm:text-[13px]"
          >
            {ctaText}
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/cta:translate-x-0.5" />
          </button>
        </div>
      </div>

      {/* Controls */}
      {slides.length > 1 && (
        <>
          {/* 44x44 hit areas. The visible pill stays small; the BUTTON is what
              must be thumb-sized, so the visual is an inner span. */}
          <button
            type="button"
            onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}
            className="absolute left-0 top-1/2 z-20 -ml-1 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white active:bg-black/30"
            aria-label="Previous promotion"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/30 backdrop-blur">
              <ChevronLeft className="h-4 w-4" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => (i + 1) % slides.length)}
            className="absolute right-0 top-1/2 z-20 -mr-1 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white active:bg-black/30"
            aria-label="Next promotion"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/30 backdrop-blur">
              <ChevronRight className="h-4 w-4" />
            </span>
          </button>
          {/* Pagination dots. The tappable button stays 44px tall (legal touch
              target) but sits in a small translucent pill on a scrim, so the
              indicators stay visible over a bright hero photograph as well as a
              gradient. The ACTIVE dot elongates rather than only brightening —
              at 6px a colour-only change is invisible on a busy image. */}
          <div className="absolute inset-x-0 bottom-2 z-20 flex justify-center sm:bottom-4">
            <div className="flex items-center rounded-full bg-black/25 px-1.5 backdrop-blur-sm">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Go to promotion ${i + 1}`}
                  aria-current={i === index}
                  className="flex h-9 w-8 items-center justify-center"
                >
                  <span
                    className={`rounded-full transition-all duration-300 ${
                      i === index
                        ? 'h-1.5 w-6 bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]'
                        : 'h-1.5 w-1.5 bg-white/55 hover:bg-white/80'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
};

/* ──────────────────────────── NOON-STYLE MEGA-MENU ────────────────────────────
   Hovering (or focusing) a primary category in the rail opens a panel listing
   that category's sub-categories, with any third-level sub-types shown beneath.

   WHY A CONTROLLED PANEL RATHER THAN PURE CSS `group-hover`:
   A hover-only menu is unreachable by keyboard and on touch. This one opens on
   hover AND on focus/click, stays open while the pointer is inside it (so the
   shopper can travel down into the list), and closes on Escape.
*/
const MegaMenuPanel: React.FC<{
  node: TaxonomyTree;
  counts: Map<string, number>;
  onSelectSub: (primary: string, sub: string) => void;
  onSelectPrimary: (primary: string) => void;
  onClose: () => void;
  lang?: 'en' | 'bn';
  /** Runtime palette — light or dark. */
  theme?: ThemeTokens;
}> = ({ node, counts, onSelectSub, onSelectPrimary, onClose, lang: menuLang, theme }) => {
  const THEME = theme || LIGHT_THEME;
  const lang: 'en' | 'bn' = menuLang === 'bn' ? 'bn' : 'en';
  const total = counts.get(node.name.toLowerCase()) ?? 0;
  // Display names are translated; the `node.name` HANDED TO THE CALLBACKS stays
  // canonical English so the filter/query never changes with the UI language.
  const label = (name: string) => displayCategory(name, lang);

  return (
    <div
      className="absolute left-0 right-0 top-full z-50 border-t"
      style={{ borderColor: THEME.line, backgroundColor: THEME.surface, boxShadow: THEME.shadow }}
      onMouseLeave={onClose}
    >
      <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-4">
        {/* Left: the primary category itself */}
        <div className="w-[210px] shrink-0 border-r pr-4" style={{ borderColor: THEME.line }}>
          <div className="mb-2 flex items-center gap-2">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-lg"
              style={{ backgroundColor: THEME.brandTint }}
            >
              {node.image ? (
                <SafeImage src={node.image} alt={node.name} className="h-full w-full object-cover" />
              ) : (
                node.emoji || '📁'
              )}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-black" style={{ color: THEME.ink }}>{label(node.name)}</div>
              <div className="text-[10px]" style={{ color: THEME.inkMuted }}>
                {lang === 'bn' ? `${total}টি পণ্য` : `${total} products`}
              </div>
            </div>
          </div>
          {node.description && (
            <p className="mb-2 text-[11px] leading-relaxed" style={{ color: THEME.inkMuted }}>{node.description}</p>
          )}
          <button
            type="button"
            onClick={() => onSelectPrimary(node.name)}
            className="mm-hover flex min-h-[32px] w-full items-center justify-between rounded-md px-2 text-left text-[11.5px] font-bold transition"
            style={{ color: THEME.brand }}
          >
            {lang === 'bn' ? `${label(node.name)} — সব দেখুন` : `Shop all ${node.name}`}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Right: the sub-category columns */}
        <div className="min-w-0 flex-1">
          {node.children.length === 0 ? (
            <div className="flex h-full items-center text-[11.5px]" style={{ color: THEME.inkSubtle }}>
              {lang === 'bn' ? 'কোনো উপ-ক্যাটাগরি নেই।' : `No sub-categories — use “Shop all ${node.name}”.`}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-3 xl:grid-cols-4">
              {node.children.map((sub) => {
                const count = counts.get(`${node.name} › ${sub.name}`.toLowerCase())
                  ?? counts.get(sub.name.toLowerCase()) ?? 0;
                return (
                  <div key={sub.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onSelectSub(node.name, sub.name)}
                      className="mm-hover group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition"
                    >
                      <span
                        className="min-w-0 flex-1 truncate text-[12px] font-semibold group-hover:underline"
                        style={{ color: THEME.inkMuted }}
                      >
                        {label(sub.name)}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums" style={{ color: THEME.inkSubtle }}>{count}</span>
                    </button>
                    {/* Third level (sub-types), indented under their parent */}
                    {sub.children.length > 0 && (
                      <div className="mb-1 ml-3 border-l pl-2" style={{ borderColor: THEME.line }}>
                        {sub.children.slice(0, 5).map((type) => (
                          <button
                            key={type.id}
                            type="button"
                            onClick={() => onSelectSub(node.name, type.name)}
                            className="block w-full truncate rounded px-1 py-0.5 text-left text-[11px] transition hover:underline"
                            style={{ color: THEME.inkMuted }}
                          >
                            {label(type.name)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ───────────────────────── filter section types ───────────────────────── */

export type MarketplaceSortValue = NonNullable<MarketplaceFilters['sort']>;

const PRICE_BANDS: { label: string; labelBn: string; min: number | null; max: number | null }[] = [
  { label: 'Any price', labelBn: 'যেকোনো দাম', min: null, max: null },
  { label: 'Under ৳500', labelBn: '৳৫০০-এর নিচে', min: null, max: 500 },
  { label: '৳500 – ৳1,000', labelBn: '৳৫০০ – ৳১,০০০', min: 500, max: 1000 },
  { label: '৳1,000 – ৳5,000', labelBn: '৳১,০০০ – ৳৫,০০০', min: 1000, max: 5000 },
  { label: '৳5,000 – ৳20,000', labelBn: '৳৫,০০০ – ৳২০,০০০', min: 5000, max: 20000 },
  { label: 'Above ৳20,000', labelBn: '৳২০,০০০-এর উপরে', min: 20000, max: null },
];

const SORTS: { value: MarketplaceSortValue; label: string; labelBn: string }[] = [
  { value: 'newest', label: 'Newest arrivals', labelBn: 'নতুন পণ্য' },
  { value: 'popular', label: 'Best selling', labelBn: 'সবচেয়ে বিক্রিত' },
  { value: 'price_asc', label: 'Price: low to high', labelBn: 'দাম: কম থেকে বেশি' },
  { value: 'price_desc', label: 'Price: high to low', labelBn: 'দাম: বেশি থেকে কম' },
  { value: 'relevance', label: 'Relevance', labelBn: 'প্রাসঙ্গিকতা' },
];

const PAGE_SIZE = 36;

/** Circular/rounded category tile used in the "shop by category" rail. */
const CategoryTile: React.FC<{
  name: string;
  count: number;
  active: boolean;
  onClick: () => void;
  emoji: string;
  /** Admin-uploaded cover, used instead of the emoji when present. */
  image?: string;
  /** "bn" renders the category through the Bangla glossary. */
  lang?: 'en' | 'bn';
  /** Runtime palette — light or dark. */
  theme?: ThemeTokens;
}> = ({ name: rawName, count, active, onClick, emoji, image, lang: tileLang, theme }) => {
  const THEME = theme || LIGHT_THEME;
  const name = displayCategory(rawName, tileLang === 'bn' ? 'bn' : 'en');
  return (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    // Pure white at rest (a tinted card read as "selected" even when nothing was
    // selected), with the accent reserved for the active tile. Hover lifts a hair
    // and deepens the border rather than moving the card, so a row of nine stays
    // visually calm.
    //
    // SIZE IS FIXED, NOT DISTRIBUTED. Stretching these (`flex-1`) was wrong: with
    // two categories each tile grew to 240x145, a big empty card around a 56px
    // circle, and with nine they were cramped. A fixed 112x124 tile reads the
    // same row whether there are two categories or twenty, and a short row simply
    // ends early — which is the normal e-commerce pattern, not a defect.
    className={`group flex h-[124px] w-[112px] shrink-0 flex-col items-center justify-start rounded-2xl border px-2 py-3 transition-all duration-200 ${
      active
        ? 'border-transparent'
        : 'hover:-translate-y-0.5'
    }`}
    style={{
      backgroundColor: active ? THEME.brandTint : THEME.surface,
      borderColor: active ? 'transparent' : THEME.line,
      boxShadow: active
        ? `0 0 0 2px ${THEME.brand}, 0 2px 10px -2px ${THEME.brand}45`
        : undefined,
    }}
  >
    {/* Fixed 56px circle so every tile in the row has identical optical weight.
        `shrink-0` + a fixed box stops a wide source image (a photo rather than
        an icon) from stretching the circle into an ellipse. */}
    <span
      className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-[26px] leading-none"
      style={{ backgroundColor: THEME.chip }}
      aria-hidden="true"
    >
      {image ? (
        <SafeImage src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        emoji
      )}
    </span>
    {/* Two lines are allowed with balanced wrapping; `break-words` keeps a long
        single word from overrunning the tile, and the fixed `h-7` block stops a
        one-line name from making that tile 14px shorter than its neighbours. */}
    <span
      className="mt-2 flex h-7 w-full max-w-[150px] items-center justify-center text-center text-[11.5px] font-semibold leading-[1.15] tracking-[-0.01em] [text-wrap:balance]"
      style={{ color: THEME.ink }}
    >
      <span className="line-clamp-2 break-words">{name}</span>
    </span>
    <span className="mt-1 text-[10px] font-medium leading-none tabular-nums" style={{ color: THEME.inkSubtle }}>
      {tileLang === 'bn' ? `${count}টি পণ্য` : `${count} ${count === 1 ? 'item' : 'items'}`}
    </span>
  </button>
  );
};

/** Deterministic emoji per category name, so tiles never flicker between loads. */
function categoryEmoji(name: string): string {
  const key = name.toLowerCase();
  const table: [RegExp, string][] = [
    [/fashion|cloth|saree|panjabi|shirt|dress|wear/, '👗'],
    [/electron|gadget|mobile|phone|laptop|computer/, '📱'],
    [/beauty|cosmetic|skincare|makeup/, '💄'],
    [/home|kitchen|furniture|decor/, '🏠'],
    [/food|grocery|snack|rice|spice/, '🛒'],
    [/health|medicine|pharma|supplement/, '💊'],
    [/sport|fitness|outdoor/, '🏏'],
    [/toy|baby|kids|game/, '🧸'],
    [/book|stationery|office/, '📚'],
    [/jewel|gold|ornament/, '💎'],
    [/shoe|footwear|sandal/, '👟'],
    [/watch|accessor|bag/, '👜'],
  ];
  for (const [re, emoji] of table) if (re.test(key)) return emoji;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 997;
  return ['🛍️', '✨', '🏷️', '📦', '⭐'][hash % 5];
}

/* ───────────────────────────── main view ──────────────────────────────── */

export interface MegaMarketplaceViewProps {
  /** Jump to a vendor's own storefront (`/store/<slug>`). */
  onVisitVendor: (vendorSlug: string) => void;
  /**
   * Take the basket to that vendor's checkout. The marketplace itself has no
   * checkout of its own — the selected store's storefront owns fulfilment.
   */
  /**
   * Open the unified marketplace checkout (`/marketplace/checkout`). Takes no
   * argument: the whole basket is checked out at once, across every vendor.
   */
  onCheckout: () => void;
  /** Open the merchant dashboard / sign-in. */
  onOpenAccount?: () => void;
  /**
   * Open the shopper's own account area. `section` deep-links to the matching
   * storefront tab/pane so the account menu can send someone straight to their
   * orders, returns or saved addresses instead of a generic landing page.
   */
  onOpenCustomerAccount?: (section?: 'profile' | 'orders' | 'returns' | 'addresses') => void;
  /**
   * Jump straight to sign-in on the shopper's account page. Used by the menu's
   * honest "Sign In" label when nobody is signed in.
   */
  onOpenSignIn?: () => void;
  /** Return to the SaaS pricing landing. */
  onGoToPlans?: () => void;
  /** First path segment already in the URL (e.g. `/marketplace?category=x`). */
  initialFilters?: MarketplaceFilters;
  /**
   * Promo slides override. When omitted (the normal case) the slides come from
   * the Admin → Marketplace Studio banner collection, falling back to the
   * built-in platform set only if the API returns nothing.
   */
  slides?: HeroSlide[];
  /** Optional headline override. */
  title?: string;
}

export const MegaMarketplaceView: React.FC<MegaMarketplaceViewProps> = ({
  onVisitVendor,
  onCheckout,
  onOpenAccount,
  onOpenCustomerAccount,
  onOpenSignIn,
  onGoToPlans,
  initialFilters,
  slides: slidesOverride,
  title = 'Marketplace',
}) => {
  const toast = useToast();
  const basket = useMarketplaceBasket();

  /* ── Dark / Light mode ────────────────────────────────────────────────── */
  const [isDark, toggleDark] = useDarkMode();
  /* The theme engine writes ONE attribute that both our own tokens and every
     Tailwind `dark:` utility key off: `data-mm-theme` on <html>. The class is
     kept in sync as well so `darkMode: 'class'` still works for any consumer
     that relies on it. */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-mm-theme', isDark ? 'dark' : 'light');
    root.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);
  // Shadow the module-level THEME with the runtime dark-aware version.
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const THEME = isDark ? DARK_THEME : LIGHT_THEME;

  /* ── Admin-owned storefront config ───────────────────────────────────────
     Banners, the category rail, the utility strip and the featured/deals
     selection all come from the Super Admin "Marketplace Studio" panel. They
     are fetched in parallel with the catalogue so the hero never waits on the
     product query (and vice-versa). Until the config arrives the built-in
     defaults render, so the page is never blank. */
  const [storefront, setStorefront] = useState<{
    banners: MarketplaceBanner[];
    categories: MarketplaceCategoryRow[];
    strip: UtilityStripConfig | null;
    featured: FeaturedConfig | null;
  }>({ banners: [], categories: [], strip: null, featured: null });
  const [featuredProducts, setFeaturedProducts] = useState<MarketplaceProduct[]>([]);
  const [dealProducts, setDealProducts] = useState<MarketplaceProduct[]>([]);
  /** Global taxonomy tree — powers the Noon-style mega-menu. */
  const [taxonomy, setTaxonomy] = useState<TaxonomyTree[]>([]);
  /** Which primary category's mega-menu is open (desktop only). */
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  /** Sub-category currently filtering the grid, from the mega-menu. */
  const [activeSub, setActiveSub] = useState<string | undefined>(undefined);
  const menuCloseTimer = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    fetchMarketplaceStorefront()
      .then((config) => {
        if (!active) return;
        setStorefront({
          banners: config.banners,
          categories: config.categories,
          strip: config.strip,
          featured: config.featured,
        });
      })
      .catch(() => { /* defaults stay in place */ });

    fetchFeaturedProducts()
      .then((res) => {
        if (!active) return;
        setFeaturedProducts((res.products || []).map(toMarketplaceProduct));
        setDealProducts((res.deals || []).map(toMarketplaceProduct));
      })
      .catch(() => { /* the strips simply do not render */ });

    fetchTaxonomy()
      .then((res) => { if (active) setTaxonomy(res.tree); })
      .catch(() => { /* the rail falls back to flat chips */ });

    return () => { active = false; };
  }, []);

  // Close the mega-menu on Escape, and on any outside pointer-down so it cannot
  // be left hanging over the grid.
  useEffect(() => {
    if (!openMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenu(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openMenu]);

  useEffect(() => () => {
    if (menuCloseTimer.current) window.clearTimeout(menuCloseTimer.current);
  }, []);

  /**
   * Hover with a small close delay.
   *
   * A bare `onMouseLeave` closes the panel in the few pixels between the chip and
   * the panel below it, which makes the sub-categories impossible to reach. The
   * timer gives the pointer time to travel down; entering the panel cancels it.
   */
  const openMegaMenu = useCallback((id: string) => {
    if (menuCloseTimer.current) {
      window.clearTimeout(menuCloseTimer.current);
      menuCloseTimer.current = null;
    }
    setOpenMenu(id);
  }, []);

  const scheduleCloseMegaMenu = useCallback(() => {
    if (menuCloseTimer.current) window.clearTimeout(menuCloseTimer.current);
    menuCloseTimer.current = window.setTimeout(() => setOpenMenu(null), 160);
  }, []);

  /** Admin banners → carousel slides; built-in set is the fallback. */
  const slides = useMemo<HeroSlide[]>(() => {
    if (slidesOverride) return slidesOverride;
    const fromAdmin = storefront.banners.map(bannerToSlide).filter((s) => s.title || s.image);
    return fromAdmin.length > 0 ? fromAdmin : DEFAULT_SLIDES;
  }, [slidesOverride, storefront.banners]);

  /** Utility strip — hidden entirely when the admin disabled it. */
  const strip = storefront.strip;
  const stripItems = useMemo(
    () => (strip?.items || []).filter((item) => item.isActive && item.text.trim()),
    [strip],
  );
  const stripVisible = Boolean(strip?.isActive) && stripItems.length > 0;

  /** Pinned/vendor-resolved featured rows, else the best of the catalogue. */
  const featuredConfig = storefront.featured;
  const featuredList = useMemo<MarketplaceProduct[]>(() => {
    const limit = featuredConfig?.featuredLimit ?? 12;
    if (featuredProducts.length > 0) return featuredProducts.slice(0, limit);
    return [];
  }, [featuredProducts, featuredConfig?.featuredLimit]);
  const dealsList = useMemo<MarketplaceProduct[]>(() => {
    if (featuredConfig && featuredConfig.dealsEnabled === false) return [];
    return dealProducts.slice(0, featuredConfig?.dealsLimit ?? 12);
  }, [dealProducts, featuredConfig]);

  const [filters, setFilters] = useState<MarketplaceFilters>(() => ({
    sort: 'newest',
    page: 1,
    limit: PAGE_SIZE,
    ...(initialFilters || {}),
  }));
  const [searchInput, setSearchInput] = useState(initialFilters?.q || '');
  const [data, setData] = useState<MarketplaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [appending, setAppending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showBasket, setShowBasket] = useState(false);
  const [showWishlist, setShowWishlist] = useState(false);
  // Mobile navigation: hamburger drawer + collapsible search field.
  const [showMenu, setShowMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  /* ── Noon-style search suggestions ─────────────────────────────────────
     The dropdown opens on FOCUS or CLICK (not only once a character is typed),
     because the "Trending searches" pills are the primary navigation aid for a
     shopper who has no query in mind yet — an empty click is exactly the moment
     they are most useful. */
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => readRecentSearches());
  const searchBoxRef = useRef<HTMLDivElement>(null);
  /** Highlights the arrow-key selection in the suggestion list. */
  const [activeSuggestion, setActiveSuggestion] = useState(-1);

  // One outside-click listener for the search overlay, registered only while it
  // is open. `mousedown` (not `click`) so the overlay closes before a click
  // lands on the page behind it.
  useEffect(() => {
    if (!searchFocused) return;
    const onDown = (e: MouseEvent) => {
      if (!searchBoxRef.current?.contains(e.target as Node)) {
        setSearchFocused(false);
        setActiveSuggestion(-1);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [searchFocused]);

  /* ── Noon-style header controls ────────────────────────────────────────
     Location, language and the account menu are all shopper PREFERENCES, so
     they persist in localStorage and survive a reload. They are presentation
     only: the language switch changes the chrome's copy direction, not the
     catalogue, which is stored bilingually (title + titleBn) either way. */
  const [showLocation, setShowLocation] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  /* ── Shopper identity ─────────────────────────────────────────────────
     The account menu must say who is signed in ("Hi, Rakib") rather than a
     blanket "Hi, sign in", and must offer Sign Out only to someone who IS
     signed in. The tenant storefront owns the session, so we read the same
     localStorage key it writes and re-read when the tab regains focus (a
     sign-in happens on another page, so no in-page event fires here). */
  const readShopperSession = useCallback((): { name: string; email: string } | null => {
    try {
      const raw = localStorage.getItem('zid_customer_session');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const name = String(parsed?.name || '').trim();
      const email = String(parsed?.email || '').trim();
      if (!name && !email) return null;
      return { name, email };
    } catch {
      return null;
    }
  }, []);
  const [shopper, setShopper] = useState<{ name: string; email: string } | null>(() => readShopperSession());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setShopper(readShopperSession());
    sync();
    window.addEventListener('focus', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('storage', sync);
    };
  }, [readShopperSession]);

  /** First name for the greeting — a full name in the trigger would overflow. */
  const shopperFirstName = useMemo(() => {
    const raw = shopper?.name || (shopper?.email ? shopper.email.split('@')[0] : '');
    return raw.trim().split(/\s+/)[0] || '';
  }, [shopper]);

  /* ── Delivery destination ──────────────────────────────────────────────
     Seeded SYNCHRONOUSLY from what this device already knows (a previous
     manual pick, a cached IP result, or the browser locale) so the header
     never shows a blank or an invented city on first load. The async IP
     lookup then refines it — see the effect below. */
  const [deliverTo, setDeliverTo] = useState<string>(() => {
    try {
      const legacy = localStorage.getItem('zid_marketplace_deliver_to');
      if (legacy) return legacy;
    } catch { /* private mode */ }
    return getInitialLocation().city;
  });
  /** True while the IP lookup is in flight — drives the subtle "locating" hint. */
  const [isLocating, setIsLocating] = useState(false);

  /* Resolve the real city from the visitor's IP on first load. `detectLocation`
     respects a manual pick and caches its own result, so this runs at most once
     per device per day and NEVER overwrites a destination the shopper chose. */
  useEffect(() => {
    let cancelled = false;
    setIsLocating(true);
    detectLocation()
      .then((loc) => {
        if (cancelled || !loc?.city) return;
        setDeliverTo((current) => {
          // Keep a manual choice made while the lookup was in flight.
          try {
            if (localStorage.getItem('zid_location_manual')) return current;
          } catch { /* private mode */ }
          return loc.city;
        });
      })
      .catch(() => { /* keep the initial/cached city */ })
      .finally(() => { if (!cancelled) setIsLocating(false); });
    return () => { cancelled = true; };
  }, []);
  const [language, setLanguage] = useState<'en' | 'bn'>(() => {
    try { return (localStorage.getItem('zid_marketplace_lang') as 'en' | 'bn') || 'en'; } catch { return 'en'; }
  });

  const wishlist = useMarketplaceWishlist();

  /* Rotating search placeholder. Advances every 4s, but PAUSES once the shopper
     starts typing so a half-written query is never silently replaced — and stops
     entirely for `prefers-reduced-motion` users. */
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (searchInput || prefersReducedMotion) return;
    const id = window.setInterval(
      () => setPlaceholderIndex((i) => (i + 1) % SEARCH_PLACEHOLDERS.length),
      4000,
    );
    return () => window.clearInterval(id);
  }, [searchInput, prefersReducedMotion]);

  /**
   * The scoped search placeholder.
   *
   * When a category is active the field says "Search in Fashion" — the header's
   * search then narrows WITHIN that category because `filters.category` is part
   * of the query the submit builds. That is the Noon behaviour, and it is why the
   * placeholder is derived rather than fixed.
   */
  /** Shorthand for the marketplace's own copy in the active language. */
  const copy = useCallback(
    (key: string, vars?: Record<string, string | number>) => marketplaceCopy(key, language, vars),
    [language],
  );

  const searchPlaceholder = useMemo(() => {
    if (filters.category) return copy('search_in', { name: displayCategory(filters.category, language) });
    if (language === 'bn') return 'পণ্য, ব্র্যান্ড বা ক্যাটাগরি খুঁজুন…';
    return SEARCH_PLACEHOLDERS[placeholderIndex] || SEARCH_PLACEHOLDERS[0];
  }, [filters.category, placeholderIndex, language, copy]);

  const pickLocation = (zone: string) => {
    setDeliverTo(zone);
    try { localStorage.setItem('zid_marketplace_deliver_to', zone); } catch { /* private mode */ }
    // Remembered as an EXPLICIT choice, so automatic detection leaves it alone.
    saveManualLocation(zone);
    setShowLocation(false);
  };

  const pickLanguage = (lang: 'en' | 'bn') => {
    setLanguage(lang);
    try { localStorage.setItem('zid_marketplace_lang', lang); } catch { /* private mode */ }
    setShowLangMenu(false);
  };

  /*
   * Keep the document language in sync with the marketplace switch.
   *
   * `lang` drives hyphenation, screen-reader pronunciation and search-engine
   * indexing; without this the whole Bangla catalogue is announced as English.
   *
   * `data-owns-lang` marks this view as the OWNER of `<html lang>` while it is
   * mounted, so the app-wide `LanguageProvider` (whose preference is separate)
   * does not overwrite it. Removed on unmount so the dashboard reclaims it.
   */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.body;
    root.setAttribute('data-owns-lang', 'marketplace');
    document.documentElement.lang = language;
    return () => { root.removeAttribute('data-owns-lang'); };
  }, [language]);

  // Any click outside the open header popover closes it. One listener for all
  // three menus rather than one per menu, and registered only while one is open.
  const headerMenusRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const anyOpen = showLocation || showAccountMenu || showLangMenu;
    if (!anyOpen) return;
    const onDown = (e: MouseEvent) => {
      if (headerMenusRef.current && !headerMenusRef.current.contains(e.target as Node)) {
        setShowLocation(false);
        setShowAccountMenu(false);
        setShowLangMenu(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowLocation(false);
        setShowAccountMenu(false);
        setShowLangMenu(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showLocation, showAccountMenu, showLangMenu]);
  // Which bottom sheet is open on mobile: filters/sort, or the category list.
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  // "Deals" narrows the grid to products the merchant actually discounted
  // (a compare-at price above the selling price). It is a client-side view of
  // the current result set, so it composes with every server filter.
  const [dealsOnly, setDealsOnly] = useState(false);
  const [vendorQuery, setVendorQuery] = useState('');
  const [activeProduct, setActiveProduct] = useState<MarketplaceProduct | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Lock body scroll while a mobile overlay is open, so the page behind a
  // drawer/bottom sheet cannot scroll away from the user's thumb.
  useEffect(() => {
    const anyOpen = showMenu || showBasket || showWishlist || showFilterSheet || Boolean(activeProduct);
    if (!anyOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [showMenu, showBasket, showWishlist, showFilterSheet, activeProduct]);

  // The document body is dark (#0f172a) for the merchant dashboard, so the
  // marketplace's light surface must own the whole viewport — otherwise the
  // dark body shows through beneath the content on a tall screen. The body
  // colour is restored on unmount so navigating back to a tenant storefront
  // is unaffected.
  useEffect(() => {
    const root = document.getElementById('root');
    const prevBody = document.body.style.backgroundColor;
    const prevHtml = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = THEME.bg;
    document.documentElement.style.backgroundColor = THEME.bg;
    const prevRoot = root?.style.backgroundColor ?? '';
    if (root) root.style.backgroundColor = THEME.bg;
    return () => {
      document.body.style.backgroundColor = prevBody;
      document.documentElement.style.backgroundColor = prevHtml;
      if (root) root.style.backgroundColor = prevRoot;
    };
    // `THEME.bg` MUST be a dependency. With `[]` the effect captured the LIGHT
    // palette on first mount and never re-ran, so toggling to dark repainted the
    // component but left body/html/#root painted light — a bright gutter down
    // the side of a dark page, and a white flash on overscroll. The cleanup also
    // restores the COLOUR THAT WAS THERE when this run started, which is what
    // keeps a tenant storefront intact after navigating away.
  }, [THEME.bg]);

  const setFilter = useCallback((patch: Partial<MarketplaceFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch, page: 1 }));
  }, []);

  // ── Load the catalogue on every filter change ────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    fetchMarketplaceProducts({ ...filters, page: 1 })
      .then((res) => {
        if (controller.signal.aborted) return;
        setData(res);
        if (!res.ok && res.error) setError(res.error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.q, filters.category, filters.subCategory, filters.minPrice, filters.maxPrice,
    filters.vendor, filters.vendorName, filters.sort,
  ]);

  const loadMore = async () => {
    if (!data || data.page >= data.pages || appending) return;
    setAppending(true);
    try {
      const next = await fetchMarketplaceProducts({ ...filters, page: (filters.page || 1) + 1 });
      if (next.ok) {
        setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }));
        setData((prev) => {
          if (!prev) return next;
          const seen = new Set(prev.products.map((p) => String(p.id)));
          return {
            ...next,
            products: [...prev.products, ...next.products.filter((p) => !seen.has(String(p.id)))],
            page: next.page,
          };
        });
      }
    } finally {
      setAppending(false);
    }
  };

  const selectSubCategory = useCallback((primary: string, sub: string) => {
    setOpenMenu(null);
    setActiveSub(sub);
    setSearchInput('');
    setFilter({ category: primary, subCategory: sub, q: undefined });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setFilter]);

  const selectPrimaryCategory = useCallback((primary: string) => {
    setOpenMenu(null);
    setActiveSub(undefined);
    setSearchInput('');
    setFilter({ category: primary, subCategory: undefined, q: undefined });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setFilter]);

  const submitSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = searchInput.trim();
    setFilter({ q: q || undefined });
    setSearchFocused(false);
    setActiveSuggestion(-1);
    searchRef.current?.blur();
    if (!q) return;
    // Remember the query so it appears under "Recent searches" next time.
    setRecentSearches((prev) => {
      const next = [q, ...prev.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT_SEARCHES);
      writeRecentSearches(next);
      return next;
    });
  };

  /**
   * Run a search straight from a suggestion (trending pill or recent query).
   *
   * Driving `searchInput` and the filter TOGETHER keeps the visible field in
   * sync with the results — setting only `filters.q` would render results the
   * search box does not describe.
   */
  const runSuggestion = (term: string) => {
    const q = term.trim();
    if (!q) return;
    setSearchInput(q);
    setFilter({ q, category: undefined, subCategory: undefined });
    setSearchFocused(false);
    setActiveSuggestion(-1);
    searchRef.current?.blur();
    setRecentSearches((prev) => {
      const next = [q, ...prev.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT_SEARCHES);
      writeRecentSearches(next);
      return next;
    });
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    writeRecentSearches([]);
  };

  /**
   * Keywords matched by what has been typed so far.
   *
   * Matching is a case-insensitive subsequence on the label, so "phne" still
   * finds "mobile phone" — the typo-tolerant behaviour shoppers expect from an
   * autocomplete rather than a strict prefix filter.
   */
  const matchedSuggestions = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return [];
    return TRENDING_SEARCHES
      .filter(({ label }) => label.toLowerCase().includes(q) || label.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)))
      .slice(0, 6);
  }, [searchInput]);

  /** Every option the keyboard can walk through, in render order. */
  const keyboardOptions = useMemo(() => {
    const list: string[] = [];
    if (searchInput.trim()) {
      list.push(searchInput.trim());
      matchedSuggestions.forEach((s) => list.push(s.label));
    } else {
      TRENDING_SEARCHES.forEach((s) => list.push(s.label));
    }
    return list;
  }, [searchInput, matchedSuggestions]);

  /**
   * Bold the part of a suggestion that matches the query, the way an
   * autocomplete should: the shopper sees WHY a row was offered instead of
   * re-reading the whole label.
   */
  const highlightMatch = (label: string) => {
    const q = searchInput.trim();
    if (!q) return label;
    const idx = label.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return label;
    return (
      <>
        {label.slice(0, idx)}
        <strong className="font-black" style={{ color: THEME.brand }}>{label.slice(idx, idx + q.length)}</strong>
        {label.slice(idx + q.length)}
      </>
    );
  };

  /**
   * The search overlay.
   *
   * Three stacked sections, matching the Noon pattern: the query the shopper is
   * writing ("Search for …"), matched keywords / recent history, then Trending
   * searches as pills. It renders on focus OR click, so an empty click still
   * offers somewhere to go. `onMouseDown` with `preventDefault` keeps the input
   * focused while an option is being chosen — otherwise the blur fires first
   * and the overlay unmounts before the click registers.
   */
  const renderSearchOverlay = (fullWidth?: boolean) => {
    if (!searchFocused) return null;
    const typed = searchInput.trim();

    const option = (label: string, key: string, onClick: () => void, leading?: React.ReactNode) => (
      <button
        key={key}
        type="button"
        role="option"
        aria-selected={false}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className="mm-hover flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] transition"
        style={{ color: THEME.inkMuted }}
      >
        <span className="shrink-0" style={{ color: THEME.inkSubtle }}>{leading ?? <Search className="h-3.5 w-3.5" />}</span>
        <span className="min-w-0 flex-1 truncate">{highlightMatch(label)}</span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0" style={{ color: THEME.inkSubtle }} />
      </button>
    );

    return (
      <div
        role="listbox"
        aria-label={copy('search_suggestions')}
        onMouseDown={(e) => e.preventDefault()}
        className={`absolute left-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border ${fullWidth ? 'right-0 w-full' : 'w-full min-w-[320px]'}`}
        style={{ borderColor: THEME.line, backgroundColor: THEME.surface, boxShadow: THEME.shadow }}
      >
        {/* 1 — what the shopper is currently typing */}
        {typed && (
          <div className="border-b" style={{ borderColor: THEME.line }}>
            {option(
              copy('search_for', { q: typed }),
              'query',
              () => { setSearchInput(typed); submitSearch(); },
            )}
            {matchedSuggestions.length > 0 && (
              <div className="pb-1">
                {matchedSuggestions.map((s) => (
                  <React.Fragment key={s.label}>
                    {option(s.label, `m-${s.label}`, () => runSuggestion(s.label), s.icon ? <s.icon className="h-3.5 w-3.5" /> : undefined)}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2 — recent history (only when the field is empty) */}
        {!typed && recentSearches.length > 0 && (
          <div className="border-b py-1" style={{ borderColor: THEME.line }}>
            <div className="flex items-center justify-between px-3.5 pb-1 pt-2">
              <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
                <Clock className="h-3 w-3" /> {copy('recent_searches')}
              </span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={clearRecentSearches}
                className="text-[10.5px] font-bold text-slate-400 transition hover:text-[#e11d48]"
              >
                {copy('clear_history')}
              </button>
            </div>
            {recentSearches.map((term) => option(term, `r-${term}`, () => runSuggestion(term), <Clock className="h-3.5 w-3.5" />))}
          </div>
        )}

        {/* 3 — Trending searches, as clickable pills */}
        <div className="px-3.5 pb-3 pt-2.5">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
            <TrendingUp className="h-3 w-3" style={{ color: THEME.accent }} /> {copy('trending_searches')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TRENDING_SEARCHES.map(({ label, labelBn, icon: Icon }) => (
              <button
                key={label}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runSuggestion(label)}
                className="mm-pill flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] font-semibold transition hover:-translate-y-px hover:shadow-sm"
                style={{ borderColor: THEME.line, backgroundColor: THEME.surface, color: THEME.inkMuted }}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {language === 'bn' ? labelBn : label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSearchFocused(false);
      setActiveSuggestion(-1);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchFocused(true);
      setActiveSuggestion((i) => {
        const count = keyboardOptions.length;
        if (!count) return -1;
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        return (next + count) % count;
      });
      return;
    }
    if (e.key === 'Enter' && activeSuggestion >= 0) {
      e.preventDefault();
      runSuggestion(keyboardOptions[activeSuggestion]);
    }
  };

  const clearAll = () => {
    setSearchInput('');
    setVendorQuery('');
    setActiveSub(undefined);
    setOpenMenu(null);
    setFilters({ sort: 'newest', page: 1, limit: PAGE_SIZE });
  };

  const activeVendor: MarketplaceFacetVendor | undefined = useMemo(
    () => (data?.vendors || []).find((v) => v.vendor_id === filters.vendor || v.vendor_slug === filters.vendor),
    [data?.vendors, filters.vendor],
  );

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.q) n++;
    if (filters.category) n++;
    if (filters.minPrice != null || filters.maxPrice != null) n++;
    if (filters.vendor) n++;
    if (filters.vendorName) n++;
    return n;
  }, [filters]);

  const priceBandIndex = useMemo(
    () => PRICE_BANDS.findIndex((b) => b.min === (filters.minPrice ?? null) && b.max === (filters.maxPrice ?? null)),
    [filters.minPrice, filters.maxPrice],
  );

  const vendorFacets = useMemo(() => {
    const list = data?.vendors || [];
    const q = vendorQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) =>
      (v.vendor_name || '').toLowerCase().includes(q) ||
      (v.vendor_slug || '').toLowerCase().includes(q) ||
      (v.vendor_code || '').toLowerCase().includes(q),
    );
  }, [data?.vendors, vendorQuery]);

  /* ── CATEGORY RAIL: admin list OVERLAYS the catalogue facets ──────────────
     The facets stay the source of truth for what is actually purchasable (and
     for the count on each tile); the admin collection decides which of those
     categories are shown, their ORDER, their artwork and whether they get a
     tile in "Shop by category". A category the admin created but that has no
     products yet still displays — with a 0 count — so the rail can be staged
     before stock arrives. */
  const allCategories = useMemo(() => {
    const facets = data?.categories || [];
    const facetByName = new Map(facets.map((c) => [c.name.trim().toLowerCase(), c.product_count]));
    const adminCategories = storefront.categories;

    if (adminCategories.length === 0) {
      // No admin configuration yet: the rail is the catalogue facets, as before.
      return { rail: facets.slice(0, 14), tiles: facets.slice(0, 10), configured: false };
    }

    const visible = adminCategories.filter((c) => c.isActive);
    const rail = visible.map((c) => ({
      name: c.name,
      product_count: facetByName.get(c.name.toLowerCase()) ?? 0,
      emoji: c.emoji,
      image: c.image,
      isFeatured: c.isFeatured,
    }));
    // Anything the admin never touched is appended so no live category goes
    // missing simply because nobody added it to the list yet.
    const known = new Set(visible.map((c) => c.name.toLowerCase()));
    const extras = facets
      .filter((f) => !known.has(f.name.toLowerCase()))
      .map((f) => ({ ...f, isFeatured: false as boolean }));

    const ordered = [...rail, ...extras];
    return {
      // The rail keeps empties: it is navigation, and an admin may legitimately
      // stage a category there before stock arrives.
      rail: ordered.slice(0, 20),
      tiles: ordered.filter((c) => c.isFeatured),
      configured: true,
    };
  }, [data?.categories, storefront.categories]);

  /*
   * "Shop by category" TILES: only categories that can actually be shopped.
   *
   * A tile reading "0 items" is worse than an absent tile — it advertises an
   * empty aisle. The category is still reachable from the rail above (where it
   * is a navigation affordance, not a promise of stock) and disappears from this
   * promotional row until its first product lands.
   *
   * A product count of 0 is also what an un-tagged or brand-new admin category
   * reports, so this doubles as the guard that keeps a freshly created category
   * from appearing as a broken tile on the storefront.
   */
  const topCategories = useMemo(
    () => allCategories.tiles.filter((cat) => cat.product_count > 0).slice(0, 12),
    [allCategories.tiles],
  );
  const allProducts = useMemo(() => data?.products || [], [data?.products]);

  /** Primary category name → live product count, for the mega-menu columns. */
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const facet of data?.categories || []) map.set(facet.name.toLowerCase(), facet.product_count);
    return map;
  }, [data?.categories]);

  /** Only primaries with children get a mega-menu; the rest stay plain links. */
  const menuTreeByName = useMemo(() => {
    const map = new Map<string, TaxonomyTree>();
    for (const node of taxonomy) map.set(node.name.toLowerCase(), node);
    return map;
  }, [taxonomy]);
  const products = useMemo(
    () => (dealsOnly
      ? allProducts.filter((p) => Number((p as any).discount_percent || 0) > 0)
      : allProducts),
    [allProducts, dealsOnly],
  );

  const handleAdd = (product: MarketplaceProduct) => {
    basket.add(product, 1);
    toast.success(marketplaceCopy('added_to_basket', language), {
      description: `${productTitle(product, language)} — ${product.vendor_name}`,
    });
  };

  const handleToggleWishlist = (product: MarketplaceProduct) => {
    const saved = wishlist.toggle(product, 1);
    toast.success(marketplaceCopy(saved ? 'saved_to_wishlist' : 'removed_from_wishlist', language), {
      description: productTitle(product, language),
    });
  };

  const handleHeroCta = (slide: HeroSlide) => {
    if (slide.category) {
      setSearchInput('');
      setFilter({ category: slide.category, q: undefined });
    } else if (slide.search) {
      setSearchInput(slide.search);
      setFilter({ category: undefined, q: slide.search });
    } else {
      setFilter({ category: undefined });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ───────────────────────────── render ───────────────────────────── */

  return (
    <div
      className="mm-backdrop relative flex min-h-screen w-full min-w-0 flex-col font-sans transition-colors duration-300"
      // Inline custom properties let the scoped <style> block (dot grid, glow,
      // hover tint) follow the same palette as every inline `style={{}}` — one
      // source of truth instead of a parallel set of dark: utilities.
      style={{
        background: THEME.bgMesh,
        color: THEME.ink,
        ['--mm-hover' as any]: THEME.hover,
        ['--mm-brand' as any]: THEME.brand,
        ['--mm-dot' as any]: isDark ? 'rgba(140,150,200,0.10)' : 'rgba(59,47,214,0.055)',
        ['--mm-glow-a' as any]: isDark ? 'rgba(109,99,255,0.13)' : 'rgba(59,47,214,0.055)',
        ['--mm-glow-b' as any]: isDark ? 'rgba(255,184,77,0.07)' : 'rgba(255,159,28,0.045)',
      }}
    >
      {/* ═════════ MEGA HEADER ═════════ */}
      <header
        className="sticky top-0 z-40 w-full"
        style={{
          backgroundColor: THEME.surface,
          borderBottom: `1px solid ${THEME.line}`,
          // The header floats over the textured backdrop: a soft shadow keeps
          // the boundary crisp without a hard 1px rule on every row.
          boxShadow: isDark
            ? '0 1px 0 rgba(255,255,255,0.03), 0 8px 24px -16px rgba(0,0,0,0.9)'
            : '0 1px 2px rgba(17,24,39,0.04), 0 8px 24px -18px rgba(17,24,39,0.35)',
        }}
      >
        {/* Utility strip — content + visibility are owned by
            Admin → Marketplace Studio → Utility Strip. */}
        {stripVisible && (
          <div className="hidden w-full text-white md:block" style={{ backgroundColor: THEME.brandDark }}>
            <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-1.5 text-[11px]">
              <div className="flex min-w-0 items-center gap-4 overflow-hidden">
                {stripItems.map((item) => {
                  const Icon = STRIP_ICON_MAP[item.icon] || MapPin;
                  return (
                    <span key={item.id} className="flex shrink-0 items-center gap-1 whitespace-nowrap">
                      <Icon className="h-3 w-3" /> {stripText(item.text, language)}
                    </span>
                  );
                })}
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <button type="button" onClick={onOpenAccount} className="hover:text-amber-300">
                  {strip?.sellLabel || copy('sell_on_zid')}
                </button>
                {onGoToPlans && (
                  <button type="button" onClick={onGoToPlans} className="hover:text-amber-300">
                    {strip?.merchantLoginLabel || copy('merchant_login')}
                  </button>
                )}
                {strip?.phone && (
                  <span className="flex items-center gap-1"><HeadphonesIcon className="h-3 w-3" /> {strip.phone}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── MOBILE COMPACT BAR (below `lg`) ──────────────────────────
            One row, 56px tall, everything within thumb reach: menu · logo ·
            search toggle · basket. The full search field is collapsed until
            tapped so the bar stays short and the grid gets maximum screen. */}
        <div className="flex h-14 items-center gap-1 px-2 lg:hidden">
          <button
            type="button"
            onClick={() => setShowMenu(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl active:opacity-80"
            style={{ color: THEME.ink }}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => { clearAll(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="flex h-11 shrink-0 items-center gap-1.5 px-1"
            aria-label="ZID Marketplace home"
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black text-white"
              style={{ backgroundColor: THEME.brand }}
            >
              Z
            </span>
            <span className="text-[15px] font-black tracking-tight" style={{ color: THEME.ink }}>
              ZID<span style={{ color: THEME.brand }}>Market</span>
            </span>
          </button>

          <div className="flex-1" />

          {/* Dark / light toggle — first-class in the mobile bar, because on a
              phone there is no other place the shopper would find it. */}
          <div className="flex h-11 shrink-0 items-center pr-0.5">
            <ThemeSwitch
              isDark={isDark}
              onToggle={toggleDark}
              theme={THEME}
              size="sm"
              label={isDark ? copy('switch_to_light') : copy('switch_to_dark')}
            />
          </div>

          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl active:opacity-80"
            style={{ color: THEME.ink }}
            aria-label="Search products"
            aria-expanded={searchOpen}
          >
            <Search className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowWishlist(true)}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl active:opacity-80"
            style={{ color: THEME.ink }}
            aria-label={`Wishlist, ${wishlist.count} saved items`}
          >
            <Heart className="h-5 w-5" />
            {wishlist.count > 0 && (
              <span
                className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[9px] font-black text-white"
                style={{ backgroundColor: THEME.danger }}
              >
                {wishlist.count > 99 ? '99+' : wishlist.count}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowBasket(true)}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl active:opacity-80"
            style={{ color: THEME.ink }}
            aria-label={`Cart, ${basket.itemCount} items`}
          >
            <ShoppingBasket className="h-5 w-5" />
            {basket.itemCount > 0 && (
              <span
                className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[9px] font-black text-white"
                style={{ backgroundColor: THEME.accent }}
              >
                {basket.itemCount > 99 ? '99+' : basket.itemCount}
              </span>
            )}
          </button>
        </div>

        {/* Collapsible mobile search field */}
        {searchOpen && (
          <form
            onSubmit={submitSearch}
            className="relative border-t px-2 pb-2 pt-1.5 lg:hidden"
            style={{ borderColor: THEME.line }}
            ref={searchBoxRef}
          >
            <div
              className="flex w-full items-center overflow-hidden rounded-xl border"
              style={{ borderColor: THEME.brand, backgroundColor: THEME.surface }}
            >
              <Search className="ml-2.5 h-4 w-4 shrink-0" style={{ color: THEME.inkSubtle }} />
              <input
                ref={searchRef}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onClick={() => setSearchFocused(true)}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder}
                aria-label={copy('search_aria')}
                aria-autocomplete="list"
                aria-expanded={searchFocused}
                autoComplete="off"
                autoFocus
                className="min-w-0 flex-1 bg-transparent px-2 py-3 text-[14px] placeholder:opacity-70 focus:outline-none"
                style={{ color: THEME.ink }}
              />
              {searchInput && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setSearchInput(''); setFilter({ q: undefined }); }}
                  className="flex h-11 w-11 items-center justify-center"
                  style={{ color: THEME.inkSubtle }}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="submit"
                className="flex h-11 items-center px-4 text-[13px] font-black text-white"
                style={{ backgroundColor: THEME.brand }}
              >
                Go
              </button>
            </div>
            {renderSearchOverlay(true)}
          </form>
        )}

        {/* ── DESKTOP HEADER ROW (lg and up) ─────────────────────────── */}
        <div
          ref={headerMenusRef}
          className="mx-auto hidden max-w-[1400px] items-center gap-4 px-4 py-2.5 lg:flex"
        >
          {/* ── LEFT: brand + location ─────────────────────────────── */}
          <button
            type="button"
            onClick={() => { clearAll(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="flex shrink-0 items-center gap-2"
            aria-label="ZID Marketplace home"
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl text-base font-black text-white shadow-sm"
              style={{ backgroundColor: THEME.brand }}
            >
              Z
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[17px] font-black tracking-tight" style={{ color: THEME.ink }}>
                ZID<span style={{ color: THEME.brand }}>Market</span>
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-400">
                {language === 'bn' ? 'মাল্টি-ভেন্ডর বাজার' : 'Multi-vendor bazaar'}
              </span>
            </span>
          </button>

          {/* LOCATION SELECTOR — the delivery destination drives the promise
              above the fold ("Deliver to Dhaka") and is remembered per browser. */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => { setShowLocation((v) => !v); setShowAccountMenu(false); setShowLangMenu(false); }}
              aria-haspopup="listbox"
              aria-expanded={showLocation}
              className="mm-hover flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition"
              style={{ backgroundColor: showLocation ? THEME.hover : 'transparent' }}
            >
              <MapPin className={`h-[18px] w-[18px] shrink-0 ${isLocating ? 'animate-pulse' : ''}`} style={{ color: THEME.brand }} />
              <span className="flex flex-col whitespace-nowrap leading-tight">
                <span className="text-[10px] text-slate-400">
                  {isLocating && !deliverTo ? copy('locating') : copy('deliver_to')}
                </span>
                <span className="max-w-[110px] truncate text-[12px] font-bold" style={{ color: THEME.ink }}>
                  {deliverTo}
                </span>
              </span>
              <ChevronDown className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${showLocation ? 'rotate-180' : ''}`} />
            </button>
            {showLocation && (
              <div
                role="listbox"
                aria-label="Choose a delivery district"
                className="absolute left-0 top-full z-50 mt-2 w-[260px] overflow-hidden rounded-xl border py-1 shadow-xl"
                style={{ borderColor: THEME.line, backgroundColor: THEME.surface, boxShadow: THEME.shadow }}
              >
                <div className="px-3 py-2 text-[10px] font-black uppercase tracking-wide" style={{ color: THEME.inkSubtle }}>
                  {copy('deliver_to_all')}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {DISTRICT_PRESETS.map((zone) => (
                    <button
                      key={zone}
                      type="button"
                      role="option"
                      aria-selected={deliverTo === zone}
                      onClick={() => pickLocation(zone)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] transition hover:opacity-80 ${
                        deliverTo === zone ? 'font-bold' : ''
                      }`}
                      style={deliverTo === zone ? { color: THEME.brand, backgroundColor: THEME.brandTint } : { color: THEME.inkMuted }}
                    >
                      {zone}
                      {deliverTo === zone && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* CENTRAL GLOBAL SEARCH — anchored wrapper positions the overlay */}
          <form onSubmit={submitSearch} className="relative flex min-w-0 flex-1 items-center" ref={searchBoxRef}>
            <div
              className="flex w-full items-center overflow-hidden rounded-xl border-2 transition-shadow focus-within:shadow-md"
              style={{ borderColor: THEME.brand, backgroundColor: THEME.surface }}
            >
              <button
                type="button"
                onClick={submitSearch}
                className="mm-hover flex h-10 items-center gap-1 px-3 text-[12px] font-bold"
                style={{ color: THEME.inkMuted }}
              >
                All
                <ChevronDown className="h-3 w-3" />
              </button>
              <span className="h-6 w-px" style={{ backgroundColor: THEME.line }} />
              <input
                ref={searchRef}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onClick={() => setSearchFocused(true)}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder}
                aria-label={copy('search_aria')}
                aria-autocomplete="list"
                aria-expanded={searchFocused}
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[13px] placeholder:opacity-70 focus:outline-none"
                style={{ color: THEME.ink }}
              />
              {searchInput && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setSearchInput(''); setFilter({ q: undefined }); }}
                  className="px-2 transition hover:opacity-60"
                  style={{ color: THEME.inkSubtle }}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="submit"
                className="flex h-10 items-center gap-1.5 px-4 text-[13px] font-black text-white"
                style={{ backgroundColor: THEME.brand }}
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
                <span className="hidden lg:inline">Search</span>
              </button>
            </div>
            {renderSearchOverlay()}
          </form>

          {/* ── RIGHT: language · account · orders · wishlist · cart ── */}
          <div className="flex shrink-0 items-center gap-0.5">
            {/* LANGUAGE SWITCHER */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowLangMenu((v) => !v); setShowLocation(false); setShowAccountMenu(false); }}
                aria-haspopup="menu"
                aria-expanded={showLangMenu}
                className="mm-hover flex items-center gap-1 rounded-lg px-2 py-2 text-[12px] font-bold transition"
                style={{ color: THEME.ink }}
                title="Change language"
              >
                <Globe className="h-[15px] w-[15px]" style={{ color: THEME.inkMuted }} />
                {language === 'en' ? 'EN' : 'বাংলা'}
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${showLangMenu ? 'rotate-180' : ''}`}
                  style={{ color: THEME.inkSubtle }}
                />
              </button>
              {showLangMenu && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 w-[168px] overflow-hidden rounded-xl border py-1"
                  style={{ borderColor: THEME.line, backgroundColor: THEME.surface, boxShadow: THEME.shadow }}
                >
                  {([['en', 'English', 'EN'], ['bn', 'বাংলা', 'BN']] as const).map(([code, label, short]) => (
                    <button
                      key={code}
                      type="button"
                      role="menuitemradio"
                      aria-checked={language === code}
                      onClick={() => pickLanguage(code)}
                      className={`mm-hover flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] transition ${
                        language === code ? 'font-bold' : ''
                      }`}
                      style={language === code ? { color: THEME.brand } : { color: THEME.inkMuted }}
                    >
                      <span>{label} <span className="text-[10px]" style={{ color: THEME.inkSubtle }}>({short})</span></span>
                      {language === code && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* DARK / LIGHT TOGGLE — sits with the other appearance controls
                (language, account) rather than floating over the page. */}
            <div className="flex items-center pl-0.5 pr-1">
              <ThemeSwitch
                isDark={isDark}
                onToggle={toggleDark}
                theme={THEME}
                label={isDark ? copy('switch_to_light') : copy('switch_to_dark')}
              />
            </div>

            {/* ACCOUNT DROPDOWN */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setShowAccountMenu((v) => !v); setShowLocation(false); setShowLangMenu(false); }}
                aria-haspopup="menu"
                aria-expanded={showAccountMenu}
                className="mm-hover flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition"
                style={{ backgroundColor: showAccountMenu ? THEME.hover : undefined }}
              >
                {/* Signed-in shoppers get their initial; guests get the icon. */}
                {shopperFirstName ? (
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black text-white"
                    style={{ backgroundColor: THEME.brand }}
                    aria-hidden="true"
                  >
                    {shopperFirstName.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <User className="h-[18px] w-[18px]" style={{ color: THEME.ink }} />
                )}
                <span className="flex flex-col whitespace-nowrap leading-tight">
                  <span className="max-w-[92px] truncate text-[10px]" style={{ color: THEME.inkSubtle }}>
                    {shopperFirstName
                      ? (language === 'bn' ? `হ্যালো, ${shopperFirstName}` : `Hi, ${shopperFirstName}`)
                      : copy('hi_sign_in')}
                  </span>
                  <span className="flex items-center gap-1 text-[12px] font-bold" style={{ color: THEME.ink }}>
                    {copy('account')}
                    <ChevronDown
                      className={`h-3 w-3 transition-transform ${showAccountMenu ? 'rotate-180' : ''}`}
                      style={{ color: THEME.inkSubtle }}
                    />
                  </span>
                </span>
              </button>
              {showAccountMenu && (
                <div
                  role="menu"
                  aria-label={copy('account_menu')}
                  className="absolute right-0 top-full z-50 mt-2 w-[268px] overflow-hidden rounded-xl border"
                  style={{ borderColor: THEME.line, backgroundColor: THEME.surface, boxShadow: THEME.shadow }}
                >
                  {/* Header — the Noon pattern: a greeting block that either
                      welcomes the shopper by name or invites them to sign in. */}
                  <div className="border-b px-3.5 py-3" style={{ borderColor: THEME.line }}>
                    {shopperFirstName ? (
                      <>
                        <div className="truncate text-[13px] font-black" style={{ color: THEME.ink }}>
                          {language === 'bn' ? `হ্যালো, ${shopperFirstName}` : `Hi, ${shopperFirstName}`}
                        </div>
                        {shopper?.email && (
                          <div className="mt-0.5 truncate text-[11px]" style={{ color: THEME.inkMuted }} lang="en">{shopper.email}</div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="text-[13px] font-black" style={{ color: THEME.ink }}>{copy('welcome_zid')}</div>
                        <div className="mt-0.5 text-[11px]" style={{ color: THEME.inkMuted }}>{copy('sign_in_desc')}</div>
                      </>
                    )}
                    <div className="mt-2.5">
                      {shopperFirstName ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setShowAccountMenu(false); onOpenCustomerAccount?.('profile'); }}
                          className="mm-hover flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-lg border text-[12px] font-black transition"
                          style={{ borderColor: THEME.brand, color: THEME.brand }}
                        >
                          <User className="h-3.5 w-3.5" /> {copy('account_overview')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => { setShowAccountMenu(false); (onOpenSignIn || onOpenAccount)?.(); }}
                          className="flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-lg text-[12px] font-black text-white transition hover:brightness-110"
                          style={{ backgroundColor: THEME.brand }}
                        >
                          {copy('sign_in_menu')}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Menu rows — one per account area, each deep-linking. */}
                  <div className="py-1">
                    {([
                      { key: 'orders', label: copy('my_orders'), Icon: Receipt, section: 'orders' as const },
                      { key: 'returns', label: copy('returns'), Icon: RotateCcw, section: 'returns' as const },
                      { key: 'addresses', label: copy('addresses'), Icon: MapPin, section: 'addresses' as const },
                      { key: 'profile', label: copy('profile_menu'), Icon: User, section: 'profile' as const },
                    ]).map(({ key, label, Icon, section }) => (
                      <button
                        key={key}
                        type="button"
                        role="menuitem"
                        onClick={() => { setShowAccountMenu(false); onOpenCustomerAccount?.(section); }}
                        className="mm-hover flex min-h-[38px] w-full items-center gap-2.5 px-3.5 text-left text-[12.5px] transition"
                        style={{ color: THEME.inkMuted }}
                      >
                        <Icon className="h-4 w-4 shrink-0" style={{ color: THEME.inkSubtle }} />
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: THEME.inkSubtle }} />
                      </button>
                    ))}

                    {/* Wishlist opens the in-page drawer — it is marketplace
                        state, not a storefront page — and carries its count. */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setShowAccountMenu(false); setShowWishlist(true); }}
                      className="mm-hover flex min-h-[38px] w-full items-center gap-2.5 px-3.5 text-left text-[12.5px] transition"
                      style={{ color: THEME.inkMuted }}
                    >
                      <Heart className="h-4 w-4 shrink-0" style={{ color: THEME.inkSubtle }} />
                      <span className="min-w-0 flex-1 truncate">{copy('wishlist')}</span>
                      {wishlist.count > 0 && (
                        <span className="rounded-full px-1.5 text-[10px] font-black" style={{ backgroundColor: THEME.brandTint, color: THEME.brand }}>
                          {wishlist.count}
                        </span>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" style={{ color: THEME.inkSubtle }} />
                    </button>
                  </div>

                  {/* Footer — sell CTA, then sign out / sign in. */}
                  <div className="border-t" style={{ borderColor: THEME.line }}>
                    {onGoToPlans && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => { setShowAccountMenu(false); onGoToPlans(); }}
                        className="mm-hover flex min-h-[38px] w-full items-center gap-2.5 px-3.5 text-left text-[12.5px] transition"
                        style={{ color: THEME.inkMuted }}
                      >
                        <Store className="h-4 w-4 shrink-0" style={{ color: THEME.inkSubtle }} />
                        <span className="min-w-0 flex-1 truncate">{copy('sell_on_zid')}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setShowAccountMenu(false); (shopperFirstName ? onOpenCustomerAccount?.('profile') : (onOpenSignIn || onOpenAccount))?.(); }}
                      className="flex min-h-[38px] w-full items-center gap-2.5 px-3.5 text-left text-[12.5px] font-bold text-rose-600 transition hover:bg-rose-50"
                    >
                      <LogOut className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">
                        {shopperFirstName ? copy('sign_out') : copy('sign_in_menu')}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ORDERS — always the customer order history, never the merchant
                dashboard (`onOpenAccount`). Signed out, the page itself shows
                its own sign-in prompt. */}
            <button
              type="button"
              onClick={() => onOpenCustomerAccount?.('orders')}
              className="mm-hover flex items-center gap-1.5 rounded-lg px-2.5 py-2 transition"
              title={copy('track_orders')}
            >
              <Receipt className="h-[18px] w-[18px]" style={{ color: THEME.ink }} />
              <span className="hidden text-[12px] font-bold xl:inline" style={{ color: THEME.ink }}>{copy('orders')}</span>
            </button>

            {/* WISHLIST */}
            <button
              type="button"
              onClick={() => setShowWishlist(true)}
              className="mm-hover relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 transition"
              aria-label={`${copy('wishlist')}, ${wishlist.count}`}
              title={copy('wishlist')}
            >
              <div className="relative">
                <Heart className="h-[18px] w-[18px]" style={{ color: THEME.ink }} />
                {wishlist.count > 0 && (
                  <span
                    className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-black text-white"
                    style={{ backgroundColor: THEME.danger }}
                  >
                    {wishlist.count > 99 ? '99+' : wishlist.count}
                  </span>
                )}
              </div>
              <span className="hidden text-[12px] font-bold xl:inline" style={{ color: THEME.ink }}>{copy('wishlist')}</span>
            </button>

            {/* CART */}
            <button
              type="button"
              onClick={() => setShowBasket(true)}
              className="mm-hover relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition"
              aria-label={`Cart, ${basket.itemCount} items`}
            >
              <div className="relative">
                <ShoppingBasket className="h-[22px] w-[22px]" style={{ color: THEME.ink }} />
                <span
                  className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-black text-white"
                  style={{ backgroundColor: THEME.accent }}
                >
                  {basket.itemCount > 99 ? '99+' : basket.itemCount}
                </span>
              </div>
              {/* `whitespace-nowrap` on both lines: the subtitle "৳0" and the
                  label "Cart" were wrapping onto each other's lines in the
                  two-line stack, rendering as "Cart" over a stacked "৳ / 0". */}
              <span className="hidden flex-col leading-tight xl:flex">
                <span className="whitespace-nowrap text-[10px]" style={{ color: THEME.inkSubtle }}>{copy('cart')}</span>
                <span className="whitespace-nowrap text-[12px] font-bold tabular-nums" style={{ color: THEME.ink }}>
                  {bdt(basket.subtotal)}
                </span>
              </span>
            </button>
          </div>
        </div>

        {/* ═════════ CATEGORY RAIL (swipeable on mobile) ═══════════════
            A single horizontally-scrolling strip that reaches the thumb.
            `snap-x` gives each chip a landing point, and `overscroll-x-contain`
            stops a horizontal swipe at the end of the rail from triggering the
            browser's back-navigation gesture. */}
        <nav
          // `relative` anchors the absolutely-positioned mega-menu panel to the
          // rail rather than to an individual (horizontally-scrolled) chip.
          className="relative border-t"
          style={{ borderColor: THEME.line, backgroundColor: THEME.surface }}
          aria-label="Marketplace categories"
          onMouseLeave={scheduleCloseMegaMenu}
        >
          <div className="mx-auto flex max-w-[1400px] items-center px-2 lg:px-4">
          {/* Scrollable category list. Promo pills are a SIBLING, not a child, so
              they stay pinned to the right edge instead of scrolling away with
              the categories on a narrow desktop. */}
          <div className="flex min-w-0 flex-1 snap-x snap-mandatory items-center gap-1.5 overflow-x-auto overscroll-x-contain py-2 [scrollbar-width:none] lg:gap-0.5 lg:py-0 [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => { setOpenMenu(null); setActiveSub(undefined); setFilter({ category: undefined, subCategory: undefined }); }}
              // 44px tap height on mobile, compact on desktop.
              className="mm-hover flex min-h-[36px] shrink-0 snap-start items-center whitespace-nowrap rounded-full px-3.5 text-[12px] font-bold transition lg:min-h-0 lg:rounded-md lg:px-2.5 lg:py-1.5"
              style={!filters.category
                ? { backgroundColor: THEME.brand, color: '#fff' }
                : { backgroundColor: THEME.chip, color: THEME.inkMuted }}
            >
              {copy('all_categories')}
            </button>
            {allCategories.rail.map((cat) => {
              const tree = menuTreeByName.get(cat.name.toLowerCase());
              const isOpen = openMenu === cat.name;
              const isActive = filters.category === cat.name;
              return (
                <div
                  key={cat.name}
                  className="shrink-0 snap-start"
                  onMouseEnter={() => {
                    // Only primaries with children open a panel; hovering a flat
                    // chip closes whatever was open, matching Noon's behaviour.
                    if (tree && tree.children.length > 0) openMegaMenu(cat.name);
                    else setOpenMenu(null);
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      // Touch devices have no hover: the first tap opens the panel,
                      // a second tap (or “Shop all”) applies the filter.
                      if (tree && tree.children.length > 0 && !isOpen && !isTouchDevice()) {
                        selectPrimaryCategory(cat.name);
                      } else if (tree && tree.children.length > 0 && !isOpen) {
                        openMegaMenu(cat.name);
                      } else {
                        selectPrimaryCategory(isActive ? '' : cat.name);
                      }
                    }}
                    onFocus={() => {
                      if (tree && tree.children.length > 0) openMegaMenu(cat.name);
                    }}
                    aria-haspopup={tree && tree.children.length > 0 ? 'menu' : undefined}
                    aria-expanded={tree && tree.children.length > 0 ? isOpen : undefined}
                    className="mm-hover flex min-h-[36px] items-center gap-1 whitespace-nowrap rounded-full px-3.5 text-[12px] font-semibold transition lg:min-h-0 lg:rounded-md lg:px-2.5 lg:py-1.5"
                    style={isActive || isOpen
                      ? { backgroundColor: isActive ? THEME.brand : THEME.brandTint, color: isActive ? '#fff' : THEME.brand }
                      : { backgroundColor: THEME.chip, color: THEME.inkMuted }}
                  >
                    {/* Category artwork from Marketplace Studio. Shown only from
                        `lg` up: on a phone the circular `sm` thumb would eat the
                        chip and push a usable number of categories off-screen. */}
                    {(cat as any).image ? (
                      <SafeImage
                        src={(cat as any).image}
                        alt=""
                        className="mr-1 hidden h-4 w-4 shrink-0 rounded-full object-cover sm:inline-block"
                      />
                    ) : null}
                    {displayCategory(cat.name, language)}
                    {tree && tree.children.length > 0 && (
                      <ChevronDown className={`hidden h-3 w-3 transition-transform lg:block ${isOpen ? 'rotate-180' : ''}`} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* ── PINNED PROMO PILLS (desktop only) ──
              On a phone these would leave no room for the categories, which are
              the primary navigation. The same actions stay reachable from the
              drawer and the filter sheet. */}
          <div className="ml-2 hidden shrink-0 items-center gap-1.5 border-l pl-3 lg:flex" style={{ borderColor: THEME.line }}>
            <button
              type="button"
              onClick={() => setDealsOnly((v) => !v)}
              aria-pressed={dealsOnly}
              className="flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[11.5px] font-bold transition hover:brightness-105"
              style={dealsOnly
                ? { backgroundColor: '#e11d48', color: '#fff' }
                : { backgroundColor: isDark ? 'rgba(225,29,72,0.16)' : '#fff1f2', color: isDark ? '#fda4af' : '#e11d48' }}
            >
              <Flame className="h-3.5 w-3.5" /> {copy('deals_tab')}
            </button>
            <button
              type="button"
              onClick={() => setFilter({ sort: 'newest' })}
              className="flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[11.5px] font-bold transition hover:brightness-105"
              style={{
                backgroundColor: isDark ? 'rgba(16,185,129,0.16)' : '#ecfdf5',
                color: isDark ? '#6ee7b7' : '#047857',
              }}
            >
              <Sparkles className="h-3.5 w-3.5" /> {copy('new_in_tab')}
            </button>
            <button
              type="button"
              onClick={onOpenAccount}
              className="flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[11.5px] font-black text-white transition hover:brightness-110"
              style={{ background: `linear-gradient(135deg, ${THEME.brand} 0%, #8b5cf6 100%)` }}
            >
              <Truck className="h-3.5 w-3.5" /> {copy('free_delivery_tab')}
            </button>
          </div>
          </div>

          {/* ═════════ MEGA-MENU PANEL ═════════
              Desktop only: on a phone the category drawer already lists every
              sub-category, and a hover panel would fight the sticky header. */}
          {openMenu && menuTreeByName.get(openMenu.toLowerCase()) && (
            <div className="hidden lg:block" onMouseEnter={() => openMegaMenu(openMenu)}>
              <MegaMenuPanel
                node={menuTreeByName.get(openMenu.toLowerCase())!}
                counts={categoryCounts}
                onSelectSub={selectSubCategory}
                onSelectPrimary={selectPrimaryCategory}
                onClose={scheduleCloseMegaMenu}
                lang={language}
                theme={THEME}
              />
            </div>
          )}
        </nav>
      </header>

      {/* `pb-28` on mobile reserves room for the sticky cart bar so the last
          product row is never hidden behind it; reset once the bar is hidden
          at `lg`. */}
      {/* `w-full` + `min-w-0` are REQUIRED here.
          The parent is a column flex container, so `main` is a flex item. With
          `mx-auto` and a `max-w` it becomes shrink-to-fit, and a flex item
          refuses to shrink below its MIN-CONTENT width — which the carousel’s
          fixed-width inner block made 636px. On a 390px phone that rendered a
          660px-wide main padded to the left, with the 2-up grid computing
          313px columns. `w-full` pins it to the container and `min-w-0` lets
          it shrink. */}
      <main className={`mx-auto w-full min-w-0 max-w-[1400px] px-3 py-3 sm:px-5 sm:py-4 lg:px-6 lg:py-6 ${basket.itemCount > 0 ? 'pb-28' : 'pb-8'} lg:pb-10`}>
        {/* ═════════ HERO CAROUSEL ═════════ */}
        <HeroCarousel slides={slides} onCta={handleHeroCta} lang={language} />

        {/* ═════════ TRUST STRIP ═════════
            One card holding four EQUAL segments rather than four separate boxes:
            the dividers land on exact quarter points, which is what makes a
            benefits bar read as deliberate across the full width instead of as
            four tiles that happen to be side by side.

            Mobile keeps a 2x2 grid — a 4-across row on a 390px screen leaves
            ~85px per cell, which truncates every label to "Nationwi…". */}
        <div
          className="mt-3 grid grid-cols-2 divide-x divide-y overflow-hidden rounded-2xl border sm:mt-4 sm:grid-cols-4 sm:divide-y-0"
          style={{ borderColor: THEME.line, backgroundColor: THEME.surface }}
        >
          {[
            {
              icon: TruckIcon,
              title: language === 'bn' ? 'সারাদেশে ডেলিভারি' : 'Nationwide delivery',
              sub: language === 'bn' ? 'সব ৬৪ জেলা' : 'All 64 districts',
            },
            {
              icon: ShieldCheck,
              title: language === 'bn' ? 'যাচাইকৃত সেলার' : 'Verified sellers',
              sub: language === 'bn'
                ? `${data?.vendors.length ?? 0}টি সক্রিয় স্টোর`
                : `${data?.vendors.length ?? 0} active stores`,
            },
            {
              icon: RotateCcw,
              title: language === 'bn' ? '৭ দিনে রিটার্ন' : '7-day returns',
              sub: language === 'bn' ? 'ক্ষতিগ্রস্ত পণ্যে' : 'On damaged items',
            },
            {
              icon: BadgePercent,
              title: language === 'bn' ? 'ক্যাশ অন ডেলিভারি' : 'Cash on delivery',
              sub: language === 'bn' ? 'পণ্য হাতে পেয়ে টাকা দিন' : 'Pay when it arrives',
            },
          ].map((item) => (
            <div
              key={item.title}
              // Every cell is icon-then-text, left-aligned with the SAME internal
              // rhythm, so the four icons line up on one vertical grid across the
              // strip. Centring each pair individually (the previous treatment)
              // started every icon at a different x-offset, because the labels
              // differ in length — that is what made the bar look untidy.
              //
              // A 390px phone gives each cell 182px; icon (32) + gap (8) + padding
              // (20) leaves ~122px, so "Nationwide delivery" at 11px (102px needed)
              // fits without truncating.
              className="flex min-h-[64px] items-center gap-2 px-2.5 py-3 sm:gap-3 sm:px-4"
              style={{ borderColor: THEME.line }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10"
                style={{ backgroundColor: THEME.brandTint }}
              >
                <item.icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" style={{ color: THEME.brand }} />
              </span>
              <div className="min-w-0 text-left">
                <div className="text-[11px] font-bold leading-tight sm:text-[11.5px]" style={{ color: THEME.ink }}>
                  {item.title}
                </div>
                <div className="mt-0.5 text-[10px] leading-tight sm:text-[10.5px]" style={{ color: THEME.inkMuted }}>
                  {item.sub}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ═════════ SHOP BY CATEGORY (desktop only) ═════════
            Mobile already has the swipeable chip rail in the sticky header, so
            repeating tiles here would push the products below the fold. */}
        {topCategories.length > 0 && (
          <section className="mt-7 hidden lg:block">
            <div className="mb-3.5 flex items-baseline justify-between gap-3">
              <h2 className="text-[16px] font-black tracking-[-0.015em]" style={{ color: THEME.ink }}>{copy('shop_by_category')}</h2>
              {filters.category && (
                <button
                  type="button"
                  onClick={() => setFilter({ category: undefined })}
                  className="mm-hover rounded-md px-2 py-1 text-[11.5px] font-bold transition"
                  style={{ color: THEME.brand }}
                >
                  Clear
                </button>
              )}
            </div>
            {/* Tiles distribute the available width evenly and cap at 240px.
                The tile owns its own `flex-1`/`max-w`; forcing `flex-1` from the
                parent as well made the cap lose and a 2-category row blew each
                tile out to ~500px. `justify-start` keeps them flush-left when
                they hit the cap. `gap-3` (not `gap-2`) is what separates the
                circles optically, and the vertical padding stops the hover
                shadow being clipped by the scroll box. */}
            <div className="flex justify-start gap-3 overflow-x-auto px-0.5 pb-2 pt-0.5 [scrollbar-width:thin]">
              {topCategories.map((cat) => (
                <CategoryTile
                  key={cat.name}
                  name={cat.name}
                  count={cat.product_count}
                  emoji={(cat as any).emoji || categoryEmoji(cat.name)}
                  image={(cat as any).image}
                  lang={language}
                  theme={THEME}
                  active={filters.category === cat.name}
                  onClick={() => setFilter({ category: filters.category === cat.name ? undefined : cat.name })}
                />
              ))}
            </div>
          </section>
        )}

        {/* ═════════ FEATURED PICKS ═════════
            Products the Super Admin pinned in Marketplace Studio → Featured & Deals
            (plus products from the vendors they highlighted). Rendered as a
            horizontal rail so it never competes with the main grid for width. */}
        {featuredList.length > 0 && (
          <section className="mt-7">
            <div className="mb-3.5 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[16px] font-black tracking-[-0.015em]" style={{ color: THEME.ink }}>
                  {featuredConfig?.featuredTitle || copy('featured_picks')}
                </h2>
                {featuredConfig?.featuredSubtitle && (
                  <p className="mt-0.5 truncate text-[11.5px]" style={{ color: THEME.inkMuted }}>{featuredConfig.featuredSubtitle}</p>
                )}
              </div>
            </div>
            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {featuredList.map((product) => (
                <div key={`feat-${product.id}`} className="w-[172px] shrink-0 snap-start sm:w-[196px]">
                  <ProductCard
                    product={product}
                    onAdd={handleAdd}
                    onVisitVendor={onVisitVendor}
                    onOpenProduct={setActiveProduct}
                    isWishlisted={wishlist.has(String(product.id), (product as any).vendor_id)}
                    onToggleWishlist={handleToggleWishlist}
                    lang={language}
                    theme={THEME}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ═════════ TODAY’S BEST DEALS ═════════
            Auto-aggregated from the biggest live discounts across every active
            seller. The heading and the on/off switch come from the admin panel;
            when disabled this block disappears entirely. */}
        {dealsList.length > 0 && (
          <section className="mt-7">
            <div className="mb-3.5 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-1.5 text-[16px] font-black tracking-[-0.015em] text-slate-900">
                  <Flame className="h-4 w-4 text-rose-600" />
                  {featuredConfig?.dealsTitle || copy('best_deals')}
                </h2>
                {featuredConfig?.dealsSubtitle && (
                  <p className="mt-0.5 truncate text-[11.5px] text-slate-500">{featuredConfig.dealsSubtitle}</p>
                )}
              </div>
            </div>
            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {dealsList.map((product) => (
                <div key={`deal-${product.id}`} className="w-[172px] shrink-0 snap-start sm:w-[196px]">
                  <ProductCard
                    product={product}
                    onAdd={handleAdd}
                    onVisitVendor={onVisitVendor}
                    onOpenProduct={setActiveProduct}
                    isWishlisted={wishlist.has(String(product.id), (product as any).vendor_id)}
                    onToggleWishlist={handleToggleWishlist}
                    lang={language}
                    theme={THEME}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ═════════ RESULTS LAYOUT: filters · grid ═════════
            `items-start` is what removes the tall vertical gap that appeared
            when the filter rail was shorter than the results column: without
            it the grid stretches every child to the tallest row and the
            results header floated far below the first card row. */}
        <div className="mt-4 grid items-start gap-4 lg:mt-7 lg:grid-cols-[248px_1fr] lg:gap-6">
          {/* ── Advanced filter rail ── */}
          {/* The filter rail is DESKTOP ONLY — on mobile the same controls live
              in the bottom sheet, triggered by the sticky filter bar below. */}
          <aside className="hidden lg:block">
            <div className="sticky top-[150px] space-y-3">
              <div className="rounded-xl border" style={{ borderColor: THEME.line, backgroundColor: THEME.surface }}>
                <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: THEME.line }}>
                  <h3 className="flex items-center gap-1.5 text-[12px] font-black uppercase tracking-wide" style={{ color: THEME.ink }}>
                    <SlidersHorizontal className="h-3.5 w-3.5" /> {copy('filters')}
                  </h3>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-[10px] font-bold hover:underline"
                      style={{ color: THEME.danger }}
                    >
                      {copy('clear_all')}
                    </button>
                  )}
                </div>

                {/* Category */}
                <div className="border-b px-3 py-3" style={{ borderColor: THEME.line }}>
                  <div className="mb-2 text-[11px] font-black uppercase tracking-wide" style={{ color: THEME.inkMuted }}>{copy('categories')}</div>
                  <div className="max-h-52 space-y-0.5 overflow-y-auto pr-1">
                    {(data?.categories || []).map((cat) => {
                      const active = filters.category === cat.name;
                      return (
                        <button
                          key={cat.name}
                          type="button"
                          onClick={() => setFilter({ category: active ? undefined : cat.name })}
                          className={`mm-hover flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[12px] transition ${
                            active ? 'font-bold' : ''
                          }`}
                          style={active ? { backgroundColor: THEME.brandTint, color: THEME.brand } : { color: THEME.inkMuted }}
                        >
                          <span
                            className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border"
                            style={{
                              borderColor: active ? 'transparent' : THEME.inkSubtle,
                              backgroundColor: active ? THEME.brand : undefined,
                            }}
                          >
                            {active && <Check className="h-2.5 w-2.5 text-white" />}
                          </span>
                          {/* The count is one template string — "Fashion (12)" —
                              so the SPACE is part of the text itself, not just
                              a CSS margin. Adjacent nodes previously produced
                              "Fashion(2)" in the accessibility tree and any
                              copy/screen-reader use. */}
                          <span className="min-w-0 flex-1 truncate">
                            {`${displayCategory(cat.name, language)} (${cat.product_count})`}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Sub-categories of the selected primary, so the same
                      narrowing is reachable without the mega-menu. */}
                  {(() => {
                    const tree = filters.category
                      ? menuTreeByName.get(filters.category.toLowerCase())
                      : undefined;
                    if (!tree || tree.children.length === 0) return null;
                    return (
                      <div className="mt-2 border-t pt-2" style={{ borderColor: THEME.line }}>
                        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          {language === 'bn' ? `${displayCategory(tree.name, 'bn')} উপ-ক্যাটাগরি` : `${tree.name} sub-categories`}
                        </div>
                        <div className="max-h-44 space-y-0.5 overflow-y-auto pr-1">
                          {tree.children.map((sub) => {
                            const selected = activeSub === sub.name;
                            return (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => {
                                  if (selected) { setActiveSub(undefined); setFilter({ subCategory: undefined }); }
                                  else selectSubCategory(tree.name, sub.name);
                                }}
                                className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[11.5px] transition ${
                                  selected ? 'font-bold' : 'text-slate-500 hover:bg-slate-50'
                                }`}
                                style={selected ? { backgroundColor: '#eef0ff', color: THEME.brand } : undefined}
                              >
                                <span className="min-w-0 flex-1 truncate">{sub.name}</span>
                                {selected && <Check className="h-3 w-3 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Price */}
                <div className="border-b px-3 py-3" style={{ borderColor: THEME.line }}>
                  <div className="mb-2 text-[11px] font-black uppercase tracking-wide" style={{ color: THEME.inkMuted }}>{copy('price')}</div>
                  <div className="space-y-0.5">
                    {PRICE_BANDS.map((band, idx) => {
                      const active = priceBandIndex === idx;
                      return (
                        <button
                          key={band.label}
                          type="button"
                          onClick={() => setFilter({ minPrice: band.min, maxPrice: band.max })}
                          className={`mm-hover flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[12px] transition ${
                            active ? 'font-bold' : ''
                          }`}
                          style={active ? { backgroundColor: THEME.brandTint, color: THEME.brand } : { color: THEME.inkMuted }}
                        >
                          <span
                            className="h-3.5 w-3.5 shrink-0 rounded-full border-2"
                            style={{
                              borderColor: active ? THEME.brand : THEME.inkSubtle,
                              backgroundColor: active ? THEME.brand : 'transparent',
                            }}
                          />
                          {language === 'bn' ? band.labelBn : band.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      value={filters.minPrice ?? ''}
                      onChange={(e) => setFilter({ minPrice: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder="Min ৳"
                      aria-label={language === 'bn' ? 'সর্বনিম্ন দাম' : 'Minimum price'}
                      className="w-full rounded-md border bg-transparent px-2 py-1.5 text-[11px] focus:outline-none"
                      style={{ borderColor: THEME.line, color: THEME.ink }}
                    />
                    <span style={{ color: THEME.inkSubtle }}>–</span>
                    <input
                      type="number"
                      min={0}
                      value={filters.maxPrice ?? ''}
                      onChange={(e) => setFilter({ maxPrice: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder="Max ৳"
                      aria-label={language === 'bn' ? 'সর্বোচ্চ দাম' : 'Maximum price'}
                      className="w-full rounded-md border bg-transparent px-2 py-1.5 text-[11px] focus:outline-none"
                      style={{ borderColor: THEME.line, color: THEME.ink }}
                    />
                  </div>
                </div>

                {/* Vendor */}
                <div className="px-3 py-3">
                  <div className="mb-2 text-[11px] font-black uppercase tracking-wide" style={{ color: THEME.inkMuted }}>{copy('vendors')}</div>
                  {filters.vendor && (
                    <button
                      type="button"
                      onClick={() => setFilter({ vendor: undefined })}
                      className="mb-1.5 flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-[11px] font-bold"
                      style={{ borderColor: 'rgba(225,29,72,0.35)', backgroundColor: 'rgba(225,29,72,0.10)', color: THEME.danger }}
                    >
                      <span className="truncate">{activeVendor?.vendor_name || filters.vendor}</span>
                      <X className="h-3 w-3 shrink-0" />
                    </button>
                  )}
                  <div className="relative mb-1.5">
                    <Store className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2" style={{ color: THEME.inkSubtle }} />
                    <input
                      value={vendorQuery}
                      onChange={(e) => setVendorQuery(e.target.value)}
                      placeholder={language === 'bn' ? 'সেলার খুঁজুন…' : 'Find a seller…'}
                      aria-label="Filter by vendor"
                      className="w-full rounded-md border bg-transparent py-1.5 pr-2 text-[11px] focus:outline-none"
                      style={{ borderColor: THEME.line, paddingLeft: '1.6rem', color: THEME.ink }}
                    />
                  </div>
                  <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
                    {vendorFacets.map((vendor) => {
                      const active = filters.vendor === vendor.vendor_id;
                      return (
                        <button
                          key={vendor.vendor_id}
                          type="button"
                          onClick={() => setFilter({ vendor: active ? undefined : vendor.vendor_id })}
                          className={`mm-hover flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[12px] transition ${
                            active ? 'font-bold' : ''
                          }`}
                          style={active ? { backgroundColor: THEME.brandTint, color: THEME.brand } : { color: THEME.inkMuted }}
                        >
                          <span
                            className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border"
                            style={{
                              borderColor: active ? 'transparent' : THEME.inkSubtle,
                              backgroundColor: active ? THEME.brand : undefined,
                            }}
                          >
                            {active && <Check className="h-2.5 w-2.5 text-white" />}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {`${vendor.vendor_name} (${vendor.product_count})`}
                          </span>
                        </button>
                      );
                    })}
                    {vendorFacets.length === 0 && (
                      <div className="px-1.5 py-1 text-[11px]" style={{ color: THEME.inkSubtle }}>No sellers match.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Platform promo card */}
              <div
                className="rounded-xl p-3 text-white"
                style={{ background: `linear-gradient(135deg, ${THEME.brand} 0%, #8b5cf6 100%)` }}
              >
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">
                  {language === 'bn' ? 'সেলার হোন' : 'Become a seller'}
                </div>
                <p className="mt-1 text-[12px] font-semibold leading-snug">
                  {language === 'bn'
                    ? 'আপনার নিজের ZID স্টোরফ্রন্ট দিয়ে হাজারো ক্রেতার কাছে পৌঁছান।'
                    : 'Reach thousands of shoppers with your own ZID storefront.'}
                </p>
                {onGoToPlans && (
                  <button
                    type="button"
                    onClick={onGoToPlans}
                    className="mt-2 rounded-md px-2.5 py-1.5 text-[11px] font-black text-slate-900"
                    style={{ backgroundColor: THEME.accent }}
                  >
                    {language === 'bn' ? 'প্ল্যান দেখুন' : 'View plans'}
                  </button>
                )}
              </div>
            </div>
          </aside>

          {/* ── Results column ── */}
          <section className="min-w-0">
            {/* ═════ MOBILE STICKY FILTER / SORT BAR ═════
                Sits directly under the sticky header so it is always reachable
                with one thumb. Both controls open a BOTTOM SHEET — no dropdown
                navigation escapes off-screen on a small phone. */}
            <div
              className="sticky top-[112px] z-30 -mx-1 mb-2 flex items-stretch gap-2 rounded-xl border px-2 py-1.5 backdrop-blur lg:hidden"
              style={{ borderColor: THEME.line, backgroundColor: isDark ? 'rgba(22,24,41,0.92)' : 'rgba(255,255,255,0.95)' }}
            >
              <button
                type="button"
                onClick={() => setShowFilterSheet(true)}
                className="relative flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border text-[12.5px] font-bold active:opacity-80"
                style={{ borderColor: THEME.line, color: THEME.ink }}
                aria-haspopup="dialog"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {copy('filters')}
                {activeFilterCount > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-black text-white" style={{ backgroundColor: THEME.brand }}>
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowFilterSheet(true)}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border text-[12.5px] font-bold active:opacity-80"
                style={{ borderColor: THEME.line, color: THEME.ink }}
                aria-haspopup="dialog"
              >
                <ArrowUpDown className="h-4 w-4" />
                {copy('sort_label')}
              </button>
            </div>

            {/* Results toolbar (desktop) */}
            <div
              className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2"
              style={{ borderColor: THEME.line, backgroundColor: THEME.surface }}
            >
              <div className="min-w-0">
                <h1 className="truncate text-[14px] font-black tracking-tight sm:text-[15px]" style={{ color: THEME.ink }}>
                  {filters.q
                    ? copy('results_for', { q: filters.q })
                    : dealsOnly
                      ? copy('best_deals')
                      : activeSub
                        ? `${displayCategory(filters.category, language)} › ${displayCategory(activeSub || '', language)}`
                        : filters.category
                          ? displayCategory(filters.category, language)
                          : copy('marketplace_title')}
                </h1>
                <p className="text-[11px]" style={{ color: THEME.inkMuted }}>
                  {loading
                    ? copy('loading')
                    : language === 'bn'
                      ? `${data?.total ?? 0}টি পণ্য · ${data?.vendors.length ?? 0}টি সেলার`
                      : `${data?.total ?? 0} products · ${data?.vendors.length ?? 0} sellers`}
                  {activeVendor ? ` · ${activeVendor.vendor_name}` : ''}
                </p>
              </div>

              <div className="hidden items-center gap-1.5 lg:flex">
                <label className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5" style={{ borderColor: THEME.line }}>
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: THEME.inkSubtle }}>{copy('sort_by')}</span>
                  <select
                    value={filters.sort}
                    onChange={(e) => setFilter({ sort: e.target.value as MarketplaceSortValue })}
                    aria-label="Sort products"
                    className="bg-transparent text-[11px] font-bold focus:outline-none"
                    style={{ color: THEME.ink }}
                  >
                    {SORTS.map((s) => (
                      <option key={s.value} value={s.value}>{language === 'bn' ? s.labelBn : s.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                {filters.q && (
                  <Chip theme={THEME} label={`“${filters.q}”`} onRemove={() => { setSearchInput(''); setFilter({ q: undefined }); }} />
                )}
                {filters.category && (
                  <Chip
                    theme={THEME}
                    label={activeSub ? `${filters.category} › ${activeSub}` : filters.category}
                    onRemove={() => { setActiveSub(undefined); setFilter({ category: undefined, subCategory: undefined }); }}
                  />
                )}
                {(filters.minPrice != null || filters.maxPrice != null) && (
                  <Chip
                    theme={THEME}
                    label={`৳${filters.minPrice ?? 0} – ${filters.maxPrice != null ? bdt(filters.maxPrice) : '∞'}`}
                    onRemove={() => setFilter({ minPrice: null, maxPrice: null })}
                  />
                )}
                {activeVendor && <Chip theme={THEME} label={activeVendor.vendor_name} onRemove={() => setFilter({ vendor: undefined })} />}
                {dealsOnly && <Chip theme={THEME} label="Deals only" onRemove={() => setDealsOnly(false)} />}
              </div>
            )}

            {error && (
              <div
                className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[12px]"
                style={{
                  borderColor: isDark ? 'rgba(251,191,36,0.3)' : '#fde68a',
                  backgroundColor: isDark ? 'rgba(251,191,36,0.10)' : '#fffbeb',
                  color: THEME.warningFg,
                }}
              >
                <span>
                  <b>Products are temporarily unavailable.</b> {error}
                </span>
                <button
                  type="button"
                  onClick={() => setFilter({})}
                  className="rounded-md border px-2 py-1 text-[11px] font-bold"
                  style={{ borderColor: THEME.warningFg, backgroundColor: THEME.surface, color: THEME.warningFg }}
                >
                  Try again
                </button>
              </div>
            )}

            {/* Product grid */}
            {loading && products.length === 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4 2xl:grid-cols-5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="overflow-hidden rounded-xl border" style={{ borderColor: THEME.line, backgroundColor: THEME.surface }}>
                    <div className="aspect-square animate-pulse" style={{ backgroundColor: THEME.skeleton }} />
                    <div className="space-y-2 p-3">
                      <div className="h-2.5 w-4/5 animate-pulse rounded" style={{ backgroundColor: THEME.skeleton }} />
                      <div className="h-2.5 w-2/5 animate-pulse rounded" style={{ backgroundColor: THEME.skeleton }} />
                      <div className="h-6 w-full animate-pulse rounded" style={{ backgroundColor: THEME.skeleton }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-xl border py-16 text-center" style={{ borderColor: THEME.line, backgroundColor: THEME.surface }}>
                <LayoutGrid className="mx-auto mb-3 h-9 w-9" style={{ color: THEME.inkSubtle }} />
                <div className="text-[13px] font-bold" style={{ color: THEME.ink }}>No products match these filters</div>
                <div className="mt-1 text-[11px]" style={{ color: THEME.inkMuted }}>Try a wider price range or another category.</div>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="mt-4 rounded-lg px-4 py-2 text-[12px] font-black text-white"
                    style={{ backgroundColor: THEME.brand }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* 2-up on phones, 3 on tablets, 4 (5 on very wide) on desktop. */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4 2xl:grid-cols-5">
                  {products.map((product) => (
                    <ProductCard
                      key={String(product.id)}
                      product={product}
                      onAdd={handleAdd}
                      onVisitVendor={onVisitVendor}
                      onOpenProduct={setActiveProduct}
                      isWishlisted={wishlist.has(String(product.id), (product as any).vendor_id)}
                      onToggleWishlist={handleToggleWishlist}
                      lang={language}
                      theme={THEME}
                    />
                  ))}
                </div>

                {data && data.page < data.pages && (
                  <div className="mt-5 flex justify-center">
                    <button
                      type="button"
                      onClick={loadMore}
                      disabled={appending}
                      className="mm-hover flex items-center gap-2 rounded-xl border px-6 py-2.5 text-[12px] font-black transition disabled:opacity-60"
                      style={{ borderColor: THEME.line, backgroundColor: THEME.surface, color: THEME.ink }}
                    >
                      {appending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {copy('load_more')}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        {/* ═════════ SEO + POPULAR SEARCHES FOOTER ═════════
            Sits at the very bottom of the page (after the results grid) so it
            reads as page content rather than competing with the hero. Its
            keyword tags run the LIVE search, so every tag lands on real
            results instead of a dead anchor. */}
        <MarketplaceSeoFooter
          lang={language}
          onSearch={(query) => {
            setSearchInput(query);
            setFilter({ q: query, category: undefined, subCategory: undefined });
            setDealsOnly(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          productCount={typeof data?.total === 'number' ? data.total : undefined}
          sellerCount={data?.vendors?.length}
          onBrowseCategories={() => {
            setFilter({ category: undefined, subCategory: undefined, q: undefined });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onGoToPlans={onGoToPlans}
          theme={{
            ink: THEME.ink,
            inkMuted: THEME.inkMuted,
            inkSubtle: THEME.inkSubtle,
            line: THEME.line,
            brand: THEME.brand,
            brandTint: THEME.brandTint,
            surface: THEME.surface,
            chip: THEME.chip,
            bg: THEME.bg,
          }}
        />
      </main>

      {/* ═════════ WISHLIST DRAWER ═════════
          Same sheet mechanics as the basket, but no checkout: a wishlist is
          saved-for-later, so the only forward action is "move to basket". */}
      {showWishlist && (
        <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch" role="dialog" aria-modal="true" aria-label={copy('wishlist')}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={() => setShowWishlist(false)} />
          <aside
            className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl shadow-2xl sm:max-h-none sm:h-full sm:max-w-md sm:rounded-none"
            style={{ animation: 'mmSheetUp .24s cubic-bezier(.2,.8,.2,1)', backgroundColor: THEME.surface }}
          >
            <div className="flex justify-center pt-2 sm:hidden">
              <span className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.inkSubtle }} />
            </div>
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: THEME.line }}>
              <h2 className="flex items-center gap-2 text-[14px] font-black" style={{ color: THEME.ink }}>
                <Heart className="h-4 w-4" style={{ color: THEME.danger }} />
                Wishlist ({wishlist.count})
              </h2>
              <button
                type="button"
                onClick={() => setShowWishlist(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full active:opacity-70"
                style={{ color: THEME.inkMuted }}
                aria-label="Close wishlist"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {wishlist.items.length === 0 ? (
                <div className="py-20 text-center">
                  <Heart className="mx-auto mb-3 h-10 w-10" style={{ color: THEME.inkSubtle }} />
                  <div className="text-[13px] font-bold" style={{ color: THEME.ink }}>{copy('wishlist_empty')}</div>
                  <div className="mt-1 text-[11px]" style={{ color: THEME.inkMuted }}>
                    {copy('wishlist_empty_desc')}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {wishlist.items.map((item) => {
                    const p = item.product as any;
                    return (
                      <div key={`${item.product.id}-${p.vendor_id || ''}`} className="flex gap-2.5 rounded-lg border p-2.5" style={{ borderColor: THEME.line }}>
                        <SafeImage
                          src={p.image || p.image_url || p.imageUrl}
                          alt={productTitle(item.product, language)}
                          className="h-16 w-16 shrink-0 rounded-md border object-cover"
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="line-clamp-2 text-[11.5px] font-semibold leading-snug" style={{ color: THEME.ink }}>
                            {productTitle(item.product, language)}
                          </div>
                          <div className="mt-0.5 text-[10px]" style={{ color: THEME.inkMuted }}>{item.product.vendor_name}</div>
                          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                            <span className="text-[12px] font-black" style={{ color: THEME.ink }}>
                              {bdt(Number(item.product.priceBDT || 0))}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  basket.add(item.product, item.quantity || 1);
                                  wishlist.remove(String(item.product.id), item.product.vendor_id);
                                  toast.success(copy('move_to_cart'), { description: productTitle(item.product, language) });
                                }}
                                className="rounded-md px-2 py-1 text-[10.5px] font-black text-white"
                                style={{ backgroundColor: THEME.brand }}
                              >
                                Move to cart
                              </button>
                              <button
                                type="button"
                                onClick={() => wishlist.remove(String(item.product.id), item.product.vendor_id)}
                                className="rounded-md p-1 transition hover:opacity-70"
                                style={{ color: THEME.inkSubtle }}
                                aria-label={`${copy('remove')} ${productTitle(item.product, language)}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ═════════ BASKET DRAWER ═════════ */}
      {showBasket && (
        // Mobile: a full-height BOTTOM SHEET (slides up, thumb-friendly).
        // Desktop: the familiar right-hand drawer.
        <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch" role="dialog" aria-modal="true" aria-label={copy('basket')}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={() => setShowBasket(false)} />
          <aside
            className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl shadow-2xl sm:max-h-none sm:h-full sm:max-w-md sm:rounded-none"
            style={{ animation: 'mmSheetUp .24s cubic-bezier(.2,.8,.2,1)', backgroundColor: THEME.surface }}
          >
            {/* Grab handle (mobile only) */}
            <div className="flex justify-center pt-2 sm:hidden">
              <span className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.inkSubtle }} />
            </div>
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: THEME.line }}>
              <h2 className="flex items-center gap-2 text-[14px] font-black" style={{ color: THEME.ink }}>
                <ShoppingBasket className="h-4 w-4" style={{ color: THEME.brand }} />
                Your basket ({basket.itemCount})
              </h2>
              <button
                type="button"
                onClick={() => setShowBasket(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full active:opacity-70"
                style={{ color: THEME.inkMuted }}
                aria-label="Close basket"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {basket.lines.length === 0 ? (
                <div className="py-20 text-center">
                  <ShoppingBasket className="mx-auto mb-3 h-10 w-10" style={{ color: THEME.inkSubtle }} />
                  <div className="text-[13px] font-bold" style={{ color: THEME.ink }}>Your basket is empty</div>
                  <div className="mt-1 text-[11px]" style={{ color: THEME.inkMuted }}>Add products from any seller to get started.</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Per-vendor grouping makes the split visible BEFORE checkout */}
                  {basket.vendors.map((vendor) => (
                    <div key={vendor.vendorId} className="rounded-lg border" style={{ borderColor: THEME.line }}>
                      <div className="flex items-center justify-between border-b px-2.5 py-1.5" style={{ borderColor: THEME.line, backgroundColor: THEME.surfaceHover }}>
                        <span className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: THEME.ink }}>
                          <Store className="h-3 w-3" style={{ color: THEME.brand }} />
                          {vendor.vendorName}
                        </span>
                        <span className="text-[10px]" style={{ color: THEME.inkMuted }}>{bdt(vendor.subtotal)}</span>
                      </div>
                      <div className="divide-y" style={{ borderColor: THEME.line }}>
                        {basket.lines
                          .filter((line) => String(line.product.vendor_id || line.product.vendor_slug || 'unknown') === vendor.vendorId)
                          .map((line) => {
                            const p = line.product as any;
                            return (
                              <div key={`${vendor.vendorId}-${line.product.id}`} className="flex gap-2.5 p-2.5">
                                <SafeImage
                                  src={p.image || p.image_url || p.imageUrl}
                                  alt={productTitle(line.product, language)}
                                  className="h-14 w-14 shrink-0 rounded-md border object-cover"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="line-clamp-2 text-[11.5px] font-semibold leading-snug" style={{ color: THEME.ink }}>
                                    {productTitle(line.product, language)}
                                  </div>
                                  <div className="mt-1 flex items-center justify-between">
                                    <span className="text-[12px] font-black" style={{ color: THEME.ink }}>
                                      {bdt(Number(line.product.priceBDT || 0) * line.quantity)}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => basket.setQuantity(String(line.product.id), vendor.vendorId, line.quantity - 1)}
                                        className="mm-hover rounded border p-0.5"
                                        aria-label="Decrease quantity"
                                        style={{ borderColor: THEME.line, color: THEME.inkMuted }}
                                      >
                                        <Minus className="h-3 w-3" />
                                      </button>
                                      <span className="w-6 text-center text-[11px] font-bold" style={{ color: THEME.ink }}>{line.quantity}</span>
                                      <button
                                        type="button"
                                        onClick={() => basket.setQuantity(String(line.product.id), vendor.vendorId, line.quantity + 1)}
                                        className="mm-hover rounded border p-0.5"
                                        aria-label="Increase quantity"
                                        style={{ borderColor: THEME.line, color: THEME.inkMuted }}
                                      >
                                        <Plus className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {basket.lines.length > 0 && (
              <div className="border-t px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3" style={{ borderColor: THEME.line }}>
                {basket.vendors.length > 1 && (
                  <div className="mb-2 rounded-lg px-2.5 py-2 text-[10.5px]" style={{ backgroundColor: THEME.accentSoft, color: THEME.warningFg }}>
                    {language === 'bn'
                      ? <><b>{basket.vendors.length}টি সেলার</b> এই কার্টে — প্রত্যেকে আলাদা ট্র্যাকিং নম্বর সহ পাঠাবে।</>
                      : <><b>{basket.vendors.length} sellers</b> in this basket — each ships separately with its own tracking number.</>}
                  </div>
                )}
                <div className="mb-2 flex items-center justify-between text-[13px]">
                  <span style={{ color: THEME.inkMuted }}>{copy('subtotal')}</span>
                  <span className="text-[15px] font-black" style={{ color: THEME.ink }}>{bdt(basket.subtotal)}</span>
                </div>
                {/*
                  CHECKOUT STAYS IN THE MARKETPLACE.

                  This used to call `onCheckout(first.vendorSlug)`, which sent the
                  shopper to ONE merchant's storefront to re-enter their details
                  there — abandoning every other vendor's items in the basket.
                  The unified checkout at `/marketplace/checkout` collects one
                  address and one payment choice, then posts a single master
                  order whose lines each carry their selling vendor; the server
                  splits it into one child order per merchant.
                */}
                <button
                  type="button"
                  onClick={() => {
                    // Nothing to hand over — never navigate into an empty
                    // checkout page.
                    if (basket.itemCount === 0) return;
                    // Give every mounted consumer (badge, sticky bar, checkout)
                    // the final lines BEFORE the view swaps. The write itself
                    // is synchronous; this makes the handoff explicit so a
                    // sibling that mounted mid-navigation cannot seed its
                    // state from a stale copy.
                    window.dispatchEvent(new Event('zid:marketplace-basket'));
                    setShowBasket(false);
                    onCheckout();
                  }}
                  disabled={basket.itemCount === 0}
                  className="min-h-[48px] w-full rounded-xl text-[13px] font-black text-white disabled:opacity-50"
                  style={{ backgroundColor: THEME.brand }}
                >
                  {copy('checkout')}
                </button>
                <p className="mt-1.5 text-center text-[10px]" style={{ color: THEME.inkSubtle }}>
                  {basket.vendors.length > 1
                    ? (language === 'bn'
                      ? `একবার চেকআউটেই ${basket.vendors.length}টি সেলারের পণ্য — প্রত্যেকে আলাদাভাবে পাঠাবেন।`
                      : `One checkout for all ${basket.vendors.length} sellers — each ships separately.`)
                    : (language === 'bn'
                      ? 'মার্কেটপ্লেসেই নিরাপদে চেকআউট সম্পন্ন করুন।'
                      : 'Complete your secure checkout right here in the marketplace.')}
                </p>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* ═════════ MOBILE STICKY CART BAR ═════════
          Appears the moment the basket has an item. Fixed to the bottom edge
          with `env(safe-area-inset-bottom)` so it clears the iPhone home
          indicator, and the grid gets matching bottom padding (see `main`)
          so the last row is never hidden underneath it. */}
      {basket.itemCount > 0 && !showBasket && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"
          style={{
            borderColor: THEME.line,
            backgroundColor: isDark ? 'rgba(22,24,41,0.94)' : 'rgba(255,255,255,0.95)',
            boxShadow: isDark
              ? '0 -4px 20px -6px rgba(0,0,0,0.8)'
              : '0 -4px 20px -6px rgba(17,24,39,0.25)',
          }}
        >
          <button
            type="button"
            onClick={() => setShowBasket(true)}
            className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl px-4 text-white"
            style={{ backgroundColor: THEME.brand }}
          >
            <span className="flex items-center gap-2">
              <span className="relative">
                <ShoppingBasket className="h-5 w-5" />
                <span
                  className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[9px] font-black"
                  style={{ backgroundColor: THEME.accent, color: '#111827' }}
                >
                  {basket.itemCount > 99 ? '99+' : basket.itemCount}
                </span>
              </span>
              <span className="text-[13px] font-bold">
                {language === 'bn'
                  ? `${basket.itemCount}টি পণ্য`
                  : `${basket.itemCount} ${basket.itemCount === 1 ? 'item' : 'items'}`}
                {basket.vendors.length > 1 && (
                  <span className="ml-1 text-[11px] font-normal text-white/70">
                    {language === 'bn' ? `${basket.vendors.length}টি সেলার থেকে` : `from ${basket.vendors.length} sellers`}
                  </span>
                )}
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-[14px] font-black">
              {bdt(basket.subtotal)}
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        </div>
      )}

      {/* ═════════ MOBILE FILTER / SORT BOTTOM SHEET ═════════ */}
      {showFilterSheet && (
        <div className="fixed inset-0 z-50 flex items-end lg:hidden" role="dialog" aria-modal="true" aria-label={copy('filters')}>
          <div className="absolute inset-0" style={{ backgroundColor: THEME.overlay }} onClick={() => setShowFilterSheet(false)} />
          <div
            className="relative flex max-h-[88vh] w-full flex-col rounded-t-2xl"
            style={{ animation: 'mmSheetUp .24s cubic-bezier(.2,.8,.2,1)', backgroundColor: THEME.surface }}
          >
            {/* Grab handle */}
            <div className="flex justify-center pb-1 pt-2.5">
              <span className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.inkSubtle }} />
            </div>

            <div className="flex items-center justify-between px-4 pb-2">
              <h2 className="text-[15px] font-black" style={{ color: THEME.ink }}>Filter &amp; sort</h2>
              <button
                type="button"
                onClick={() => setShowFilterSheet(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full active:opacity-70"
                style={{ color: THEME.inkMuted }}
                aria-label="Close filters"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
              {/* Sort */}
              <section className="mb-4">
                <h3 className="mb-2 text-[11px] font-black uppercase tracking-wide" style={{ color: THEME.inkMuted }}>Sort by</h3>
                <div className="grid grid-cols-2 gap-2">
                  {SORTS.map((s) => {
                    const active = filters.sort === s.value;
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setFilter({ sort: s.value })}
                        className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg border px-3 text-left text-[12.5px] font-semibold"
                        style={{
                          borderColor: active ? THEME.brand : THEME.line,
                          backgroundColor: active ? THEME.brandTint : THEME.surface,
                          color: active ? THEME.brand : THEME.inkMuted,
                        }}
                      >
                        <span className="truncate">{language === 'bn' ? s.labelBn : s.label}</span>
                        {active && <Check className="h-4 w-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Price */}
              <section className="mb-4">
                <h3 className="mb-2 text-[11px] font-black uppercase tracking-wide" style={{ color: THEME.inkMuted }}>Price range</h3>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={filters.minPrice ?? ''}
                    onChange={(e) => setFilter({ minPrice: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="Min ৳"
                    aria-label={language === 'bn' ? 'সর্বনিম্ন দাম' : 'Minimum price'}
                    className="min-h-[44px] w-full rounded-lg border bg-transparent px-3 text-[13px] focus:outline-none"
                    style={{ borderColor: THEME.line, color: THEME.ink }}
                  />
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={filters.maxPrice ?? ''}
                    onChange={(e) => setFilter({ maxPrice: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="Max ৳"
                    aria-label={language === 'bn' ? 'সর্বোচ্চ দাম' : 'Maximum price'}
                    className="min-h-[44px] w-full rounded-lg border bg-transparent px-3 text-[13px] focus:outline-none"
                    style={{ borderColor: THEME.line, color: THEME.ink }}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {PRICE_BANDS.filter((b) => b.label !== 'Any price').map((band) => {
                    const active = filters.minPrice === band.min && filters.maxPrice === band.max;
                    return (
                      <button
                        key={band.label}
                        type="button"
                        onClick={() => setFilter({ minPrice: band.min, maxPrice: band.max })}
                        className="min-h-[40px] rounded-full border px-3 text-[12px] font-semibold"
                        style={{
                          borderColor: active ? THEME.brand : THEME.line,
                          backgroundColor: active ? THEME.brandTint : THEME.surface,
                          color: active ? THEME.brand : THEME.inkMuted,
                        }}
                      >
                        {band.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Categories */}
              <section className="mb-4">
                <h3 className="mb-2 text-[11px] font-black uppercase tracking-wide" style={{ color: THEME.inkMuted }}>{copy('categories')}</h3>
                <div className="flex flex-wrap gap-2">
                  {(data?.categories || []).map((cat) => {
                    const active = filters.category === cat.name;
                    return (
                      <button
                        key={cat.name}
                        type="button"
                        onClick={() => setFilter({ category: active ? undefined : cat.name })}
                        className="min-h-[40px] rounded-full border px-3 text-[12px] font-semibold"
                        style={{
                          borderColor: active ? THEME.brand : THEME.line,
                          backgroundColor: active ? THEME.brandTint : THEME.surface,
                          color: active ? THEME.brand : THEME.inkMuted,
                        }}
                      >
                        {cat.name}
                        <span className="ml-1 text-[10px]" style={{ color: THEME.inkSubtle }}>({cat.product_count})</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Vendors */}
              <section className="mb-2">
                <h3 className="mb-2 text-[11px] font-black uppercase tracking-wide" style={{ color: THEME.inkMuted }}>Sellers</h3>
                <div className="relative mb-2">
                  <Store className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: THEME.inkSubtle }} />
                  <input
                    value={vendorQuery}
                    onChange={(e) => setVendorQuery(e.target.value)}
                    placeholder="Search sellers"
                    aria-label="Filter by vendor"
                    className="min-h-[44px] w-full rounded-lg border bg-transparent pl-9 pr-3 text-[13px] focus:outline-none"
                    style={{ borderColor: THEME.line, color: THEME.ink }}
                  />
                </div>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {vendorFacets.map((vendor) => {
                    const active = filters.vendor === vendor.vendor_id;
                    return (
                      <button
                        key={vendor.vendor_id}
                        type="button"
                        onClick={() => setFilter({ vendor: active ? undefined : vendor.vendor_id })}
                        className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg border px-3 text-left"
                        style={{
                          borderColor: active ? THEME.brand : THEME.line,
                          backgroundColor: active ? THEME.brandTint : THEME.surface,
                        }}
                      >
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                          style={{
                            borderColor: active ? THEME.brand : THEME.inkSubtle,
                            backgroundColor: active ? THEME.brand : 'transparent',
                          }}
                        >
                          {active && <Check className="h-3 w-3 text-white" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: active ? THEME.brand : THEME.inkMuted }}>
                          {vendor.vendor_name}
                          <span className="ml-1 text-[11px] font-normal" style={{ color: THEME.inkSubtle }}>({vendor.product_count})</span>
                        </span>
                      </button>
                    );
                  })}
                  {vendorFacets.length === 0 && (
                    <div className="py-2 text-center text-[12px]" style={{ color: THEME.inkSubtle }}>No sellers match.</div>
                  )}
                </div>
              </section>
            </div>

            {/* Sheet footer — the primary action is always reachable */}
            <div className="flex gap-2 border-t px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3" style={{ borderColor: THEME.line }}>
              <button
                type="button"
                onClick={() => { clearAll(); }}
                className="min-h-[48px] flex-1 rounded-xl border text-[13px] font-bold active:opacity-80"
                style={{ borderColor: THEME.line, color: THEME.ink }}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setShowFilterSheet(false)}
                className="min-h-[48px] flex-[2] rounded-xl text-[13px] font-black text-white"
                style={{ backgroundColor: THEME.brand }}
              >
                Show {data?.total ?? 0} results
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═════════ MOBILE MENU DRAWER ═════════ */}
      {showMenu && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0" style={{ backgroundColor: THEME.overlay }} onClick={() => setShowMenu(false)} />
          <aside
            className="relative flex h-full w-[82%] max-w-[320px] flex-col shadow-2xl"
            style={{ animation: 'mmDrawerIn .22s ease-out', backgroundColor: THEME.surface }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: THEME.line }}>
              <span className="text-[15px] font-black" style={{ color: THEME.ink }}>
                ZID<span style={{ color: THEME.brand }}>Market</span>
              </span>
              <button
                type="button"
                onClick={() => setShowMenu(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full active:opacity-70"
                style={{ color: THEME.inkMuted }}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain py-2">
              <button
                type="button"
                onClick={() => { setShowMenu(false); onOpenAccount?.(); }}
                className="mm-hover flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[14px] font-bold"
                style={{ color: THEME.ink }}
              >
                <User className="h-5 w-5" style={{ color: THEME.inkMuted }} />
                My account
              </button>
              <button
                type="button"
                onClick={() => { setShowMenu(false); setShowBasket(true); }}
                className="mm-hover flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[14px] font-bold"
                style={{ color: THEME.ink }}
              >
                <ShoppingBasket className="h-5 w-5" style={{ color: THEME.inkMuted }} />
                Basket ({basket.itemCount})
              </button>

              <div className="my-2 border-t" style={{ borderColor: THEME.line }} />

              <div className="px-4 pb-1 pt-1 text-[10px] font-black uppercase tracking-widest" style={{ color: THEME.inkSubtle }}>
                Shop by category
              </div>
              <button
                type="button"
                onClick={() => { setShowMenu(false); setFilter({ category: undefined }); }}
                className="mm-hover flex min-h-[48px] w-full items-center px-4 text-left text-[13.5px] font-semibold"
                style={{ color: THEME.inkMuted }}
              >
                {copy('all_categories')}
              </button>
              {allCategories.rail.map((cat) => {
                const tree = menuTreeByName.get(cat.name.toLowerCase());
                return (
                  <div key={cat.name}>
                    <button
                      type="button"
                      onClick={() => { setShowMenu(false); selectPrimaryCategory(cat.name); }}
                      className="mm-hover flex min-h-[48px] w-full items-center justify-between px-4 text-left text-[13.5px] font-semibold"
                      style={{ color: filters.category === cat.name ? THEME.brand : THEME.ink }}
                    >
                      <span className="truncate">{cat.name}</span>
                      <span className="ml-2 text-[11px]" style={{ color: THEME.inkSubtle }}>({cat.product_count})</span>
                    </button>
                    {/* On mobile the drawer — not a hover panel — is where the
                        sub-categories live, so they are listed inline here. */}
                    {tree && tree.children.length > 0 && filters.category === cat.name && (
                      <div className="pb-1 pl-4">
                        {tree.children.map((sub) => (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => { setShowMenu(false); selectSubCategory(cat.name, sub.name); }}
                            className="mm-hover flex min-h-[40px] w-full items-center justify-between rounded-md px-3 text-left text-[12.5px]"
                            style={{ color: activeSub === sub.name ? THEME.brand : THEME.inkMuted }}
                          >
                            <span className="truncate">{sub.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {onGoToPlans && (
                <>
                  <div className="my-2 border-t" style={{ borderColor: THEME.line }} />
                  <button
                    type="button"
                    onClick={() => { setShowMenu(false); onGoToPlans(); }}
                    className="mm-hover flex min-h-[48px] w-full items-center px-4 text-left text-[13.5px] font-semibold"
                    style={{ color: THEME.inkMuted }}
                  >
                    {copy('sell_on_zid')}
                  </button>
                </>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ═════════ QUICK-VIEW MODAL ═════════ */}
      {activeProduct && (
        <QuickView
          lang={language}
          product={activeProduct}
          onClose={() => setActiveProduct(null)}
          /* Add to the central basket, then dismiss the overlay in ONE place.
             `handleAdd` only mutates the basket (no navigation), so the shopper
             stays exactly where they were in the grid. */
          onAdd={(p) => { handleAdd(p); setActiveProduct(null); }}
          onVisitVendor={(slug) => { setActiveProduct(null); onVisitVendor(slug); }}
          theme={THEME}
        />
      )}

      {/* Keyframes used by the drawers and sheets (scoped inline) */}
      <style>{`
        @keyframes mmSlideIn {
          from { transform: translateX(24px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes mmSheetUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes mmDrawerIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        /* Mobile shows "by X", desktop shows "Sold by: X" — exactly one
           prefix, chosen by breakpoint. */
        .vendor-prefix::before { content: 'by '; }
        @media (min-width: 640px) {
          .vendor-prefix::before { content: 'Sold by: '; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="mmSheetUp"], [style*="mmDrawerIn"], [style*="mmSlideIn"] {
            animation: none !important;
          }
        }

        /* ── Premium backdrop ─────────────────────────────────────────────
           Two layers UNDER the content, both position:fixed so the effect
           stays put while the grid scrolls:
             1. a faint dot grid — reads as texture at 100%, never as "noise";
             2. a slow-drifting colour bloom that gives the page depth.
           Both are pointer-events:none and opacity-tuned so text contrast is
           untouched, and both are switched off for reduced-motion users. */
        .mm-backdrop::before,
        .mm-backdrop::after {
          content: '';
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }
        .mm-backdrop::before {
          background-image: radial-gradient(var(--mm-dot) 1px, transparent 1px);
          background-size: 22px 22px;
          mask-image: linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.25) 60%, transparent);
          -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.25) 60%, transparent);
        }
        .mm-backdrop::after {
          background:
            radial-gradient(600px 420px at 12% 4%, var(--mm-glow-a), transparent 70%),
            radial-gradient(680px 460px at 88% 22%, var(--mm-glow-b), transparent 72%);
          animation: mmDrift 26s ease-in-out infinite alternate;
        }
        @keyframes mmDrift {
          from { transform: translate3d(0, 0, 0) scale(1); }
          to { transform: translate3d(0, -18px, 0) scale(1.04); }
        }
        @media (prefers-reduced-motion: reduce) {
          .mm-backdrop::after { animation: none; }
        }

        /* Theme-aware hover for the interactive chrome (header buttons, menu
           rows, rail chips). One rule instead of dozens of hard-coded
           utilities that stayed white in dark mode. */
        .mm-hover:hover { background-color: var(--mm-hover) !important; }
        @media (hover: none) {
          .mm-hover:hover { background-color: transparent !important; }
        }

        /* Trending-search pills take the brand tint on hover without the caller
           having to re-implement enter/leave handlers (the old version mutated
           element.style directly, which React overwrote on the next render). */
        .mm-pill:hover { border-color: var(--mm-brand) !important; color: var(--mm-brand) !important; }

        /* Footer keyword pills and text links: brand colour on hover. Scoped to
           the footer so the same helper cannot repaint marketplace chrome. */
        .well-tag:hover { border-color: var(--mm-brand) !important; color: var(--mm-brand) !important; }
        .well-link:hover { color: var(--mm-brand) !important; }

        /* Product card lift on pointer devices; the shadow colour comes from the
           palette so dark mode gets a deep shadow, not a grey haze. */
        @media (hover: hover) and (min-width: 640px) {
          article.group:hover { box-shadow: var(--mm-card-shadow); }
        }
      `}</style>
    </div>
  );
};

/* ─────────────────────────── helper components ─────────────────────────── */

const Chip: React.FC<{ label: string; onRemove: () => void; theme?: ThemeTokens }> = ({ label, onRemove, theme }) => {
  const THEME = theme || LIGHT_THEME;
  return (
  <span
    className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold"
    style={{ borderColor: THEME.line, backgroundColor: THEME.surface, color: THEME.inkMuted }}
  >
    {label}
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${label} filter`}
      className="transition hover:opacity-70"
      style={{ color: THEME.inkSubtle }}
    >
      <X className="h-3 w-3" />
    </button>
  </span>
  );
};

/** Compact product detail overlay — comparison review without leaving the grid. */
const QuickView: React.FC<{
  product: MarketplaceProduct;
  onClose: () => void;
  onAdd: (product: MarketplaceProduct) => void;
  onVisitVendor: (slug: string) => void;
  lang?: 'en' | 'bn';
  /** Runtime palette — light or dark. */
  theme?: ThemeTokens;
}> = ({ product, onClose, onAdd, onVisitVendor, lang: qvLang, theme }) => {
  const THEME = theme || LIGHT_THEME;
  const lang: 'en' | 'bn' = qvLang === 'bn' ? 'bn' : 'en';
  const p = product as any;
  const image = p.image || p.image_url || p.imageUrl;
  const title = productTitle(p, lang);
  const t = (key: string, vars?: Record<string, string | number>) => marketplaceCopy(key, lang, vars);
  const tags: string[] = Array.isArray(p.category_tags) && p.category_tags.length ? p.category_tags : [p.category].filter(Boolean);

  return (
    // Mobile: bottom sheet anchored to the bottom edge (natural thumb reach) and
    // scrollable. Desktop: a centred two-column dialog.
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 backdrop-blur-[2px]" style={{ backgroundColor: THEME.overlay }} onClick={onClose} />
      <div
        className="relative grid max-h-[90vh] w-full overflow-y-auto overscroll-contain rounded-t-2xl shadow-2xl sm:max-h-[92vh] sm:max-w-3xl sm:rounded-2xl md:grid-cols-2"
        style={{ animation: 'mmSheetUp .24s cubic-bezier(.2,.8,.2,1)', backgroundColor: THEME.surface }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full shadow active:opacity-70 sm:right-3 sm:top-3 sm:h-9 sm:w-9"
          style={{ backgroundColor: THEME.surface, color: THEME.inkMuted }}
          aria-label="Close"
        >
          <X className="h-5 w-5 sm:h-4 sm:w-4" />
        </button>
        <div className="aspect-[4/3] sm:aspect-square" style={{ backgroundColor: THEME.well }}>
          <SafeImage src={image} alt={title} className="h-full w-full object-cover" />
        </div>
        <div className="flex flex-col p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:p-5">
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: THEME.brandTint, color: THEME.brand }}>
                {tag}
              </span>
            ))}
          </div>
          <h2 className="mt-2 text-lg font-black leading-tight" style={{ color: THEME.ink }}>{title}</h2>
          <div className="mt-1.5">
            <RatingStars rating={Number(p.rating || 0)} count={Number(p.review_count || 0)} />
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black" style={{ color: THEME.ink }}>{bdt(Number(product.priceBDT || 0))}</span>
            {Number(p.compare_at_price || 0) > Number(product.priceBDT || 0) && (
              <>
                <span className="text-sm line-through" style={{ color: THEME.inkSubtle }}>{bdt(Number(p.compare_at_price))}</span>
                <span className="rounded px-1.5 py-0.5 text-[11px] font-black text-white" style={{ backgroundColor: THEME.danger }}>
                  -{p.discount_percent}%
                </span>
              </>
            )}
          </div>

          {p.descriptionEn || p.description_en ? (
            <p className="mt-3 line-clamp-4 text-[12px] leading-relaxed" style={{ color: THEME.inkMuted }}>
              {p.descriptionEn || p.description_en}
            </p>
          ) : null}

          <div className="mt-4 rounded-xl border p-3" style={{ borderColor: THEME.line }}>
            <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: THEME.inkSubtle }}>Sold by</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <Store className="h-4 w-4 shrink-0" style={{ color: THEME.brand }} />
                <span className="truncate text-[13px] font-black" style={{ color: THEME.ink }}>{product.vendor_name}</span>
                {p.vendor_verified && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
              </span>
              <button
                type="button"
                onClick={() => product.vendor_slug && onVisitVendor(product.vendor_slug)}
                className="shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-bold"
                style={{ borderColor: THEME.brand, color: THEME.brand }}
              >
                Visit store
              </button>
            </div>
          </div>

          {/*
            STOCK FEEDBACK.

            The button is disabled for a genuinely sold-out product, but a greyed
            control with no explanation reads as a BROKEN button — a shopper
            clicks it, nothing happens, and they conclude the page is stuck.
            The status line below states the reason and the available quantity.
          */}
          {(() => {
            const status = String(p.stock_status || 'in_stock');
            const qty = Number(p.stock_quantity || 0);
            const soldOut = status === 'out_of_stock' || (!status && qty <= 0);
            return (
              <div className="mt-3 flex items-center gap-1.5 text-[11.5px] font-semibold">
                {soldOut ? (
                  <span style={{ color: THEME.danger }}>
                    {marketplaceCopy('sold_out', lang)} — {marketplaceCopy('out_of_stock_hint', lang)}
                  </span>
                ) : status === 'low_stock' ? (
                  <span style={{ color: THEME.warningFg }}>
                    {marketplaceCopy('only_left', lang, { n: qty })}
                  </span>
                ) : (
                  <span style={{ color: THEME.success }}>
                    {marketplaceCopy('in_stock', lang)}
                  </span>
                )}
              </div>
            );
          })()}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={(e) => {
                // Add to the CENTRAL basket, then close the modal.
                //
                // `onAdd` is the only handler that runs here. It used to be
                // followed by `onClose()`, but the parent's `onAdd` handler
                // ALREADY closes the modal — so the second call unmounted a
                // dialog that was already gone. The visible symptom was a modal
                // that lingered, or an "Add to basket" click that appeared to
                // do nothing at all.
                //
                // `stopPropagation` keeps the click from reaching the
                // backdrop, whose `onClick` closes without adding.
                e.stopPropagation();
                onAdd(product);
              }}
              disabled={String(p.stock_status) === 'out_of_stock'}
              className="min-h-[48px] flex-1 rounded-xl text-[13px] font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
              style={{ backgroundColor: THEME.brand }}
            >
              {String(p.stock_status) === 'out_of_stock'
                ? marketplaceCopy('sold_out', lang)
                : marketplaceCopy('add_to_cart', lang)}
            </button>
            <button
              type="button"
              onClick={() => product.vendor_slug && onVisitVendor(product.vendor_slug)}
              className="min-h-[48px] rounded-xl border px-4 text-[13px] font-bold active:opacity-80"
              style={{ borderColor: THEME.line, color: THEME.ink }}
            >
              Buy from store
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
