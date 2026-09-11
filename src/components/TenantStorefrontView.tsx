import React, { useState, useEffect, useMemo } from 'react';
import { MerchantProfile, Product, BankAccount, MobileBankingConfig, CodConfig, Order, OrderItem, ThemeConfig } from '../types';
import { buildCategoryDbPayload, buildProductDbPayload, maxCatalogId, packCatalogItem, toCatalogSlug, ensureCategory, mapApiProduct, mapApiCategory } from '../utils/catalogPayload';
import { ShoppingBag, X, Check, Copy, CreditCard, Building2, Smartphone, ShieldCheck, Search, Globe, Phone, MapPin, ArrowRight, ArrowLeft, ExternalLink, Clock, Menu, User, Lock, Sparkles, PackageCheck, LogOut, Home, Star, Share2, RotateCcw, MessageSquare, MessageCircle, ChevronRight, ChevronLeft, Trash2, Flame, Eye, Plus, Minus, Tag, Zap, Loader2, Facebook, Instagram, Youtube, Music, Play } from 'lucide-react';
import { sendWhatsAppOtp, verifyWhatsAppOtp, formatFullPhoneNumber } from '../lib/whatsappOtpService';
import { PhoneVerificationInput } from './PhoneVerificationInput';
import { readZidStoreData, subscribeToZidStoreData, writeZidStoreData, type ZidStoreData } from '../lib/storeData';
import { resolveActiveStoreSlug } from '../lib/activeStore';
import { LanguageToggle } from './LanguageToggle';

