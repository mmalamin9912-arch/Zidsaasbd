import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MerchantProfile, Order, Product } from '../../types';
import SafeImage from '../SafeImage';
import { fetchOnboardingStatus, completeOnboardingStep } from '../../lib/onboardingApi';
import type { OnboardingStatus } from '../../lib/onboardingApi';
import { 
  TrendingUp, 
  ShoppingBag, 
  Users, 
  Package, 
  Sparkles, 
  CheckCircle2, 
  ArrowUpRight, 
  ChevronRight, 
  CreditCard, 
  Truck, 
  Clock, 
  Plus, 
  ExternalLink,
  Globe,
  MapPin,
  Phone,
  Image as ImageIcon,
  X,
  Check,
  Layers,
  QrCode,
  Download,
  HelpCircle,
  CreditCard as CreditCardIcon,
  Store,
  Layout
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { ZidAiAssistant } from '../ZidAiAssistant';

interface DashboardViewProps {
  merchant: MerchantProfile;
  orders: Order[];
  products: Product[];
  onNavigateTab: (tab: any) => void;
  onOpenSubscriptionModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  merchant,
  orders,
  products,
  onNavigateTab,
  onOpenSubscriptionModal,
}) => {
  const totalSalesBDT = orders.reduce((sum, o) => sum + o.totalBDT, 0);

  // Dynamic Chart Logic
  const getLast7DaysSales = () => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      
      const salesForDay = orders
        .filter(o => new Date(o.createdAt).toDateString() === date.toDateString())
        .reduce((sum, o) => sum + o.totalBDT, 0);
        
      data.push({ day: dayName, salesBDT: salesForDay });
    }
    return data;
  };

  const dynamicSalesData = getLast7DaysSales();
  const topProducts = [...products].sort((a, b) => b.salesCount - a.salesCount).slice(0, 5);

  // Onboarding Step State
  //
  // These hold the VALUES a step is derived from, plus the server-computed
  // status. The checklist is no longer driven by local booleans: a step is
  // complete when the stored data says so, which is why the widget survives a
  // reload instead of resetting to "Pending".
  const storeSlug = String(merchant?.storeSlug || '').trim().toLowerCase();
  const [supportPhone, setSupportPhone] = useState(String((merchant as any)?.phone || (merchant as any)?.supportPhone || ''));
  const [pickupLocation, setPickupLocation] = useState(String((merchant as any)?.pickupAddress || ''));
  const [brandLogo, setBrandLogo] = useState(merchant?.logoUrl || '');
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [savingStep, setSavingStep] = useState(false);

  // Modal Triggers
  const [activeModal, setActiveModal] = useState<'none' | 'phone' | 'location' | 'branding'>('none');
  const [tempInput, setTempInput] = useState('');

  /**
   * Auto-check the onboarding status on dashboard load.
   *
   * Re-runs whenever the product count or the store slug changes, so adding a
   * product (which updates `products` upstream) immediately recomputes the
   * percentage and flips "Add product" to a green check.
   */
  const refreshOnboarding = useCallback(async (signal?: AbortSignal) => {
    if (!storeSlug) return;
    const status = await fetchOnboardingStatus(storeSlug, { signal });
    if (signal?.aborted) return;
    if (status.ok) {
      setOnboarding(status);
      setOnboardingError(null);
    } else if (status.error) {
      setOnboardingError(status.error);
    }
  }, [storeSlug]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshOnboarding(controller.signal);
    return () => controller.abort();
  }, [refreshOnboarding, products.length]);

  /**
   * Persist a step's value, then apply the recomputed status the server returns
   * (one authoritative response, rather than a guess at the new percentage).
   */
  const saveStep = useCallback(async (
    step: 'confirm_phone' | 'setup_branding' | 'pickup_point',
    value: string
  ) => {
    if (!storeSlug) return;
    setSavingStep(true);
    try {
      // Pass the merchant's email and id as well as the slug. The server uses
      // them as additional match keys, because a store created during signup may
      // be keyed by email — without them the step write matched no document and
      // the checklist could never reach 100%.
      const status = await completeOnboardingStep(storeSlug, step, value, {
        email: merchant?.email,
        store_id: (merchant as any)?.storeId,
        merchant_id: (merchant as any)?.merchantId || (merchant as any)?.id,
      });
      if (status?.ok) {
        setOnboarding(status);
        setOnboardingError(null);
      } else {
        // Fall back to a fresh read so the UI is still truthful about progress.
        await refreshOnboarding();
      }
    } finally {
      setSavingStep(false);
    }
  }, [storeSlug, refreshOnboarding]);

  // ── Step completion, derived from the SERVER status ──────────────────────
  // The product step also falls back to the locally-loaded products list so the
  // checklist stays correct while the status request is still in flight.
  const stepById = useMemo(() => {
    const map = new Map<string, { completed: boolean; detail: string }>();
    for (const step of onboarding?.steps || []) map.set(step.id, step);
    return map;
  }, [onboarding]);

  const serverCompleted = useCallback(
    (id: string) => Boolean(stepById.get(id)?.completed),
    [stepById]
  );

  const step1Complete = serverCompleted('add_product') || products.length > 0;
  const step2Complete = serverCompleted('setup_branding') || !!brandLogo;
  const step3Complete = serverCompleted('confirm_phone');
  const step4Complete = serverCompleted('pickup_point');
  const step5Complete = serverCompleted('payment_setup');

  // Prefer the server's percentage (it counts all five steps); fall back to a
  // local computation before the first response lands.
  const completedStepsCount = [step1Complete, step2Complete, step3Complete, step4Complete, step5Complete].filter(Boolean).length;
  const onboardingPercent = onboarding?.ok
    ? onboarding.progress
    : Math.round((completedStepsCount / 5) * 100);

  const stepDetail = (id: string, fallback: string) => stepById.get(id)?.detail || fallback;

  return (
    <div className="space-y-6 select-none bg-[#1C1814] p-4 sm:p-6 rounded-3xl border border-[#3E342B]/40 shadow-inner">
      
      {/* Distinct Merchant Admin vs Customer Storefront Links */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 1. Merchant Admin Dashboard Link */}
        <div className="bg-gradient-to-r from-[#221D19] to-[#1C1814] border border-[#3E342B] p-5 rounded-2xl flex flex-col justify-between gap-3 shadow-xl">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 font-bold text-[10px] rounded uppercase tracking-widest border border-blue-500/30">Merchant Portal</span>
              <span className="text-xs text-slate-400">দোকানদার অ্যাডমিন লিংক</span>
            </div>
            <h3 className="text-sm font-bold text-white">Your Admin Dashboard Link</h3>
            <p className="text-[11px] text-slate-400">Private management portal for managing your products, orders, settings, and analytics.</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-[#15110E] border border-[#3E342B] px-3 py-2 rounded-xl text-[11px] font-mono text-[#FCF6BA] overflow-hidden">
              <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="truncate">{window.location.origin}/dashboard/{merchant?.storeSlug || ''}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/dashboard/${merchant?.storeSlug || ''}`);
                  alert('Merchant Dashboard URL copied to clipboard!');
                }}
                className="flex-1 px-3 py-2 bg-[#2E241D] hover:bg-[#3D3027] text-blue-300 border border-[#4E3E33] font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Copy Admin Link</span>
              </button>
              <a
                href={`/dashboard/${merchant?.storeSlug || ''}`}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow"
              >
                <span>Open Dashboard</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* 2. Customer Public Storefront Link */}
        <div className="bg-gradient-to-r from-[#221D19] to-[#1C1814] border border-[#3E342B] p-5 rounded-2xl flex flex-col justify-between gap-3 shadow-xl">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 font-bold text-[10px] rounded uppercase tracking-widest border border-emerald-500/30">Customer Store</span>
              <span className="text-xs text-slate-400">কাস্টমার শপিং লিংক</span>
            </div>
            <h3 className="text-sm font-bold text-[#E6C587]">Your Sharable Public Store Link</h3>
            <p className="text-[11px] text-slate-400">Share this unique store URL with buyers on Facebook, WhatsApp, or Instagram for shopping.</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-[#15110E] border border-[#3E342B] px-3 py-2 rounded-xl text-[11px] font-mono text-[#FCF6BA] overflow-hidden">
              <Globe className="w-3.5 h-3.5 text-[#E6C587] shrink-0" />
              <span className="truncate">{window.location.origin}/e/{merchant?.storeSlug || ''}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/e/${merchant?.storeSlug || ''}`);
                  alert('Customer Store URL copied to clipboard!');
                }}
                className="flex-1 px-3 py-2 bg-[#2E241D] hover:bg-[#3D3027] text-[#E6C587] border border-[#4E3E33] font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Copy Customer Link</span>
              </button>
              <a
                href={`/e/${merchant?.storeSlug || ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 bg-gradient-to-r from-[#BF953F] to-[#B38728] hover:from-[#FCF6BA] hover:to-[#BF953F] text-slate-950 font-black text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow"
              >
                <span>Visit Customer Store</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Onboarding Setup Checklist (Zid-style 5 Steps) */}
      <div className="bg-[#221D19] border border-[#3E342B] p-5 sm:p-6 rounded-2xl shadow-lg relative overflow-hidden">
        {/* Glow Accent */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#D4AF37]/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-[#3E342B] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-950 uppercase bg-[#E6C587] px-2.5 py-0.5 rounded border border-[#FCF6BA]/45">
                Onboarding Setup Checklist
              </span>
              <span className="text-xs text-slate-400 font-medium pl-1">
                {completedStepsCount} of {onboarding?.totalCount ?? 5} Steps Complete ({onboardingPercent}%)
              </span>
              {onboardingError && (
                <span className="text-[10px] text-amber-400/80 pl-1" title={onboardingError}>
                  · progress could not be synced
                </span>
              )}
            </div>
            <h2 className="text-xl font-extrabold text-[#E6C587] mt-2">Setup Your Zid Store</h2>
          </div>

          <div className="w-full sm:w-48 bg-[#1C1814] p-1.5 rounded-xl border border-[#3E342B]">
            <div className="flex justify-between text-[10px] text-slate-400 mb-1">
              <span>Overall Progress</span>
              <span className="font-bold text-[#E6C587]">{onboardingPercent}%</span>
            </div>
            <div className="w-full h-2 bg-[#221D19] rounded-full overflow-hidden border border-[#3E342B]">
              <div 
                className="h-full bg-gradient-to-r from-[#BF953F] to-[#B38728] rounded-full transition-all duration-500"
                style={{ width: `${onboardingPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* 5 Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Step 01: Add product */}
          <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
            step1Complete 
              ? 'bg-[#1C1814] border-[#D4AF37]/40' 
              : 'bg-[#1C1814]/60 border-amber-600/40 hover:border-amber-500'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider bg-[#221D19] px-2 py-0.5 rounded border border-[#3E342B]">
                  Step 01
                </span>
                {step1Complete ? (
                  <CheckCircle2 className="w-4 h-4 text-[#E6C587]" />
                ) : (
                  <Clock className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <h3 className="font-bold text-white text-xs mb-1">Add product</h3>
              <p className="text-[11px] text-slate-400 line-clamp-2">
                {stepDetail('add_product', `${products.length} Products listed in stock`)}
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('products')}
              className={`mt-3 w-full py-2 px-3 font-bold text-[11px] rounded-xl flex items-center justify-center gap-1.5 transition ${
                step1Complete
                  ? 'bg-[#221D19] hover:bg-[#2E241D] text-slate-400 border border-[#3E342B]'
                  : 'bg-gradient-to-r from-[#BF953F] to-[#B38728] text-slate-950 border border-transparent shadow-lg shadow-[#BF953F]/10'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>{step1Complete ? 'Manage Products' : 'Add First Product'}</span>
            </button>
          </div>

          {/* Step 02: Add your branding */}
          <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
            step2Complete
              ? 'bg-[#1C1814] border-[#D4AF37]/40'
              : 'bg-[#1C1814]/60 border-amber-600/40 shadow-[0_0_15px_rgba(217,119,6,0.1)]'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider bg-[#221D19] px-2 py-0.5 rounded border border-[#3E342B]">
                  Step 02
                </span>
                {step2Complete ? (
                  <CheckCircle2 className="w-4 h-4 text-[#E6C587]" />
                ) : (
                  <Clock className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <h3 className="font-bold text-white text-xs mb-1">Store Branding</h3>
              <p className="text-[11px] text-slate-400 line-clamp-2">
                {stepDetail('setup_branding', 'Logo, theme color & banners set')}
              </p>
            </div>
            <button
              onClick={() => {
                setTempInput(brandLogo);
                setActiveModal('branding');
              }}
              className={`mt-3 w-full py-2 px-3 font-bold text-[11px] rounded-xl flex items-center justify-center gap-1.5 transition ${
                step2Complete
                  ? 'bg-[#221D19] hover:bg-[#2E241D] text-slate-400 border border-[#3E342B]'
                  : 'bg-gradient-to-r from-[#BF953F] to-[#B38728] text-slate-950 border border-transparent shadow-lg shadow-[#BF953F]/10'
              }`}
            >
              <Layout className="w-3.5 h-3.5" />
              <span>{step2Complete ? 'Edit Branding' : 'Setup Branding'}</span>
            </button>
          </div>

          {/* Step 03: Confirm support phone number */}
          <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
            step3Complete
              ? 'bg-[#1C1814] border-[#D4AF37]/40'
              : 'bg-[#1C1814]/60 border-amber-600/40 shadow-[0_0_15px_rgba(217,119,6,0.1)]'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider bg-[#221D19] px-2 py-0.5 rounded border border-[#3E342B]">
                  Step 03
                </span>
                {step3Complete ? (
                  <CheckCircle2 className="w-4 h-4 text-[#E6C587]" />
                ) : (
                  <Clock className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <h3 className="font-bold text-white text-xs mb-1">Support Contact</h3>
              <p className="text-[11px] text-slate-400 truncate">
                {stepDetail('confirm_phone', supportPhone || 'Contact not set')}
              </p>
            </div>
            <button
              onClick={() => {
                setTempInput(supportPhone);
                setActiveModal('phone');
              }}
              className={`mt-3 w-full py-2 px-3 font-bold text-[11px] rounded-xl flex items-center justify-center gap-1.5 transition ${
                step3Complete
                  ? 'bg-[#221D19] hover:bg-[#2E241D] text-slate-400 border border-[#3E342B]'
                  : 'bg-gradient-to-r from-[#BF953F] to-[#B38728] text-slate-950 border border-transparent shadow-lg shadow-[#BF953F]/10'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              <span>{step3Complete ? 'Change Phone' : 'Confirm Phone'}</span>
            </button>
          </div>

          {/* Step 04: Set pickup location */}
          <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
            step4Complete
              ? 'bg-[#1C1814] border-[#D4AF37]/40'
              : 'bg-[#1C1814]/60 border-amber-600/40 shadow-[0_0_15px_rgba(217,119,6,0.1)]'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider bg-[#221D19] px-2 py-0.5 rounded border border-[#3E342B]">
                  Step 04
                </span>
                {step4Complete ? (
                  <CheckCircle2 className="w-4 h-4 text-[#E6C587]" />
                ) : (
                  <Clock className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <h3 className="font-bold text-white text-xs mb-1">Pickup Point</h3>
              <p className="text-[11px] text-slate-400 truncate">
                {stepDetail('pickup_point', pickupLocation || 'Location not set')}
              </p>
            </div>
            <button
              onClick={() => {
                setTempInput(pickupLocation);
                setActiveModal('location');
              }}
              className={`mt-3 w-full py-2 px-3 font-bold text-[11px] rounded-xl flex items-center justify-center gap-1.5 transition ${
                step4Complete 
                  ? 'bg-[#221D19] hover:bg-[#2E241D] text-slate-400 border border-[#3E342B]' 
                  : 'bg-gradient-to-r from-[#BF953F] to-[#B38728] text-slate-950 border border-transparent shadow-lg shadow-[#BF953F]/10'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>{step4Complete ? 'Update Location' : 'Set Location'}</span>
            </button>
          </div>

          {/* Step 05: Setup payment & domain */}
          <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
            step5Complete 
              ? 'bg-[#1C1814] border-[#D4AF37]/40' 
              : 'bg-[#1C1814]/60 border-amber-600/40 shadow-[0_0_15px_rgba(217,119,6,0.1)]'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider bg-[#221D19] px-2 py-0.5 rounded border border-[#3E342B]">
                  Step 05
                </span>
                {step5Complete ? (
                  <CheckCircle2 className="w-4 h-4 text-[#E6C587]" />
                ) : (
                  <Clock className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <h3 className="font-bold text-white text-xs mb-1">Payment & Finance</h3>
              <p className="text-[11px] text-slate-400 line-clamp-2">
                {stepDetail('payment_setup', 'bKash, Bank & Domain')}
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('payments')}
              className={`mt-3 w-full py-2 px-3 font-bold text-[11px] rounded-xl flex items-center justify-center gap-1.5 transition ${
                step5Complete 
                  ? 'bg-[#221D19] hover:bg-[#2E241D] text-slate-400 border border-[#3E342B]' 
                  : 'bg-gradient-to-r from-[#BF953F] to-[#B38728] text-slate-950 border border-transparent shadow-lg shadow-[#BF953F]/10'
              }`}
            >
              <CreditCardIcon className="w-3.5 h-3.5" />
              <span>{step5Complete ? 'Manage Payments' : 'Setup Gateway'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#221D19] border border-[#3E342B] p-5 rounded-2xl relative">
          <div className="flex justify-between items-center text-slate-400 text-xs mb-2">
            <span>Total Sales Revenue</span>
            <span className="text-[#E6C587] font-bold text-[10px] bg-[#E6C587]/10 px-2 py-0.5 rounded">+18.4%</span>
          </div>
          <div className="text-2xl font-black text-[#E6C587]">৳{totalSalesBDT.toLocaleString()} <span className="text-xs text-slate-400 font-normal">BDT</span></div>
          <p className="text-[11px] text-slate-400 mt-1">Direct to your bank & bKash</p>
        </div>

        <div className="bg-[#221D19] border border-[#3E342B] p-5 rounded-2xl relative">
          <div className="flex justify-between items-center text-slate-400 text-xs mb-2">
            <span>Total Store Orders</span>
            <span className="text-amber-400 font-bold text-[10px] bg-amber-500/10 px-2 py-0.5 rounded">Real-time</span>
          </div>
          <div className="text-2xl font-black text-white">{orders.length}</div>
          <p className="text-[11px] text-slate-400 mt-1">100% fulfillable via Steadfast</p>
        </div>

        <div className="bg-[#221D19] border border-[#3E342B] p-5 rounded-2xl relative">
          <div className="flex justify-between items-center text-slate-400 text-xs mb-2">
            <span>Average Order Value</span>
            <span className="text-[#E6C587] font-bold text-[10px]">AOV</span>
          </div>
          <div className="text-2xl font-black text-white">৳0 <span className="text-xs text-slate-400 font-normal">BDT</span></div>
          <p className="text-[11px] text-slate-400 mt-1">Top category: None</p>
        </div>

        <div className="bg-[#221D19] border border-[#3E342B] p-5 rounded-2xl relative">
          <div className="flex justify-between items-center text-slate-400 text-xs mb-2">
            <span>Storefront Conversion</span>
            <span className="text-[#E6C587] font-bold text-[10px]">0.00%</span>
          </div>
          <div className="text-2xl font-black text-white">0.00%</div>
          <p className="text-[11px] text-slate-400 mt-1">High conversion via bKash 1-tap</p>
        </div>
      </div>

      {/* Top Performing Products Card */}
      <div className="bg-[#221D19] border border-[#3E342B] p-6 rounded-2xl shadow-lg">
        <h3 className="text-base font-bold text-white mb-4">Top Performing Products</h3>
        <div className="space-y-4">
          {topProducts.map((p) => (
            <div key={p.id} className="flex items-center gap-4 p-3 bg-[#1C1814] rounded-xl border border-[#3E342B]">
              <SafeImage src={p.image} alt={p.title} className="w-12 h-12 rounded-lg object-cover" />
              <div className="flex-1">
                <div className="text-sm font-bold text-white">{p.title}</div>
                <div className="text-xs text-slate-400">Sales: {p.salesCount}</div>
              </div>
              <div className="text-lg font-black text-[#E6C587]">৳{p.priceBDT.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Grid: Sales Chart + Quick Merchant Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Chart */}
        <div className="lg:col-span-2 bg-[#221D19] border border-[#3E342B] p-6 rounded-2xl space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-bold text-white">Weekly Sales Volume (BDT ৳)</h3>
              <p className="text-xs text-slate-400">Merchant revenue trajectory</p>
            </div>
            <button 
              onClick={() => onNavigateTab('analytics')}
              className="text-xs text-[#E6C587] font-bold hover:underline flex items-center gap-1"
            >
              <span>Full Analytics</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dynamicSalesData}>
                <XAxis dataKey="day" stroke="#8C7A6B" fontSize={12} tickLine={false} />
                <YAxis stroke="#8C7A6B" fontSize={12} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1C1814', borderColor: '#3E342B', borderRadius: '12px', color: '#fff' }}
                  formatter={(val: any) => [`৳${val.toLocaleString()} BDT`, 'Sales']}
                />
                <Line type="monotone" dataKey="salesBDT" stroke="#E6C587" strokeWidth={3} dot={{ fill: '#E6C587' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick Shortcut Panel */}
        <div className="bg-[#221D19] border border-[#3E342B] p-6 rounded-2xl space-y-4">
          <h3 className="text-base font-bold text-[#E6C587]">Quick Merchant Actions</h3>

          <div className="space-y-2 text-xs">
            <button
              onClick={() => onNavigateTab('products')}
              className="w-full bg-[#1C1814] hover:bg-[#2E241D] border border-[#3E342B] p-3 rounded-xl flex items-center justify-between text-slate-200 transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Package className="w-4 h-4 text-[#E6C587]" />
                <span className="font-semibold">Add New Product</span>
              </div>
              <Plus className="w-4 h-4 text-slate-400" />
            </button>

            <button
              onClick={() => onNavigateTab('payments')}
              className="w-full bg-[#1C1814] hover:bg-[#2E241D] border border-[#3E342B] p-3 rounded-xl flex items-center justify-between text-slate-200 transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-4 h-4 text-amber-500" />
                <span className="font-semibold">Manage bKash / Bank Accounts</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              onClick={() => onNavigateTab('logistics')}
              className="w-full bg-[#1C1814] hover:bg-[#2E241D] border border-[#3E342B] p-3 rounded-xl flex items-center justify-between text-slate-200 transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Truck className="w-4 h-4 text-[#E6C587]" />
                <span className="font-semibold">Steadfast Courier Integration</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              onClick={onOpenSubscriptionModal}
              className="w-full bg-gradient-to-r from-[#D4AF37]/20 to-[#BF953F]/20 border border-[#D4AF37]/45 p-3 rounded-xl flex items-center justify-between text-[#E6C587] font-bold transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4" />
                <span>Renew SaaS Plan (3/6/12 Mo)</span>
              </div>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="bg-[#221D19] border border-[#3E342B] p-6 rounded-2xl space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-bold text-white">Recent Storefront Orders</h3>
          <button
            onClick={() => onNavigateTab('orders')}
            className="text-xs text-[#E6C587] font-bold hover:underline flex items-center gap-1"
          >
            <span>View All Orders</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#1C1814] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#3E342B]">
              <tr>
                <th className="p-3">Order Number</th>
                <th className="p-3">Customer</th>
                <th className="p-3">City / Zone</th>
                <th className="p-3">Payment Method</th>
                <th className="p-3">Total BDT</th>
                <th className="p-3">Fulfillment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3E342B]">
              {orders.slice(0, 4).map((o) => (
                <tr key={o.id} className="hover:bg-[#2E241D]">
                  <td className="p-3 font-mono font-bold text-white">{o.orderNumber}</td>
                  <td className="p-3 font-semibold text-slate-200">{o.customerName}</td>
                  <td className="p-3 text-slate-400">{o.customerCity} ({o.deliveryZone})</td>
                  <td className="p-3">
                    <span className="bg-[#1C1814] px-2 py-0.5 rounded border border-[#3E342B] font-bold text-slate-200">
                      {o.paymentMethod}
                    </span>
                  </td>
                  <td className="p-3 font-extrabold text-[#E6C587]">৳{o.totalBDT.toLocaleString()}</td>
                  <td className="p-3">
                    <span className="bg-[#E6C587]/20 text-[#E6C587] text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {o.fulfillmentStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Step Modal: Confirm Phone Number */}
      {activeModal === 'phone' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#221D19] border border-[#3E342B] w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-[#3E342B]">
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-[#E6C587]" />
                <h3 className="font-bold text-white text-base">Step 03: Support Phone Number</h3>
              </div>
              <button onClick={() => setActiveModal('none')} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-300 mb-4">
              Enter your store's primary customer support contact phone number. This will appear on storefront invoices and SMS notifications.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-300 mb-1">Support Phone Number (BD)</label>
              <input
                type="text"
                value={tempInput}
                onChange={(e) => setTempInput(e.target.value)}
                placeholder="+880 1700-000000"
                className="w-full bg-[#1C1814] border border-[#3E342B] rounded-xl px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setActiveModal('none')} 
                className="px-4 py-2 bg-[#1C1814] text-slate-300 rounded-xl text-xs font-bold border border-[#3E342B]"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  const phone = tempInput || '';
                  setSupportPhone(phone);
                  setActiveModal('none');
                  // Persist the value, then apply the recomputed checklist.
                  await saveStep('confirm_phone', phone);
                }}
                disabled={savingStep}
                className="px-4 py-2 bg-gradient-to-r from-[#BF953F] to-[#B38728] text-slate-950 rounded-xl text-xs font-extrabold flex items-center gap-1 disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                <span>{savingStep ? 'Saving…' : 'Confirm Phone'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step Modal: Set Pickup Location */}
      {activeModal === 'location' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#221D19] border border-[#3E342B] w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-[#3E342B]">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#E6C587]" />
                <h3 className="font-bold text-white text-base">Step 04: Shipment Pickup Location</h3>
              </div>
              <button onClick={() => setActiveModal('none')} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-300 mb-4">
              Set the exact warehouse or store address where Steadfast & Paperfly couriers will pick up package parcels.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-300 mb-1">Pickup Address (Dhaka / BD)</label>
              <textarea
                rows={3}
                value={tempInput}
                onChange={(e) => setTempInput(e.target.value)}
                placeholder="Enter pickup address"
                className="w-full bg-[#1C1814] border border-[#3E342B] rounded-xl px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setActiveModal('none')}
                className="px-4 py-2 bg-[#1C1814] text-slate-300 rounded-xl text-xs font-bold border border-[#3E342B]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const location = tempInput || '';
                  setPickupLocation(location);
                  setActiveModal('none');
                  await saveStep('pickup_point', location);
                }}
                disabled={savingStep}
                className="px-4 py-2 bg-gradient-to-r from-[#BF953F] to-[#B38728] text-slate-950 rounded-xl text-xs font-extrabold flex items-center gap-1 disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                <span>{savingStep ? 'Saving…' : 'Save Location'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step Modal: Branding Setup */}
      {activeModal === 'branding' && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#221D19] border border-[#3E342B] w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-[#3E342B]">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-[#E6C587]" />
                <h3 className="font-bold text-white text-base">Step 02: Add Your Branding</h3>
              </div>
              <button onClick={() => setActiveModal('none')} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-300 mb-4">
              Add your store logo and banner image URL to personalize your Zid customer storefront.
            </p>
            <div className="mb-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Store Logo URL</label>
                <input
                  type="text"
                  value={tempInput}
                  onChange={(e) => setTempInput(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-[#1C1814] border border-[#3E342B] rounded-xl px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
                />
              </div>
              {tempInput && (
                <div className="flex items-center gap-3 bg-[#1C1814] p-2 rounded-xl border border-[#3E342B]">
                  <SafeImage src={tempInput} alt="Preview" className="w-10 h-10 rounded-lg object-cover" />
                  <span className="text-[11px] text-slate-400">Logo Image Preview</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setActiveModal('none')}
                className="px-4 py-2 bg-[#1C1814] text-slate-300 rounded-xl text-xs font-bold border border-[#3E342B]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const logo = tempInput || '';
                  setBrandLogo(logo);
                  setActiveModal('none');
                  await saveStep('setup_branding', logo);
                }}
                disabled={savingStep}
                className="px-4 py-2 bg-gradient-to-r from-[#BF953F] to-[#B38728] text-slate-950 rounded-xl text-xs font-extrabold flex items-center gap-1 disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                <span>{savingStep ? 'Saving…' : 'Save Branding'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <ZidAiAssistant />
    </div>
  );
};
