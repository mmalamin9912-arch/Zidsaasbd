import React, { useState, useEffect } from 'react';
import { NavigationTab, ProductSubTab, CustomerSubTab, StoreSubTab, SettingsSubTab } from '../types';
import { fetchPlatformConfig } from '../lib/platformConfigApi';
import { BrandLogo } from './BrandLogo';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  Megaphone,
  MessageCircle,
  Store,
  BarChart3,
  Truck,
  CreditCard,
  Landmark,
  TrendingUp,
  Share2,
  X,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Boxes,
  FolderTree,
  Clock,
  Warehouse,
  History,
  Sliders,
  FileText,
  Layers,
  Wallet,
  UserCheck,
  Ticket,
  Star,
  HelpCircle,
  Bell,
  Palette,
  Compass,
  Menu as MenuIcon,
  Newspaper,
  Search,
  ShieldAlert,
  ShieldCheck,
  Phone,
  Mail,
  LifeBuoy,
  Settings,
  User
} from 'lucide-react';

interface SidebarProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  productSubTab?: ProductSubTab;
  onSelectProductSubTab?: (subTab: ProductSubTab) => void;
  customerSubTab?: CustomerSubTab;
  onSelectCustomerSubTab?: (subTab: CustomerSubTab) => void;
  storeSubTab?: StoreSubTab;
  onSelectStoreSubTab?: (subTab: StoreSubTab) => void;
  settingsSubTab?: SettingsSubTab;
  onSelectSettingsSubTab?: (subTab: SettingsSubTab) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  ordersBadgeCount?: number;
  onOpenAdminLogin?: () => void;
  isDarkMode?: boolean;
  platformSettings?: any;
}

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: React.ElementType;
  badge?: string | number;
  highlight?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  productSubTab = 'all_products',
  onSelectProductSubTab,
  customerSubTab = 'all_customers',
  onSelectCustomerSubTab,
  storeSubTab = 'themes',
  onSelectStoreSubTab,
  settingsSubTab = 'settings_general',
  onSelectSettingsSubTab,
  isOpenMobile,
  onCloseMobile,
  ordersBadgeCount = 4,
  onOpenAdminLogin,
  isDarkMode = true,
  platformSettings,
}) => {
  const [isProductsExpanded, setIsProductsExpanded] = useState(true);
  const [isCustomersExpanded, setIsCustomersExpanded] = useState(true);
  const [isStoreExpanded, setIsStoreExpanded] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [modalType, setModalType] = useState<'terms' | 'support' | null>(null);
  const [supportConfig, setSupportConfig] = useState<{ supportPhone: string; supportEmail: string; whatsappNumber: string; termsUrl: string; termsText: string } | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

  // Dynamically fetch the Super Admin platform config (stored in MongoDB via
  // /api/admin/platform-config) the first time a dialog is opened.
  useEffect(() => {
    if (!modalType || supportConfig || configLoading) return;
    let active = true;
    setConfigLoading(true);
    fetchPlatformConfig().then((config) => {
      if (!active) return;
      const settings = (config as any)?.platformSettings || {};
      setSupportConfig({
        supportPhone: String(settings.supportPhone || ''),
        supportEmail: String(settings.supportEmail || ''),
        whatsappNumber: String(settings.whatsappNumber || ''),
        termsUrl: String(settings.termsUrl || ''),
        termsText: String(settings.termsText || settings.termsContent || ''),
      });
      setConfigLoading(false);
    });
    return () => { active = false; };
  }, [modalType, supportConfig, configLoading]);

  const accountSubItems: { id: SettingsSubTab; label: string; icon: React.ElementType }[] = [
    { id: 'settings_account', label: 'Account details', icon: User },
    { id: 'settings_security', label: 'Security settings', icon: ShieldCheck },
    { id: 'settings_languages', label: 'Languages & currencies', icon: Compass },
    { id: 'settings_checkout', label: 'Checkout page options', icon: CreditCard },
    { id: 'settings_notifications', label: 'Staff notifications', icon: Bell },
  ];

  const generalSubItems: { id: SettingsSubTab; label: string; icon: React.ElementType }[] = [
    { id: 'settings_general', label: 'General', icon: Sliders },
    { id: 'settings_invoices', label: 'Configure your invoices', icon: FileText },
    { id: 'settings_properties', label: 'Orders and product properties', icon: Package },
    { id: 'settings_nbr', label: 'Fatoora platform integration', icon: Landmark },
    { id: 'settings_export', label: 'Export requests', icon: FileText },
  ];

  const handleSettingsSubTabClick = (subTab: SettingsSubTab) => {
    onSelectTab('settings');
    if (onSelectSettingsSubTab) {
      onSelectSettingsSubTab(subTab);
    }
    setIsSettingsOpen(false);
    onCloseMobile();
  };

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'orders', label: 'Orders', icon: ShoppingBag, badge: ordersBadgeCount },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'marketing', label: 'Marketing', icon: Megaphone },
    { id: 'store', label: 'Online Store', icon: Store },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'logistics', label: 'Logistics', icon: Truck },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'financing', label: 'Financing', icon: Landmark, highlight: true },
    { id: 'growth', label: 'Growth', icon: TrendingUp },
    { id: 'channels', label: 'Channels', icon: Share2 },
    { id: 'settings', label: 'Settings', icon: Sliders },
  ];

  const productSubItems: { id: ProductSubTab; label: string; icon: React.ElementType }[] = [
    { id: 'all_products', label: 'All products', icon: Boxes },
    { id: 'categories', label: 'Categories', icon: FolderTree },
    { id: 'preorder_campaigns', label: 'Preorder campaigns', icon: Clock },
    { id: 'inventory', label: 'Inventory', icon: Warehouse },
    { id: 'stock_changes', label: 'Inventory stock changes', icon: History },
    { id: 'filters', label: 'Filters', icon: Sliders },
    { id: 'custom_fields', label: 'Custom fields', icon: FileText },
    { id: 'options_library', label: 'Options library', icon: Layers },
  ];

  const customerSubItems: { id: CustomerSubTab; label: string; icon: React.ElementType }[] = [
    { id: 'all_customers', label: 'All customers', icon: Users },
    { id: 'customer_wallet', label: 'Customer wallet', icon: Wallet },
    { id: 'groups', label: 'Groups', icon: UserCheck },
    { id: 'customer_tickets', label: 'Customer Tickets', icon: Ticket },
    { id: 'reviews', label: 'Reviews', icon: Star },
    { id: 'questions', label: 'Questions', icon: HelpCircle },
    { id: 'stock_notifications', label: 'Stock notifications', icon: Bell },
  ];

  const storeSubItems: { id: StoreSubTab; label: string; icon: React.ElementType }[] = [
    { id: 'themes', label: 'Themes', icon: Palette },
    { id: 'landing_pages', label: 'Landing pages', icon: Compass },
    { id: 'brand', label: 'Brand', icon: Sparkles },
    { id: 'menu', label: 'Menu', icon: MenuIcon },
    { id: 'blog', label: 'Blog', icon: Newspaper },
    { id: 'pages', label: 'Pages', icon: FileText },
    { id: 'seo', label: 'SEO', icon: Search },
    { id: 'faqs', label: 'FAQs', icon: HelpCircle },
  ];

  const handleNavClick = (tab: NavigationTab) => {
    onSelectTab(tab);
    if (tab === 'products') {
      if (activeTab === 'products') {
        setIsProductsExpanded((prev) => !prev);
      } else {
        setIsProductsExpanded(true);
      }
    } else if (tab === 'customers') {
      if (activeTab === 'customers') {
        setIsCustomersExpanded((prev) => !prev);
      } else {
        setIsCustomersExpanded(true);
      }
    } else if (tab === 'store') {
      if (activeTab === 'store') {
        setIsStoreExpanded((prev) => !prev);
      } else {
        setIsStoreExpanded(true);
      }
    } else {
      onCloseMobile();
    }
  };

  const handleProductSubTabClick = (subTab: ProductSubTab) => {
    onSelectTab('products');
    if (onSelectProductSubTab) {
      onSelectProductSubTab(subTab);
    }
    onCloseMobile();
  };

  const handleCustomerSubTabClick = (subTab: CustomerSubTab) => {
    onSelectTab('customers');
    if (onSelectCustomerSubTab) {
      onSelectCustomerSubTab(subTab);
    }
    onCloseMobile();
  };

  const handleStoreSubTabClick = (subTab: StoreSubTab) => {
    onSelectTab('store');
    if (onSelectStoreSubTab) {
      onSelectStoreSubTab(subTab);
    }
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Overlay Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside className={`
        fixed lg:static top-0 left-0 bottom-0 z-50
        w-64 ${isDarkMode ? 'bg-[#181B26] border-r border-[#2A3042] text-slate-100' : 'bg-white border-r border-slate-200 text-slate-900'}
        flex flex-col justify-between
        transition-transform duration-300 ease-in-out
        ${isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Top Logo Header */}
        <div>
          <div className={`p-4 border-b ${isDarkMode ? 'border-[#2A3042]' : 'border-slate-200'} flex items-center justify-between`}>
            <BrandLogo size="sm" subtitle="Merchant Portal" isDarkMode={isDarkMode} />

            <button
              onClick={onCloseMobile}
              className="lg:hidden text-slate-400 hover:text-white p-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-4 py-2 relative">
            <button
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              title="Account & General Settings"
              className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-[#2A3042] text-slate-400' : 'hover:bg-slate-100 text-slate-600'} transition`}
            >
              <Settings className="w-5 h-5" />
            </button>
            {isSettingsOpen && (
              <div className="absolute left-16 top-0 z-[60] w-64 bg-[#181B26] border border-[#3E455D] rounded-xl shadow-2xl p-1 animate-in fade-in zoom-in duration-200">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 px-3 py-1.5">Account Settings</div>
                {accountSubItems.map((sub) => {
                  const Icon = sub.icon;
                  const isSubActive = settingsSubTab === sub.id;
                  return (
                    <button
                      key={sub.id}
                      onClick={() => handleSettingsSubTabClick(sub.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-xs text-slate-300 hover:bg-[#2A3042] hover:text-white rounded-lg transition-colors ${isSubActive ? 'bg-[#2A3042] text-[#E6C587]' : ''}`}
                    >
                      <Icon className="w-4 h-4" /> {sub.label}
                    </button>
                  );
                })}
                <div className="border-t border-[#3E455D] my-1" />
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 px-3 py-1.5">General Settings</div>
                {generalSubItems.map((sub) => {
                  const Icon = sub.icon;
                  const isSubActive = settingsSubTab === sub.id;
                  return (
                    <button
                      key={sub.id}
                      onClick={() => handleSettingsSubTabClick(sub.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-xs text-slate-300 hover:bg-[#2A3042] hover:text-white rounded-lg transition-colors ${isSubActive ? 'bg-[#2A3042] text-[#E6C587]' : ''}`}
                    >
                      <Icon className="w-4 h-4" /> {sub.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Navigation Items */}
          <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-200px)]">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 px-3 py-1">
              Store Operations
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const isProducts = item.id === 'products';
              const isCustomers = item.id === 'customers';
              const isStore = item.id === 'store';

              return (
                <div key={item.id} className="space-y-1">
                  <button
                    onClick={() => handleNavClick(item.id)}
                    className={`
                      w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all cursor-pointer
                      ${isActive
                        ? 'bg-gradient-to-r from-[#D4AF37]/20 to-[#D4AF37]/5 text-[#E6C587] border-l-4 border-[#D4AF37] font-semibold shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-[#202533]'
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-[#E6C587]' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.badge && (
                        <span className="bg-[#D4AF37] text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          {item.badge}
                        </span>
                      )}

                      {item.highlight && !isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      )}

                      {isProducts && (
                        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${isProductsExpanded && isActive ? 'rotate-180' : ''}`} />
                      )}

                      {isCustomers && (
                        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${isCustomersExpanded && isActive ? 'rotate-180' : ''}`} />
                      )}

                      {isStore && (
                        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${isStoreExpanded && isActive ? 'rotate-180' : ''}`} />
                      )}
                    </div>
                  </button>

                  {/* Products Sub-navigation List */}
                  {isProducts && (
                    <div
                      className={`
                        overflow-hidden transition-all duration-300 ease-in-out
                        ${isProductsExpanded && isActive ? 'max-h-96 opacity-100 my-1' : 'max-h-0 opacity-0 my-0'}
                        pl-6 space-y-1 pr-1 border-l border-[#2E3548]/80 ml-4
                      `}
                    >
                      {productSubItems.map((sub) => {
                        const SubIcon = sub.icon;
                        const isSubActive = isActive && productSubTab === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProductSubTabClick(sub.id);
                            }}
                            className={`
                              w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer text-left
                              ${isSubActive
                                ? 'bg-[#D4AF37]/15 text-[#E6C587] font-bold border border-[#D4AF37]/30 shadow-xs'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-[#202533]/80'
                              }
                            `}
                          >
                            <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-[#E6C587]' : 'text-slate-500'}`} />
                            <span className="truncate">{sub.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Customers Sub-navigation List */}
                  {isCustomers && (
                    <div
                      className={`
                        overflow-hidden transition-all duration-300 ease-in-out
                        ${isCustomersExpanded && isActive ? 'max-h-96 opacity-100 my-1' : 'max-h-0 opacity-0 my-0'}
                        pl-6 space-y-1 pr-1 border-l border-[#2E3548]/80 ml-4
                      `}
                    >
                      {customerSubItems.map((sub) => {
                        const SubIcon = sub.icon;
                        const isSubActive = isActive && customerSubTab === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCustomerSubTabClick(sub.id);
                            }}
                            className={`
                              w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer text-left
                              ${isSubActive
                                ? 'bg-[#D4AF37]/15 text-[#E6C587] font-bold border border-[#D4AF37]/30 shadow-xs'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-[#202533]/80'
                              }
                            `}
                          >
                            <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-[#E6C587]' : 'text-slate-500'}`} />
                            <span className="truncate">{sub.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Online Store Sub-navigation List */}
                  {isStore && (
                    <div
                      className={`
                        overflow-hidden transition-all duration-300 ease-in-out
                        ${isStoreExpanded && isActive ? 'max-h-[320px] opacity-100 my-1' : 'max-h-0 opacity-0 my-0'}
                        pl-6 space-y-1 pr-1 border-l border-[#2E3548]/80 ml-4
                      `}
                    >
                      {storeSubItems.map((sub) => {
                        const SubIcon = sub.icon;
                        const isSubActive = isActive && storeSubTab === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStoreSubTabClick(sub.id);
                            }}
                            className={`
                              w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer text-left
                              ${isSubActive
                                ? 'bg-[#D4AF37]/15 text-[#E6C587] font-bold border border-[#D4AF37]/30 shadow-xs'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-[#202533]/80'
                              }
                            `}
                          >
                            <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-[#E6C587]' : 'text-slate-500'}`} />
                            <span className="truncate">{sub.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Footer Card: SaaS Direct Monetization Info */}
        <div className="p-3 border-t border-[#2A3042] space-y-2">
          {/* Platform Rules & Terms + Support & Help links */}
          <div className={`rounded-xl border ${isDarkMode ? 'border-[#2E3548]' : 'border-slate-200'} divide-y ${isDarkMode ? 'divide-[#2E3548]' : 'divide-slate-200'}`}>
            <button
              onClick={() => setModalType('terms')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium transition cursor-pointer ${isDarkMode ? 'text-slate-300 hover:text-[#E6C587] hover:bg-[#202533]' : 'text-slate-600 hover:text-amber-700 hover:bg-slate-50'}`}
            >
              <FileText className="w-4 h-4" />
              <span>Platform Rules & Terms</span>
            </button>
            <button
              onClick={() => setModalType('support')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium transition cursor-pointer ${isDarkMode ? 'text-slate-300 hover:text-[#E6C587] hover:bg-[#202533]' : 'text-slate-600 hover:text-amber-700 hover:bg-slate-50'}`}
            >
              <LifeBuoy className="w-4 h-4" />
              <span>Support & Help</span>
            </button>
          </div>

          <div className="bg-[#202533] border border-[#2E3548] rounded-xl p-3 text-left">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-[#E6C587]" />
              <span className="text-xs font-bold text-white">Direct Merchant Setup</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight mb-2">
              All customer payments go directly to your bKash & Bank accounts.
            </p>
            <button
              onClick={() => handleNavClick('payments')}
              className="w-full text-center bg-[#282E3F] hover:bg-[#32394E] text-[#E6C587] text-[11px] font-semibold py-1.5 rounded-lg border border-[#D4AF37]/30 flex items-center justify-center gap-1 transition"
            >
              <span>Manage Payments</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Platform Rules & Terms Modal ── */}
      {modalType === 'terms' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setModalType(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-xs" />
          <div className="relative bg-[#181B26] border border-[#2E3548] rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-[#2E3548]">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-[#E6C587]" />
                <h3 className="text-sm font-bold text-white">Platform Rules & Terms</h3>
              </div>
              <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-white p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto text-sm text-slate-300 leading-relaxed space-y-3">
              {configLoading && <p className="text-slate-400">Loading terms…</p>}
              {!configLoading && supportConfig?.termsText && <p className="whitespace-pre-wrap">{supportConfig.termsText}</p>}
              {!configLoading && !supportConfig?.termsText && (
                <p className="text-slate-400">
                  No custom terms have been published yet. All merchants must follow the Zid BD platform rules:
                  direct settlements to your own bKash/bank accounts, accurate product listings, and timely order fulfillment.
                </p>
              )}
              {!configLoading && supportConfig?.termsUrl && (
                <a href={supportConfig.termsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[#E6C587] hover:underline font-semibold">
                  Read full terms <ChevronRight className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Support & Help Modal ── */}
      {modalType === 'support' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setModalType(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-xs" />
          <div className="relative bg-[#181B26] border border-[#2E3548] rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-[#2E3548]">
              <div className="flex items-center gap-2.5">
                <LifeBuoy className="w-5 h-5 text-[#E6C587]" />
                <h3 className="text-sm font-bold text-white">Support & Help</h3>
              </div>
              <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-white p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              {configLoading && <p className="text-slate-400">Loading support contacts…</p>}
              {!configLoading && (
                <>
                  {supportConfig?.supportPhone && (
                    <a href={`tel:${supportConfig.supportPhone}`} className="flex items-center gap-3 p-3 bg-[#202533] border border-[#2E3548] rounded-xl text-slate-200 hover:border-[#D4AF37]/40 transition">
                      <Phone className="w-4 h-4 text-[#E6C587]" />
                      <span className="font-medium">{supportConfig.supportPhone}</span>
                      <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-500">Call</span>
                    </a>
                  )}
                  {supportConfig?.supportEmail && (
                    <a href={`mailto:${supportConfig.supportEmail}`} className="flex items-center gap-3 p-3 bg-[#202533] border border-[#2E3548] rounded-xl text-slate-200 hover:border-[#D4AF37]/40 transition">
                      <Mail className="w-4 h-4 text-[#E6C587]" />
                      <span className="font-medium">{supportConfig.supportEmail}</span>
                      <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-500">Email</span>
                    </a>
                  )}
                  {supportConfig?.whatsappNumber && (
                    <a href={`https://wa.me/${supportConfig.whatsappNumber.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 bg-[#202533] border border-[#2E3548] rounded-xl text-slate-200 hover:border-emerald-500/40 transition">
                      <MessageCircle className="w-4 h-4 text-emerald-400" />
                      <span className="font-medium">{supportConfig.whatsappNumber}</span>
                      <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-500">WhatsApp</span>
                    </a>
                  )}
                  {!supportConfig?.supportPhone && !supportConfig?.supportEmail && !supportConfig?.whatsappNumber && (
                    <p className="text-slate-400">Support contact details have not been configured by the platform administrator yet.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
