/**
 * Dynamic storefront headers — switched COMPLETELY by `activeThemeId`.
 * Luxury = light/white minimalist header. Every prop optional + safe.
 */
import React from 'react';
import { Menu, Search, ShoppingBag } from 'lucide-react';
import SafeImage from './SafeImage';
import { LanguageToggle } from './LanguageToggle';
import type { StorefrontThemeStyle } from './themes';

export interface LuxuryHeaderProps {
  storeName?: string | null;
  logoSrc?: string;
  logoHeight?: number;
  onLogoError?: () => void;
  navLinks?: Array<{ id: string | number; title: string; url: string }>;
  categories?: Array<any>;
  searchOpen?: boolean;
  searchQuery?: string;
  searchPlaceholder?: string;
  cartCount?: number;
  themeStyle?: StorefrontThemeStyle;
  sticky?: boolean;
  onHome?: () => void;
  onToggleMenu?: () => void;
  onToggleSearch?: () => void;
  onSearchChange?: (value: string) => void;
  onClearSearch?: () => void;
  onOpenCart?: () => void;
  onSelectCategory?: () => void;
}

const FALLBACK_NAV = [
  { id: 'n1', title: 'New Arrivals', url: '#' },
  { id: 'n2', title: 'Women', url: '#' },
  { id: 'n3', title: 'Men', url: '#' },
  { id: 'n4', title: 'Accessories', url: '#' },
  { id: 'n5', title: 'Sale', url: '#' },
];

const FALLBACK_CATS = [
  { id: 'c1', name: 'New', image: '' },
  { id: 'c2', name: 'Women', image: '' },
  { id: 'c3', name: 'Men', image: '' },
  { id: 'c4', name: 'Sale', image: '' },
];

export const LuxuryBoutiqueHeader: React.FC<LuxuryHeaderProps> = ({
  storeName,
  logoSrc,
  logoHeight = 28,
  onLogoError,
  navLinks,
  categories,
  searchOpen = false,
  searchQuery = '',
  searchPlaceholder = 'Search products...',
  cartCount = 0,
  themeStyle,
  sticky = true,
  onHome,
  onToggleMenu,
  onToggleSearch,
  onSearchChange,
  onClearSearch,
  onOpenCart,
  onSelectCategory,
}) => {
  const links = (Array.isArray(navLinks) && navLinks.length > 0 ? navLinks : FALLBACK_NAV).slice(0, 6);
  const cats = (Array.isArray(categories) && categories.length > 0 ? categories : FALLBACK_CATS).slice(0, 10);
  const wordmark = (storeName && storeName !== 'My Zid Store' ? storeName : themeStyle?.brandWordmark) || 'AURA';
  return (
    <header data-theme-header="luxury" className={`${sticky ? 'sticky top-0' : ''} z-40 bg-white text-slate-900 border-b border-slate-100 shadow-sm`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3">
        <button className="sm:hidden p-2 text-slate-900" onClick={onToggleMenu} aria-label="Menu">
          <Menu className="w-5 h-5" />
        </button>
        <div className="text-xl sm:text-2xl font-serif font-black tracking-widest uppercase text-slate-900 cursor-pointer truncate" onClick={onHome}>
          {logoSrc ? (
            <img src={logoSrc} alt={wordmark} style={{ height: logoHeight }} className="object-contain" onError={onLogoError} />
          ) : (wordmark)}
        </div>
        <nav className="hidden sm:flex items-center gap-6">
          {links.map((link) => (
            <a key={String(link.id)} href={link.url} onClick={(e) => { e.preventDefault(); onHome?.(); }} className="text-xs font-bold text-slate-600 hover:text-slate-900 uppercase tracking-widest transition whitespace-nowrap">
              {link.title}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-3">
          <button onClick={onToggleSearch} className="p-2 text-slate-900 hover:bg-slate-50 rounded-full" aria-label="Search">
            <Search className="w-5 h-5" />
          </button>
          <LanguageToggle compact />
          <button onClick={onOpenCart} className="relative p-2 text-slate-900 hover:bg-slate-50 rounded-full" aria-label="Cart">
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (<span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white" />)}
          </button>
        </div>
      </div>
      {themeStyle?.showCategoryRail !== false && (
        <div className="bg-white border-t border-slate-100 py-3 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-4 px-4 max-w-7xl mx-auto min-w-max">
            {cats.map((cat: any, i: number) => {
              const label = String(cat?.name || cat?.title || `Category ${i + 1}`);
              const img = String(cat?.image || cat?.imageUrl || cat?.image_url || '');
              return (
                <div key={String(cat?.id || i)} className="flex flex-col items-center gap-1.5 cursor-pointer group" onClick={onSelectCategory}>
                  <div className="w-14 h-14 rounded-full border-2 border-slate-200 group-hover:border-slate-900 p-0.5 transition-all overflow-hidden bg-slate-100 flex items-center justify-center">
                    {img ? (<SafeImage src={img} alt={label} className="w-full h-full object-cover rounded-full" />) : (<span className="text-sm font-black text-slate-400">{label.slice(0, 1).toUpperCase()}</span>)}
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
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" autoFocus value={searchQuery} onChange={(e) => onSearchChange?.(e.target.value)} placeholder={searchPlaceholder} className="w-full rounded-xl pl-10 pr-8 py-2.5 text-xs bg-slate-50 text-slate-900 border border-slate-200 focus:border-slate-900 outline-none font-medium" />
            {searchQuery && (<button onClick={onClearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 text-xs font-bold">×</button>)}
          </div>
        </div>
      )}
    </header>
  );
};

export default LuxuryBoutiqueHeader;
