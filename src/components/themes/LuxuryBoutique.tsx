/**
 * LuxuryBoutique — the dedicated premium boutique theme component tree.
 *
 * Completely independent from the Default Modern (classic) component tree —
 * zero shared layout code:
 *   • Light background (#F8FAFC), "AURA" wordmark header + custom nav bar
 *   • Circular category rail (Summer, Dresses, Bags, Shoes, Jewelry, Denim)
 *   • "The Summer Collection" hero banner with "DISCOVER NOW" CTA button
 *   • Unique product card grid with luxury serif typography
 *
 * Accepts OPTIONAL real store data (products / categories / logo) with safe
 * fallbacks, so the storefront, the live customiser preview frame and every
 * "Live Demo" surface all mount this SAME dedicated component tree.
 */
import React from 'react';
import { ShoppingCart, Search, Menu } from 'lucide-react';
import SafeImage from '../SafeImage';

/* ── Luxury design tokens ─────────────────────────────────────────────── */

const luxuryTokens = (accentColor?: string): React.CSSProperties => ({
  ['--primary-accent' as string]: accentColor || '#E8D5C4',
  ['--theme-primary' as string]: accentColor || '#E8D5C4',
  ['--luxury-surface' as string]: '#FFFFFF',
});

/* ── Circular category fallbacks (exact boutique set) ─────────────────── */

