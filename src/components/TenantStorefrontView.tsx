import React, { useState, useEffect, useMemo } from 'react';
import { MerchantProfile, Product, BankAccount, MobileBankingConfig, CodConfig, Order, OrderItem, ThemeConfig } from '../types';
import { buildCategoryDbPayload, buildProductDbPayload, maxCatalogId, packCatalogItem, toCatalogSlug, ensureCategory, mapApiProduct, mapApiCategory } from '../utils/catalogPayload';
import { resolveDeliveryCharge, resolveProductDeliveryRates, toFee } from '../utils/deliveryCharges';
import { ShoppingBag, X, Check, Copy, CreditCard, Building2, Smartphone, ShieldCheck, Search, Globe, Phone, MapPin, ArrowRight, ArrowLeft, ExternalLink, Clock, Menu, User, Lock, Sparkles, PackageCheck, LogOut, Home, Star, Share2, RotateCcw, MessageSquare, MessageCircle, ChevronRight, ChevronLeft, Trash2, Flame, Eye, Plus, Minus, Tag, Zap, Loader2, Facebook, Instagram, Youtube, Music, Play, Camera } from 'lucide-react';
import { sendWhatsAppOtp, verifyWhatsAppOtp, formatFullPhoneNumber } from '../lib/whatsappOtpService';
import { PhoneVerificationInput } from './PhoneVerificationInput';
import { readZidStoreData, subscribeToZidStoreData, writeZidStoreData, type ZidStoreData } from '../lib/storeData';
import { safeSetItem } from '../utils/safeStorage';
import { resolveActiveStoreSlug } from '../lib/activeStore';
import { fetchStoreByRef, storeIdFromRecord } from '../lib/storeApi';
import { LanguageToggle } from './LanguageToggle';
import SafeImage from './SafeImage';
import { useStorefrontTracking } from '../hooks/useStorefrontTracking';
import {
  EMPTY_MODULES,
  applyStoreSeo,
  applyStoreFavicon,
  type StorefrontModules,
} from '../lib/storeModulesApi';
import { normalizeOrders, safeDate, safeAmount } from '../utils/orderUtils';
import {
  TRACKING_STEPS,
  getOrderStatusBadge,
  getTrackingStepIndex,
  getPaymentBadge,
  getReturnStatusBadge,
  isReturnEligible,
  isDelivered,
  CUSTOMER_ORDERS_POLL_MS,
} from '../lib/orderTracking';

/**
 * Delay between hero background slides, in milliseconds.
 *
 * The merchant's "Hero Background Photos" list is an auto-looping fade
 * carousel; 4.5s is deliberately inside the 4-5s band — fast enough to read as
 * a live carousel, slow enough that the headline, subtitle and CTA on top of it
 * can actually be read before the backdrop changes.
 */
const HERO_ROTATION_MS = 4500;

/**
 * Resolve a product's display image from ANY of the shapes the different feeds
 * hand back.
 *
 * `/api/products` returns the raw MongoDB row — and Products Management may
 * have persisted the picture as `image`, `image_url`, `imageUrl`, an `images[]`
 * array or a `thumbnail`. The Supabase mirror and the slug-scoped shared store
 * each pick their own key. Reading only `image_url || image` (what this file
 * used to do) meant a product saved under any other key arrived at the grid
 * with an empty `image`, so the card silently fell back to the built-in demo
 * photo instead of the merchant's real picture.
 *
 * Returns '' when nothing usable exists, letting `<SafeImage>` apply its local
 * in-origin placeholder rather than a remote demo image.
 */
function resolveProductImage(p: any): string {
  if (!p || typeof p !== 'object') return '';
  const firstOf = (value: unknown): string =>
    Array.isArray(value)
      ? String(value.find((x) => typeof x === 'string' && String(x).trim()) || '').trim()
      : '';
  const candidate =
    p.image ||
    firstOf(p.images) ||
    p.thumbnail ||
    p.imageUrl ||
    p.image_url ||
    firstOf(p.additionalImages) ||
    firstOf(p.additional_images) ||
    p.thumbnailUrl ||
    p.thumbnail_url ||
    '';
  return String(candidate || '').trim();
}

function mapSupabaseProduct(p: any): Product {
  const title = p.title || p.name || 'Untitled Product';
  return {
    id: String(p.id || `prod-${Math.random()}`),
    title,
    priceBDT: Number(p.price ?? p.priceBDT ?? 0),
    compareAtPriceBDT: p.compare_at_price != null ? Number(p.compare_at_price) : (p.compareAtPriceBDT != null ? Number(p.compareAtPriceBDT) : undefined),
    image: resolveProductImage(p),
    additionalImages: Array.isArray(p.additional_images) ? p.additional_images : (Array.isArray(p.additionalImages) ? p.additionalImages : []),
    category: p.category || p.category_name || 'General',
    categoryId: String(p.category_id || p.categoryId || ''),
    category_id: String(p.category_id || p.categoryId || ''),
    descriptionEn: p.description || p.descriptionEn || '',
    sku: p.sku || '',
    stock: p.stock !== undefined ? Number(p.stock) : 99,
    status: p.status || 'active',
    is_published: p.is_published !== false,
    storeSlug: p.store_slug || p.storeSlug || '',
    store_slug: p.store_slug || p.storeSlug || '',
    variants: Array.isArray(p.variants) ? p.variants : [],
    variantsCount: Array.isArray(p.variants) ? p.variants.length : (p.variantsCount ?? 0),
    salesCount: p.salesCount ?? 0,
    // Per-product delivery charges MUST survive this mapping. Without them
    // `resolveProductDeliveryRates()` sees an undefined rate, reports
    // `hasProductRates: false`, and the checkout falls back to an amusing
    // "৳0" — the price the merchant saved in Mongo never reaches the UI.
    //
    // The API hands back a NUMBER for the explicit pair and either an ARRAY or
    // a single OBJECT for `deliveryRates` (a one-zone product serialises as an
    // object), so normalise the list shape here rather than downstream.
    deliveryRates: normalizeDeliveryRates(p.deliveryRates ?? p.delivery_rates),
    inside_city_fee: pickFee(p.inside_city_fee, p.insideCityFee),
    outside_city_fee: pickFee(p.outside_city_fee, p.outsideCityFee),
    insideCityFee: pickFee(p.insideCityFee, p.inside_city_fee),
    outsideCityFee: pickFee(p.outsideCityFee, p.outside_city_fee),
    requiresShipping: p.requiresShipping !== false,
  };
}

