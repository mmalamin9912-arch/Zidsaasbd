/**
 * LuxuryBoutique — the dedicated premium boutique theme component.
 *
 * Decouples the FREE/Default Modern theme from premium themes so they share
 * ZERO layout code:
 *   - Light background (#F8FAFC), "AURA" wordmark header
 *   - Minimalist circular category rail
 *   - Clean "Trending Now" product grid (no flash timer, no gallery strip)
 *
 * The Default/Modern free theme lives in `./index.tsx` (DefaultModern) and is
 * intentionally UNCHANGED — this file only adds the new premium theme.
 *
 * Every value has a safe fallback so missing/undefined properties can never
 * crash the storefront.
 */
import React from 'react';
import { ShoppingCart } from 'lucide-react';
import SafeImage from '../SafeImage';
import { resolveThemeComponentLayout, type StorefrontThemeStyle } from './index';

const luxuryTokens = (accentColor?: string): React.CSSProperties => ({
  ['--primary-accent' as string]: accentColor || '#E8D5C4',
  ['--theme-primary' as string]: accentColor || '#E8D5C4',
  ['--luxury-surface' as string]: '#FFFFFF',
});

const FALLBACK_CATEGORIES: Array<{ id: string; name: string; img: string }> = [
  { id: 'c1', name: 'New', img: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=200&q=80' },
  { id: 'c2', name: 'Women', img: 'https://images.unsplash.com/photo-1576566192725-2d320e157a0c?auto=format&fit=crop&w=200&q=80' },
  { id: 'c3', name: 'Men', img: 'https://images.unsplash.com/photo-1590071850287-2b239144ba92?auto=format&fit=crop&w=200&q=80' },
  { id: 'c4', name: 'Sale', img: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=200&q=80' },
];

const FALLBACK_PRODUCTS: Array<{ title: string; price: string; img: string; badge?: string }> = [
  { title: 'Linen Wrap Dress', price: '4,500', img: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=600&q=80', badge: 'Bestseller' },
  { title: 'Leather Mini Bag', price: '8,900', img: 'https://images.unsplash.com/photo-1584916201218-f4242ceb4809?auto=format&fit=crop&w=600&q=80', badge: 'New' },
  { title: 'Pleated Midi Skirt', price: '3,200', img: 'https://images.unsplash.com/photo-1583496661160-c588c443c982?auto=format&fit=crop&w=600&q=80' },
  { title: 'Silk Camisole', price: '2,100', img: 'https://images.unsplash.com/photo-1532453288672-3a27e9be9efd?auto=format&fit=crop&w=600&q=80' },
  { title: 'Cashmere Sweater', price: '6,800', img: 'https://images.unsplash.com/photo-1576566192725-2d320e157a0c?auto=format&fit=crop&w=600&q=80', badge: 'Premium' },
  { title: 'Gold Hoop Earrings', price: '1,200', img: 'https://images.unsplash.com/photo-1572635190689-5c1754ec9cf2?auto=format&fit=crop&w=600&q=80' },
  { title: 'Wool Blazer', price: '12,500', img: 'https://images.unsplash.com/photo-1551882547-ff2c663b73c4?auto=format&fit=crop&w=600&q=80' },
  { title: 'Silk Scarf', price: '1,800', img: 'https://images.unsplash.com/photo-1583496661160-c588c443c982?auto=format&fit=crop&w=600&q=80' },
];

export const LuxuryBoutique: React.FC<{ accentColor?: string; storeName?: string }> = ({ accentColor, storeName }) => {
  const layout = resolveThemeComponentLayout({ name: 'Luxury Boutique' });
  const style: StorefrontThemeStyle = {
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
  };

  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [mobileTab, setMobileTab] = React.useState('home');
  const [cart] = React.useState<Array<{ id: string; quantity: number }>>([{ id: 'c1', quantity: 1 }, { id: 'c2', quantity: 2 }]);
  const [categories] = React.useState<Array<{ id: string; name: string; img?: string }>>(FALLBACK_CATEGORIES);

  const cartCount = (Array.isArray(cart) ? cart : []).reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0);
  const wordmark = storeName || style.brandWordmark || 'AURA';


  return (
    <div
      data-theme-component="LuxuryBoutique"
      data-layout={layout}
      className="min-h-screen w-full font-sans overflow-x-hidden bg-slate-50 text-slate-900"
      style={luxuryTokens(accentColor) as React.CSSProperties}
    >
      <header data-theme-header="luxury" className="sticky top-0 z-40 bg-white text-slate-900 border-b border-slate-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3">
          <button className="sm:hidden p-2 text-slate-900" onClick={() => setIsMobileMenuOpen(true)} aria-label="Menu">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="text-xl sm:text-3xl font-serif font-black tracking-[0.22em] uppercase text-slate-900 cursor-pointer">
            {wordmark}
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
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </button>
            <button className="relative p-2 text-slate-900 hover:bg-slate-50 rounded-full" aria-label="Cart">
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white" />
              )}
            </button>
          </div>
        </div>
        {style.showCategoryRail !== false && (
          <div className="bg-white border-t border-slate-100 py-3 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-4 px-4 max-w-7xl mx-auto min-w-max">
              {(Array.isArray(categories) && categories.length > 0 ? categories : FALLBACK_CATEGORIES).map((cat, i) => {
                const label = String(cat?.name || `Category ${i + 1}`);
                const img = String(cat?.img || '');
                return (
                  <div key={String(cat?.id || i)} className="flex flex-col items-center gap-1.5 cursor-pointer group">
                    <div className="w-14 h-14 rounded-full border-2 border-slate-200 group-hover:border-slate-900 p-0.5 transition-all overflow-hidden bg-slate-100 flex items-center justify-center">
                      {img ? (
                        <SafeImage src={img} alt={label} className="w-full h-full object-cover rounded-full" />
                      ) : (
                        <span className="text-sm font-black text-slate-400">{label.slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 max-w-[64px] truncate">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {searchOpen && (
          <div className="p-3 bg-white border-t border-slate-100 shadow-xl">
            <div className="relative max-w-7xl mx-auto">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input type="text" autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search products..." className="w-full rounded-xl pl-10 pr-8 py-2.5 text-xs bg-slate-50 text-slate-900 border border-slate-200 focus:border-slate-900 outline-none font-medium" />
            </div>
          </div>
        )}
      </header>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 sm:hidden" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="absolute top-0 left-0 h-full w-72 bg-white p-6 flex flex-col gap-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-2xl font-serif font-black tracking-widest uppercase text-slate-900">{wordmark}</div>
            <nav className="flex flex-col gap-4">
              {['New Arrivals', 'Women', 'Men', 'Accessories', 'Sale'].map((item) => (
                <a key={item} href="#" onClick={(e) => e.preventDefault()} className="text-sm font-bold uppercase tracking-widest text-slate-700">{item}</a>
              ))}
            </nav>
            <div className="mt-auto flex gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500">
              {['home', 'shop', 'account'].map((tab) => (
                <button key={tab} onClick={() => setMobileTab(tab)} className={mobileTab === tab ? 'text-slate-900' : ''}>{tab}</button>
              ))}
            </div>
            <button className="text-sm font-bold text-slate-500" onClick={() => setIsMobileMenuOpen(false)}>Close</button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <section className="relative h-[50vh] sm:h-[60vh] rounded-[2rem] overflow-hidden bg-slate-900 flex items-center justify-center text-center">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800" />
          <div className="relative z-10 max-w-2xl px-4">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[#E8D5C4] mb-3">The New Collection</p>
            <h2 className="text-3xl sm:text-5xl font-serif font-black text-white leading-tight">
              {storeName || 'Luxury Boutique'}
              <span className="block text-sm font-medium text-[#D4B8A3] mt-2">Curated pieces for the modern connoisseur</span>
            </h2>
            <button className="mt-6 bg-white text-slate-900 hover:bg-slate-100 font-black uppercase tracking-widest text-xs px-8 py-3.5 rounded-xl transition shadow-lg shadow-black/10">
              Discover Now
            </button>
          </div>
        </section>

        <section className="mt-10 mb-10">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-serif font-black text-slate-900">Trending Now</h3>
            <a href="#" onClick={(e) => e.preventDefault()} className="text-sm font-bold text-slate-500 hover:text-slate-900 border-b border-transparent hover:border-slate-900 transition">View All</a>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {FALLBACK_PRODUCTS.map((prod, i) => (
              <div key={i} className="group cursor-pointer">
                <div className="relative aspect-[3/4] bg-slate-100 overflow-hidden rounded-xl mb-2.5">
                  <SafeImage src={prod.img} alt={prod.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                  {prod.badge && (
                    <span className="absolute top-1.5 left-1.5 z-10 text-[10px] font-black uppercase tracking-wider text-white bg-[#E8D5C4] px-1.5 py-0.5 rounded">{prod.badge}</span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/60 to-transparent">
                    <button className="w-full bg-white text-slate-950 font-black text-xs py-2.5 uppercase tracking-widest hover:bg-slate-100 transition">
                      Quick Add
                    </button>
                  </div>
                </div>
                <h4 className="font-semibold text-sm text-slate-900 mb-0.5">{prod.title}</h4>
                <p className="text-xs font-bold text-slate-500">{'\u09F3'} {prod.price}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        <p>{wordmark} {'\u00B7'} Luxury Boutique Storefront</p>
      </footer>
    </div>
  );
};

export default LuxuryBoutique;
