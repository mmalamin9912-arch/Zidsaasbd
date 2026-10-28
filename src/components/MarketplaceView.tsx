/**
 * MarketplaceView — the central, multi-vendor marketplace homepage.
 *
 * Lists every PUBLIC product from every ACTIVE merchant in one grid, with the
 * filters the marketplace needs:
 *
 *   • category            (facet chips, counts from the server)
 *   • price range         (min / max ± quick bands)
 *   • vendor              (facet list + free-text seller search)
 *
 * Data comes from GET /api/marketplace/products (see lib/marketplaceApi.ts).
 * Every product row already carries `vendor_id` / `vendor_name` / `vendor_slug`
 * so "Add to cart" can tag the line with its seller — that is what lets a cart
 * span several stores and checkout split into per-vendor child orders.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, SlidersHorizontal, X, Store, ChevronDown, ShoppingBag, Loader2,
  RefreshCw, Sparkles, ArrowLeft, Check,
} from 'lucide-react';
import SafeImage from './SafeImage';
import { useToast } from './ToastProvider';
import {
  fetchMarketplaceProducts,
  type MarketplaceResponse,
  type MarketplaceFilters,
  type MarketplaceFacetVendor,
} from '../lib/marketplaceApi';
import type { MarketplaceProduct } from '../types';

/** Price bands frequent in Bangladeshi storefronts (৳). */
const PRICE_BANDS: { label: string; min: number | null; max: number | null }[] = [
  { label: 'Any price', min: null, max: null },
  { label: 'Under ৳500', min: null, max: 500 },
  { label: '৳500 – ৳1,000', min: 500, max: 1000 },
  { label: '৳1,000 – ৳5,000', min: 1000, max: 5000 },
  { label: '৳5,000 – ৳20,000', min: 5000, max: 20000 },
  { label: 'Above ৳20,000', min: 20000, max: null },
];

const SORTS: { value: NonNullable<MarketplaceFilters['sort']>; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Best selling' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'relevance', label: 'Relevance' },
];

const PAGE_SIZE = 24;

export interface MarketplaceCartLine {
  product: MarketplaceProduct;
  quantity: number;
}

export interface MarketplaceViewProps {
  /**
   * Called when the shopper adds a product. The owning store receives the
   * product with `vendor_id` / `store_id` already set, so its cart can hold
   * items from several merchants at once.
   */
  onAddToCart?: (product: MarketplaceProduct, quantity: number) => void;
  /** Opens a vendor's own storefront. */
  onVisitStore?: (vendorSlug: string) => void;
  /** Optional: return to the previous page. */
  onBack?: () => void;
  /** Initial filters (e.g. from a deep link `?category=…`). */
  initialFilters?: MarketplaceFilters;
  /** Heading shown at the top of the page. */
  title?: string;
}

/** ৳ formatter shared by every card. */
const bdt = (value: number) => `৳${Math.round(Number(value) || 0).toLocaleString('en-US')}`;

