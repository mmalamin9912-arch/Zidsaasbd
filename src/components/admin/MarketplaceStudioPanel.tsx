/**
 * MARKETPLACE STUDIO — the Super Admin control panel for the marketplace
 * front door (`MegaMarketplaceView`).
 *
 * Four sections, each writing straight to the `marketplace_config` collection
 * via /api/admin/marketplace/* :
 *
 *   1. Banners       — hero slider images, promo titles, CTA buttons, target links
 *   2. Categories    — the "shop by category" rail + tiles (add / edit / hide / order)
 *   3. Utility strip — "Deliver to all 64 districts", "Free delivery over ৳2,000"…
 *   4. Featured      — which products / vendors are highlighted, plus the deals strip
 *
 * Everything here is optimistic-then-verify: the local list updates immediately
 * and is replaced by the server's answer, so a failed write surfaces a toast
 * instead of silently pretending to have saved.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image as ImageIcon, Tag, LayoutList, Sparkles, Plus, Trash2, Save, Loader2,
  ChevronUp, ChevronDown, Eye, EyeOff, Search, X, Star, RefreshCw, Copy,
  MapPin, Truck, RotateCcw, ShieldCheck, BadgePercent, Store, Flame, ExternalLink,
} from 'lucide-react';
import SafeImage from '../SafeImage';
import { useToast } from '../ToastProvider';
import { readAndDownscaleImage } from '../../utils/imageUtils';
import {
  type MarketplaceBanner,
  type MarketplaceCategoryRow,
  type UtilityStripConfig,
  type UtilityStripItem,
  type FeaturedConfig,
  type AdminProductRow,
  fetchAdminBanners, saveBanner, removeBanner, reorderBanners,
  fetchAdminCategories, saveCategory, removeCategory, reorderCategories, seedCategories,
  fetchAdminStrip, saveStrip,
  fetchAdminFeatured, saveFeatured, searchProductsForPicker,
  EMPTY_FEATURED, EMPTY_STRIP,
} from '../../lib/marketplaceStorefrontApi';

/* ───────────────────────────── shared styles ───────────────────────────── */

const CARD = 'bg-[#181B26] border border-[#2E3548] rounded-2xl';
const INNER = 'bg-[#202533] border border-[#2E3548] rounded-xl';
const INPUT =
  'w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3 py-2.5 text-sm text-white ' +
  'focus:ring-2 focus:ring-indigo-500/50 outline-none placeholder:text-slate-600';
const LABEL = 'block text-[10px] uppercase font-black text-slate-500 mb-1.5';
const BTN_PRIMARY =
  'bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs ' +
  'flex items-center gap-2 transition shadow-lg shadow-indigo-600/20 cursor-pointer disabled:opacity-50';
const BTN_GHOST =
  'bg-[#202533] hover:bg-[#282E3F] text-slate-300 border border-[#3A435E] px-3 py-2 rounded-xl ' +
  'text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40';
const BTN_DANGER =
  'p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer';

type StudioSection = 'banners' | 'categories' | 'strip' | 'featured';

const GRADIENT_PRESETS: { label: string; value: string }[] = [
  { label: 'Indigo (default)', value: 'from-[#3b2fd6] via-[#5b4bff] to-[#8b5cf6]' },
  { label: 'Fashion amber', value: 'from-[#7c2d12] via-[#b45309] to-[#f59e0b]' },
  { label: 'Electronics navy', value: 'from-[#0f172a] via-[#1e293b] to-[#0ea5e9]' },
  { label: 'Emerald fresh', value: 'from-[#064e3b] via-[#047857] to-[#10b981]' },
  { label: 'Rose sale', value: 'from-[#7f1d1d] via-[#be123c] to-[#fb7185]' },
  { label: 'Royal purple', value: 'from-[#4c1d95] via-[#6d28d9] to-[#a78bfa]' },
  { label: 'Sunset', value: 'from-[#9a3412] via-[#ea580c] to-[#fbbf24]' },
  { label: 'Teal', value: 'from-[#134e4a] via-[#0f766e] to-[#2dd4bf]' },
];

const STRIP_ICONS: { value: string; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'MapPin', label: 'Location pin', Icon: MapPin },
  { value: 'Truck', label: 'Delivery truck', Icon: Truck },
  { value: 'RotateCcw', label: 'Returns', Icon: RotateCcw },
  { value: 'ShieldCheck', label: 'Verified', Icon: ShieldCheck },
  { value: 'BadgePercent', label: 'Discount', Icon: BadgePercent },
  { value: 'Store', label: 'Store', Icon: Store },
  { value: 'Flame', label: 'Deals', Icon: Flame },
];

const stripIcon = (name: string) => STRIP_ICONS.find((i) => i.value === name)?.Icon || MapPin;

const bdt = (value: number) => `৳${Math.round(Number(value) || 0).toLocaleString('en-US')}`;

/* ────────────────────────────── main panel ────────────────────────────── */

