import React, { useState } from 'react';
import { CourierService, MerchantProfile, CodConfig } from '../../types';
import SafeImage from '../SafeImage';
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
  Smartphone
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
  const [courierList, setCourierList] = useState<CourierService[]>(couriers);
  const [selectedCourierId, setSelectedCourierId] = useState<string>('steadfast');
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  const isPro = merchant?.subscriptionPlan !== 'trial';

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
    }
  };

  const handleSaveShippingSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateCodConfig(shippingForm);
    alert('Shipping settings saved successfully!');
  };

  const handleSaveApiKeys = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCourier) return;
    const updated = courierList.map((c) => {
      if (c.id === selectedCourierId) {
        return {
          ...c,
          isConnected: true,
          apiCredentials: apiForm,
          pickupAddress: pickupAddr,
          autoSyncOrders: autoSync,
        };
      }
      return c;
    });
    setCourierList(updated);
    onUpdateCouriers(updated);
    alert(`Successfully connected & saved credentials for ${currentCourier?.name || 'the courier'}!`);
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
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      c.isConnected ? 'bg-[#00D68F]/20 text-[#00D68F]' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {c.isConnected ? 'Connected' : 'Setup'}
                    </span>
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
              className="bg-[#282E3F] hover:bg-[#32394E] text-[#00D68F] font-bold px-6 py-2.5 rounded-xl text-xs border border-[#00D68F]/30 transition shadow-lg"
            >
              Save Shipping Settings
            </button>
          </div>
        </form>
      </div>

      {/* API Credential Setup Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-[#2E3548] pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#181B26] border border-[#2E3548] overflow-hidden p-1 flex items-center justify-center">
                {currentCourier?.logo ? (
                  <SafeImage src={currentCourier.logo} alt={currentCourier.name} className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <span className="text-white font-bold text-xs">{currentCourier?.name?.charAt(0) || 'C'}</span>
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-white">{currentCourier?.name || 'Courier'} API Configuration</h3>
                <p className="text-xs text-slate-400">Enter API keys provided by {currentCourier?.name || 'the'} merchant portal</p>
              </div>
            </div>

            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              currentCourier?.isConnected ? 'bg-[#00D68F]/20 text-[#00D68F]' : 'bg-amber-500/20 text-amber-400'
            }`}>
              {currentCourier?.isConnected ? 'API Live & Connected' : 'Configuration Pending'}
            </span>
          </div>

          <form onSubmit={handleSaveApiKeys} className="space-y-4 text-xs">
            {currentCourier?.id === 'steadfast' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Steadfast Client ID *</label>
                  <input
                    type="text"
                    required
                    value={apiForm.clientId || ''}
                    onChange={(e) => setApiForm({ ...apiForm, clientId: e.target.value })}
                    placeholder="sf_client_123"
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3.5 py-2.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Steadfast API Key *</label>
                  <input
                    type="text"
                    required
                    value={apiForm.apiKey || ''}
                    onChange={(e) => setApiForm({ ...apiForm, apiKey: e.target.value })}
                    placeholder="sf_live_key_bd_xxx"
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3.5 py-2.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Steadfast Secret Key *</label>
                  <input
                    type="password"
                    required
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
                  <label className="block text-slate-300 mb-1 font-semibold">Pathao Store ID *</label>
                  <input
                    type="text"
                    required
                    value={apiForm.storeId || ''}
                    onChange={(e) => setApiForm({ ...apiForm, storeId: e.target.value })}
                    placeholder="pathao_store_554"
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3.5 py-2.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Client ID *</label>
                  <input
                    type="text"
                    required
                    value={apiForm.clientId || ''}
                    onChange={(e) => setApiForm({ ...apiForm, clientId: e.target.value })}
                    placeholder="pathao_cli_xxx"
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3.5 py-2.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Pathao Client Secret *</label>
                  <input
                    type="password"
                    required
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
                  <label className="block text-slate-300 mb-1 font-semibold">Merchant API Key *</label>
                  <input
                    type="text"
                    required
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

            <div className="pt-4 border-t border-[#2E3548] flex justify-end">
              <button
                type="submit"
                className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-md"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Save Credentials & Verify API</span>
              </button>
            </div>
          </form>
        </div>

        {/* Shipping Rate Calculator Side Tool */}
        <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-4">
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