export const MarketplaceView: React.FC<MarketplaceViewProps> = ({
  onAddToCart,
  onVisitStore,
  onBack,
  initialFilters,
  title = 'Marketplace',
}) => {
  const toast = useToast();

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
  const [showFilters, setShowFilters] = useState(false);
  const [showVendorMenu, setShowVendorMenu] = useState(false);
  const [vendorQuery, setVendorQuery] = useState('');
  const [addedIds, setAddedIds] = useState<Record<string, number>>({});
  const inflightRef = useRef<AbortController | null>(null);

  /** Apply a partial filter change and reset pagination. */
  const updateFilters = useCallback((patch: Partial<MarketplaceFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch, page: 1 }));
  }, []);

  // ── Load the catalogue whenever the filters change ──────────────────────
  useEffect(() => {
    const controller = new AbortController();
    inflightRef.current?.abort();
    inflightRef.current = controller;

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
    // `filters` is a fresh object per change; compare by value via its query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.q, filters.category, filters.minPrice, filters.maxPrice,
    filters.vendor, filters.vendorName, filters.sort, filters.limit,
  ]);

  /** Load the next page and append it to the grid. */
  const loadMore = async () => {
    if (!data || data.page >= data.pages || appending) return;
    setAppending(true);
    const next = await fetchMarketplaceProducts({ ...filters, page: (filters.page || 1) + 1 });
    setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }));
    if (next.ok) {
      setData((prev) => {
        if (!prev) return next;
        const seen = new Set(prev.products.map((p) => p.id));
        const merged = [...prev.products, ...next.products.filter((p) => !seen.has(String(p.id)))];
        return { ...next, products: merged, page: next.page };
      });
    }
    setAppending(false);
  };

  const submitSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    updateFilters({ q: searchInput.trim() || undefined });
  };

  const activeVendor: MarketplaceFacetVendor | undefined = useMemo(
    () => data?.vendors.find((v) => v.vendor_id === filters.vendor || v.vendor_slug === filters.vendor),
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

  const clearFilters = () => {
    setSearchInput('');
    setVendorQuery('');
    setFilters({ sort: 'newest', page: 1, limit: PAGE_SIZE });
  };

  const filteredVendorFacets = useMemo(() => {
    const list = data?.vendors || [];
    const q = vendorQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((v) =>
      (v.vendor_name || '').toLowerCase().includes(q) ||
      (v.vendor_slug || '').toLowerCase().includes(q) ||
      (v.vendor_code || '').toLowerCase().includes(q),
    );
  }, [data?.vendors, vendorQuery]);

  const handleAdd = (product: MarketplaceProduct) => {
    onAddToCart?.(product, 1);
    setAddedIds((prev) => ({ ...prev, [String(product.id)]: (prev[String(product.id)] || 0) + 1 }));
    toast.success('Added to cart', { description: `${product.title} — ${product.vendor_name}` });
  };

  const priceBandIndex = useMemo(() => {
    return PRICE_BANDS.findIndex((band) => band.min === (filters.minPrice ?? null) && band.max === (filters.maxPrice ?? null));
  }, [filters.minPrice, filters.maxPrice]);

  const products = data?.products || [];

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100">
      {/* ── Header / search bar ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[#0b1120]/95 backdrop-blur-xl border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-400 to-emerald-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-slate-950" />
            </div>
            <span className="hidden sm:block font-black tracking-tight">ZID Marketplace</span>
          </div>

          <form onSubmit={submitSearch} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search products across all stores…"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-9 py-2.5 text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-400/60"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => { setSearchInput(''); updateFilters({ q: undefined }); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-200"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={`lg:hidden relative p-2.5 rounded-xl border transition-colors ${
                showFilters ? 'bg-amber-400 text-slate-950 border-amber-400' : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
              aria-label="Filters"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </form>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-[260px_1fr] gap-6">
        {/* ── Filters sidebar ───────────────────────────────────────────── */}
        <aside className={`${showFilters ? 'block' : 'hidden'} lg:block space-y-4`}>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Filters</h3>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-[10px] font-bold text-amber-400 hover:underline">
                  Clear all
                </button>
              )}
            </div>

            {/* Category */}
            <div className="mb-5">
              <div className="text-[11px] font-bold text-slate-300 mb-2">Category</div>
              <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                <button
                  onClick={() => updateFilters({ category: undefined })}
                  className={`w-full flex items-center justify-between text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${
                    !filters.category ? 'bg-amber-400/15 text-amber-300 font-bold' : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span>All categories</span>
                  <span className="text-[10px] opacity-70">{data?.total ?? 0}</span>
                </button>
                {(data?.categories || []).map((cat) => (
                  <button
                    key={cat.name}
                    onClick={() => updateFilters({ category: filters.category === cat.name ? undefined : cat.name })}
                    className={`w-full flex items-center justify-between text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${
                      filters.category === cat.name ? 'bg-amber-400/15 text-amber-300 font-bold' : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate">{cat.name}</span>
                    <span className="text-[10px] opacity-70 shrink-0 ml-2">{cat.product_count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Price */}
            <div className="mb-5">
              <div className="text-[11px] font-bold text-slate-300 mb-2">Price</div>
              <div className="space-y-1">
                {PRICE_BANDS.map((band, idx) => (
                  <button
                    key={band.label}
                    onClick={() => updateFilters({ minPrice: band.min, maxPrice: band.max })}
                    className={`w-full flex items-center gap-2 text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${
                      priceBandIndex === idx ? 'bg-amber-400/15 text-amber-300 font-bold' : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-full border ${priceBandIndex === idx ? 'border-amber-400 bg-amber-400' : 'border-slate-600'}`} />
                    {band.label}
                  </button>
                ))}
              </div>
              {/* Custom range */}
              <div className="flex items-center gap-1.5 mt-2">
                <input
                  type="number"
                  min={0}
                  value={filters.minPrice ?? ''}
                  onChange={(e) => updateFilters({ minPrice: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="Min"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:border-amber-400/60"
                />
                <span className="text-slate-600 text-xs">–</span>
                <input
                  type="number"
                  min={0}
                  value={filters.maxPrice ?? ''}
                  onChange={(e) => updateFilters({ maxPrice: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder="Max"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:border-amber-400/60"
                />
              </div>
            </div>

            {/* Vendor */}
            <div>
              <div className="text-[11px] font-bold text-slate-300 mb-2">Vendor</div>
              <div className="relative mb-2">
                <Store className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                <input
                  value={vendorQuery}
                  onChange={(e) => setVendorQuery(e.target.value)}
                  placeholder="Find a store…"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-2 py-1.5 text-[11px] focus:outline-none focus:border-amber-400/60"
                />
              </div>
              {filters.vendor && (
                <button
                  onClick={() => updateFilters({ vendor: undefined })}
                  className="w-full flex items-center justify-between text-xs px-2 py-1.5 mb-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/30"
                >
                  <span className="truncate">Showing: {activeVendor?.vendor_name || filters.vendor}</span>
                  <X className="w-3 h-3 shrink-0" />
                </button>
              )}
              <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                {filteredVendorFacets.map((vendor) => (
                  <button
                    key={vendor.vendor_id}
                    onClick={() => updateFilters({ vendor: filters.vendor === vendor.vendor_id ? undefined : vendor.vendor_id })}
                    className={`w-full flex items-center justify-between text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${
                      filters.vendor === vendor.vendor_id ? 'bg-amber-400/15 text-amber-300 font-bold' : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate">{vendor.vendor_name}</span>
                    <span className="text-[10px] opacity-70 shrink-0 ml-2">{vendor.product_count}</span>
                  </button>
                ))}
                {filteredVendorFacets.length === 0 && (
                  <div className="text-[11px] text-slate-600 px-2 py-1">No stores match.</div>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* ── Results ───────────────────────────────────────────────────── */}
        <main>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h1 className="text-xl font-black tracking-tight">{title}</h1>
              <p className="text-xs text-slate-400">
                {loading ? 'Loading products…' : `${data?.total ?? 0} products from ${data?.vendors.length ?? 0} stores`}
                {filters.category ? ` · ${filters.category}` : ''}
                {activeVendor ? ` · ${activeVendor.vendor_name}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Mobile vendor dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowVendorMenu((v) => !v)}
                  className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span className="max-w-[120px] truncate">{activeVendor?.vendor_name || 'All vendors'}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showVendorMenu && (
                  <div className="absolute right-0 mt-1 w-56 max-h-72 overflow-y-auto z-20 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-1">
                    <button
                      onClick={() => { updateFilters({ vendor: undefined }); setShowVendorMenu(false); }}
                      className="w-full flex items-center justify-between text-left text-xs px-2 py-2 rounded-lg hover:bg-slate-800"
                    >
                      <span>All vendors</span>
                      {!filters.vendor && <Check className="w-3 h-3 text-amber-400" />}
                    </button>
                    {(data?.vendors || []).map((v) => (
                      <button
                        key={v.vendor_id}
                        onClick={() => { updateFilters({ vendor: v.vendor_id }); setShowVendorMenu(false); }}
                        className="w-full flex items-center justify-between text-left text-xs px-2 py-2 rounded-lg hover:bg-slate-800"
                      >
                        <span className="truncate">{v.vendor_name}</span>
                        <span className="text-[10px] text-slate-500 ml-2 shrink-0">{v.product_count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <select
                value={filters.sort}
                onChange={(e) => updateFilters({ sort: e.target.value as MarketplaceFilters['sort'] })}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-slate-300 focus:outline-none focus:border-amber-400/60"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>

              <button
                onClick={() => setFilters((prev) => ({ ...prev }))}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
                aria-label="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* Grid */}
          {loading && products.length === 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden animate-pulse">
                  <div className="aspect-square bg-slate-800/60" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-slate-800 rounded w-3/4" />
                    <div className="h-3 bg-slate-800 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 py-20 text-center">
              <ShoppingBag className="w-10 h-10 mx-auto text-slate-700 mb-3" />
              <div className="text-sm font-bold text-slate-300">No products match these filters</div>
              <div className="text-xs text-slate-500 mt-1">Try a different category, price range or vendor.</div>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="mt-4 px-4 py-2 rounded-xl bg-amber-400 text-slate-950 text-xs font-black hover:bg-amber-300"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {products.map((product) => (
                  <article
                    key={String(product.id)}
                    className="group rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden hover:border-amber-400/40 transition-colors flex flex-col"
                  >
                    <div className="relative aspect-square bg-slate-950">
                      <SafeImage
                        src={(product as any).image || (product as any).image_url || (product as any).imageUrl}
                        alt={product.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      {Number((product as any).compareAtPriceBDT) > Number(product.priceBDT) && (
                        <span className="absolute top-2 left-2 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded">
                          SALE
                        </span>
                      )}
                    </div>
                    <div className="p-3 flex-1 flex flex-col">
                      <h3 className="text-xs font-bold text-slate-100 line-clamp-2 leading-snug">{product.title}</h3>
                      <button
                        onClick={() => onVisitStore?.(product.vendor_slug)}
                        className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-amber-400/90 hover:text-amber-300 truncate"
                        title={`Visit ${product.vendor_name}`}
                      >
                        <Store className="w-3 h-3 shrink-0" />
                        <span className="truncate">{product.vendor_name}</span>
                      </button>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div>
                          <div className="text-sm font-black text-white">{bdt(product.priceBDT)}</div>
                          {Number((product as any).compareAtPriceBDT) > Number(product.priceBDT) && (
                            <div className="text-[10px] text-slate-500 line-through">
                              {bdt((product as any).compareAtPriceBDT)}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleAdd(product)}
                          className="shrink-0 p-2 rounded-xl bg-amber-400 text-slate-950 hover:bg-amber-300 transition-colors"
                          aria-label={`Add ${product.title} to cart`}
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {addedIds[String(product.id)] ? (
                        <div className="mt-1.5 text-[9px] font-bold text-emerald-400 flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" /> In cart × {addedIds[String(product.id)]}
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>

              {data && data.page < data.pages && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={loadMore}
                    disabled={appending}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-black text-slate-200 hover:border-amber-400/50 disabled:opacity-60"
                  >
                    {appending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default MarketplaceView;