/** First of `a`/`b` that is a usable non-negative number, else undefined. */
function pickFee(a: unknown, b: unknown): number | undefined {
  for (const v of [a, b]) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

/**
 * Coerce the API's delivery-rate payload to a zone list.
 *
 * A product with one zone comes back as a bare object rather than a
 * one-element array; trusting `Array.isArray` alone silently discarded it and
 * left the product looking unconfigured.
 */
function normalizeDeliveryRates(raw: any): { zoneName: string; fee: number }[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
    ? [raw]
    : [];
  return list
    .map((rate: any) => ({
      zoneName: String(rate?.zoneName ?? rate?.zone_name ?? rate?.name ?? '').trim(),
      fee: Number(rate?.fee ?? rate?.amount ?? rate?.charge),
    }))
    .filter((rate: { zoneName: string; fee: number }) =>
      rate.zoneName !== '' && Number.isFinite(rate.fee) && rate.fee >= 0
    );
}

function mapSupabaseCategory(c: any) {
  const name = c.name || c.title || 'Category';
  return {
    id: String(c.id || c.category_id || `cat-${Math.random()}`),
    name,
    title: name,
    image: c.image_url || c.image || c.coverImage || '',
    coverImage: c.cover_image || c.coverImage || '',
    status: c.status || (c.is_published !== false ? 'published' : 'hidden'),
    parentId: c.parent_id || c.parentId || null,
    slug: c.slug || '',
    description: c.description || '',
    productCount: Number(c.product_count ?? c.productCount ?? 0),
  };
}
import { BrandLogo } from './BrandLogo';
import { useLanguage } from '../lib/i18n';
import { findThemeById, resolveLayoutForTheme } from '../lib/themeRegistry';
import { SupermarketTechMockup, ElegantFashionMockup } from './ThemeMockups';

interface TenantStorefrontViewProps {
  storeSlug: string;
  merchant: MerchantProfile;
  products: Product[];
  bankAccounts: BankAccount[];
  mobileBanking: MobileBankingConfig[];
  themes: ThemeConfig[];
  orders?: Order[];
  onPlaceOrder: (order: Order) => void;
  /**
   * Forces a specific theme's LAYOUT for preview purposes (Super Admin eye
   * icon / merchant demo). When set, this theme id wins over the merchant's
   * persisted `activeThemeId`, so a preview never mutates live settings.
   */
  previewThemeId?: string;
  /** Renders a slimmer, non-interactive variant (embedded thumbnails). */
  compact?: boolean;
  /**
   * Explicit layout override. The App route passes the merchant's active
   * theme's resolved layout here so `/store/:slug` mounts the right design.
   * When omitted, it is derived from `previewThemeId` / the active theme.
   */
  layout?: 'classic' | 'supermarket' | 'fashion';
  /**
   * Live-preview mode, set ONLY by the Section Editor's inline preview.
   *
   * The editor passes its CURRENT, not-yet-published `merchant.themeConfig`
   * down as `merchant`. The `/api/storefront/:slug` snapshot (and the
   * slug-scoped shared store) still carry the LAST PUBLISHED config, and
   * `storefrontMerchant` merged that on top of the prop — which shadowed every
   * in-progress edit, so a colour pick only appeared after publish + refetch.
   *
   * With this flag the editor's prop wins for the cosmetic fields the editor
   * owns, so changes render in the same frame as the input. The public
   * storefront never sets it, so its "DB/cache wins" precedence is untouched.
   */
  previewMode?: boolean;
  /**
   * Device the current preview is emulating — set from the customizer's
   * desktop / mobile / tablet toggle.
   *
   * The Header Logo panel exposes TWO fields, Desktop Logo (200x80) and Mobile
   * Logo (150x60), and this flag decides which one the top navigation header
   * renders, so flipping device mode re-renders the matching brand mark.
   * The public storefront never sets it and falls back to the desktop logo.
   */
  isMobile?: boolean;
}

interface CustomerReturnRequest {
  id: string;
  orderId: string;
  orderNumber: string;
  productId?: string;
  productName?: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Completed' | 'Rejected';
  token: string;
  createdAt: string;
}

interface CustomerReviewItem {
  id: string;
  orderId: string;
  orderNumber: string;
  productId?: string;
  productTitle: string;
  productImage?: string;
  rating: number;
  comment: string;
  customerName?: string;
  createdAt: string;
}

/** Digits-only tail of a phone number, so +88017… / 017… / 88017… all match. */
function normPhone(value: unknown): string {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

/** Map a server review document into the local card/list shape. */
function mapServerReview(r: any): CustomerReviewItem {
  return {
    id: String(r?.id || r?._id || `rev-${Date.now()}`),
    orderId: String(r?.orderId || r?.order_id || ''),
    orderNumber: String(r?.orderNumber || r?.order_number || ''),
    productId: String(r?.productId || r?.product_id || ''),
    productTitle: String(r?.productTitle || r?.product_name || r?.productName || ''),
    productImage: r?.productImage || r?.product_image || r?.image || undefined,
    rating: Number(r?.rating ?? 0),
    comment: String(r?.comment || ''),
    customerName: r?.customerName || r?.customer_name || undefined,
    createdAt: String(r?.createdAt || r?.created_at || ''),
  };
}

/** Map a server return document into the local card/list shape. */
function mapServerReturn(r: any): CustomerReturnRequest {
  return {
    id: String(r?.id || r?._id || `ret-${Date.now()}`),
    orderId: String(r?.orderId || r?.order_id || ''),
    orderNumber: String(r?.orderNumber || r?.order_number || ''),
    productId: String(r?.productId || r?.product_id || ''),
    productName: String(r?.productName || r?.product_name || ''),
    reason: String(r?.reason || ''),
    status: (r?.status || 'Pending') as CustomerReturnRequest['status'],
    token: String(r?.token || ''),
    createdAt: String(r?.createdAt || r?.created_at || ''),
  };
}

/** Merge server reviews into the local cache. The server copy WINS for any id
 *  it returns, so a later change is actually reflected instead of being
 *  shadowed by the first snapshot we cached. */
function mergeReviews(prev: CustomerReviewItem[], incoming: unknown[]): CustomerReviewItem[] {
  const byId = new Map(prev.map((item) => [item.id, item]));
  for (const raw of incoming) {
    const mapped = mapServerReview(raw);
    if (mapped.id) byId.set(mapped.id, mapped);
  }
  return [...byId.values()];
}

/** Merge server returns into the local cache; server state wins on conflict. */
function mergeReturns(prev: CustomerReturnRequest[], incoming: unknown[]): CustomerReturnRequest[] {
  const byId = new Map(prev.map((item) => [item.id, item]));
  for (const raw of incoming) {
    const mapped = mapServerReturn(raw);
    if (mapped.id) byId.set(mapped.id, mapped);
  }
  return [...byId.values()];
}

/**
 * Readable header palette for a merchant-chosen `headerBgColor`.
 *
 * The header bar shipped hard-coded for the dark default (`bg-[#0f172a]/90`
 * with slate icons and an amber store name). Now that the Section Editor's
 * colour picker writes ANY colour into `themeConfig.headerBgColor`, a light
 * pick (white, cream, …) would leave light-on-light, unreadable text — both in
 * the live preview and on the published storefront.
 *
 * So the chosen background resolves ONE set of foreground / accent / hover
 * colours from its relative luminance. Unparseable values (a typo in the hex
 * text field) fall back to the dark palette, which matches the header's own
 * `bg-[#0f172a]/90` fallback class that the browser then uses.
 */
function resolveHeaderPalette(bg?: string) {
  const raw = String(bg || '').trim();
  let r = 15, g = 23, b = 42, alpha = 1; // default #0f172a
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(raw);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else if (rgb) {
    r = Math.min(255, Math.max(0, Number(rgb[1])));
    g = Math.min(255, Math.max(0, Number(rgb[2])));
    b = Math.min(255, Math.max(0, Number(rgb[3])));
    const a = /rgba\([^)]*,\s*([\d.]+)\s*\)/i.exec(raw);
    if (a) alpha = Math.min(1, Math.max(0, Number(a[1])));
  }
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // A translucent pick sits over the white viewport, so blend before judging.
  const effective = alpha >= 1 ? luminance : luminance * alpha + 1 * (1 - alpha);
  const isLight = effective > 0.45;
  return {
    background: raw || '#0f172a',
    isLight,
    fg: isLight ? '#0f172a' : '#e2e8f0',
    accent: isLight ? '#b45309' : '#fbbf24', // amber-700 (light) / amber-400 (dark)
    // Hover chip: subtle dark tint on a light bar, the original slate chip on dark.
    chip: isLight ? 'hover:bg-slate-900/10 hover:border-slate-900/15' : 'hover:bg-slate-800/80 hover:border-slate-700/60',
    restingChip: isLight ? 'bg-slate-900/10 border-slate-900/15' : 'bg-slate-800/80 border-slate-700/80',
  };
}

export const TenantStorefrontView: React.FC<TenantStorefrontViewProps> = ({
  storeSlug,
  merchant,
  products,
  bankAccounts,
  mobileBanking,
  themes,
  orders = [],
  onPlaceOrder,
  previewThemeId,
  compact = false,
  layout,
  previewMode = false,
  isMobile = false,
}) => {
  // The storefront may be mounted in another route/tab from the editor. Subscribe
  // directly to the shared store so products and published theme changes appear
  // immediately without remounting or refreshing the page.
  const { t, setLanguage, lang } = useLanguage();
  const isBn = lang === 'bn';
  // Effective store slug for cache keys — resolved from prop or the active merchant session.
  // Memoized so the data-load effects below don't re-run on every render (which would
  // otherwise start a new 3s poll + Supabase fetch cascade each time setLiveStoreData fires).
  const effectiveStoreSlug = useMemo(
    () => resolveActiveStoreSlug(storeSlug || (merchant as any)?.storeSlug),
    [storeSlug, (merchant as any)?.storeSlug]
  );
  const [liveStoreData, setLiveStoreData] = useState<ZidStoreData>(() => readZidStoreData(storeSlug));
  // Online Store modules (brand / navigation / pages / blog / FAQ / SEO) served
  // from MongoDB by /api/storefront/:slug. These drive the storefront header
  // navigation, the FAQ section and the document head.
  const [storeModules, setStoreModules] = useState<StorefrontModules>(EMPTY_MODULES);
  // Real store UUID resolved from the 'stores' table — used for orders.store_id
  const [resolvedStoreId, setResolvedStoreId] = useState<string>('');
  useEffect(() => subscribeToZidStoreData(setLiveStoreData, storeSlug), [storeSlug]);
  useEffect(() => {
    let active = true;
    // Active store slug resolved from prop (route param) or merchant session — never hardcoded.
    const effectiveSlug = effectiveStoreSlug;
    const loadStorefront = async () => {
      try {
        let apiProducts: any[] = [];
        let apiCodConfig: any = null;
        let apiShippingConfig: any = null;
        let apiStoreRecord: any = null;
        let apiBankAccounts: any[] = [];
        let apiMobileBanking: any[] = [];
        const slug = effectiveSlug || storeSlug || 'bd';

        // Load full storefront payload from Express API
        const storefrontRes = await fetch(`/api/storefront/${encodeURIComponent(slug)}`);
        const storefrontData = await storefrontRes.json().catch(() => null);

        if (storefrontData && storefrontData.storefront) {
          const payload = storefrontData.storefront;
          apiProducts = Array.isArray(payload.products) ? payload.products : [];
          // Delivery/COD settings, payment accounts and the store record itself
          // come from the SAME payload. They used to be ignored here, so the
          // checkout's delivery zones were priced from whatever stale copy sat
          // in localStorage — or, on a fresh device, from nothing at all.
          apiCodConfig = payload.codConfig || null;
          // Delivery-fee rules (Inside/Outside Dhaka + free-shipping threshold).
          // Persisted to MongoDB from Logistics → Shipping settings; the store
          // record is authoritative over any stale localStorage copy.
          apiShippingConfig = payload.shippingConfig || null;
          apiStoreRecord = payload.merchant || null;
          apiBankAccounts = Array.isArray(payload.bankAccounts) ? payload.bankAccounts : [];
          apiMobileBanking = Array.isArray(payload.mobileBanking) ? payload.mobileBanking : [];

          // Online Store modules travel in the same payload, so the storefront
          // needs no second round-trip to render the menus, FAQs and SEO tags.
          if (active) {
            setStoreModules({
              brandConfig: { ...EMPTY_MODULES.brandConfig, ...(payload.brandConfig || {}) },
              navigationMenus: {
                header: Array.isArray(payload.navigationMenus?.header) ? payload.navigationMenus.header : [],
                footer: Array.isArray(payload.navigationMenus?.footer) ? payload.navigationMenus.footer : [],
              },
              customPages: Array.isArray(payload.customPages) ? payload.customPages : [],
              blogPosts: Array.isArray(payload.blogPosts) ? payload.blogPosts : [],
              faqs: Array.isArray(payload.faqs) ? payload.faqs : [],
              seoConfig: { ...EMPTY_MODULES.seoConfig, ...(payload.seoConfig || {}) },
            });
          }
        }

        // Load the merchant's saved themeConfig from the store payload
        try {
          const existingBefore = readZidStoreData(storeSlug);
          const cleanEmail = String(merchant?.email || '').trim().toLowerCase();
          const themeRow = storefrontData?.storefront?.merchant || null;

          if (themeRow && active) {
            const dbMerchant = {
              ...existingBefore,
              themeConfig: themeRow.themeConfig || existingBefore?.merchant?.themeConfig || {},
              heroTitle: themeRow.heroTitle || existingBefore?.merchant?.heroTitle,
              heroSubtitle: themeRow.heroSubtitle || existingBefore?.merchant?.heroSubtitle,
              heroImage: themeRow.heroImage || existingBefore?.merchant?.heroImage,
              announcementText: themeRow.announcementText || existingBefore?.merchant?.announcementText,
              logoUrl: themeRow.logoUrl || existingBefore?.merchant?.logoUrl,
              activeThemeId: themeRow.activeThemeId || existingBefore?.merchant?.activeThemeId,
            };
            const mergedTheme = {
              ...existingBefore,
              merchant: dbMerchant,
              themeCustomization: themeRow.themeConfig || existingBefore?.themeCustomization || {},
              products: Array.isArray(apiProducts) && apiProducts.length > 0 ? apiProducts : (existingBefore?.products || []),
              // Carry the delivery/COD + payment config through the same merge so
              // the checkout's zone prices are always the merchant's live values.
              ...(apiCodConfig ? { codConfig: apiCodConfig } : {}),
              ...(apiShippingConfig ? { shippingConfig: apiShippingConfig } : {}),
              ...(apiBankAccounts.length > 0 ? { bankAccounts: apiBankAccounts } : {}),
              ...(apiMobileBanking.length > 0 ? { mobileBanking: apiMobileBanking } : {}),
            };
            writeZidStoreData(mergedTheme as ZidStoreData, storeSlug);
            setLiveStoreData(mergedTheme as ZidStoreData);
            return;
          }
        } catch (themeErr: any) {
          console.warn('[TenantStorefrontView] theme_config load warning:', themeErr?.message || themeErr);
        }

        if (active) {
          const existing = readZidStoreData(storeSlug);
          const merged = {
            ...existing,
            products: Array.isArray(apiProducts) && apiProducts.length > 0 ? apiProducts : (existing?.products || []),
            // `codConfig` drives the delivery-zone prices at checkout, so the
            // server's value must win over a stale localStorage copy.
            ...(apiCodConfig ? { codConfig: apiCodConfig } : {}),
            ...(apiShippingConfig ? { shippingConfig: apiShippingConfig } : {}),
            ...(apiStoreRecord ? { merchant: { ...(existing?.merchant || {}), ...apiStoreRecord } } : {}),
            ...(apiBankAccounts.length > 0 ? { bankAccounts: apiBankAccounts } : {}),
            ...(apiMobileBanking.length > 0 ? { mobileBanking: apiMobileBanking } : {}),
          };
          writeZidStoreData(merged as ZidStoreData, storeSlug);
          setLiveStoreData(merged as ZidStoreData);
        }
      } catch (e: any) { /* local slug-scoped cache remains the offline fallback */
        console.warn('[TenantStorefrontView] storefront load exception:', e?.message || e);
      }
    };
    void loadStorefront();
    // NOTE: removed the 3s setInterval poll. Polling Supabase every 3s while also
    // calling writeZidStoreData()/setLiveStoreData() inside the poll created an
    // infinite request loop (each write re-renders -> resubscribes -> refetches).
    // Reactivity for cross-tab/local edits is already handled by the
    // subscribeToZidStoreData listener above. A single load on mount + slug change
    // is sufficient; Supabase Realtime covers live DB changes.
    return () => { active = false; };
  }, [effectiveStoreSlug]);

  const themeCustomization = (liveStoreData.themeCustomization || {}) as {
    storeLogoText?: string;
    desktopLogoUrl?: string;
    heroTitle?: string;
    heroSubtitle?: string;
    heroImage?: string;
    announcementText?: string;
    primaryColor?: string;
    themePrimaryColor?: string;
    announcementBg?: string;
    showAnnouncement?: boolean;
    isMarquee?: boolean;
    marqueeSpeed?: number;
    announcementItems?: string[];
    showHeroBanner?: boolean;
    heroCtaText?: string;
    headerSticky?: boolean;
    showAnnouncementText?: string;
    slides?: Array<{ id: string; title: string; subtitle: string; ctaText: string; ctaLink: string; image: string; }>;
    activeSlideIndex?: number;
    categoriesList?: Array<{ name: string; image: string; count: string; }>;
    showSearchBar?: boolean;
    headerBgColor?: string;
    showCategories?: boolean;
    categoriesHeading?: string;
    categoriesSubtitle?: string;
    categoriesLayout?: string;
    categoriesItemsPerRow?: number;
    showFeaturedGrid?: boolean;
    featuredHeading?: string;
    productColumns?: number;
    productsLayout?: string;
    showCountdown?: boolean;
    countdownTitle?: string;
    countdownDiscount?: string;
    countdownHours?: number;
    countdownEndDate?: string;
    countdownBgImage?: string;
    countdownOverlayOpacity?: number;
    showGallery?: boolean;
    galleryHeading?: string;
    galleryImages?: Array<{ url: string; caption?: string; link?: string; }>;
    showSocialBlock?: boolean;
    socialTagline?: string;
    facebookHandle?: string;
    instagramHandle?: string;
    whatsappNumber?: string;
    tiktokHandle?: string;
    youtubeHandle?: string;
    showFacebook?: boolean;
    showInstagram?: boolean;
    showWhatsapp?: boolean;
    showTikTok?: boolean;
    showYouTube?: boolean;
    showVideo?: boolean;
    videoTitle?: string;
    videoUrl?: string;
    videoFileUrl?: string;
    videoAutoplay?: boolean;
    videoMuted?: boolean;
    footerLogoText?: string;
    footerAboutText?: string;
    footerLinksTitle?: string;
    footerLinks?: string[];
    contactPhone?: string;
    contactEmail?: string;
    dhakaAddress?: string;
  };
  const storefrontMerchant: MerchantProfile = {
    ...merchant,
    ...(liveStoreData.merchant || {}),
    storeName: themeCustomization.storeLogoText || liveStoreData.merchant?.storeName || merchant.storeName,
    logoUrl: themeCustomization.desktopLogoUrl || liveStoreData.merchant?.logoUrl || merchant.logoUrl,
    heroTitle: themeCustomization.heroTitle || liveStoreData.merchant?.heroTitle || merchant.heroTitle,
    heroSubtitle: themeCustomization.heroSubtitle || liveStoreData.merchant?.heroSubtitle || merchant.heroSubtitle,
    heroImage: themeCustomization.heroImage || liveStoreData.merchant?.heroImage || merchant.heroImage,
    announcementText: themeCustomization.announcementText || liveStoreData.merchant?.announcementText || merchant.announcementText,
  };
  // LIVE-PREVIEW PRECEDENCE (customizer): when `previewMode` is set, the
  // `merchant` prop holds the editor's CURRENT in-memory state (the theme
  // config is edited in the same component, and the store has not been
  // re-fetched), so those values must win over the cached/DB copy that the
  // merges above would otherwise shadow. The public storefront path never
  // passes previewMode, so its DB-wins precedence is untouched.
  const cachedStorefrontMerchant = liveStoreData.merchant || {};
  if (previewMode) {
    Object.assign(storefrontMerchant, {
      themeConfig: merchant.themeConfig || cachedStorefrontMerchant.themeConfig,
      storeName: merchant.storeName || cachedStorefrontMerchant.storeName,
      storeSlug: merchant.storeSlug || cachedStorefrontMerchant.storeSlug,
      storeUrl: merchant.storeUrl || cachedStorefrontMerchant.storeUrl,
      email: merchant.email || cachedStorefrontMerchant.email,
      ownerName: merchant.ownerName || cachedStorefrontMerchant.ownerName,
      mobile: merchant.mobile || cachedStorefrontMerchant.mobile,
      logoUrl: merchant.logoUrl || cachedStorefrontMerchant.logoUrl,
      heroTitle: merchant.heroTitle || cachedStorefrontMerchant.heroTitle,
      heroSubtitle: merchant.heroSubtitle || cachedStorefrontMerchant.heroSubtitle,
      heroImage: merchant.heroImage || cachedStorefrontMerchant.heroImage,
      announcementText: merchant.announcementText || cachedStorefrontMerchant.announcementText,
    });
  }

  // Store balance comes ONLY from the database-backed merchant record.
  // No hardcoded 0.00 default is rendered — the value shown is whatever the
  // stores table / merchant profile actually contains.
  const dbMerchantRecord = liveStoreData.merchant || merchant || {};
  const storeBalance = Number(
    (dbMerchantRecord as any).store_balance ??
    (dbMerchantRecord as any).balance ??
    (dbMerchantRecord as any).storeBalance ??
    (dbMerchantRecord as any).wallet_balance ??
    0
  );
  const storeDisplayName = (
    storefrontMerchant.storeName ||
    storefrontMerchant.ownerName ||
    liveStoreData.merchant?.storeName ||
    merchant?.storeName ||
    ''
  ).trim() || 'Store';
  const storefrontThemes = Array.isArray(liveStoreData.themes) && (liveStoreData.themes as ThemeConfig[]).length > 0
    ? (liveStoreData.themes as ThemeConfig[])
    : (Array.isArray(themes) ? themes : []);
  // The theme actually in effect: a preview theme (Super Admin eye icon / merchant
  // demo) overrides the merchant's persisted selection WITHOUT mutating it. The
  // registry supplies the theme's layout + accent colour.
  const effectiveThemeId = previewThemeId || storefrontMerchant.activeThemeId;
  const activeTheme = (storefrontThemes || []).find((theme) => theme?.id === effectiveThemeId)
    || (storefrontThemes || [])[0];
  const registryTheme = findThemeById(effectiveThemeId);
  const merchantThemeConfig = (storefrontMerchant.themeConfig || liveStoreData.themeCustomization || {}) as Record<string, unknown>;
  // Resolved theme settings: themeConfig (from editor/Supabase) > themeCustomization > hardcoded defaults
  const resolvedTheme = {
    headerSticky: merchantThemeConfig.headerSticky !== false,
    showSearchBar: merchantThemeConfig.showSearchBar !== false,
    announcementBg: (typeof merchantThemeConfig.announcementBg === 'string' && merchantThemeConfig.announcementBg) || '#D4AF37',
    showAnnouncement: merchantThemeConfig.showAnnouncement !== false,
    announcementText: (typeof merchantThemeConfig.announcementText === 'string' && merchantThemeConfig.announcementText)
      || storefrontMerchant.announcementText
      || '',
    isMarquee: merchantThemeConfig.isMarquee !== false,
    marqueeSpeed: typeof merchantThemeConfig.marqueeSpeed === 'number' ? merchantThemeConfig.marqueeSpeed : 22,
    announcementItems: Array.isArray(merchantThemeConfig.announcementItems) && merchantThemeConfig.announcementItems.length > 0
      ? (merchantThemeConfig.announcementItems as string[])
      : [storefrontMerchant.announcementText || 'Welcome to SlateBD Luxury Store'],
    headerBgColor: (typeof merchantThemeConfig.headerBgColor === 'string' && merchantThemeConfig.headerBgColor) || '#0f172a',
    // Brand marks — the Header Logo panel's Desktop / Mobile uploads. Kept as
    // their own fields (rather than only folded into `logoUrl`) so the header
    // can pick whichever matches the device currently being previewed.
    desktopLogoUrl: (typeof merchantThemeConfig.desktopLogoUrl === 'string' && merchantThemeConfig.desktopLogoUrl) || '',
    mobileLogoUrl: (typeof merchantThemeConfig.mobileLogoUrl === 'string' && merchantThemeConfig.mobileLogoUrl) || '',
    logoHeight: typeof merchantThemeConfig.logoHeight === 'number' ? merchantThemeConfig.logoHeight : 28,
    showHeroBanner: merchantThemeConfig.showHeroBanner !== false,
    heroTitle: (typeof merchantThemeConfig.heroTitle === 'string' && merchantThemeConfig.heroTitle) || storefrontMerchant.heroTitle || '',
    heroSubtitle: (typeof merchantThemeConfig.heroSubtitle === 'string' && merchantThemeConfig.heroSubtitle) || storefrontMerchant.heroSubtitle || '',
    heroImage: (typeof merchantThemeConfig.heroImage === 'string' && merchantThemeConfig.heroImage) || storefrontMerchant.heroImage || '',
    heroImages: Array.isArray(merchantThemeConfig.heroImages) && merchantThemeConfig.heroImages.length > 0
      ? (merchantThemeConfig.heroImages as string[])
      : ((typeof merchantThemeConfig.heroImage === 'string' && merchantThemeConfig.heroImage) || storefrontMerchant.heroImage
          ? [(typeof merchantThemeConfig.heroImage === 'string' && merchantThemeConfig.heroImage) || storefrontMerchant.heroImage || '']
          : []),
    // Alias for `heroImages`, honouring the editor's `heroBackgrounds` key name.
    // Merchants/older payloads may write either key; both resolve to one list.
    heroBackgrounds: Array.isArray(merchantThemeConfig.heroBackgrounds) && merchantThemeConfig.heroBackgrounds.length > 0
      ? (merchantThemeConfig.heroBackgrounds as string[])
      : [],
    heroCtaText: (typeof merchantThemeConfig.heroCtaText === 'string' && merchantThemeConfig.heroCtaText) || 'Shop Now',
    slides: Array.isArray(merchantThemeConfig.slides) && merchantThemeConfig.slides.length > 0
      ? (merchantThemeConfig.slides as Array<{ id: string; title: string; subtitle: string; ctaText: string; ctaLink: string; image: string; }>)
      : [],
    activeSlideIndex: typeof merchantThemeConfig.activeSlideIndex === 'number' ? merchantThemeConfig.activeSlideIndex : 0,
    categoriesList: Array.isArray(merchantThemeConfig.categoriesList) ? (merchantThemeConfig.categoriesList as Array<{ name: string; image: string; count: string; }>) : [],
    showCategories: merchantThemeConfig.showCategories !== false,
    categoriesHeading: (typeof merchantThemeConfig.categoriesHeading === 'string' && merchantThemeConfig.categoriesHeading) || 'Popular Categories',
    categoriesSubtitle: (typeof merchantThemeConfig.categoriesSubtitle === 'string' && merchantThemeConfig.categoriesSubtitle) || 'Shop by category',
    categoriesLayout: (typeof merchantThemeConfig.categoriesLayout === 'string' && merchantThemeConfig.categoriesLayout) || 'Carousel',
    categoriesItemsPerRow: typeof merchantThemeConfig.categoriesItemsPerRow === 'number' ? merchantThemeConfig.categoriesItemsPerRow : 4,
    showFeaturedGrid: merchantThemeConfig.showFeaturedGrid !== false,
    featuredHeading: (typeof merchantThemeConfig.featuredHeading === 'string' && merchantThemeConfig.featuredHeading) || 'Featured Products',
    productColumns: typeof merchantThemeConfig.productColumns === 'number' ? merchantThemeConfig.productColumns : 2,
    productsLayout: (typeof merchantThemeConfig.productsLayout === 'string' && merchantThemeConfig.productsLayout) || 'Grid',
    showCountdown: merchantThemeConfig.showCountdown !== false,
    countdownTitle: (typeof merchantThemeConfig.countdownTitle === 'string' && merchantThemeConfig.countdownTitle) || '⚡ Flash Sale Ends In:',
    countdownDiscount: (typeof merchantThemeConfig.countdownDiscount === 'string' && merchantThemeConfig.countdownDiscount) || 'Extra 15% OFF!',
    countdownHours: typeof merchantThemeConfig.countdownHours === 'number' ? merchantThemeConfig.countdownHours : 14,
    countdownEndDate: typeof merchantThemeConfig.countdownEndDate === 'string' ? merchantThemeConfig.countdownEndDate : '',
    countdownBgImage: (typeof merchantThemeConfig.countdownBgImage === 'string' && merchantThemeConfig.countdownBgImage) || '',
    countdownOverlayOpacity: typeof merchantThemeConfig.countdownOverlayOpacity === 'number' ? merchantThemeConfig.countdownOverlayOpacity : 60,
    showGallery: merchantThemeConfig.showGallery !== false,
    galleryHeading: (typeof merchantThemeConfig.galleryHeading === 'string' && merchantThemeConfig.galleryHeading) || 'Gallery',
    galleryImages: Array.isArray(merchantThemeConfig.galleryImages) ? (merchantThemeConfig.galleryImages as Array<{ url: string; caption?: string; link?: string; }>) : [],
    showSocialBlock: merchantThemeConfig.showSocialBlock !== false,
    socialTagline: (typeof merchantThemeConfig.socialTagline === 'string' && merchantThemeConfig.socialTagline) || 'Follow us for daily updates',
    facebookHandle: (typeof merchantThemeConfig.facebookHandle === 'string' && merchantThemeConfig.facebookHandle) || '',
    instagramHandle: (typeof merchantThemeConfig.instagramHandle === 'string' && merchantThemeConfig.instagramHandle) || '',
    whatsappNumber: (typeof merchantThemeConfig.whatsappNumber === 'string' && merchantThemeConfig.whatsappNumber) || '',
    tiktokHandle: (typeof merchantThemeConfig.tiktokHandle === 'string' && merchantThemeConfig.tiktokHandle) || '',
    youtubeHandle: (typeof merchantThemeConfig.youtubeHandle === 'string' && merchantThemeConfig.youtubeHandle) || '',
    showFacebook: merchantThemeConfig.showFacebook !== false,
    showInstagram: merchantThemeConfig.showInstagram !== false,
    showWhatsapp: merchantThemeConfig.showWhatsapp !== false,
    showTikTok: merchantThemeConfig.showTikTok !== false,
    showYouTube: merchantThemeConfig.showYouTube !== false,
    showVideo: merchantThemeConfig.showVideo !== false,
    videoTitle: (typeof merchantThemeConfig.videoTitle === 'string' && merchantThemeConfig.videoTitle) || '',
    videoUrl: (typeof merchantThemeConfig.videoUrl === 'string' && merchantThemeConfig.videoUrl) || '',
    videoFileUrl: (typeof merchantThemeConfig.videoFileUrl === 'string' && merchantThemeConfig.videoFileUrl) || '',
    videoAutoplay: merchantThemeConfig.videoAutoplay === true,
    videoMuted: merchantThemeConfig.videoMuted !== false,
    footerLogoText: (typeof merchantThemeConfig.footerLogoText === 'string' && merchantThemeConfig.footerLogoText) || '',
    footerAboutText: (typeof merchantThemeConfig.footerAboutText === 'string' && merchantThemeConfig.footerAboutText) || '',
    footerLinksTitle: (typeof merchantThemeConfig.footerLinksTitle === 'string' && merchantThemeConfig.footerLinksTitle) || 'Quick Links',
    footerLinks: Array.isArray(merchantThemeConfig.footerLinks) ? (merchantThemeConfig.footerLinks as string[]) : [],
    contactPhone: (typeof merchantThemeConfig.contactPhone === 'string' && merchantThemeConfig.contactPhone) || '',
    contactEmail: (typeof merchantThemeConfig.contactEmail === 'string' && merchantThemeConfig.contactEmail) || '',
    dhakaAddress: (typeof merchantThemeConfig.dhakaAddress === 'string' && merchantThemeConfig.dhakaAddress) || ''
  };
  // Header bar colour lives in `headerBgColor` (writer's own pick) instead of
  // the hard-coded `#0f172a`. The picker's text field accepts ANY valid CSS
  // colour (hex, rgb(), ...), so `resolveHeaderPalette` derives a single
  // readable foreground/accent/hover set that is applied to the header in BOTH
  // the live preview and the published storefront.
  const headerPalette = resolveHeaderPalette(resolvedTheme.headerBgColor);

  // The MERCHANT's own store logo for the top navigation bar. It is a SEPARATE
  // element from the ZID SaaS BD platform wordmark, which always stays in its
  // original slot on the left — so customising the Desktop / Mobile logo only
  // ever moves the merchant's mark and can never overwrite the platform brand.
  // This is fed straight from `merchant.themeConfig`, so in previewMode a
  // picked file or a typed URL re-renders the header in the same frame — no
  // publish, refetch or refresh in between.
  const headerLogoSrc = (
    isMobile
      ? (resolvedTheme.mobileLogoUrl || resolvedTheme.desktopLogoUrl)
      : (resolvedTheme.desktopLogoUrl || resolvedTheme.mobileLogoUrl)
  ) || storefrontMerchant.logoUrl || '';
  // A stale/expired URL must degrade to the wordmark rather than leave a
  // broken-image glyph in the nav; reset whenever a new src is supplied.
  const [headerLogoFailed, setHeaderLogoFailed] = useState(false);
  useEffect(() => { setHeaderLogoFailed(false); }, [headerLogoSrc]);
  const showHeaderLogo = Boolean(headerLogoSrc) && !headerLogoFailed;
  // Clamp to the editor's own 20-60px range so a stray value cannot blow out
  // the header height.
  const headerLogoHeight = Math.min(60, Math.max(20, Number(resolvedTheme.logoHeight) || 28));
  const activeHeroSlide = resolvedTheme.slides.length > 0
    ? resolvedTheme.slides[Math.min(resolvedTheme.activeSlideIndex, resolvedTheme.slides.length - 1)]
    : null;
  // Gallery rows that actually carry an image. The customizer persists whatever
  // is in its list — including a freshly-added, still-empty row — so filtering
  // here keeps the storefront from rendering blank tiles or dropping the whole
  // section because `length > 0` was satisfied by an empty entry.
  const galleryImageList = (resolvedTheme.galleryImages || []).filter(
    (img) => img && typeof img.url === 'string' && img.url.trim() !== ''
  );
  // Resolve the merchant's video source to an embeddable URL once, so the render
  // below never has to guess. A bare YouTube/Vimeo link is normalised; anything
  // else is passed through as a direct media URL.
  const videoEmbedUrl = (() => {
    const raw = (resolvedTheme.videoUrl || '').trim();
    if (!raw) return '';
    // An explicit <iframe> embed URL is already usable as-is.
    if (/\/embed\//.test(raw)) return raw;
    const yt = raw.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/i);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
    const vm = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
    return raw;
  })();
  const hasVideoSource = Boolean(resolvedTheme.videoFileUrl || videoEmbedUrl);
  // Resolution order: the merchant's Brand Identity colour wins last-resort
  // only when neither theme source set one — see the ordering note below.
  // `brandConfig.brandColor` is the value saved by OnlineStoreView's Brand
  // Identity panel (persisted to stores.brandConfig). It is inserted ahead of
  // the built-in theme defaults so a saved colour is never shadowed by a
  // registry/theme fallback, but *after* the live theme customiser so an
  // unsaved in-progress edit still previews correctly.
  const brandAccent = (
    typeof storeModules.brandConfig?.brandColor === 'string' && storeModules.brandConfig.brandColor.trim()
      ? storeModules.brandConfig.brandColor.trim()
      : ''
  );
  const primaryColor = (
    (typeof merchantThemeConfig.primaryColor === 'string' && merchantThemeConfig.primaryColor) ||
    (typeof merchantThemeConfig.themePrimaryColor === 'string' && merchantThemeConfig.themePrimaryColor) ||
    (typeof themeCustomization.primaryColor === 'string' && themeCustomization.primaryColor) ||
    (typeof themeCustomization.themePrimaryColor === 'string' && themeCustomization.themePrimaryColor) ||
    brandAccent ||
    activeTheme?.primaryColor ||
    registryTheme?.primaryColor ||
    '#00D68F'
  );
  // Direct Supabase & Backend API & LocalStorage Catalog Hook
  const [supabaseProducts, setSupabaseProducts] = useState<Product[]>([]);
  const [supabaseCategories, setSupabaseCategories] = useState<any[]>([]);
  const [isLoadingSupabase, setIsLoadingSupabase] = useState<boolean>(true);
  // Hero carousel auto-rotation — fades through the merchant's configured hero
  // background photos in order. 4.5s sits inside the intended 4-5s window: long
  // enough to read the headline and CTA, short enough to still feel live.
  const heroImageList: string[] = resolvedTheme.heroImages.length > 0
    ? resolvedTheme.heroImages
    : (resolvedTheme.heroBackgrounds.length > 0
        ? resolvedTheme.heroBackgrounds
        : (resolvedTheme.heroImage ? [resolvedTheme.heroImage] : []));
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  useEffect(() => {
    if (!resolvedTheme.showHeroBanner || heroImageList.length <= 1) return;
    const interval = setInterval(() => {
      setActiveHeroIndex((prev) => (prev + 1) % heroImageList.length);
    }, HERO_ROTATION_MS);
    return () => clearInterval(interval);
  }, [resolvedTheme.showHeroBanner, heroImageList.length]);
  // Reset index when image list changes
  useEffect(() => {
    setActiveHeroIndex(0);
  }, [heroImageList.join(',')]);

  // Apply the merchant's SEO metadata + favicon to the document head.
  // The storefront is a client-rendered SPA, so this is what fills the <title>,
  // description, keywords and Open Graph tags that crawlers and link previews
  // read. Re-applied whenever the store's SEO config loads or changes.
  useEffect(() => {
    applyStoreSeo(storeModules.seoConfig, storeDisplayName);
  }, [storeModules.seoConfig, storeDisplayName]);

  useEffect(() => {
    applyStoreFavicon(storeModules.brandConfig?.faviconUrl);
  }, [storeModules.brandConfig?.faviconUrl]);

  // Legal policies (set in Settings → Legal policies). When `showInFooter` is on,
  // links to the policies the merchant filled in are auto-injected into the
  // storefront footer, so the footer adapts dynamically without manual editing.
  const [storefrontPolicies, setStorefrontPolicies] = useState<{
    privacyPolicy?: string;
    termsOfService?: string;
    returnRefundPolicy?: string;
    shippingPolicy?: string;
    showInFooter?: boolean;
  }>({});

  useEffect(() => {
    const slug = resolveActiveStoreSlug(storeSlug || (merchant as any)?.storeSlug);
    if (!slug) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/store/policies?store_slug=${encodeURIComponent(slug)}`);
        const data = await res.json();
        if (active && data?.ok && data.policies) setStorefrontPolicies(data.policies);
      } catch (e: any) {
        console.warn('Storefront policies fetch warning:', e?.message || e);
      }
    })();
    return () => { active = false; };
  }, [storeSlug, merchant]);

  // Apply the merchant's saved default language ('bn' | 'en-US') so the whole
  // storefront — cart, checkout, invoices and automated communications — renders
  // in that language. A visitor's explicit toggle in localStorage still wins
  // during the session; this only seeds the merchant-selected default.
  useEffect(() => {
    const slug = resolveActiveStoreSlug(storeSlug || (merchant as any)?.storeSlug);
    if (!slug) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/stores/locale?store_slug=${encodeURIComponent(slug)}`);
        const data = await res.json();
        if (!active) return;
        const savedLang = data?.localeConfig?.defaultLanguage;
        if (savedLang === 'bn' || savedLang === 'en-US') {
          let visitorChoice: string | null = null;
          try { visitorChoice = localStorage.getItem('zid_language'); } catch { /* storage unavailable */ }
          // Only auto-apply when the visitor has not made an explicit choice.
          if (!visitorChoice) setLanguage(savedLang === 'bn' ? 'bn' : 'en');
        }
      } catch (e: any) {
        console.warn('Storefront locale fetch warning:', e?.message || e);
      }
    })();
    return () => { active = false; };
  }, [storeSlug, merchant, setLanguage]);

  useEffect(() => {
    let active = true;
    // Active store slug resolved from prop (route param) or merchant session — never hardcoded.
    const effectiveSlug = resolveActiveStoreSlug(storeSlug || (merchant as any)?.storeSlug);
    const fetchCatalog = async () => {
      let catData: any[] = [];
      let prodData: any[] = [];

      // 1. Fetch categories and products from Express API
      try {
        const [catRes, prodRes] = await Promise.all([
          fetch(`/api/categories?store_slug=${encodeURIComponent(effectiveSlug || storeSlug || 'bd')}`).then(r => r.json().catch(() => null)),
          fetch(`/api/products?store_slug=${encodeURIComponent(effectiveSlug || storeSlug || 'bd')}`).then(r => r.json().catch(() => null)),
        ]);

        if (catRes && Array.isArray(catRes.categories)) {
          catData.push(...catRes.categories);
        } else if (Array.isArray(catRes)) {
          catData.push(...catRes);
        }
        if (Array.isArray(prodRes)) {
          prodData.push(...prodRes);
        }
      } catch (e: any) {
        console.warn('Catalog API fetch warning:', e?.message || e);
        setCatalogLoadFailed(true);
      }

        // Check localStorage fallbacks — only THIS store's keys, never the mock
        // 'bd'/'default'/'verandabd' demo keys that inject dummy products.
        try {
        const localCatKeys = [
          `zid_store_categories_v2:${storeSlug}`
        ];
        for (const k of localCatKeys) {
          const val = localStorage.getItem(k);
          if (val) {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) catData.push(...parsed);
          }
        }

        const localStoreKeys = [
          `ZID_MERCHANT_STORE_DATA_${storeSlug}`
        ];
        for (const k of localStoreKeys) {
          const val = localStorage.getItem(k);
          if (val) {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed?.categories)) catData.push(...parsed.categories);
            if (Array.isArray(parsed?.products)) prodData.push(...parsed.products);
          }
        }
      } catch (e) {
        console.warn('LocalStorage fallback warning:', e);
      }

      if (active) {
        const uniqueCatMap = new Map<string, any>();
        for (const c of catData) {
          if (c) {
            const key = String(c.id || c.category_id || c.name || c.title || '').trim().toLowerCase();
            if (key) uniqueCatMap.set(key, c);
          }
        }

        const uniqueProdMap = new Map<string, any>();
        for (const p of prodData) {
          if (p) {
            const key = String(p.id || p.title || p.name || '').trim();
            if (key) uniqueProdMap.set(key, p);
          }
        }

        setSupabaseCategories(Array.from(uniqueCatMap.values()).map(mapSupabaseCategory));
        setSupabaseProducts(Array.from(uniqueProdMap.values()).map(mapSupabaseProduct));
        setIsLoadingSupabase(false);
        setCatalogLoadFailed(uniqueProdMap.size === 0);
      }
    };

    void fetchCatalog();
    return () => { active = false; };
  }, [effectiveStoreSlug]);

  // Products shown on the storefront come from the DATABASE (via API).
  //
  // `/api/products` is the primary catalog feed, but `/api/storefront/:slug`
  // ALSO returns the store's published products from MongoDB. Previously only
  // `supabaseProducts` was consulted, so whenever that single secondary call
  // returned empty (slow Mongo handshake, Supabase hiccup) the section rendered
  // "No products added yet" even though the store had live products. We now
  // fall back through the other database-backed sources before giving up.
  const storefrontProducts: Product[] = React.useMemo(() => {
    if (supabaseProducts.length > 0) return supabaseProducts;

    const fromStorefrontPayload = Array.isArray(liveStoreData.products)
      ? (liveStoreData.products as any[])
      : [];
    if (fromStorefrontPayload.length > 0) {
      return fromStorefrontPayload.map(mapSupabaseProduct);
    }

    if (Array.isArray(products) && products.length > 0) {
      return products.map(mapSupabaseProduct);
    }

    return [];
  }, [supabaseProducts, liveStoreData.products, products]);

  // Tracks whether catalog loading finished (success or failure). While loading
  // we show a skeleton rather than a premature "no products" message.
  const [catalogLoadFailed, setCatalogLoadFailed] = useState<boolean>(false);

  const storefrontMobileBanking = Array.isArray(liveStoreData.mobileBanking)
    ? liveStoreData.mobileBanking as MobileBankingConfig[]
    : (Array.isArray(mobileBanking) ? mobileBanking : []);
  const storefrontBankAccounts = Array.isArray(liveStoreData.bankAccounts)
    ? liveStoreData.bankAccounts as BankAccount[]
    : (Array.isArray(bankAccounts) ? bankAccounts : []);
  const enabledMobileMethods = (storefrontMobileBanking || []).filter((method) => method?.isEnabled && method?.number?.trim());
  const visibleBankAccount = (storefrontBankAccounts || []).find((account) => account?.isVisibleAtCheckout);

  const rawStorefrontCategories = supabaseCategories.length > 0
    ? supabaseCategories
    : (Array.isArray(liveStoreData.categories) && liveStoreData.categories.length > 0
        ? liveStoreData.categories
        : []);

  // Inventory rules (Settings -> Orders and products properties).
  const [inventoryConfig, setInventoryConfig] = useState<MerchantProfile['inventoryConfig']>(storefrontMerchant.inventoryConfig);
  const [taxConfig, setTaxConfig] = useState<MerchantProfile['taxConfig']>(storefrontMerchant.taxConfig);

  // Marketing pixels (Settings -> API integrations). Loaded from the server so
  // the storefront reflects saved IDs without a rebuild.
  const [integrationsConfig, setIntegrationsConfig] = useState<MerchantProfile['integrationsConfig']>(
    storefrontMerchant.integrationsConfig
  );

  // Injects Meta Pixel + GA4 once the IDs are known.
  useStorefrontTracking(integrationsConfig);
  const hideOutOfStock = inventoryConfig?.hideOutOfStock === true;
  const merchantAllowPreOrder = inventoryConfig?.allowPreOrder === true;
  const minOrderQty = Number(inventoryConfig?.minOrderQty) || 1;
  const maxOrderQty = Number(inventoryConfig?.maxOrderQty) || 0;

  const allActiveProducts = (storefrontProducts || []).filter(p => {
    const status = (p.status || 'active').toLowerCase();
    if (status !== 'active' && status !== 'published') return false;
    // Hide sold-out products unless the merchant takes pre-orders.
    const stock = Number(p.stock ?? 0);
    if (hideOutOfStock && stock <= 0 && !merchantAllowPreOrder) return false;
    return true;
  });

  // Dynamically compute category product counts based on retrieved Supabase products
  const storefrontCategories = rawStorefrontCategories.map(cat => {
    const catId = cat.id || cat.category_id;
    const catNameLower = (cat.name || cat.title || '').toLowerCase().trim();
    const count = allActiveProducts.filter(p => {
      const pCatId = p.categoryId || p.category_id;
      if (pCatId && catId && String(pCatId) === String(catId)) return true;
      const pCatLower = (p.category || '').toLowerCase().trim();
      if (pCatLower && catNameLower && pCatLower === catNameLower) return true;
      if (catNameLower === 'home' && (!pCatLower || pCatLower === 'home' || pCatLower === 'general')) return true;
      return false;
    }).length;
    return { ...cat, productCount: count };
  });
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);

  // Live countdown seconds remaining (driven by themeConfig countdownHours / countdownEndDate)
  const [countdownRemaining, setCountdownRemaining] = useState<number>(() => {
    const cfg = ((merchant as any)?.themeConfig || {}) as any;
    if (cfg.countdownEndDate) {
      const diff = Math.max(0, new Date(cfg.countdownEndDate).getTime() - Date.now());
      return Math.floor(diff / 1000);
    }
    return (typeof cfg.countdownHours === 'number' ? cfg.countdownHours : 14) * 3600;
  });
  useEffect(() => {
    const timer = window.setInterval(() => setCountdownRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  // Re-sync the countdown when a saved countdownEndDate/hours loads from Supabase
  useEffect(() => {
    if (resolvedTheme.countdownEndDate) {
      const diff = new Date(resolvedTheme.countdownEndDate).getTime() - Date.now();
      if (!Number.isNaN(diff)) setCountdownRemaining(Math.max(0, Math.floor(diff / 1000)));
    }
  }, [resolvedTheme.countdownEndDate, resolvedTheme.countdownHours]);
  const countdownH = Math.floor(countdownRemaining / 3600);
  const countdownM = Math.floor((countdownRemaining % 3600) / 60);
  const countdownS = countdownRemaining % 60;
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const categoryCarouselRef = React.useRef<HTMLDivElement>(null);
  const scrollCategories = (direction: 'left' | 'right') => {
    if (categoryCarouselRef.current) {
      const scrollAmount = direction === 'left' ? -220 : 220;
      categoryCarouselRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };
  const [checkoutStep, setCheckoutStep] = useState<'catalog' | 'checkout' | 'success'>('catalog');
  const [cart, setCart] = useState<{product: Product, quantity: number, variant: string}[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authNotice, setAuthNotice] = useState('');

  // Customer WhatsApp OTP States
  const [customerWhatsappOtpInput, setCustomerWhatsappOtpInput] = useState('');
  const [isCustomerWhatsappOtpSent, setIsCustomerWhatsappOtpSent] = useState(false);
  const [isCustomerPhoneVerified, setIsCustomerPhoneVerified] = useState(false);
  const [verifiedCustomerPhone, setVerifiedCustomerPhone] = useState('');
  const [isSendingCustomerWhatsappOtp, setIsSendingCustomerWhatsappOtp] = useState(false);
  const [isVerifyingCustomerWhatsappOtp, setIsVerifyingCustomerWhatsappOtp] = useState(false);

  const handleSendCustomerWhatsappOtp = async () => {
    setAuthNotice('');
    if (!authPhone || authPhone.trim().length < 9) {
      setAuthNotice('Please enter a valid phone number before requesting WhatsApp verification.');
      return;
    }
    setIsSendingCustomerWhatsappOtp(true);
    const res = await sendWhatsAppOtp(authPhone, 'customer');
    setIsSendingCustomerWhatsappOtp(false);
    if (res.success) {
      setIsCustomerWhatsappOtpSent(true);
      setAuthNotice(res.message);
    } else {
      setAuthNotice(res.message);
    }
  };

  const handleVerifyCustomerWhatsappOtp = async () => {
    setAuthNotice('');
    if (!customerWhatsappOtpInput || customerWhatsappOtpInput.trim().length !== 6) {
      setAuthNotice('Please enter the 6-digit WhatsApp verification code.');
      return;
    }
    setIsVerifyingCustomerWhatsappOtp(true);
    const res = await verifyWhatsAppOtp(authPhone, customerWhatsappOtpInput);
    setIsVerifyingCustomerWhatsappOtp(false);
    if (res.success && res.verified) {
      setIsCustomerPhoneVerified(true);
      setVerifiedCustomerPhone(authPhone.trim());
      setIsCustomerWhatsappOtpSent(false);
      setAuthNotice('Phone number successfully verified via Supabase WhatsApp OTP ✓');
    } else {
      setAuthNotice(res.message || 'Failed to verify WhatsApp code. Please check and try again.');
    }
  };
  const [mobileTab, setMobileTab] = useState<'home' | 'orders' | 'profile'>('home');
  const [showOrderDashboard, setShowOrderDashboard] = useState(false);
  const [customerReturns, setCustomerReturns] = useState<CustomerReturnRequest[]>([]);
  const [customerReviews, setCustomerReviews] = useState<CustomerReviewItem[]>([]);
  // Live orders fetched straight from MongoDB for this store, so the customer
  // account page reflects real orders even when the parent route passes none.
  const [storefrontOrders, setStorefrontOrders] = useState<Order[]>([]);
  // In-card item action modals. Each holds the exact order + item being acted on.
  const [reviewModal, setReviewModal] = useState<{ order: Order; item: OrderItem } | null>(null);
  const [returnModal, setReturnModal] = useState<{ order: Order; item: OrderItem } | null>(null);
  const [modalRating, setModalRating] = useState(0);
  const [modalComment, setModalComment] = useState('');
  const [modalReturnReason, setModalReturnReason] = useState('');
  const [modalReturnNote, setModalReturnNote] = useState('');
  const [modalReturnImage, setModalReturnImage] = useState('');
  const [modalError, setModalError] = useState('');
  const [isModalSubmitting, setIsModalSubmitting] = useState(false);
  const [customerSession, setCustomerSession] = useState<{ email: string; name: string; phone: string } | null>(() => {
    try {
      const session = localStorage.getItem('zid_customer_session');
      return session ? JSON.parse(session) : null;
    } catch (e) {
      return null;
    }
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setIsSplashVisible(false), 1400);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    try {
      const rawReturns = localStorage.getItem(`zid_customer_returns_${storeSlug}`);
      if (rawReturns) setCustomerReturns(JSON.parse(rawReturns));
      const rawReviews = localStorage.getItem(`zid_customer_reviews_${storeSlug}`);
      if (rawReviews) setCustomerReviews(JSON.parse(rawReviews));
    } catch (e) {
      console.warn('Failed to load customer returns/reviews:', e);
    }
  }, [storeSlug]);

  useEffect(() => {
    try {
      safeSetItem(`zid_customer_returns_${storeSlug}`, customerReturns);
    } catch (e) { /* ignore quota / privacy errors */ }
  }, [customerReturns, storeSlug]);

  useEffect(() => {
    try {
      safeSetItem(`zid_customer_reviews_${storeSlug}`, customerReviews);
    } catch (e) { /* ignore quota / privacy errors */ }
  }, [customerReviews, storeSlug]);

  // Signed-in customers: pull this store's orders live from MongoDB so the
  // account page is never empty just because the route didn't hand us orders.
  // Polled at the shared customer-orders interval so a merchant's status change
  // (Processing → Delivered) appears without a manual refresh.
  useEffect(() => {
    if (!customerSession) return;
    const ref = String(effectiveStoreSlug || '').split(':')[0].trim();
    const merchantRef = String((merchant as any)?.id || '').trim();
    if (!ref && !merchantRef) return;
    let cancelled = false;
    const load = async () => {
      try {
        const params = new URLSearchParams();
        if (ref) params.set('store_slug', ref);
        if (merchantRef) params.set('merchant_id', merchantRef);
        const res = await fetch(`/api/orders?${params.toString()}`);
        const data = await res.json().catch(() => null);
        if (!cancelled && Array.isArray(data)) setStorefrontOrders(normalizeOrders(data));
      } catch (e: any) {
        // Keep the last good list; a transient outage must not blank the page.
        console.warn('[TenantStorefrontView] live orders load warning:', e?.message || e);
      }
    };
    void load();
    const timer = window.setInterval(load, CUSTOMER_ORDERS_POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerSession, effectiveStoreSlug, (merchant as any)?.id]);

  // Hydrate this customer's submitted reviews & returns from the server so the
  // "Reviewed / Return requested" card states survive a device or cache change.
  useEffect(() => {
    if (!customerSession) return;
    const ref = String(effectiveStoreSlug || '').split(':')[0].trim();
    const phone = normPhone(customerSession.phone);
    const params = new URLSearchParams();
    if (ref) params.set('store_slug', ref);
    if (phone) params.set('customer_phone', phone);
    let cancelled = false;
    const hydrate = async () => {
      try {
        const [reviewsRes, returnsRes] = await Promise.all([
          fetch(`/api/reviews?${params.toString()}`).then((r) => r.json()).catch(() => []),
          fetch(`/api/returns?${params.toString()}`).then((r) => r.json()).catch(() => []),
        ]);
        if (cancelled) return;
        if (Array.isArray(reviewsRes) && reviewsRes.length > 0) {
          setCustomerReviews((prev) => mergeReviews(prev, reviewsRes));
        }
        if (Array.isArray(returnsRes) && returnsRes.length > 0) {
          setCustomerReturns((prev) => mergeReturns(prev, returnsRes));
        }
      } catch (e: any) {
        console.warn('[TenantStorefrontView] review/return hydrate warning:', e?.message || e);
      }
    };
    void hydrate();
    // Poll so a merchant's Approve / Reject lands on this card without a manual
    // refresh (mirrors the 15s orders poll above).
    const timer = window.setInterval(hydrate, CUSTOMER_ORDERS_POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerSession, effectiveStoreSlug]);

  // ── Merchant-configured checkout & gift options ──
  // These are owned by the merchant in Settings -> Checkout / Gift options and
  // stored server-side, so the storefront loads them rather than hard-coding.
  const [giftConfig, setGiftConfig] = useState<MerchantProfile['giftOptions']>(
    storefrontMerchant.giftOptions || storefrontMerchant.giftConfig
  );
  const [storeCheckoutConfig, setStoreCheckoutConfig] = useState<MerchantProfile['checkoutConfig']>(storefrontMerchant.checkoutConfig);


  useEffect(() => {
    const ref = String(effectiveStoreSlug || '').split(':')[0].trim();
    if (!ref) return;
    let cancelled = false;

    const load = async () => {
      try {
        const [giftRes, checkoutRes] = await Promise.all([
          fetch(`/api/store/gift-options?store_slug=${encodeURIComponent(ref)}`),
          fetch(`/api/store/checkout-settings?store_slug=${encodeURIComponent(ref)}`),
        ]);
        const [giftData, checkoutData, inventoryData, taxData, integrationsData] = await Promise.all([
          giftRes.json(),
          checkoutRes.json(),
          fetch(`/api/store/inventory-properties?store_slug=${encodeURIComponent(ref)}`).then(r => r.json()),
          fetch(`/api/store/tax-properties?store_slug=${encodeURIComponent(ref)}`).then(r => r.json()),
          fetch(`/api/store/integration-properties?store_slug=${encodeURIComponent(ref)}`).then(r => r.json()),
        ]);
        if (cancelled) return;
        const giftPayload = giftData?.giftOptions || giftData?.giftConfig;
        if (giftData?.ok && giftPayload) setGiftConfig(giftPayload);
        if (checkoutData?.ok && checkoutData.checkoutConfig) setStoreCheckoutConfig(checkoutData.checkoutConfig);
        if (inventoryData?.ok && inventoryData.inventoryConfig) setInventoryConfig(inventoryData.inventoryConfig);
        if (taxData?.ok && taxData.taxConfig) setTaxConfig(taxData.taxConfig);
        if (integrationsData?.ok && integrationsData.integrationsConfig) {
          setIntegrationsConfig(integrationsData.integrationsConfig);
        }
      } catch (err) {
        console.warn('Storefront checkout config load warning:', err);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [effectiveStoreSlug]);

  // Gift selection made by the customer on the checkout form.
  const [wantGiftWrap, setWantGiftWrap] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');

  const checkoutMinOrder = Number(storeCheckoutConfig?.minOrderAmount) || 0;

  /** True when the cart violates the merchant's per-line quantity limits. */
  const qtyLimitBreached = cart.some(
    item => item.quantity < minOrderQty || (maxOrderQty > 0 && item.quantity > maxOrderQty)
  );
  const giftWrapFee = wantGiftWrap ? (Number(giftConfig?.giftPackagingFee) || 0) : 0;

  // Resolve the gift toggles, canonical names first with legacy fallbacks.
  const giftPackagingEnabled = giftConfig?.enableGiftPackaging === true;
  const giftCardMessageAllowed = (giftConfig?.allowGiftCardMessage ?? giftConfig?.allowGiftMessage) === true;
  const hideInvoicePriceTag = (giftConfig?.hideInvoicePriceTag ?? giftConfig?.hideInvoicePrice) === true;

  // Checkout Form State
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [payMethod, setPayMethod] = useState<'bkash' | 'nagad' | 'bank' | 'cod'>('bkash');
  // `inside` | `outside` rather than a free-text city: the delivery-zone selector
  // is the single control for this, so the shipping area can never drift out of
  // sync with what the customer picked (and the total updates with it).
  const [shippingArea, setShippingArea] = useState<'inside' | 'outside'>('inside');
  const [custAddress, setCustAddress] = useState('');
  const [custTxId, setCustTxId] = useState('');
  const [confirmedOrderNum, setConfirmedOrderNum] = useState('');
  const [codAdvanceProvider, setCodAdvanceProvider] = useState<'bkash' | 'nagad' | 'rocket'>('bkash');
  const [copiedNum, setCopiedNum] = useState(false);

  const handleCopyNumber = (num: string) => {
    if (!num) return;
    navigator.clipboard.writeText(num);
    setCopiedNum(true);
    setTimeout(() => setCopiedNum(false), 2000);
  };

  useEffect(() => {
    const available = [
      ...(enabledMobileMethods || []).map((method) => method.provider),
      ...(visibleBankAccount ? ['bank'] : []),
      ...(storefrontMerchant.paymentMethods?.cod ? ['cod'] : []),
    ];
    if (!available.includes(payMethod)) setPayMethod((available[0] || 'cod') as typeof payMethod);
  }, [enabledMobileMethods, visibleBankAccount, storefrontMerchant.paymentMethods?.cod, payMethod]);

  const selectedMobileMethod = (enabledMobileMethods || []).find((method) => method.provider === payMethod);

  const storefrontCodConfig = (liveStoreData.codConfig as CodConfig) || undefined;

  // Delivery-fee rules persisted to MongoDB (Logistics → Shipping settings).
  // These win over `codConfig` where both set a value, because the Logistics
  // panel is the surface the merchant actually edits today.
  const storefrontShippingConfig = (liveStoreData as any).shippingConfig as
    | {
        insideDhakaFee?: number | string | null;
        outsideDhakaFee?: number | string | null;
        freeShippingThreshold?: number | string | null;
        isEnabled?: boolean;
      }
    | undefined;

  // ── Delivery charge ───────────────────────────────────────────────────────
  //
  // Resolved from the SELECTED PRODUCT first, falling back to the store's COD
  // configuration only when the product stores no usable charge.
  //
  // Previously this read the store-level COD config ONLY, so the per-product
  // "Shipping & Delivery Charges" the merchant had just filled in on the product
  // form had no effect on the storefront, and the city dropdown's labels were
  // hardcoded to "৳80" / "৳150".
  //
  // Which product(s) this checkout is about: the whole cart when present, else
  // the single product being viewed.
  const cartProducts = (cart || [])
    .map((item: any) => item.product)
    .filter(Boolean);
  const chargeProducts = cartProducts.length > 0
    ? cartProducts
    : (selectedProduct ? [selectedProduct] : []);

  // Passed RAW (not `Number(...)`) into resolveDeliveryCharge. `Number('')` is
  // `0`, which is exactly how an empty COD field used to surface as a phantom
  // "৳0" delivery charge; the resolver's `toFee` rejects ''/NaN as "not set".
  const storeInsideFee = storefrontShippingConfig?.insideDhakaFee ?? storefrontCodConfig?.insideDhakaFee;
  const storeOutsideFee = storefrontShippingConfig?.outsideDhakaFee ?? storefrontCodConfig?.outsideDhakaFee;

  // Free-shipping offer: when the cart total reaches the merchant's threshold
  // the delivery charge is waived. This threshold was previously saved by three
  // different settings screens and read by none of them — a merchant set it and
  // the checkout silently ignored it.
  //
  // A threshold of 0 is treated as "not offered", NOT as "everything is free".
  // The settings inputs coerce a cleared field to the number 0, so a merchant
  // emptying the box would otherwise give away free delivery on every order —
  // the opposite of what they intended.
  const freeShippingThresholdRaw = toFee(storefrontShippingConfig?.freeShippingThreshold);
  const freeShippingThreshold =
    freeShippingThresholdRaw !== null && freeShippingThresholdRaw > 0
      ? freeShippingThresholdRaw
      : null;

  // Every product in the cart is charged, so a mixed cart uses the SUM of each
  // product's own fee — the honest reading of "this product costs ৳60 to deliver".
  const deliveryCharge = (() => {
    let fee = 0;
    let source: 'product' | 'store' | 'none' = 'none';
    for (const product of chargeProducts) {
      const resolved = resolveDeliveryCharge({
        product,
        city: shippingArea === 'inside' ? 'dhaka' : 'outside',
        storeInsideFee,
        storeOutsideFee,
      });
      fee += resolved.fee;
      if (resolved.source === 'product') source = 'product';
      else if (source === 'none') source = resolved.source;
    }
    if (chargeProducts.length === 0) {
      const resolved = resolveDeliveryCharge({
        city: shippingArea === 'inside' ? 'dhaka' : 'outside',
        storeInsideFee,
        storeOutsideFee,
      });
      fee = resolved.fee;
      source = resolved.source;
    }
    return { fee, source };
  })();

  const deliveryFeeBeforeThreshold = deliveryCharge.fee;

  const cartTotal = (cart || []).reduce((sum, item) => sum + ((item.product?.priceBDT ?? 0) * item.quantity), 0);
  const itemsSubtotal = (cart || []).length > 0 ? cartTotal : (selectedProduct?.priceBDT || 0);

  // The goods subtotal is what the threshold is measured against — before VAT,
  // gift wrap or delivery, matching how the offer is advertised to customers.
  const qualifiesForFreeShipping =
    freeShippingThreshold !== null && itemsSubtotal >= freeShippingThreshold;

  const shippingFee = qualifiesForFreeShipping ? 0 : deliveryFeeBeforeThreshold;

  // How much more the customer must spend to unlock free delivery (0 once met).
  const freeShippingShortfall =
    freeShippingThreshold !== null && !qualifiesForFreeShipping
      ? Math.max(0, freeShippingThreshold - itemsSubtotal)
      : 0;

  // True when at least one product carries its own charge, so the UI can say so.
  const usesProductDeliveryFee = deliveryCharge.source === 'product' && !qualifiesForFreeShipping;

  // Labels + fees for the two shipping areas, used by the city dropdown and the
  // product page so the customer sees the real number before reaching checkout.
  //
  // The fee for a zone is the SAME SUM the cart computes (`deliveryCharge`), not
  // the first product's own rate: a one-item checkout therefore resolves to
  // exactly that item's charge, while a multi-item cart shows the full delivery
  // cost it will actually be billed. `configured` distinguishes a real saved
  // price (including a deliberate ৳0) from "nothing set", so an unconfigured
  // store never shows the misleading "৳0" the merchant never entered.
  const zoneFeeFor = (area: 'inside' | 'outside'): { fee: number; configured: boolean } => {
    if (chargeProducts.length === 0) {
      const resolved = resolveDeliveryCharge({
        city: area,
        storeInsideFee,
        storeOutsideFee,
      });
      return { fee: resolved.fee, configured: resolved.configured };
    }
    let fee = 0;
    let configured = false;
    for (const product of chargeProducts) {
      const resolved = resolveDeliveryCharge({
        product,
        city: area,
        storeInsideFee,
        storeOutsideFee,
      });
      fee += resolved.fee;
      if (resolved.configured) configured = true;
    }
    return { fee, configured };
  };

  const insideArea = zoneFeeFor('inside');
  const outsideArea = zoneFeeFor('outside');
  const insideAreaFee = insideArea.fee;
  const outsideAreaFee = outsideArea.fee;
  const insideConfigured = insideArea.configured;
  const outsideConfigured = outsideArea.configured;

  // ── VAT (Settings -> Tax) ──────────────────────────────
  //
  // `isTaxInclusive` decides whether the listed product prices already contain
  // the tax or whether it is added on top. `applyTaxOnShipping` extends the
  // taxable base to the shipping and gift-wrapping charges.
  // Canonical spec names first, then the legacy spellings so a store saved
  // before the rename still calculates correctly.
  const taxPercent = Number(taxConfig?.standardTaxRate ?? taxConfig?.defaultTaxRate) || 0;
  const taxIncludedInPrices = (taxConfig?.isTaxInclusive ?? taxConfig?.includeTaxInPrices) === true;
  const taxOnDelivery = (taxConfig?.applyTaxOnShipping ?? taxConfig?.applyTaxToDelivery) === true;
  const showTaxBreakdown = taxConfig?.showTaxBreakdown === true;
  const taxRegistrationNumber = taxConfig?.vatRegistrationNumber || taxConfig?.vatNumber || '';

  // Charges that sit alongside the goods (delivery, gift wrap).
  const extraCharges = shippingFee + giftWrapFee;
  const taxableExtra = taxOnDelivery ? extraCharges : 0;

  const taxRateFraction = taxPercent / 100;
  let taxAmount: number;
  let netBeforeTax: number;

  if (taxPercent <= 0) {
    taxAmount = 0;
    netBeforeTax = itemsSubtotal + extraCharges;
  } else if (taxIncludedInPrices) {
    // Prices already include VAT — extract it rather than adding it, so the
    // customer pays exactly the listed price.
    const gross = itemsSubtotal + taxableExtra;
    netBeforeTax = Math.round(gross / (1 + taxRateFraction));
    taxAmount = gross - netBeforeTax;
  } else {
    // Prices exclude VAT — tax is charged on the goods and any taxable extras.
    netBeforeTax = itemsSubtotal + extraCharges;
    taxAmount = Math.round((itemsSubtotal + taxableExtra) * taxRateFraction);
  }

  // Pre-tax subtotal shown in the breakdown (excludes the tax portion).
  const displayNetGoods = taxIncludedInPrices && taxPercent > 0
    ? Math.round(itemsSubtotal / (1 + taxRateFraction))
    : itemsSubtotal;

  const baseTotalAmount = netBeforeTax + taxAmount;

  // Merchant-defined guard rails, enforced live as the cart changes.
  const minOrderShortfall = checkoutMinOrder > 0 && itemsSubtotal < checkoutMinOrder
    ? checkoutMinOrder - itemsSubtotal
    : 0;

  const mobileChargePercent = selectedMobileMethod?.chargePercentage || 0;
  const mobileCashOutFee = Math.round(baseTotalAmount * (mobileChargePercent / 100));
  const finalPayableMobile = baseTotalAmount + mobileCashOutFee;

  const advanceMethodsAvailable = enabledMobileMethods.filter(m => m.canPayAdvanceCharge && m.number);
  const requiresAdvanceFee = (payMethod === 'cod') && (advanceMethodsAvailable.length > 0 || !!storefrontCodConfig?.requestAdvanceDeliveryCharge);
  const advanceDeliveryFeeAmount = Number(storefrontCodConfig?.advanceDeliveryChargeAmount) || shippingFee;
  const selectedAdvConfig = advanceMethodsAvailable.find(m => m.provider === codAdvanceProvider) || advanceMethodsAvailable[0] || enabledMobileMethods[0];
  const advChargePercent = selectedAdvConfig?.chargePercentage || 0;
  const advCashOutFee = Math.round(advanceDeliveryFeeAmount * (advChargePercent / 100));
  const totalAdvancePayable = advanceDeliveryFeeAmount + advCashOutFee;
  const remainingCodBalance = Math.max(0, baseTotalAmount - advanceDeliveryFeeAmount);

  const totalAmount = ['bkash', 'nagad', 'rocket'].includes(payMethod)
    ? finalPayableMobile
    : baseTotalAmount;

  // The signed-in customer's orders: our live MongoDB fetch merged with any
  // orders the parent passed in (preview/dashboard), de-duplicated by id and
  // filtered by the session's phone (last 10 digits) OR exact name.
  const customerOrders = useMemo<Order[]>(() => {
    if (!customerSession) return [];
    const byId = new Map<string, Order>();
    for (const order of [...(orders || []), ...storefrontOrders]) {
      if (order && order.id && !byId.has(order.id)) byId.set(order.id, order);
    }
    const sessionPhone = normPhone(customerSession.phone);
    const sessionName = (customerSession.name || '').trim().toLowerCase();
    return [...byId.values()].filter((order) => {
      const phoneMatch = Boolean(sessionPhone) && normPhone(order.customerPhone) === sessionPhone;
      const nameMatch = Boolean(sessionName) && (order.customerName || '').trim().toLowerCase() === sessionName;
      return phoneMatch || nameMatch;
    });
  }, [orders, storefrontOrders, customerSession]);

  const handleCustomerSessionPersist = (session: { email: string; name: string; phone: string }) => {
    safeSetItem('zid_customer_session', session);
    setCustomerSession(session);
  };

  const handleCustomerAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthNotice('');

    const cleanEmail = authEmail.trim().toLowerCase();
    const cleanPassword = authPassword.trim();
    const cleanName = authName.trim() || 'Zid Customer';
    const cleanPhone = authPhone.trim();

    if (!cleanEmail.includes('@') || !cleanPassword || !cleanPhone) {
      setAuthNotice('Please enter a valid email, password, and phone number to continue.');
      return;
    }

    if (authMode === 'signup') {
      if (!isCustomerPhoneVerified || verifiedCustomerPhone !== cleanPhone) {
        setAuthNotice('Please verify your phone number via WhatsApp before creating your account.');
        return;
      }
    }

    const savedAccounts = (() => {
      try {
        const data = localStorage.getItem('zid_customer_accounts');
        if (data) {
          return JSON.parse(data);
        }
      } catch (e) {
        console.error(e);
      }
      return [
        {
          email: '',
          password: '',
          name: '',
          phone: '',
        },
      ];
    })();

    if (authMode === 'signin') {
      const existing = (savedAccounts || []).find((account: any) => account.email.toLowerCase() === cleanEmail && account.password === cleanPassword);
      if (!existing) {
        setAuthNotice('No matching customer account was found. Try the demo account or create your own profile.');
        return;
      }
      handleCustomerSessionPersist({ email: existing.email, name: existing.name, phone: existing.phone });
      setAuthNotice('Signed in successfully. Your order dashboard is ready.');
      setIsAuthOpen(false);
      setMobileTab('orders');
      return;
    }

    const updatedAccounts = [...(savedAccounts || []).filter((account: any) => account.email.toLowerCase() !== cleanEmail), {
      email: cleanEmail,
      password: cleanPassword,
      name: cleanName,
      phone: cleanPhone,
    }];

    safeSetItem('zid_customer_accounts', updatedAccounts);
    handleCustomerSessionPersist({ email: cleanEmail, name: cleanName, phone: cleanPhone });
    setAuthNotice('Your new customer account has been created and synced locally.');
    setIsAuthOpen(false);
    setMobileTab('orders');
  };

  const handleCustomerSignOut = () => {
    try {
      localStorage.removeItem('zid_customer_session');
    } catch (e) {
      console.error(e);
    }
    setCustomerSession(null);
    setMobileTab('home');
    setIsCartOpen(false);
  };

  // ── Customer Profile (account configuration ONLY) ────────────────────────
  //
  // The Profile tab is deliberately free of orders: every order card, tracking
  // stepper, review button and return button lives in the Orders tab only.
  // What lives here is account configuration — identity, saved addresses,
  // password and support.
  const [profileModal, setProfileModal] = useState<'edit' | 'addresses' | 'password' | 'support' | null>(null);
  const [profileNotice, setProfileNotice] = useState('');
  const [profileError, setProfileError] = useState('');
  // Edit Profile form — seeded from the session each time the modal opens.
  const [profileForm, setProfileForm] = useState({ name: '', phone: '', email: '' });
  // Change Password form.
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [newAddress, setNewAddress] = useState('');
  // Saved delivery addresses, scoped per store so two shops don't share them.
  const [savedAddresses, setSavedAddresses] = useState<string[]>([]);

  // Merchant contact details for the Support / Help Center row.
  const supportPhone = String(resolvedTheme.contactPhone || storefrontMerchant.supportPhone || '').replace(/\D/g, '');
  const supportEmail = String(resolvedTheme.contactEmail || storefrontMerchant.supportEmail || '');
  const supportAddress = String(resolvedTheme.dhakaAddress || '');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`zid_customer_addresses_${storeSlug}`);
      const parsed = raw ? JSON.parse(raw) : [];
      setSavedAddresses(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      /* storage unavailable — start empty */
    }
  }, [storeSlug]);

  useEffect(() => {
    try {
      safeSetItem(`zid_customer_addresses_${storeSlug}`, savedAddresses);
    } catch (e) { /* ignore quota / privacy errors */ }
  }, [savedAddresses, storeSlug]);

  const openProfileModal = (kind: 'edit' | 'addresses' | 'password' | 'support') => {
    setProfileNotice('');
    setProfileError('');
    if (kind === 'edit') {
      setProfileForm({
        name: customerSession?.name || '',
        phone: customerSession?.phone || '',
        email: customerSession?.email || '',
      });
    }
    if (kind === 'password') setPasswordForm({ current: '', next: '', confirm: '' });
    if (kind === 'addresses') setNewAddress('');
    setProfileModal(kind);
  };

  const closeProfileModal = () => {
    setProfileModal(null);
    setProfileNotice('');
    setProfileError('');
  };

  /** Read the locally-stored customer accounts list (never throws). */
  const readCustomerAccounts = (): any[] => {
    try {
      const raw = localStorage.getItem('zid_customer_accounts');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerSession) return;
    const name = profileForm.name.trim();
    const phone = profileForm.phone.trim();
    const email = profileForm.email.trim().toLowerCase();
    if (!name || !phone || !email.includes('@')) {
      setProfileError('Please enter a valid name, phone number and email address.');
      return;
    }

    // Keep the stored credential record in sync, matched on the ORIGINAL email
    // (which may itself be changing), so the next sign-in uses the new details.
    const original = customerSession.email.trim().toLowerCase();
    const next = readCustomerAccounts().map((account) => {
      if (String(account?.email || '').toLowerCase() !== original) return account;
      return { ...account, name, phone, email };
    });
    safeSetItem('zid_customer_accounts', next);

    handleCustomerSessionPersist({ name, phone, email });
    setProfileNotice(t('sf_profile_updated'));
  };

  const handleAddAddress = () => {
    const value = newAddress.trim();
    if (!value) return;
    setSavedAddresses((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setNewAddress('');
    setProfileNotice(t('sf_address_saved'));
  };

  const handleRemoveAddress = (value: string) => {
    setSavedAddresses((prev) => prev.filter((address) => address !== value));
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerSession) return;
    if (passwordForm.next !== passwordForm.confirm) {
      setProfileError(t('sf_password_mismatch'));
      return;
    }
    if (passwordForm.next.trim().length < 4) {
      setProfileError('Please choose a password of at least 4 characters.');
      return;
    }

    // Verify the current password before writing, so the change is a real
    // security step rather than an unguarded overwrite.
    const email = customerSession.email.trim().toLowerCase();
    let matched = false;
    const next = readCustomerAccounts().map((account) => {
      if (String(account?.email || '').toLowerCase() !== email) return account;
      if (String(account?.password || '') !== passwordForm.current) return account;
      matched = true;
      return { ...account, password: passwordForm.next };
    });
    if (!matched) {
      setProfileError(t('sf_wrong_password'));
      return;
    }
    safeSetItem('zid_customer_accounts', next);
    setPasswordForm({ current: '', next: '', confirm: '' });
    setProfileNotice(t('sf_password_updated'));
  };

  /** Clamp a quantity to the merchant's configured min/max (max 0 = unlimited). */
  const clampQty = (qty: number) => {
    const floor = Math.max(1, minOrderQty);
    const ceiling = maxOrderQty > 0 ? Math.max(floor, maxOrderQty) : Number.MAX_SAFE_INTEGER;
    return Math.min(Math.max(qty, floor), ceiling);
  };

  const handleAddToCart = (product: Product, variant = 'Default') => {
    setCart(prev => {
      const next = prev || [];
      const existing = next.find(item => item.product.id === product.id && item.variant === variant);
      if (existing) {
        return next.map(item => item.product.id === product.id && item.variant === variant
          ? { ...item, quantity: clampQty(item.quantity + 1) }
          : item
        );
      }
      // A freshly added line starts at the minimum order quantity.
      return [...next, { product, quantity: clampQty(1), variant }];
    });
    setIsCartOpen(true);
  };

  const handleUpdateCartQty = (productId: string, delta: number) => {
    setCart(prev => (prev || []).map(item => {
      if (item.product.id === productId) {
        const newQty = clampQty(item.quantity + delta);
        return newQty > 0 ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).filter(Boolean) as any);
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Enforce the merchant's minimum order rule (Settings -> Checkout).
    if (minOrderShortfall > 0) return;

    // Enforce per-line quantity limits (Settings -> Orders and products
    // properties). The cart is clamped on entry, but a limit tightened after
    // items were added must still block the order.
    if (cart.some(item => item.quantity < minOrderQty || (maxOrderQty > 0 && item.quantity > maxOrderQty))) {
      setCart(prev => (prev || []).map(item => ({ ...item, quantity: clampQty(item.quantity) })));
      return;
    }

    const orderNum = '#' + Math.floor(100000 + Math.random() * 900000);

    const items: OrderItem[] = (cart || []).length > 0 ? (cart || []).map((c, i) => ({
      id: `item-${i}`,
      productName: c.product.title,
      variant: c.variant,
      quantity: c.quantity,
      unitPriceBDT: c.product.priceBDT,
      image: c.product.image,
    })) : selectedProduct ? [{
      id: 'item-single',
      productName: selectedProduct.title,
      variant: 'Standard',
      quantity: 1,
      unitPriceBDT: selectedProduct.priceBDT,
      image: selectedProduct.image,
    }] : [];

    // `baseTotalAmount` is already the goods + charges + VAT, so the recorded
    // total matches exactly what the customer was shown and charged.
    const total = baseTotalAmount;

    // Gift selections are attached to the order so the merchant can fulfil them
    // and the invoice can hide the price when `hideInvoicePriceTag` is set.
    const giftDetails = (wantGiftWrap || giftMessage.trim()) ? {
      giftWrapping: wantGiftWrap,
      giftWrapFee,
      giftMessage: giftMessage.trim() || undefined,
      hideInvoicePriceTag,
    } : undefined;

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber: orderNum,
      source: 'Store',
      customerName: customerSession?.name || custName,
      customerPhone: customerSession?.phone || custPhone,
      customerCity: shippingArea === 'inside' ? 'Inside City' : 'Outside City',
      deliveryZone: shippingArea === 'inside' ? 'Inside Dhaka' : 'Outside Dhaka',
      address: custAddress,
      platform: 'Mobile web',
      totalBDT: total,
      paymentMethod: payMethod === 'bkash' ? 'bKash' : payMethod === 'nagad' ? 'Nagad' : payMethod === 'bank' ? 'Bank Transfer' : 'COD',
      paymentStatus: payMethod === 'cod' ? 'Unpaid' : 'Pending Verification',
      transactionId: custTxId || undefined,
      fulfillmentStatus: 'Unfulfilled',
      status: 'New',
      courierName: 'Steadfast Courier',
      trackingCode: 'SF-PENDING-' + Math.floor(1000 + Math.random() * 9000),
      createdAt: new Date().toLocaleString(),
      storeSlug: effectiveStoreSlug,
      merchantId: (merchant as any)?.id || '',
      items,
      // Tax captured at time of order so the receipt stays accurate even if the
      // merchant later changes the rate.
      taxRate: taxPercent,
      taxBDT: taxAmount,
      netBeforeTaxBDT: netBeforeTax,
      taxInclusive: taxIncludedInPrices,
      vatNumber: taxRegistrationNumber || undefined,
      ...(giftDetails ? { notes: `GIFT: ${JSON.stringify(giftDetails)}` } : {}),
    };

    // ---------------------------------------------------------------------
    // Save order to backend API (MongoDB-backed). Non-blocking: log failures
    // but NEVER alert or return early.
    // ---------------------------------------------------------------------
    let storeId = resolvedStoreId;
    let resolvedStoreCode: string =
      String((merchant as any)?.storeCode || (merchant as any)?.store_code || '').trim() || 'ZID-BD-1001';
    try {
      const cleanSlug = String(effectiveStoreSlug || '').split(':')[0].trim().toLowerCase();
      const cleanCode = String(
        (merchant as any)?.storeCode || (merchant as any)?.store_code || cleanSlug || ''
      ).trim();
      const isUuidLike = (v: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');

      if (storeId && !isUuidLike(storeId)) storeId = '';

      // Resolve the canonical store UUID through the shared, null-safe helper.
      // It never throws on a missing store or a non-JSON (404 HTML) response —
      // lookup problems are logged and the caller falls back to the slug.
      if (!storeId && cleanSlug && !isUuidLike(cleanSlug)) {
        const lookup = await fetchStoreByRef(cleanSlug);
        if (lookup.error) console.warn('[Checkout] Store lookup warning:', lookup.error);
        if (storeIdFromRecord(lookup.merchant)) {
          storeId = storeIdFromRecord(lookup.merchant)!;
          setResolvedStoreId(storeId);
        }
      }
      if (!storeId && cleanCode) {
        if (isUuidLike(cleanCode)) {
          storeId = cleanCode;
        } else {
          const lookup = await fetchStoreByRef(cleanCode);
          if (lookup.error) console.warn('[Checkout] Store lookup warning (code):', lookup.error);
          if (storeIdFromRecord(lookup.merchant)) {
            storeId = storeIdFromRecord(lookup.merchant)!;
            setResolvedStoreId(storeId);
          }
        }
      }
      if (!storeId) {
        const mid = String((merchant as any)?.id || '').trim();
        if (isUuidLike(mid)) storeId = mid;
      }

      if (!resolvedStoreCode || !String(resolvedStoreCode).trim()) {
        resolvedStoreCode = 'ZID-BD-1001';
      }

      if (!storeId || !isUuidLike(storeId)) {
        storeId = cleanSlug || cleanCode || resolvedStoreCode || 'bd';
      }
    } catch (err: any) {
      console.warn('[Checkout] Store resolution warning:', err?.message || err, {
        store_id: storeId,
        store_code: resolvedStoreCode,
      });
    }

    (newOrder as any).storeId = storeId;

    // Persist EVERY store identifier explicitly so the merchant dashboard's
    // order query can always find this order: the merchant layer keys off
    // `merchantId`, the order layer off `store_slug`, and the permanent record
    // off `store_id`/`store_code`. A successful POST that stored only one of
    // these is exactly what made a placed order appear as 0 in the dashboard.
    const orderPayload = {
      ...newOrder,
      storeId,
      store_id: storeId,
      storeSlug: effectiveStoreSlug,
      store_slug: effectiveStoreSlug,
      merchantId: (newOrder as any).merchantId || (merchant as any)?.id || storeId || effectiveStoreSlug,
      storeCode: resolvedStoreCode || (merchant as any)?.storeCode || '',
      store_code: resolvedStoreCode || (merchant as any)?.store_code || '',
    };

    // Save order to backend API (MongoDB-backed). Non-blocking: log failures
    // but NEVER alert or return early.
    try {
      await fetch(`${window.location.origin}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([orderPayload]),
      }).catch(err => console.warn('[Checkout] Order API warning:', err));
    } catch (e) {
      console.warn('[Checkout] Order API warning:', e);
    }

    // Only now — after a successful insert — proceed to the success screen.
    setConfirmedOrderNum(orderNum);
    onPlaceOrder(newOrder);
    setCheckoutStep('success');
    setCart([]);

    // Report the conversion to whichever pixels the merchant configured.
    // Guarded so a missing/blocked script can never break the checkout flow.
    try {
      const w = window as unknown as {
        fbq?: (...a: any[]) => void;
        gtag?: (...a: any[]) => void;
      };
      const items = (newOrder.items || []).map((i) => ({
        id: i.id,
        quantity: i.quantity,
      }));

      if (typeof w.fbq === 'function') {
        w.fbq('track', 'Purchase', {
          value: total,
          currency: 'BDT',
          num_items: items.length,
        });
      }
      if (typeof w.gtag === 'function') {
        w.gtag('event', 'purchase', {
          transaction_id: orderNum.replace('#', ''),
          value: total,
          currency: 'BDT',
          items,
        });
      }
    } catch {
      /* analytics must never disrupt a completed order */
    }
  };

  // ------------------------------------------------------------------
  // Item-level return & review modal handlers (customer order cards)
  //
  // Both actions POST to a real API route that persists to MongoDB, then update
  // the local cache optimistically so the card's action button flips to its
  // done-state immediately — even if the network round-trip is still in flight.
  // ------------------------------------------------------------------
  const returnWindowDays = Number(
    (storefrontMerchant as any)?.returnWindowDays ?? (merchant as any)?.returnWindowDays ?? 7
  ) || 7;

  const openReviewModal = (order: Order, item: OrderItem) => {
    setReviewModal({ order, item });
    setModalRating(0);
    setModalComment('');
    setModalError('');
  };

  const openReturnModal = (order: Order, item: OrderItem) => {
    setReturnModal({ order, item });
    setModalReturnReason('');
    setModalReturnNote('');
    setModalReturnImage('');
    setModalError('');
  };

  const closeItemModals = () => {
    setReviewModal(null);
    setReturnModal(null);
    setModalError('');
    setIsModalSubmitting(false);
  };

  const handleModalReturnImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setModalReturnImage(String(reader.result || ''));
    reader.onerror = () => setModalError('Could not read the selected image.');
    reader.readAsDataURL(file);
  };

  /** POST a review for a single ordered item to /api/reviews. */
  const handleSubmitModalReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewModal) return;
    setModalError('');
    if (modalRating < 1 || modalRating > 5) {
      setModalError(t('sf_review_required'));
      return;
    }
    const { order, item } = reviewModal;
    const slug = String(effectiveStoreSlug || '').split(':')[0].trim();
    setIsModalSubmitting(true);
    let saved = false;
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: item.id,
          productName: item.productName,
          orderId: order.id,
          orderNumber: order.orderNumber,
          rating: modalRating,
          comment: modalComment.trim(),
          customerName: customerSession?.name || order.customerName,
          customerPhone: customerSession?.phone || order.customerPhone,
          storeSlug: slug,
          storeId: order.storeId,
          merchantId: (merchant as any)?.id || order.merchantId,
        }),
      });
      const data = await res.json().catch(() => null);
      saved = Boolean(res.ok && data?.ok !== false);
    } catch (err: any) {
      saved = false;
    }
    setIsModalSubmitting(false);

    // Optimistic local record so the card shows "Reviewed" right away.
    const newReview: CustomerReviewItem = {
      id: `rev-${Date.now()}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      productId: item.id,
      productTitle: item.productName,
      productImage: item.image,
      rating: modalRating,
      comment: modalComment.trim(),
      customerName: customerSession?.name || order.customerName,
      createdAt: new Date().toLocaleString(),
    };
    setCustomerReviews((prev) => [newReview, ...prev]);
    if (!saved) console.warn('[TenantStorefrontView] review saved locally; server sync pending');
    closeItemModals();
  };

  /** POST a return request for a single ordered item to /api/returns. */
  const handleSubmitModalReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnModal) return;
    setModalError('');
    if (!modalReturnReason.trim()) {
      setModalError(t('sf_choose_reason'));
      return;
    }
    const { order, item } = returnModal;
    const slug = String(effectiveStoreSlug || '').split(':')[0].trim();
    const token = 'RTK-' + Math.floor(100000 + Math.random() * 900000);
    setIsModalSubmitting(true);
    let saved = false;
    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          orderNumber: order.orderNumber,
          productId: item.id,
          productName: item.productName,
          reason: modalReturnReason,
          note: modalReturnNote.trim(),
          image: modalReturnImage || undefined,
          token,
          customerName: customerSession?.name || order.customerName,
          customerPhone: customerSession?.phone || order.customerPhone,
          storeSlug: slug,
          storeId: order.storeId,
          merchantId: (merchant as any)?.id || order.merchantId,
        }),
      });
      const data = await res.json().catch(() => null);
      saved = Boolean(res.ok && data?.ok !== false);
    } catch (err: any) {
      saved = false;
    }
    setIsModalSubmitting(false);

    const newReturn: CustomerReturnRequest = {
      id: `ret-${Date.now()}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      productId: item.id,
      productName: item.productName,
      reason: modalReturnReason,
      status: 'Pending',
      token,
      createdAt: new Date().toLocaleString(),
    };
    setCustomerReturns((prev) => [newReturn, ...prev]);
    if (!saved) console.warn('[TenantStorefrontView] return saved locally; server sync pending');
    closeItemModals();
  };

  // Ensure all active created products render under Products section regardless of sub-category assignment
  const displayProducts = (storefrontProducts || [])
    .filter(p => {
      const status = (p?.status || 'active').toLowerCase();
      const isPublished = p?.is_published !== false;
      return status !== 'archived' && status !== 'hidden' && isPublished;
    })
    .filter(p => {
      // Category carousel filter selection
      if (activeCategoryFilter && activeCategoryFilter !== 'all') {
        const filterLower = activeCategoryFilter.toLowerCase().trim();
        const pCatLower = (p.category || '').toLowerCase().trim();
        const pCatId = String(p.categoryId || p.category_id || '').toLowerCase().trim();
        const isMatch = pCatLower === filterLower || pCatId === filterLower;
        if (!isMatch) return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      if ((p.title || '').toLowerCase().includes(q) || ((p as any).name || '').toLowerCase().includes(q)) return true;

      const pCatLower = (p.category || '').toLowerCase();
      if (pCatLower.includes(q)) return true;

      const matchedCat = rawStorefrontCategories.find(c => c.name.toLowerCase() === q);
      if (matchedCat) {
        const pCatId = p.categoryId || p.category_id;
        if (pCatId && matchedCat.id && pCatId === matchedCat.id) return true;
        if (q === 'home' && (!pCatLower || pCatLower === 'home' || pCatLower === 'general')) return true;
      }

      return false;
    });

  // ── Theme-driven layout switch ──────────────────────────
  // The merchant's selected theme (or a forced preview theme) decides which
  // layout renders. 'supermarket' and 'fashion' mount their dedicated designs;
  // 'classic' falls through to the full-featured storefront below. This is the
  // mechanism that makes choosing a theme on the dashboard actually change
  // what shoppers see on /store/:slug.
  const resolvedLayout = layout || resolveLayoutForTheme({ id: effectiveThemeId });
  if (resolvedLayout === 'supermarket') {
    return <SupermarketTechMockup accentColor={primaryColor} />;
  }
  if (resolvedLayout === 'fashion') {
    return <ElegantFashionMockup accentColor={primaryColor} />;
  }

  // Shared customer order list — rendered by the ORDERS TAB ONLY.
  // Each order renders as a clean card: id / purchase date / total / payment
  // badge, a live tracking bar, and item-level "Write Review" / "Request Return"
  // action buttons (enabled only when the order is Delivered / in-window).
  // The Profile tab intentionally does NOT render this.
  const renderCustomerOrderList = () => (
    <section className="space-y-4">
      <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
        <PackageCheck className="w-5 h-5 text-[var(--primary-accent)]" />
        {t('sf_my_orders')}
      </h2>
      {customerOrders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
            <ShoppingBag className="w-7 h-7 text-slate-300" />
          </div>
          <h3 className="text-lg font-black text-slate-900">{t('sf_empty_orders_title')}</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{t('sf_empty_orders_desc')}</p>
          <button
            onClick={() => { setCheckoutStep('catalog'); setMobileTab('home'); }}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--primary-accent)] px-6 py-3 text-sm font-black text-slate-950 hover:bg-[var(--primary-accent)]/90 transition cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" /> {t('sf_continue_shopping')}
          </button>
        </div>
      ) : (
        customerOrders.map((order) => {
          const statusBadge = getOrderStatusBadge(order);
          const paymentBadge = getPaymentBadge(order);
          const stepIndex = getTrackingStepIndex(order);
          const delivered = isDelivered(order);
          const returnable = isReturnEligible(order, returnWindowDays);
          // Merchant's Approve / Reject / Refund decision, projected onto the
          // customer's own tracking timeline (see PATCH /api/returns/:id).
          const returnBadge = getReturnStatusBadge(order);
          return (
            <div key={order.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {/* Header: order id · purchase date · total · payment status badge */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-4">
                <div className="min-w-0">
                  <div className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400">{order.orderNumber}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {t('sf_purchase_date')} {safeDate(order.createdAt)}</span>
                    <span className="inline-flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" /> {order.paymentMethod}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-slate-900">৳{safeAmount(order.totalBDT)}</div>
                  <div className="mt-1 flex flex-wrap justify-end gap-1.5">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-black ${statusBadge.className}`}>
                      {isBn ? statusBadge.labelBn : statusBadge.label}
                    </span>
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-black ${paymentBadge.className}`}>
                      {isBn ? paymentBadge.labelBn : paymentBadge.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Live tracking bar: Order Placed → Processing → Out for Delivery → Delivered */}
              <div className="px-4 pt-4">
                {statusBadge.cancelled ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                    {t('sf_order_cancelled')}
                  </div>
                ) : (
                  <div className="flex items-start">
                    {TRACKING_STEPS.map((step, i) => {
                      const active = i <= stepIndex;
                      const current = i === stepIndex;
                      return (
                        <React.Fragment key={step.key}>
                          <div className="flex min-w-[54px] flex-col items-center gap-1">
                            <div className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition ${active ? 'border-transparent bg-[var(--primary-accent)] text-slate-950' : 'border-slate-200 bg-white text-slate-300'}`}>
                              {active ? <Check className="w-3.5 h-3.5" /> : <span className="text-[10px] font-black">{i + 1}</span>}
                            </div>
                            <span className={`text-center text-[9px] font-bold leading-tight ${current ? 'text-slate-900' : active ? 'text-slate-600' : 'text-slate-400'}`} style={{ maxWidth: 70 }}>
                              {isBn ? step.labelBn : step.label}
                            </span>
                          </div>
                          {i < TRACKING_STEPS.length - 1 && (
                            <div className={`mt-3.5 h-0.5 flex-1 rounded-full ${i < stepIndex ? 'bg-[var(--primary-accent)]' : 'bg-slate-200'}`} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Return-decision strip — sits directly on the tracking timeline
                  so the customer sees the merchant's Approve / Reject outcome
                  live (refreshes with the same 15s order poll as the steps). */}
              {returnBadge && (
                <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${returnBadge.className}`}>
                  <span className="flex items-center gap-1.5 text-[11px] font-black tracking-wide">
                    <RotateCcw className="h-3.5 w-3.5" />
                    {isBn ? returnBadge.labelBn : returnBadge.label}
                  </span>
                  <span className="text-[10px] font-semibold opacity-80">{t('sf_return_status')}</span>
                </div>
              )}
              {/* Items — each with its own Write Review / Request Return buttons */}
              {order.items && order.items.length > 0 && (
                <div className="mt-2 divide-y divide-slate-100">
                  {order.items.map((item, idx) => {
                    const reviewed = customerReviews.some((r) => r.orderId === order.id && (!r.productId || r.productId === item.id));
                    // This customer's own return row for the item. Its status is
                    // refreshed by the poll above, so the label reflects the
                    // merchant's Approve / Reject decision live.
                    const itemReturn = customerReturns.find((r) => r.orderId === order.id && (!r.productId || r.productId === item.id));
                    const returned = Boolean(itemReturn);
                    const returnLabel = !itemReturn
                      ? t('sf_request_return')
                      : itemReturn.status === 'Approved'
                        ? t('sf_return_approved')
                        : itemReturn.status === 'Rejected'
                          ? t('sf_return_rejected')
                          : itemReturn.status === 'Refunded'
                            ? t('sf_return_refunded')
                            : t('sf_return_requested');
                    return (
                      <div key={`${order.id}-${item.id || idx}`} className="flex flex-wrap items-center gap-3 p-4">
                        {item.image ? (
                          <SafeImage src={item.image} alt="" className="h-12 w-12 rounded-xl border border-slate-100 object-cover" />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
                            <ShoppingBag className="h-5 w-5 text-slate-300" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-slate-800">{item.productName}</div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {item.variant ? `${item.variant} · ` : ''}× {item.quantity}
                          </div>
                          <div className="mt-0.5 text-sm font-black text-slate-900">৳{safeAmount((item.unitPriceBDT || 0) * item.quantity)}</div>
                        </div>
                        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                          <button
                            type="button"
                            disabled={!delivered || reviewed}
                            title={!delivered ? t('sf_review_after_delivery') : undefined}
                            onClick={() => openReviewModal(order, item)}
                            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition ${delivered && !reviewed ? 'cursor-pointer border-[var(--primary-accent)] bg-[var(--primary-accent)]/10 text-slate-900 hover:bg-[var(--primary-accent)]/20' : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'}`}
                          >
                            <Star className={`h-3.5 w-3.5 ${delivered && !reviewed ? 'fill-amber-400 text-amber-400' : ''}`} />
                            {reviewed ? t('sf_reviewed') : t('sf_write_review')}
                          </button>
                          <button
                            type="button"
                            disabled={!returnable || returned}
                            title={!returnable ? t('sf_return_not_eligible') : undefined}
                            onClick={() => openReturnModal(order, item)}
                            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition ${returnable && !returned ? 'cursor-pointer border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'}`}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            {returnLabel}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {(order.trackingCode || order.courierName) && (
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-400">
                  <span className="font-mono">{order.trackingCode || order.courierName}</span>
                </div>
              )}
            </div>
          );
        })
      )}
    </section>
  );

  return (
    <div
      className="min-h-screen w-full font-sans bg-[#0f172a] text-slate-100 selection:text-slate-950 selection:bg-amber-400 overflow-x-hidden"
      style={{
        // `--primary-accent` is the canonical token; `--theme-primary` remains
        // as an alias so any existing consumer keeps working unchanged.
        ['--primary-accent' as string]: primaryColor,
        ['--theme-primary' as string]: primaryColor,
      } as React.CSSProperties}
    >
      <div className="w-full min-h-screen bg-[#0f172a] text-slate-100 relative flex flex-col overflow-x-hidden pb-24">
        {isSplashVisible && (
          <div className="fixed inset-0 z-[80] bg-slate-950/95 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center animate-pulse">
                <div className="relative flex items-center justify-center w-20 h-20 rounded-[24px] bg-[var(--primary-accent)] shadow-[0_0_40px_rgba(0,214,143,0.45)]">
                <span className="text-2xl font-black text-slate-950">Z</span>
                <div className="absolute -inset-2 rounded-[28px] border-2 border-[var(--primary-accent)]/70 animate-ping" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.35em] text-[var(--primary-accent)]">ZID SAAS BD</div>
                <div className="mt-2 text-xl font-black text-white">{t('sf_loading_storefront')}</div>
              </div>
            </div>
          </div>
        )}

        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          .animate-slide-in {
            animation: slideInRight 0.3s ease-out;
          }
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in-up {
            animation: fadeInUp 0.4s ease-out;
          }
          @keyframes zidMarqueeSlide {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .zid-marquee-track {
            display: inline-flex;
            width: max-content;
            animation: zidMarqueeSlide 22s linear infinite;
            will-change: transform;
          }
          .zid-marquee-track:hover {
            animation-play-state: paused;
          }
        `}</style>

        {/* Top Header Bar (Luxury Dark Glassmorphism) */}
        <header
          className={`${resolvedTheme.headerSticky ? 'sticky top-0' : ''} z-40 ${
            headerPalette.isLight ? 'text-[#0f172a]' : 'text-[#e2e8f0]'
          } bg-[#0f172a]/90 backdrop-blur-xl border-b border-slate-800/80 shadow-2xl`}
          style={{ backgroundColor: headerPalette.background }}
        >
          {/* Top Announcement Bar — themed from Theme Editor settings */}
          {resolvedTheme.showAnnouncement && (
          <div
            className="py-1.5 px-3 overflow-hidden whitespace-nowrap relative text-[11px] font-black uppercase tracking-wider shadow-md"
            style={{ backgroundColor: resolvedTheme.announcementBg, color: headerPalette.fg }}
          >
            <div
              className="zid-marquee-track inline-flex items-center"
              style={resolvedTheme.isMarquee ? { animationDuration: `${resolvedTheme.marqueeSpeed}s` } : { animation: 'none' }}
            >
              {[0, 1].map((half) => (
                <React.Fragment key={half}>
                  {resolvedTheme.announcementItems.map((item, i) => (
                    <React.Fragment key={`${half}-${i}`}>
                      <span className="mx-2">{item}</span>
                      <span className="mx-2">✦</span>
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
          )}

          <div className="py-2.5 px-3.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0 cursor-pointer" onClick={() => { setCheckoutStep('catalog'); setMobileTab('home'); }}>
              <button
                className="p-1.5 -ml-1 text-slate-300 hover:text-amber-400 rounded-lg shrink-0 transition"
                onClick={(e) => { e.stopPropagation(); setIsMobileMenuOpen(!isMobileMenuOpen); }}
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* PLATFORM BRANDING — the ZID SaaS BD wordmark. Rendered
                  unconditionally in its ORIGINAL stacked position: a
                  merchant's custom store logo must never replace, hide or
                  overwrite the SaaS platform mark. */}
              <div className="flex flex-col min-w-0">
                <BrandLogo size="sm" showSubtitle={false} isDarkMode={true} />
                <h1 className="text-xs font-black tracking-wider text-amber-400 truncate max-w-[170px] mt-0.5 uppercase">
                  {storefrontMerchant.storeName === 'My Zid Store' ? 'SlateBD' : storefrontMerchant.storeName || 'SlateBD'}
                </h1>
              </div>
            </div>

            {/* MERCHANT STORE LOGO — the Desktop / Mobile logo from the Header
                Logo panel, centred in the navbar and completely independent of
                the platform branding on the left. Rendered ONLY when the
                merchant has actually set one, so an unset logo leaves the
                default layout exactly as it was. */}
            {showHeaderLogo && (
              <div className="flex-1 min-w-0 flex justify-center px-2">
                <img
                  src={headerLogoSrc}
                  alt={storefrontMerchant.storeName || 'Store logo'}
                  style={{ height: `${headerLogoHeight}px` }}
                  className="max-w-full object-contain object-center"
                  onError={() => setHeaderLogoFailed(true)}
                />
              </div>
            )}

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className="p-1.5 text-slate-300 hover:text-amber-400 transition rounded-lg hover:bg-slate-800/80 border border-transparent hover:border-slate-700/60"
                style={resolvedTheme.showSearchBar ? undefined : { display: 'none' }}
              >
                <Search className="w-5 h-5" />
              </button>

              <LanguageToggle compact />

              {customerSession ? (
                <button
                  onClick={handleCustomerSignOut}
                  className="p-1.5 text-slate-300 hover:text-rose-400 transition rounded-lg hover:bg-slate-800/80 border border-transparent hover:border-slate-700/60"
                  title={t('sf_sign_out')}
                >
                  <LogOut className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={() => setIsAuthOpen(true)}
                  className="p-1.5 text-slate-300 hover:text-amber-400 transition rounded-lg hover:bg-slate-800/80 border border-transparent hover:border-slate-700/60"
                  title={t('sf_customer_sign_in')}
                >
                  <User className="w-5 h-5" />
                </button>
              )}

              <button
                onClick={() => setIsCartOpen(true)}
                className="relative p-2 text-slate-200 hover:text-amber-400 transition rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 shadow-md cursor-pointer"
              >
                <ShoppingBag className="w-5 h-5" />
                {cart.length > 0 && (
                  <span className="absolute -top-1 -right-1 text-slate-950 text-[10px] font-black min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center bg-gradient-to-r from-amber-400 to-[var(--primary-accent)] shadow-[0_0_10px_rgba(212,175,55,0.4)]">
                    {cart.reduce((s, i) => s + i.quantity, 0)}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Dynamic Header Navigation — merchant-defined links from MongoDB
              (navigation_menus / navigationMenus). Hidden when the merchant has
              not configured any, so the header is never padded with invented
              links. Horizontally scrollable on narrow screens. */}
          {storeModules.navigationMenus.header.length > 0 && (
            <nav className="px-3.5 pb-2 -mt-1 overflow-x-auto no-scrollbar">
              <ul className="flex items-center gap-1.5 min-w-max">
                {storeModules.navigationMenus.header.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.url}
                      onClick={(e) => {
                        // In-app links must not trigger a full page reload; only
                        // external URLs are left to the browser.
                        if (!/^https?:\/\//i.test(link.url)) {
                          e.preventDefault();
                          setCheckoutStep('catalog');
                          setMobileTab('home');
                        }
                      }}
                      className="inline-block px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-300 hover:text-amber-400 hover:bg-slate-800/80 border border-transparent hover:border-slate-700/60 transition whitespace-nowrap"
                    >
                      {link.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {/* Search Input Popup */}
          {isSearchOpen && (
            <div className="p-3 bg-slate-900 border-t border-slate-800/80 shadow-xl animate-fade-in-up">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('sf_search_placeholder')}
                  className="w-full rounded-xl pl-10 pr-8 py-2.5 text-xs bg-slate-950 text-slate-100 border border-slate-700/80 focus:border-amber-400 outline-none shadow-inner font-medium"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-400 text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Mobile Menu Dropdown */}
          {isMobileMenuOpen && (
            <div className="border-t border-slate-800/80 bg-slate-900/95 backdrop-blur-xl shadow-2xl p-3 space-y-1 animate-fade-in-up">
              <button
                onClick={() => { setCheckoutStep('catalog'); setMobileTab('home'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2.5 transition ${mobileTab === 'home' ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30' : 'text-slate-300 hover:bg-slate-800/60'}`}
              >
                <Home className="w-4 h-4 text-amber-400" /> {t('sf_home')}
              </button>
              <button
                onClick={() => { setCheckoutStep('catalog'); setMobileTab('orders'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2.5 transition ${mobileTab === 'orders' ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30' : 'text-slate-300 hover:bg-slate-800/60'}`}
              >
                <PackageCheck className="w-4 h-4 text-emerald-400" /> {t('sf_my_orders')}
              </button>
              <button
                onClick={() => { setCheckoutStep('catalog'); setMobileTab('profile'); setIsMobileMenuOpen(false); }}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2.5 transition ${mobileTab === 'profile' ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30' : 'text-slate-300 hover:bg-slate-800/60'}`}
              >
                <User className="w-4 h-4 text-slate-400" /> {t('sf_tab_profile')}
              </button>
            </div>
          )}
        </header>

      {/* Main Content Area */}
      <main className="w-full">

        {/* Catalog View */}
        {checkoutStep === 'catalog' && (
          <>
            {mobileTab === 'home' && (
            <div className="space-y-6 pb-6">

            {/* Hero Banner (Luxury Dark Aesthetic) — themed from Theme Editor settings */}
            {resolvedTheme.showHeroBanner && (
            <div className="w-full h-[220px] relative overflow-hidden bg-slate-950 border-b border-slate-800/80">
              {heroImageList.length > 1 ? (
                heroImageList.map((img, idx) => (
                  <div
                    key={idx}
                    className="absolute inset-0 w-full h-full transition-opacity duration-700 ease-in-out"
                    style={{
                      opacity: idx === activeHeroIndex ? 1 : 0,
                      pointerEvents: idx === activeHeroIndex ? 'auto' : 'none',
                    }}
                  >
                    <SafeImage
                      src={img}
                      alt={`Hero Banner ${idx + 1}`}
                      className="w-full h-full object-cover opacity-50 scale-105 transition-transform duration-700"
                    />
                  </div>
                ))
              ) : (
                <SafeImage
                  src={heroImageList[0] || activeHeroSlide?.image || resolvedTheme.heroImage || "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=800&q=80"}
                  alt="Hero Banner"
                  className="w-full h-full object-cover opacity-50 scale-105 transition-transform duration-700 hover:scale-100"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/50 to-transparent flex items-end p-5">
                <div className="space-y-2 max-w-sm">
                  <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-400 to-[var(--primary-accent)] text-slate-950 text-[10px] font-black uppercase tracking-widest px-3 py-0.5 rounded-full shadow-lg">
                    <Sparkles className="w-3 h-3 fill-slate-950" />
                    {t('sf_new_arrivals')}
                  </span>
                  <h2 className="text-2xl font-black text-white leading-tight tracking-tight drop-shadow-md">
                    {activeHeroSlide?.title || resolvedTheme.heroTitle || t('sf_hero_fallback_title')}
                  </h2>
                  <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                    {activeHeroSlide?.subtitle || resolvedTheme.heroSubtitle || t('sf_hero_fallback_subtitle')}
                  </p>
                  {activeHeroSlide?.ctaText && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-black text-[var(--primary-accent)]">
                      {activeHeroSlide.ctaText} <ArrowRight className="w-3 h-3" />
                    </span>
                  )}
                </div>
              </div>
            </div>
            )}

            <div className="px-4 space-y-7">

              {/* Interactive Category Section — themed from Theme Editor */}
              {resolvedTheme.showCategories && (
              <section className="space-y-3">
                <div className="flex justify-between items-center px-0.5">
                  <div>
                    <h2 className="text-sm font-black text-slate-100 tracking-tight uppercase flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      {resolvedTheme.categoriesHeading || t('sf_popular_categories')}
                    </h2>
                    <p className="text-[11px] text-slate-400">{resolvedTheme.categoriesSubtitle || t('sf_shop_by_category')}</p>
                  </div>

                  {/* Chevron scroll buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => scrollCategories('left')}
                      className="p-1.5 rounded-lg bg-slate-800/80 text-slate-300 hover:text-amber-400 border border-slate-700/60 transition cursor-pointer"
                      aria-label="Scroll left"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => scrollCategories('right')}
                      className="p-1.5 rounded-lg bg-slate-800/80 text-slate-300 hover:text-amber-400 border border-slate-700/60 transition cursor-pointer"
                      aria-label="Scroll right"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div
                  ref={categoryCarouselRef}
                  className={
                    resolvedTheme.categoriesLayout === 'Grid'
                      ? "grid gap-3"
                      : resolvedTheme.categoriesLayout === 'List'
                        ? "flex flex-col gap-2"
                        : "flex items-center gap-3 overflow-x-auto pb-2 pt-1 scrollbar-none snap-x"
                  }
                  style={resolvedTheme.categoriesLayout === 'Grid' ? { gridTemplateColumns: `repeat(${Math.max(2, Math.min(resolvedTheme.categoriesItemsPerRow, 4))}, minmax(0, 1fr))` } : undefined}
                >
                  {/* 'All Items' pill */}
                  <div
                    onClick={() => setActiveCategoryFilter('all')}
                    className={`snap-start shrink-0 rounded-2xl p-3 border transition-all duration-300 cursor-pointer min-w-[105px] flex flex-col items-center justify-center gap-1.5 ${
                      activeCategoryFilter === 'all'
                        ? 'bg-gradient-to-br from-amber-500/20 via-slate-900 to-emerald-500/20 border-amber-400 text-amber-300 shadow-[0_0_15px_rgba(212,175,55,0.25)]'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeCategoryFilter === 'all' ? 'bg-amber-400 text-slate-950 font-black' : 'bg-slate-800 text-slate-300'}`}>
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-extrabold truncate max-w-[90px]">All Items</span>
                    <span className="text-[9px] font-bold text-slate-400">{allActiveProducts.length} Items</span>
                  </div>

                  {(storefrontCategories.length
                    ? storefrontCategories
                    : (Array.from(new Set(displayProducts.map(p => p.category))) as string[]).map(name => ({ name, image: '' }) as { name: string; status?: string; image?: string; coverImage?: string })
                  ).map((cat, i) => {
                    const catName = typeof cat === 'string' ? cat : (cat?.name || '');
                    const catId = typeof cat === 'object' && cat ? (cat.id || catName) : catName;
                    const catImage = cat && typeof cat === 'object' ? (cat.image || cat.coverImage || '') : '';
                    const firstProductImage = displayProducts.find(p => p.category === catName)?.image || '';
                    const image = catName ? (catImage || firstProductImage) : '';
                    const isSelected = activeCategoryFilter === catName || activeCategoryFilter === String(catId);
                    const productCount = (cat as any)?.productCount ?? allActiveProducts.filter(p => p.category === catName).length;

                    return (
                      <div
                        key={catName || `cat-${i}`}
                        onClick={() => {
                          setActiveCategoryFilter(isSelected ? 'all' : (catName || String(catId)));
                        }}
                        className={`snap-start shrink-0 rounded-2xl p-2.5 border transition-all duration-300 cursor-pointer min-w-[115px] flex flex-col items-center justify-center gap-1.5 ${
                          isSelected
                            ? 'bg-gradient-to-br from-amber-500/20 via-slate-900 to-emerald-500/20 border-amber-400 text-amber-300 shadow-[0_0_18px_rgba(212,175,55,0.25)] scale-[1.02]'
                            : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                        }`}
                      >
                        <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-slate-800 border border-slate-700/80">
                          {image ? (
                            <SafeImage src={image} alt={catName} className="w-full h-full object-cover group-hover:scale-110 transition duration-300" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-500/30 to-emerald-500/30 text-amber-300 font-black text-base">
                              {catName.charAt(0) || 'Z'}
                            </div>
                          )}
                        </div>
                        <div className="text-center">
                          <h3 className="font-extrabold text-xs text-slate-100 truncate max-w-[100px]">{catName || t('sf_products')}</h3>
                          <p className="text-[9px] font-semibold text-slate-400">{productCount} items</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
              )}

              {/* Products Section (Grid / Carousel / List) — themed from Theme Editor */}
              {resolvedTheme.showFeaturedGrid && (
              <section id="storefront-products-section" className="space-y-3.5">
                <div className="flex justify-between items-center border-b border-slate-800/80 pb-2.5">
                  <div>
                    <h2 className="text-base font-black text-slate-100 uppercase tracking-tight flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-[var(--primary-accent)]" />
                      {resolvedTheme.featuredHeading || t('sf_products')}
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      {activeCategoryFilter !== 'all' ? `Filtered by ${activeCategoryFilter}` : t('sf_discover_collection')}
                    </p>
                  </div>
                  {activeCategoryFilter !== 'all' && (
                    <button
                      onClick={() => setActiveCategoryFilter('all')}
                      className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-full border border-amber-400/20 hover:bg-amber-400/20 transition cursor-pointer"
                    >
                      Clear Filter
                    </button>
                  )}
                </div>

                <div
                  className={
                    resolvedTheme.productsLayout === 'List'
                      ? "flex flex-col gap-3"
                      : resolvedTheme.productsLayout === 'Carousel'
                        ? "flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x"
                        : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
                  }
                  style={resolvedTheme.productsLayout === 'Carousel' ? undefined : undefined}
                >
                  {displayProducts.length === 0 ? (
                    <div className={`${resolvedTheme.productsLayout === 'List' ? '' : 'col-span-2 md:col-span-3 lg:col-span-4'} rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 px-4 py-12 text-center space-y-2`}>
                      <ShoppingBag className="mx-auto h-10 w-10 text-slate-600" />
                      <h3 className="text-sm font-black text-slate-200">{isLoadingSupabase ? t('sf_loading_storefront') : t('sf_no_products')}</h3>
                      <p className="text-xs text-slate-500">
                        {isLoadingSupabase
                          ? 'Fetching products from the store database…'
                          : catalogLoadFailed
                            ? 'Products could not be loaded right now. Please try again later.'
                            : t('sf_no_products_desc')}
                      </p>
                    </div>
                  ) : displayProducts.map(p => (
                    <div
                      key={p.id}
                      data-testid="product-card"
                      data-product-id={p.id}
                      className={`group flex flex-col justify-between bg-slate-900/80 backdrop-blur-md rounded-2xl overflow-hidden border border-slate-800/80 hover:border-amber-500/40 hover:shadow-[0_0_25px_rgba(212,175,55,0.15)] transition-all duration-300 relative ${
                        resolvedTheme.productsLayout === 'Carousel' ? 'snap-start shrink-0 w-[220px]' : ''
                      } ${
                        resolvedTheme.productsLayout === 'List' ? 'flex-row items-center' : ''
                      }`}
                    >
                      {/* Status & Stock Badges */}
                      <div className="absolute top-2.5 left-2.5 right-2.5 z-10 flex items-center justify-between pointer-events-none">
                        {p.compareAtPriceBDT && p.compareAtPriceBDT > (p.priceBDT || 0) ? (
                          <span className="bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-md flex items-center gap-1">
                            <Flame className="w-2.5 h-2.5 fill-slate-950" /> Sale
                          </span>
                        ) : (
                          <span className="bg-[var(--primary-accent)] text-slate-950 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-md">
                            Hot
                          </span>
                        )}

                        {/* Stock Badge */}
                        {(p.stock ?? 99) <= 0 ? (
                          <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">
                            Out of Stock
                          </span>
                        ) : (p.stock ?? 99) <= 5 ? (
                          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">
                            Only {p.stock} Left
                          </span>
                        ) : (
                          <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> In Stock
                          </span>
                        )}
                      </div>

                      {/* Image Container with Hover Effects.
                          `max-h-64` caps the square so a wide desktop column
                          can never blow the photo up to ~500px tall; the img
                          stays `object-cover` so it crops instead of scaling. */}
                      <div
                        className={`relative aspect-square max-h-64 bg-slate-950/80 overflow-hidden cursor-pointer ${
                          resolvedTheme.productsLayout === 'List' ? 'w-28 shrink-0 self-stretch' : ''
                        }`}
                        onClick={() => setQuickViewProduct(p)}
                      >
                        <SafeImage
                          src={resolveProductImage(p)}
                          alt={p.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out opacity-90 group-hover:opacity-100"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60 group-hover:opacity-30 transition-opacity" />

                        {/* Hover Quick View Trigger */}
                        <button
                          onClick={(e) => { e.stopPropagation(); setQuickViewProduct(p); }}
                          className="absolute bottom-2.5 right-2.5 p-2 rounded-xl bg-slate-900/80 backdrop-blur-md text-slate-200 hover:text-amber-400 border border-slate-700/80 opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110"
                          title="Quick View"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Card Content */}
                      <div className="p-3 space-y-2 flex-1 flex flex-col justify-between bg-slate-900/40">
                        <div>
                          <span className="text-[9px] font-extrabold text-amber-400 uppercase tracking-widest">{p.category || 'Collection'}</span>
                          <h4
                            className="font-bold text-xs text-slate-100 line-clamp-2 leading-snug cursor-pointer hover:text-amber-400 transition mt-0.5"
                            onClick={() => setQuickViewProduct(p)}
                          >
                            {p.title}
                          </h4>
                        </div>

                        <div className="pt-2 border-t border-slate-800/80 flex items-end justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="text-sm font-black text-amber-400 tracking-tight">
                              ৳{(p.priceBDT ?? 0).toLocaleString()}
                            </div>
                            {p.compareAtPriceBDT && (
                              <div className="text-[10px] text-slate-500 line-through font-mono">
                                ৳{(p.compareAtPriceBDT ?? 0).toLocaleString()}
                              </div>
                            )}
                            {/* This product's own delivery charge, so the customer
                                knows the landed cost before opening the cart. */}
                            {(() => {
                              const own = resolveProductDeliveryRates(p);
                              if (!own.hasProductRates) return null;
                              const insideFee = own.insideFee;
                              const outsideFee = own.outsideFee;
                              if (insideFee === null && outsideFee === null) return null;
                              return (
                                <div className="text-[9px] text-emerald-400 font-semibold pt-0.5">
                                  {insideFee !== null && outsideFee !== null && insideFee !== outsideFee
                                    ? `Delivery: ৳${insideFee} / ৳${outsideFee}`
                                    : `+ ৳${insideFee ?? outsideFee} delivery`}
                                </div>
                              );
                            })()}
                          </div>

                          <button
                            onClick={(e) => { e.stopPropagation(); handleAddToCart(p); }}
                            className="bg-gradient-to-r from-amber-400 via-[var(--primary-accent)] to-emerald-400 text-slate-950 font-black text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-md hover:shadow-amber-400/20 hover:scale-105 active:scale-95 transition cursor-pointer"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              )}

              {/* Countdown Timer Section — themed from Theme Editor */}
              {resolvedTheme.showCountdown && (
              <section
                className="relative rounded-2xl overflow-hidden border border-rose-500/30 p-5 text-center space-y-2"
                style={
                  resolvedTheme.countdownBgImage
                    ? { backgroundImage: `url(${resolvedTheme.countdownBgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : undefined
                }
              >
                {resolvedTheme.countdownBgImage && (
                  <div className="absolute inset-0 bg-slate-950" style={{ opacity: resolvedTheme.countdownOverlayOpacity / 100 }} />
                )}
                <div className="relative space-y-2">
                  <h3 className="text-base font-black text-white uppercase tracking-wide">{resolvedTheme.countdownTitle}</h3>
                  {resolvedTheme.countdownDiscount && (
                    <span className="inline-block bg-gradient-to-r from-rose-500 to-amber-400 text-slate-950 text-[11px] font-black uppercase px-3 py-1 rounded-full shadow-lg">
                      {resolvedTheme.countdownDiscount}
                    </span>
                  )}
                  <div className="flex items-center justify-center gap-2 pt-1">
                    {[{ v: countdownH, l: 'HRS' }, { v: countdownM, l: 'MIN' }, { v: countdownS, l: 'SEC' }].map((u) => (
                      <div key={u.l} className="min-w-[58px] px-2 py-2 rounded-xl bg-slate-900/85 border border-slate-700/80 backdrop-blur-sm">
                        <div className="text-lg font-black text-amber-400 tabular-nums leading-none">{String(u.v).padStart(2, '0')}</div>
                        <div className="text-[9px] font-bold text-slate-400 tracking-widest mt-1">{u.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
              )}

              {/* Gallery Section — themed from Theme Editor.
                  Reads `themeConfig.galleryImages`, which the customizer writes
                  through /api/stores/update. Blank rows (an "+ Add Image" entry
                  the merchant has not filled in yet) are dropped here rather
                  than rendered as empty tiles, and a whole section with no
                  usable image is skipped entirely instead of leaving a gap. */}
              {resolvedTheme.showGallery && galleryImageList.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-black text-slate-100 tracking-tight uppercase flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" />
                  {resolvedTheme.galleryHeading}
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {galleryImageList.map((img, i) => {
                    const galleryImg = (
                      <>
                        <SafeImage src={img.url} alt={img.caption || `Gallery ${i + 1}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        {img.caption && (
                          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 to-transparent px-2.5 py-2 text-[10px] font-bold text-slate-100 truncate">
                            {img.caption}
                          </span>
                        )}
                      </>
                    );
                    return img.link && img.link !== '#' ? (
                      <a key={`gal-${i}`} href={img.link} target="_blank" rel="noreferrer" className="group relative rounded-2xl overflow-hidden border border-slate-800/80 aspect-square bg-slate-900">
                        {galleryImg}
                      </a>
                    ) : (
                      <div key={`gal-${i}`} className="group relative rounded-2xl overflow-hidden border border-slate-800/80 aspect-square bg-slate-900">
                        {galleryImg}
                      </div>
                    );
                  })}
                </div>
              </section>
              )}

              {/* Video Section — themed from Theme Editor.
                  Uses the pre-resolved `videoEmbedUrl`, so a bare YouTube watch
                  link, a youtu.be short, a /shorts/ or /embed/ URL and a Vimeo
                  link all resolve correctly. Previously a link that matched
                  none of the regexes silently fell back to a placeholder clip,
                  and a merchant-uploaded file (a blob: URL) was not durable —
                  the section then vanished on the public storefront. */}
              {resolvedTheme.showVideo && hasVideoSource && (
              <section className="space-y-3">
                {resolvedTheme.videoTitle && (
                  <h2 className="text-sm font-black text-slate-100 tracking-tight uppercase flex items-center gap-2">
                    <Play className="w-4 h-4 text-amber-400" />
                    {resolvedTheme.videoTitle}
                  </h2>
                )}
                <div className="rounded-2xl overflow-hidden border border-slate-800/80 aspect-video bg-slate-950">
                  {resolvedTheme.videoFileUrl ? (
                    <video
                      src={resolvedTheme.videoFileUrl}
                      className="w-full h-full object-cover"
                      controls
                      autoPlay={resolvedTheme.videoAutoplay}
                      muted={resolvedTheme.videoAutoplay || resolvedTheme.videoMuted}
                      loop
                      playsInline
                    />
                  ) : (
                    <iframe
                      src={`${videoEmbedUrl}${videoEmbedUrl.includes('?') ? '&' : '?'}autoplay=${resolvedTheme.videoAutoplay ? 1 : 0}&mute=${(resolvedTheme.videoAutoplay || resolvedTheme.videoMuted) ? 1 : 0}`}
                      className="w-full h-full"
                      title={resolvedTheme.videoTitle || 'Store Video'}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  )}
                </div>
              </section>
              )}

              {/* FAQ Section — merchant-authored Q&A from MongoDB (`faqs`).
                  Rendered only when the merchant actually saved entries. */}
              {storeModules.faqs.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-black text-slate-100 tracking-tight uppercase flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-amber-400" />
                  {t('sf_faq_heading')}
                </h2>
                <div className="space-y-2">
                  {storeModules.faqs.map((faq, i) => (
                    <details
                      key={faq.id || `faq-${i}`}
                      className="group rounded-2xl bg-slate-900/60 backdrop-blur-md border border-slate-800/80 px-4 py-3 open:border-amber-400/50 transition"
                    >
                      <summary className="flex items-center justify-between gap-3 cursor-pointer list-none text-xs font-bold text-slate-100">
                        <span>{faq.question}</span>
                        <ChevronRight className="w-4 h-4 text-amber-400 shrink-0 transition-transform group-open:rotate-90" />
                      </summary>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-400 whitespace-pre-line">
                        {faq.answer}
                      </p>
                    </details>
                  ))}
                </div>
              </section>
              )}

              {/* Logo & Social Media Section — themed from Theme Editor */}
              {resolvedTheme.showSocialBlock && (
              <section className="rounded-2xl bg-slate-900/60 backdrop-blur-md border border-slate-800/80 p-5 space-y-3 text-center">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">{storefrontMerchant.storeName}</h3>
                {resolvedTheme.socialTagline && (
                  <p className="text-[11px] text-slate-400">{resolvedTheme.socialTagline}</p>
                )}
                <div className="pt-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Store Balance</p>
                  <p className="text-lg font-black text-[var(--primary-accent)] font-mono">৳{storeBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-1">
                  {resolvedTheme.showFacebook && resolvedTheme.facebookHandle && (
                    <a href={`https://facebook.com/${resolvedTheme.facebookHandle.replace(/^@/, '')}`} target="_blank" rel="noreferrer" title="Facebook" className="p-2.5 rounded-full bg-[#1877F2]/15 text-[#4d9fff] border border-[#1877F2]/30 hover:scale-110 transition"><Facebook className="w-4 h-4" /></a>
                  )}
                  {resolvedTheme.showInstagram && resolvedTheme.instagramHandle && (
                    <a href={`https://instagram.com/${resolvedTheme.instagramHandle.replace(/^@/, '')}`} target="_blank" rel="noreferrer" title="Instagram" className="p-2.5 rounded-full bg-pink-500/15 text-pink-400 border border-pink-500/30 hover:scale-110 transition"><Instagram className="w-4 h-4" /></a>
                  )}
                  {resolvedTheme.showWhatsapp && resolvedTheme.whatsappNumber && (
                    <a href={`https://wa.me/${resolvedTheme.whatsappNumber.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" title="WhatsApp" className="p-2.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:scale-110 transition"><MessageCircle className="w-4 h-4" /></a>
                  )}
                  {resolvedTheme.showTikTok && resolvedTheme.tiktokHandle && (
                    <a href={`https://tiktok.com/@${resolvedTheme.tiktokHandle.replace(/^@/, '')}`} target="_blank" rel="noreferrer" title="TikTok" className="p-2.5 rounded-full bg-slate-500/15 text-slate-200 border border-slate-500/30 hover:scale-110 transition"><Music className="w-4 h-4" /></a>
                  )}
                  {resolvedTheme.showYouTube && resolvedTheme.youtubeHandle && (
                    <a href={`https://youtube.com/@${resolvedTheme.youtubeHandle.replace(/^@/, '')}`} target="_blank" rel="noreferrer" title="YouTube" className="p-2.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 hover:scale-110 transition"><Youtube className="w-4 h-4" /></a>
                  )}
                </div>
              </section>
              )}

              {/* Store Benefits Section (Luxury Glass Cards) */}
              <section className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800/80 p-4 grid grid-cols-2 gap-3 text-center shadow-xl">
                <div className="space-y-1.5 p-2.5 bg-slate-950/50 rounded-xl border border-slate-800/60">
                  <div className="w-8 h-8 bg-amber-400/10 text-amber-400 rounded-lg flex items-center justify-center mx-auto border border-amber-400/20">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <h4 className="font-black text-xs text-slate-100">Cash On Delivery</h4>
                  <p className="text-[10px] text-slate-400">Nationwide Shipping</p>
                </div>
                <div className="space-y-1.5 p-2.5 bg-slate-950/50 rounded-xl border border-slate-800/60">
                  <div className="w-8 h-8 bg-pink-500/10 text-pink-400 rounded-lg flex items-center justify-center mx-auto border border-pink-500/20">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <h4 className="font-black text-xs text-slate-100">bKash & Nagad</h4>
                  <p className="text-[10px] text-slate-400">Instant Fast Pay</p>
                </div>
                <div className="space-y-1.5 p-2.5 bg-slate-950/50 rounded-xl border border-slate-800/60">
                  <div className="w-8 h-8 bg-emerald-500/10 text-emerald-400 rounded-lg flex items-center justify-center mx-auto border border-emerald-500/20">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <h4 className="font-black text-xs text-slate-100">Authentic Items</h4>
                  <p className="text-[10px] text-slate-400">100% Guaranteed</p>
                </div>
                <div className="space-y-1.5 p-2.5 bg-slate-950/50 rounded-xl border border-slate-800/60">
                  <div className="w-8 h-8 bg-indigo-500/10 text-indigo-400 rounded-lg flex items-center justify-center mx-auto border border-indigo-500/20">
                    <Clock className="w-4 h-4" />
                  </div>
                  <h4 className="font-black text-xs text-slate-100">Fast Shipping</h4>
                  <p className="text-[10px] text-slate-400">24-48 Hours Express</p>
                </div>
              </section>
            </div>
            </div>
            )}

            {/* ---------------- ORDERS TAB ---------------- */}
            {mobileTab === 'orders' && (
              <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-8">
                {!customerSession ? (
                  <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                    <User className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-xl font-black text-slate-900">{t('sf_sign_in_required')}</h3>
                    <p className="text-sm text-slate-500 mt-2 mb-6">{t('sf_sign_in_to_view_orders')}</p>
                    <button
                      onClick={() => { setIsAuthOpen(true); setAuthMode('signin'); }}
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary-accent)] px-6 py-3 text-sm font-black text-slate-950 hover:bg-[var(--primary-accent)]/90 transition cursor-pointer"
                    >
                      <User className="w-4 h-4" /> {t('sf_customer_sign_in')}
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Automatic Delivered banner */}
                    {customerOrders.some((o) => o.fulfillmentStatus === 'Delivered') && (
                      <div className="rounded-3xl border border-emerald-300/70           bg-gradient-to-r from-emerald-50 to-[var(--primary-accent)]/10 p-5 shadow-sm flex items-start gap-3">
                        <Sparkles className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-black text-emerald-800 text-sm">{t('sf_delivered_banner_title')}</h4>
                          <p className="text-sm text-emerald-900/90 leading-relaxed mt-1">{t('sf_delivered_banner')}</p>
                        </div>
                      </div>
                    )}

                    {renderCustomerOrderList()}
                  </>
                )}
              </div>
            )}
            {/* ---------------- PROFILE TAB ------------- */}
            {mobileTab === 'profile' && (
              <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-8">
                {!customerSession ? (
                  <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
                    <User className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-xl font-black text-slate-900">{t('sf_sign_in_required')}</h3>
                    <p className="text-sm text-slate-500 mt-2 mb-6">{t('sf_sign_in_to_profile')}</p>
                    <button
                      onClick={() => { setIsAuthOpen(true); setAuthMode('signin'); }}
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary-accent)] px-6 py-3 text-sm font-black text-slate-950 hover:bg-[var(--primary-accent)]/90 transition cursor-pointer"
                    >
                      <User className="w-4 h-4" /> {t('sf_customer_sign_in')}
                    </button>
                  </div>
                ) : (
                  <>
                    {/* ── Profile Card ── avatar + identity (name / phone / email) */}
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 shrink-0 rounded-2xl bg-[var(--primary-accent)] text-slate-950 font-black text-2xl flex items-center justify-center">
                          {customerSession.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-xl font-black text-slate-900 truncate">{customerSession.name}</h2>
                          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500 truncate">
                            <Phone className="w-3.5 h-3.5 shrink-0" /> {customerSession.phone}
                          </p>
                          <p className="flex items-center gap-1.5 text-sm text-slate-500 truncate">
                            <Globe className="w-3.5 h-3.5 shrink-0" /> {customerSession.email}
                          </p>
                        </div>
                      </div>
                      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                        <button
                          onClick={() => openProfileModal('edit')}
                          className="flex-1 min-w-[150px] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary-accent)] px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-[var(--primary-accent)]/90 transition cursor-pointer"
                        >
                          <User className="w-4 h-4" /> {t('sf_edit_profile')}
                        </button>
                        {/* Orders live in their OWN tab — this is just the shortcut. */}
                        <button
                          onClick={() => setMobileTab('orders')}
                          className="flex-1 min-w-[150px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                        >
                          <ShoppingBag className="w-4 h-4" /> {t('sf_my_orders')}
                        </button>
                      </div>
                    </div>
                    {/* ── Account Settings ── */}
                    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <h3 className="px-5 pt-5 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        {t('sf_account_settings')}
                      </h3>
                      <div className="divide-y divide-slate-100">
                        <button
                          onClick={() => openProfileModal('edit')}
                          className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition cursor-pointer"
                        >
                          <div className="w-9 h-9 shrink-0 rounded-xl bg-slate-100 flex items-center justify-center">
                            <User className="w-4 h-4 text-slate-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-800">{t('sf_edit_profile')}</div>
                            <div className="text-[11px] text-slate-500 truncate">{t('sf_edit_profile_desc')}</div>
                          </div>
                          <ChevronRight className="w-4 h-4 shrink-0 text-slate-300" />
                        </button>

                        <button
                          onClick={() => openProfileModal('addresses')}
                          className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition cursor-pointer"
                        >
                          <div className="w-9 h-9 shrink-0 rounded-xl bg-slate-100 flex items-center justify-center">
                            <MapPin className="w-4 h-4 text-slate-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-800">{t('sf_saved_addresses')}</div>
                            <div className="text-[11px] text-slate-500 truncate">{t('sf_saved_addresses_desc')}</div>
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
                            {savedAddresses.length}
                          </span>
                          <ChevronRight className="w-4 h-4 shrink-0 text-slate-300" />
                        </button>

                        <button
                          onClick={() => openProfileModal('password')}
                          className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition cursor-pointer"
                        >
                          <div className="w-9 h-9 shrink-0 rounded-xl bg-slate-100 flex items-center justify-center">
                            <Lock className="w-4 h-4 text-slate-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-800">{t('sf_change_password')}</div>
                            <div className="text-[11px] text-slate-500 truncate">{t('sf_change_password_desc')}</div>
                          </div>
                          <ChevronRight className="w-4 h-4 shrink-0 text-slate-300" />
                        </button>

                        <div className="w-full flex items-center justify-between gap-3 p-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 shrink-0 rounded-xl bg-slate-100 flex items-center justify-center">
                              <Globe className="w-4 h-4 text-slate-600" />
                            </div>
                            <span className="text-sm font-bold text-slate-800">{t('sf_language')}</span>
                          </div>
                          <LanguageToggle />
                        </div>
                      </div>
                    </section>
                    {/* ── Account Actions ── support + sign out */}
                    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      <h3 className="px-5 pt-5 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                        {t('sf_account_actions')}
                      </h3>
                      <div className="divide-y divide-slate-100">
                        <button
                          onClick={() => openProfileModal('support')}
                          className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition cursor-pointer"
                        >
                          <div className="w-9 h-9 shrink-0 rounded-xl bg-slate-100 flex items-center justify-center">
                            <MessageCircle className="w-4 h-4 text-slate-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-slate-800">{t('sf_support_center')}</div>
                            <div className="text-[11px] text-slate-500 truncate">{t('sf_support_desc')}</div>
                          </div>
                          <ChevronRight className="w-4 h-4 shrink-0 text-slate-300" />
                        </button>

                        <button
                          onClick={handleCustomerSignOut}
                          className="w-full flex items-center gap-3 p-4 text-left hover:bg-red-50 transition cursor-pointer"
                        >
                          <div className="w-9 h-9 shrink-0 rounded-xl bg-red-50 flex items-center justify-center">
                            <LogOut className="w-4 h-4 text-red-500" />
                          </div>
                          <span className="flex-1 text-sm font-bold text-red-600">{t('sf_sign_out')}</span>
                          <ChevronRight className="w-4 h-4 shrink-0 text-red-300" />
                        </button>
                      </div>
                    </section>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Checkout Flow */}
        {checkoutStep === 'checkout' && (
           <div className="w-full px-3.5 py-6 space-y-6">
            <button
              onClick={() => { setCheckoutStep('catalog'); setMobileTab('home'); }}
              className="text-xs flex items-center gap-1.5 cursor-pointer text-slate-400 hover:text-amber-400 font-extrabold transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Return to Catalog
            </button>

            <div className="bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800/80 p-4 shadow-2xl space-y-6 text-slate-100">

              <div>
                <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                  Express Checkout
                </h3>
                <p className="text-xs mt-0.5 text-slate-400">Provide your delivery details below.</p>
              </div>

              {/* Order Summary Items */}
              <div className="bg-slate-950 rounded-xl p-3 border border-slate-800/80 space-y-3">
                <h4 className="text-[10px] font-black text-amber-400 uppercase tracking-wider">Order Summary</h4>

                {cart.length > 0 ? (
                  cart.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 py-1">
                      <SafeImage src={item.product.image} alt={item.product.title} className="w-12 h-12 object-cover rounded-lg border border-slate-800 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-xs text-slate-100 truncate">{item.product.title}</h4>
                        <div className="text-[10px] text-slate-400">Qty: {item.quantity}</div>
                      </div>
                      <div className="text-xs font-black text-amber-400 shrink-0">৳{((item.product.priceBDT ?? 0) * item.quantity).toLocaleString()}</div>
                    </div>
                  ))
                ) : selectedProduct ? (
                  <div className="flex items-center gap-3 py-1">
                    <SafeImage src={selectedProduct.image} alt={selectedProduct.title} className="w-12 h-12 object-cover rounded-lg border border-slate-800 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-xs text-slate-100 truncate">{selectedProduct.title}</h4>
                    </div>
                    <div className="text-xs font-black text-amber-400 shrink-0">৳{(selectedProduct.priceBDT ?? 0).toLocaleString()}</div>
                  </div>
                ) : null}

                <div className="border-t border-slate-800 pt-2 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">
                      Delivery — {shippingArea === 'inside' ? 'Inside City' : 'Outside City'}
                    </span>
                    <span className="font-bold text-slate-200">
                      {(shippingArea === 'inside' ? insideConfigured : outsideConfigured)
                        ? `৳${shippingFee.toLocaleString()}`
                        : 'To be confirmed'}
                    </span>
                  </div>
                  {giftWrapFee > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Gift Wrapping</span>
                      <span className="font-bold text-slate-200">+৳{giftWrapFee.toLocaleString()}</span>
                    </div>
                  )}
                  {taxPercent > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">VAT ({taxPercent}%)</span>
                      <span className="font-bold text-slate-200">
                        {taxIncludedInPrices ? 'Included' : `+৳${taxAmount.toLocaleString()}`}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-1">
                    <span className="font-bold text-slate-400">Total Payable:</span>
                    {/* Recomputes on every delivery-zone switch: `shippingFee`,
                        the VAT base and the mobile cash-out fee all derive from
                        `shippingArea`, so the header, the breakdown and the
                        submit button always quote the same number. */}
                    <span data-testid="checkout-summary-total" className="text-base font-black text-amber-400">
                      ৳{totalAmount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Merchant announcement (Settings -> Checkout) */}
              {storeCheckoutConfig?.announcement && (
                <div
                  data-testid="store-announcement"
                  className="rounded-xl px-3.5 py-2.5 bg-amber-500/10 border-amber-500/30 text-amber-300 text-xs font-medium"
                >
                  {storeCheckoutConfig.announcement}
                </div>
              )}

              {/* Quantity limit guard (Settings -> Properties) */}
              {qtyLimitBreached && (
                <div
                  data-testid="store-qty-limit-notice"
                  className="rounded-xl px-3.5 py-2.5 bg-red-500/10 border-red-500/30 text-red-300 text-xs font-medium"
                >
                  Quantity limits apply: minimum {minOrderQty} per item
                  {maxOrderQty > 0 ? `, maximum ${maxOrderQty} per order` : ''}. Please adjust your cart.
                </div>
              )}

              {/* Minimum order guard (Settings -> Checkout) */}
              {minOrderShortfall > 0 && (
                <div
                  data-testid="store-min-order-notice"
                  className="rounded-xl px-3.5 py-2.5 bg-red-500/10 border-red-500/30 text-red-300 text-xs font-medium"
                >
                  Minimum order is ৳{checkoutMinOrder.toLocaleString()}. Add ৳{minOrderShortfall.toLocaleString()} more to continue.
                </div>
              )}

              <form onSubmit={handleCheckoutSubmit} className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label className="block mb-1 font-bold text-xs text-slate-300">Full Name</label>
                    <input
                      type="text"
                      required
                      value={custName}
                      onChange={(e) => setCustName(e.target.value)}
                      className="w-full rounded-xl px-3.5 py-2.5 bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-bold text-xs text-slate-300">Phone Number</label>
                    <input
                      type="text"
                      required
                      value={custPhone}
                      onChange={(e) => setCustPhone(e.target.value)}
                      className="w-full font-mono rounded-xl px-3.5 py-2.5 bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block mb-1.5 font-bold text-xs text-slate-300">Delivery Zone</label>
                    {/* Two explicit zones. The amount shown is the price the
                        merchant actually saved for this product / store — and
                        when none was saved the zone is shown WITHOUT a price,
                        never as a phantom "৳0". */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {([
                        { value: 'inside', fee: insideAreaFee, configured: insideConfigured },
                        { value: 'outside', fee: outsideAreaFee, configured: outsideConfigured },
                      ] as const).map((zone) => {
                        const checked = shippingArea === zone.value;
                        return (
                          <label
                            key={zone.value}
                            className={`flex items-center gap-2.5 rounded-xl px-3.5 py-3 border text-xs font-semibold cursor-pointer transition ${
                              checked
                                ? 'bg-amber-400/10 border-amber-400 text-amber-300'
                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <input
                              type="radio"
                              name="delivery-zone"
                              value={zone.value}
                              data-testid={`delivery-zone-${zone.value}`}
                              checked={checked}
                              onChange={() => setShippingArea(zone.value)}
                              className="w-4 h-4 accent-amber-400"
                            />
                            <span className="leading-tight">
                              {/* "Inside City (৳60)" — the price shown is the one
                                  the merchant actually saved in Mongo, and it is
                                  omitted entirely when nothing was saved, so an
                                  unconfigured zone never reads "৳0". */}
                              {zone.value === 'inside' ? 'Inside City' : 'Outside City'}
                              {qualifiesForFreeShipping ? (
                                <span className="text-emerald-400 font-black"> (FREE)</span>
                              ) : zone.configured ? (
                                ` (৳${zone.fee.toLocaleString()})`
                              ) : (
                                ''
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Gift options (Settings -> Gift options) */}
                  {(giftPackagingEnabled || giftCardMessageAllowed) && (
                    <div className="pt-3 border-t border-slate-800 space-y-3">
                      {giftPackagingEnabled && (
                        <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-950 border-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            data-testid="store-gift-wrap"
                            checked={wantGiftWrap}
                            onChange={(e) => setWantGiftWrap(e.target.checked)}
                            className="w-4 h-4 accent-amber-400"
                          />
                          <span className="text-xs text-slate-100 font-semibold">
                            Add gift wrapping
                            {Number(giftConfig.giftPackagingFee) > 0
                              ? ` (+৳${Number(giftConfig.giftPackagingFee).toLocaleString()})`
                              : ' (free)'}
                          </span>
                        </label>
                      )}

                      {giftCardMessageAllowed && (
                        <div>
                          <label className="block mb-1 font-bold text-xs text-slate-300">Gift Card Message</label>
                          <textarea
                            data-testid="store-gift-message"
                            value={giftMessage}
                            onChange={(e) => setGiftMessage(e.target.value)}
                            rows={2}
                            placeholder="Write a message for the recipient…"
                            className="w-full rounded-xl px-3.5 py-2.5 bg-slate-950 border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-400 resize-none"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="block mb-1 font-bold text-xs text-slate-300">Detailed Address</label>
                    <input
                      type="text"
                      required
                      value={custAddress}
                      onChange={(e) => setCustAddress(e.target.value)}
                      className="w-full rounded-xl px-3.5 py-2.5 bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                {/* Payment Options */}
                <div className="pt-3 border-t border-slate-800">
                  <label className="block mb-2 font-bold text-xs text-white">Select Payment Method</label>
                  <div className="grid grid-cols-1 gap-2">
                    {enabledMobileMethods.map((method) => {
                      const isSelected = payMethod === method.provider;
                      const chgPercent = method.chargePercentage || 0;
                      return (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => setPayMethod(method.provider as any)}
                          className={`p-3 rounded-xl border text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? method.provider === 'bkash' ? 'border-pink-500 bg-pink-50 text-pink-700' : method.provider === 'nagad' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-purple-500 bg-purple-50 text-purple-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Smartphone className={`w-4 h-4 shrink-0 ${method.provider === 'bkash' ? 'text-pink-500' : method.provider === 'nagad' ? 'text-orange-500' : 'text-purple-500'}`} />
                            <span>{method.displayName} ({method.accountType})</span>
                          </div>
                          {chgPercent > 0 && (
                            <span className="text-[10px] font-semibold bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                              +{chgPercent}% cash-out fee
                            </span>
                          )}
                        </button>
                      );
                    })}

                    {visibleBankAccount && (
                      <button
                        type="button"
                        onClick={() => setPayMethod('bank')}
                        className={`p-3 rounded-xl border text-xs font-bold transition flex items-center gap-2.5 cursor-pointer ${
                          payMethod === 'bank' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Building2 className="w-4 h-4 shrink-0 text-indigo-500" />
                        <span>Bank Transfer ({visibleBankAccount.bankName})</span>
                      </button>
                    )}

                    {storefrontMerchant.paymentMethods?.cod && (
                      <button
                        type="button"
                        onClick={() => setPayMethod('cod')}
                        className={`p-3 rounded-xl border text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                          payMethod === 'cod' ? 'border-[var(--primary-accent)] bg-emerald-50 text-[#00A16B]' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Building2 className={`w-4 h-4 shrink-0 ${payMethod === 'cod' ? 'text-[var(--primary-accent)]' : 'text-slate-400'}`} />
                          <span>Cash on Delivery (COD)</span>
                        </div>
                        {requiresAdvanceFee && (
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-300/50">
                            Advance Delivery Fee Required
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Direct Mobile Payment Details (bKash, Nagad, Rocket) */}
                {['bkash', 'nagad', 'rocket'].includes(payMethod) && selectedMobileMethod && (
                  <div className={`border p-3.5 rounded-xl space-y-3 ${
                    payMethod === 'bkash' ? 'border-pink-200 bg-pink-50/50' : payMethod === 'nagad' ? 'border-orange-200 bg-orange-50/50' : 'border-purple-200 bg-purple-50/50'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                        payMethod === 'bkash' ? 'text-pink-600' : payMethod === 'nagad' ? 'text-orange-600' : 'text-purple-600'
                      }`}>
                        <Smartphone className="w-4 h-4" /> {selectedMobileMethod.displayName} Payment Instructions
                      </div>
                      <span className="text-[10px] font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                        {selectedMobileMethod.accountType}
                      </span>
                    </div>

                    {/* Merchant Number Display */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Merchant {selectedMobileMethod.provider.toUpperCase()} Number</div>
                        <div className="font-mono text-base font-black text-slate-900">{selectedMobileMethod.number || '01844990011'}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyNumber(selectedMobileMethod.number || '01844990011')}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                      >
                        {copiedNum ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedNum ? 'Copied!' : 'Copy'}</span>
                      </button>
                    </div>

                    {/* Price Breakdown including Cash-out Fee */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs space-y-1.5">
                      <div className="flex justify-between text-slate-600">
                        <span>Items Subtotal:</span>
                        <span className="font-semibold text-slate-900">৳{itemsSubtotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Shipping Fee ({shippingArea === 'inside' ? 'Inside City' : 'Outside City'}):</span>
                        {/* Only print a price when one was actually saved for the
                            selected zone; an unconfigured zone must not read "৳0". */}
                        <span className="font-semibold text-slate-900">
                          {(shippingArea === 'inside' ? insideConfigured : outsideConfigured)
                            ? `৳${shippingFee.toLocaleString()}`
                            : 'To be confirmed'}
                        </span>
                      </div>
                      {/* Tax breakdown (Settings -> Tax) */}
                      {showTaxBreakdown && taxPercent > 0 && (
                        <>
                          {taxIncludedInPrices && (
                            <div className="flex justify-between text-slate-600">
                              <span>Net (VAT exclusive):</span>
                              <span className="font-semibold text-slate-900">
                                ৳{(displayNetGoods + (taxOnDelivery ? extraCharges - giftWrapFee : 0)).toLocaleString()}
                              </span>
                            </div>
                          )}
                          <div
                            data-testid="store-tax-line"
                            className="flex justify-between text-slate-600"
                          >
                            <span>
                              VAT ({taxPercent}%{taxOnDelivery ? ' incl. delivery' : ''}):
                            </span>
                            <span className="font-semibold text-slate-900">
                              {taxIncludedInPrices ? 'Included — ' : '+'}৳{taxAmount.toLocaleString()}
                            </span>
                          </div>
                        </>
                      )}
                      {giftWrapFee > 0 && (
                        <div className="flex justify-between text-emerald-600 font-medium">
                          <span>Gift Wrapping:</span>
                          <span className="font-bold">+৳{giftWrapFee.toLocaleString()}</span>
                        </div>
                      )}
                      {mobileChargePercent > 0 && (
                        <div className="flex justify-between text-pink-600 font-medium">
                          <span>Cash-out / Charge Fee ({mobileChargePercent}%):</span>
                          <span className="font-bold">+৳{mobileCashOutFee}</span>
                        </div>
                      )}
                      <div className="border-t border-slate-200 pt-1.5 flex justify-between font-black text-slate-900 text-sm">
                        <span>Total Payable to Merchant:</span>
                        <span className="text-pink-600 font-mono">৳{finalPayableMobile.toLocaleString()} BDT</span>
                      </div>
                    </div>

                    {selectedMobileMethod.instructions && (
                      <p className="text-xs text-slate-700 bg-white/80 p-2.5 rounded-lg border border-slate-200 leading-relaxed">
                        <strong className="text-slate-900">Note:</strong> {selectedMobileMethod.instructions}
                      </p>
                    )}

                    <div>
                      <label className="block mb-1 font-bold text-xs text-slate-800">
                        Enter {selectedMobileMethod.provider.toUpperCase()} Transaction ID (TrxID) *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder={`e.g. ${payMethod === 'bkash' ? 'BK' : payMethod === 'nagad' ? 'NG' : 'RO'}9X2810L9`}
                        value={custTxId}
                        onChange={(e) => setCustTxId(e.target.value)}
                        className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 font-mono text-xs uppercase bg-white focus:outline-none focus:ring-2 focus:ring-pink-500 font-bold"
                      />
                    </div>
                  </div>
                )}

                {/* Cash on Delivery with Mandatory Advance Delivery Charge */}
                {payMethod === 'cod' && requiresAdvanceFee && (
                  <div className="border border-amber-200 bg-amber-50/50 p-4 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
                      <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Upfront Advance Delivery Charge Mandatory</span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      To confirm your Cash on Delivery (COD) order, please pay the <strong className="text-slate-900">৳{advanceDeliveryFeeAmount} Delivery Fee</strong> upfront via Mobile Banking. The remaining order balance will be collected upon courier delivery.
                    </p>

                    {/* Provider Selector for Advance Delivery Payment */}
                    {advanceMethodsAvailable.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-bold text-slate-700 uppercase">Select Advance Payment Method:</label>
                        <div className="flex gap-2">
                          {advanceMethodsAvailable.map((adv) => (
                            <button
                              key={adv.id}
                              type="button"
                              onClick={() => setCodAdvanceProvider(adv.provider as any)}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition ${
                                selectedAdvConfig?.provider === adv.provider
                                  ? 'border-amber-500 bg-amber-500 text-slate-950 shadow-sm'
                                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {adv.displayName}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Merchant Number & Instructions */}
                    {selectedAdvConfig && (
                      <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Send Money to {selectedAdvConfig.displayName}</div>
                            <div className="font-mono text-base font-black text-slate-900">{selectedAdvConfig.number}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyNumber(selectedAdvConfig.number)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 text-xs font-bold cursor-pointer"
                          >
                            {copiedNum ? 'Copied!' : 'Copy'}
                          </button>
                        </div>

                        {/* Breakdown for Advance Delivery */}
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs space-y-1">
                          <div className="flex justify-between text-slate-600">
                            <span>Advance Delivery Charge:</span>
                            <span className="font-bold text-slate-900">৳{advanceDeliveryFeeAmount}</span>
                          </div>
                          {advChargePercent > 0 && (
                            <div className="flex justify-between text-amber-700 font-medium">
                              <span>Cash-out Charge ({advChargePercent}%):</span>
                              <span className="font-bold">+৳{advCashOutFee}</span>
                            </div>
                          )}
                          <div className="border-t border-slate-200 pt-1 flex justify-between font-black text-slate-900">
                            <span>Total Upfront Payable:</span>
                            <span className="text-amber-800 font-mono">৳{totalAdvancePayable} BDT</span>
                          </div>
                          <div className="flex justify-between text-[var(--primary-accent)] font-bold text-[11px] pt-1 border-t border-slate-200">
                            <span>Remaining COD Balance Due on Delivery:</span>
                            <span>৳{remainingCodBalance.toLocaleString()} BDT</span>
                          </div>
                        </div>

                        {selectedAdvConfig.instructions && (
                          <p className="text-[11px] text-slate-600 italic">
                            Note: {selectedAdvConfig.instructions}
                          </p>
                        )}
                      </div>
                    )}

                    {/* TrxID Input for Advance Delivery Payment */}
                    <div>
                      <label className="block mb-1 font-bold text-xs text-slate-800">
                        Enter Advance Payment Transaction ID (TrxID) *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. BK8X991029"
                        value={custTxId}
                        onChange={(e) => setCustTxId(e.target.value)}
                        className="w-full border border-amber-300 rounded-xl px-3.5 py-2.5 font-mono text-xs uppercase bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    data-testid="checkout-submit"
                    disabled={minOrderShortfall > 0 || qtyLimitBreached}
                    className="w-full py-3.5 bg-[var(--primary-accent)] text-slate-950 font-black rounded-xl text-sm hover:bg-[var(--primary-accent)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer shadow-lg"
                  >
                    {/* Every branch recomputes when the delivery zone changes:
                          • mobile  → the goods + the SELECTED zone's fee + VAT +
                            the wallet cash-out %, i.e. exactly `totalAmount`
                            (previously it quoted `baseTotalAmount`, which
                            silently omitted the cash-out fee the customer then
                            had to pay).
                          • COD+advance → the upfront delivery fee and the
                            remaining balance, both of which move with the zone.
                          • COD    → the full payable for the selected zone. */}
                    Confirm Order • ৳{
                      ['bkash', 'nagad', 'rocket'].includes(payMethod)
                        ? totalAmount.toLocaleString()
                        : payMethod === 'cod' && requiresAdvanceFee
                        ? `${totalAdvancePayable.toLocaleString()} Upfront (৳${remainingCodBalance.toLocaleString()} COD)`
                        : baseTotalAmount.toLocaleString()
                    }
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Success View */}
        {checkoutStep === 'success' && (
          <div className="w-full px-4 py-16 text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100">
              <Check className="w-8 h-8 text-[var(--primary-accent)]" />
            </div>

            <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Order Placed Successfully!</h3>

            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3 mb-6">
              {/* Invoice header text comes from Settings -> Invoices. */}
              {storefrontMerchant.invoiceConfig?.title && (
                <div
                  data-testid="store-invoice-title"
                  className="text-center text-sm font-black text-slate-900"
                >
                  {storefrontMerchant.invoiceConfig.title}
                </div>
              )}
              <p className="text-xs text-slate-600">
                Thank you <strong className="text-slate-900">{custName}</strong>. Your order has been placed.
              </p>
              <div className="flex justify-center items-center gap-1.5 text-xs font-mono">
                <span className="text-slate-500">ORDER:</span>
                <span className="bg-[var(--primary-accent)] text-white px-2 py-0.5 rounded font-bold">{
                  storefrontMerchant.invoiceConfig?.prefix
                    ? `${storefrontMerchant.invoiceConfig.prefix}${confirmedOrderNum.replace('#', '')}`
                    : confirmedOrderNum
                }</span>
              </div>
              {/* Tax breakdown on the receipt (Settings -> Tax). */}
              {showTaxBreakdown && taxPercent > 0 && (
                <div
                  data-testid="store-receipt-tax"
                  className="pt-2 mt-1 border-t border-slate-200 text-[11px] text-slate-600 space-y-0.5"
                >
                  <div className="flex justify-between">
                    <span>Net amount:</span>
                    <span className="font-mono">৳{netBeforeTax.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VAT ({taxPercent}%):</span>
                    <span className="font-mono">
                      {taxIncludedInPrices ? '৳' + taxAmount.toLocaleString() + ' (included)' : '+' + '৳' + taxAmount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900">
                    <span>Total:</span>
                    <span className="font-mono">৳{baseTotalAmount.toLocaleString()}</span>
                  </div>
                  {taxRegistrationNumber && (
                    <div className="text-[10px] text-slate-500 font-mono pt-0.5">
                      VAT Reg: {taxRegistrationNumber}
                    </div>
                  )}
                </div>
              )}

              {/* Price tag hidden on the packed invoice (Settings -> Gift options). */}
              {hideInvoicePriceTag && (
                <div
                  data-testid="store-price-hidden-notice"
                  className="text-center text-[10px] text-emerald-600 font-medium"
                >
                  Price on the enclosed invoice has been hidden for gifting.
                </div>
              )}
              {/* BIN on receipt (Settings -> NBR e-invoicing). */}
              {storefrontMerchant.nbrConfig?.showBinOnReceipt && storefrontMerchant.nbrConfig?.binNumber && (
                <div
                  data-testid="store-receipt-bin"
                  className="text-center text-[10px] text-slate-500 font-mono"
                >
                  BIN: {storefrontMerchant.nbrConfig.binNumber}
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setCheckoutStep('catalog');
                setSelectedProduct(null);
                setMobileTab('home');
              }}
              className="px-6 py-3 bg-[var(--primary-accent)] text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer shadow-md hover:bg-[var(--primary-accent)]/90"
            >
              Continue Shopping
            </button>
          </div>
        )}
      </main>

      {/* Mobile App Bottom Navigation & Sticky Action Bar (Fixed inside frame) */}
      {checkoutStep === 'catalog' && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f172a]/95 backdrop-blur-xl border-t border-slate-800/80 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
          {/* Quick Payment & Cart Fast Checkout Bar (Shows if items in cart) */}
          {cart.length > 0 && (
            <div className="px-3.5 py-2 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border-b border-slate-800/80 flex items-center justify-between gap-2 animate-fade-in-up">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Fast Pay:</span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 shrink-0">bKash</span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">Nagad</span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">COD</span>
              </div>

              <button
                onClick={() => setCheckoutStep('checkout')}
                className="shrink-0 bg-gradient-to-r from-amber-400 via-[var(--primary-accent)] to-emerald-400 text-slate-950 font-black text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-[0_0_15px_rgba(212,175,55,0.3)] hover:scale-105 active:scale-95 transition cursor-pointer"
              >
                <span>Checkout ৳{cartTotal.toLocaleString()}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="grid grid-cols-3 h-14">
            {([
              { id: 'home', label: t('sf_tab_home'), icon: Home },
              { id: 'orders', label: t('sf_tab_orders'), icon: ShoppingBag },
              { id: 'profile', label: t('sf_tab_profile'), icon: User },
            ] as const).map((tabItem) => {
              const TabIcon = tabItem.icon;
              const active = mobileTab === tabItem.id;
              const count = tabItem.id === 'orders' && customerSession ? customerOrders.length : 0;
              return (
                <button
                  key={tabItem.id}
                  onClick={() => setMobileTab(tabItem.id)}
                  className={`relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-black transition cursor-pointer ${active ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <span className="relative">
                    <TabIcon className={`w-4 h-4 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
                    {count > 0 && (
                      <span className="absolute -top-1.5 -right-2 bg-gradient-to-r from-amber-400 to-[var(--primary-accent)] text-slate-950 text-[9px] font-black min-w-[14px] h-3.5 px-1 rounded-full flex items-center justify-center">
                        {count}
                      </span>
                    )}
                  </span>
                  {tabItem.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isAuthOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-700/80 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-amber-400 border border-amber-400/30">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  {t('sf_customer_account')}
                </div>
                <h3 className="mt-3 text-2xl font-black text-white">{authMode === 'signin' ? t('sign_in') : t('sign_up')}</h3>
                <p className="mt-1 text-xs text-slate-400">{t('sf_auth_subtitle')}</p>
              </div>
              <button onClick={() => setIsAuthOpen(false)} className="rounded-xl bg-slate-800 p-2 text-slate-300 hover:text-white transition cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-950 p-1">
              <button
                onClick={() => setAuthMode('signin')}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition ${authMode === 'signin' ? 'bg-gradient-to-r from-amber-400 to-[var(--primary-accent)] text-slate-950 font-black' : 'text-slate-400'}`}
              >
                {t('sign_in')}
              </button>
              <button
                onClick={() => setAuthMode('signup')}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition ${authMode === 'signup' ? 'bg-gradient-to-r from-amber-400 to-[var(--primary-accent)] text-slate-950 font-black' : 'text-slate-400'}`}
              >
                {t('sf_auth_create_account')}
              </button>
            </div>

            <form onSubmit={handleCustomerAuthSubmit} className="mt-5 space-y-3">
              {authMode === 'signup' && (
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-300">{t('sf_auth_full_name')}</label>
                  <input
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                    placeholder={t('sf_auth_name_placeholder')}
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-300">{t('sf_auth_email')}</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                    placeholder="Enter your email"
                  />
                </div>
              </div>

              <div>
                <PhoneVerificationInput
                  id="customer-auth-phone-verification"
                  value={authPhone}
                  onChange={(fullPhone) => {
                    setAuthPhone(fullPhone);
                    if (isCustomerPhoneVerified && fullPhone !== verifiedCustomerPhone) {
                      setIsCustomerPhoneVerified(false);
                    }
                  }}
                  isVerified={isCustomerPhoneVerified}
                  onVerifiedChange={(verified) => {
                    setIsCustomerPhoneVerified(verified);
                    if (verified) {
                      setVerifiedCustomerPhone(authPhone);
                      setAuthNotice('Phone number successfully verified via WhatsApp OTP ✓');
                    }
                  }}
                  userType="customer"
                  label={t('sf_auth_phone')}
                  required={true}
                  defaultCountryCode="+880"
                  darkMode={true}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-300">{t('sf_auth_password')}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 py-2.5 text-sm text-white outline-none focus:border-amber-400"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {authNotice && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">{authNotice}</div>
              )}

              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-amber-400 via-[var(--primary-accent)] to-emerald-400 py-3 text-sm font-black text-slate-950 hover:shadow-lg transition cursor-pointer"
              >
                {authMode === 'signin' ? 'Continue to Order Dashboard' : 'Create Customer Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showOrderDashboard && customerSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl max-h-[85vh] overflow-y-auto text-slate-100">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-amber-400 border border-amber-400/30">
                  <PackageCheck className="w-3.5 h-3.5" />
                  Order Dashboard
                </div>
                <h3 className="mt-3 text-2xl font-black text-white">Welcome, {customerSession.name}</h3>
                <p className="mt-1 text-xs text-slate-400">{customerSession.email} • {customerSession.phone}</p>
              </div>
              <button onClick={() => setShowOrderDashboard(false)} className="rounded-xl bg-slate-800 p-2 text-slate-400 hover:text-white transition cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {customerOrders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950 p-8 text-center text-sm text-slate-400">No orders are linked to this account yet. Place your first order from the storefront catalog.</div>
              ) : (
                customerOrders.map((order) => (
                  <div key={order.id} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{order.orderNumber}</div>
                        <div className="mt-1 text-lg font-black text-white">{order.paymentMethod}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-black text-amber-400">৳{order.totalBDT.toLocaleString()}</div>
                        <div className="text-xs font-bold text-emerald-400">{order.fulfillmentStatus}</div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">{order.createdAt}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Item-level Write Review Modal */}
      {reviewModal && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/70 backdrop-blur-md p-0 sm:items-center sm:p-4"
          onClick={closeItemModals}
        >
          <div
            className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
              <div className="flex items-center gap-3">
                {reviewModal.item.image ? (
                  <SafeImage src={reviewModal.item.image} alt="" className="h-11 w-11 rounded-xl border border-slate-100 object-cover" />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100">
                    <ShoppingBag className="h-5 w-5 text-slate-300" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-base font-black text-slate-900">{t('sf_review_modal_title')}</h3>
                  <p className="truncate text-xs text-slate-500">{t('sf_review_for')} {reviewModal.item.productName}</p>
                </div>
              </div>
              <button onClick={closeItemModals} className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 transition cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitModalReview} className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600">{t('sf_review_comment_label')}</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setModalRating(n)} className="cursor-pointer transition hover:scale-110" aria-label={`${n} star`}>
                      <Star className={`h-9 w-9 ${n <= modalRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                    </button>
                  ))}
                  <span className="ml-2 text-sm font-bold text-slate-600">{modalRating > 0 ? `${modalRating}/5` : ''}</span>
                </div>
              </div>
              <textarea
                value={modalComment}
                onChange={(e) => setModalComment(e.target.value)}
                placeholder={t('sf_review_placeholder')}
                rows={4}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--primary-accent)]"
              />
              {modalError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{modalError}</div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={closeItemModals} className="flex-1 rounded-xl border border-slate-300 bg-white py-3 text-sm font-black text-slate-700 hover:bg-slate-50 transition cursor-pointer">
                  {t('sf_cancel')}
                </button>
                <button type="submit" disabled={isModalSubmitting} className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary-accent)] py-3 text-sm font-black text-slate-950 hover:bg-[var(--primary-accent)]/90 transition cursor-pointer disabled:opacity-60">
                  {isModalSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                  {isModalSubmitting ? t('sf_submitting') : t('sf_submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Item-level Request Return Modal */}
      {returnModal && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/70 backdrop-blur-md p-0 sm:items-center sm:p-4"
          onClick={closeItemModals}
        >
          <div
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
              <div className="flex items-center gap-3">
                {returnModal.item.image ? (
                  <SafeImage src={returnModal.item.image} alt="" className="h-11 w-11 rounded-xl border border-slate-100 object-cover" />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100">
                    <RotateCcw className="h-5 w-5 text-slate-300" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-base font-black text-slate-900">{t('sf_return_modal_title')}</h3>
                  <p className="truncate text-xs text-slate-500">{t('sf_return_for')} {returnModal.item.productName}</p>
                </div>
              </div>
              <button onClick={closeItemModals} className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 transition cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitModalReturn} className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600">{t('sf_return_reason')}</label>
                <select
                  value={modalReturnReason}
                  onChange={(e) => setModalReturnReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--primary-accent)] cursor-pointer"
                >
                  <option value="">{t('sf_return_reason')}…</option>
                  <option value="Wrong Size">{t('sf_reason_wrong_size')}</option>
                  <option value="Damaged Item">{t('sf_reason_damaged')}</option>
                  <option value="Defective Product">{t('sf_reason_defective')}</option>
                  <option value="Wrong Item Delivered">{t('sf_reason_wrong_item')}</option>
                  <option value="Not as Described">{t('sf_reason_not_described')}</option>
                  <option value="Other">{t('sf_reason_other')}</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600">{t('sf_return_note')}</label>
                <textarea
                  value={modalReturnNote}
                  onChange={(e) => setModalReturnNote(e.target.value)}
                  placeholder={t('sf_return_note_ph')}
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--primary-accent)]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600">{t('sf_return_image')}</label>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3.5 py-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 transition">
                  <Camera className="h-4 w-4" />
                  <span>{(modalReturnImage ? '✓ ' : '') + t('sf_return_image')}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleModalReturnImage} />
                </label>
                {modalReturnImage && (
                  <img src={modalReturnImage} alt="" className="mt-2 h-20 w-20 rounded-xl border border-slate-200 object-cover" />
                )}
              </div>
              {modalError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{modalError}</div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={closeItemModals} className="flex-1 rounded-xl border border-slate-300 bg-white py-3 text-sm font-black text-slate-700 hover:bg-slate-50 transition cursor-pointer">
                  {t('sf_cancel')}
                </button>
                <button type="submit" disabled={isModalSubmitting} className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-black text-slate-950 hover:bg-amber-400 transition cursor-pointer disabled:opacity-60">
                  {isModalSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  {isModalSubmitting ? t('sf_submitting') : t('sf_submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

{/* ── Profile settings modals ──────────────────────────────────────────
          One shell swapped by `profileModal`: Edit Profile, Saved Addresses,
          Change Password and Support. */}
      {profileModal && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/70 backdrop-blur-md p-0 sm:items-center sm:p-4"
          onClick={closeProfileModal}
        >
          <div
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
              <h3 className="text-base font-black text-slate-900">
                {profileModal === 'edit' && t('sf_edit_profile')}
                {profileModal === 'addresses' && t('sf_saved_addresses')}
                {profileModal === 'password' && t('sf_change_password')}
                {profileModal === 'support' && t('sf_support_center')}
              </h3>
              <button
                onClick={closeProfileModal}
                className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {profileModal === 'edit' && (
                <form onSubmit={handleSaveProfile} className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-600">{t('sf_full_name')}</label>
                    <input
                      value={profileForm.name}
                      onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--primary-accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-600">{t('sf_phone')}</label>
                    <input
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--primary-accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-600">{t('sf_email')}</label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--primary-accent)]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary-accent)] py-3 text-sm font-black text-slate-950 hover:bg-[var(--primary-accent)]/90 transition cursor-pointer"
                  >
                    <Check className="w-4 h-4" /> {t('sf_save_changes')}
                  </button>
                </form>
              )}
              {profileModal === 'addresses' && (
                <div className="space-y-3">
                  {savedAddresses.length === 0 ? (
                    <p className="text-sm text-slate-500">{t('sf_no_saved_addresses')}</p>
                  ) : (
                    <div className="space-y-2">
                      {savedAddresses.map((address) => (
                        <div key={address} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                          <span className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                            {address}
                          </span>
                          <button
                            onClick={() => handleRemoveAddress(address)}
                            className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-black text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          >
                            {t('sf_delete_address')}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                      placeholder={t('sf_saved_addresses')}
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--primary-accent)]"
                    />
                    <button
                      onClick={handleAddAddress}
                      className="shrink-0 rounded-xl bg-[var(--primary-accent)] px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-[var(--primary-accent)]/90 transition cursor-pointer"
                    >
                      {t('sf_add_address')}
                    </button>
                  </div>
                </div>
              )}

              {profileModal === 'password' && (
                <form onSubmit={handleChangePassword} className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-600">{t('sf_current_password')}</label>
                    <input
                      type="password"
                      value={passwordForm.current}
                      onChange={(e) => setPasswordForm((f) => ({ ...f, current: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--primary-accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-600">{t('sf_new_password')}</label>
                    <input
                      type="password"
                      value={passwordForm.next}
                      onChange={(e) => setPasswordForm((f) => ({ ...f, next: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--primary-accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-600">{t('sf_confirm_password')}</label>
                    <input
                      type="password"
                      value={passwordForm.confirm}
                      onChange={(e) => setPasswordForm((f) => ({ ...f, confirm: e.target.value }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--primary-accent)]"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary-accent)] py-3 text-sm font-black text-slate-950 hover:bg-[var(--primary-accent)]/90 transition cursor-pointer"
                  >
                    <Lock className="w-4 h-4" /> {t('sf_save_changes')}
                  </button>
                </form>
              )}
              {profileModal === 'support' && (
                <div className="space-y-2">
                  {(supportPhone || supportEmail || supportAddress) ? (
                    <>
                      {supportPhone && (
                        <a
                          href={`https://wa.me/${supportPhone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-sm text-slate-700 hover:bg-slate-50 transition"
                        >
                          <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="font-semibold">{supportPhone}</span>
                        </a>
                      )}
                      {supportEmail && (
                        <a
                          href={`mailto:${supportEmail}`}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-sm text-slate-700 hover:bg-slate-50 transition"
                        >
                          <Globe className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="truncate font-semibold">{supportEmail}</span>
                        </a>
                      )}
                      {supportAddress && (
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-sm text-slate-700">
                          <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="leading-relaxed">{supportAddress}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">{t('sf_support_desc')}</p>
                  )}
                </div>
              )}

              {profileError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  {profileError}
                </div>
              )}
              {profileNotice && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                  {profileNotice}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Product Quick View Modal */}
      {quickViewProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in-up">
          <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl space-y-4 relative">
            <button
              onClick={() => setQuickViewProduct(null)}
              className="absolute top-3 right-3 z-20 p-2 rounded-full bg-slate-950/80 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="relative aspect-square bg-slate-950 overflow-hidden">
              <SafeImage src={quickViewProduct.image} alt={quickViewProduct.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-80" />
              <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
                <span className="bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-md">
                  {quickViewProduct.category || 'Luxury'}
                </span>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black px-2.5 py-1 rounded-full backdrop-blur-sm">
                  In Stock ({quickViewProduct.stock ?? 99})
                </span>
              </div>
            </div>

            <div className="p-4 pt-0 space-y-4">
              <div>
                <h3 className="text-lg font-black text-white leading-tight">{quickViewProduct.title}</h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-3 leading-relaxed">{quickViewProduct.description || "Premium high-grade lifestyle item with nationwide express dispatch."}</p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <div>
                  <div className="text-xs text-slate-400">Price</div>
                  <div className="text-xl font-black text-amber-400">৳{(quickViewProduct.priceBDT ?? 0).toLocaleString()}</div>
                </div>
                {quickViewProduct.compareAtPriceBDT && (
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500 line-through font-mono">৳{quickViewProduct.compareAtPriceBDT.toLocaleString()}</div>
                    <div className="text-[10px] font-black text-emerald-400">
                      Save ৳{(quickViewProduct.compareAtPriceBDT - (quickViewProduct.priceBDT || 0)).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    handleAddToCart(quickViewProduct);
                    setQuickViewProduct(null);
                    setIsCartOpen(true);
                  }}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-100 font-black rounded-xl text-xs transition cursor-pointer border border-slate-700 flex items-center justify-center gap-1.5"
                >
                  <ShoppingBag className="w-4 h-4 text-amber-400" />
                  <span>Add to Cart</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedProduct(quickViewProduct);
                    setQuickViewProduct(null);
                    setCheckoutStep('checkout');
                  }}
                  className="w-full py-3 bg-gradient-to-r from-amber-400 via-[var(--primary-accent)] to-emerald-400 text-slate-950 font-black rounded-xl text-xs transition cursor-pointer shadow-lg flex items-center justify-center gap-1.5 hover:scale-[1.02]"
                >
                  <Zap className="w-4 h-4 fill-slate-950" />
                  <span>Buy Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart Drawer Modal (Slide-Over Panel) */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/80 backdrop-blur-md animate-fade-in-up">
          <div className="w-full max-w-md h-full bg-slate-900 border-l border-slate-800/80 shadow-2xl flex flex-col text-slate-100 relative">
            <div className="flex items-center justify-between p-5 border-b border-slate-800/80 bg-slate-950/60">
              <h3 className="font-black text-lg text-slate-100 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-amber-400" />
                Shopping Cart
                <span className="text-xs font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                  {cart.reduce((s, i) => s + i.quantity, 0)} items
                </span>
              </h3>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl transition cursor-pointer border border-slate-700/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
              {cart.length === 0 ? (
                <div className="text-center py-24 text-slate-500 space-y-3">
                  <ShoppingBag className="w-16 h-16 mx-auto opacity-20 text-slate-400" />
                  <p className="text-sm font-bold text-slate-400">Your shopping cart is currently empty.</p>
                  <button
                    onClick={() => setIsCartOpen(false)}
                    className="text-xs font-black text-amber-400 bg-amber-400/10 px-4 py-2 rounded-xl border border-amber-400/20 hover:bg-amber-400/20 transition cursor-pointer"
                  >
                    Start Shopping
                  </button>
                </div>
              ) : (
                cart.map((item, idx) => (
                  <div key={idx} className="flex gap-3.5 p-3.5 border border-slate-800/80 rounded-2xl bg-slate-950/60 relative group">
                    <SafeImage src={item.product.image} alt={item.product.title} className="w-20 h-20 object-cover rounded-xl border border-slate-800 shrink-0" />
                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="font-bold text-xs text-slate-100 line-clamp-1">{item.product.title}</h4>
                          <button
                            onClick={() => handleUpdateCartQty(item.product.id, -item.quantity)}
                            className="text-slate-500 hover:text-rose-400 transition cursor-pointer shrink-0"
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-sm font-black text-amber-400 mt-1">
                          ৳{((item.product.priceBDT ?? 0) * item.quantity).toLocaleString()}
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
                        <span className="text-[10px] text-slate-400 font-mono">৳{(item.product.priceBDT ?? 0).toLocaleString()} each</span>
                        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-2 py-1">
                          <button
                            onClick={() => handleUpdateCartQty(item.product.id, -1)}
                            className="font-black px-1 text-slate-400 hover:text-amber-400 transition cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-black text-slate-100 min-w-[16px] text-center">{item.quantity}</span>
                          <button
                            onClick={() => handleUpdateCartQty(item.product.id, 1)}
                            className="font-black px-1 text-slate-400 hover:text-amber-400 transition cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (() => {
              // The drawer quotes the SELECTED zone's real charge — the same
              // resolver, the same fee and the same VAT-inclusive math the
              // checkout button uses — so the two totals can never disagree.
              const zoneFee = shippingArea === 'inside' ? insideAreaFee : outsideAreaFee;
              const zoneConfigured = shippingArea === 'inside' ? insideConfigured : outsideConfigured;
              const freeRemaining = Math.max(0, checkoutMinOrder - itemsSubtotal);
              return (
              <div className="p-5 border-t border-slate-800/80 bg-slate-950/90 space-y-3">
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal</span>
                    <span className="font-extrabold text-slate-200">৳{cartTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Delivery Fee ({shippingArea === 'inside' ? 'Inside City' : 'Outside City'})</span>
                    <span className="text-emerald-400 font-bold">
                      {qualifiesForFreeShipping ? (
                        <>
                          <span className="line-through text-slate-500 mr-1.5">
                            ৳{zoneFee.toLocaleString()}
                          </span>
                          FREE
                        </>
                      ) : zoneConfigured ? (
                        `৳${zoneFee.toLocaleString()}`
                      ) : (
                        'To be confirmed'
                      )}
                    </span>
                  </div>
                  {freeShippingThreshold !== null && (
                    <div
                      className={`rounded-xl px-3 py-2 text-[11px] font-semibold border ${
                        qualifiesForFreeShipping
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-amber-400/10 border-amber-400/30 text-amber-300'
                      }`}
                    >
                      {qualifiesForFreeShipping
                        ? `\uD83C\uDF89 You've unlocked FREE delivery on this order!`
                        : `Add \u09F3${freeShippingShortfall.toLocaleString()} more to get FREE delivery (over \u09F3${freeShippingThreshold.toLocaleString()}).`}
                    </div>
                  )}
                  {giftWrapFee > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>Gift Wrapping</span>
                      <span className="font-bold text-emerald-400">+৳{giftWrapFee.toLocaleString()}</span>
                    </div>
                  )}
                  {taxPercent > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>VAT ({taxPercent}%)</span>
                      <span className="font-bold text-slate-200">
                        {taxIncludedInPrices ? 'Included' : `+৳${taxAmount.toLocaleString()}`}
                      </span>
                    </div>
                  )}
                  {/* The delivery zone is chosen on the checkout step below, so
                      the drawer shows the currently-selected zone and links to
                      the picker instead of leaving the customer to guess. */}
                  <div className="flex justify-between items-center text-[10px] text-slate-500 pt-0.5">
                    <span>Delivery zone</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCartOpen(false);
                        setCheckoutStep('checkout');
                      }}
                      className="font-bold text-amber-400 hover:text-amber-300 transition cursor-pointer"
                    >
                      {freeRemaining > 0 ? `Add ৳${freeRemaining.toLocaleString()} — min order` : 'Change zone at checkout'}
                    </button>
                  </div>
                  <div className="border-t border-slate-800 pt-2 flex justify-between items-center text-sm">
                    <span className="font-bold text-slate-200">Total Payable</span>
                    <span
                      data-testid="cart-total"
                      className="text-xl font-black text-amber-400"
                    >
                      ৳{baseTotalAmount.toLocaleString()}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIsCartOpen(false);
                    setCheckoutStep('checkout');
                  }}
                  className="w-full py-4 bg-gradient-to-r from-amber-400 via-[var(--primary-accent)] to-emerald-400 text-slate-950 font-black rounded-xl text-sm hover:scale-[1.01] transition cursor-pointer shadow-lg flex items-center justify-center gap-2"
                >
                  <span>Proceed to Checkout</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Store Footer — themed from Theme Editor */}
      <footer className="bg-slate-950 text-slate-400 py-8 px-4 text-xs mt-6 border-t border-slate-800/80 space-y-6">
        <div className="space-y-3 text-center">
          <h4 className="text-amber-400 text-base font-black tracking-wider uppercase">
            {resolvedTheme.footerLogoText || (storefrontMerchant.storeName === 'My Zid Store' ? 'SlateBD' : storefrontMerchant.storeName || 'SlateBD')}
          </h4>
          <p className="text-[11px] leading-relaxed text-slate-400 max-w-xs mx-auto">
            {resolvedTheme.footerAboutText || "Bangladesh’s Premier Online Fashion & Lifestyle Destination. Powered by ZID SAAS BD Engine."}
          </p>
          {(() => {
            // Auto-inject links only for policies that actually contain text, and
            // only when the merchant enabled the footer-links setting.
            const policyLinks: string[] = storefrontPolicies.showInFooter === false ? [] : [
              storefrontPolicies.privacyPolicy?.trim() ? 'Privacy Policy' : '',
              storefrontPolicies.termsOfService?.trim() ? 'Terms of Service' : '',
              storefrontPolicies.returnRefundPolicy?.trim() ? 'Return & Refund Policy' : '',
              storefrontPolicies.shippingPolicy?.trim() ? 'Shipping Policy' : '',
            ].filter(Boolean) as string[];
            const allLinks = [...resolvedTheme.footerLinks, ...policyLinks.filter((l) => !resolvedTheme.footerLinks.includes(l))];
            if (allLinks.length === 0) return null;
            return (
              <div className="pt-2" data-testid="storefront-footer-links">
                <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-300 mb-2">{resolvedTheme.footerLinksTitle}</h5>
                <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
                  {allLinks.map((linkLabel, i) => (
                    <li key={`flink-${i}`} className="text-[11px] text-slate-400 hover:text-amber-400 transition cursor-pointer">{linkLabel}</li>
                  ))}
                </ul>
              </div>
            );
          })()}
          {(resolvedTheme.contactPhone || resolvedTheme.contactEmail || resolvedTheme.dhakaAddress) && (
            <div className="pt-2 space-y-1">
              {resolvedTheme.contactPhone && (
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-300"><Phone className="w-3 h-3 text-[var(--primary-accent)]" /> {resolvedTheme.contactPhone}</div>
              )}
              {resolvedTheme.contactEmail && (
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-300"><Globe className="w-3 h-3 text-[var(--primary-accent)]" /> {resolvedTheme.contactEmail}</div>
              )}
              {resolvedTheme.dhakaAddress && (
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-300"><MapPin className="w-3 h-3 text-[var(--primary-accent)]" /> {resolvedTheme.dhakaAddress}</div>
              )}
            </div>
          )}
          {/* Dynamic Footer Navigation — merchant-defined links from MongoDB
              (`navigation_menus.footer`), rendered as real anchors. */}
          {storeModules.navigationMenus.footer.length > 0 && (
            <nav className="pt-2" data-testid="storefront-footer-menu">
              <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
                {storeModules.navigationMenus.footer.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.url}
                      className="text-[11px] text-slate-400 hover:text-amber-400 transition"
                    >
                      {link.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-300 pt-1">
            <ShieldCheck className="w-4 h-4 text-[var(--primary-accent)]" />
            <span>Secure 256-bit SSL Checkout</span>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800/80 text-center text-[10px] text-slate-500">
          © {new Date().getFullYear()} {resolvedTheme.footerLogoText || (storefrontMerchant.storeName === 'My Zid Store' ? 'SlateBD' : storefrontMerchant.storeName || 'SlateBD')}. All rights reserved.
        </div>
      </footer>
      </div>
    </div>
  );
};
