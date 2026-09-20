import React, { useState, useEffect } from 'react';
import { StoreSubTab, MerchantProfile, AdminPaymentGatewayConfig, ThemePurchaseRequest } from '../../types';
import { ThemeCustomizerModal } from '../ThemeCustomizerModal';
import { StorefrontPreviewModal } from '../StorefrontPreviewModal';
import SafeImage from '../SafeImage';
import {  readZidStoreData, writeZidStoreData } from '../../lib/storeData';
import {
  Palette, 
  Globe, 
  ExternalLink, 
  Check, 
  Eye, 
  MoreVertical, 
  Sparkles, 
  Rocket, 
  Search, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Compass, 
  Menu as MenuIcon, 
  Newspaper, 
  FileText, 
  HelpCircle, 
  Sliders, 
  Download, 
  Copy, 
  Edit3, 
  Code, 
  X,
  Layout,
  Layers,
  Image as ImageIcon,
  CheckCircle2,
  Lock,
  Clock,
  CreditCard,
  ShoppingBag,
  Building2,
  Smartphone,
  CheckCircle,
  AlertCircle,
  Upload,
  Save,
  Trash2
} from 'lucide-react';

interface OnlineStoreViewProps {
  onOpenStorefrontPreview: () => void;
  activeSubTab?: StoreSubTab;
  onSelectSubTab?: (subTab: StoreSubTab) => void;
  merchant: MerchantProfile;
  setMerchant: React.Dispatch<React.SetStateAction<MerchantProfile>>;
  adminPaymentConfig?: AdminPaymentGatewayConfig;
  themePurchaseRequests?: ThemePurchaseRequest[];
  onAddThemePurchaseRequest?: (req: ThemePurchaseRequest) => void;
  isPremiumPlan: boolean;
  onOpenSubscriptionModal: () => void;
  /** Active themes published by the Super Admin (from /api/admin/themes). */
  platformThemes?: Array<Record<string, any>>;
}

export interface ThemeMarketItem {
  id: string;
  name: string;
  version: string;
  badge?: string;
  isFree: boolean;
  updatedAt: string;
  previewUrl: string;
  description: string;
  category: string;
}

export const themeCatalog: ThemeMarketItem[] = [
  {
    id: 'growth-1',
    name: 'Growth (Free Standard)',
    version: '1.0.0',
    badge: 'Standard Free',
    isFree: true,
    updatedAt: 'Updated on August 05, 2026',
    previewUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=600&q=80',
    description: 'Standard clean, fully responsive layout engineered for Bangladesh e-commerce with built-in bKash/Nagad badges and express checkout.',
    category: 'General E-Commerce'
  },
  {
    id: 'modern-gold-luxury',
    name: 'Modern Gold Luxury',
    version: '2.5.0',
    badge: 'Ultra Premium',
    isFree: false,
    updatedAt: 'Updated on August 06, 2026',
    previewUrl: 'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=600&q=80',
    description: 'Ultra-premium obsidian black & champagne gold layout with glowing product card hover effects and high-end boutique feel.',
    category: 'Luxury & Jewelry'
  },
  {
    id: 'supermarket-tech',
    name: 'Supermarket & Tech Mega-Store',
    version: '3.1.0',
    badge: 'Mega-Menu Store',
    isFree: false,
    updatedAt: 'Updated on August 07, 2026',
    previewUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80',
    description: 'Catch/Luzuk style layout with multi-category sidebars, mega-menu header, express delivery badges, flash deal countdowns, and quick-add buttons.',
    category: 'Supermarket & Tech'
  },
  {
    id: 'elegant-fashion',
    name: 'Elegant Fashion & Lifestyle',
    version: '2.2.0',
    badge: 'Boutique Hot',
    isFree: false,
    updatedAt: 'Updated on August 08, 2026',
    previewUrl: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=600&q=80',
    description: 'Boutique fashion theme featuring Instagram story-style category circles, floating quick cart drawers, social proof badges, and mobile-optimized checkout.',
    category: 'Fashion & Apparel'
  }
];

