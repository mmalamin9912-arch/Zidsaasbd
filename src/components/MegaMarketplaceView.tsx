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
  LayoutGrid, Flame, Sparkles, ArrowRight, Menu, ArrowUpDown,
} from 'lucide-react';
import SafeImage from './SafeImage';
import { useToast } from './ToastProvider';
import {
  fetchMarketplaceProducts,
  type MarketplaceResponse,
  type MarketplaceFilters,
  type MarketplaceFacetVendor,
} from '../lib/marketplaceApi';
import { useMarketplaceBasket } from '../lib/useMarketplaceBasket';
import type { MarketplaceProduct } from '../types';

/* ─────────────────────────── platform palette ───────────────────────────
   The marketplace's OWN identity. Keyed off `mm-*` CSS variables so the rest
   of the app's Tailwind tokens cannot bleed in and no tenant theme can
   override it. Deep indigo + amber is distinct from every tenant template
   (which are gold/slate, emerald, or white-minimal).                      */
const THEME = {
  bg: '#f6f7fb',
  surface: '#ffffff',
  ink: '#111827',
  inkMuted: '#6b7280',
  line: '#e5e7eb',
  brand: '#3b2fd6',
  brandDark: '#2a219d',
  accent: '#ff9f1c',
  accentSoft: '#fff4e0',
  success: '#0f9d58',
  danger: '#e11d48',
} as const;

const bdt = (value: number) => `৳${Math.round(Number(value) || 0).toLocaleString('en-US')}`;

/* ───────────────────────────── hero banners ───────────────────────────── */

export interface HeroSlide {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  /** Tailwind gradient classes for the slide background. */
  gradient: string;
  /** Optional image; the gradient carries the slide when absent. */
  image?: string;
  /** Category (or search term) the CTA opens. */
  category?: string;
  accentText?: string;
}

