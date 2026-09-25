import React, { useState, useEffect } from 'react';
import { MerchantProfile } from '../../types';
import { safeSetItem } from '../../utils/safeStorage';
import { 
  Grid, 
  Smartphone, 
  Check, 
  Zap, 
  Sparkles, 
  Settings, 
  ExternalLink, 
  ShieldCheck, 
  MessageSquare, 
  Truck, 
  Send, 
  Share2, 
  CheckCircle2, 
  X, 
  Lock, 
  Key, 
  Phone, 
  Globe,
  Crown,
  AlertTriangle
} from 'lucide-react';

export interface AppIntegrationConfig {
  id: string;
  name: string;
  category: 'Marketing' | 'Logistics' | 'Communication' | 'Payments';
  description: string;
  iconBg: string;
  iconText: string;
  badge: string;
  tier: 'FREE' | 'PRO';
  priceLabel: string;
  isConnected: boolean;
  field1Label: string;
  field1Value: string;
  field2Label?: string;
  field2Value?: string;
  field3Label?: string;
  field3Value?: string;
}

interface AppsWhatsAppViewProps {
  merchant?: MerchantProfile;
  platformSettings?: any;
  onOpenSubscriptionModal?: () => void;
}

export const AppsWhatsAppView: React.FC<AppsWhatsAppViewProps> = ({
  merchant,
  platformSettings,
  onOpenSubscriptionModal
}) => {
  // Merchant Plan State (Standard Free vs Pro Plan)
  const [merchantPlan, setMerchantPlan] = useState<'FREE' | 'PRO'>(() => {
    const savedPlan = localStorage.getItem('zid_merchant_plan');
    return (savedPlan === 'PRO' ? 'PRO' : 'FREE');
  });

  useEffect(() => {
    safeSetItem('zid_merchant_plan', merchantPlan);
  }, [merchantPlan]);

  // Master Apps Integration State with LocalStorage Persistence
  const [integrations, setIntegrations] = useState<AppIntegrationConfig[]>(() => {
    const saved = localStorage.getItem('zid_bd_app_integrations');
    const defaultApps: AppIntegrationConfig[] = [
      {
        id: 'fb-pixel',
        name: 'Facebook Pixel & Conversions API (CAPI)',
        category: 'Marketing',
        description: 'Track PageView, AddToCart, and Purchase events reliably via server-side CAPI and browser pixel.',
        iconBg: 'bg-blue-600/20 text-blue-400',
        iconText: 'FB',
        badge: 'Recommended',
        tier: 'FREE',
        priceLabel: 'Included Free',
        isConnected: true,
        field1Label: 'Facebook Pixel ID',
        field1Value: '891029384710293',
        field2Label: 'Conversions API (CAPI) Token',
        field2Value: 'EAAG...ZDh2ZD'
      },
      {
        id: 'tiktok-pixel',
        name: 'TikTok Pixel & Ads (CAPI)',
        category: 'Marketing',
        description: 'Optimize TikTok ad campaigns, track conversion checkouts, and build custom audiences in Bangladesh.',
        iconBg: 'bg-pink-600/20 text-pink-400',
        iconText: 'TK',
        badge: 'Popular',
        tier: 'PRO',
        priceLabel: 'Pro ($19/mo)',
        isConnected: false,
        field1Label: 'TikTok Pixel ID',
        field1Value: '',
        field2Label: 'Access Token',
        field2Value: ''
      },
      {
        id: 'whatsapp-bot',
        name: 'WhatsApp Chat Widget',
        category: 'Communication',
        description: 'Floating chat widget on storefront + automated WhatsApp order confirmation and Steadfast tracking bot.',
        iconBg: 'bg-emerald-600/20 text-emerald-400',
        iconText: 'WA',
        badge: 'Active Bot',
        tier: 'FREE',
        priceLabel: 'Included Free',
        isConnected: true,
        field1Label: 'WhatsApp Business Number',
        field1Value: '+8801711223344',
        field2Label: 'Welcome Message Template',
        field2Value: 'Hi! Welcome to My Store. How can we help you today?'
      },
      {
        id: 'whatsapp-otp-api',
        name: 'WhatsApp OTP Provider Gateway (UltraMsg/Twilio/Meta)',
        category: 'Communication',
        description: 'Real-time 6-digit WhatsApp OTP verification dispatch via UltraMsg, Twilio, or Meta Cloud API.',
        iconBg: 'bg-[#25D366]/20 text-[#25D366]',
        iconText: 'OTP',
        badge: 'Live OTP',
        tier: 'FREE',
        priceLabel: 'Included Free',
        isConnected: true,
        field1Label: 'UltraMsg Instance ID / Twilio Account SID',
        field1Value: 'instance_live_zid_01',
        field2Label: 'API Token / Auth Secret',
        field2Value: 'token_live_wp_9981'
      },
      {
        id: 'courier-api',
        name: 'Steadfast Courier API',
        category: 'Logistics',
        description: 'One-click consignment creation, automatic tracking sync, and COD reconciliation for Bangladeshi couriers.',
        iconBg: 'bg-orange-600/20 text-orange-400',
        iconText: 'SF',
        badge: 'Essential',
        tier: 'FREE',
        priceLabel: 'Included Free',
        isConnected: true,
        field1Label: 'Steadfast API Key',
        field1Value: 'sf_live_key_908123',
        field2Label: 'Secret Key',
        field2Value: 'sec_99182374'
      },
      {
        id: 'bulk-sms',
        name: 'Bulk SMS Marketing (Greenweb/GP/BL)',
        category: 'Marketing',
        description: 'Send OTP verification codes, promotional SMS campaigns, and shipping updates via local BD SMS gateways.',
        iconBg: 'bg-cyan-600/20 text-cyan-400',
        iconText: 'SMS',
        badge: 'BD Gateway',
        tier: 'PRO',
        priceLabel: 'Pro ($19/mo)',
        isConnected: false,
        field1Label: 'SMS Gateway Provider',
        field1Value: 'Greenweb BD',
        field2Label: 'API Token / Masking Sender ID',
        field2Value: ''
      },
      {
        id: 'bkash-verifier',
        name: 'bKash TrxID Auto-Verification Engine',
        category: 'Payments',
        description: 'Instantly verifies customer bKash/Nagad Transaction IDs against merchant API to eliminate fake COD orders.',
        iconBg: 'bg-rose-600/20 text-rose-400',
        iconText: 'bK',
        badge: 'Automated',
        tier: 'PRO',
        priceLabel: 'Pro ($19/mo)',
        isConnected: true,
        field1Label: 'bKash Merchant Wallet Number',
        field1Value: '+8801811992233',
        field2Label: 'Merchant API Username/Password',
        field2Value: 'zid_merchant_live'
      }
    ];

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge tier and priceLabel from defaultApps to maintain pricing rules
          return defaultApps.map(def => {
            const found = parsed.find((p: any) => p.id === def.id);
            return found ? { ...def, isConnected: found.isConnected, field1Value: found.field1Value || def.field1Value, field2Value: found.field2Value || def.field2Value } : def;
          });
        }
      } catch (e) {
        // fallback
      }
    }
    return defaultApps;
  });

  // Save to LocalStorage on update
  useEffect(() => {
    safeSetItem('zid_bd_app_integrations', integrations);
  }, [integrations]);

  // Modal State for Connecting / Configuring an App
  const [selectedApp, setSelectedApp] = useState<AppIntegrationConfig | null>(null);
  const [upgradeLockApp, setUpgradeLockApp] = useState<AppIntegrationConfig | null>(null);

  const [f1Val, setF1Val] = useState('');
  const [f2Val, setF2Val] = useState('');
  const [f3Val, setF3Val] = useState('');

  const handleOpenConfigure = (app: AppIntegrationConfig) => {
    // Check if free merchant is attempting to open a PRO app
    if (app.tier === 'PRO' && merchantPlan === 'FREE') {
      setUpgradeLockApp(app);
      return;
    }

    setSelectedApp(app);
    setF1Val(app.field1Value);
    setF2Val(app.field2Value || '');
    setF3Val(app.field3Value || '');
  };

  const handleToggleConnection = (app: AppIntegrationConfig) => {
    // Check if free merchant is attempting to enable a PRO app
    if (app.tier === 'PRO' && merchantPlan === 'FREE' && !app.isConnected) {
      setUpgradeLockApp(app);
      return;
    }

    setIntegrations(prev => prev.map(item => {
      if (item.id === app.id) {
        return { ...item, isConnected: !item.isConnected };
      }
      return item;
    }));
  };

  const handleSaveIntegration = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;

    setIntegrations(prev => prev.map(item => {
      if (item.id === selectedApp.id) {
        return {
          ...item,
          isConnected: true,
          field1Value: f1Val,
          field2Value: f2Val,
          field3Value: f3Val
        };
      }
      return item;
    }));

    setSelectedApp(null);
    alert(`Successfully connected and saved configuration for ${selectedApp.name}! Settings applied to store.`);
  };

  const handleUpgradeAccount = () => {
    setMerchantPlan('PRO');
    const appToOpen = upgradeLockApp;
    setUpgradeLockApp(null);
    if (appToOpen) {
      setSelectedApp(appToOpen);
      setF1Val(appToOpen.field1Value);
      setF2Val(appToOpen.field2Value || '');
      setF3Val(appToOpen.field3Value || '');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner Header */}
      <div className="bg-[#202533] border border-[#2E3548] p-6 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] font-black text-[#00D68F] uppercase bg-[#00D68F]/10 px-2.5 py-0.5 rounded border border-[#00D68F]/20 tracking-wider">
              BANGLADESH E-COMMERCE APP MARKET
            </span>
            <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded border flex items-center gap-1 ${
              merchantPlan === 'PRO'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
            }`}>
              {merchantPlan === 'PRO' ? <Crown className="w-3 h-3 text-amber-400" /> : <ShieldCheck className="w-3 h-3 text-blue-400" />}
              <span>CURRENT PLAN: {merchantPlan === 'PRO' ? 'PRO PLAN ($19/MO)' : 'STANDARD FREE PLAN'}</span>
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <span>Marketing Integrations, Pixels & Automation Apps</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Connect Facebook CAPI, TikTok Pixels, WhatsApp bots, Steadfast Courier API, and bKash auto-verifiers with 1-click setup.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {/* Plan Toggle Button */}
          <button
            type="button"
            onClick={() => setMerchantPlan(merchantPlan === 'FREE' ? 'PRO' : 'FREE')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
              merchantPlan === 'FREE'
                ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30'
                : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/30'
            }`}
            title="Toggle Merchant Subscription Status for testing"
          >
            {merchantPlan === 'FREE' ? (
              <>
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>Simulate Pro Merchant</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                <span>Switch to Free Plan</span>
              </>
            )}
          </button>

          <div className="bg-[#181B26] border border-[#2E3548] px-4 py-2 rounded-xl text-xs font-bold text-slate-300 flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#00D68F] animate-pulse"></div>
            <span>{integrations.filter(i => i.isConnected).length} of {integrations.length} Apps Connected</span>
          </div>
        </div>
      </div>

      {/* App Market Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrations.map((app) => {
          const isProLocked = app.tier === 'PRO' && merchantPlan === 'FREE';

          return (
            <div 
              key={app.id} 
              className={`bg-[#202533] border rounded-2xl p-6 space-y-5 shadow-xl flex flex-col justify-between transition relative ${
                isProLocked ? 'border-amber-500/30 bg-gradient-to-b from-[#202533] to-[#1A1E2B]' : 'border-[#2E3548] hover:border-[#3A435E]'
              }`}
            >
              <div>
                <div className="flex justify-between items-start gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-base shadow-md ${app.iconBg}`}>
                      {app.iconText}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                          {app.category}
                        </span>
                        {/* TIER PRICE BADGE */}
                        {app.tier === 'PRO' ? (
                          <span className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[9px] font-black uppercase px-2 py-0.5 rounded-md flex items-center gap-1 shadow-xs">
                            <Crown className="w-2.5 h-2.5 text-amber-400" />
                            <span>PRO</span>
                          </span>
                        ) : (
                          <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[9px] font-black uppercase px-2 py-0.5 rounded-md flex items-center gap-1 shadow-xs">
                            <Check className="w-2.5 h-2.5 text-emerald-400" />
                            <span>FREE</span>
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-white text-base leading-tight mt-1">{app.name}</h3>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase shrink-0 ${
                    app.isConnected 
                      ? 'bg-[#00D68F]/20 text-[#00D68F] border border-[#00D68F]/30' 
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}>
                    {app.isConnected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  {app.description}
                </p>
              </div>

              <div className="space-y-3 pt-3 border-t border-[#2E3548]">
                {app.isConnected && app.field1Value && (
                  <div className="bg-[#181B26] px-3 py-2 rounded-xl border border-[#2E3548] text-[11px] font-mono text-slate-300 truncate flex items-center justify-between">
                    <span className="text-slate-500 truncate mr-2">{app.field1Label}: <span className="text-[#00D68F] font-bold">{app.field1Value}</span></span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenConfigure(app)}
                    className={`flex-1 font-bold py-2.5 px-4 rounded-xl text-xs transition cursor-pointer border flex items-center justify-center gap-1.5 shadow ${
                      isProLocked
                        ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-[#282E3F] hover:bg-[#32394E] text-white border-[#3A435E]'
                    }`}
                  >
                    {isProLocked ? (
                      <>
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Upgrade to Access</span>
                      </>
                    ) : (
                      <>
                        <Settings className="w-3.5 h-3.5 text-[#00D68F]" />
                        <span>{app.isConnected ? 'Configure Settings' : 'Connect App'}</span>
                      </>
                    )}
                  </button>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0" title="Quick Toggle">
                    <input
                      type="checkbox"
                      checked={app.isConnected}
                      onChange={() => handleToggleConnection(app)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[#181B26] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00D68F]"></div>
                  </label>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* UPGRADE LOCK POPUP MODAL FOR FREE MERCHANTS */}
      {upgradeLockApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
          <div className="bg-[#1C212E] border border-amber-500/40 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex justify-between items-start">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg">
                <Lock className="w-6 h-6" />
              </div>
              <button
                type="button"
                onClick={() => setUpgradeLockApp(null)}
                className="p-2 hover:bg-[#282E3F] rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/40 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                <Crown className="w-3 h-3" />
                <span>Pro Feature Locked</span>
              </div>
              <h3 className="text-xl font-black text-white">Upgrade Required</h3>
              <p className="text-xs text-slate-300 leading-relaxed pt-1">
                This is a Pro Integration. Upgrade your account to Pro Plan ($19/mo) to unlock Bulk SMS & bKash Auto-Verification.
              </p>
            </div>

            <div className="p-4 bg-[#13161F] rounded-2xl border border-[#2E3548] space-y-2 text-xs">
              <div className="font-bold text-slate-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>What's included in Pro Plan ($19/mo):</span>
              </div>
              <ul className="space-y-1.5 text-slate-400 text-[11px] pl-6 list-disc">
                <li>TikTok Pixel & Ads CAPI Integration</li>
                <li>Bulk SMS Marketing (Greenweb / GP / BL)</li>
                <li>bKash & Nagad TrxID Auto-Verification Engine</li>
                <li>0% Commission & Unlimited Orders</li>
              </ul>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleUpgradeAccount}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider transition cursor-pointer shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
              >
                <Crown className="w-4 h-4 fill-slate-950" />
                <span>Upgrade Now ($19/mo)</span>
              </button>
              <button
                type="button"
                onClick={() => setUpgradeLockApp(null)}
                className="w-full py-2.5 rounded-xl bg-[#282E3F] hover:bg-[#32394E] text-slate-400 font-bold text-xs transition cursor-pointer text-center"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Integration Setup Modal */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-[#1C212E] border border-[#2E3548] rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#2E3548] pb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${selectedApp.iconBg}`}>
                  {selectedApp.iconText}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-white">Configure {selectedApp.name}</h3>
                    {selectedApp.tier === 'PRO' ? (
                      <span className="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[9px] font-black uppercase px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Crown className="w-2.5 h-2.5 text-amber-400" />
                        <span>PRO</span>
                      </span>
                    ) : (
                      <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[9px] font-black uppercase px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Check className="w-2.5 h-2.5 text-emerald-400" />
                        <span>FREE</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">Enter your merchant credentials to inject tokens into store header.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedApp(null)}
                className="p-2 hover:bg-[#282E3F] rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveIntegration} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">
                  {selectedApp.field1Label} *
                </label>
                <input
                  type="text"
                  required
                  value={f1Val}
                  onChange={(e) => setF1Val(e.target.value)}
                  placeholder={`Enter ${selectedApp.field1Label}`}
                  className="w-full bg-[#13161F] border border-[#2E3548] rounded-xl px-4 py-3 text-xs text-white font-mono focus:border-[#00D68F] focus:outline-none shadow-inner"
                />
              </div>

              {selectedApp.field2Label && (
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    {selectedApp.field2Label}
                  </label>
                  <input
                    type="text"
                    value={f2Val}
                    onChange={(e) => setF2Val(e.target.value)}
                    placeholder={`Enter ${selectedApp.field2Label}`}
                    className="w-full bg-[#13161F] border border-[#2E3548] rounded-xl px-4 py-3 text-xs text-white font-mono focus:border-[#00D68F] focus:outline-none shadow-inner"
                  />
                </div>
              )}

              <div className="p-3.5 bg-[#13161F] rounded-2xl border border-[#2E3548] text-xs text-slate-300 space-y-1">
                <div className="font-bold text-[#00D68F] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Secure Server-Side & Client Injection</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  When connected, API keys and tracking pixels are automatically embedded into your storefront header/footer for lightning-fast conversion tracking.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#2E3548]">
                <button
                  type="button"
                  onClick={() => setSelectedApp(null)}
                  className="px-5 py-2.5 rounded-xl bg-[#282E3F] hover:bg-[#32394E] text-slate-300 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold text-xs transition cursor-pointer shadow-lg"
                >
                  Save & Connect Integration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