export const OnlineStoreView: React.FC<OnlineStoreViewProps> = ({
  onOpenStorefrontPreview,
  activeSubTab = 'themes',
  onSelectSubTab,
  merchant,
  setMerchant,
  adminPaymentConfig,
  themePurchaseRequests = [],
  onAddThemePurchaseRequest,
  isPremiumPlan,
  onOpenSubscriptionModal,
  platformThemes = [],
}) => {
  // Theme Manager States
  const [selectedThemeAction, setSelectedThemeAction] = useState<string | null>(null);
  const [showMarketModal, setShowMarketModal] = useState(false);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [themeToCustomize, setThemeToCustomize] = useState<ThemeMarketItem | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState<ThemeMarketItem | null>(null);
  const [activeMenuThemeId, setActiveMenuThemeId] = useState<string | null>(null);
  const [demoPreviewTheme, setDemoPreviewTheme] = useState<ThemeMarketItem | null>(null);

  // Landing Page Create Modal
  const [showCreateLPModal, setShowCreateLPModal] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [newPageSlug, setNewPageSlug] = useState('');

  // Subscription Upgrade Prompt Modal
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [upgradingForTheme, setUpgradingForTheme] = useState<ThemeMarketItem | null>(null);

  // Customizer Controls State
  const [themePrimaryColor, setThemePrimaryColor] = useState(
    merchant?.themeConfig?.primaryColor || merchant?.themeConfig?.themePrimaryColor || '#00D68F'
  );
  useEffect(() => {
    const saved = merchant?.themeConfig?.primaryColor || merchant?.themeConfig?.themePrimaryColor;
    if (typeof saved === 'string' && saved.trim()) setThemePrimaryColor(saved);
  }, [merchant?.themeConfig?.primaryColor, merchant?.themeConfig?.themePrimaryColor]);
  const [headerAnnouncement, setHeaderAnnouncement] = useState(merchant?.announcementText || '');
  const [storeLogo, setStoreLogo] = useState<string | null>(null);
  const [storeFavicon, setStoreFavicon] = useState<string | null>(null);
  const [showHeroBanner, setShowHeroBanner] = useState(true);

  // Theme Unlock Check Helpers
  const isThemeUnlocked = (theme: ThemeMarketItem) => {
    if (theme.isFree) return true; // Growth theme is free
    if (isPremiumPlan) return true; // All premium themes are unlocked for Pro/Enterprise users
    if (merchant?.activeThemeId === theme.id) return true;
    if (merchant?.unlockedThemeIds?.includes(theme.id)) return true;
    return false;
  };

  const handlePublishTheme = (theme: ThemeMarketItem) => {
    if (!isThemeUnlocked(theme)) {
      setUpgradingForTheme(theme);
      setShowUpgradePrompt(true);
      return;
    }

    // 1. Update local state → storefront re-renders with the new layout at once.
    setMerchant(prev => ({
      ...prev,
      activeThemeId: theme.id
    }));

    // 2. Persist the choice to the database immediately (Supabase-first / Mongo
    //    fallback via /api/stores/update) so it survives reloads and applies on
    //    every device — the live storefront reflects it the moment it's saved.
    const slug = merchant?.storeSlug || (merchant as any)?.store_slug;
    try {
      fetch('/api/stores/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant: {
            ...merchant,
            storeSlug: slug,
            activeThemeId: theme.id,
          },
        }),
      }).catch(err => console.warn('[OnlineStoreView] theme publish persist warning:', err));
    } catch (err) {
      console.warn('[OnlineStoreView] theme publish persist notice:', err);
    }

    // 3. Broadcast via the shared store so an open storefront tab updates live
    //    without a refresh.
    try {
      if (slug) {
        const existing = readZidStoreData(slug);
        writeZidStoreData({
          ...existing,
          merchant: { ...((existing?.merchant || {}) as MerchantProfile), activeThemeId: theme.id },
        }, slug);
      }
    } catch (err) {
      console.warn('[OnlineStoreView] theme publish broadcast notice:', err);
    }

    alert(`Theme "${theme.name}" is now live on your storefront!`);
  };

  // Effective catalogue = built-in market themes + any ACTIVE themes published
  // by the Super Admin. Admin themes are appended so a newly-created platform
  // theme becomes selectable here immediately (ids are de-duplicated).
  const mergedThemeCatalog: ThemeMarketItem[] = React.useMemo(() => {
    const byId = new Map<string, ThemeMarketItem>();
    for (const t of themeCatalog) byId.set(t.id, t);
    for (const raw of platformThemes || []) {
      const id = String(raw?.id || raw?.slug || '').trim();
      if (!id) continue;
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        name: String(raw?.name || raw?.title || 'Theme'),
        version: String(raw?.version || '1.0.0'),
        badge: raw?.badge ? String(raw.badge) : undefined,
        isFree: raw?.isFree === true || Number(raw?.priceBDT ?? raw?.price ?? 0) === 0,
        updatedAt: String(raw?.updatedAt || raw?.updated_at || 'Published by admin'),
        previewUrl: String(raw?.previewUrl || raw?.preview_url || raw?.thumbnailUrl || raw?.thumbnail_url || ''),
        description: String(raw?.description || `Theme: ${raw?.name || id}`),
        category: String(raw?.category || 'General'),
      });
    }
    return [...byId.values()];
  }, [platformThemes]);

  // Current active theme object
  const currentActiveTheme = mergedThemeCatalog.find(t => t.id === (merchant?.activeThemeId || 'growth-1')) || mergedThemeCatalog[0];

  // Landing Pages Data
  const [landingPages, setLandingPages] = useState<any[]>([]);

  // Blog Posts Data
  const [blogPosts, setBlogPosts] = useState<any[]>([]);
  const [showBlogModal, setShowBlogModal] = useState(false);
  const [editingPost, setEditingPost] = useState<any | null>(null);
  const [blogForm, setBlogForm] = useState({
    title: '',
    author: merchant?.storeName || '',
    content: '',
    coverImage: '' as string | null
  });

  const handleOpenBlogModal = (post: any | null = null) => {
    if (post) {
      setEditingPost(post);
      setBlogForm({
        title: post.title,
        author: post.author,
        content: post.content || '',
        coverImage: post.coverImage || null
      });
    } else {
      setEditingPost(null);
      setBlogForm({
        title: '',
        author: merchant?.storeName || '',
        content: '',
        coverImage: null
      });
    }
    setShowBlogModal(true);
  };

  const handleSaveBlogPost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!blogForm.title || !blogForm.author) return;

    if (editingPost) {
      setBlogPosts(prev => prev.map(p => p.id === editingPost.id ? {
        ...p,
        ...blogForm,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
      } : p));
    } else {
      const newPost = {
        id: Date.now(),
        ...blogForm,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
        status: 'Published',
        views: 0
      };
      setBlogPosts([newPost, ...blogPosts]);
    }
    setShowBlogModal(false);
  };

  const handleDeletePost = (id: number) => {
    if (confirm('Are you sure you want to delete this article?')) {
      setBlogPosts(prev => prev.filter(p => p.id !== id));
    }
  };

  // FAQ Manager States
  const [faqs, setFaqs] = useState<any[]>([]);
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [editingFaq, setEditingFaq] = useState<any | null>(null);
  const [faqForm, setFaqForm] = useState({ question: '', answer: '' });

  const handleOpenFaqModal = (faq: any | null = null) => {
    if (faq) {
      setEditingFaq(faq);
      setFaqForm({ question: faq.question, answer: faq.answer });
    } else {
      setEditingFaq(null);
      setFaqForm({ question: '', answer: '' });
    }
    setShowFaqModal(true);
  };

  const handleSaveFaq = (e: React.FormEvent) => {
    e.preventDefault();
    if (!faqForm.question || !faqForm.answer) return;

    if (editingFaq) {
      setFaqs(faqs.map(f => f.id === editingFaq.id ? { ...f, ...faqForm } : f));
    } else {
      setFaqs([...faqs, { id: Date.now(), ...faqForm }]);
    }
    setShowFaqModal(false);
  };

  const handleDeleteFaq = (id: number) => {
    if (confirm('Delete this FAQ item?')) {
      setFaqs(faqs.filter(f => f.id !== id));
    }
  };

  // Menu Manager States
  const [menuItems, setMenuItems] = useState([
    { id: 'm1', title: 'Home', url: '/' },
    { id: 'm2', title: 'New Arrivals', url: '/collections/new' },
    { id: 'm3', title: 'Sarees & Panjabi', url: '/collections/ethnic' },
    { id: 'm4', title: 'Flash Sale', url: '/sale' },
    { id: 'm5', title: 'Track Order', url: '/track' },
    { id: 'm6', title: 'Contact Us', url: '/contact' },
  ]);
  const [showAddMenuModal, setShowAddMenuModal] = useState(false);
  const [newMenuTitle, setNewMenuTitle] = useState('');
  const [newMenuUrl, setNewMenuUrl] = useState('');

  // Custom Pages State
  const [customPages, setCustomPages] = useState([
    { id: 1, title: `About ${merchant?.storeName || 'My Store'}`, slug: 'about-us', status: 'Published' },
    { id: 2, title: 'Return & Refund Policy', slug: 'return-policy', status: 'Published' },
    { id: 3, title: 'Shipping & Delivery Policy', slug: 'shipping-policy', status: 'Published' },
    { id: 4, title: 'Privacy Policy', slug: 'privacy-policy', status: 'Published' },
  ]);
  const [showAddPageModal, setShowAddPageModal] = useState(false);
  const [newPageForm, setNewPageForm] = useState({ title: '', slug: '', content: '' });

  const handleSaveBrand = () => {
    setMerchant(prev => ({
      ...prev,
      announcementText: headerAnnouncement,
      logoUrl: storeLogo || prev.logoUrl,
      themeConfig: {
        ...(prev.themeConfig || {}),
        announcementText: headerAnnouncement,
        announcementItems: headerAnnouncement ? [headerAnnouncement] : [],
        logoImageUrl: storeLogo || prev.themeConfig?.logoImageUrl,
        primaryColor: themePrimaryColor,
        themePrimaryColor,
      }
    }));
    alert('Brand identity and styling changes saved successfully!');
  };

  const handleSaveMenu = () => {
    setMerchant(prev => ({
      ...prev,
      themeConfig: {
        ...(prev.themeConfig || {}),
        menuItems: menuItems
      }
    }));
    alert('Navigation menu updated successfully!');
  };

  // SEO States
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [metaKeywords, setMetaKeywords] = useState('');
  const [ogImage, setOgImage] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation Ribbon */}
      <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-2 flex items-center gap-1 overflow-x-auto">
        {[
          { id: 'themes', label: 'Themes', icon: Palette },
          { id: 'landing_pages', label: 'Landing pages', icon: Compass },
          { id: 'brand', label: 'Brand', icon: Sparkles },
          { id: 'menu', label: 'Menu', icon: MenuIcon },
          { id: 'blog', label: 'Blog', icon: Newspaper },
          { id: 'pages', label: 'Pages', icon: FileText },
          { id: 'seo', label: 'SEO', icon: Search },
          { id: 'faqs', label: 'FAQs', icon: HelpCircle },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectSubTab && onSelectSubTab(tab.id as StoreSubTab)}
              className={`
                flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer
                ${isActive
                  ? 'bg-[#00D68F] text-slate-950 font-bold shadow-md shadow-[#00D68F]/20'
                  : 'text-slate-300 hover:text-white hover:bg-[#282E3F]'
                }
              `}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SUB-VIEW 1: THEMES DASHBOARD */}
      {activeSubTab === 'themes' && (
        <div className="space-y-6">
          {/* Top Bar Header */}
          <div className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-extrabold text-white">Themes</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage your live storefront theme, customize layouts, and explore Zid Theme Market.
              </p>
            </div>

            <button
              onClick={() => setShowMarketModal(true)}
              className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-extrabold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition cursor-pointer shadow-md shadow-[#00D68F]/20"
            >
              <Sparkles className="w-4 h-4 fill-slate-950" />
              <span>Discover all themes</span>
            </button>
          </div>

          {/* SECTION 1: Current theme */}
          <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Current theme</span>
                <span className="text-[10px] font-bold text-[#00D68F] bg-[#00D68F]/10 border border-[#00D68F]/30 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Live Storefront
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Your currently published live store theme.</p>
            </div>

            {/* Current Theme Card */}
            <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row gap-5 items-center">
              {/* Theme Preview Image Thumbnail */}
              <div className="relative w-full md:w-64 h-40 rounded-xl overflow-hidden border border-[#2E3548] shrink-0 group">
                <SafeImage
                  src={currentActiveTheme.previewUrl}
                  alt={currentActiveTheme.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-2 left-2 bg-[#00D68F] text-slate-950 text-[10px] font-extrabold px-2 py-0.5 rounded shadow">
                  Published
                </div>
                <button
                  onClick={onOpenStorefrontPreview}
                  className="absolute bottom-2 right-2 bg-black/70 hover:bg-black text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-white/20 flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5 text-[#00D68F]" />
                  <span>Preview</span>
                </button>
              </div>

              {/* Theme Info & Action Buttons */}
              <div className="flex-1 min-w-0 space-y-3 w-full">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-bold text-white">{currentActiveTheme.name}</h3>
                  <span className="text-xs font-mono text-slate-400">v{currentActiveTheme.version}</span>
                  {currentActiveTheme.isFree ? (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold px-2 py-0.5 rounded-full">
                      Free Theme
                    </span>
                  ) : (
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold px-2 py-0.5 rounded-full">
                      Premium Theme
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-400">
                  {currentActiveTheme.updatedAt}
                </p>

                <p className="text-xs text-slate-300 leading-relaxed bg-[#202533] p-3 rounded-xl border border-[#2E3548]">
                  {currentActiveTheme.description}
                </p>

                {/* Buttons */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button
                    onClick={() => setShowDetailsModal(currentActiveTheme)}
                    className="bg-[#282E3F] hover:bg-[#32394E] text-slate-200 text-xs font-semibold px-4 py-2 rounded-xl border border-[#3A435E] transition cursor-pointer"
                  >
                    View details
                  </button>

                  <button
                    onClick={() => setShowCustomizeModal(true)}
                    className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 text-xs font-extrabold px-4 py-2 rounded-xl transition cursor-pointer shadow-md shadow-[#00D68F]/20 flex items-center gap-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Customize Live Theme</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Theme library & Monetization */}
          <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Theme Catalog & Marketplace</span>
                  <span className="text-xs bg-[#00D68F]/10 text-[#00D68F] border border-[#00D68F]/30 px-2 py-0.5 rounded-md font-mono font-bold">
                    1 Free • 4 Premium
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Upgrade to a Professional or Enterprise plan to unlock all premium themes instantly.</p>
              </div>

              <button
                onClick={() => setShowMarketModal(true)}
                className="bg-[#282E3F] hover:bg-[#32394E] text-[#00D68F] border border-[#3A435E] font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Marketplace View</span>
              </button>
            </div>

            {/* Themes Grid / Table */}
            <div className="overflow-x-auto border border-[#2E3548] rounded-xl bg-[#181B26]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#202533] text-slate-400 font-semibold border-b border-[#2E3548]">
                  <tr>
                    <th className="p-3.5 w-20">Preview</th>
                    <th className="p-3.5">Theme name</th>
                    <th className="p-3.5">Category</th>
                    <th className="p-3.5">Access Status</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2E3548] text-slate-200">
                  {mergedThemeCatalog.map((t) => {
                    const unlocked = isThemeUnlocked(t);
                    const isActive = (merchant?.activeThemeId || 'growth-1') === t.id;

                    return (
                      <tr key={t.id} className="hover:bg-[#202533]/50 transition">
                        <td className="p-3">
                          <SafeImage 
                            src={t.previewUrl} 
                            alt={t.name} 
                            className="w-16 h-10 object-cover rounded-lg border border-[#2E3548]"
                          />
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-white flex items-center gap-2">
                            <span>{t.name}</span>
                            {t.badge && (
                              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-medium">
                                {t.badge}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">v{t.version}</div>
                        </td>
                        <td className="p-3 text-slate-300 font-medium">
                          {t.category}
                        </td>
                        <td className="p-3">
                          {isActive ? (
                            <span className="text-[11px] font-bold text-[#00D68F] bg-[#00D68F]/10 border border-[#00D68F]/30 px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Live Active</span>
                            </span>
                          ) : unlocked ? (
                            <span className="text-[11px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              <span>Unlocked</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700 inline-flex items-center gap-1">
                              <Lock className="w-3 h-3 text-amber-400" />
                              <span>Premium Locked</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            <button
                              onClick={() => setDemoPreviewTheme(t)}
                              className="bg-[#202533] hover:bg-[#282E3F] text-[#00D68F] border border-[#00D68F]/40 hover:border-[#00D68F] text-xs font-extrabold px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                              title="Open Live Interactive Demo Preview"
                            >
                              <Eye className="w-3.5 h-3.5 text-[#00D68F] animate-pulse" />
                              <span>Live Demo</span>
                            </button>

                            <button
                              onClick={() => setShowDetailsModal(t)}
                              className="bg-[#282E3F] hover:bg-[#32394E] text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#3A435E] transition cursor-pointer"
                            >
                              Details
                            </button>

                            {isActive ? (
                              <button
                                onClick={() => {
                                  setThemeToCustomize(t);
                                  setShowCustomizeModal(true);
                                }}
                                className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-extrabold text-xs px-3 py-1.5 rounded-lg transition cursor-pointer shadow-md"
                              >
                                Customize
                              </button>
                            ) : unlocked ? (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handlePublishTheme(t)}
                                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition cursor-pointer shadow-sm"
                                >
                                  Publish Theme
                                </button>
                                <button
                                  onClick={() => {
                                    setThemeToCustomize(t);
                                    setShowCustomizeModal(true);
                                  }}
                                  className="bg-[#282E3F] hover:bg-[#32394E] text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#3A435E] transition cursor-pointer"
                                >
                                  Customize
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setUpgradingForTheme(t);
                                  setShowUpgradePrompt(true);
                                }}
                                className="bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition cursor-pointer shadow-lg shadow-indigo-500/20 flex items-center gap-1.5"
                              >
                                <Lock className="w-3.5 h-3.5 shrink-0" />
                                <span>Unlock Premium Theme</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 pt-2 gap-3">
              <div className="flex items-center gap-2">
                <span>Rows per page:</span>
                <select className="bg-[#181B26] border border-[#2E3548] text-white px-2 py-1 rounded-lg font-mono">
                  <option value="5">5</option>
                  <option value="10">10</option>
                </select>
              </div>

              <div className="flex items-center gap-3">
                <span>1 - 4 of 4 themes</span>
                <div className="flex items-center gap-1">
                  <button disabled className="p-1.5 rounded-lg bg-[#181B26] border border-[#2E3548] text-slate-600 cursor-not-allowed">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button className="px-3 py-1 rounded-lg bg-[#00D68F] text-slate-950 font-bold text-xs">
                    1
                  </button>
                  <button disabled className="p-1.5 rounded-lg bg-[#181B26] border border-[#2E3548] text-slate-600 cursor-not-allowed">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: Custom themes / Theme Market Banner */}
          <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-white">Custom themes</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Zid Theme Market provides the ability to customize themes for your store
              </p>
            </div>

            {/* Banner card for premium unlocked themes */}
            <div className="bg-gradient-to-r from-purple-900/40 via-indigo-900/40 to-[#202533] border border-indigo-500/30 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl relative overflow-hidden">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-400/40 flex items-center justify-center shrink-0">
                  <Rocket className="w-8 h-8 text-[#00D68F] animate-bounce" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-extrabold text-white">
                    Unlock the power of the Professional package and get access to 150+ extra premium features! 🚀🔥
                  </h3>
                  <p className="text-xs text-slate-300">
                    Get full custom HTML/CSS editing, 1-click RTL Arabic & Bengali multi-language themes, and custom checkout fields with zero platform fees.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowMarketModal(true)}
                className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-extrabold px-6 py-3 rounded-xl text-xs whitespace-nowrap cursor-pointer shadow-lg shadow-[#00D68F]/30 shrink-0"
              >
                Upgrade to Professional
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: LANDING PAGES */}
      {activeSubTab === 'landing_pages' && (
        <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-extrabold text-white">Landing Pages Builder</h1>
              <p className="text-xs text-slate-400 mt-0.5">Create custom standalone high-converting campaign landing pages.</p>
            </div>
            <button 
              onClick={() => setShowCreateLPModal(true)}
              className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Landing Page</span>
            </button>
          </div>

          {landingPages.length > 0 ? (
            <div className="divide-y divide-[#2E3548] border border-[#2E3548] rounded-xl bg-[#181B26]">
              {landingPages.map((lp) => (
                <div key={lp.id} className="p-4 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-white text-sm">{lp.title}</div>
                    <div className="text-slate-400 font-mono mt-0.5">store.com.bd/pages/{lp.slug}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-slate-300 font-mono">{lp.views} Total Views</span>
                    <button className="bg-[#282E3F] hover:bg-[#32394E] text-slate-200 px-3 py-1.5 rounded-lg border border-[#3A435E]">
                      Edit Page
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#181B26] border border-[#2E3548] border-dashed rounded-2xl p-12 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-[#00D68F]/10 flex items-center justify-center">
                <Layout className="w-8 h-8 text-[#00D68F]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">No Landing Pages Yet</h3>
                <p className="text-xs text-slate-400 max-w-xs">
                  Create high-converting landing pages for your Eid campaigns, Flash sales, or special launches.
                </p>
              </div>
              <button 
                onClick={() => setShowCreateLPModal(true)}
                className="bg-[#282E3F] hover:bg-[#32394E] text-[#00D68F] border border-[#00D68F]/30 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create your first page</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* SUB-VIEW 3: BRAND CUSTOMIZATION */}
      {activeSubTab === 'brand' && (
        <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-6">
          <div>
            <h1 className="text-xl font-extrabold text-white">Brand Identity & Styling</h1>
            <p className="text-xs text-slate-400 mt-0.5">Configure store logo, primary brand color, and browser favicon.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="space-y-4 bg-[#181B26] p-4 rounded-xl border border-[#2E3548]">
              <label className="block text-slate-200 font-bold flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-indigo-400" />
                Store Logo
              </label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-[#202533] border border-[#2E3548] flex items-center justify-center overflow-hidden">
                  {storeLogo ? (
                    <SafeImage src={storeLogo} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-slate-600" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] cursor-pointer flex items-center gap-1.5 transition">
                      <Upload className="w-3 h-3" />
                      <span>Upload Logo</span>
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setStoreLogo(URL.createObjectURL(file));
                      }} />
                    </label>
                    {storeLogo && (
                      <button onClick={() => setStoreLogo(null)} className="text-red-400 hover:text-red-300 text-[10px] font-bold ml-1">Remove</button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500">Recommended: PNG or SVG with transparent background. Max 2MB.</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 bg-[#181B26] p-4 rounded-xl border border-[#2E3548]">
              <label className="block text-slate-200 font-bold flex items-center gap-2">
                <Globe className="w-4 h-4 text-amber-400" />
                Browser Favicon
              </label>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#202533] border border-[#2E3548] flex items-center justify-center overflow-hidden">
                  {storeFavicon ? (
                    <SafeImage src={storeFavicon} alt="Favicon" className="w-full h-full object-contain" />
                  ) : (
                    <Globe className="w-5 h-5 text-slate-600" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="bg-[#282E3F] hover:bg-[#32394E] text-slate-200 border border-[#3A435E] font-bold px-3 py-1.5 rounded-lg text-[10px] cursor-pointer flex items-center gap-1.5 transition">
                      <Upload className="w-3 h-3" />
                      <span>Upload Favicon</span>
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setStoreFavicon(URL.createObjectURL(file));
                      }} />
                    </label>
                    {storeFavicon && (
                      <button onClick={() => setStoreFavicon(null)} className="text-red-400 hover:text-red-300 text-[10px] font-bold ml-1">Remove</button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500">Format: .ico, .png, or .svg. 32x32px recommended.</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 bg-[#181B26] p-4 rounded-xl border border-[#2E3548]">
              <label className="block text-slate-200 font-bold">Primary Brand Accent Color</label>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  value={themePrimaryColor} 
                  onChange={(e) => setThemePrimaryColor(e.target.value)} 
                  className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                />
                <input 
                  type="text" 
                  value={themePrimaryColor} 
                  onChange={(e) => setThemePrimaryColor(e.target.value)}
                  className="bg-[#202533] border border-[#2E3548] text-white px-3 py-2 rounded-xl font-mono text-xs uppercase"
                />
              </div>
            </div>

            <div className="space-y-2 bg-[#181B26] p-4 rounded-xl border border-[#2E3548]">
              <label className="block text-slate-200 font-bold">Store Header Announcement Banner</label>
              <input 
                type="text" 
                value={headerAnnouncement} 
                onChange={(e) => setHeaderAnnouncement(e.target.value)}
                placeholder="🎉 Free Delivery across Bangladesh on Orders Over ৳2,000!"
                className="w-full bg-[#202533] border border-[#2E3548] text-white px-3 py-2 rounded-xl text-xs outline-none focus:border-indigo-500 transition"
              />
              <p className="text-[11px] text-slate-400">Displayed at top of store homepage.</p>
            </div>
          </div>

          <div className="pt-4 border-t border-[#2E3548] flex justify-end">
            <button 
              onClick={handleSaveBrand}
              className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-black px-6 py-3 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-[#00D68F]/20 transition transform active:scale-95 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      )}

      {/* SUB-VIEW 4: MENU */}
      {activeSubTab === 'menu' && (
        <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-extrabold text-white">Navigation Menus</h1>
              <p className="text-xs text-slate-400 mt-0.5">Customize main header navigation links and footer menu hierarchy.</p>
            </div>
            <button 
              onClick={() => setShowAddMenuModal(true)}
              className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Menu Item</span>
            </button>
          </div>

          <div className="space-y-2 text-xs">
            {menuItems.map((item, idx) => (
              <div key={item.id} className="p-3 bg-[#181B26] border border-[#2E3548] rounded-xl flex items-center justify-between text-slate-200">
                <div className="flex flex-col">
                  <span className="font-semibold text-sm">{item.title}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{item.url}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] bg-[#2E3548] text-slate-400 px-2 py-0.5 rounded uppercase tracking-wider font-bold">Position: {idx + 1}</span>
                  <button className="text-indigo-400 hover:text-indigo-300 transition font-medium">Edit Link</button>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-[#2E3548] flex justify-end">
            <button 
              onClick={handleSaveMenu}
              className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-black px-6 py-3 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-[#00D68F]/20 transition transform active:scale-95 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save Menu Configuration</span>
            </button>
          </div>
        </div>
      )}

      {/* SUB-VIEW 5: BLOG */}
      {activeSubTab === 'blog' && (
        <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-extrabold text-white">Store Blog & Content</h1>
              <p className="text-xs text-slate-400 mt-0.5">Publish articles, customer buying guides, and fashion news.</p>
            </div>
            <button 
              onClick={() => handleOpenBlogModal()}
              className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Write Article</span>
            </button>
          </div>

          {blogPosts.length > 0 ? (
            <div className="space-y-3">
              {blogPosts.map((post) => (
                <div key={post.id} className="p-4 bg-[#181B26] border border-[#2E3548] rounded-xl flex items-center justify-between text-xs transition hover:border-[#00D68F]/30 group">
                  <div className="flex items-center gap-4">
                    {post.coverImage ? (
                      <SafeImage src={post.coverImage} className="w-12 h-12 rounded-lg object-cover border border-[#2E3548]" alt="" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-[#202533] border border-[#2E3548] flex items-center justify-center text-slate-600">
                        <ImageIcon className="w-6 h-6" />
                      </div>
                    )}
                    <div>
                      <div className="font-bold text-white text-sm group-hover:text-[#00D68F] transition">{post.title}</div>
                      <div className="text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>By {post.author}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                        <span>{post.date}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="bg-[#00D68F]/10 text-[#00D68F] px-2.5 py-1 rounded-full font-bold text-[10px] mr-4">
                      {post.status}
                    </span>
                    <div className="flex items-center bg-[#202533] rounded-lg border border-[#2E3548] overflow-hidden">
                      <button 
                        onClick={() => alert(`Viewing published article: ${post.title}`)}
                        className="p-2 hover:bg-[#282E3F] text-slate-400 hover:text-white transition border-r border-[#2E3548]"
                        title="View Article"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleOpenBlogModal(post)}
                        className="p-2 hover:bg-[#282E3F] text-slate-400 hover:text-indigo-400 transition border-r border-[#2E3548]"
                        title="Edit Article"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeletePost(post.id)}
                        className="p-2 hover:bg-[#282E3F] text-slate-400 hover:text-red-400 transition"
                        title="Delete Article"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#181B26] border border-[#2E3548] border-dashed rounded-2xl p-16 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                <Newspaper className="w-8 h-8 text-indigo-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">No Blog Posts Yet</h3>
                <p className="text-xs text-slate-400 max-w-xs">
                  Start writing articles to drive more traffic to your store and improve your SEO on Google.
                </p>
              </div>
              <button 
                onClick={() => handleOpenBlogModal()}
                className="bg-[#282E3F] hover:bg-[#32394E] text-[#00D68F] border border-[#00D68F]/30 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Write your first article</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* SUB-VIEW 6: PAGES */}
      {activeSubTab === 'pages' && (
        <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-extrabold text-white">Custom Pages</h1>
              <p className="text-xs text-slate-400 mt-0.5">Manage About Us, Privacy Policy, Terms, and Delivery Policy pages.</p>
            </div>
            <button 
              onClick={() => setShowAddPageModal(true)}
              className="bg-[#00D68F] text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 hover:bg-[#00E699] transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Custom Page</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {customPages.map((page) => (
              <div key={page.id} className="p-4 bg-[#181B26] border border-[#2E3548] rounded-xl flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-white text-sm">{page.title}</div>
                    <div className="text-slate-500 font-mono text-[10px] mt-0.5">/pages/{page.slug}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${page.status === 'Published' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'}`}>
                    {page.status}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 pt-2 border-t border-[#2E3548]">
                  <button className="flex-1 bg-[#282E3F] hover:bg-[#32394E] text-indigo-400 font-bold py-2 rounded-lg transition text-[10px]">
                    Edit Page
                  </button>
                  <button 
                    onClick={() => {
                      const newStatus = page.status === 'Published' ? 'Draft' : 'Published';
                      setCustomPages(customPages.map(p => p.id === page.id ? { ...p, status: newStatus } : p));
                    }}
                    className="bg-[#282E3F] hover:bg-[#32394E] text-slate-300 font-bold px-3 py-2 rounded-lg transition text-[10px]"
                  >
                    {page.status === 'Published' ? 'Unpublish' : 'Publish'}
                  </button>
                  <button 
                    onClick={() => {
                      if (confirm('Delete this custom page?')) {
                        setCustomPages(customPages.filter(p => p.id !== page.id));
                      }
                    }}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold px-3 py-2 rounded-lg transition text-[10px]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-VIEW 7: SEO */}
      {activeSubTab === 'seo' && (
        <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-extrabold text-white">Storewide SEO & Search Engine Indexing</h1>
              <p className="text-xs text-slate-400 mt-0.5">Optimize store search results on Google Bangladesh.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                Google Indexing: Active
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="space-y-4">
              <div className="bg-[#181B26] p-4 rounded-xl border border-[#2E3548] space-y-2">
                <label className="block text-slate-200 font-bold flex items-center justify-between">
                  <span>Meta Title (Google Search Title)</span>
                  <span className="text-[10px] text-slate-500 font-normal">{metaTitle.length}/70 chars</span>
                </label>
                <input 
                  type="text" 
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  placeholder={`${merchant?.storeName || 'My Store'} - Best Online Shopping in Bangladesh`}
                  className="w-full bg-[#202533] border border-[#2E3548] text-white px-3 py-2.5 rounded-xl text-xs focus:border-indigo-500 outline-none transition"
                />
                <p className="text-[10px] text-slate-500 italic">This appears as the clickable link on Google results.</p>
              </div>

              <div className="bg-[#181B26] p-4 rounded-xl border border-[#2E3548] space-y-2">
                <label className="block text-slate-200 font-bold flex items-center justify-between">
                  <span>Meta Description</span>
                  <span className="text-[10px] text-slate-500 font-normal">{metaDescription.length}/160 chars</span>
                </label>
                <textarea 
                  rows={4}
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  placeholder={`Shop the latest collections at ${merchant?.storeName || 'My Store'}. We offer fast bKash checkout and nationwide COD delivery across Bangladesh.`}
                  className="w-full bg-[#202533] border border-[#2E3548] text-white p-3 rounded-xl text-xs focus:border-indigo-500 outline-none transition resize-none leading-relaxed"
                />
                <p className="text-[10px] text-slate-500 italic">A brief summary that helps users decide to click your link.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-[#181B26] p-4 rounded-xl border border-[#2E3548] space-y-2">
                <label className="block text-slate-200 font-bold">Meta Keywords</label>
                <input 
                  type="text" 
                  value={metaKeywords}
                  onChange={(e) => setMetaKeywords(e.target.value)}
                  placeholder="e.g. fashion, sarees, gadgets, dhaka, online shopping"
                  className="w-full bg-[#202533] border border-[#2E3548] text-white px-3 py-2.5 rounded-xl text-xs focus:border-indigo-500 outline-none transition"
                />
                <p className="text-[10px] text-slate-500 italic">Comma separated keywords relevant to your niche.</p>
              </div>

              <div className="bg-[#181B26] p-4 rounded-xl border border-[#2E3548] space-y-3">
                <label className="block text-slate-200 font-bold">Social Share Image (OG Image)</label>
                <div 
                  className={`
                    w-full h-32 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition cursor-pointer overflow-hidden relative
                    ${ogImage ? 'border-indigo-500/50' : 'border-[#2E3548] hover:border-slate-600'}
                  `}
                  onClick={() => {
                    const url = prompt('Enter Social Share Image URL (1200x630 recommended):');
                    if (url) setOgImage(url);
                  }}
                >
                  {ogImage ? (
                    <>
                      <SafeImage src={ogImage} className="w-full h-full object-cover" alt="OG Preview" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition flex items-center justify-center">
                        <span className="text-[10px] font-bold text-white bg-black/50 px-2 py-1 rounded">Change Image</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center">
                        <Upload className="w-4 h-4 text-indigo-400" />
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 text-center px-4">
                        Upload Image (Visible on FB/WhatsApp sharing)
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#2E3548] flex justify-end">
            <button 
              onClick={() => {
                alert('SEO Settings saved successfully! Your store will be re-indexed within 24-48 hours.');
              }}
              className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-black px-8 py-3 rounded-xl text-xs transition shadow-lg shadow-[#00D68F]/20 flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save SEO Settings</span>
            </button>
          </div>
        </div>
      )}

      {/* SUB-VIEW 8: FAQS */}
      {activeSubTab === 'faqs' && (
        <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-extrabold text-white">Frequently Asked Questions (FAQs)</h1>
              <p className="text-xs text-slate-400 mt-0.5">Manage customer self-service questions on storefront.</p>
            </div>
            <button 
              onClick={() => handleOpenFaqModal()}
              className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add FAQ</span>
            </button>
          </div>

          {faqs.length > 0 ? (
            <div className="space-y-3">
              {faqs.map((f) => (
                <div key={f.id} className="p-4 bg-[#181B26] border border-[#2E3548] rounded-xl text-xs flex justify-between items-start gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="font-bold text-white text-sm">Q: {f.question}</div>
                    <p className="text-slate-300 leading-relaxed">A: {f.answer}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleOpenFaqModal(f)}
                      className="p-2 hover:bg-[#282E3F] text-slate-400 hover:text-indigo-400 transition rounded-lg border border-[#2E3548]"
                      title="Edit FAQ"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => handleDeleteFaq(f.id)}
                      className="p-2 hover:bg-[#282E3F] text-slate-400 hover:text-red-400 transition rounded-lg border border-[#2E3548]"
                      title="Delete FAQ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-[#181B26] border border-[#2E3548] border-dashed rounded-2xl p-12 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-[#00D68F]/10 flex items-center justify-center">
                <HelpCircle className="w-8 h-8 text-[#00D68F]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">No FAQs Yet</h3>
                <p className="text-xs text-slate-400 max-w-xs">
                  Create common questions to help your customers find answers quickly and reduce support tickets.
                </p>
              </div>
              <button 
                onClick={() => handleOpenFaqModal()}
                className="bg-[#282E3F] hover:bg-[#32394E] text-[#00D68F] border border-[#00D68F]/30 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add your first FAQ</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Create Landing Page */}
      {showCreateLPModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-[#202533] p-5 border-b border-[#2E3548] flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#00D68F]/10 flex items-center justify-center">
                  <Layout className="w-4 h-4 text-[#00D68F]" />
                </div>
                <h3 className="font-bold text-white">Create New Landing Page</h3>
              </div>
              <button 
                onClick={() => setShowCreateLPModal(false)}
                className="text-slate-400 hover:text-white p-1 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (!newPageTitle || !newPageSlug) return;
                const newPage = {
                  id: Date.now(),
                  title: newPageTitle,
                  slug: newPageSlug.toLowerCase().replace(/\s+/g, '-'),
                  views: 0,
                  status: 'Draft'
                };
                setLandingPages([newPage, ...landingPages]);
                setShowCreateLPModal(false);
                setNewPageTitle('');
                setNewPageSlug('');
                alert(`Redirecting to Drag-and-Drop Landing Page Editor for "${newPageTitle}"...`);
              }}
              className="p-6 space-y-4"
            >
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Page Title</label>
                <input 
                  autoFocus
                  type="text" 
                  value={newPageTitle}
                  onChange={(e) => {
                    setNewPageTitle(e.target.value);
                    if (!newPageSlug) {
                      setNewPageSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                    }
                  }}
                  placeholder="e.g. Eid Mega Sale 2026"
                  className="w-full bg-[#181B26] border border-[#2E3548] text-white px-4 py-3 rounded-xl text-sm focus:border-[#00D68F] outline-none transition"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">URL Slug</label>
                <div className="flex items-center gap-2 bg-[#181B26] border border-[#2E3548] px-4 py-3 rounded-xl text-sm text-slate-400">
                  <span>store.com.bd/p/</span>
                  <input 
                    type="text" 
                    value={newPageSlug}
                    onChange={(e) => setNewPageSlug(e.target.value)}
                    className="bg-transparent text-white outline-none flex-1 lowercase"
                    required
                  />
                </div>
                <p className="text-[10px] text-slate-500 italic">This will be the unique link for your landing page.</p>
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowCreateLPModal(false)}
                  className="flex-1 bg-[#282E3F] hover:bg-[#32394E] text-white font-bold py-3 rounded-xl text-xs transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-black py-3 rounded-xl text-xs transition shadow-lg shadow-[#00D68F]/20"
                >
                  Launch Editor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: Theme Market Discovery Gallery */}
      {showMarketModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] w-full max-w-4xl rounded-2xl shadow-2xl p-6 space-y-5 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-[#2E3548] pb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#00D68F]" />
                  <span>Zid Theme Storefront Market</span>
                </h3>
                <p className="text-xs text-slate-400">Discover premium high-converting themes engineered for Bangladesh e-commerce.</p>
              </div>
              <button 
                onClick={() => setShowMarketModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mergedThemeCatalog.map((item) => {
                const unlocked = isThemeUnlocked(item);
                const isActive = (merchant?.activeThemeId || 'growth-1') === item.id;

                return (
                  <div key={item.id} className="bg-[#181B26] border border-[#2E3548] rounded-2xl overflow-hidden space-y-3 p-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="relative h-36 rounded-xl overflow-hidden border border-[#2E3548]">
                        <SafeImage src={item.previewUrl} alt={item.name} className="w-full h-full object-cover" />
                        <div className="absolute top-2 left-2 bg-black/80 text-indigo-300 font-bold text-[10px] px-2 py-0.5 rounded border border-indigo-500/30">
                          {item.isFree ? 'FREE' : 'PREMIUM'}
                        </div>
                      </div>
                      <div className="font-bold text-white text-sm flex items-center justify-between">
                        <span>{item.name}</span>
                        <span className="text-[10px] text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full">v{item.version}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2">{item.description}</p>
                    </div>

                    <div className="space-y-2 pt-1">
                      <button
                        onClick={() => {
                          setShowMarketModal(false);
                          setDemoPreviewTheme(item);
                        }}
                        className="w-full bg-[#202533] hover:bg-[#282E3F] text-[#00D68F] border border-[#00D68F]/40 hover:border-[#00D68F] font-extrabold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#00D68F] animate-pulse" />
                        <span>Live Interactive Demo</span>
                      </button>

                      {isActive ? (
                        <button disabled className="w-full bg-[#00D68F]/20 text-[#00D68F] font-bold py-2 rounded-xl text-xs border border-[#00D68F]/30">
                          Currently Active Theme
                        </button>
                      ) : unlocked ? (
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => { setShowMarketModal(false); handlePublishTheme(item); }}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-xl text-xs transition cursor-pointer shadow"
                          >
                            Publish Theme Live
                          </button>
                          <button
                            onClick={() => {
                              setShowMarketModal(false);
                              setThemeToCustomize(item);
                              setShowCustomizeModal(true);
                            }}
                            className="w-full bg-[#202533] hover:bg-[#282E3F] text-slate-200 font-bold py-2 rounded-xl text-xs border border-[#3A435E] transition cursor-pointer"
                          >
                            Customize Theme
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { 
                            setShowMarketModal(false); 
                            setUpgradingForTheme(item);
                            setShowUpgradePrompt(true);
                          }}
                          className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-black py-2 rounded-xl text-xs shadow-lg shadow-indigo-500/20 transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Lock className="w-3.5 h-3.5 shrink-0" />
                          <span>Unlock Premium Theme</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Full Zid-Style Theme Customizer */}
      {showCustomizeModal && (
        <ThemeCustomizerModal
          isOpen={showCustomizeModal}
          onClose={() => {
            setShowCustomizeModal(false);
            setThemeToCustomize(null);
          }}
          themeName={themeToCustomize?.name || currentActiveTheme.name}
          themeVersion={themeToCustomize?.version || currentActiveTheme.version}
          merchant={merchant}
          onPublish={(updatedMerchant) => setMerchant(updatedMerchant)}
          isPremiumPlan={isPremiumPlan}
          onOpenSubscriptionModal={onOpenSubscriptionModal}
        />
      )}

      {/* MODAL 3: Theme Details View */}
      {showDetailsModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] w-full max-w-lg rounded-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-[#2E3548] pb-3">
              <h3 className="font-bold text-white text-base">{showDetailsModal.name} Details</h3>
              <button onClick={() => setShowDetailsModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300">
              <div className="flex justify-between border-b border-[#2E3548] pb-2">
                <span className="text-slate-400">Theme Version:</span>
                <strong className="text-white font-mono">v{showDetailsModal.version}</strong>
              </div>
              <div className="flex justify-between border-b border-[#2E3548] pb-2">
                <span className="text-slate-400">Pricing Tier:</span>
                <strong className={showDetailsModal.isFree ? "text-emerald-400 font-bold" : "text-indigo-400 font-bold"}>
                  {showDetailsModal.isFree ? '100% Free' : 'Premium Theme'}
                </strong>
              </div>
              <div className="flex justify-between border-b border-[#2E3548] pb-2">
                <span className="text-slate-400">Current Status:</span>
                <strong className={isThemeUnlocked(showDetailsModal) ? "text-indigo-400 font-bold" : "text-amber-400 font-bold"}>
                  {(merchant?.activeThemeId || 'growth-1') === showDetailsModal.id 
                    ? 'Live & Active' 
                    : isThemeUnlocked(showDetailsModal) 
                      ? 'Unlocked' 
                      : 'Locked / Premium'}
                </strong>
              </div>
              <div className="flex justify-between border-b border-[#2E3548] pb-2">
                <span className="text-slate-400">Category:</span>
                <strong className="text-white">{showDetailsModal.category}</strong>
              </div>
              <div className="flex justify-between border-b border-[#2E3548] pb-2">
                <span className="text-slate-400">Last Updated:</span>
                <strong className="text-white">{showDetailsModal.updatedAt}</strong>
              </div>
              <p className="text-slate-300 leading-relaxed bg-[#181B26] p-3 rounded-xl border border-[#2E3548] mt-2">
                {showDetailsModal.description}
              </p>
            </div>

            <button 
              onClick={() => setShowDetailsModal(null)}
              className="w-full bg-[#282E3F] text-white font-bold py-2 rounded-xl text-xs cursor-pointer"
            >
              Close Details
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Add Menu Item */}
      {showAddMenuModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-[#202533] p-5 border-b border-[#2E3548] flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                  <MenuIcon className="w-4 h-4 text-indigo-400" />
                </div>
                <h3 className="font-bold text-white">Add Navigation Menu Item</h3>
              </div>
              <button 
                onClick={() => setShowAddMenuModal(false)}
                className="text-slate-400 hover:text-white p-1 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (!newMenuTitle || !newMenuUrl) return;
                const newItem = {
                  id: `m-${Date.now()}`,
                  title: newMenuTitle,
                  url: newMenuUrl
                };
                setMenuItems([...menuItems, newItem]);
                setShowAddMenuModal(false);
                setNewMenuTitle('');
                setNewMenuUrl('');
              }}
              className="p-6 space-y-4"
            >
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Menu Title</label>
                <input 
                  autoFocus
                  type="text" 
                  value={newMenuTitle}
                  onChange={(e) => setNewMenuTitle(e.target.value)}
                  placeholder="e.g. Summer Collection"
                  className="w-full bg-[#181B26] border border-[#2E3548] text-white px-4 py-3 rounded-xl text-sm focus:border-indigo-500 outline-none transition"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Link URL / Path</label>
                <input 
                  type="text" 
                  value={newMenuUrl}
                  onChange={(e) => setNewMenuUrl(e.target.value)}
                  placeholder="e.g. /collections/summer or https://..."
                  className="w-full bg-[#181B26] border border-[#2E3548] text-white px-4 py-3 rounded-xl text-sm focus:border-indigo-500 outline-none transition"
                  required
                />
                <p className="text-[10px] text-slate-500 italic">Enter a local store path or an external link.</p>
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowAddMenuModal(false)}
                  className="flex-1 bg-[#282E3F] hover:bg-[#32394E] text-white font-bold py-3 rounded-xl text-xs transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white font-black py-3 rounded-xl text-xs transition shadow-lg shadow-indigo-500/20"
                >
                  Save Menu Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Subscription Upgrade Prompt */}
      {showUpgradePrompt && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden relative">
            <div className="absolute top-[-10%] right-[-10%] w-40 h-40 bg-indigo-500/10 blur-[100px]" />
            <div className="absolute bottom-[-10%] left-[-10%] w-40 h-40 bg-emerald-500/10 blur-[100px]" />

            <div className="bg-[#202533] p-5 border-b border-[#2E3548] flex justify-between items-center relative">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-amber-400" />
                </div>
                <h3 className="font-bold text-white">Unlock Premium Themes</h3>
              </div>
              <button 
                onClick={() => setShowUpgradePrompt(false)}
                className="text-slate-400 hover:text-white p-1 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8 text-center space-y-6 relative">
              <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-emerald-500 rounded-3xl mx-auto flex items-center justify-center shadow-xl shadow-indigo-500/20 rotate-3">
                <Sparkles className="w-10 h-10 text-white fill-white animate-pulse" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-black text-white">Upgrade to Unlock</h2>
                <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                  The <span className="text-white font-bold">{upgradingForTheme?.name || 'Premium'}</span> theme is part of our Professional and Enterprise subscription plans.
                </p>
              </div>

              <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-4 text-left space-y-3">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Included with Pro Plan:</h4>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    'Unlock all 15+ Premium Themes',
                    'Remove "Powered by Zid" Branding',
                    'Custom Domain Connection',
                    'Advanced Analytics Dashboard'
                  ].map((feature, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] text-slate-300">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    setShowUpgradePrompt(false);
                    onOpenSubscriptionModal();
                  }}
                  className="w-full bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-black py-4 rounded-xl text-sm transition shadow-lg shadow-[#00D68F]/20 flex items-center justify-center gap-2"
                >
                  <Rocket className="w-4 h-4" />
                  <span>View Subscription Plans</span>
                </button>
                <button 
                  onClick={() => setShowUpgradePrompt(false)}
                  className="w-full text-slate-400 hover:text-white text-xs font-bold py-2 transition"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Blog Editor */}
      {showBlogModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#202533] p-5 border-b border-[#2E3548] flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                  <Newspaper className="w-4 h-4 text-indigo-400" />
                </div>
                <h3 className="font-bold text-white">{editingPost ? 'Edit Article' : 'Write New Article'}</h3>
              </div>
              <button 
                onClick={() => setShowBlogModal(false)}
                className="text-slate-400 hover:text-white p-1 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBlogPost} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content Area */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">Article Title</label>
                    <input 
                      autoFocus
                      type="text" 
                      value={blogForm.title}
                      onChange={(e) => setBlogForm({ ...blogForm, title: e.target.value })}
                      placeholder="e.g. The Ultimate Guide to Eid Fashion 2026"
                      className="w-full bg-[#181B26] border border-[#2E3548] text-white px-4 py-3 rounded-xl text-sm focus:border-indigo-500 outline-none transition font-bold"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">Content (Rich Text Editor)</label>
                    <div className="bg-[#181B26] border border-[#2E3548] rounded-xl overflow-hidden">
                      <div className="bg-[#202533] border-b border-[#2E3548] p-2 flex items-center gap-1">
                        {['bold', 'italic', 'list', 'link', 'image'].map((tool) => (
                          <button key={tool} type="button" className="p-1.5 hover:bg-[#282E3F] rounded text-slate-400 transition">
                            <Code className="w-3.5 h-3.5" />
                          </button>
                        ))}
                      </div>
                      <textarea 
                        rows={12}
                        value={blogForm.content}
                        onChange={(e) => setBlogForm({ ...blogForm, content: e.target.value })}
                        placeholder="Write your story here..."
                        className="w-full bg-transparent text-white p-4 text-sm outline-none transition resize-none leading-relaxed"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Sidebar Controls */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">Cover Image</label>
                    <div 
                      className={`
                        w-full h-40 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition cursor-pointer overflow-hidden relative
                        ${blogForm.coverImage ? 'border-indigo-500/50' : 'border-[#2E3548] hover:border-slate-600'}
                      `}
                      onClick={() => {
                        const url = prompt('Enter image URL for cover:');
                        if (url) setBlogForm({ ...blogForm, coverImage: url });
                      }}
                    >
                      {blogForm.coverImage ? (
                        <>
                          <SafeImage src={blogForm.coverImage} className="w-full h-full object-cover" alt="" />
                          <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition flex items-center justify-center">
                            <span className="text-[10px] font-bold text-white bg-black/50 px-2 py-1 rounded">Change Image</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center">
                            <Upload className="w-5 h-5 text-indigo-400" />
                          </div>
                          <div className="text-[10px] font-bold text-slate-400 text-center px-4">
                            Click to upload or drag cover image
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-300">Author Name</label>
                    <input 
                      type="text" 
                      value={blogForm.author}
                      onChange={(e) => setBlogForm({ ...blogForm, author: e.target.value })}
                      placeholder="e.g. John Doe"
                      className="w-full bg-[#181B26] border border-[#2E3548] text-white px-4 py-3 rounded-xl text-sm focus:border-indigo-500 outline-none transition"
                      required
                    />
                  </div>

                  <div className="bg-[#202533] p-4 rounded-xl border border-[#2E3548] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Visibility</span>
                      <span className="text-[10px] font-bold text-emerald-400">Published</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">SEO Optimized</span>
                      <CheckCircle className="w-3 h-3 text-emerald-400" />
                    </div>
                    <p className="text-[10px] text-slate-500 italic leading-relaxed">
                      This article will be automatically indexed by Google Search Bangladesh within 24 hours.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#2E3548] flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowBlogModal(false)}
                  className="bg-[#282E3F] hover:bg-[#32394E] text-white font-bold px-6 py-3 rounded-xl text-xs transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-black py-3 rounded-xl text-xs transition shadow-lg shadow-[#00D68F]/20 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingPost ? 'Update Article' : 'Publish Article'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Custom Page */}
      {showAddPageModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#202533] p-5 border-b border-[#2E3548] flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-indigo-400" />
                </div>
                <h3 className="font-bold text-white">Create Custom Page</h3>
              </div>
              <button 
                onClick={() => setShowAddPageModal(false)}
                className="text-slate-400 hover:text-white p-1 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (!newPageForm.title) return;
                const newPage = {
                  id: Date.now(),
                  title: newPageForm.title,
                  slug: newPageForm.slug || newPageForm.title.toLowerCase().replace(/ /g, '-'),
                  status: 'Draft'
                };
                setCustomPages([...customPages, newPage]);
                setShowAddPageModal(false);
                setNewPageForm({ title: '', slug: '', content: '' });
              }} 
              className="flex-1 overflow-y-auto p-6 space-y-5"
            >
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Page Title</label>
                <input 
                  autoFocus
                  type="text" 
                  value={newPageForm.title}
                  onChange={(e) => setNewPageForm({ ...newPageForm, title: e.target.value })}
                  placeholder="e.g. Terms of Service"
                  className="w-full bg-[#181B26] border border-[#2E3548] text-white px-4 py-3 rounded-xl text-sm focus:border-indigo-500 outline-none transition font-bold"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">URL Slug</label>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 text-xs font-mono">/pages/</span>
                  <input 
                    type="text" 
                    value={newPageForm.slug}
                    onChange={(e) => setNewPageForm({ ...newPageForm, slug: e.target.value.toLowerCase().replace(/ /g, '-') })}
                    placeholder="terms-of-service"
                    className="flex-1 bg-[#181B26] border border-[#2E3548] text-white px-4 py-2 rounded-xl text-sm focus:border-indigo-500 outline-none transition font-mono"
                  />
                </div>
                <p className="text-[10px] text-slate-500 italic">Leave empty to auto-generate from title.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Page Content (HTML/Markdown)</label>
                <textarea 
                  rows={10}
                  value={newPageForm.content}
                  onChange={(e) => setNewPageForm({ ...newPageForm, content: e.target.value })}
                  placeholder="Enter your page content here..."
                  className="w-full bg-[#181B26] border border-[#2E3548] text-white p-4 rounded-xl text-sm outline-none transition resize-none leading-relaxed focus:border-indigo-500"
                />
              </div>

              <div className="pt-4 border-t border-[#2E3548] flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowAddPageModal(false)}
                  className="bg-[#282E3F] hover:bg-[#32394E] text-white font-bold px-6 py-3 rounded-xl text-xs transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-black py-3 rounded-xl text-xs transition shadow-lg shadow-[#00D68F]/20 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Create Page</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: FAQ Editor */}
      {showFaqModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-[#202533] p-5 border-b border-[#2E3548] flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                  <HelpCircle className="w-4 h-4 text-indigo-400" />
                </div>
                <h3 className="font-bold text-white">{editingFaq ? 'Edit FAQ' : 'Add New FAQ'}</h3>
              </div>
              <button 
                onClick={() => setShowFaqModal(false)}
                className="text-slate-400 hover:text-white p-1 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFaq} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Question</label>
                <input 
                  autoFocus
                  type="text" 
                  value={faqForm.question}
                  onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
                  placeholder="e.g. Do you offer home delivery?"
                  className="w-full bg-[#181B26] border border-[#2E3548] text-white px-4 py-3 rounded-xl text-sm focus:border-indigo-500 outline-none transition"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Answer</label>
                <textarea 
                  rows={4}
                  value={faqForm.answer}
                  onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
                  placeholder="e.g. Yes, we provide nationwide home delivery across Bangladesh via Steadfast and Pathao."
                  className="w-full bg-[#181B26] border border-[#2E3548] text-white p-4 rounded-xl text-sm outline-none transition resize-none leading-relaxed focus:border-indigo-500"
                  required
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowFaqModal(false)}
                  className="flex-1 bg-[#282E3F] hover:bg-[#32394E] text-white font-bold py-3 rounded-xl text-xs transition"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-black py-3 rounded-xl text-xs transition shadow-lg shadow-[#00D68F]/20 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingFaq ? 'Update FAQ' : 'Add FAQ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Live Demo Preview Modal */}
      {demoPreviewTheme && (
        <StorefrontPreviewModal
          isOpen={!!demoPreviewTheme}
          onClose={() => setDemoPreviewTheme(null)}
          merchant={merchant}
          products={[]}
          bankAccounts={[]}
          mobileBanking={[]}
          previewTheme={demoPreviewTheme}
          isUnlocked={isThemeUnlocked(demoPreviewTheme)}
          isCurrentActive={(merchant?.activeThemeId || 'growth-1') === demoPreviewTheme.id}
          onBuyTheme={(t: any) => {
            setUpgradingForTheme(t);
            setShowUpgradePrompt(true);
          }}
          onPublishTheme={(t: any) => handlePublishTheme(t)}
        />
      )}
    </div>
  );
};