const DEFAULT_SLIDES: HeroSlide[] = [
  {
    id: 'mega-sale',
    eyebrow: 'MEGA MARKETPLACE SALE',
    title: 'Up to 60% off across 1,000+ stores',
    subtitle: 'One basket, many sellers — delivered nationwide with cash on delivery.',
    cta: 'Shop the sale',
    gradient: 'from-[#3b2fd6] via-[#5b4bff] to-[#8b5cf6]',
    accentText: 'text-amber-300',
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
  },
  {
    id: 'free-delivery',
    eyebrow: 'PLATFORM OFFER',
    title: 'Free delivery over ৳2,000',
    subtitle: 'Across every seller in the marketplace — no coupon required.',
    cta: 'Start shopping',
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
}> = ({ product, onAdd, onVisitVendor, onOpenProduct }) => {
  const p = product as any;
  const image = p.image || p.image_url || p.imageUrl || p.thumbnail;
  const compareAt = Number(p.compare_at_price || 0);
  const discount = Number(p.discount_percent || 0);
  const stockStatus = String(p.stock_status || 'in_stock');
  const tags: string[] = Array.isArray(p.category_tags) && p.category_tags.length
    ? p.category_tags
    : [p.category].filter(Boolean);
  const soldOut = stockStatus === 'out_of_stock';

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
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-white transition-all duration-200 sm:hover:-translate-y-0.5 sm:hover:shadow-[0_12px_28px_-10px_rgba(17,24,39,0.25)]"
      style={{ borderColor: THEME.line }}
    >
      {/* Media */}
      <button
        type="button"
        onClick={() => onOpenProduct(product)}
        className="relative block aspect-square w-full overflow-hidden bg-[#f8fafc]"
        aria-label={`View ${product.title}`}
      >
        <SafeImage
          src={image}
          alt={product.title}
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
            Sold out
          </span>
        )}
        {!soldOut && stockStatus === 'low_stock' && (
          <span className="absolute bottom-2 left-2 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
            Only {Number(p.stock_quantity || 0)} left
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2 sm:p-3">
        {/* Dynamic category tags — ONE line on mobile so the card height stays
            even across a 2-up grid. */}
        <div className="flex min-w-0 flex-wrap items-center gap-1 overflow-hidden">
          {tags.slice(0, 1).map((tag) => (
            <span
              key={tag}
              className="max-w-full truncate rounded px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide sm:text-[10px]"
              style={{ backgroundColor: '#eef0ff', color: THEME.brand }}
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
          className="flex min-h-[44px] items-start break-words text-left text-[12px] font-semibold leading-snug text-slate-800 sm:min-h-0 sm:text-[13px]"
        >
          <span className="line-clamp-2 min-w-0">{product.title}</span>
        </button>

        <RatingStars rating={Number(p.rating || 0)} count={Number(p.review_count || 0)} />

        {/* Price — the compare-at price drops to its own line on the narrowest
            screens so `৳42,999 ৳46,999` can never clip. */}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0">
          <span className="text-[14px] font-black leading-none sm:text-[15px]" style={{ color: THEME.ink }}>
            {bdt(Number(product.priceBDT || 0))}
          </span>
          {compareAt > Number(product.priceBDT || 0) && (
            <span className="text-[10px] text-slate-400 line-through sm:text-[11px]">{bdt(compareAt)}</span>
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
          className="mt-auto flex min-h-[44px] w-full min-w-0 items-center gap-1 rounded-md border border-dashed px-1.5 py-1 text-left transition-colors active:bg-[#eef0ff] sm:min-h-0 sm:gap-1.5 sm:px-2"
          style={{ borderColor: '#d9dcf5' }}
          title={`Sold by ${product.vendor_name} — visit store`}
          aria-label={`Sold by ${product.vendor_name}. Visit store.`}
        >
          <Store className="h-3 w-3 shrink-0" style={{ color: THEME.brand }} />
          {/* One label, not two. `inline sm:hidden` + `hidden sm:inline` are
              used with explicit `display` utilities so exactly ONE variant is
              ever in the accessibility tree — previously both spans rendered
              and the badge read "Sold by: by dhaka-weaves". */}
          <span className="min-w-0 flex-1 truncate text-[9.5px] leading-tight text-slate-500 sm:text-[10.5px]">
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
          <span className="truncate">{soldOut ? 'Out of stock' : 'Add to basket'}</span>
        </button>
      </div>
    </article>
  );
};

/* ──────────────────────────── hero carousel ───────────────────────────── */

const HeroCarousel: React.FC<{
  slides: HeroSlide[];
  onCta: (slide: HeroSlide) => void;
}> = ({ slides, onCta }) => {
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

  return (
    <section
      aria-label="Platform promotions"
      className="relative overflow-hidden rounded-2xl"
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
        <div className="relative z-10 min-w-0 max-w-xl px-10 sm:px-0">
          <span className={`text-[10px] font-black uppercase tracking-[0.2em] sm:text-[11px] sm:tracking-[0.28em] ${slide.accentText || 'text-white/80'}`}>
            {slide.eyebrow}
          </span>
          <h2 className="mt-1.5 break-words text-[19px] font-black leading-tight text-white sm:mt-2 sm:text-3xl lg:text-4xl">
            {slide.title}
          </h2>
          <p className="mt-1.5 line-clamp-2 max-w-md text-[12px] text-white/85 sm:mt-2 sm:line-clamp-none sm:text-sm">
            {slide.subtitle}
          </p>
          <button
            type="button"
            onClick={() => onCta(slide)}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-[12.5px] font-black text-slate-900 shadow-lg transition-transform active:scale-[0.98] sm:mt-5 sm:px-5 sm:text-[13px]"
            style={{ backgroundColor: THEME.accent }}
          >
            {slide.cta}
            <ArrowRight className="h-4 w-4" />
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
          {/* Dots: 44px tall tap targets wrapping a small visual indicator. */}
          <div className="absolute bottom-0 left-1/2 z-20 flex -translate-x-1/2 items-center">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to promotion ${i + 1}`}
                aria-current={i === index}
                className="flex h-11 w-9 items-center justify-center"
              >
                <span
                  className={`h-1.5 rounded-full transition-all ${
                    i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/50'
                  }`}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
};

/* ───────────────────────── filter section types ───────────────────────── */

export type MarketplaceSortValue = NonNullable<MarketplaceFilters['sort']>;

const PRICE_BANDS: { label: string; min: number | null; max: number | null }[] = [
  { label: 'Any price', min: null, max: null },
  { label: 'Under ৳500', min: null, max: 500 },
  { label: '৳500 – ৳1,000', min: 500, max: 1000 },
  { label: '৳1,000 – ৳5,000', min: 1000, max: 5000 },
  { label: '৳5,000 – ৳20,000', min: 5000, max: 20000 },
  { label: 'Above ৳20,000', min: 20000, max: null },
];

const SORTS: { value: MarketplaceSortValue; label: string }[] = [
  { value: 'newest', label: 'Newest arrivals' },
  { value: 'popular', label: 'Best selling' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'relevance', label: 'Relevance' },
];

const PAGE_SIZE = 36;

/** Circular/rounded category tile used in the "shop by category" rail. */
const CategoryTile: React.FC<{
  name: string;
  count: number;
  active: boolean;
  onClick: () => void;
  emoji: string;
}> = ({ name, count, active, onClick, emoji }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex min-w-[92px] flex-col items-center gap-2 rounded-xl border px-3 py-3 transition-all ${
      active ? 'shadow-sm' : 'hover:-translate-y-0.5 hover:shadow-sm'
    }`}
    style={{
      borderColor: active ? THEME.brand : THEME.line,
      backgroundColor: active ? '#eef0ff' : THEME.surface,
    }}
  >
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f2f4ff] text-xl">
      {emoji}
    </span>
    <span className="max-w-[84px] truncate text-center text-[11px] font-bold text-slate-700">{name}</span>
    <span className="text-[10px] text-slate-400">({count})</span>
  </button>
);

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
  onCheckout: (vendorSlug: string) => void;
  /** Open the merchant dashboard / sign-in. */
  onOpenAccount?: () => void;
  /** Return to the SaaS pricing landing. */
  onGoToPlans?: () => void;
  /** First path segment already in the URL (e.g. `/marketplace?category=x`). */
  initialFilters?: MarketplaceFilters;
  /** Promo slides; defaults to the built-in platform set. */
  slides?: HeroSlide[];
  /** Optional headline override. */
  title?: string;
}

export const MegaMarketplaceView: React.FC<MegaMarketplaceViewProps> = ({
  onVisitVendor,
  onCheckout,
  onOpenAccount,
  onGoToPlans,
  initialFilters,
  slides = DEFAULT_SLIDES,
  title = 'Marketplace',
}) => {
  const toast = useToast();
  const basket = useMarketplaceBasket();

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
  // Mobile navigation: hamburger drawer + collapsible search field.
  const [showMenu, setShowMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
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
    const anyOpen = showMenu || showBasket || showFilterSheet || Boolean(activeProduct);
    if (!anyOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [showMenu, showBasket, showFilterSheet, activeProduct]);

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
  }, []);

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
    filters.q, filters.category, filters.minPrice, filters.maxPrice,
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

  const submitSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    setFilter({ q: searchInput.trim() || undefined });
    searchRef.current?.blur();
  };

  const clearAll = () => {
    setSearchInput('');
    setVendorQuery('');
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

  const topCategories = useMemo(() => (data?.categories || []).slice(0, 10), [data?.categories]);
  const allProducts = useMemo(() => data?.products || [], [data?.products]);
  const products = useMemo(
    () => (dealsOnly
      ? allProducts.filter((p) => Number((p as any).discount_percent || 0) > 0)
      : allProducts),
    [allProducts, dealsOnly],
  );

  const handleAdd = (product: MarketplaceProduct) => {
    basket.add(product, 1);
    toast.success('Added to basket', { description: `${product.title} — ${product.vendor_name}` });
  };

  const handleHeroCta = (slide: HeroSlide) => {
    if (slide.category) setFilter({ category: slide.category });
    else setFilter({ category: undefined });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ───────────────────────────── render ───────────────────────────── */

  return (
    <div className="flex min-h-screen w-full min-w-0 flex-col font-sans" style={{ backgroundColor: THEME.bg, color: THEME.ink }}>
      {/* ═════════ MEGA HEADER ═════════ */}
      <header className="sticky top-0 z-40 w-full shadow-sm" style={{ backgroundColor: THEME.surface }}>
        {/* Utility strip */}
        <div className="hidden w-full text-white md:block" style={{ backgroundColor: THEME.brandDark }}>
          <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-1.5 text-[11px]">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Deliver to all 64 districts</span>
              <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> Free delivery over ৳2,000</span>
              <span className="flex items-center gap-1"><RotateCcw className="h-3 w-3" /> 7-day easy returns</span>
            </div>
            <div className="flex items-center gap-4">
              <button type="button" onClick={onOpenAccount} className="hover:text-amber-300">Sell on ZID</button>
              {onGoToPlans && (
                <button type="button" onClick={onGoToPlans} className="hover:text-amber-300">Merchant login</button>
              )}
              <span className="flex items-center gap-1"><HeadphonesIcon className="h-3 w-3" /> 09600-000000</span>
            </div>
          </div>
        </div>

        {/* ── MOBILE COMPACT BAR (below `lg`) ──────────────────────────
            One row, 56px tall, everything within thumb reach: menu · logo ·
            search toggle · basket. The full search field is collapsed until
            tapped so the bar stays short and the grid gets maximum screen. */}
        <div className="flex h-14 items-center gap-1 px-2 lg:hidden">
          <button
            type="button"
            onClick={() => setShowMenu(true)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-700 active:bg-[#f4f5ff]"
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

          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-700 active:bg-[#f4f5ff]"
            aria-label="Search products"
            aria-expanded={searchOpen}
          >
            <Search className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowBasket(true)}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-700 active:bg-[#f4f5ff]"
            aria-label={`Basket, ${basket.itemCount} items`}
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
          <form onSubmit={submitSearch} className="border-t px-2 pb-2 pt-1.5 lg:hidden" style={{ borderColor: THEME.line }}>
            <div
              className="flex w-full items-center overflow-hidden rounded-xl border bg-white"
              style={{ borderColor: THEME.brand }}
            >
              <Search className="ml-2.5 h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={searchRef}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search every store…"
                aria-label="Search the marketplace"
                autoFocus
                className="min-w-0 flex-1 px-2 py-3 text-[14px] text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => { setSearchInput(''); setFilter({ q: undefined }); }}
                  className="flex h-11 w-11 items-center justify-center text-slate-400"
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
          </form>
        )}

        {/* ── DESKTOP HEADER ROW (lg and up) ─────────────────────────── */}
        <div className="mx-auto hidden max-w-[1400px] items-center gap-3 px-4 py-3 lg:flex">
          {/* Brand */}
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
                Multi-vendor bazaar
              </span>
            </span>
          </button>

          {/* CENTRAL GLOBAL SEARCH */}
          <form onSubmit={submitSearch} className="flex min-w-0 flex-1 items-center">
            <div
              className="flex w-full items-center overflow-hidden rounded-xl border-2 bg-white transition-shadow focus-within:shadow-md"
              style={{ borderColor: THEME.brand }}
            >
              <button
                type="button"
                onClick={submitSearch}
                className="flex h-10 items-center gap-1 px-3 text-[12px] font-bold text-slate-600 hover:bg-[#f4f5ff]"
              >
                All
                <ChevronDown className="h-3 w-3" />
              </button>
              <span className="h-6 w-px" style={{ backgroundColor: THEME.line }} />
              <input
                ref={searchRef}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search across every store — sarees, phones, gadgets…"
                aria-label="Search the marketplace"
                className="min-w-0 flex-1 px-3 py-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => { setSearchInput(''); setFilter({ q: undefined }); }}
                  className="px-2 text-slate-400 hover:text-slate-700"
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
          </form>

          {/* Shortcuts (desktop only — mobile uses the compact bar above) */}
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onOpenAccount}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-[#f4f5ff]"
            >
              <User className="h-[18px] w-[18px]" style={{ color: THEME.ink }} />
              <span className="flex flex-col leading-tight">
                <span className="text-[10px] text-slate-400">Hello, sign in</span>
                <span className="text-[12px] font-bold" style={{ color: THEME.ink }}>My account</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowBasket(true)}
              className="relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-[#f4f5ff]"
              aria-label={`Basket, ${basket.itemCount} items`}
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
              <span className="hidden flex-col leading-tight md:flex">
                <span className="text-[10px] text-slate-400">Basket</span>
                <span className="text-[12px] font-bold" style={{ color: THEME.ink }}>{bdt(basket.subtotal)}</span>
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
          className="border-t"
          style={{ borderColor: THEME.line, backgroundColor: THEME.surface }}
          aria-label="Marketplace categories"
        >
          <div className="mx-auto flex max-w-[1400px] snap-x snap-mandatory items-center gap-1.5 overflow-x-auto overscroll-x-contain px-2 py-2 [scrollbar-width:none] lg:gap-1 lg:px-4 lg:py-1.5 [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setFilter({ category: undefined })}
              // 44px tap height on mobile, compact on desktop.
              className={`flex shrink-0 snap-start items-center whitespace-nowrap rounded-full px-3.5 text-[12px] font-bold transition min-h-[36px] lg:min-h-0 lg:rounded-md lg:px-2.5 lg:py-1.5 ${
                !filters.category ? 'text-white' : 'text-slate-600 active:bg-[#eef0ff] lg:hover:bg-[#f4f5ff]'
              }`}
              style={!filters.category ? { backgroundColor: THEME.brand } : { backgroundColor: '#f4f5ff' }}
            >
              All categories
            </button>
            {(data?.categories || []).slice(0, 14).map((cat) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => setFilter({ category: filters.category === cat.name ? undefined : cat.name })}
                className={`flex shrink-0 snap-start items-center whitespace-nowrap rounded-full px-3.5 text-[12px] font-semibold transition min-h-[36px] lg:min-h-0 lg:rounded-md lg:px-2.5 lg:py-1.5 ${
                  filters.category === cat.name ? 'text-white' : 'text-slate-600 active:bg-[#eef0ff] lg:hover:bg-[#f4f5ff]'
                }`}
                style={filters.category === cat.name ? { backgroundColor: THEME.brand } : { backgroundColor: '#f4f5ff' }}
              >
                {cat.name}
              </button>
            ))}
            <span className="mx-1 h-4 w-px shrink-0" style={{ backgroundColor: THEME.line }} />
            <button
              type="button"
              onClick={() => setDealsOnly((v) => !v)}
              aria-pressed={dealsOnly}
              className={`flex whitespace-nowrap items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-bold transition ${
                dealsOnly ? 'bg-rose-600 text-white' : 'text-rose-600 hover:bg-rose-50'
              }`}
            >
              <Flame className="h-3.5 w-3.5" /> Deals
            </button>
            <button
              type="button"
              onClick={() => setFilter({ sort: 'newest' })}
              className="flex whitespace-nowrap items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-bold text-emerald-700 hover:bg-emerald-50"
            >
              <Sparkles className="h-3.5 w-3.5" /> New in
            </button>
          </div>
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
      <main className={`mx-auto w-full min-w-0 max-w-[1400px] px-3 py-3 sm:px-4 lg:px-4 lg:py-5 ${basket.itemCount > 0 ? 'pb-28' : 'pb-6'} lg:pb-6`}>
        {/* ═════════ HERO CAROUSEL ═════════ */}
        <HeroCarousel slides={slides} onCta={handleHeroCta} />

        {/* ═════════ TRUST STRIP ═════════
            Mobile: a single swipeable row (4 stacked tiles would eat the whole
            first screen). Desktop: a 4-up grid. */}
        <div className="mt-2.5 flex snap-x gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:none] sm:mt-3 sm:grid sm:grid-cols-4 sm:overflow-visible [&::-webkit-scrollbar]:hidden">
          {[
            { icon: TruckIcon, title: 'Nationwide delivery', sub: 'All 64 districts' },
            { icon: ShieldCheck, title: 'Verified sellers', sub: `${data?.vendors.length ?? 0} active stores` },
            { icon: RotateCcw, title: '7-day returns', sub: 'On damaged items' },
            { icon: BadgePercent, title: 'Cash on delivery', sub: 'Pay when it arrives' },
          ].map((item) => (
            <div
              key={item.title}
              className="flex min-h-[52px] shrink-0 snap-start items-center gap-2 rounded-lg border bg-white px-2.5 py-2 sm:min-h-0 sm:shrink sm:gap-2.5 sm:px-3"
              style={{ borderColor: THEME.line }}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: '#eef0ff' }}>
                <item.icon className="h-4 w-4" style={{ color: THEME.brand }} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[11px] font-bold text-slate-800 sm:text-[11.5px]">{item.title}</div>
                <div className="truncate text-[10px] text-slate-500">{item.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ═════════ SHOP BY CATEGORY (desktop only) ═════════
            Mobile already has the swipeable chip rail in the sticky header, so
            repeating tiles here would push the products below the fold. */}
        {topCategories.length > 0 && (
          <section className="mt-5 hidden lg:block">
            <div className="mb-2 flex items-end justify-between">
              <h2 className="text-[15px] font-black tracking-tight text-slate-900">Shop by category</h2>
              {filters.category && (
                <button type="button" onClick={() => setFilter({ category: undefined })} className="text-[11px] font-bold" style={{ color: THEME.brand }}>
                  Clear
                </button>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {topCategories.map((cat) => (
                <CategoryTile
                  key={cat.name}
                  name={cat.name}
                  count={cat.product_count}
                  emoji={categoryEmoji(cat.name)}
                  active={filters.category === cat.name}
                  onClick={() => setFilter({ category: filters.category === cat.name ? undefined : cat.name })}
                />
              ))}
            </div>
          </section>
        )}

        {/* ═════════ RESULTS LAYOUT: filters · grid ═════════
            `items-start` is what removes the tall vertical gap that appeared
            when the filter rail was shorter than the results column: without
            it the grid stretches every child to the tallest row and the
            results header floated far below the first card row. */}
        <div className="mt-3 grid items-start gap-4 lg:mt-5 lg:grid-cols-[248px_1fr]">
          {/* ── Advanced filter rail ── */}
          {/* The filter rail is DESKTOP ONLY — on mobile the same controls live
              in the bottom sheet, triggered by the sticky filter bar below. */}
          <aside className="hidden lg:block">
            <div className="sticky top-[150px] space-y-3">
              <div className="rounded-xl border bg-white" style={{ borderColor: THEME.line }}>
                <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: THEME.line }}>
                  <h3 className="flex items-center gap-1.5 text-[12px] font-black uppercase tracking-wide text-slate-700">
                    <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
                  </h3>
                  {activeFilterCount > 0 && (
                    <button type="button" onClick={clearAll} className="text-[10px] font-bold text-rose-600 hover:underline">
                      Reset
                    </button>
                  )}
                </div>

                {/* Category */}
                <div className="border-b px-3 py-3" style={{ borderColor: THEME.line }}>
                  <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">Categories</div>
                  <div className="max-h-52 space-y-0.5 overflow-y-auto pr-1">
                    {(data?.categories || []).map((cat) => {
                      const active = filters.category === cat.name;
                      return (
                        <button
                          key={cat.name}
                          type="button"
                          onClick={() => setFilter({ category: active ? undefined : cat.name })}
                          className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[12px] transition ${
                            active ? 'font-bold' : 'text-slate-600 hover:bg-slate-50'
                          }`}
                          style={active ? { backgroundColor: '#eef0ff', color: THEME.brand } : undefined}
                        >
                          <span
                            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                              active ? 'border-transparent' : 'border-slate-300'
                            }`}
                            style={active ? { backgroundColor: THEME.brand } : undefined}
                          >
                            {active && <Check className="h-2.5 w-2.5 text-white" />}
                          </span>
                          {/* The count is one template string — "Fashion (12)" —
                              so the SPACE is part of the text itself, not just
                              a CSS margin. Adjacent nodes previously produced
                              "Fashion(2)" in the accessibility tree and any
                              copy/screen-reader use. */}
                          <span className="min-w-0 flex-1 truncate">
                            {`${cat.name} (${cat.product_count})`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Price */}
                <div className="border-b px-3 py-3" style={{ borderColor: THEME.line }}>
                  <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">Price range</div>
                  <div className="space-y-0.5">
                    {PRICE_BANDS.map((band, idx) => {
                      const active = priceBandIndex === idx;
                      return (
                        <button
                          key={band.label}
                          type="button"
                          onClick={() => setFilter({ minPrice: band.min, maxPrice: band.max })}
                          className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[12px] transition ${
                            active ? 'font-bold' : 'text-slate-600 hover:bg-slate-50'
                          }`}
                          style={active ? { backgroundColor: '#eef0ff', color: THEME.brand } : undefined}
                        >
                          <span
                            className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                              active ? 'border-[#3b2fd6] bg-[#3b2fd6]' : 'border-slate-300'
                            }`}
                          />
                          {band.label}
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
                      aria-label="Minimum price"
                      className="w-full rounded-md border px-2 py-1.5 text-[11px] focus:border-[#3b2fd6] focus:outline-none"
                      style={{ borderColor: THEME.line }}
                    />
                    <span className="text-slate-400">–</span>
                    <input
                      type="number"
                      min={0}
                      value={filters.maxPrice ?? ''}
                      onChange={(e) => setFilter({ maxPrice: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder="Max ৳"
                      aria-label="Maximum price"
                      className="w-full rounded-md border px-2 py-1.5 text-[11px] focus:border-[#3b2fd6] focus:outline-none"
                      style={{ borderColor: THEME.line }}
                    />
                  </div>
                </div>

                {/* Vendor */}
                <div className="px-3 py-3">
                  <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">Vendors</div>
                  {filters.vendor && (
                    <button
                      type="button"
                      onClick={() => setFilter({ vendor: undefined })}
                      className="mb-1.5 flex w-full items-center justify-between rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-bold text-rose-700"
                    >
                      <span className="truncate">{activeVendor?.vendor_name || filters.vendor}</span>
                      <X className="h-3 w-3 shrink-0" />
                    </button>
                  )}
                  <div className="relative mb-1.5">
                    <Store className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                    <input
                      value={vendorQuery}
                      onChange={(e) => setVendorQuery(e.target.value)}
                      placeholder="Find a seller…"
                      aria-label="Filter by vendor"
                      className="w-full rounded-md border py-1.5 pl-6.5 pr-2 text-[11px] focus:border-[#3b2fd6] focus:outline-none"
                      style={{ borderColor: THEME.line, paddingLeft: '1.6rem' }}
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
                          className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[12px] transition ${
                            active ? 'font-bold' : 'text-slate-600 hover:bg-slate-50'
                          }`}
                          style={active ? { backgroundColor: '#eef0ff', color: THEME.brand } : undefined}
                        >
                          <span
                            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                              active ? 'border-transparent' : 'border-slate-300'
                            }`}
                            style={active ? { backgroundColor: THEME.brand } : undefined}
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
                      <div className="px-1.5 py-1 text-[11px] text-slate-400">No sellers match.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Platform promo card */}
              <div
                className="rounded-xl p-3 text-white"
                style={{ background: `linear-gradient(135deg, ${THEME.brand} 0%, #8b5cf6 100%)` }}
              >
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">Become a seller</div>
                <p className="mt-1 text-[12px] font-semibold leading-snug">
                  Reach thousands of shoppers with your own ZID storefront.
                </p>
                {onGoToPlans && (
                  <button
                    type="button"
                    onClick={onGoToPlans}
                    className="mt-2 rounded-md px-2.5 py-1.5 text-[11px] font-black text-slate-900"
                    style={{ backgroundColor: THEME.accent }}
                  >
                    View plans
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
              className="sticky top-[112px] z-30 -mx-1 mb-2 flex items-stretch gap-2 rounded-xl border bg-white/95 px-2 py-1.5 backdrop-blur lg:hidden"
              style={{ borderColor: THEME.line }}
            >
              <button
                type="button"
                onClick={() => setShowFilterSheet(true)}
                className="relative flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border text-[12.5px] font-bold text-slate-700 active:bg-[#f4f5ff]"
                style={{ borderColor: THEME.line }}
                aria-haspopup="dialog"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filter
                {activeFilterCount > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-black text-white" style={{ backgroundColor: THEME.brand }}>
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowFilterSheet(true)}
                className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border text-[12.5px] font-bold text-slate-700 active:bg-[#f4f5ff]"
                style={{ borderColor: THEME.line }}
                aria-haspopup="dialog"
              >
                <ArrowUpDown className="h-4 w-4" />
                Sort
              </button>
            </div>

            {/* Results toolbar (desktop) */}
            <div
              className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2"
              style={{ borderColor: THEME.line }}
            >
              <div className="min-w-0">
                <h1 className="truncate text-[14px] font-black tracking-tight text-slate-900 sm:text-[15px]">
                  {filters.q
                    ? `Results for “${filters.q}”`
                    : dealsOnly ? 'Today’s best deals' : filters.category || title}
                </h1>
                <p className="text-[11px] text-slate-500">
                  {loading
                    ? 'Loading products…'
                    : `${data?.total ?? 0} products · ${data?.vendors.length ?? 0} sellers`}
                  {activeVendor ? ` · ${activeVendor.vendor_name}` : ''}
                </p>
              </div>

              <div className="hidden items-center gap-1.5 lg:flex">
                <label className="flex items-center gap-1.5 rounded-lg border px-2 py-1.5" style={{ borderColor: THEME.line }}>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Sort</span>
                  <select
                    value={filters.sort}
                    onChange={(e) => setFilter({ sort: e.target.value as MarketplaceSortValue })}
                    aria-label="Sort products"
                    className="bg-transparent text-[11px] font-bold text-slate-700 focus:outline-none"
                  >
                    {SORTS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                {filters.q && (
                  <Chip label={`“${filters.q}”`} onRemove={() => { setSearchInput(''); setFilter({ q: undefined }); }} />
                )}
                {filters.category && <Chip label={filters.category} onRemove={() => setFilter({ category: undefined })} />}
                {(filters.minPrice != null || filters.maxPrice != null) && (
                  <Chip
                    label={`৳${filters.minPrice ?? 0} – ${filters.maxPrice != null ? bdt(filters.maxPrice) : '∞'}`}
                    onRemove={() => setFilter({ minPrice: null, maxPrice: null })}
                  />
                )}
                {activeVendor && <Chip label={activeVendor.vendor_name} onRemove={() => setFilter({ vendor: undefined })} />}
                {dealsOnly && <Chip label="Deals only" onRemove={() => setDealsOnly(false)} />}
              </div>
            )}

            {error && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                <span>
                  <b>Products are temporarily unavailable.</b> {error}
                </span>
                <button
                  type="button"
                  onClick={() => setFilter({})}
                  className="rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-bold text-amber-800"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Product grid */}
            {loading && products.length === 0 ? (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4 2xl:grid-cols-5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: THEME.line }}>
                    <div className="aspect-square animate-pulse bg-slate-100" />
                    <div className="space-y-2 p-3">
                      <div className="h-2.5 w-4/5 animate-pulse rounded bg-slate-100" />
                      <div className="h-2.5 w-2/5 animate-pulse rounded bg-slate-100" />
                      <div className="h-6 w-full animate-pulse rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-xl border bg-white py-16 text-center" style={{ borderColor: THEME.line }}>
                <LayoutGrid className="mx-auto mb-3 h-9 w-9 text-slate-300" />
                <div className="text-[13px] font-bold text-slate-700">No products match these filters</div>
                <div className="mt-1 text-[11px] text-slate-500">Try a wider price range or another category.</div>
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
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {products.map((product) => (
                    <ProductCard
                      key={String(product.id)}
                      product={product}
                      onAdd={handleAdd}
                      onVisitVendor={onVisitVendor}
                      onOpenProduct={setActiveProduct}
                    />
                  ))}
                </div>

                {data && data.page < data.pages && (
                  <div className="mt-5 flex justify-center">
                    <button
                      type="button"
                      onClick={loadMore}
                      disabled={appending}
                      className="flex items-center gap-2 rounded-xl border bg-white px-6 py-2.5 text-[12px] font-black text-slate-700 hover:border-[#3b2fd6] disabled:opacity-60"
                      style={{ borderColor: THEME.line }}
                    >
                      {appending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      Load more products
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>

      {/* ═════════ BASKET DRAWER ═════════ */}
      {showBasket && (
        // Mobile: a full-height BOTTOM SHEET (slides up, thumb-friendly).
        // Desktop: the familiar right-hand drawer.
        <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch" role="dialog" aria-modal="true" aria-label="Shopping basket">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={() => setShowBasket(false)} />
          <aside
            className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-none sm:h-full sm:max-w-md sm:rounded-none"
            style={{ animation: 'mmSheetUp .24s cubic-bezier(.2,.8,.2,1)' }}
          >
            {/* Grab handle (mobile only) */}
            <div className="flex justify-center pt-2 sm:hidden">
              <span className="h-1 w-10 rounded-full bg-slate-300" />
            </div>
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: THEME.line }}>
              <h2 className="flex items-center gap-2 text-[14px] font-black text-slate-900">
                <ShoppingBasket className="h-4 w-4" style={{ color: THEME.brand }} />
                Your basket ({basket.itemCount})
              </h2>
              <button
                type="button"
                onClick={() => setShowBasket(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
                aria-label="Close basket"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {basket.lines.length === 0 ? (
                <div className="py-20 text-center">
                  <ShoppingBasket className="mx-auto mb-3 h-10 w-10 text-slate-200" />
                  <div className="text-[13px] font-bold text-slate-700">Your basket is empty</div>
                  <div className="mt-1 text-[11px] text-slate-500">Add products from any seller to get started.</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Per-vendor grouping makes the split visible BEFORE checkout */}
                  {basket.vendors.map((vendor) => (
                    <div key={vendor.vendorId} className="rounded-lg border" style={{ borderColor: THEME.line }}>
                      <div className="flex items-center justify-between border-b bg-[#fafbff] px-2.5 py-1.5" style={{ borderColor: THEME.line }}>
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                          <Store className="h-3 w-3" style={{ color: THEME.brand }} />
                          {vendor.vendorName}
                        </span>
                        <span className="text-[10px] text-slate-500">{bdt(vendor.subtotal)}</span>
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
                                  alt={line.product.title}
                                  className="h-14 w-14 shrink-0 rounded-md border object-cover"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="line-clamp-2 text-[11.5px] font-semibold leading-snug text-slate-800">
                                    {line.product.title}
                                  </div>
                                  <div className="mt-1 flex items-center justify-between">
                                    <span className="text-[12px] font-black" style={{ color: THEME.ink }}>
                                      {bdt(Number(line.product.priceBDT || 0) * line.quantity)}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => basket.setQuantity(String(line.product.id), vendor.vendorId, line.quantity - 1)}
                                        className="rounded border p-0.5 text-slate-600 hover:bg-slate-50"
                                        aria-label="Decrease quantity"
                                        style={{ borderColor: THEME.line }}
                                      >
                                        <Minus className="h-3 w-3" />
                                      </button>
                                      <span className="w-6 text-center text-[11px] font-bold">{line.quantity}</span>
                                      <button
                                        type="button"
                                        onClick={() => basket.setQuantity(String(line.product.id), vendor.vendorId, line.quantity + 1)}
                                        className="rounded border p-0.5 text-slate-600 hover:bg-slate-50"
                                        aria-label="Increase quantity"
                                        style={{ borderColor: THEME.line }}
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
                  <div className="mb-2 rounded-lg px-2.5 py-2 text-[10.5px]" style={{ backgroundColor: THEME.accentSoft, color: '#92400e' }}>
                    <b>{basket.vendors.length} sellers</b> in this basket — each ships separately with its own tracking number.
                  </div>
                )}
                <div className="mb-2 flex items-center justify-between text-[13px]">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="text-[15px] font-black" style={{ color: THEME.ink }}>{bdt(basket.subtotal)}</span>
                </div>
                <button
                  type="button"
                  disabled={!basket.vendors[0]?.vendorSlug}
                  onClick={() => {
                    const first = basket.vendors[0];
                    if (!first?.vendorSlug) return;
                    setShowBasket(false);
                    onCheckout(first.vendorSlug);
                  }}
                  className="min-h-[48px] w-full rounded-xl text-[13px] font-black text-white disabled:opacity-50"
                  style={{ backgroundColor: THEME.brand }}
                >
                  Continue to checkout
                </button>
                <p className="mt-1.5 text-center text-[10px] text-slate-400">
                  You’ll be taken to the seller’s secure checkout.
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
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_20px_-6px_rgba(17,24,39,0.25)] backdrop-blur lg:hidden"
          style={{ borderColor: THEME.line }}
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
                  className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[9px] font-black text-slate-900"
                  style={{ backgroundColor: THEME.accent }}
                >
                  {basket.itemCount > 99 ? '99+' : basket.itemCount}
                </span>
              </span>
              <span className="text-[13px] font-bold">
                {basket.itemCount} {basket.itemCount === 1 ? 'item' : 'items'}
                {basket.vendors.length > 1 && (
                  <span className="ml-1 text-[11px] font-normal text-white/70">from {basket.vendors.length} sellers</span>
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
        <div className="fixed inset-0 z-50 flex items-end lg:hidden" role="dialog" aria-modal="true" aria-label="Filters and sort">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowFilterSheet(false)} />
          <div
            className="relative flex max-h-[88vh] w-full flex-col rounded-t-2xl bg-white"
            style={{ animation: 'mmSheetUp .24s cubic-bezier(.2,.8,.2,1)' }}
          >
            {/* Grab handle */}
            <div className="flex justify-center pb-1 pt-2.5">
              <span className="h-1 w-10 rounded-full bg-slate-300" />
            </div>

            <div className="flex items-center justify-between px-4 pb-2">
              <h2 className="text-[15px] font-black text-slate-900">Filter &amp; sort</h2>
              <button
                type="button"
                onClick={() => setShowFilterSheet(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
                aria-label="Close filters"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
              {/* Sort */}
              <section className="mb-4">
                <h3 className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">Sort by</h3>
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
                          backgroundColor: active ? '#eef0ff' : '#fff',
                          color: active ? THEME.brand : '#475569',
                        }}
                      >
                        <span className="truncate">{s.label}</span>
                        {active && <Check className="h-4 w-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Price */}
              <section className="mb-4">
                <h3 className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">Price range</h3>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={filters.minPrice ?? ''}
                    onChange={(e) => setFilter({ minPrice: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="Min ৳"
                    aria-label="Minimum price"
                    className="min-h-[44px] w-full rounded-lg border px-3 text-[13px] focus:border-[#3b2fd6] focus:outline-none"
                    style={{ borderColor: THEME.line }}
                  />
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={filters.maxPrice ?? ''}
                    onChange={(e) => setFilter({ maxPrice: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="Max ৳"
                    aria-label="Maximum price"
                    className="min-h-[44px] w-full rounded-lg border px-3 text-[13px] focus:border-[#3b2fd6] focus:outline-none"
                    style={{ borderColor: THEME.line }}
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
                          backgroundColor: active ? '#eef0ff' : '#fff',
                          color: active ? THEME.brand : '#475569',
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
                <h3 className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">Categories</h3>
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
                          backgroundColor: active ? '#eef0ff' : '#fff',
                          color: active ? THEME.brand : '#475569',
                        }}
                      >
                        {cat.name}
                        <span className="ml-1 text-[10px] text-slate-400">({cat.product_count})</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Vendors */}
              <section className="mb-2">
                <h3 className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">Sellers</h3>
                <div className="relative mb-2">
                  <Store className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={vendorQuery}
                    onChange={(e) => setVendorQuery(e.target.value)}
                    placeholder="Search sellers"
                    aria-label="Filter by vendor"
                    className="min-h-[44px] w-full rounded-lg border pl-9 pr-3 text-[13px] focus:border-[#3b2fd6] focus:outline-none"
                    style={{ borderColor: THEME.line }}
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
                          backgroundColor: active ? '#eef0ff' : '#fff',
                        }}
                      >
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                          style={{ borderColor: active ? THEME.brand : '#cbd5e1', backgroundColor: active ? THEME.brand : '#fff' }}
                        >
                          {active && <Check className="h-3 w-3 text-white" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: active ? THEME.brand : '#475569' }}>
                          {vendor.vendor_name}
                          <span className="ml-1 text-[11px] font-normal text-slate-400">({vendor.product_count})</span>
                        </span>
                      </button>
                    );
                  })}
                  {vendorFacets.length === 0 && (
                    <div className="py-2 text-center text-[12px] text-slate-400">No sellers match.</div>
                  )}
                </div>
              </section>
            </div>

            {/* Sheet footer — the primary action is always reachable */}
            <div className="flex gap-2 border-t px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3" style={{ borderColor: THEME.line }}>
              <button
                type="button"
                onClick={() => { clearAll(); }}
                className="min-h-[48px] flex-1 rounded-xl border text-[13px] font-bold text-slate-700 active:bg-slate-50"
                style={{ borderColor: THEME.line }}
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
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setShowMenu(false)} />
          <aside
            className="relative flex h-full w-[82%] max-w-[320px] flex-col bg-white shadow-2xl"
            style={{ animation: 'mmDrawerIn .22s ease-out' }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: THEME.line }}>
              <span className="text-[15px] font-black" style={{ color: THEME.ink }}>
                ZID<span style={{ color: THEME.brand }}>Market</span>
              </span>
              <button
                type="button"
                onClick={() => setShowMenu(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain py-2">
              <button
                type="button"
                onClick={() => { setShowMenu(false); onOpenAccount?.(); }}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[14px] font-bold text-slate-800 active:bg-slate-50"
              >
                <User className="h-5 w-5 text-slate-500" />
                My account
              </button>
              <button
                type="button"
                onClick={() => { setShowMenu(false); setShowBasket(true); }}
                className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[14px] font-bold text-slate-800 active:bg-slate-50"
              >
                <ShoppingBasket className="h-5 w-5 text-slate-500" />
                Basket ({basket.itemCount})
              </button>

              <div className="my-2 border-t" style={{ borderColor: THEME.line }} />

              <div className="px-4 pb-1 pt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Shop by category
              </div>
              <button
                type="button"
                onClick={() => { setShowMenu(false); setFilter({ category: undefined }); }}
                className="flex min-h-[48px] w-full items-center px-4 text-left text-[13.5px] font-semibold text-slate-700 active:bg-slate-50"
              >
                All categories
              </button>
              {(data?.categories || []).map((cat) => (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => { setShowMenu(false); setFilter({ category: cat.name }); }}
                  className="flex min-h-[48px] w-full items-center justify-between px-4 text-left text-[13.5px] font-semibold active:bg-slate-50"
                  style={{ color: filters.category === cat.name ? THEME.brand : '#334155' }}
                >
                  <span className="truncate">{cat.name}</span>
                  <span className="ml-2 text-[11px] text-slate-400">({cat.product_count})</span>
                </button>
              ))}

              {onGoToPlans && (
                <>
                  <div className="my-2 border-t" style={{ borderColor: THEME.line }} />
                  <button
                    type="button"
                    onClick={() => { setShowMenu(false); onGoToPlans(); }}
                    className="flex min-h-[48px] w-full items-center px-4 text-left text-[13.5px] font-semibold text-slate-700 active:bg-slate-50"
                  >
                    Sell on ZID
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
          product={activeProduct}
          onClose={() => setActiveProduct(null)}
          onAdd={(p) => { handleAdd(p); setActiveProduct(null); }}
          onVisitVendor={(slug) => { setActiveProduct(null); onVisitVendor(slug); }}
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
      `}</style>
    </div>
  );
};

/* ─────────────────────────── helper components ─────────────────────────── */

const Chip: React.FC<{ label: string; onRemove: () => void }> = ({ label, onRemove }) => (
  <span
    className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold text-slate-600"
    style={{ borderColor: THEME.line, backgroundColor: THEME.surface }}
  >
    {label}
    <button type="button" onClick={onRemove} aria-label={`Remove ${label} filter`} className="text-slate-400 hover:text-rose-600">
      <X className="h-3 w-3" />
    </button>
  </span>
);

/** Compact product detail overlay — comparison review without leaving the grid. */
const QuickView: React.FC<{
  product: MarketplaceProduct;
  onClose: () => void;
  onAdd: (product: MarketplaceProduct) => void;
  onVisitVendor: (slug: string) => void;
}> = ({ product, onClose, onAdd, onVisitVendor }) => {
  const p = product as any;
  const image = p.image || p.image_url || p.imageUrl;
  const tags: string[] = Array.isArray(p.category_tags) && p.category_tags.length ? p.category_tags : [p.category].filter(Boolean);

  return (
    // Mobile: bottom sheet anchored to the bottom edge (natural thumb reach) and
    // scrollable. Desktop: a centred two-column dialog.
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={product.title}>
      <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="relative grid max-h-[90vh] w-full overflow-y-auto overscroll-contain rounded-t-2xl bg-white shadow-2xl sm:max-h-[92vh] sm:max-w-3xl sm:rounded-2xl md:grid-cols-2"
        style={{ animation: 'mmSheetUp .24s cubic-bezier(.2,.8,.2,1)' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-slate-600 shadow active:bg-slate-100 sm:right-3 sm:top-3 sm:h-9 sm:w-9"
          aria-label="Close"
        >
          <X className="h-5 w-5 sm:h-4 sm:w-4" />
        </button>
        <div className="aspect-[4/3] bg-[#f8fafc] sm:aspect-square">
          <SafeImage src={image} alt={product.title} className="h-full w-full object-cover" />
        </div>
        <div className="flex flex-col p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:p-5">
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ backgroundColor: '#eef0ff', color: THEME.brand }}>
                {tag}
              </span>
            ))}
          </div>
          <h2 className="mt-2 text-lg font-black leading-tight text-slate-900">{product.title}</h2>
          <div className="mt-1.5">
            <RatingStars rating={Number(p.rating || 0)} count={Number(p.review_count || 0)} />
          </div>

          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black" style={{ color: THEME.ink }}>{bdt(Number(product.priceBDT || 0))}</span>
            {Number(p.compare_at_price || 0) > Number(product.priceBDT || 0) && (
              <>
                <span className="text-sm text-slate-400 line-through">{bdt(Number(p.compare_at_price))}</span>
                <span className="rounded px-1.5 py-0.5 text-[11px] font-black text-white" style={{ backgroundColor: THEME.danger }}>
                  -{p.discount_percent}%
                </span>
              </>
            )}
          </div>

          {p.descriptionEn || p.description_en ? (
            <p className="mt-3 line-clamp-4 text-[12px] leading-relaxed text-slate-600">
              {p.descriptionEn || p.description_en}
            </p>
          ) : null}

          <div className="mt-4 rounded-xl border p-3" style={{ borderColor: THEME.line }}>
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Sold by</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <Store className="h-4 w-4 shrink-0" style={{ color: THEME.brand }} />
                <span className="truncate text-[13px] font-black text-slate-800">{product.vendor_name}</span>
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

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => onAdd(product)}
              disabled={String(p.stock_status) === 'out_of_stock'}
              className="min-h-[48px] flex-1 rounded-xl text-[13px] font-black text-white disabled:opacity-45"
              style={{ backgroundColor: THEME.brand }}
            >
              Add to basket
            </button>
            <button
              type="button"
              onClick={() => product.vendor_slug && onVisitVendor(product.vendor_slug)}
              className="min-h-[48px] rounded-xl border px-4 text-[13px] font-bold text-slate-700 active:bg-slate-50"
              style={{ borderColor: THEME.line }}
            >
              Buy from store
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
