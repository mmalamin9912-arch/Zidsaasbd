import React, { useState } from 'react';
import { MerchantProfile, Product, BankAccount, MobileBankingConfig } from '../types';
import { X, ExternalLink, Monitor, Tablet, Smartphone, Sparkles, Lock, CheckCircle2, ShoppingBag } from 'lucide-react';
import { TenantStorefrontView } from './TenantStorefrontView';
import { ThemeMarketItem } from './views/OnlineStoreView';
import { SupermarketTechMockup, ElegantFashionMockup } from './ThemeMockups';
import { resolveLayoutForTheme } from '../lib/themeRegistry';

interface StorefrontPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  merchant: MerchantProfile;
  products: Product[];
  bankAccounts: BankAccount[];
  mobileBanking: MobileBankingConfig[];
  previewTheme?: any;
  onBuyTheme?: (theme: ThemeMarketItem) => void;
  onPublishTheme?: (theme: ThemeMarketItem) => void;
  isUnlocked?: boolean;
  isCurrentActive?: boolean;
}

export const StorefrontPreviewModal: React.FC<StorefrontPreviewModalProps> = ({
  isOpen,
  onClose,
  merchant,
  products,
  bankAccounts,
  mobileBanking,
  previewTheme,
  onBuyTheme,
  onPublishTheme,
  isUnlocked = true,
  isCurrentActive = false,
}) => {
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  if (!isOpen) return null;

  const themeName = previewTheme?.name || 'Live Storefront';
  const themeVersion = previewTheme?.version || '1.0.0';
  const themeId = previewTheme?.id || merchant?.activeThemeId || 'growth-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/90 backdrop-blur-md overflow-hidden">
      <div className="relative w-full max-w-[1440px] h-[95vh] bg-slate-900 rounded-3xl shadow-2xl border border-slate-800 overflow-hidden flex flex-col">
        {/* Editor Preview Header Ribbon */}
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 z-10">
          {/* Left info */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 hidden sm:flex">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
            </div>
            <div className="h-4 w-[1px] bg-slate-800 mx-1 hidden sm:block" />

            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00D68F] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#00D68F]"></span>
              </span>
              <span className="font-extrabold text-white text-sm">
                Interactive Live Demo: <span className="text-[#00D68F]">{themeName}</span>
              </span>
              <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-500/30">
                v{themeVersion}
              </span>
            </div>
          </div>

          {/* Center Device Switcher */}
          <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1">
            <button
              onClick={() => setDeviceMode('desktop')}
              className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                deviceMode === 'desktop'
                  ? 'bg-[#282E3F] text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Desktop View"
            >
              <Monitor className="w-4 h-4" />
              <span className="hidden md:inline">Desktop</span>
            </button>
            <button
              onClick={() => setDeviceMode('tablet')}
              className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                deviceMode === 'tablet'
                  ? 'bg-[#282E3F] text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Tablet View"
            >
              <Tablet className="w-4 h-4" />
              <span className="hidden md:inline">Tablet</span>
            </button>
            <button
              onClick={() => setDeviceMode('mobile')}
              className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                deviceMode === 'mobile'
                  ? 'bg-[#282E3F] text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Mobile View"
            >
              <Smartphone className="w-4 h-4" />
              <span className="hidden md:inline">Mobile</span>
            </button>
          </div>

          {/* Right Action CTA & Close */}
          <div className="flex items-center gap-2">
            {previewTheme && !isUnlocked && !previewTheme.isFree ? (
              <button
                onClick={() => {
                  onClose();
                  if (onBuyTheme) onBuyTheme(previewTheme);
                }}
                className="bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black px-4 py-2 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition transform hover:scale-105 cursor-pointer animate-pulse"
              >
                <Lock className="w-4 h-4 shrink-0" />
                <span>Unlock Premium Theme (৳১,৯৯৯)</span>
              </button>
            ) : previewTheme && !isCurrentActive ? (
              <button
                onClick={() => {
                  if (onPublishTheme) onPublishTheme(previewTheme);
                  onClose();
                }}
                className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Publish Theme Live</span>
              </button>
            ) : (
              <span className="bg-[#00D68F]/10 text-[#00D68F] border border-[#00D68F]/30 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Live Active Theme</span>
              </span>
            )}

            <a
              href={`/e/${merchant?.storeSlug || ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition"
              title="Open storefront in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Browser Viewport Stage */}
        <div className="flex-1 overflow-y-auto bg-slate-950 p-2 sm:p-6 flex items-center justify-center relative">
          <div
            className={`transition-all duration-300 h-full w-full bg-white overflow-hidden shadow-2xl relative flex flex-col ${
              deviceMode === 'desktop'
                ? 'max-w-full rounded-2xl border border-slate-800'
                : deviceMode === 'tablet'
                ? 'max-w-[768px] rounded-3xl border-8 border-slate-800 my-auto h-[95%]'
                : 'max-w-[390px] rounded-[40px] border-[12px] border-slate-800 my-auto h-[95%] shadow-emerald-500/10'
            }`}
          >
            {/* Mobile Notch Simulation */}
            {deviceMode === 'mobile' && (
              <div className="absolute top-0 inset-x-0 z-[100] h-5 w-full flex items-center justify-center pointer-events-none">
                <div className="w-24 h-4 bg-slate-950 rounded-b-xl" />
              </div>
            )}

            <div className="flex-1 overflow-y-auto no-scrollbar relative w-full h-full">
              {resolveLayoutForTheme({ id: themeId, category: previewTheme?.category, name: previewTheme?.name }) === 'supermarket' ? (
                <SupermarketTechMockup />
              ) : resolveLayoutForTheme({ id: themeId, category: previewTheme?.category, name: previewTheme?.name }) === 'fashion' ? (
                <ElegantFashionMockup />
              ) : (
                <TenantStorefrontView
                  storeSlug={merchant?.storeSlug || ''}
                  merchant={{
                    ...(merchant || {} as any),
                    activeThemeId: themeId
                  }}
                  products={products}
                  bankAccounts={bankAccounts}
                  mobileBanking={mobileBanking}
                  themes={[]}
                  previewThemeId={themeId}
                  onPlaceOrder={(order) => {
                    console.log('Order placed in demo preview:', order);
                  }}
                />
              )}
            </div>

            {/* Persistent Bottom Unlock Banner inside the frame */}
            {previewTheme && !isUnlocked && !previewTheme.isFree && (
              <div className="absolute bottom-0 inset-x-0 z-[60] p-4 bg-gradient-to-t from-black/80 via-black/50 to-transparent flex justify-center">
                <button
                  onClick={() => {
                    onClose();
                    if (onBuyTheme) onBuyTheme(previewTheme);
                  }}
                  className="w-full max-w-sm bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black px-6 py-3.5 rounded-2xl text-sm md:text-base flex items-center justify-center gap-2 shadow-2xl shadow-amber-500/30 transition transform hover:-translate-y-1 hover:scale-[1.02] cursor-pointer animate-bounce"
                >
                  <Lock className="w-5 h-5 shrink-0" />
                  <span>Unlock Premium Theme (৳১,৯৯৯)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