export const MarketplaceStudioPanel: React.FC = () => {
  const toast = useToast();
  const [section, setSection] = useState<StudioSection>('banners');
  const [loading, setLoading] = useState(true);

  // Banners
  const [banners, setBanners] = useState<MarketplaceBanner[]>([]);
  const [editingBanner, setEditingBanner] = useState<MarketplaceBanner | null>(null);
  const [savingBanner, setSavingBanner] = useState(false);

  // Categories
  const [categories, setCategories] = useState<MarketplaceCategoryRow[]>([]);
  const [newCategory, setNewCategory] = useState({ name: '', emoji: '🛍️' });

  // Utility strip
  const [strip, setStrip] = useState<UtilityStripConfig>(EMPTY_STRIP);
  const [savingStrip, setSavingStrip] = useState(false);

  // Featured
  const [featured, setFeatured] = useState<FeaturedConfig>(EMPTY_FEATURED);
  const [pinnedProducts, setPinnedProducts] = useState<AdminProductRow[]>([]);
  const [dealPreview, setDealPreview] = useState<AdminProductRow[]>([]);
  const [savingFeatured, setSavingFeatured] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerResults, setPickerResults] = useState<AdminProductRow[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [vendorInput, setVendorInput] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [b, c, s, f] = await Promise.all([
        fetchAdminBanners(),
        fetchAdminCategories(),
        fetchAdminStrip(),
        fetchAdminFeatured(),
      ]);
      setBanners(b);
      setCategories(c);
      setStrip(s);
      setFeatured(f.featured);
      setPinnedProducts(
        f.featured.productIds
          .map((id) => f.products.find((p) => p.id === id))
          .filter(Boolean) as AdminProductRow[]
      );
      setDealPreview(f.deals);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  /* ────────────────────────── banners ────────────────────────── */

  const blankBanner = (): MarketplaceBanner => ({
    id: '',
    eyebrow: 'PLATFORM PROMOTION',
    title: '',
    subtitle: '',
    cta: 'Shop now',
    gradient: GRADIENT_PRESETS[0].value,
    isActive: true,
    sortOrder: banners.length,
  });

  const handleSaveBanner = async () => {
    if (!editingBanner) return;
    if (!editingBanner.title.trim() && !editingBanner.image) {
      toast.error('Add a title or an image first');
      return;
    }
    setSavingBanner(true);
    const res = await saveBanner(editingBanner);
    setSavingBanner(false);
    if (!res.ok || !res.banner) {
      toast.error('Banner was NOT saved', { description: res.error || 'The database rejected the write.' });
      return;
    }
    setBanners((prev) => {
      const exists = prev.some((b) => b.id === res.banner!.id);
      return exists ? prev.map((b) => (b.id === res.banner!.id ? res.banner! : b)) : [...prev, res.banner!];
    });
    setEditingBanner(null);
    toast.success('Banner saved — live on the marketplace');
  };

  const handleDeleteBanner = async (banner: MarketplaceBanner) => {
    if (!window.confirm(`Delete the banner “${banner.title || banner.eyebrow || banner.id}”?`)) return;
    const previous = banners;
    setBanners((prev) => prev.filter((b) => b.id !== banner.id));
    const res = await removeBanner(banner.id);
    if (!res.ok) {
      setBanners(previous);
      toast.error('Banner was NOT deleted', { description: res.error });
      return;
    }
    toast.success('Banner deleted');
  };

  const toggleBanner = async (banner: MarketplaceBanner) => {
    const next = { ...banner, isActive: !banner.isActive };
    setBanners((prev) => prev.map((b) => (b.id === banner.id ? next : b)));
    const res = await saveBanner(next);
    if (!res.ok) {
      setBanners((prev) => prev.map((b) => (b.id === banner.id ? banner : b)));
      toast.error('Could not change visibility', { description: res.error });
    }
  };

  const moveBanner = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= banners.length) return;
    const next = [...banners];
    [next[index], next[target]] = [next[target], next[index]];
    const ordered = next.map((b, i) => ({ ...b, sortOrder: i }));
    setBanners(ordered);
    const res = await reorderBanners(ordered.map((b) => b.id));
    if (!res.ok) {
      toast.error('Order was not saved', { description: res.error });
      void loadAll();
    }
  };

  /* ───────────────────────── categories ───────────────────────── */

  const handleAddCategory = async () => {
    const name = newCategory.name.trim();
    if (!name) return;
    const res = await saveCategory({
      name,
      emoji: newCategory.emoji || '🛍️',
      isActive: true,
      isFeatured: true,
      sortOrder: categories.length,
    });
    if (!res.ok) {
      toast.error('Category was NOT saved', { description: res.error });
      return;
    }
    setCategories((prev) => [...prev, res.category!]);
    setNewCategory({ name: '', emoji: '🛍️' });
    toast.success(`“${name}” added to the marketplace rail`);
  };

  const patchCategory = async (category: MarketplaceCategoryRow, patch: Partial<MarketplaceCategoryRow>) => {
    const next = { ...category, ...patch };
    setCategories((prev) => prev.map((c) => (c.id === category.id ? next : c)));
    const res = await saveCategory(next);
    if (!res.ok) {
      setCategories((prev) => prev.map((c) => (c.id === category.id ? category : c)));
      toast.error('Category was NOT updated', { description: res.error });
    }
  };

  const renameCategory = async (category: MarketplaceCategoryRow, name: string) => {
    const clean = name.trim();
    if (!clean || clean === category.name) return;
    await patchCategory(category, { name: clean });
  };

  const handleDeleteCategory = async (category: MarketplaceCategoryRow) => {
    if (!window.confirm(`Remove “${category.name}” from the marketplace rail?\n\nProducts in this category are NOT deleted.`)) return;
    const previous = categories;
    setCategories((prev) => prev.filter((c) => c.id !== category.id));
    const res = await removeCategory(category.id);
    if (!res.ok) {
      setCategories(previous);
      toast.error('Category was NOT removed', { description: res.error });
      return;
    }
    toast.success('Category removed');
  };

  const moveCategory = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    const ordered = next.map((c, i) => ({ ...c, sortOrder: i }));
    setCategories(ordered);
    const res = await reorderCategories(ordered.map((c) => c.id));
    if (!res.ok) {
      toast.error('Order was not saved', { description: res.error });
      void loadAll();
    }
  };

  const handleSeedCategories = async () => {
    if (!window.confirm('Load the 10 suggested categories? Existing categories are kept.')) return;
    const res = await seedCategories();
    if (!res.ok) {
      toast.error('Suggested set was NOT loaded', { description: res.error });
      return;
    }
    setCategories(res.categories || []);
    toast.success('Suggested categories loaded');
  };

  /* ─────────────────────────── utility strip ─────────────────────────── */

  const patchStrip = (patch: Partial<UtilityStripConfig>) => setStrip((prev) => ({ ...prev, ...patch }));

  const patchStripItem = (id: string, patch: Partial<UtilityStripItem>) =>
    setStrip((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));

  const addStripItem = () =>
    setStrip((prev) => ({
      ...prev,
      items: [...prev.items, { id: `item-${Date.now()}`, icon: 'MapPin', text: '', isActive: true }],
    }));

  const removeStripItem = (id: string) =>
    setStrip((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== id) }));

  const handleSaveStrip = async () => {
    setSavingStrip(true);
    const res = await saveStrip(strip);
    setSavingStrip(false);
    if (!res.ok) {
      toast.error('Utility strip was NOT saved', { description: res.error });
      return;
    }
    toast.success('Utility strip saved — live on the marketplace');
  };

  /* ───────────────────────────── featured ───────────────────────────── */

  const pinnedIds = useMemo(() => featured.productIds, [featured.productIds]);

  const handleProductSearch = async () => {
    setPickerLoading(true);
    try {
      const rows = await searchProductsForPicker({ q: pickerQuery });
      setPickerResults(rows.filter((r) => !pinnedIds.includes(r.id)));
    } finally {
      setPickerLoading(false);
    }
  };

  useEffect(() => {
    if (section !== 'featured' || pickerResults.length > 0) return;
    let active = true;
    setPickerLoading(true);
    searchProductsForPicker({ q: '' })
      .then((rows) => { if (active) setPickerResults(rows.filter((r) => !pinnedIds.includes(r.id))); })
      .finally(() => { if (active) setPickerLoading(false); });
    return () => { active = false; };
    // Only seed the picker once, when the tab is first opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const pinProduct = (product: AdminProductRow) => {
    setFeatured((prev) => ({ ...prev, productIds: [...prev.productIds, product.id] }));
    setPinnedProducts((prev) => [...prev, product]);
    setPickerResults((prev) => prev.filter((p) => p.id !== product.id));
  };

  const unpinProduct = (id: string) => {
    setFeatured((prev) => ({ ...prev, productIds: prev.productIds.filter((pid) => pid !== id) }));
    setPinnedProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const movePinned = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= pinnedProducts.length) return;
    const next = [...pinnedProducts];
    [next[index], next[target]] = [next[target], next[index]];
    setPinnedProducts(next);
    setFeatured((prev) => ({ ...prev, productIds: next.map((p) => p.id) }));
  };

  const addVendorRef = () => {
    const ref = vendorInput.trim();
    if (!ref) return;
    if (featured.vendorRefs.some((v) => v.toLowerCase() === ref.toLowerCase())) {
      setVendorInput('');
      return;
    }
    setFeatured((prev) => ({ ...prev, vendorRefs: [...prev.vendorRefs, ref] }));
    setVendorInput('');
  };

  const removeVendorRef = (ref: string) =>
    setFeatured((prev) => ({ ...prev, vendorRefs: prev.vendorRefs.filter((v) => v !== ref) }));

  const handleSaveFeatured = async () => {
    setSavingFeatured(true);
    const res = await saveFeatured(featured);
    setSavingFeatured(false);
    if (!res.ok) {
      toast.error('Featured selection was NOT saved', { description: res.error });
      return;
    }
    toast.success('Featured & deals section saved');
    void loadAll();
  };

  /* ─────────────────────────────── render ─────────────────────────────── */

  const sections: { id: StudioSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'banners', label: 'Hero Banners', icon: ImageIcon },
    { id: 'categories', label: 'Categories', icon: LayoutList },
    { id: 'strip', label: 'Utility Strip', icon: Tag },
    { id: 'featured', label: 'Featured & Deals', icon: Sparkles },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white">Marketplace Studio</h3>
          <p className="text-xs text-slate-400">
            Control the public marketplace front door — hero banners, the category rail, the top
            utility strip and which products &amp; vendors get the spotlight.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void loadAll()} className={BTN_GHOST} disabled={loading}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
          <a href="/marketplace" target="_blank" rel="noreferrer" className={BTN_GHOST}>
            <ExternalLink className="w-3.5 h-3.5" /> View live
          </a>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-2">
        {sections.map((s) => {
          const Icon = s.icon;
          const active = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                active
                  ? 'bg-[#252B3B] text-[#D4AF37] border-[#D4AF37]/50'
                  : 'bg-[#181B26] text-slate-300 border-[#2E3548] hover:bg-[#202533] hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {s.label}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className={`${CARD} p-10 flex items-center justify-center gap-3 text-slate-400 text-sm`}>
          <Loader2 className="w-5 h-5 animate-spin" /> Loading marketplace configuration…
        </div>
      )}

      {/* ═══════════════ 1. BANNERS ═══════════════ */}
      {!loading && section === 'banners' && (
        <div className="space-y-4">
          <div className={`${CARD} p-5 flex flex-wrap items-center justify-between gap-3`}>
            <div>
              <h4 className="text-sm font-bold text-white">Hero slider &amp; promotions</h4>
              <p className="text-[11px] text-slate-400">
                These slides auto-rotate every 6 seconds at the top of the marketplace. Hidden
                banners stay saved but never render.
              </p>
            </div>
            <button type="button" onClick={() => setEditingBanner(blankBanner())} className={BTN_PRIMARY}>
              <Plus className="w-4 h-4" /> New banner
            </button>
          </div>

          {banners.length === 0 && (
            <div className={`${CARD} py-14 text-center`}>
              <ImageIcon className="w-9 h-9 mx-auto text-slate-600 mb-3" />
              <p className="text-sm font-bold text-slate-300">No banners yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Create one to replace the built-in platform slides.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {banners.map((banner, index) => (
              <div key={banner.id} className={`${CARD} overflow-hidden`}>
                {/* Slide preview */}
                <div className={`relative flex min-h-[128px] flex-col justify-center gap-1 bg-gradient-to-r ${banner.gradient} px-5 py-4 ${banner.isActive ? '' : 'grayscale opacity-60'}`}>
                  {banner.image && (
                    <SafeImage
                      src={banner.image}
                      alt={banner.title || 'Banner'}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  {banner.image && <div className="absolute inset-0 bg-slate-900/45" />}
                  <div className="relative z-10">
                    {banner.eyebrow && (
                      <div className={`text-[9px] font-black uppercase tracking-[0.2em] ${banner.accentText || 'text-white/80'}`}>
                        {banner.eyebrow}
                      </div>
                    )}
                    <div className="text-[15px] font-black leading-tight text-white">
                      {banner.title || 'Untitled banner'}
                    </div>
                    {banner.subtitle && (
                      <div className="text-[11px] text-white/85 line-clamp-2">{banner.subtitle}</div>
                    )}
                    {banner.cta && (
                      <span className="mt-2 inline-flex rounded-md bg-amber-400 px-2.5 py-1 text-[10px] font-black text-slate-900">
                        {banner.cta}
                      </span>
                    )}
                  </div>
                  {!banner.isActive && (
                    <span className="absolute right-2 top-2 rounded-md bg-slate-900/80 px-2 py-0.5 text-[9px] font-black uppercase text-white">
                      Hidden
                    </span>
                  )}
                </div>

                <div className="p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="rounded bg-[#202533] px-2 py-0.5 font-bold text-slate-300">
                      Position {index + 1}
                    </span>
                    {banner.category ? (
                      <span className="rounded bg-indigo-500/15 px-2 py-0.5 font-bold text-indigo-300">
                        → category: {banner.category}
                      </span>
                    ) : banner.search ? (
                      <span className="rounded bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-300">
                        → search: {banner.search}
                      </span>
                    ) : (
                      <span className="rounded bg-[#202533] px-2 py-0.5 font-bold text-slate-500">
                        → all products
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-1">
                    <div className="flex gap-1">
                      <button type="button" onClick={() => void moveBanner(index, -1)} disabled={index === 0} className={BTN_DANGER} title="Move up">
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => void moveBanner(index, 1)} disabled={index === banners.length - 1} className={BTN_DANGER} title="Move down">
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => void toggleBanner(banner)} className={BTN_DANGER} title={banner.isActive ? 'Hide' : 'Show'}>
                        {banner.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button type="button" onClick={() => {
                        setEditingBanner({ ...banner, id: '' });
                      }} className={BTN_DANGER} title="Duplicate">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => setEditingBanner(banner)} className={BTN_GHOST}>
                        Edit
                      </button>
                      <button type="button" onClick={() => void handleDeleteBanner(banner)} className={BTN_DANGER} title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Banner editor modal */}
      {editingBanner && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className={`${CARD} my-8 w-full max-w-3xl p-6 space-y-5`}>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">
                {editingBanner.id ? 'Edit banner' : 'New banner'}
              </h4>
              <button type="button" onClick={() => setEditingBanner(null)} className={BTN_DANGER}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className={`${INNER} p-4 grid grid-cols-1 md:grid-cols-2 gap-4`}>
              <div>
                <label className={LABEL}>Eyebrow (small kicker)</label>
                <input
                  className={INPUT}
                  value={editingBanner.eyebrow}
                  onChange={(e) => setEditingBanner({ ...editingBanner, eyebrow: e.target.value })}
                  placeholder="MEGA MARKETPLACE SALE"
                />
              </div>
              <div>
                <label className={LABEL}>Button label</label>
                <input
                  className={INPUT}
                  value={editingBanner.cta}
                  onChange={(e) => setEditingBanner({ ...editingBanner, cta: e.target.value })}
                  placeholder="Shop the sale"
                />
              </div>
              <div className="md:col-span-2">
                <label className={LABEL}>Promotional title</label>
                <input
                  className={INPUT}
                  value={editingBanner.title}
                  onChange={(e) => setEditingBanner({ ...editingBanner, title: e.target.value })}
                  placeholder="Up to 60% off across 1,000+ stores"
                />
              </div>
              <div className="md:col-span-2">
                <label className={LABEL}>Subtitle</label>
                <textarea
                  rows={2}
                  className={`${INPUT} resize-none`}
                  value={editingBanner.subtitle}
                  onChange={(e) => setEditingBanner({ ...editingBanner, subtitle: e.target.value })}
                  placeholder="One basket, many sellers — delivered nationwide with cash on delivery."
                />
              </div>
            </div>

            {/* Target link */}
            <div className={`${INNER} p-4 space-y-3`}>
              <h5 className="text-[11px] font-black uppercase text-slate-400">Button target</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Open a category (matches product category)</label>
                  <input
                    className={INPUT}
                    value={editingBanner.category || ''}
                    onChange={(e) => setEditingBanner({
                      ...editingBanner,
                      category: e.target.value || undefined,
                      search: e.target.value ? undefined : editingBanner.search,
                    })}
                    placeholder="e.g. fashion"
                  />
                </div>
                <div>
                  <label className={LABEL}>…or run a search instead</label>
                  <input
                    className={INPUT}
                    value={editingBanner.search || ''}
                    onChange={(e) => setEditingBanner({
                      ...editingBanner,
                      search: e.target.value || undefined,
                      category: e.target.value ? undefined : editingBanner.category,
                    })}
                    placeholder="e.g. saree"
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-500">
                Leave both empty to send the shopper to all products.
              </p>
            </div>

            {/* Visuals */}
            <div className={`${INNER} p-4 space-y-3`}>
              <h5 className="text-[11px] font-black uppercase text-slate-400">Background</h5>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {GRADIENT_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setEditingBanner({ ...editingBanner, gradient: preset.value })}
                    className={`rounded-lg border p-1 text-left transition ${
                      editingBanner.gradient === preset.value ? 'border-[#D4AF37]' : 'border-[#2E3548] hover:border-slate-500'
                    }`}
                  >
                    <span className={`block h-8 rounded bg-gradient-to-r ${preset.value}`} />
                    <span className="mt-1 block text-[9px] font-bold text-slate-400">{preset.label}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className={LABEL}>Hero image (optional)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        const dataUrl = await readAndDownscaleImage(file, 1600);
                        if (dataUrl) setEditingBanner({ ...editingBanner, image: dataUrl });
                      }}
                      className="w-full text-[11px] text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-[#2E3548] file:text-white hover:file:bg-[#3A435E] cursor-pointer"
                    />
                    {editingBanner.image && (
                      <button
                        type="button"
                        onClick={() => setEditingBanner({ ...editingBanner, image: undefined })}
                        className={BTN_DANGER}
                        title="Remove image"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Images are downscaled to 1600px before saving. Without one, the gradient is used.
                  </p>
                </div>
                <div>
                  <label className={LABEL}>Kicker colour</label>
                  <select
                    className={INPUT}
                    value={editingBanner.accentText || ''}
                    onChange={(e) => setEditingBanner({ ...editingBanner, accentText: e.target.value || undefined })}
                  >
                    <option value="">Default (white 80%)</option>
                    <option value="text-amber-300">Amber</option>
                    <option value="text-amber-100">Amber light</option>
                    <option value="text-sky-300">Sky</option>
                    <option value="text-emerald-200">Emerald</option>
                    <option value="text-rose-200">Rose</option>
                  </select>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-bold text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={editingBanner.isActive}
                onChange={(e) => setEditingBanner({ ...editingBanner, isActive: e.target.checked })}
                className="h-4 w-4 accent-indigo-500"
              />
              Visible on the marketplace
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditingBanner(null)} className={BTN_GHOST}>
                Cancel
              </button>
              <button type="button" onClick={() => void handleSaveBanner()} className={BTN_PRIMARY} disabled={savingBanner}>
                {savingBanner ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save banner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ 2. CATEGORIES ═══════════════ */}
      {!loading && section === 'categories' && (
        <div className="space-y-4">
          <div className={`${CARD} p-5 space-y-4`}>
            <div>
              <h4 className="text-sm font-bold text-white">Shop by category</h4>
              <p className="text-[11px] text-slate-400">
                Controls the top category rail and the “Shop by category” tiles. The product count on
                each tile is still computed live from the catalogue — hiding a category here removes
                it from the rail but never deletes products.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                className={`${INPUT} flex-1 min-w-[180px]`}
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAddCategory(); } }}
                placeholder="New category name (must match product category)"
              />
              <input
                className={`${INPUT} w-20 text-center`}
                value={newCategory.emoji}
                onChange={(e) => setNewCategory({ ...newCategory, emoji: e.target.value })}
                maxLength={4}
                aria-label="Category emoji"
              />
              <button type="button" onClick={() => void handleAddCategory()} className={BTN_PRIMARY}>
                <Plus className="w-4 h-4" /> Add
              </button>
              <button type="button" onClick={() => void handleSeedCategories()} className={BTN_GHOST}>
                Load suggested set
              </button>
            </div>
          </div>

          {categories.length === 0 ? (
            <div className={`${CARD} py-14 text-center`}>
              <LayoutList className="w-9 h-9 mx-auto text-slate-600 mb-3" />
              <p className="text-sm font-bold text-slate-300">No categories configured</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                The marketplace is currently falling back to the categories found in product data.
                Add categories here to control their order, artwork and visibility.
              </p>
            </div>
          ) : (
            <div className={`${CARD} divide-y divide-[#2E3548]`}>
              {categories.map((category, index) => (
                <div key={category.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => void moveCategory(index, -1)} disabled={index === 0} className={BTN_DANGER} title="Move up">
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => void moveCategory(index, 1)} disabled={index === categories.length - 1} className={BTN_DANGER} title="Move down">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f2f4ff] text-lg overflow-hidden">
                    {category.image
                      ? <SafeImage src={category.image} alt={category.name} className="h-full w-full object-cover" />
                      : (category.emoji || '🛍️')}
                  </div>

                  <input
                    defaultValue={category.emoji || ''}
                    onBlur={(e) => void patchCategory(category, { emoji: e.target.value || undefined })}
                    className="w-14 rounded-lg border border-[#3A435E] bg-[#181B26] px-2 py-1.5 text-center text-sm text-white"
                    maxLength={4}
                    aria-label="Emoji"
                  />

                  <input
                    defaultValue={category.name}
                    onBlur={(e) => void renameCategory(category, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="min-w-[140px] flex-1 rounded-lg border border-[#3A435E] bg-[#181B26] px-3 py-1.5 text-sm text-white"
                    aria-label="Category name"
                  />

                  <button
                    type="button"
                    onClick={() => void patchCategory(category, { isFeatured: !category.isFeatured })}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase transition cursor-pointer ${
                      category.isFeatured
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-[#202533] text-slate-500 border border-[#2E3548]'
                    }`}
                    title="Show in the featured category tiles"
                  >
                    <Star className="w-3 h-3" /> Featured
                  </button>

                  <button
                    type="button"
                    onClick={() => void patchCategory(category, { isActive: !category.isActive })}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase transition cursor-pointer ${
                      category.isActive
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-[#202533] text-slate-500 border border-[#2E3548]'
                    }`}
                  >
                    {category.isActive ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    {category.isActive ? 'Visible' : 'Hidden'}
                  </button>

                  <button type="button" onClick={() => void handleDeleteCategory(category)} className={BTN_DANGER} title="Remove">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ 3. UTILITY STRIP ═══════════════ */}
      {!loading && section === 'strip' && (
        <div className="space-y-4">
          <div className={`${CARD} p-5 space-y-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-white">Top utility strip</h4>
                <p className="text-[11px] text-slate-400">
                  The thin bar above the marketplace header (desktop only). Each item carries an icon
                  and a short promise.
                </p>
              </div>
              <button
                type="button"
                onClick={() => patchStrip({ isActive: !strip.isActive })}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition cursor-pointer ${
                  strip.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#202533] text-slate-500'
                }`}
              >
                {strip.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {strip.isActive ? 'Strip visible' : 'Strip hidden'}
              </button>
            </div>

            {/* Live preview */}
            <div className="rounded-xl bg-[#2a219d] px-4 py-2 text-white">
              <div className="flex flex-wrap items-center justify-between gap-3 text-[11px]">
                <div className="flex flex-wrap items-center gap-4">
                  {strip.items.filter((i) => i.isActive && i.text).map((item) => {
                    const Icon = stripIcon(item.icon);
                    return (
                      <span key={item.id} className="flex items-center gap-1">
                        <Icon className="w-3 h-3" /> {item.text}
                      </span>
                    );
                  })}
                  {strip.items.filter((i) => i.isActive && i.text).length === 0 && (
                    <span className="text-white/60 italic">No items enabled — the strip will be hidden.</span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span>{strip.sellLabel}</span>
                  <span>{strip.merchantLoginLabel}</span>
                  <span>{strip.phone}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {strip.items.map((item) => {
                const Icon = stripIcon(item.icon);
                return (
                  <div key={item.id} className={`${INNER} flex flex-wrap items-center gap-2 p-2.5`}>
                    <select
                      value={item.icon}
                      onChange={(e) => patchStripItem(item.id, { icon: e.target.value })}
                      className="rounded-lg border border-[#3A435E] bg-[#181B26] px-2 py-1.5 text-xs text-white"
                      aria-label="Icon"
                    >
                      {STRIP_ICONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef0ff]">
                      <Icon className="h-4 w-4 text-[#3b2fd6]" />
                    </span>
                    <input
                      value={item.text}
                      onChange={(e) => patchStripItem(item.id, { text: e.target.value })}
                      placeholder="Deliver to all 64 districts"
                      className="min-w-[180px] flex-1 rounded-lg border border-[#3A435E] bg-[#181B26] px-3 py-1.5 text-sm text-white"
                      aria-label="Item text"
                    />
                    <button
                      type="button"
                      onClick={() => patchStripItem(item.id, { isActive: !item.isActive })}
                      className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase transition cursor-pointer ${
                        item.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#181B26] text-slate-500'
                      }`}
                    >
                      {item.isActive ? 'On' : 'Off'}
                    </button>
                    <button type="button" onClick={() => removeStripItem(item.id)} className={BTN_DANGER} title="Remove item">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              <button type="button" onClick={addStripItem} className={BTN_GHOST}>
                <Plus className="w-3.5 h-3.5" /> Add strip item
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-[#2E3548]">
              <div>
                <label className={LABEL}>“Sell” link label</label>
                <input className={INPUT} value={strip.sellLabel} onChange={(e) => patchStrip({ sellLabel: e.target.value })} />
              </div>
              <div>
                <label className={LABEL}>Merchant login label</label>
                <input className={INPUT} value={strip.merchantLoginLabel} onChange={(e) => patchStrip({ merchantLoginLabel: e.target.value })} />
              </div>
              <div>
                <label className={LABEL}>Hotline number</label>
                <input className={INPUT} value={strip.phone} onChange={(e) => patchStrip({ phone: e.target.value })} />
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={() => void handleSaveStrip()} className={BTN_PRIMARY} disabled={savingStrip}>
                {savingStrip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save utility strip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ 4. FEATURED & DEALS ═══════════════ */}
      {!loading && section === 'featured' && (
        <div className="space-y-4">
          {/* Pinned products */}
          <div className={`${CARD} p-5 space-y-4`}>
            <div>
              <h4 className="text-sm font-bold text-white">Featured products</h4>
              <p className="text-[11px] text-slate-400">
                Pinned products appear first, in this exact order, in the marketplace “Featured picks”
                strip. Any gaps are filled automatically from your highlighted vendors.
              </p>
            </div>

            {pinnedProducts.length === 0 ? (
              <div className={`${INNER} py-8 text-center text-xs text-slate-500`}>
                Nothing pinned yet — the strip falls back to your highlighted vendors, then to best sellers.
              </div>
            ) : (
              <div className="space-y-2">
                {pinnedProducts.map((product, index) => (
                  <div key={product.id} className={`${INNER} flex items-center gap-3 p-2`}>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => movePinned(index, -1)} disabled={index === 0} className={BTN_DANGER}>
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => movePinned(index, 1)} disabled={index === pinnedProducts.length - 1} className={BTN_DANGER}>
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                    <SafeImage src={product.image} alt={product.title} className="h-10 w-10 shrink-0 rounded-lg border border-[#2E3548] object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold text-white">{product.title}</div>
                      <div className="truncate text-[10px] text-slate-500">
                        {bdt(product.price)}{product.vendor_name ? ` · ${product.vendor_name}` : ''}{product.category ? ` · ${product.category}` : ''}
                      </div>
                    </div>
                    <button type="button" onClick={() => unpinProduct(product.id)} className={BTN_DANGER} title="Unpin">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Picker */}
            <div className={`${INNER} p-3 space-y-3`}>
              <div className="flex gap-2">
                <input
                  className={`${INPUT} flex-1`}
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleProductSearch(); } }}
                  placeholder="Search products by title, SKU or brand…"
                />
                <button type="button" onClick={() => void handleProductSearch()} className={BTN_PRIMARY} disabled={pickerLoading}>
                  {pickerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Search
                </button>
              </div>

              <div className="max-h-72 space-y-1 overflow-y-auto">
                {pickerResults.length === 0 && !pickerLoading && (
                  <div className="py-4 text-center text-[11px] text-slate-500">No products match.</div>
                )}
                {pickerResults.map((product) => (
                  <div key={product.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-[#181B26]">
                    <SafeImage src={product.image} alt={product.title} className="h-9 w-9 shrink-0 rounded-md border border-[#2E3548] object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11.5px] font-semibold text-slate-200">{product.title}</div>
                      <div className="truncate text-[10px] text-slate-500">
                        {bdt(product.price)}{product.vendor_name ? ` · ${product.vendor_name}` : ''}
                      </div>
                    </div>
                    <button type="button" onClick={() => pinProduct(product)} className={BTN_GHOST}>
                      <Plus className="w-3.5 h-3.5" /> Pin
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Highlighted vendors */}
          <div className={`${CARD} p-5 space-y-4`}>
            <div>
              <h4 className="text-sm font-bold text-white">Highlighted vendors</h4>
              <p className="text-[11px] text-slate-400">
                Vendor store slug, ZID-BD code or store UUID. Products from these sellers fill the
                featured strip when you have not pinned enough products.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                className={`${INPUT} flex-1 min-w-[200px]`}
                value={vendorInput}
                onChange={(e) => setVendorInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVendorRef(); } }}
                placeholder="e.g. dhaka-weaves or ZID-BD-0042"
              />
              <button type="button" onClick={addVendorRef} className={BTN_PRIMARY}>
                <Plus className="w-4 h-4" /> Add vendor
              </button>
            </div>
            {featured.vendorRefs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {featured.vendorRefs.map((ref) => (
                  <span key={ref} className="flex items-center gap-1.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 px-3 py-1 text-[11px] font-bold text-indigo-300">
                    <Store className="w-3 h-3" /> {ref}
                    <button type="button" onClick={() => removeVendorRef(ref)} className="hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Strip headings + deals */}
          <div className={`${CARD} p-5 space-y-4`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className={`${INNER} p-4 space-y-3`}>
                <h5 className="text-[11px] font-black uppercase text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Featured strip copy
                </h5>
                <div>
                  <label className={LABEL}>Title</label>
                  <input className={INPUT} value={featured.featuredTitle} onChange={(e) => setFeatured({ ...featured, featuredTitle: e.target.value })} />
                </div>
                <div>
                  <label className={LABEL}>Subtitle</label>
                  <input className={INPUT} value={featured.featuredSubtitle} onChange={(e) => setFeatured({ ...featured, featuredSubtitle: e.target.value })} />
                </div>
                <div>
                  <label className={LABEL}>Max products</label>
                  <input
                    type="number"
                    min={1}
                    max={48}
                    className={INPUT}
                    value={featured.featuredLimit}
                    onChange={(e) => setFeatured({ ...featured, featuredLimit: Number(e.target.value) || 12 })}
                  />
                </div>
              </div>

              <div className={`${INNER} p-4 space-y-3`}>
                <div className="flex items-center justify-between">
                  <h5 className="text-[11px] font-black uppercase text-slate-400 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5" /> Deals section
                  </h5>
                  <button
                    type="button"
                    onClick={() => setFeatured({ ...featured, dealsEnabled: !featured.dealsEnabled })}
                    className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase transition cursor-pointer ${
                      featured.dealsEnabled ? 'bg-rose-500/20 text-rose-400' : 'bg-[#181B26] text-slate-500'
                    }`}
                  >
                    {featured.dealsEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                <div>
                  <label className={LABEL}>Title</label>
                  <input className={INPUT} value={featured.dealsTitle} onChange={(e) => setFeatured({ ...featured, dealsTitle: e.target.value })} />
                </div>
                <div>
                  <label className={LABEL}>Subtitle</label>
                  <input className={INPUT} value={featured.dealsSubtitle} onChange={(e) => setFeatured({ ...featured, dealsSubtitle: e.target.value })} />
                </div>
                <div>
                  <label className={LABEL}>Max products</label>
                  <input
                    type="number"
                    min={1}
                    max={48}
                    className={INPUT}
                    value={featured.dealsLimit}
                    onChange={(e) => setFeatured({ ...featured, dealsLimit: Number(e.target.value) || 12 })}
                  />
                </div>
              </div>
            </div>

            {dealPreview.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="w-full text-[10px] font-black uppercase text-slate-500">
                  Auto-detected live deals ({dealPreview.length})
                </span>
                {dealPreview.slice(0, 8).map((p) => (
                  <span key={p.id} className="rounded-lg bg-[#202533] px-2 py-1 text-[10px] text-slate-400">
                    {p.title} · {bdt(p.price)}
                  </span>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button type="button" onClick={() => void handleSaveFeatured()} className={BTN_PRIMARY} disabled={savingFeatured}>
                {savingFeatured ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save featured &amp; deals
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketplaceStudioPanel;