const LUXURY_CATEGORY_SET: Array<{ id: string; name: string; img: string }> = [
  { id: 'lux-summer', name: 'Summer', img: 'https://images.unsplash.com/photo-1515883170111-446e7f35ae9f?auto=format&fit=crop&w=200&q=80' },
  { id: 'lux-dresses', name: 'Dresses', img: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=200&q=80' },
  { id: 'lux-bags', name: 'Bags', img: 'https://images.unsplash.com/photo-1584917865442-de89df76d6b9?auto=format&fit=crop&w=200&q=80' },
  { id: 'lux-shoes', name: 'Shoes', img: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=200&q=80' },
  { id: 'lux-jewelry', name: 'Jewelry', img: 'https://images.unsplash.com/photo-1515562142607-d97030612c40?auto=format&fit=crop&w=200&q=80' },
  { id: 'lux-denim', name: 'Denim', img: 'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=200&q=80' },
];

/* ── Product fallbacks (rendered only when the store has no products) ─── */

const FALLBACK_PRODUCTS: Array<{ id: string; title: string; price: string; img: string; badge?: string }> = [
  { id: 'fb-1', title: 'Linen Wrap Dress', price: '4,500', img: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=600&q=80', badge: 'Bestseller' },
  { id: 'fb-2', title: 'Leather Mini Bag', price: '8,900', img: 'https://images.unsplash.com/photo-1584917865442-de89df76d6b9?auto=format&fit=crop&w=600&q=80', badge: 'New' },
  { id: 'fb-3', title: 'Pleated Midi Skirt', price: '3,200', img: 'https://images.unsplash.com/photo-1583496661160-c588c443c982?auto=format&fit=crop&w=600&q=80' },
  { id: 'fb-4', title: 'Silk Camisole', price: '2,100', img: 'https://images.unsplash.com/photo-1532453288672-3a27e9be9efd?auto=format&fit=crop&w=600&q=80' },
  { id: 'fb-5', title: 'Cashmere Sweater', price: '6,800', img: 'https://images.unsplash.com/photo-1576566192725-2d320e157a0c?auto=format&fit=crop&w=600&q=80', badge: 'Premium' },
  { id: 'fb-6', title: 'Gold Hoop Earrings', price: '1,200', img: 'https://images.unsplash.com/photo-1572635190689-5c1754ec9cf2?auto=format&fit=crop&w=600&q=80' },
  { id: 'fb-7', title: 'Wool Blazer', price: '12,500', img: 'https://images.unsplash.com/photo-1551882547-ff2c663b73c4?auto=format&fit=crop&w=600&q=80' },
  { id: 'fb-8', title: 'Silk Scarf', price: '1,800', img: 'https://images.unsplash.com/photo-1583496661160-c588c443c982?auto=format&fit=crop&w=600&q=80' },
];

/* ── Safe helpers (missing data can never crash the tree) ─────────────── */

const safeStr = (v: unknown, fallback = ''): string => (typeof v === 'string' && v.trim() ? v.trim() : fallback);

const productImage = (p: any): string =>
  safeStr(p?.image || p?.imageUrl || p?.thumbnailUrl || p?.img || '');

const productTitle = (p: any): string => safeStr(p?.title || p?.name, 'Product');

const productPrice = (p: any): string => {
  const n = Number(p?.price ?? p?.priceBDT ?? p?.price_bdt ?? 0);
  return Number.isFinite(n) && n > 0
    ? n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
    : safeStr((p as any)?.price, '—');
};

/* ── The Luxury Boutique theme component ──────────────────────────────── */

export interface LuxuryBoutiqueProps {
  /** Merchant accent colour from the live theme customiser. */
  accentColor?: string;
  /** Store name — used as the AURA header wordmark when no logo exists. */
  storeName?: string;
  /** Logo URL (merchant upload) — replaces the wordmark when present. */
  logoUrl?: string;
  /** Real catalogue data (optional; curated fallbacks render when omitted). */
  products?: any[];
  categories?: any[];
}

export const LuxuryBoutique: React.FC<LuxuryBoutiqueProps> = ({
  accentColor,
  storeName,
  logoUrl,
  products,
  categories,
}) => {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  // Real store data wins; the curated boutique set keeps previews rich.
  const resolvedCategories = React.useMemo(() => {
    const real = Array.isArray(categories) ? categories.filter((c: any) => safeStr(c?.name || c?.title)) : [];
    if (real.length === 0) return LUXURY_CATEGORY_SET;
    return real.slice(0, 8).map((c: any, i: number) => ({
      id: safeStr(c?.id, `lux-cat-${i}`),
      name: safeStr(c?.name || c?.title, `Category ${i + 1}`),
      img: safeStr(c?.img || c?.image || c?.imageUrl || ''),
    }));
  }, [categories]);

  const resolvedProducts = React.useMemo(() => {
    const real = Array.isArray(products) ? products.filter(Boolean) : [];
    if (real.length === 0) return FALLBACK_PRODUCTS as any[];
    return real.slice(0, 12);
  }, [products]);

  const filteredProducts = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return resolvedProducts;
    return resolvedProducts.filter((p: any) =>
      productTitle(p).toLowerCase().includes(q) ||
      safeStr((p as any)?.category).toLowerCase().includes(q)
    );
  }, [resolvedProducts, searchQuery]);

  const wordmark = safeStr(storeName, 'AURA').toUpperCase();

  return (
    <div
      data-theme-component="LuxuryBoutique"
      data-layout="fashion"
      className="min-h-screen w-full font-sans overflow-x-hidden bg-[#F8FAFC] text-slate-900"
      style={luxuryTokens(accentColor) as React.CSSProperties}
    >
      {/* ── Top Luxury Header — AURA brand styling + custom nav bar ── */}
      <header data-theme-header="luxury" className="sticky top-0 z-40 bg-white text-slate-900 border-b border-slate-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3">
          <button className="sm:hidden p-2 text-slate-900" onClick={() => setIsMobileMenuOpen(true)} aria-label="Menu">
            <Menu className="w-5 h-5" />
          </button>
          <div className="text-xl sm:text-3xl font-serif font-black tracking-[0.22em] uppercase text-slate-900 cursor-pointer">
            {logoUrl ? <SafeImage src={logoUrl} alt={wordmark} className="h-8 w-auto object-contain" /> : wordmark}
          </div>
          <nav className="hidden sm:flex items-center gap-6">
            {['New Arrivals', 'Women', 'Men', 'Accessories', 'Sale'].map((item) => (
              <a key={item} href="#" onClick={(e) => e.preventDefault()} className="text-xs font-black uppercase tracking-widest text-slate-600 hover:text-slate-900 transition whitespace-nowrap">
                {item}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <button onClick={() => setSearchOpen((v) => !v)} className="p-2 text-slate-900 hover:bg-slate-50 rounded-full" aria-label="Search">
              <Search className="w-5 h-5" />
            </button>
            <button className="relative p-2 text-slate-900 hover:bg-slate-50 rounded-full" aria-label="Cart">
              <ShoppingCart className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Circular category rail: Summer · Dresses · Bags · Shoes · Jewelry · Denim ── */}
        <div className="bg-white border-t border-slate-100 py-3 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-4 px-4 max-w-7xl mx-auto min-w-max">
            {resolvedCategories.map((cat) => (
              <div key={cat.id} className="flex flex-col items-center gap-1.5 cursor-pointer group">
                <div className="w-14 h-14 rounded-full border-2 border-slate-200 group-hover:border-slate-900 p-0.5 transition-all overflow-hidden bg-slate-100 flex items-center justify-center">
                  {cat.img ? (
                    <SafeImage src={cat.img} alt={cat.name} className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <span className="text-sm font-black text-slate-400">{cat.name.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 max-w-[64px] truncate">{cat.name}</span>
              </div>
            ))}
          </div>
        </div>

        {searchOpen && (
          <div className="p-3 bg-white border-t border-slate-100 shadow-xl">
            <div className="relative max-w-7xl mx-auto">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full rounded-xl pl-10 pr-8 py-2.5 text-xs bg-slate-50 text-slate-900 border border-slate-200 focus:border-slate-900 outline-none font-medium"
              />
            </div>
            {searchQuery && (
              <div className="max-w-7xl mx-auto mt-2 text-[11px] text-slate-500">{filteredProducts.length} result(s)</div>
            )}
          </div>
        )}
      </header>

      {/* ── Mobile menu drawer ── */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 sm:hidden" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="absolute top-0 left-0 h-full w-72 bg-white p-6 flex flex-col gap-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-2xl font-serif font-black tracking-widest uppercase text-slate-900">{wordmark}</div>
            <nav className="flex flex-col gap-4">
              {['New Arrivals', 'Women', 'Men', 'Accessories', 'Sale'].map((item) => (
                <a key={item} href="#" onClick={(e) => e.preventDefault()} className="text-sm font-bold uppercase tracking-widest text-slate-700">{item}</a>
              ))}
            </nav>
            <button className="mt-auto text-sm font-bold text-slate-500" onClick={() => setIsMobileMenuOpen(false)}>Close</button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ── Custom hero banner — "The Summer Collection" + DISCOVER NOW ── */}
        <section
          className="relative h-[50vh] sm:h-[60vh] rounded-[2rem] overflow-hidden flex items-center justify-center text-center"
          style={{
            backgroundImage:
              'linear-gradient(to bottom right, rgba(15,23,42,0.55), rgba(15,23,42,0.82)), url(https://images.unsplash.com/photo-1519235106638-30cc49b5a5cd?auto=format&fit=crop&w=1600&q=80)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="relative z-10 max-w-2xl px-4">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[#E8D5C4] mb-3">The Summer Collection</p>
            <h2 className="text-3xl sm:text-5xl font-serif font-black text-white leading-tight">
              {wordmark}
              <span className="block text-sm font-medium text-[#D4B8A3] mt-2">Curated pieces for the modern connoisseur</span>
            </h2>
            <button
              onClick={() => document.getElementById('lux-products')?.scrollIntoView({ behavior: 'smooth' })}
              className="mt-6 bg-white text-slate-900 hover:bg-slate-100 font-black uppercase tracking-widest text-xs px-8 py-3.5 rounded-xl transition shadow-lg shadow-black/10 cursor-pointer"
            >
              DISCOVER NOW
            </button>
          </div>
        </section>

        {/* ── Unique luxury product card grid ── */}
        <section id="lux-products" className="mt-10 mb-10">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-serif font-black text-slate-900">Trending Now</h3>
            <a href="#" onClick={(e) => e.preventDefault()} className="text-sm font-bold text-slate-500 hover:text-slate-900 border-b border-transparent hover:border-slate-900 transition">View All</a>
          </div>
          {filteredProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
              <p className="text-sm font-bold text-slate-500">No products match your search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {filteredProducts.map((prod: any, i: number) => (
                <div key={safeStr(prod?.id, `lux-prod-${i}`)} className="group cursor-pointer">
                  <div className="relative aspect-[3/4] bg-slate-100 overflow-hidden rounded-xl mb-2.5">
                    {productImage(prod) ? (
                      <SafeImage src={productImage(prod)} alt={productTitle(prod)} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-200">
                        <span className="text-3xl font-serif font-black text-slate-300">{productTitle(prod).slice(0, 1).toUpperCase()}</span>
                      </div>
                    )}
                    {safeStr(prod?.badge) ? (
                      <span className="absolute top-1.5 left-1.5 z-10 text-[10px] font-black uppercase tracking-wider text-white bg-[#E8D5C4] px-1.5 py-0.5 rounded">{safeStr(prod?.badge)}</span>
                    ) : Number(prod?.stock) === 0 ? (
                      <span className="absolute top-1.5 left-1.5 z-10 text-[10px] font-black uppercase tracking-wider text-white bg-slate-500 px-1.5 py-0.5 rounded">Sold Out</span>
                    ) : null}
                    <div className="absolute inset-x-0 bottom-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/60 to-transparent">
                      <button className="w-full bg-white text-slate-950 font-black text-xs py-2.5 uppercase tracking-widest hover:bg-slate-100 transition cursor-pointer">
                        Quick Add
                      </button>
                    </div>
                  </div>
                  <h4 className="font-semibold text-sm text-slate-900 mb-0.5">{productTitle(prod)}</h4>
                  <p className="text-xs font-bold text-slate-500">{'\u09F3'} {productPrice(prod)}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        <p>{wordmark} {'\u00B7'} Luxury Boutique Storefront</p>
      </footer>
    </div>
  );
};

export default LuxuryBoutique;