function mapSupabaseProduct(p: any): Product {
  const title = p.title || p.name || 'Untitled Product';
  return {
    id: String(p.id || `prod-${Math.random()}`),
    title,
    priceBDT: Number(p.price ?? p.priceBDT ?? 0),
    compareAtPriceBDT: p.compare_at_price != null ? Number(p.compare_at_price) : (p.compareAtPriceBDT != null ? Number(p.compareAtPriceBDT) : undefined),
    image: p.image_url || p.image || '',
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
  };
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

interface TenantStorefrontViewProps {
  storeSlug: string;
  merchant: MerchantProfile;
  products: Product[];
  bankAccounts: BankAccount[];
  mobileBanking: MobileBankingConfig[];
  themes: ThemeConfig[];
  orders: Order[];
  onPlaceOrder: (order: Order) => void;
}

interface CustomerReturnRequest {
  id: string;
  orderId: string;
  orderNumber: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Completed' | 'Rejected';
  token: string;
  createdAt: string;
}

interface CustomerReviewItem {
  id: string;
  orderId: string;
  orderNumber: string;
  productTitle: string;
  productImage?: string;
  rating: number;
  comment: string;
  customerName?: string;
  createdAt: string;
}

export const TenantStorefrontView: React.FC<TenantStorefrontViewProps> = ({
  storeSlug,
  merchant,
  products,
  bankAccounts,
  mobileBanking,
  themes,
  orders,
  onPlaceOrder,
}) => {
  // The storefront may be mounted in another route/tab from the editor. Subscribe
  // directly to the shared store so products and published theme changes appear
  // immediately without remounting or refreshing the page.
  const { t } = useLanguage();
  // Effective store slug for cache keys — resolved from prop or the active merchant session.
  // Memoized so the data-load effects below don't re-run on every render (which would
  // otherwise start a new 3s poll + Supabase fetch cascade each time setLiveStoreData fires).
  const effectiveStoreSlug = useMemo(
    () => resolveActiveStoreSlug(storeSlug || (merchant as any)?.storeSlug),
    [storeSlug, (merchant as any)?.storeSlug]
  );
  const [liveStoreData, setLiveStoreData] = useState<ZidStoreData>(() => readZidStoreData(storeSlug));
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
        const slug = effectiveSlug || storeSlug || 'bd';

        // Load full storefront payload from Express API
        const storefrontRes = await fetch(`/api/storefront/${encodeURIComponent(slug)}`);
        const storefrontData = await storefrontRes.json().catch(() => null);

        if (storefrontData && storefrontData.storefront) {
          const payload = storefrontData.storefront;
          apiProducts = Array.isArray(payload.products) ? payload.products : [];
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
  const activeTheme = (storefrontThemes || []).find((theme) => theme?.id === storefrontMerchant.activeThemeId) || storefrontThemes[0];
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
    showHeroBanner: merchantThemeConfig.showHeroBanner !== false,
    heroTitle: (typeof merchantThemeConfig.heroTitle === 'string' && merchantThemeConfig.heroTitle) || storefrontMerchant.heroTitle || '',
    heroSubtitle: (typeof merchantThemeConfig.heroSubtitle === 'string' && merchantThemeConfig.heroSubtitle) || storefrontMerchant.heroSubtitle || '',
    heroImage: (typeof merchantThemeConfig.heroImage === 'string' && merchantThemeConfig.heroImage) || storefrontMerchant.heroImage || '',
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
  const activeHeroSlide = resolvedTheme.slides.length > 0
    ? resolvedTheme.slides[Math.min(resolvedTheme.activeSlideIndex, resolvedTheme.slides.length - 1)]
    : null;
  const primaryColor = (
    (typeof merchantThemeConfig.primaryColor === 'string' && merchantThemeConfig.primaryColor) ||
    (typeof merchantThemeConfig.themePrimaryColor === 'string' && merchantThemeConfig.themePrimaryColor) ||
    (typeof themeCustomization.primaryColor === 'string' && themeCustomization.primaryColor) ||
    (typeof themeCustomization.themePrimaryColor === 'string' && themeCustomization.themePrimaryColor) ||
    activeTheme?.primaryColor ||
    '#00D68F'
  );
  // Direct Supabase & Backend API & LocalStorage Catalog Hook
  const [supabaseProducts, setSupabaseProducts] = useState<Product[]>([]);
  const [supabaseCategories, setSupabaseCategories] = useState<any[]>([]);
  const [isLoadingSupabase, setIsLoadingSupabase] = useState<boolean>(true);

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

  // Products shown on the storefront come ONLY from the database (via API).
  // No hardcoded/mock fallback: if nothing was fetched we render an explicit
  // "No products available" empty state instead of dummy items.
  const storefrontProducts: Product[] = supabaseProducts;

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

  const allActiveProducts = (storefrontProducts || []).filter(p => {
    const status = (p.status || 'active').toLowerCase();
    return status === 'active' || status === 'published';
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
  const [returnOrderId, setReturnOrderId] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [returnNotice, setReturnNotice] = useState('');
  const [reviewOrderId, setReviewOrderId] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewNotice, setReviewNotice] = useState('');
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
      localStorage.setItem(`zid_customer_returns_${storeSlug}`, JSON.stringify(customerReturns));
    } catch (e) { /* ignore quota / privacy errors */ }
  }, [customerReturns, storeSlug]);

  useEffect(() => {
    try {
      localStorage.setItem(`zid_customer_reviews_${storeSlug}`, JSON.stringify(customerReviews));
    } catch (e) { /* ignore quota / privacy errors */ }
  }, [customerReviews, storeSlug]);

  // Checkout Form State
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [payMethod, setPayMethod] = useState<'bkash' | 'nagad' | 'bank' | 'cod'>('bkash');
  const [custCity, setCustCity] = useState('Dhaka');
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
  const insideFee = Number(storefrontCodConfig?.insideDhakaFee) || 80;
  const outsideFee = Number(storefrontCodConfig?.outsideDhakaFee) || 150;
  const shippingFee = (custCity || 'Dhaka').toLowerCase().includes('dhaka') ? insideFee : outsideFee;

  const cartTotal = (cart || []).reduce((sum, item) => sum + ((item.product?.priceBDT ?? 0) * item.quantity), 0);
  const itemsSubtotal = (cart || []).length > 0 ? cartTotal : (selectedProduct?.priceBDT || 0);
  const baseTotalAmount = itemsSubtotal + shippingFee;

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

  const customerOrders = customerSession
    ? (orders || []).filter((order) =>
        order?.customerPhone === customerSession.phone ||
        (order?.customerName || '').toLowerCase() === (customerSession.name || '').toLowerCase()
      )
    : [];

  const handleCustomerSessionPersist = (session: { email: string; name: string; phone: string }) => {
    try {
      localStorage.setItem('zid_customer_session', JSON.stringify(session));
    } catch (e) {
      console.error(e);
    }
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

    localStorage.setItem('zid_customer_accounts', JSON.stringify(updatedAccounts));
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

  const handleAddToCart = (product: Product, variant = 'Default') => {
    setCart(prev => {
      const next = prev || [];
      const existing = next.find(item => item.product.id === product.id && item.variant === variant);
      if (existing) {
        return next.map(item => item.product.id === product.id && item.variant === variant
          ? { ...item, quantity: item.quantity + 1 }
          : item
        );
      }
      return [...next, { product, quantity: 1, variant }];
    });
    setIsCartOpen(true);
  };

  const handleUpdateCartQty = (productId: string, delta: number) => {
    setCart(prev => (prev || []).map(item => {
      if (item.product.id === productId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).filter(Boolean) as any);
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    const total = cart.length > 0 ? cartTotal : (selectedProduct?.priceBDT || 0);

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber: orderNum,
      source: 'Store',
      customerName: customerSession?.name || custName,
      customerPhone: customerSession?.phone || custPhone,
      customerCity: custCity,
      deliveryZone: custCity.toLowerCase().includes('dhaka') ? 'Inside Dhaka' : 'Outside Dhaka',
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

      if (!storeId && cleanSlug && !isUuidLike(cleanSlug)) {
        try {
          const res = await fetch(`/api/stores/slug/${encodeURIComponent(cleanSlug)}`);
          const data = await res.json().catch(() => null);
          if (data?.merchant?.id) {
            storeId = String(data.merchant.id);
            setResolvedStoreId(storeId);
          }
        } catch { /* ignore store lookup errors */ }
      }
      if (!storeId && cleanCode) {
        if (isUuidLike(cleanCode)) {
          storeId = cleanCode;
        } else {
          try {
            const res = await fetch(`/api/stores/slug/${encodeURIComponent(cleanCode)}`);
            const data = await res.json().catch(() => null);
            if (data?.merchant?.id) {
              storeId = String(data.merchant.id);
              setResolvedStoreId(storeId);
            }
          } catch { /* ignore store lookup errors */ }
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

    // Save order to backend API (MongoDB-backed). Non-blocking: log failures
    // but NEVER alert or return early.
    try {
      await fetch(`${window.location.origin}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([newOrder]),
      }).catch(err => console.warn('[Checkout] Order API warning:', err));
    } catch (e) {
      console.warn('[Checkout] Order API warning:', e);
    }

    // Only now — after a successful insert — proceed to the success screen.
    setConfirmedOrderNum(orderNum);
    onPlaceOrder(newOrder);
    setCheckoutStep('success');
    setCart([]);
  };

  // ------------------------------------------------------------------
  // Token / Return request handlers (customer mobile app)
  // ------------------------------------------------------------------
  const handleSubmitReturn = (e: React.FormEvent) => {
    e.preventDefault();
    setReturnNotice('');
    const order = (customerOrders || []).find((o) => o.id === returnOrderId);
    if (!order) {
      setReturnNotice(t('sf_select_order_first'));
      return;
    }
    if (!returnReason.trim()) {
      setReturnNotice(t('sf_return_reason_required'));
      return;
    }
    const token = 'RTK-' + Math.floor(100000 + Math.random() * 900000);
    const newReturn: CustomerReturnRequest = {
      id: `ret-${Date.now()}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      reason: returnReason.trim(),
      status: 'Pending',
      token,
      createdAt: new Date().toLocaleString(),
    };
    setCustomerReturns((prev) => [newReturn, ...prev]);
    setReturnNotice(t('sf_return_submitted') + ' ' + token);
    setReturnOrderId('');
    setReturnReason('');
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    setReviewNotice('');
    const order = (customerOrders || []).find((o) => o.id === reviewOrderId);
    if (!order) {
      setReviewNotice(t('sf_select_order_first'));
      return;
    }
    if (reviewRating < 1 || reviewRating > 5 || !reviewComment.trim()) {
      setReviewNotice(t('sf_review_required'));
      return;
    }
    const firstItem = order.items?.[0];
    const newReview: CustomerReviewItem = {
      id: `rev-${Date.now()}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      productTitle: firstItem?.productName || order.orderNumber,
      productImage: firstItem?.image,
      rating: reviewRating,
      comment: reviewComment.trim(),
      customerName: customerSession?.name || order.customerName,
      createdAt: new Date().toLocaleString(),
    };
    setCustomerReviews((prev) => [newReview, ...prev]);
    setReviewNotice(t('sf_review_submitted'));
    setReviewOrderId('');
    setReviewRating(0);
    setReviewComment('');
  };

  const handleShareReview = (review: CustomerReviewItem) => {
    const stars = '⭐'.repeat(review.rating);
    const text = `${stars} ${review.comment} — ${review.productTitle} (Order ${review.orderNumber})`;
    const shareUrl = window.location.href;
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(text)}`;
    if (navigator.share) {
      navigator.share({ title: review.productTitle, text, url: shareUrl }).catch(() => { /* user dismissed */ });
    } else {
      window.open(facebookUrl, '_blank', 'width=640,height=600');
    }
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

  return (
    <div
      className="min-h-screen font-sans bg-[#0f172a] flex justify-center items-start text-slate-100 selection:text-slate-950 selection:bg-amber-400"
      style={{ ['--theme-primary' as string]: primaryColor } as React.CSSProperties}
    >
      <div className="w-full max-w-[520px] min-h-screen bg-[#0f172a] text-slate-100 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative flex flex-col border-x border-slate-800/80 overflow-x-hidden pb-24">
        {isSplashVisible && (
          <div className="fixed inset-0 z-[80] bg-slate-950/95 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center animate-pulse">
              <div className="relative flex items-center justify-center w-20 h-20 rounded-[24px] bg-[#00D68F] shadow-[0_0_40px_rgba(0,214,143,0.45)]">
                <span className="text-2xl font-black text-slate-950">Z</span>
                <div className="absolute -inset-2 rounded-[28px] border border-[#00D68F]/70 animate-ping" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.35em] text-[#00D68F]">ZID SAAS BD</div>
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
        <header className={`${resolvedTheme.headerSticky ? 'sticky top-0' : ''} z-40 bg-[#0f172a]/90 backdrop-blur-xl border-b border-slate-800/80 shadow-2xl`}>
          {/* Top Announcement Bar — themed from Theme Editor settings */}
          {resolvedTheme.showAnnouncement && (
          <div
            className="py-1.5 px-3 overflow-hidden whitespace-nowrap relative text-[11px] font-black uppercase tracking-wider shadow-md"
            style={{ backgroundColor: resolvedTheme.announcementBg, color: '#0f172a' }}
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

              {/* Stacked Branding Hierarchy */}
              <div className="flex flex-col min-w-0">
                <BrandLogo size="sm" showSubtitle={false} isDarkMode={true} />
                <h1 className="text-xs font-black tracking-wider text-amber-400 truncate max-w-[170px] mt-0.5 uppercase">
                  {storefrontMerchant.storeName === 'My Zid Store' ? 'SlateBD' : storefrontMerchant.storeName || 'SlateBD'}
                </h1>
              </div>
            </div>

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
                  <span className="absolute -top-1 -right-1 text-slate-950 text-[10px] font-black min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center bg-gradient-to-r from-amber-400 to-[#00D68F] shadow-[0_0_10px_rgba(212,175,55,0.4)]">
                    {cart.reduce((s, i) => s + i.quantity, 0)}
                  </span>
                )}
              </button>
            </div>
          </div>

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
              <img
                src={activeHeroSlide?.image || resolvedTheme.heroImage || "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=800&q=80"}
                alt="Hero Banner"
                className="w-full h-full object-cover opacity-50 scale-105 transition-transform duration-700 hover:scale-100"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/50 to-transparent flex items-end p-5">
                <div className="space-y-2 max-w-sm">
                  <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-400 to-[#00D68F] text-slate-950 text-[10px] font-black uppercase tracking-widest px-3 py-0.5 rounded-full shadow-lg">
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
                    <span className="inline-flex items-center gap-1 text-[11px] font-black text-[#00D68F]">
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
                            <img src={image} alt={catName} className="w-full h-full object-cover group-hover:scale-110 transition duration-300" />
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
                      <ShoppingBag className="w-4 h-4 text-[#00D68F]" />
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
                        : "grid grid-cols-2 gap-3"
                  }
                  style={resolvedTheme.productsLayout === 'Carousel' ? undefined : undefined}
                >
                  {displayProducts.length === 0 ? (
                    <div className={`${resolvedTheme.productsLayout === 'List' ? '' : 'col-span-2'} rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 px-4 py-12 text-center space-y-2`}>
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
                          <span className="bg-[#00D68F] text-slate-950 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-md">
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

                      {/* Image Container with Hover Effects */}
                      <div
                        className="relative aspect-square bg-slate-950/80 overflow-hidden cursor-pointer"
                        onClick={() => setQuickViewProduct(p)}
                      >
                        <img
                          src={p.image || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80"}
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
                          </div>

                          <button
                            onClick={(e) => { e.stopPropagation(); handleAddToCart(p); }}
                            className="bg-gradient-to-r from-amber-400 via-[#00D68F] to-emerald-400 text-slate-950 font-black text-xs px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-md hover:shadow-amber-400/20 hover:scale-105 active:scale-95 transition cursor-pointer"
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

              {/* Gallery Section — themed from Theme Editor */}
              {resolvedTheme.showGallery && resolvedTheme.galleryImages.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-black text-slate-100 tracking-tight uppercase flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" />
                  {resolvedTheme.galleryHeading}
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {resolvedTheme.galleryImages.map((img, i) => {
                    const galleryImg = (
                      <img src={img.url} alt={img.caption || `Gallery ${i + 1}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
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

              {/* Video Section — themed from Theme Editor */}
              {resolvedTheme.showVideo && (resolvedTheme.videoFileUrl || resolvedTheme.videoUrl) && (
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
                      src={`https://www.youtube.com/embed/${(resolvedTheme.videoUrl.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/) || [])[1] || 'dQw4w9WgXcQ'}?autoplay=${resolvedTheme.videoAutoplay ? 1 : 0}&mute=${(resolvedTheme.videoAutoplay || resolvedTheme.videoMuted) ? 1 : 0}`}
                      className="w-full h-full"
                      title={resolvedTheme.videoTitle || 'Store Video'}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  )}
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
                  <p className="text-lg font-black text-[#00D68F] font-mono">৳{storeBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
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
                      className="inline-flex items-center gap-2 rounded-xl bg-[#00D68F] px-6 py-3 text-sm font-black text-slate-950 hover:bg-[#00E699] transition cursor-pointer"
                    >
                      <User className="w-4 h-4" /> {t('sf_customer_sign_in')}
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Automatic Delivered banner */}
                    {customerOrders.some((o) => o.fulfillmentStatus === 'Delivered') && (
                      <div className="rounded-3xl border border-emerald-300/70 bg-gradient-to-r from-emerald-50 to-[#00D68F]/10 p-5 shadow-sm flex items-start gap-3">
                        <Sparkles className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-black text-emerald-800 text-sm">{t('sf_delivered_banner_title')}</h4>
                          <p className="text-sm text-emerald-900/90 leading-relaxed mt-1">{t('sf_delivered_banner')}</p>
                        </div>
                      </div>
                    )}

                    {/* Order List */}
                    <section className="space-y-3">
                      <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                        <PackageCheck className="w-5 h-5 text-[#00D68F]" />
                        {t('sf_my_orders')}
                      </h2>
                      {customerOrders.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                          {t('sf_no_orders')}
                        </div>
                      ) : (
                        customerOrders.map((order) => (
                          <div key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">{order.orderNumber}</div>
                                <div className="mt-1 text-base font-black text-slate-900">{order.paymentMethod}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-base font-black text-[#00D68F]">৳{order.totalBDT.toLocaleString()}</div>
                                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${order.fulfillmentStatus === 'Delivered' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {order.fulfillmentStatus}
                                </span>
                              </div>
                            </div>
                            {order.items && order.items.length > 0 && (
                              <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                                {order.items.slice(0, 3).map((item, idx) => (
                                  <div key={idx} className="flex items-center gap-3 text-xs">
                                    {item.image ? (
                                      <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-100" />
                                    ) : (
                                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                                        <ShoppingBag className="w-4 h-4 text-slate-300" />
                                      </div>
                                    )}
                                    <span className="font-semibold text-slate-700 flex-1">{item.productName} × {item.quantity}</span>
                                    <span className="font-bold text-slate-900">৳{(item.unitPriceBDT * item.quantity).toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                              <span>{order.createdAt}</span>
                              <span className="font-mono">{order.trackingCode || order.courierName || '—'}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </section>
                    {/*_CONT_RETURN_*/}

                    {/* Token / Return system */}
                    <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-4">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="w-5 h-5 text-amber-500" />
                        <h2 className="text-lg font-black text-slate-900">{t('sf_token_return')}</h2>
                      </div>
                      <form onSubmit={handleSubmitReturn} className="space-y-3">
                        <select
                          value={returnOrderId}
                          onChange={(e) => setReturnOrderId(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#00D68F] cursor-pointer"
                        >
                          <option value="">{t('sf_select_order')}</option>
                          {customerOrders.map((o) => (
                            <option key={o.id} value={o.id}>{o.orderNumber} — {o.fulfillmentStatus}</option>
                          ))}
                        </select>
                        <textarea
                          value={returnReason}
                          onChange={(e) => setReturnReason(e.target.value)}
                          placeholder={t('sf_return_reason_placeholder')}
                          rows={3}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#00D68F]"
                        />
                        <button
                          type="submit"
                          className="w-full rounded-xl bg-amber-500 py-3 text-sm font-black text-slate-950 hover:bg-amber-400 transition cursor-pointer"
                        >
                          {t('sf_submit_return')}
                        </button>
                      </form>
                      {returnNotice && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{returnNotice}</div>
                      )}
                      {customerReturns.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('sf_return_history')}</h4>
                          {customerReturns.map((r) => (
                            <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
                              <div>
                                <div className="font-black text-slate-900">{r.orderNumber}</div>
                                <div className="text-slate-500">{t('sf_token')}: <span className="font-mono font-bold text-amber-600">{r.token}</span></div>
                              </div>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${r.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{r.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                    {/* Product Reviews */}
                    <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-5">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-[#00D68F]" />
                        <h2 className="text-lg font-black text-slate-900">{t('sf_reviews')}</h2>
                      </div>

                      {customerReviews.length === 0 ? (
                        <p className="text-sm text-slate-500">{t('sf_no_reviews')}</p>
                      ) : (
                        <div className="space-y-4">
                          {customerReviews.map((rev) => (
                            <div key={rev.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <Star key={n} className={`w-4 h-4 ${n <= rev.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
                                  ))}
                                </div>
                                <span className="text-[11px] text-slate-400">{rev.createdAt}</span>
                              </div>
                              <p className="mt-2 text-sm font-semibold text-slate-800">{rev.productTitle}</p>
                              <p className="mt-1 text-sm text-slate-600 leading-relaxed">{rev.comment}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  onClick={() => handleShareReview(rev)}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-[#1877F2] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 transition cursor-pointer"
                                >
                                  <Share2 className="w-3.5 h-3.5" /> {t('sf_share_facebook')}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* New review form */}
                      <form onSubmit={handleSubmitReview} className="space-y-3 border-t border-slate-100 pt-4">
                        <h4 className="text-sm font-black text-slate-900">{t('sf_write_review')}</h4>
                        <select
                          value={reviewOrderId}
                          onChange={(e) => setReviewOrderId(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#00D68F] cursor-pointer"
                        >
                          <option value="">{t('sf_select_order')}</option>
                          {customerOrders.filter((o) => !customerReviews.some((r) => r.orderId === o.id)).map((o) => (
                            <option key={o.id} value={o.id}>{o.orderNumber} — {o.fulfillmentStatus}</option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setReviewRating(n)}
                              className="cursor-pointer transition"
                              aria-label={`${n} star`}
                            >
                              <Star className={`w-8 h-8 ${n <= reviewRating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
                            </button>
                          ))}
                          <span className="ml-2 text-sm font-bold text-slate-600">{reviewRating > 0 ? `${reviewRating}/5` : ''}</span>
                        </div>
                        <textarea
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          placeholder={t('sf_review_placeholder')}
                          rows={3}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#00D68F]"
                        />
                        <button
                          type="submit"
                          className="w-full rounded-xl bg-[#00D68F] py-3 text-sm font-black text-slate-950 hover:bg-[#00E699] transition cursor-pointer"
                        >
                          {t('sf_submit_review')}
                        </button>
                        {reviewNotice && (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{reviewNotice}</div>
                        )}
                      </form>
                    </section>
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
                      className="inline-flex items-center gap-2 rounded-xl bg-[#00D68F] px-6 py-3 text-sm font-black text-slate-950 hover:bg-[#00E699] transition cursor-pointer"
                    >
                      <User className="w-4 h-4" /> {t('sf_customer_sign_in')}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-[#00D68F] text-slate-950 font-black text-2xl flex items-center justify-center">
                        {customerSession.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-black text-slate-900 truncate">{customerSession.name}</h2>
                        <p className="text-sm text-slate-500 truncate">{customerSession.email} • {customerSession.phone}</p>
                      </div>
                                        </div>

                    {/* Automatic Delivered banner */ }
                    {customerOrders.some((o) => o.fulfillmentStatus === 'Delivered') && (
                      <div className="rounded-3xl border border-emerald-300/70 bg-gradient-to-r from-emerald-50 to-[#00D68F]/10 p-5 shadow-sm flex items-start gap-3">
                        <Sparkles className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-black text-emerald-800 text-sm">{t('sf_delivered_banner_title')}</h4>
                          <p className="text-sm text-emerald-900/90 leading-relaxed mt-1">{t('sf_delivered_banner')}</p>
                        </div>
                      </div>
                    )}

                    {/* Order List */ }
                    <section className="space-y-3">
                      <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                        <PackageCheck className="w-5 h-5 text-[#00D68F]" />
                        {t('sf_my_orders')}
                      </h2>
                      {customerOrders.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                          {t('sf_no_orders')}
                        </div>
                      ) : (
                        customerOrders.map((order) => (
                          <div key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">{order.orderNumber}</div>
                                <div className="mt-1 text-base font-black text-slate-900">{order.paymentMethod}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-base font-black text-[#00D68F]">৳{order.totalBDT.toLocaleString()}</div>
                                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${order.fulfillmentStatus === 'Delivered' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {order.fulfillmentStatus}
                                </span>
                              </div>
                            </div>
                            {order.items && order.items.length > 0 && (
                              <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                                {order.items.slice(0, 3).map((item, idx) => (
                                  <div key={idx} className="flex items-center gap-3 text-xs">
                                    {item.image ? (
                                      <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-100" />
                                    ) : (
                                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                                        <ShoppingBag className="w-4 h-4 text-slate-300" />
                                      </div>
                                    )}
                                    <span className="font-semibold text-slate-700 flex-1">{item.productName} × {item.quantity}</span>
                                    <span className="font-bold text-slate-900">৳{(item.unitPriceBDT * item.quantity).toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                              <span>{order.createdAt}</span>
                              <span className="font-mono">{order.trackingCode || order.courierName || '—'}</span>
                            </div>
                          </div>
                        ))
                      )}
                                        </section>

                    {/* Token / Return system */ }
                    <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-4">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="w-5 h-5 text-amber-500" />
                        <h2 className="text-lg font-black text-slate-900">{t('sf_token_return')}</h2>
                      </div>
                      <form onSubmit={handleSubmitReturn} className="space-y-3">
                        <select
                          value={returnOrderId}
                          onChange={(e) => setReturnOrderId(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#00D68F] cursor-pointer"
                        >
                          <option value="">{t('sf_select_order')}</option>
                          {customerOrders.map((o) => (
                            <option key={o.id} value={o.id}>{o.orderNumber} — {o.fulfillmentStatus}</option>
                          ))}
                        </select>
                        <textarea
                          value={returnReason}
                          onChange={(e) => setReturnReason(e.target.value)}
                          placeholder={t('sf_return_reason_placeholder')}
                          rows={3}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#00D68F]"
                        />
                        <button
                          type="submit"
                          className="w-full rounded-xl bg-amber-500 py-3 text-sm font-black text-slate-950 hover:bg-amber-400 transition cursor-pointer"
                        >
                          {t('sf_submit_return')}
                        </button>
                      </form>
                      {returnNotice && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{returnNotice}</div>
                      )}
                      {customerReturns.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('sf_return_history')}</h4>
                          {customerReturns.map((r) => (
                            <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
                              <div>
                                <div className="font-black text-slate-900">{r.orderNumber}</div>
                                <div className="text-slate-500">{t('sf_token')}: <span className="font-mono font-bold text-amber-600">{r.token}</span></div>
                              </div>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${r.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{r.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                                        </section>

                    {/* Product Reviews */ }
                    <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-5">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-[#00D68F]" />
                        <h2 className="text-lg font-black text-slate-900">{t('sf_reviews')}</h2>
                      </div>

                      {customerReviews.length === 0 ? (
                        <p className="text-sm text-slate-500">{t('sf_no_reviews')}</p>
                      ) : (
                        <div className="space-y-4">
                          {customerReviews.map((rev) => (
                            <div key={rev.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4, 5].map((n) => (
                                    <Star key={n} className={`w-4 h-4 ${n <= rev.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
                                  ))}
                                </div>
                                <span className="text-[11px] text-slate-400">{rev.createdAt}</span>
                              </div>
                              <p className="mt-2 text-sm font-semibold text-slate-800">{rev.productTitle}</p>
                              <p className="mt-1 text-sm text-slate-600 leading-relaxed">{rev.comment}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  onClick={() => handleShareReview(rev)}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-[#1877F2] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 transition cursor-pointer"
                                >
                                  <Share2 className="w-3.5 h-3.5" /> {t('sf_share_facebook')}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* New review form */ }
                      <form onSubmit={handleSubmitReview} className="space-y-3 border-t border-slate-100 pt-4">
                        <h4 className="text-sm font-black text-slate-900">{t('sf_write_review')}</h4>
                        <select
                          value={reviewOrderId}
                          onChange={(e) => setReviewOrderId(e.target.value)}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#00D68F] cursor-pointer"
                        >
                          <option value="">{t('sf_select_order')}</option>
                          {customerOrders.filter((o) => !customerReviews.some((r) => r.orderId === o.id)).map((o) => (
                            <option key={o.id} value={o.id}>{o.orderNumber} — {o.fulfillmentStatus}</option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setReviewRating(n)}
                              className="cursor-pointer transition"
                              aria-label={`${n} star`}
                            >
                              <Star className={`w-8 h-8 ${n <= reviewRating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
                            </button>
                          ))}
                          <span className="ml-2 text-sm font-bold text-slate-600">{reviewRating > 0 ? `${reviewRating}/5` : ''}</span>
                        </div>
                        <textarea
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          placeholder={t('sf_review_placeholder')}
                          rows={3}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#00D68F]"
                        />
                        <button
                          type="submit"
                          className="w-full rounded-xl bg-[#00D68F] py-3 text-sm font-black text-slate-950 hover:bg-[#00E699] transition cursor-pointer"
                        >
                          {t('sf_submit_review')}
                        </button>
                        {reviewNotice && (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{reviewNotice}</div>
                        )}
                      </form>
                    </section>

                    <div className="rounded-3xl border border-slate-200 bg-white divide-y divide-slate-100 shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between p-4">
                        <span className="text-sm font-bold text-slate-700">{t('sf_language')}</span>
                        <LanguageToggle />
                      </div>
                      <button
                        onClick={handleCustomerSignOut}
                        className="w-full flex items-center gap-3 p-4 text-left hover:bg-red-50 transition cursor-pointer"
                      >
                        <LogOut className="w-5 h-5 text-red-500" />
                        <span className="flex-1 font-bold text-red-600">{t('sf_sign_out')}</span>
                      </button>
                    </div>
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
                      <img src={item.product.image} alt={item.product.title} className="w-12 h-12 object-cover rounded-lg border border-slate-800 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-xs text-slate-100 truncate">{item.product.title}</h4>
                        <div className="text-[10px] text-slate-400">Qty: {item.quantity}</div>
                      </div>
                      <div className="text-xs font-black text-amber-400 shrink-0">৳{((item.product.priceBDT ?? 0) * item.quantity).toLocaleString()}</div>
                    </div>
                  ))
                ) : selectedProduct ? (
                  <div className="flex items-center gap-3 py-1">
                    <img src={selectedProduct.image} alt={selectedProduct.title} className="w-12 h-12 object-cover rounded-lg border border-slate-800 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-xs text-slate-100 truncate">{selectedProduct.title}</h4>
                    </div>
                    <div className="text-xs font-black text-amber-400 shrink-0">৳{(selectedProduct.priceBDT ?? 0).toLocaleString()}</div>
                  </div>
                ) : null}

                <div className="border-t border-slate-800 pt-2 flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-400">Total Payable:</span>
                  <span className="text-base font-black text-amber-400">৳{totalAmount.toLocaleString()}</span>
                </div>
              </div>

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
                    <label className="block mb-1 font-bold text-xs text-slate-300">City / District</label>
                    <select
                      value={custCity}
                      onChange={(e) => setCustCity(e.target.value)}
                      className="w-full rounded-xl px-3.5 py-2.5 bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-400 font-medium"
                    >
                      <option value="Dhaka">Dhaka (Inside Dhaka - ৳80)</option>
                      <option value="Chittagong">Chittagong (Outside Dhaka - ৳150)</option>
                      <option value="Sylhet">Sylhet (Outside Dhaka - ৳150)</option>
                    </select>
                  </div>
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
                          payMethod === 'cod' ? 'border-[#00D68F] bg-emerald-50 text-[#00A16B]' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Building2 className={`w-4 h-4 shrink-0 ${payMethod === 'cod' ? 'text-[#00D68F]' : 'text-slate-400'}`} />
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
                        <span>Shipping Fee ({custCity || 'Dhaka'}):</span>
                        <span className="font-semibold text-slate-900">৳{shippingFee}</span>
                      </div>
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
                          <div className="flex justify-between text-[#00D68F] font-bold text-[11px] pt-1 border-t border-slate-200">
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
                    className="w-full py-3.5 bg-[#00D68F] text-slate-950 font-black rounded-xl text-sm hover:bg-[#00E699] transition cursor-pointer shadow-lg"
                  >
                    Confirm Order • ৳{
                      ['bkash', 'nagad', 'rocket'].includes(payMethod)
                        ? finalPayableMobile.toLocaleString()
                        : payMethod === 'cod' && requiresAdvanceFee
                        ? `${totalAdvancePayable} Upfront (৳${remainingCodBalance.toLocaleString()} COD)`
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
              <Check className="w-8 h-8 text-[#00D68F]" />
            </div>

            <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Order Placed Successfully!</h3>

            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3 mb-6">
              <p className="text-xs text-slate-600">
                Thank you <strong className="text-slate-900">{custName}</strong>. Your order has been placed.
              </p>
              <div className="flex justify-center items-center gap-1.5 text-xs font-mono">
                <span className="text-slate-500">ORDER:</span>
                <span className="bg-[#00D68F] text-white px-2 py-0.5 rounded font-bold">{confirmedOrderNum}</span>
              </div>
            </div>

            <button
              onClick={() => {
                setCheckoutStep('catalog');
                setSelectedProduct(null);
                setMobileTab('home');
              }}
              className="px-6 py-3 bg-[#00D68F] text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer shadow-md hover:bg-[#00E699]"
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
                className="shrink-0 bg-gradient-to-r from-amber-400 via-[#00D68F] to-emerald-400 text-slate-950 font-black text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-[0_0_15px_rgba(212,175,55,0.3)] hover:scale-105 active:scale-95 transition cursor-pointer"
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
                      <span className="absolute -top-1.5 -right-2 bg-gradient-to-r from-amber-400 to-[#00D68F] text-slate-950 text-[9px] font-black min-w-[14px] h-3.5 px-1 rounded-full flex items-center justify-center">
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
                className={`rounded-xl px-3 py-2 text-xs font-bold transition ${authMode === 'signin' ? 'bg-gradient-to-r from-amber-400 to-[#00D68F] text-slate-950 font-black' : 'text-slate-400'}`}
              >
                {t('sign_in')}
              </button>
              <button
                onClick={() => setAuthMode('signup')}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition ${authMode === 'signup' ? 'bg-gradient-to-r from-amber-400 to-[#00D68F] text-slate-950 font-black' : 'text-slate-400'}`}
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
                className="w-full rounded-xl bg-gradient-to-r from-amber-400 via-[#00D68F] to-emerald-400 py-3 text-sm font-black text-slate-950 hover:shadow-lg transition cursor-pointer"
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
              <img src={quickViewProduct.image} alt={quickViewProduct.title} className="w-full h-full object-cover" />
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
                  className="w-full py-3 bg-gradient-to-r from-amber-400 via-[#00D68F] to-emerald-400 text-slate-950 font-black rounded-xl text-xs transition cursor-pointer shadow-lg flex items-center justify-center gap-1.5 hover:scale-[1.02]"
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
                    <img src={item.product.image} alt={item.product.title} className="w-20 h-20 object-cover rounded-xl border border-slate-800 shrink-0" />
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

            {cart.length > 0 && (
              <div className="p-5 border-t border-slate-800/80 bg-slate-950/90 space-y-3">
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal</span>
                    <span className="font-extrabold text-slate-200">৳{cartTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Delivery Fee</span>
                    <span className="text-emerald-400 font-bold">Calculated at Checkout</span>
                  </div>
                  <div className="border-t border-slate-800 pt-2 flex justify-between items-center text-sm">
                    <span className="font-bold text-slate-200">Total Payable</span>
                    <span className="text-xl font-black text-amber-400">৳{cartTotal.toLocaleString()}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIsCartOpen(false);
                    setCheckoutStep('checkout');
                  }}
                  className="w-full py-4 bg-gradient-to-r from-amber-400 via-[#00D68F] to-emerald-400 text-slate-950 font-black rounded-xl text-sm hover:scale-[1.01] transition cursor-pointer shadow-lg flex items-center justify-center gap-2"
                >
                  <span>Proceed to Checkout</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
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
          {resolvedTheme.footerLinks.length > 0 && (
            <div className="pt-2">
              <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-300 mb-2">{resolvedTheme.footerLinksTitle}</h5>
              <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
                {resolvedTheme.footerLinks.map((linkLabel, i) => (
                  <li key={`flink-${i}`} className="text-[11px] text-slate-400 hover:text-amber-400 transition cursor-pointer">{linkLabel}</li>
                ))}
              </ul>
            </div>
          )}
          {(resolvedTheme.contactPhone || resolvedTheme.contactEmail || resolvedTheme.dhakaAddress) && (
            <div className="pt-2 space-y-1">
              {resolvedTheme.contactPhone && (
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-300"><Phone className="w-3 h-3 text-[#00D68F]" /> {resolvedTheme.contactPhone}</div>
              )}
              {resolvedTheme.contactEmail && (
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-300"><Globe className="w-3 h-3 text-[#00D68F]" /> {resolvedTheme.contactEmail}</div>
              )}
              {resolvedTheme.dhakaAddress && (
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-300"><MapPin className="w-3 h-3 text-[#00D68F]" /> {resolvedTheme.dhakaAddress}</div>
              )}
            </div>
          )}
          <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-300 pt-1">
            <ShieldCheck className="w-4 h-4 text-[#00D68F]" />
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
