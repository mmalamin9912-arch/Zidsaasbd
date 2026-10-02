import React, { useState, useEffect } from 'react';
import { CourierService, MerchantProfile, CodConfig } from '../../types';
import { useEntitlements } from '../../lib/planEntitlements';
import SafeImage from '../SafeImage';
import {  useToast } from '../ToastProvider';
import {
  loadShippingConfig,
  saveShippingConfig,
  loadCourierConfig,
  saveCourierConfig,
  type CourierConfig,
} from '../../lib/logisticsApi';
import {
  Truck,
  Key,
  CheckCircle2,
  Calculator,
  MapPin,
  Settings,
  Building2,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  Search,
  Check,
  Lock,
  Zap,
  Info,
  DollarSign,
  AlertCircle,
  Smartphone,
  X
} from 'lucide-react';

interface LogisticsViewProps {
  merchant: MerchantProfile;
  couriers: CourierService[];
  codConfig: CodConfig;
  onUpdateCouriers: (couriers: CourierService[]) => void;
  onUpdateCodConfig: (config: CodConfig) => void;
}

export const LogisticsView: React.FC<LogisticsViewProps> = ({
  merchant,
  couriers,
  codConfig,
  onUpdateCouriers,
  onUpdateCodConfig,
}) => {
  const toast = useToast();
  const [courierList, setCourierList] = useState<CourierService[]>(couriers);
  const [selectedCourierId, setSelectedCourierId] = useState<string>('steadfast');
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  // The API credential form is a real popup modal, opened by the Setup button
  // (or by clicking a courier card).
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  // Sandbox/Test mode: book parcels against a local mock so a merchant can try
  // the whole dispatch flow without real Steadfast/Pathao/RedX credentials.
  const [sandboxMode, setSandboxMode] = useState(false);

  // Live courier API is gated by the ACTIVE PLAN's `courierAutoSync` flag, not by
  // a hardcoded plan id — an admin switching the toggle off in Super Admin now
  // locks the courier tools immediately. Starter ships "Basic courier
  // integration" (`courierApi`) only, so it cannot auto-sync.
  const entitlements = useEntitlements();
  const isPro = entitlements.can('courierAutoSync');

  // Standard Shipping Settings State
  const [shippingForm, setShippingForm] = useState<CodConfig>(codConfig);

  // Shipping Rate Calculator State
  const [calcWeightKg, setCalcWeightKg] = useState<number>(1);
  const [calcDestination, setCalcDestination] = useState<'inside' | 'outside' | 'sub'>('inside');
  const [calcResults, setCalcResults] = useState<{ courier: string; charge: number; days: string }[] | null>(null);

  // Selected courier API form state
  const currentCourier = courierList.find((c) => c.id === selectedCourierId) || courierList[0];
  const [apiForm, setApiForm] = useState(currentCourier?.apiCredentials || {});
  const [pickupAddr, setPickupAddr] = useState(currentCourier?.pickupAddress || '');
  const [autoSync, setAutoSync] = useState(currentCourier?.autoSyncOrders || false);

  const handleSelectCourier = (id: string) => {
    const isAutomated = ['steadfast', 'pathao', 'redx'].includes(id);

    if (isAutomated && !isPro) {
      setIsUpgradeModalOpen(true);
      return;
    }

    setSelectedCourierId(id);
    const target = courierList.find((c) => c.id === id);
    if (target) {
      setApiForm(target.apiCredentials);
      setPickupAddr(target.pickupAddress);
      setAutoSync(target.autoSyncOrders);
      setSandboxMode((target as any).sandboxMode === true);
    }
    setIsSetupModalOpen(true);
  };

  /**
   * Open the Setup popup for one courier from its dedicated button.
   *
   * The card's own onClick also opens this, but the button makes the affordance
   * explicit — "Setup" now visibly does what it says instead of merely
   * highlighting the card and leaving the form to be discovered further down.
   */
  const handleOpenSetup = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    handleSelectCourier(id);
  };

  const [sandboxBookingCount, setSandboxBookingCount] = useState(0);
  const [lastSandboxBooking, setLastSandboxBooking] = useState<{ id: string; courier: string } | null>(null);

  /**
   * Sandbox tracking id, e.g. `TEST-STEADFAST-1001`.
   *
   * The numeric suffix is derived from the courier's own booking counter so a
   * test merchant sees a stable, sequential reference rather than a random one.
   */
  const buildSandboxTrackingId = (courierId: string): string => {
    const prefix = (courierId || 'courier').replace(/[^a-z0-9]/gi, '').toUpperCase();
    const seq = String(1000 + sandboxBookingCount + 1).padStart(4, '0');
    return `TEST-${prefix}-${seq}`;
  };

  /** Simulate a parcel booking without touching a real courier API. */
  const handleSimulateBooking = () => {
    const courierName = currentCourier?.name || 'Courier';
    const trackingId = buildSandboxTrackingId(selectedCourierId);
    setSandboxBookingCount((n) => n + 1);
    setLastSandboxBooking({ id: trackingId, courier: courierName });
    toast.success(`Sandbox booking created via ${courierName}`, {
      description: `Test tracking ID: ${trackingId} — no real parcel was dispatched.`,
    });
  };

  // Hydrate the delivery fees from MongoDB on mount. The store record is the
  // source of truth — a value saved in another tab/device must win over the
  // local `codConfig` copy, or the merchant edits one number and sees another.
  const [isSavingShipping, setIsSavingShipping] = useState(false);
  const [isSavingCourier, setIsSavingCourier] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const stored = await loadShippingConfig(merchant?.storeSlug);
      if (!active || !stored) return;
      setShippingForm((prev) => ({
        ...prev,
        isEnabled: stored.isEnabled,
        insideDhakaFee: stored.insideDhakaFee ?? '',
        outsideDhakaFee: stored.outsideDhakaFee ?? '',
        subDhakaFee: stored.subDhakaFee ?? '',
        freeShippingThreshold: stored.freeShippingThreshold ?? '',
        maxOrderLimit: stored.maxOrderLimit ?? '',
        requestAdvanceDeliveryCharge: stored.requestAdvanceDeliveryCharge,
        advanceDeliveryChargeAmount: stored.advanceDeliveryChargeAmount ?? '',
      }));
    })();

    (async () => {
      // Reflect the persisted connection state on the courier cards so a key
      // saved in a previous session still reads as "connected".
      const stored = await loadCourierConfig(merchant?.storeSlug);
      if (!active || !stored?.perCourier) return;
      setCourierList((prev) =>
        prev.map((c) => {
          const entry = stored.perCourier[c.id];
          if (!entry) return c;
          return {
            ...c,
            isConnected: entry.isConnected,
            sandboxMode: (entry as any).sandboxMode === true,
            pickupAddress: entry.pickupAddress || c.pickupAddress,
            autoSyncOrders: entry.autoSyncOrders,
          };
        }),
      );
    })();

    return () => { active = false; };
  }, [merchant?.storeSlug]);

  const handleSaveShippingSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingShipping(true);
    // Update local state first so the UI feels instant, then persist to Mongo.
    onUpdateCodConfig(shippingForm);
    const saved = await saveShippingConfig(merchant?.storeSlug, shippingForm);
    setIsSavingShipping(false);

    if (!saved) {
      toast.error('Shipping settings could not be saved to the database.', {
        description: 'Your changes are kept locally. Please check the connection and try again.',
      });
      return;
    }
    toast.success('Shipping settings saved successfully!', {
      description: 'Delivery fees are now live on your storefront checkout.',
    });
  };

  const handleSaveApiKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCourier) return;

    // In sandbox mode the credentials are optional — that is the whole point of
    // a test mode: a merchant can exercise dispatch before they have live keys.
    const updated = courierList.map((c) => {
      if (c.id === selectedCourierId) {
        return {
          ...c,
          isConnected: true,
          sandboxMode,
          apiCredentials: apiForm,
          pickupAddress: pickupAddr,
          autoSyncOrders: autoSync,
        };
      }
      return c;
    });

    setCourierList(updated);
    onUpdateCouriers(updated);
    setIsSavingCourier(true);

    // Persist to MongoDB. Previously these credentials lived only in React
    // state, so they were lost on reload and the server had nothing to book with.
    const perCourier: CourierConfig['perCourier'] = {};
    for (const c of updated) {
      perCourier[c.id] = {
        isConnected: c.isConnected === true,
        sandboxMode: (c as any).sandboxMode === true,
        apiKey: c.apiCredentials?.apiKey || '',
        secretKey: c.apiCredentials?.secretKey || '',
        clientId: c.apiCredentials?.clientId || '',
        clientSecret: c.apiCredentials?.clientSecret || '',
        storeId: c.apiCredentials?.storeId || '',
        pickupAddress: c.pickupAddress || '',
        autoSyncOrders: c.autoSyncOrders === true,
      };
    }

    const saved = await saveCourierConfig(merchant?.storeSlug, {
      selectedCourierId,
      perCourier,
    });
    setIsSavingCourier(false);

    if (!saved) {
      toast.error('Courier credentials could not be saved to the database.', {
        description: 'Nothing was stored. Please check the connection and try again.',
      });
      return;
    }

    toast.success('Successfully connected & saved credentials', {
      description: sandboxMode
        ? `${currentCourier?.name || 'The courier'} is linked in SANDBOX mode — bookings are simulated.`
        : `${currentCourier?.name || 'The courier'} is now linked to your store.`,
    });
  };

  const handleRunCalculator = (e: React.FormEvent) => {
    e.preventDefault();
    let baseFee = calcDestination === 'inside' ? 80 : calcDestination === 'sub' ? 100 : 150;
    const extraWeightFee = calcWeightKg > 1 ? (calcWeightKg - 1) * 20 : 0;

    const results = [
      {
        courier: 'Steadfast Courier',
        charge: baseFee + extraWeightFee,
        days: calcDestination === 'inside' ? '24 Hours' : '2-3 Days',
      },
      {
        courier: 'Pathao Courier',
        charge: baseFee + extraWeightFee + 10,
        days: calcDestination === 'inside' ? 'Same Day / 24h' : '2 Days',
      },
      {
        courier: 'RedX Logistics',
        charge: baseFee + extraWeightFee - 5,
        days: '2-4 Days',
      },
    ];

    setCalcResults(results);
  };

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-500/20 text-indigo-400 text-xs font-bold px-2.5 py-0.5 rounded-full border border-indigo-500/30 uppercase">
              Bangladeshi Logistics API
            </span>
            <span className="text-xs text-slate-400">• Automated Parcel Booking</span>
          </div>
          <h1 className="text-xl font-bold text-white mt-1">Courier Services & Dispatch Integration</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Connect Steadfast, Pathao, RedX, eCourier & Paperfly for 1-click order fulfillment across 64 districts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-300 font-semibold bg-[#181B26] px-3 py-1.5 rounded-xl border border-[#2E3548]">
            Active Couriers: <strong className="text-[#00D68F]">{courierList.filter((c) => c.isConnected).length} / {courierList.length}</strong>
          </span>
        </div>
      </div>

      {/* Courier Selection Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {courierList.map((c) => {
          const isSelected = c.id === selectedCourierId;
          const isAutomated = ['steadfast', 'pathao', 'redx'].includes(c.id);
          
          return (
            <div
              key={c.id}
              onClick={() => handleSelectCourier(c.id)}
              className={`
                bg-[#202533] border rounded-2xl p-4 cursor-pointer transition-all flex flex-col justify-between relative overflow-hidden
                ${isSelected 
                  ? 'border-[#00D68F] ring-2 ring-[#00D68F]/20 bg-gradient-to-b from-[#202533] to-[#262C3D]' 
                  : 'border-[#2E3548] hover:border-slate-500'
                }
              `}
            >
              {isAutomated && (
                <div className="absolute top-0 right-0">
                  <div className="bg-indigo-600 text-white text-[9px] font-black px-2 py-0.5 rounded-bl-lg flex items-center gap-1 shadow-md">
                    <Zap className="w-2.5 h-2.5 fill-white" />
                    PRO
                  </div>
                </div>
              )}

              <div>
                <div className="flex justify-between items-start mb-2">
                  <div className="w-10 h-10 rounded-xl bg-[#181B26] border border-[#2E3548] overflow-hidden p-1 flex items-center justify-center">
                    {c?.logo ? (
                      <SafeImage src={c.logo} alt={c.name} className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <span className="text-white font-bold text-xs">{c?.name?.charAt(0) || 'C'}</span>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick={(e) => handleOpenSetup(e, c.id)}
                      aria-label={`Setup ${c.name}`}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition cursor-pointer hover:brightness-125 ${
                        c.isConnected ? 'bg-[#00D68F]/20 text-[#00D68F]' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {c.isConnected ? 'Connected' : 'Setup'}
                    </button>
                    {(c as any).sandboxMode && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                        SANDBOX
                      </span>
                    )}
                    {isAutomated && !isPro && (
                      <Lock className="w-3 h-3 text-slate-500" />
                    )}
                  </div>
                </div>

                <h3 className="font-bold text-white text-xs sm:text-sm">{c?.name || 'Courier'}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{c.description}</p>
              </div>

              <div className="mt-3 pt-2 border-t border-[#2E3548] flex justify-between items-center text-[10px] text-slate-400">
                <span>{c.avgDeliveryDays}</span>
                <span className="font-semibold text-slate-300">{c.coverage.split(' ')[0]}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Standard Shipping Settings Form */}
      <div className="bg-[#202533] border border-[#2E3548] rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-[#202533] to-[#181B26] p-4 border-b border-[#2E3548] flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#00D68F]/10 flex items-center justify-center text-[#00D68F]">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Standard Delivery Fee Configuration</h3>
            <p className="text-[11px] text-slate-400">Set your flat-rate shipping fees for customer checkout</p>
          </div>
        </div>

        <form onSubmit={handleSaveShippingSettings} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">Inside Dhaka Delivery Fee</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">৳</span>
                <input 
                  type="number"
                  value={shippingForm.insideDhakaFee}
                  onChange={(e) => setShippingForm({...shippingForm, insideDhakaFee: e.target.value === '' ? '' : (parseInt(e.target.value) || 0)})}
                  placeholder="e.g. 60"
                  className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl pl-7 pr-3 py-2 text-white text-xs font-bold placeholder:text-slate-600 focus:outline-none focus:border-[#00D68F]"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">Outside Dhaka Delivery Fee</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">৳</span>
                <input 
                  type="number"
                  value={shippingForm.outsideDhakaFee}
                  onChange={(e) => setShippingForm({...shippingForm, outsideDhakaFee: e.target.value === '' ? '' : (parseInt(e.target.value) || 0)})}
                  placeholder="e.g. 120"
                  className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl pl-7 pr-3 py-2 text-white text-xs font-bold placeholder:text-slate-600 focus:outline-none focus:border-[#00D68F]"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">Free Shipping Threshold</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">৳</span>
                <input 
                  type="number"
                  value={shippingForm.freeShippingThreshold}
                  onChange={(e) => setShippingForm({...shippingForm, freeShippingThreshold: e.target.value === '' ? '' : (parseInt(e.target.value) || 0)})}
                  placeholder="e.g. 2000"
                  className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl pl-7 pr-3 py-2 text-[#00D68F] text-xs font-bold placeholder:text-slate-600 focus:outline-none focus:border-[#00D68F]"
                />
              </div>
              <p className="text-[10px] text-slate-500 italic">Free delivery on orders over this amount</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="bg-[#181B26] border border-[#2E3548] p-4 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-white">Advance Delivery Charge</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shippingForm.requestAdvanceDeliveryCharge}
                    onChange={(e) => setShippingForm({ ...shippingForm, requestAdvanceDeliveryCharge: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-[#202533] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>
              <p className="text-[10px] text-slate-400">Request partial payment (via bKash/Nagad) for delivery fees before processing order.</p>
              
              {shippingForm.requestAdvanceDeliveryCharge && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                  <label className="text-[10px] font-semibold text-slate-300 block mb-1">Advance Amount (৳)</label>
                  <input 
                    type="number"
                    value={shippingForm.advanceDeliveryChargeAmount}
                    onChange={(e) => setShippingForm({...shippingForm, advanceDeliveryChargeAmount: e.target.value === '' ? '' : (parseInt(e.target.value) || 0)})}
                    placeholder="e.g. 150"
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-3 py-2 text-white text-xs font-bold placeholder:text-slate-600 focus:outline-none focus:border-[#00D68F]"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">Shipping Instruction Notes</label>
              <textarea 
                rows={4}
                value={shippingForm.notes}
                onChange={(e) => setShippingForm({...shippingForm, notes: e.target.value})}
                placeholder="e.g. Delivery takes 2-3 business days. Please check parcel before payment."
                className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl p-3 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-[#00D68F]"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button 
              type="submit"
              disabled={isSavingShipping}
              className="bg-[#282E3F] hover:bg-[#32394E] text-[#00D68F] font-bold px-6 py-2.5 rounded-xl text-xs border border-[#00D68F]/30 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSavingShipping && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{isSavingShipping ? 'Saving…' : 'Save Shipping Settings'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* ── Courier API Setup Modal ────────────────────────────────────────
          A real popup: the Setup button (or a courier card) opens it. It also
          carries the Sandbox/Test toggle so a merchant can exercise the whole
          dispatch flow before they have live courier credentials. */}
      {isSetupModalOpen && currentCourier && (
        <div
          className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
          onClick={() => setIsSetupModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${currentCourier.name} API setup`}
        >
        <div
          className="w-full max-w-2xl bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-6 my-auto shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-[#2E3548] pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#181B26] border border-[#2E3548] overflow-hidden p-1 flex items-center justify-center">
                {currentCourier?.logo ? (
                  <SafeImage src={currentCourier.logo} alt={currentCourier.name} className="w-full h-full object-contain rounded-lg" />
                ) : (
                  <span className="text-white font-bold text-xs">{currentCourier?.name?.charAt(0) || 'C'}</span>
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-white">{currentCourier?.name || 'Courier'} API Configuration</h3>
                <p className="text-xs text-slate-400">Enter API keys provided by {currentCourier?.name || 'the'} merchant portal</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                sandboxMode
                  ? 'bg-amber-400/20 text-amber-300'
                  : currentCourier?.isConnected ? 'bg-[#00D68F]/20 text-[#00D68F]' : 'bg-amber-500/20 text-amber-400'
              }`}>
                {sandboxMode ? 'Sandbox Mode' : currentCourier?.isConnected ? 'API Live & Connected' : 'Configuration Pending'}
              </span>
              <button
                type="button"
                onClick={() => setIsSetupModalOpen(false)}
                aria-label="Close setup"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#282E3F] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sandbox / Test mode toggle */}
          <div className={`rounded-xl border p-4 transition ${sandboxMode ? 'bg-amber-400/10 border-amber-400/40' : 'bg-[#181B26] border-[#2E3548]'}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${sandboxMode ? 'bg-amber-400/20 text-amber-300' : 'bg-[#202533] text-slate-400'}`}>
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-white">Enable Sandbox / Test Mode</h4>
                    {sandboxMode && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-400 text-slate-950">TEST</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                    Simulate parcel booking with dummy tracking IDs — no real API keys or live dispatch required.
                  </p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={sandboxMode}
                  onChange={(e) => setSandboxMode(e.target.checked)}
                  data-testid="sandbox-mode-toggle"
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-[#181B26] border border-[#3A435E] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-400 peer-checked:border-amber-400"></div>
              </label>
            </div>

            {sandboxMode && (
              <div className="mt-3 pt-3 border-t border-amber-400/20 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSimulateBooking}
                  className="bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Simulate Test Booking</span>
                </button>
                {lastSandboxBooking && (
                  <span className="text-[11px] font-mono text-amber-300 bg-slate-950/60 border border-amber-400/30 px-2.5 py-1 rounded-lg">
                    {lastSandboxBooking.id}
                  </span>
                )}
                <span className="text-[11px] text-slate-400">
                  Credentials below are optional while sandbox mode is on.
                </span>
              </div>
            )}
          </div>

          <form onSubmit={handleSaveApiKeys} className="space-y-4 text-xs">
            {currentCourier?.id === 'steadfast' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Steadfast Client ID {sandboxMode ? '' : '*'}</label>
                  <input
                    type="text"
                    required={!sandboxMode}
                    value={apiForm.clientId || ''}
                    onChange={(e) => setApiForm({ ...apiForm, clientId: e.target.value })}
                    placeholder="sf_client_123"
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3.5 py-2.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Steadfast API Key {sandboxMode ? '' : '*'}</label>
                  <input
                    type="text"
                    required={!sandboxMode}
                    value={apiForm.apiKey || ''}
                    onChange={(e) => setApiForm({ ...apiForm, apiKey: e.target.value })}
                    placeholder="sf_live_key_bd_xxx"
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3.5 py-2.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Steadfast Secret Key {sandboxMode ? '' : '*'}</label>
                  <input
                    type="password"
                    required={!sandboxMode}
                    value={apiForm.secretKey || ''}
                    onChange={(e) => setApiForm({ ...apiForm, secretKey: e.target.value })}
                    placeholder="sf_sec_xxx"
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3.5 py-2.5 text-white font-mono"
                  />
                </div>
              </div>
            )}

            {currentCourier?.id === 'pathao' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Pathao Store ID {sandboxMode ? '' : '*'}</label>
                  <input
                    type="text"
                    required={!sandboxMode}
                    value={apiForm.storeId || ''}
                    onChange={(e) => setApiForm({ ...apiForm, storeId: e.target.value })}
                    placeholder="pathao_store_554"
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3.5 py-2.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Client ID {sandboxMode ? '' : '*'}</label>
                  <input
                    type="text"
                    required={!sandboxMode}
                    value={apiForm.clientId || ''}
                    onChange={(e) => setApiForm({ ...apiForm, clientId: e.target.value })}
                    placeholder="pathao_cli_xxx"
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3.5 py-2.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Pathao Client Secret {sandboxMode ? '' : '*'}</label>
                  <input
                    type="password"
                    required={!sandboxMode}
                    value={apiForm.clientSecret || ''}
                    onChange={(e) => setApiForm({ ...apiForm, clientSecret: e.target.value })}
                    placeholder="pathao_cli_secret_xxx"
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3.5 py-2.5 text-white font-mono"
                  />
                </div>
              </div>
            )}

            {(currentCourier?.id === 'redx' || currentCourier?.id === 'ecourier' || currentCourier?.id === 'paperfly') && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Merchant ID / ID</label>
                  <input
                    type="text"
                    value={apiForm.storeId || ''}
                    onChange={(e) => setApiForm({ ...apiForm, storeId: e.target.value })}
                    placeholder="Merchant ID"
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3.5 py-2.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Merchant API Key {sandboxMode ? '' : '*'}</label>
                  <input
                    type="text"
                    required={!sandboxMode}
                    value={apiForm.apiKey || ''}
                    onChange={(e) => setApiForm({ ...apiForm, apiKey: e.target.value })}
                    placeholder="Enter API Key"
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3.5 py-2.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Secret / Token</label>
                  <input
                    type="password"
                    value={apiForm.secretKey || ''}
                    onChange={(e) => setApiForm({ ...apiForm, secretKey: e.target.value })}
                    placeholder="Enter Secret"
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3.5 py-2.5 text-white font-mono"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-slate-300 mb-1 font-semibold">Default Warehouse / Pickup Address in Bangladesh</label>
              <input
                type="text"
                value={pickupAddr}
                onChange={(e) => setPickupAddr(e.target.value)}
                placeholder="Enter your warehouse/pickup address for courier collection"
                className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3.5 py-2.5 text-white"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-[#181B26] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00D68F]"></div>
              </label>
              <span className="text-slate-300 font-semibold">Auto-Sync Orders & Generate Courier Tracking Code</span>
            </div>

            <div className="pt-4 border-t border-[#2E3548] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsSetupModalOpen(false)}
                className="bg-[#282E3F] hover:bg-[#32394E] text-slate-200 font-semibold px-5 py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingCourier}
                className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingCourier ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 stroke-[3]" />
                )}
                <span>{isSavingCourier ? 'Saving…' : sandboxMode ? 'Save & Keep in Sandbox' : 'Save Credentials & Verify API'}</span>
              </button>
            </div>
          </form>
        </div>
        </div>
      )}

      {/* Shipping Rate Calculator Side Tool */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3 bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Calculator className="w-5 h-5 text-[#00D68F]" />
            <span>Courier Delivery Fee Estimator</span>
          </div>

          <form onSubmit={handleRunCalculator} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-300 mb-1">Parcel Weight (KG)</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={calcWeightKg}
                onChange={(e) => setCalcWeightKg(parseFloat(e.target.value) || 1)}
                className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3 py-2 text-white font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1">Delivery Destination Zone</label>
              <select
                value={calcDestination}
                onChange={(e) => setCalcDestination(e.target.value as any)}
                className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3 py-2 text-white font-semibold"
              >
                <option value="inside">Inside Dhaka (Metropolitan)</option>
                <option value="sub">Sub-Dhaka / Dhaka Suburbs</option>
                <option value="outside">Outside Dhaka (64 Districts)</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full bg-[#282E3F] hover:bg-[#32394E] text-[#00D68F] font-bold py-2 rounded-xl border border-[#00D68F]/30 cursor-pointer"
            >
              Calculate Estimated Rate
            </button>
          </form>

          {calcResults && (
            <div className="bg-[#181B26] border border-[#2E3548] rounded-xl p-3 space-y-2 text-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Courier Fee Comparison:</span>
              {calcResults.map((r, i) => (
                <div key={i} className="flex justify-between items-center py-1 border-b border-[#2E3548] last:border-none">
                  <span className="text-white font-semibold">{r.courier}</span>
                  <div className="text-right">
                    <span className="text-[#00D68F] font-bold">৳{r.charge} BDT</span>
                    <div className="text-[10px] text-slate-400">{r.days}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* PRO Feature Upgrade Modal */}
      {isUpgradeModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-indigo-500/40 rounded-3xl p-8 w-full max-w-md text-center space-y-6 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-pulse"></div>
            
            <div className="w-20 h-20 bg-indigo-500/20 rounded-3xl flex items-center justify-center mx-auto border border-indigo-500/30">
              <Zap className="w-10 h-10 text-indigo-400 fill-indigo-400" />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-black text-white">Unlock PRO Logistics</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Automated 1-Click Courier Dispatch & Live Tracking is a <strong className="text-indigo-300 font-black">PRO</strong> feature. 
                Upgrade your plan to unlock automated parcel booking with Steadfast, Pathao & RedX.
              </p>
            </div>

            <div className="bg-[#242938] rounded-2xl p-4 border border-[#2E3548] text-left space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#00D68F]" />
                <span>Bulk Order Dispatch to Couriers</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#00D68F]" />
                <span>Auto-generated Tracking IDs</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#00D68F]" />
                <span>Real-time SMS Tracking Alerts</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={() => setIsUpgradeModalOpen(false)}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
              >
                <span>Upgrade Plan Now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setIsUpgradeModalOpen(false)}
                className="text-slate-500 text-xs font-bold hover:text-slate-300"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogisticsView;
