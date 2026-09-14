import React, { useState, useEffect, useCallback } from 'react';
import { MerchantProfile, SettingsSubTab } from '../../types';
import { 
  Settings as SettingsIcon, 
  User, 
  ShieldCheck, 
  Globe, 
  ShoppingCart, 
  Gift, 
  FileText, 
  Sliders, 
  Truck, 
  Percent, 
  CheckCircle, 
  Bell, 
  Key, 
  Download, 
  ChevronDown, 
  ChevronRight, 
  MessageSquare, 
  Smartphone, 
  Mail, 
  Store, 
  Link, 
  BookOpen, 
  Save,
  Sparkles,
  Check,
  Image as ImageIcon,
  UploadCloud,
  Eye,
  EyeOff,
  Copy,
  RefreshCw,
  Monitor,
  Laptop
} from 'lucide-react';

interface SettingsViewProps {
  merchant: MerchantProfile;
  onUpdateMerchant: (updated: MerchantProfile) => void;
  initialSubTab?: SettingsSubTab;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  merchant,
  onUpdateMerchant,
  initialSubTab = 'settings_account',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>(initialSubTab);
  const [isCommExpanded, setIsCommExpanded] = useState(true);
  const [isStoreExpanded, setIsStoreExpanded] = useState(true);
  
  // Local state for forms
  const [storeName, setStoreName] = useState(merchant?.storeName || '');
  const [storeSlug, setStoreSlug] = useState(merchant?.storeSlug || '');
  const [supportEmail, setSupportEmail] = useState(merchant?.supportEmail || '');
  const [supportPhone, setSupportPhone] = useState(merchant?.supportPhone || '');
  const [logoUrl, setLogoUrl] = useState(merchant?.logoUrl || '');
  const [storeTagline, setStoreTagline] = useState(merchant?.storeTagline || '');
  const [storeDescription, setStoreDescription] = useState(merchant?.storeDescription || '');
  const [whatsappNumber, setWhatsappNumber] = useState(merchant?.whatsappNumber || '');
  const [facebookUrl, setFacebookUrl] = useState(merchant?.facebookUrl || '');
  const [instagramUrl, setInstagramUrl] = useState(merchant?.instagramUrl || '');
  const [tiktokUrl, setTiktokUrl] = useState(merchant?.tiktokUrl || '');
  
  const [currency, setCurrency] = useState(merchant?.currency || 'BDT');
  const [language, setLanguage] = useState(merchant?.language || 'en');
  const [taxRate, setTaxRate] = useState('15%');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Security Tab State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  // Live security state loaded from the backend (2FA · sessions · credentials).
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityBusy, setSecurityBusy] = useState<string>('');
  const [securityNotice, setSecurityNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [activeSessions, setActiveSessions] = useState<Array<{ id: string; device: string; ip: string; lastActiveAt: string; createdAt?: string }>>([]);
  const [currentSessionId, setCurrentSessionId] = useState('');

  // Checkout Tab State
  const [checkoutAnnouncement, setCheckoutAnnouncement] = useState('');
  const [minOrderAmount, setMinOrderAmount] = useState('');
  const [guestCheckout, setGuestCheckout] = useState(true);
  const [requirePhone, setRequirePhone] = useState(true);
  const [customField1, setCustomField1] = useState('');
  const [customField2, setCustomField2] = useState('');

  // Gift Tab State
  const [enableGiftWrap, setEnableGiftWrap] = useState(false);
  const [giftWrapFee, setGiftWrapFee] = useState('');
  const [allowGiftMessage, setAllowGiftMessage] = useState(false);
  const [hidePriceTag, setHidePriceTag] = useState(false);

  // Invoice Tab State
  const [showInvoiceLogo, setShowInvoiceLogo] = useState(true);
  const [invoiceTitle, setInvoiceTitle] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('');
  const [vatRegistrationNumber, setVatRegistrationNumber] = useState('');
  const [invoiceFooterNote, setInvoiceFooterNote] = useState('');
  const [printFormat, setPrintFormat] = useState('Standard A4 / PDF');

  // Properties Tab State
  const [hideOutOfStock, setHideOutOfStock] = useState(false);
  const [allowPreOrder, setAllowPreOrder] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState('');
  const [minQtyPerProduct, setMinQtyPerProduct] = useState('');
  const [maxQtyPerOrder, setMaxQtyPerOrder] = useState('');
  const [autoCancelHours, setAutoCancelHours] = useState('');
  const [skuPrefix, setSkuPrefix] = useState('');

  // AI Recommendations
  const [aiRecommendationsEnabled, setAiRecommendationsEnabled] = useState(merchant.themeConfig?.aiRecommendationsEnabled || false);

  // Shipping & constraints tab state
  const [enableCod, setEnableCod] = useState(true);
  const [maxCodValue, setMaxCodValue] = useState('');
  const [requireAdvance, setRequireAdvance] = useState(false);
  const [advanceFee, setAdvanceFee] = useState('');
  const [insideCityFee, setInsideCityFee] = useState('');
  const [outsideCityFee, setOutsideCityFee] = useState('');
  const [freeShippingThreshold, setFreeShippingThreshold] = useState('');
  const [disableCodForSale, setDisableCodForSale] = useState(false);
  const [expressMobileBankingOnly, setExpressMobileBankingOnly] = useState(false);

  // Tax Tab State
  const [includeTaxInPrices, setIncludeTaxInPrices] = useState(true);
  const [taxOnDelivery, setTaxOnDelivery] = useState(false);
  const [separateTaxBreakdown, setSeparateTaxBreakdown] = useState(true);

  // NBR Integration State
  const [binNumber, setBinNumber] = useState('');
  const [autoGenerateMushak, setAutoGenerateMushak] = useState(false);
  const [nbrApiSecret, setNbrApiSecret] = useState('');
  const [showBinOnReceipt, setShowBinOnReceipt] = useState(false);

  // Notification Tab State
  const [sendEmailAlert, setSendEmailAlert] = useState(true);
  const [staffEmails, setStaffEmails] = useState('');
  const [sendSmsAlert, setSendSmsAlert] = useState(false);
  const [adminMobile, setAdminMobile] = useState('');
  const [notifyLowStock, setNotifyLowStock] = useState(true);
  const [playDashboardSound, setPlayDashboardSound] = useState(true);
  const [notifyCancellation, setNotifyCancellation] = useState(true);

  // API Tab State
  const [courierProvider, setCourierProvider] = useState('Steadfast Courier');
  const [courierApiKey, setCourierApiKey] = useState('');
  const [courierSecret, setCourierSecret] = useState('');
  const [fbPixelId, setFbPixelId] = useState('');
  const [fbCapiToken, setFbCapiToken] = useState('');
  const [ga4Id, setGa4Id] = useState('');
  const [smsApiKey, setSmsApiKey] = useState('');
  const [smsSenderId, setSmsSenderId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');

  // Domain Tab State
  const [domainName, setDomainName] = useState('');
  const [forceHttps, setForceHttps] = useState(true);
  const [primaryDomain, setPrimaryDomain] = useState('yourstore.com');
  const [userPlan, setUserPlan] = useState('free');

  // AI FAQ State
  const [generatedFaq, setGeneratedFaq] = useState<any>(null);
  const [chatbotScript, setChatbotScript] = useState<string>('');
  const [isGeneratingFaq, setIsGeneratingFaq] = useState(false);

  // Legal Policy State
  const [privacyPolicy, setPrivacyPolicy] = useState('');
  const [termsOfService, setTermsOfService] = useState('');
  const [returnPolicy, setReturnPolicy] = useState('');
  const [shippingPolicy, setShippingPolicy] = useState('');
  const [showLegalLinks, setShowLegalLinks] = useState(true);

  const handleCopy = (text: string, type: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(type);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  // ── Live security settings ──────────────────
  // The store reference the backend expects (slug, code or UUID all resolve).
  const storeRef = merchant?.storeSlug || merchant?.storeCode || merchant?.store_code || merchant?.id || '';

  /**
   * Session id for THIS browser tab. Kept in sessionStorage so each tab is its
   * own device entry and "Log Out All Other Devices" can preserve the current.
   */
  const ensureSessionId = () => {
    try {
      let id = sessionStorage.getItem('zid_merchant_session_id');
      if (!id) {
        id = `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
        sessionStorage.setItem('zid_merchant_session_id', id);
      }
      return id;
    } catch {
      return `sess_tmp_${Date.now().toString(36)}`;
    }
  };

  const helper = (device: string) => {
    if (/iPhone|iPad|iPod/i.test(device)) return Smartphone;
    if (/Android/i.test(device)) return Smartphone;
    if (/macOS|Windows|Linux/i.test(device)) return Laptop;
    return Monitor;
  };

  /** Reload 2FA flag, credentials and device list from the backend. */
  const loadSecuritySettings = useCallback(async () => {
    if (!storeRef) return;
    setSecurityLoading(true);
    try {
      const res = await fetch(`/api/security/settings?store_slug=${encodeURIComponent(storeRef)}`);
      const data = await res.json();
      if (data?.ok && data.security) {
        setTwoFactorEnabled(Boolean(data.security.twoFactorEnabled));
        if (data.security.merchantApiKey) setApiKey(data.security.merchantApiKey);
        if (data.security.webhookSecret) setWebhookSecret(data.security.webhookSecret);
        setActiveSessions(Array.isArray(data.security.sessions) ? data.security.sessions : []);
      }
    } catch (err) {
      console.warn('Security settings load warning:', err);
    } finally {
      setSecurityLoading(false);
    }
  }, [storeRef]);

  // Load on mount and whenever the Security tab is opened.
  useEffect(() => {
    if (activeSubTab === 'settings_security') loadSecuritySettings();
  }, [activeSubTab, loadSecuritySettings]);

  /** Register this browser as an active device and refresh the list. */
  const registerCurrentSession = useCallback(async () => {
    if (!storeRef) return;
    const sessionId = ensureSessionId();
    setCurrentSessionId(sessionId);
    try {
      const res = await fetch('/api/security/sessions/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_slug: storeRef, sessionId }),
      });
      const data = await res.json();
      if (data?.ok && data.security?.sessions) {
        setActiveSessions(data.security.sessions);
      }
    } catch (err) {
      console.warn('Session register warning:', err);
    }
  }, [storeRef]);

  useEffect(() => {
    if (activeSubTab === 'settings_security') registerCurrentSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubTab, storeRef]);

  /** Flip 2FA on/off. Turning it ON requires a verified WhatsApp OTP. */
  const handleToggleTwoFactor = async () => {
    if (!storeRef) {
      setSecurityNotice({ type: 'error', text: 'Store is not loaded yet. Please refresh and try again.' });
      return;
    }
    const next = !twoFactorEnabled;

    // Enabling 2FA: collect the merchant's WhatsApp number + OTP first.
    if (next) {
      const phone = merchant?.whatsappNumber || merchant?.phone || '';
      if (!phone) {
        setSecurityNotice({ type: 'error', text: 'Add a WhatsApp number in Account settings before enabling 2FA.' });
        return;
      }
      const code = window.prompt(`Enter the 6-digit WhatsApp OTP sent to ${phone}.\n(A code will be sent now if you have not received one.)`);

      setSecurityBusy('2fa');
      try {
        if (!code) {
          // No code entered — ask the backend to send one, then stop.
          await fetch('/api/auth/whatsapp-otp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, userType: 'merchant' }),
          });
          setSecurityNotice({ type: 'ok', text: `OTP sent to ${phone}. Click the toggle again and enter the code.` });
          return;
        }

        const res = await fetch('/api/security/2fa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_slug: storeRef, enabled: true, phone, code }),
        });
        const data = await res.json();
        if (!data?.ok) {
          setSecurityNotice({ type: 'error', text: data?.error || 'Could not enable 2FA.' });
          return;
        }
        setTwoFactorEnabled(true);
        setSecurityNotice({ type: 'ok', text: data.message || 'Two-factor authentication enabled.' });
      } catch (err: any) {
        setSecurityNotice({ type: 'error', text: err?.message || 'Could not enable 2FA.' });
      } finally {
        setSecurityBusy('');
      }
      return;
    }

    // Disabling 2FA needs no OTP.
    setSecurityBusy('2fa');
    try {
      const res = await fetch('/api/security/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_slug: storeRef, enabled: false }),
      });
      const data = await res.json();
      if (!data?.ok) {
        setSecurityNotice({ type: 'error', text: data?.error || 'Could not disable 2FA.' });
        return;
      }
      setTwoFactorEnabled(false);
      setSecurityNotice({ type: 'ok', text: data.message || 'Two-factor authentication disabled.' });
    } catch (err: any) {
      setSecurityNotice({ type: 'error', text: err?.message || 'Could not disable 2FA.' });
    } finally {
      setSecurityBusy('');
    }
  };

  /** Mint a brand-new API key / webhook secret and persist it server-side. */
  const handleRegenerateCredentials = async (type: 'api' | 'webhook' | 'both') => {
    if (!storeRef) {
      setSecurityNotice({ type: 'error', text: 'Store is not loaded yet. Please refresh and try again.' });
      return;
    }
    setSecurityBusy(type);
    try {
      const res = await fetch('/api/security/credentials/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_slug: storeRef, type }),
      });
      const data = await res.json();
      if (!data?.ok || !data.security) {
        setSecurityNotice({ type: 'error', text: data?.error || 'Could not regenerate credentials.' });
        return;
      }
      if (data.security.merchantApiKey) setApiKey(data.security.merchantApiKey);
      if (data.security.webhookSecret) setWebhookSecret(data.security.webhookSecret);
      setSecurityNotice({ type: 'ok', text: data.message || 'Credentials regenerated.' });
    } catch (err: any) {
      setSecurityNotice({ type: 'error', text: err?.message || 'Could not regenerate credentials.' });
    } finally {
      setSecurityBusy('');
    }
  };

  /** Revoke every other device, keeping this browser signed in. */
  const handleLogoutOtherDevices = async () => {
    if (!storeRef) return;
    const sessionId = currentSessionId || ensureSessionId();
    setSecurityBusy('sessions');
    try {
      const res = await fetch('/api/security/sessions/logout-others', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_slug: storeRef, sessionId }),
      });
      const data = await res.json();
      if (!data?.ok) {
        setSecurityNotice({ type: 'error', text: data?.error || 'Could not log out other devices.' });
        return;
      }
      setActiveSessions(data.security?.sessions || []);
      setSecurityNotice({ type: 'ok', text: data.message || 'Other devices logged out.' });
    } catch (err: any) {
      setSecurityNotice({ type: 'error', text: err?.message || 'Could not log out other devices.' });
    } finally {
      setSecurityBusy('');
    }
  };

  // Auto-dismiss the security toast.
  useEffect(() => {
    if (!securityNotice) return;
    const timer = setTimeout(() => setSecurityNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [securityNotice]);

  const PlanRestrictionBanner = () => (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between mb-6">
      <div className="text-sm text-amber-500">This advanced feature requires a Pro or Enterprise Plan. Upgrade to Unlock.</div>
      <button className="px-4 py-2 bg-amber-500 text-slate-950 font-bold rounded-lg text-xs hover:bg-amber-400 transition">Upgrade Plan</button>
    </div>
  );

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedThemeConfig = merchant.themeConfig ? {
      ...merchant.themeConfig,
      storeLogoText: storeName,
      aiRecommendationsEnabled
    } : {
      storeLogoText: storeName,
      aiRecommendationsEnabled
    };

    onUpdateMerchant({
      ...merchant,
      storeName,
      storeSlug,
      supportEmail,
      supportPhone,
      logoUrl,
      storeTagline,
      storeDescription,
      whatsappNumber,
      facebookUrl,
      instagramUrl,
      tiktokUrl,
      currency: currency as any,
      language: language as any,
      themeConfig: updatedThemeConfig,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const generateFaqAndChatbot = async () => {
    if (!privacyPolicy && !termsOfService && !returnPolicy && !shippingPolicy) {
      alert('Please fill in your store policies first so AI can analyze them.');
      return;
    }

    setIsGeneratingFaq(true);
    try {
      const response = await fetch('/api/ai/generate-faq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policies: {
            privacy: privacyPolicy,
            terms: termsOfService,
            return: returnPolicy,
            shipping: shippingPolicy
          },
          storeName: storeName
        }),
      });

      const data = await response.json();
      setGeneratedFaq(data.faq);
      setChatbotScript(data.chatbotScript);
    } catch (error) {
      console.error('AI FAQ Error:', error);
      alert('Failed to generate AI FAQ & Chatbot script.');
    } finally {
      setIsGeneratingFaq(false);
    }
  };

  const generalItems: { id: SettingsSubTab; label: string; icon: React.ElementType; isPro?: boolean }[] = [
    { id: 'settings_general', label: 'General', icon: SettingsIcon },
    { id: 'settings_account', label: 'Account settings', icon: User },
    { id: 'settings_security', label: 'Security settings', icon: ShieldCheck },
    { id: 'settings_languages', label: 'Languages & currencies', icon: Globe },
    { id: 'settings_checkout', label: 'Checkout page options', icon: ShoppingCart },
    { id: 'settings_gift', label: 'Gift options', icon: Gift },
    { id: 'settings_invoices', label: 'Configure your invoices', icon: FileText },
    { id: 'settings_properties', label: 'Orders and products properties', icon: Sliders },
    { id: 'settings_constraints', label: 'Shipping and payment constraints', icon: Truck },
    { id: 'settings_tax', label: 'Tax settings', icon: Percent },
    { id: 'settings_nbr', label: 'NBR VAT & E-Invoicing Integration (Bangladesh)', icon: CheckCircle },
    { id: 'settings_notifications', label: 'Staff notifications', icon: Bell },
    { id: 'settings_api', label: 'API integrations', icon: Key, isPro: true },
    { id: 'settings_export', label: 'Export requests', icon: Download, isPro: true },
  ];

  const communicationItems: { id: SettingsSubTab; label: string; icon: React.ElementType }[] = [
    { id: 'comm_sms', label: 'SMS notifications', icon: Smartphone },
    { id: 'comm_whatsapp', label: 'WhatsApp configuration', icon: MessageSquare },
    { id: 'comm_email', label: 'Email templates', icon: Mail },
  ];

  const storeSettingsItems: { id: SettingsSubTab; label: string; icon: React.ElementType; isPro?: boolean }[] = [
    { id: 'store_details', label: 'Store details', icon: Store },
    { id: 'store_domains', label: 'Custom domains', icon: Link, isPro: true },
    { id: 'store_policies', label: 'Legal policies', icon: BookOpen },
  ];

  const getSubTabTitle = () => {
    const all = [...generalItems, ...communicationItems, ...storeSettingsItems];
    const found = all.find(i => i.id === activeSubTab);
    return found ? found.label : 'Settings';
  };

  return (
    <div className="grid grid-cols-[280px_1fr] gap-6 min-h-[calc(100vh-140px)] items-start">
      
      {/* Left Zid-Style Settings Sidebar Navigation Panel */}
      <aside className="w-[280px] bg-[#161B28] border border-[#272F45] rounded-3xl p-4 shrink-0 shadow-xl space-y-6 sticky top-24">
        <div>
          <div className="px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Settings Hub</span>
            <span className="text-[10px] text-[#00D68F] bg-[#00D68F]/10 px-2 py-0.5 rounded-full border border-[#00D68F]/20">Zid Enterprise</span>
          </div>
        </div>

        <div className="space-y-6">
          
          {/* Group 1: General */}
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 px-3 pb-1">
              General
            </div>
            {generalItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSubTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSubTab(item.id)}
                  className={`
                    w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer text-left
                    ${isActive
                      ? 'bg-[#00D68F]/15 text-[#00D68F] font-bold border border-[#00D68F]/30 shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-[#1E2538]'
                    }
                  `}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#00D68F]' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                  {item.isPro && <span className="ml-auto text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded">Pro</span>}
                </button>
              );
            })}
          </div>

          {/* Group 2: Communications (Expandable dropdown) */}
          <div className="space-y-1 pt-2 border-t border-[#272F45]">
            <button
              onClick={() => setIsCommExpanded(!isCommExpanded)}
              className="w-full flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-slate-500 px-3 py-1 cursor-pointer hover:text-slate-300 transition"
            >
              <span>Communications</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCommExpanded ? 'rotate-180' : ''}`} />
            </button>

            {isCommExpanded && (
              <div className="space-y-1 pt-1">
                {communicationItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSubTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSubTab(item.id)}
                      className={`
                        w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer text-left
                        ${isActive
                          ? 'bg-[#00D68F]/15 text-[#00D68F] font-bold border border-[#00D68F]/30 shadow-xs'
                          : 'text-slate-300 hover:text-white hover:bg-[#1E2538]'
                        }
                      `}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#00D68F]' : 'text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Group 3: Store (Expandable dropdown) */}
          <div className="space-y-1 pt-2 border-t border-[#272F45]">
            <button
              onClick={() => setIsStoreExpanded(!isStoreExpanded)}
              className="w-full flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-slate-500 px-3 py-1 cursor-pointer hover:text-slate-300 transition"
            >
              <span>Store</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isStoreExpanded ? 'rotate-180' : ''}`} />
            </button>

            {isStoreExpanded && (
              <div className="space-y-1 pt-1">
                {storeSettingsItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSubTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSubTab(item.id)}
                      className={`
                        w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition cursor-pointer text-left
                        ${isActive
                          ? 'bg-[#00D68F]/15 text-[#00D68F] font-bold border border-[#00D68F]/30 shadow-xs'
                          : 'text-slate-300 hover:text-white hover:bg-[#1E2538]'
                        }
                      `}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#00D68F]' : 'text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                      {item.isPro && <span className="ml-auto text-[9px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded">Pro</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </aside>

      {/* Right Container: Active Settings Panel */}
      <main className="flex-1 bg-[#161B28] border border-[#272F45] rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#272F45] pb-6">
          <div>
            <div className="text-[11px] font-mono text-[#00D68F] uppercase tracking-wider">Configuration Panel</div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-0.5">{getSubTabTitle()}</h2>
            <p className="text-xs text-slate-400 mt-1">Manage your merchant account properties, regional constraints, and store configurations.</p>
          </div>

          {savedSuccess && (
            <div className="bg-[#00D68F]/20 border border-[#00D68F] text-[#00D68F] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 animate-bounce">
              <Check className="w-4 h-4" />
              <span>Settings saved successfully!</span>
            </div>
          )}
        </div>

        {/* Form Body for Active Tab */}
        <form onSubmit={handleSave} className="space-y-6 text-xs">
          
          {(activeSubTab === 'settings_general' || activeSubTab === 'settings_account' || activeSubTab === 'store_details') && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-bold mb-1.5">Store Title / Merchant Name</label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full bg-[#101420] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1.5">Store Slug URL Path</label>
                  <div className="flex">
                    <span className="bg-[#1D2436] border border-r-0 border-[#2E3852] px-3 py-2.5 rounded-l-xl text-slate-400 text-xs font-mono">/e/</span>
                    <input
                      type="text"
                      value={storeSlug}
                      onChange={(e) => setStoreSlug(e.target.value)}
                      className="w-full bg-[#101420] border border-[#2E3852] rounded-r-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-bold mb-1.5">Support Email Address</label>
                  <input
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    className="w-full bg-[#101420] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1.5">Support Phone Number</label>
                  <input
                    type="text"
                    value={supportPhone}
                    onChange={(e) => setSupportPhone(e.target.value)}
                    className="w-full bg-[#101420] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1.5">Store Tagline</label>
                <input
                  type="text"
                  value={storeTagline}
                  onChange={(e) => setStoreTagline(e.target.value)}
                  placeholder="e.g. Best Online Bookshop in BD"
                  className="w-full bg-[#101420] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1.5">Store Description / Bio</label>
                <textarea
                  value={storeDescription}
                  onChange={(e) => setStoreDescription(e.target.value)}
                  placeholder="Tell your customers about your store..."
                  rows={3}
                  className="w-full bg-[#101420] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none resize-none"
                />
              </div>

              <div className="space-y-3 pt-2">
                <label className="block text-slate-300 font-bold">Store Logo</label>
                <div className="flex items-start gap-6">
                  <div className="w-24 h-24 shrink-0 rounded-2xl bg-[#101420] border border-[#2E3852] overflow-hidden flex items-center justify-center">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Store Logo" className="w-full h-full object-contain p-2" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-600" />
                    )}
                  </div>
                  <div className="flex-1 space-y-3">
                    <label className="relative flex flex-col items-center justify-center w-full max-w-sm h-24 border-2 border-dashed border-[#2E3852] hover:border-[#00D68F] rounded-2xl cursor-pointer bg-[#101420]/50 transition-colors group">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <UploadCloud className="w-6 h-6 text-slate-400 group-hover:text-[#00D68F] transition-colors mb-2" />
                        <p className="text-xs text-slate-400"><span className="font-bold text-[#00D68F]">Click to upload</span> or drag and drop</p>
                      </div>
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const url = URL.createObjectURL(file);
                          setLogoUrl(url);
                        }
                      }} />
                    </label>
                    {logoUrl && (
                      <button type="button" onClick={() => setLogoUrl('')} className="text-xs font-bold text-red-400 hover:text-red-300 transition">Remove/Change Logo</button>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#272F45]">
                <h3 className="text-sm font-bold text-white mb-4">Social Media & Business Links</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5">WhatsApp Number (For Instant Chat)</label>
                    <input
                      type="text"
                      value={whatsappNumber}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                      placeholder="+8801..."
                      className="w-full bg-[#101420] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5">Facebook Page URL</label>
                    <input
                      type="text"
                      value={facebookUrl}
                      onChange={(e) => setFacebookUrl(e.target.value)}
                      placeholder="https://facebook.com/..."
                      className="w-full bg-[#101420] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5">Instagram Profile</label>
                    <input
                      type="text"
                      value={instagramUrl}
                      onChange={(e) => setInstagramUrl(e.target.value)}
                      placeholder="https://instagram.com/..."
                      className="w-full bg-[#101420] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5">TikTok Link</label>
                    <input
                      type="text"
                      value={tiktokUrl}
                      onChange={(e) => setTiktokUrl(e.target.value)}
                      placeholder="https://tiktok.com/@..."
                      className="w-full bg-[#101420] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'settings_languages' && (
            <div className="space-y-6">
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-[#00D68F]" />
                    Regional & Locale Settings
                  </h3>
                  <p className="text-sm text-slate-400">Configure your store's primary currency and display language for customers.</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5">Primary Store Currency</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as any)}
                      className="w-full bg-[#101420] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none"
                    >
                      <option value="BDT">BDT (Bangladeshi Taka ৳)</option>
                      <option value="USD">USD (US Dollar $)</option>
                      <option value="SAR">SAR (Saudi Riyal ﷼)</option>
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">Currency conversion rates update automatically via central bank APIs.</p>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5">Default Store Language</label>
                    <select 
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as any)}
                      className="w-full bg-[#101420] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none"
                    >
                      <option value="ar">Arabic (العربية)</option>
                      <option value="en">English (US)</option>
                      <option value="bn">Bengali (বাংলা)</option>
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">This language will be used for the storefront and automated communications.</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-[#272F45]">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#00D68F] hover:bg-[#00BD7E] text-slate-950 font-bold rounded-xl transition shadow-lg shadow-[#00D68F]/20"
                >
                  <Save className="w-4 h-4" />
                  Save Preferences
                </button>
              </div>
            </div>
          )}

          {activeSubTab === 'settings_tax' && (
            <div className="space-y-8">
              {/* Tax Identification Number */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    <Percent className="w-5 h-5 text-[#00D68F]" />
                    Tax Identification Number (TIN/VAT Number)
                  </h3>
                  <p className="text-sm text-slate-400">Configure your business tax registration details.</p>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1.5 text-sm">VAT / Tax Registration Number</label>
                  <input
                    type="text"
                    value={vatRegistrationNumber}
                    onChange={(e) => setVatRegistrationNumber(e.target.value)}
                    placeholder="যেমন: 300000000000003"
                    className="w-full max-w-sm bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500 font-mono"
                  />
                </div>
              </div>

              {/* Flexible VAT Rate & Calculation Modes */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white mb-1">Flexible VAT Rate & Calculation Modes</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Standard VAT / Tax Rate (%)</label>
                    <input
                      type="number"
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      placeholder="যেমন: ১৫"
                      className="w-full max-w-xs bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                    />
                  </div>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#161B28] rounded-xl border border-[#2E3852] gap-4">
                    <div>
                      <div className="font-bold text-white text-sm mb-0.5">Include Tax in Displayed Product Prices</div>
                      <div className="text-xs text-slate-400">Prices displayed on the storefront will automatically factor in VAT.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIncludeTaxInPrices(!includeTaxInPrices)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${includeTaxInPrices ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${includeTaxInPrices ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#161B28] rounded-xl border border-[#2E3852] gap-4">
                    <div>
                      <div className="font-bold text-white text-sm mb-0.5">Apply Tax / VAT on Delivery Charges</div>
                      <div className="text-xs text-slate-400">Calculate and add tax to the shipping and delivery fees.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTaxOnDelivery(!taxOnDelivery)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${taxOnDelivery ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${taxOnDelivery ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Tax Invoice Display Rule */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white mb-1">Tax Invoice Display Rule</h3>
                
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#161B28] rounded-xl border border-[#2E3852] gap-4">
                    <div>
                      <div className="font-bold text-white text-sm mb-0.5">Show Separate Tax Breakdown on Checkout and Receipt</div>
                      <div className="text-xs text-slate-400">e.g., Net Amount + Tax = Total. Provides transparency to customers.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSeparateTaxBreakdown(!separateTaxBreakdown)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${separateTaxBreakdown ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${separateTaxBreakdown ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'settings_security' && (
            <div className="space-y-8">
              {/* Change Password */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#00D68F]" />
                  Change Password
                </h3>
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5">Current Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none pr-10"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5">New Password</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5">Confirm New Password</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none"
                    />
                  </div>
                  <button type="button" className="px-5 py-2.5 bg-[#2E3852] hover:bg-[#3B4662] text-white font-bold rounded-xl text-sm transition">
                    Update Password
                  </button>
                </div>
              </div>

              {/* Security feedback toast (success / error) */}
              {securityNotice && (
                <div className={`rounded-xl px-4 py-3 text-sm font-medium border ${securityNotice.type === 'ok' ? 'bg-[#00D68F]/10 border-[#00D68F]/30 text-[#00D68F]' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                  {securityNotice.text}
                </div>
              )}

              {/* Two-Factor Authentication */}
              <div className="bg-[#101420] border-[#2E3852] rounded-2xl p-6 flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-[#00D68F]" />
                    Two-Factor Authentication (2FA)
                  </h3>
                  <p className="text-sm text-slate-400">Add an extra layer of security to your account using a WhatsApp OTP code.</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status:</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${twoFactorEnabled ? 'bg-[#00D68F]/10 text-[#00D68F]' : 'bg-red-500/10 text-red-500'}`}>
                      {twoFactorEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                    {securityLoading && (
                      <span className="text-[11px] text-slate-500">Loading…</span>
                    )}
                  </div>
                  {!merchant?.whatsappNumber && !merchant?.phone && (
                    <p className="text-xs text-amber-500 mt-2">Add a WhatsApp number in Account settings to enable 2FA.</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleToggleTwoFactor}
                  disabled={securityBusy === '2fa'}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${twoFactorEnabled ? 'bg-[#00D68F]' : 'bg-slate-600'} ${securityBusy === '2fa' ? 'opacity-60 cursor-wait' : ''}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${twoFactorEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Active Sessions */}
              <div className="bg-[#101420] border-[#2E3852] rounded-2xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                      <Monitor className="w-5 h-5 text-[#00D68F]" />
                      Active Sessions & Devices
                    </h3>
                    <p className="text-sm text-slate-400">Manage devices currently logged into your merchant account.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogoutOtherDevices}
                    disabled={securityBusy === 'sessions' || activeSessions.length <= 1}
                    className={`px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-xl text-xs transition border-red-500/20 whitespace-nowrap ${securityBusy === 'sessions' || activeSessions.length <= 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {securityBusy === 'sessions' ? 'Signing out…' : 'Log Out All Other Devices'}
                  </button>
                </div>

                <div className="space-y-3">
                  {activeSessions.length === 0 && (
                    <div className="p-4 bg-[#161B28] rounded-xl border-[#2E3852] text-sm text-slate-400">
                      No active device sessions found yet.
                    </div>
                  )}

                  {activeSessions.map((device) => {
                    const DeviceIcon = helper(device.device || "");
                    const isCurrent = device.id === currentSessionId;
                    return (
                      <div
                        key={device.id}
                        className={`flex items-center justify-between p-4 bg-[#161B28] rounded-xl border ${isCurrent ? 'border-[#00D68F]/30' : 'border-[#2E3852]'}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isCurrent ? 'bg-[#00D68F]/10 text-[#00D68F]' : 'bg-slate-800 text-slate-400'}`}>
                            <DeviceIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-bold text-white text-sm flex items-center gap-2">
                              {device.device || "Unknown device"}
                              {isCurrent && (
                                <span className="text-[10px] bg-[#00D68F] text-slate-950 px-1.5 py-0.5 rounded-sm font-black uppercase">Current</span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              IP: {device.ip || "Unknown"} • Last Active:{" "}
                              {device.lastActiveAt ? new Date(device.lastActiveAt).toLocaleString() : "N/A"}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* API & Webhook Credentials */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                  <Key className="w-5 h-5 text-[#00D68F]" />
                  API & Webhook Security Credentials
                </h3>
                <p className="text-sm text-slate-400 mb-6">Manage your secret keys for third-party integrations and webhooks. Do not share these.</p>
                
                <div className="space-y-4 max-w-2xl">
                  {/* API Key */}
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Merchant API Key</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={apiKey}
                          readOnly
                          className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-slate-300 outline-none font-mono text-sm"
                        />
                        <button 
                          type="button" 
                          onClick={() => handleCopy(apiKey, 'api')} 
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white bg-[#101420] rounded-lg border border-[#2E3852]"
                        >
                          {copiedKey === 'api' ? <Check className="w-4 h-4 text-[#00D68F]" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <button type="button" onClick={() => handleRegenerateCredentials('api')} className="px-4 py-2.5 bg-[#2E3852] hover:bg-[#3B4662] text-white font-bold rounded-xl text-sm transition flex items-center gap-2 whitespace-nowrap">
                        <RefreshCw className="w-4 h-4" />
                        Regenerate
                      </button>
                    </div>
                  </div>

                  {/* Webhook Secret */}
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Webhook Secret Token</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={webhookSecret}
                          readOnly
                          className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-slate-300 outline-none font-mono text-sm"
                        />
                        <button 
                          type="button" 
                          onClick={() => handleCopy(webhookSecret, 'webhook')} 
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white bg-[#101420] rounded-lg border border-[#2E3852]"
                        >
                          {copiedKey === 'webhook' ? <Check className="w-4 h-4 text-[#00D68F]" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <button type="button" onClick={() => handleRegenerateCredentials('webhook')} className="px-4 py-2.5 bg-[#2E3852] hover:bg-[#3B4662] text-white font-bold rounded-xl text-sm transition flex items-center gap-2 whitespace-nowrap">
                        <RefreshCw className="w-4 h-4" />
                        Regenerate
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'settings_checkout' && (
            <div className="space-y-8">
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-[#00D68F]" />
                    Checkout Experience
                  </h3>
                  <p className="text-sm text-slate-400">Customize how customers check out on your store.</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5">Checkout Announcement Notice</label>
                    <input
                      type="text"
                      value={checkoutAnnouncement}
                      onChange={(e) => setCheckoutAnnouncement(e.target.value)}
                      placeholder="যেমন: ঢাকার বাইরে ডেলিভারি চার্জ ১৩০ টাকা অগ্রিম পরিশোধ করতে হবে। কাস্টমার কেয়ার: 017XXXXXXXX"
                      className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                    />
                    <p className="text-xs text-slate-400 mt-1">This text will be prominently displayed at the top of the checkout page.</p>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5">Minimum Order Amount</label>
                    <input
                      type="number"
                      value={minOrderAmount}
                      onChange={(e) => setMinOrderAmount(e.target.value)}
                      placeholder="e.g. 500"
                      className="w-full max-w-xs bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white mb-4">Checkout Fields & Rules</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-[#161B28] rounded-xl border border-[#2E3852]">
                    <div>
                      <div className="font-bold text-white text-sm mb-0.5">Guest Checkout</div>
                      <div className="text-xs text-slate-400">Allow customers to check out without creating an account</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGuestCheckout(!guestCheckout)}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${guestCheckout ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${guestCheckout ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-[#161B28] rounded-xl border border-[#2E3852]">
                    <div>
                      <div className="font-bold text-white text-sm mb-0.5">Require Phone Number</div>
                      <div className="text-xs text-slate-400">Make the phone number field mandatory during checkout</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRequirePhone(!requirePhone)}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${requirePhone ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${requirePhone ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-[#2E3852] space-y-4">
                  <h4 className="text-sm font-bold text-white mb-2">Custom Fields (Optional)</h4>
                  
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Custom Field 1 Label</label>
                    <input
                      type="text"
                      value={customField1}
                      onChange={(e) => setCustomField1(e.target.value)}
                      placeholder="e.g. Special Instructions or Gift Message"
                      className="w-full max-w-md bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Custom Field 2 Label</label>
                    <input
                      type="text"
                      value={customField2}
                      onChange={(e) => setCustomField2(e.target.value)}
                      placeholder="e.g. Delivery Time Preference"
                      className="w-full max-w-md bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'settings_gift' && (
            <div className="space-y-8">
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    <Gift className="w-5 h-5 text-[#00D68F]" />
                    Gift Options
                  </h3>
                  <p className="text-sm text-slate-400">Configure gifting options for your customers during checkout.</p>
                </div>

                <div className="space-y-4">
                  {/* Gift Wrap Feature */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#161B28] rounded-xl border border-[#2E3852] gap-4">
                    <div>
                      <div className="font-bold text-white text-sm mb-0.5">Enable Gift Packaging Option at Checkout</div>
                      <div className="text-xs text-slate-400">Allow customers to request special gift wrapping for their order.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEnableGiftWrap(!enableGiftWrap)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${enableGiftWrap ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${enableGiftWrap ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {enableGiftWrap && (
                    <div className="pl-4 sm:pl-6 border-l-2 border-[#2E3852]">
                      <label className="block text-slate-300 font-bold mb-1.5 text-sm">Gift Wrapping Fee (৳)</label>
                      <input
                        type="number"
                        value={giftWrapFee}
                        onChange={(e) => setGiftWrapFee(e.target.value)}
                        placeholder="যেমন: ৫০"
                        className="w-full max-w-xs bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                      />
                      <p className="text-xs text-slate-500 mt-1">Leave empty or 0 if gift wrapping is free.</p>
                    </div>
                  )}

                  {/* Custom Message Feature */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#161B28] rounded-xl border border-[#2E3852] gap-4">
                    <div>
                      <div className="font-bold text-white text-sm mb-0.5">Allow Customers to Add Custom Gift Card Message</div>
                      <div className="text-xs text-slate-400">Provide a text box for customers to include a personalized message.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAllowGiftMessage(!allowGiftMessage)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${allowGiftMessage ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${allowGiftMessage ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  
                  {allowGiftMessage && (
                    <div className="pl-4 sm:pl-6 border-l-2 border-[#2E3852]">
                      <label className="block text-slate-300 font-bold mb-1.5 text-sm">Sample Preview (What customers see)</label>
                      <div className="p-3 bg-[#1A2033] border border-dashed border-[#2E3852] rounded-xl max-w-md">
                         <span className="text-sm text-slate-500 italic">যেমন: শুভ জন্মদিন! ঈশ্বর তোমার ভালো করুন।</span>
                      </div>
                    </div>
                  )}

                  {/* Hide Price Tag Feature */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#161B28] rounded-xl border border-[#2E3852] gap-4">
                    <div>
                      <div className="font-bold text-white text-sm mb-0.5">Hide Invoice Price Tag on Package Delivery (for surprise gifts)</div>
                      <div className="text-xs text-slate-400">Useful for surprise gifts so the recipient doesn't see the price.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHidePriceTag(!hidePriceTag)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${hidePriceTag ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${hidePriceTag ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'settings_invoices' && (
            <div className="space-y-8">
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[#00D68F]" />
                    Invoice Header & Logo Settings
                  </h3>
                  <p className="text-sm text-slate-400">Configure how your brand appears on printed invoices and receipts.</p>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#161B28] rounded-xl border border-[#2E3852] gap-4">
                    <div>
                      <div className="font-bold text-white text-sm mb-0.5">Show Store Logo on Printable Invoice</div>
                      <div className="text-xs text-slate-400">Display your store's uploaded logo on top of the invoice document.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowInvoiceLogo(!showInvoiceLogo)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${showInvoiceLogo ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${showInvoiceLogo ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Invoice Title / Header Text</label>
                    <input
                      type="text"
                      value={invoiceTitle}
                      onChange={(e) => setInvoiceTitle(e.target.value)}
                      placeholder="যেমন: Zid Book - Official Cash Memo"
                      className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white mb-1">Invoice Numbering & Business Tax Info</h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5 text-sm">Invoice Prefix</label>
                      <input
                        type="text"
                        value={invoicePrefix}
                        onChange={(e) => setInvoicePrefix(e.target.value)}
                        placeholder="যেমন: INV-2026-"
                        className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5 text-sm">VAT / Tax Registration Number (Optional)</label>
                      <input
                        type="text"
                        value={vatRegistrationNumber}
                        onChange={(e) => setVatRegistrationNumber(e.target.value)}
                        placeholder="যেমন: TRN-12345678"
                        className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500 font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white mb-1">Invoice Footer & Print Settings</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Invoice Footer Note / Return Policy</label>
                    <textarea
                      value={invoiceFooterNote}
                      onChange={(e) => setInvoiceFooterNote(e.target.value)}
                      placeholder="যেমন: আমাদের থেকে কেনাকাটা করার জন্য ধন্যবাদ! ৭ দিনের মধ্যে পণ্য পরিবর্তনের সুযোগ রয়েছে। কাস্টমার কেয়ার: 017XXXXXXXX"
                      rows={3}
                      className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Print Format</label>
                    <select
                      value={printFormat}
                      onChange={(e) => setPrintFormat(e.target.value)}
                      className="w-full max-w-sm bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none"
                    >
                      <option value="Standard A4 / PDF">Standard A4 / PDF</option>
                      <option value="3-Inch Thermal Receipt Printer (POS)">3-Inch Thermal Receipt Printer (POS)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'settings_properties' && (
            <div className="space-y-8">
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-[#00D68F]" />
                    Stock & Inventory Control Rules
                  </h3>
                  <p className="text-sm text-slate-400">Configure how stock is managed and displayed.</p>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#161B28] rounded-xl border border-[#2E3852] gap-4">
                    <div>
                      <div className="font-bold text-white text-sm mb-0.5">Hide Out-of-Stock Products automatically from Storefront</div>
                      <div className="text-xs text-slate-400">Products with 0 stock will be hidden from the catalog.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHideOutOfStock(!hideOutOfStock)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${hideOutOfStock ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${hideOutOfStock ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#161B28] rounded-xl border border-[#2E3852] gap-4">
                    <div>
                      <div className="font-bold text-white text-sm mb-0.5">Allow Customers to Pre-Order when Stock Quantity is 0</div>
                      <div className="text-xs text-slate-400">Let customers place pre-orders for out-of-stock items.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAllowPreOrder(!allowPreOrder)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${allowPreOrder ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${allowPreOrder ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Low Stock Alert Threshold</label>
                    <input
                      type="number"
                      value={lowStockThreshold}
                      onChange={(e) => setLowStockThreshold(e.target.value)}
                      placeholder="যেমন: ৫ (পিস কমালে নোটিফিকেশন দেবে)"
                      className="w-full max-w-sm bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white mb-1">Order Quantity & Limits</h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5 text-sm">Minimum Quantity Per Product</label>
                      <input
                        type="number"
                        value={minQtyPerProduct}
                        onChange={(e) => setMinQtyPerProduct(e.target.value)}
                        placeholder="যেমন: ১"
                        className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5 text-sm">Maximum Quantity Allowed Per Order</label>
                      <input
                        type="number"
                        value={maxQtyPerOrder}
                        onChange={(e) => setMaxQtyPerOrder(e.target.value)}
                        placeholder="যেমন: ১০"
                        className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white mb-1">Order Automation & SKUs</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Unpaid Order Auto-Cancellation (Hours)</label>
                    <input
                      type="number"
                      value={autoCancelHours}
                      onChange={(e) => setAutoCancelHours(e.target.value)}
                      placeholder="যেমন: ২৪ (ঘণ্টা পার হলে বাতিল হবে)"
                      className="w-full max-w-sm bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Automatic Product SKU Prefix</label>
                    <input
                      type="text"
                      value={skuPrefix}
                      onChange={(e) => setSkuPrefix(e.target.value)}
                      placeholder="যেমন: SK-ZID-"
                      className="w-full max-w-sm bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-[#00D68F]/5 border border-[#00D68F]/20 rounded-2xl p-6 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#00D68F]/20 text-[#00D68F] flex items-center justify-center">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">AI Personalized Recommendation Engine</h3>
                    <p className="text-sm text-slate-400">Boost conversion with AI-driven 'Frequently Bought Together' suggestions</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#161B28] rounded-xl border border-[#2E3852] gap-4">
                  <div>
                    <div className="font-bold text-white text-sm mb-0.5">Activate AI Product Recommendations</div>
                    <div className="text-xs text-slate-400">Show similar items and smart bundles on product pages automatically.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAiRecommendationsEnabled(!aiRecommendationsEnabled)}
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${aiRecommendationsEnabled ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${aiRecommendationsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'settings_constraints' && (
            <div className="space-y-8">
              {/* Cash on Delivery (COD) Constraints */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    <Truck className="w-5 h-5 text-[#00D68F]" />
                    Cash on Delivery (COD) Constraints
                  </h3>
                  <p className="text-sm text-slate-400">Manage rules for Cash on Delivery orders.</p>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#161B28] rounded-xl border border-[#2E3852] gap-4">
                    <div>
                      <div className="font-bold text-white text-sm mb-0.5">Enable Cash on Delivery (COD) Option</div>
                      <div className="text-xs text-slate-400">Allow customers to pay when they receive their orders.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEnableCod(!enableCod)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${enableCod ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${enableCod ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {enableCod && (
                    <div className="pl-4 sm:pl-6 border-l-2 border-[#2E3852] space-y-4">
                      <div>
                        <label className="block text-slate-300 font-bold mb-1.5 text-sm">Maximum Order Value for COD (৳)</label>
                        <input
                          type="number"
                          value={maxCodValue}
                          onChange={(e) => setMaxCodValue(e.target.value)}
                          placeholder="যেমন: ৫০০০"
                          className="w-full max-w-sm bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                        />
                      </div>
                      
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#1A2033] rounded-xl border border-[#2E3852] gap-4">
                        <div>
                          <div className="font-bold text-white text-sm mb-0.5">Require Advance Delivery Charge Payment for COD Orders</div>
                          <div className="text-xs text-slate-400">Customers must pay a partial advance fee to confirm COD orders.</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRequireAdvance(!requireAdvance)}
                          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${requireAdvance ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                        >
                          <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${requireAdvance ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>

                      {requireAdvance && (
                        <div className="pl-4 sm:pl-6">
                          <label className="block text-slate-300 font-bold mb-1.5 text-sm">Advance Delivery Fee (৳)</label>
                          <input
                            type="number"
                            value={advanceFee}
                            onChange={(e) => setAdvanceFee(e.target.value)}
                            placeholder="যেমন: ১৩০"
                            className="w-full max-w-sm bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Shipping Rates & Free Delivery Rules */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white mb-1">Shipping Rates & Free Delivery Rules</h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5 text-sm">Flat Delivery Charge Inside City (৳)</label>
                      <input
                        type="number"
                        value={insideCityFee}
                        onChange={(e) => setInsideCityFee(e.target.value)}
                        placeholder="যেমন: ৮০"
                        className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5 text-sm">Flat Delivery Charge Outside City (৳)</label>
                      <input
                        type="number"
                        value={outsideCityFee}
                        onChange={(e) => setOutsideCityFee(e.target.value)}
                        placeholder="যেমন: ১৫০"
                        className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Minimum Cart Amount for Free Shipping (৳)</label>
                    <input
                      type="number"
                      value={freeShippingThreshold}
                      onChange={(e) => setFreeShippingThreshold(e.target.value)}
                      placeholder="যেমন: ২০০০"
                      className="w-full max-w-sm bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Method Restrict Controls */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white mb-1">Payment Method Restrict Controls</h3>
                
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#161B28] rounded-xl border border-[#2E3852] gap-4">
                    <div>
                      <div className="font-bold text-white text-sm mb-0.5">Disable COD for Discounted/Flash Sale Items</div>
                      <div className="text-xs text-slate-400">Prevent customers from using Cash on Delivery for sale items.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDisableCodForSale(!disableCodForSale)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${disableCodForSale ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${disableCodForSale ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#161B28] rounded-xl border border-[#2E3852] gap-4">
                    <div>
                      <div className="font-bold text-white text-sm mb-0.5">Enable Express Mobile Banking Only (bKash/Nagad)</div>
                      <div className="text-xs text-slate-400">Hide other payment gateways and show only mobile banking options.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpressMobileBankingOnly(!expressMobileBankingOnly)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${expressMobileBankingOnly ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${expressMobileBankingOnly ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'settings_export' && (
            <div className="space-y-8">
              {userPlan === 'free' && <PlanRestrictionBanner />}
              {/* Data Export Request Form */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    <Download className="w-5 h-5 text-[#00D68F]" />
                    Data Export Request Form
                    {userPlan === 'free' && <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded">Pro</span>}
                  </h3>
                  <p className="text-sm text-slate-400">Select the data you wish to export and specify the date range.</p>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5 text-sm">Export Data Category</label>
                      <select className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none">
                        <option>All Orders</option>
                        <option>Product Inventory</option>
                        <option>Customer Contact List</option>
                        <option>Sales & Revenue Report</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5 text-sm">File Format</label>
                      <select className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none">
                        <option>CSV (.csv)</option>
                        <option>Excel (.xlsx)</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5 text-sm">Start Date</label>
                      <input type="date" className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-slate-500 focus:border-[#00D68F] outline-none" placeholder="YYYY-MM-DD" />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5 text-sm">End Date</label>
                      <input type="date" className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-slate-500 focus:border-[#00D68F] outline-none" placeholder="YYYY-MM-DD" />
                    </div>
                  </div>
                  <button type="button" className="px-5 py-2.5 bg-[#00D68F] hover:bg-[#00bf7f] text-slate-950 font-bold rounded-xl text-sm transition">
                    Generate Export File
                  </button>
                </div>
              </div>

              {/* Recent Export History & Downloads Section */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white mb-1">Recent Export History & Downloads</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-slate-400 text-xs uppercase tracking-wider">
                        <th className="pb-4 font-bold">File Type</th>
                        <th className="pb-4 font-bold">Date Range</th>
                        <th className="pb-4 font-bold">Generated On</th>
                        <th className="pb-4 font-bold">Status</th>
                        <th className="pb-4 font-bold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="text-white text-sm">
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          এখনো কোনো ফাইল এক্সপোর্ট করা হয়নি। নতুন ফাইল তৈরি করতে উপরের ফর্মটি ব্যবহার করুন।
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'store_domains' && (
            <div className="space-y-8">
              {userPlan === 'free' && <PlanRestrictionBanner />}
              {/* Add Custom Domain Form */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    <Globe className="w-5 h-5 text-[#00D68F]" />
                    Add Custom Domain
                    {userPlan === 'free' && <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded">Pro</span>}
                  </h3>
                  <p className="text-sm text-slate-400">Connect your own domain to your store.</p>
                </div>
                <div className="flex gap-4">
                  <input
                    type="text"
                    value={domainName}
                    onChange={(e) => setDomainName(e.target.value)}
                    placeholder="যেমন: www.yourdomain.com"
                    className="flex-grow bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                  />
                  <button type="button" className="px-5 py-2.5 bg-[#00D68F] hover:bg-[#00bf7f] text-slate-950 font-bold rounded-xl text-sm transition">
                    Connect Domain
                  </button>
                </div>
              </div>

              {/* DNS Instructions */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white mb-1">Point your domain DNS records</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-slate-400 text-xs uppercase tracking-wider">
                        <th className="pb-4 font-bold">Type</th>
                        <th className="pb-4 font-bold">Host/Name</th>
                        <th className="pb-4 font-bold">Value/Target</th>
                        <th className="pb-4 font-bold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="text-white text-sm">
                      <tr className="border-t border-[#2E3852]">
                        <td className="py-4 font-mono text-[#00D68F]">A Record</td>
                        <td className="py-4 font-mono">@</td>
                        <td className="py-4 font-mono">192.0.2.1</td>
                        <td className="py-4"><button className="text-slate-400 hover:text-white">Copy</button></td>
                      </tr>
                      <tr className="border-t border-[#2E3852]">
                        <td className="py-4 font-mono text-[#00D68F]">CNAME</td>
                        <td className="py-4 font-mono">www</td>
                        <td className="py-4 font-mono">dns.yourdomain.com</td>
                        <td className="py-4"><button className="text-slate-400 hover:text-white">Copy</button></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <button type="button" className="px-5 py-2.5 bg-[#2E3852] hover:bg-[#3D4766] text-white rounded-xl text-sm transition">
                  Verify DNS Records
                </button>
              </div>

              {/* Connected Domains List */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white mb-1">Connected Domains</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-[#161B28] rounded-xl border border-[#2E3852]">
                    <span className="text-white">yourstore.com</span>
                    <span className="px-2 py-1 rounded bg-green-500/10 text-green-400 text-xs font-bold">Active</span>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#161B28] rounded-xl border border-[#2E3852] gap-4">
                    <div>
                      <div className="font-bold text-white text-sm mb-0.5">Force HTTPS / Auto Free SSL Certificate</div>
                      <div className="text-xs text-slate-400">Ensure secure connection for all visitors.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForceHttps(!forceHttps)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${forceHttps ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                    >
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${forceHttps ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'settings_api' && (
            <div className="space-y-8">
              {userPlan === 'free' && <PlanRestrictionBanner />}
              {/* Courier Service */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    <Truck className="w-5 h-5 text-[#00D68F]" />
                    Courier Service Integration
                    {userPlan === 'free' && <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded">Pro</span>}
                  </h3>
                  <p className="text-sm text-slate-400">Manage your primary shipping provider settings.</p>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Select Primary Courier Provider</label>
                    <select
                      value={courierProvider}
                      onChange={(e) => setCourierProvider(e.target.value)}
                      className="w-full max-w-sm bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none"
                    >
                      <option>Steadfast Courier</option>
                      <option>Pathao Courier</option>
                      <option>RedX</option>
                      <option>Paperfly</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5 text-sm">Courier API Key / Client ID</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={courierApiKey}
                          onChange={(e) => setCourierApiKey(e.target.value)}
                          placeholder="যেমন: api_key_steadfast_12345"
                          className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white pr-20 focus:border-[#00D68F] outline-none placeholder:text-slate-500 font-mono"
                        />
                        <button type="button" onClick={() => handleCopy(courierApiKey, 'courier_api')} className="absolute right-2 top-2 text-xs text-slate-400 hover:text-white bg-[#1A2033] px-2 py-1 rounded">Copy</button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5 text-sm">Courier Secret Token</label>
                      <div className="relative">
                        <input
                          type="password"
                          value={courierSecret}
                          onChange={(e) => setCourierSecret(e.target.value)}
                          placeholder="যেমন: secret_token_98765"
                          className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white pr-20 focus:border-[#00D68F] outline-none placeholder:text-slate-500 font-mono"
                        />
                        <button type="button" onClick={() => handleCopy(courierSecret, 'courier_secret')} className="absolute right-2 top-2 text-xs text-slate-400 hover:text-white bg-[#1A2033] px-2 py-1 rounded">Copy</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Marketing & Tracking */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white mb-1">Marketing & Tracking Pixel API</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Facebook Pixel ID</label>
                    <input
                      type="text"
                      value={fbPixelId}
                      onChange={(e) => setFbPixelId(e.target.value)}
                      placeholder="যেমন: 123456789012345"
                      className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Facebook Conversions API Token</label>
                    <input
                      type="password"
                      value={fbCapiToken}
                      onChange={(e) => setFbCapiToken(e.target.value)}
                      placeholder="যেমন: EAAG..."
                      className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Google Analytics (GA4) Tracking ID</label>
                    <input
                      type="text"
                      value={ga4Id}
                      onChange={(e) => setGa4Id(e.target.value)}
                      placeholder="যেমন: G-XXXXXXXXXX"
                      className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* SMS Gateway */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white mb-1">SMS Gateway Integration</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5 text-sm">SMS Gateway API Key / Token</label>
                      <input
                        type="password"
                        value={smsApiKey}
                        onChange={(e) => setSmsApiKey(e.target.value)}
                        placeholder="যেমন: sms_api_token_bd_123"
                        className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5 text-sm">SMS Sender ID / Masking Name</label>
                      <input
                        type="text"
                        value={smsSenderId}
                        onChange={(e) => setSmsSenderId(e.target.value)}
                        placeholder="যেমন: ZidBook"
                        className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Webhooks */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white mb-1">Webhooks</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Order Webhook Endpoint URL</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        placeholder="যেমন: https://yourdomain.com/api/webhooks/order"
                        className="flex-grow bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500"
                      />
                      <button type="button" className="px-4 py-2 bg-[#2E3852] hover:bg-[#3D4766] text-white rounded-xl text-xs">Test Connection</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'store_policies' && (
            <div className="space-y-8">
              {/* AI FAQ Generator Tool */}
              <div className="bg-[#00D68F]/5 border border-[#00D68F]/20 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#00D68F]/20 text-[#00D68F] flex items-center justify-center">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-base">AI FAQ & Chatbot Generator</h3>
                      <p className="text-xs text-slate-400">Analyze policies to create instant FAQs & chatbot scripts</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={generateFaqAndChatbot}
                    disabled={isGeneratingFaq}
                    className="px-4 py-2 bg-[#00D68F] text-slate-950 font-black text-xs rounded-xl hover:bg-[#00E699] transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isGeneratingFaq ? 'animate-spin' : ''}`} />
                    <span>{isGeneratingFaq ? 'Analyzing Policies...' : 'Generate with AI'}</span>
                  </button>
                </div>

                {generatedFaq && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 animate-in fade-in slide-in-from-bottom-2">
                    <div className="space-y-3">
                      <h4 className="text-[11px] font-black text-[#00D68F] uppercase tracking-wider">Instant FAQ List</h4>
                      <div className="bg-[#101420] border border-[#2E3852] rounded-xl p-4 space-y-4 max-h-[300px] overflow-y-auto">
                        {generatedFaq.map((item: any, idx: number) => (
                          <div key={idx} className="space-y-1">
                            <p className="font-bold text-white text-[11px]">Q: {item.question}</p>
                            <p className="text-slate-400 text-[10px] leading-relaxed">A: {item.answer}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <h4 className="text-[11px] font-black text-[#00D68F] uppercase tracking-wider">Chatbot Response Script</h4>
                      <div className="bg-[#101420] border border-[#2E3852] rounded-xl p-4 h-[300px] overflow-y-auto">
                        <pre className="text-slate-300 text-[10px] whitespace-pre-wrap font-mono leading-relaxed">
                          {chatbotScript}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Policy Text Areas */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-[#00D68F]" />
                    Legal Policies
                  </h3>
                  <p className="text-sm text-slate-400">Configure your store's legal and compliance policies.</p>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Privacy Policy</label>
                    <textarea
                      value={privacyPolicy}
                      onChange={(e) => setPrivacyPolicy(e.target.value)}
                      placeholder="যেমন: আপনার ব্যক্তিগত তথ্যের সুরক্ষা আমাদের কাছে অত্যন্ত গুরুত্বপূর্ণ..."
                      className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500 h-32"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Terms of Service</label>
                    <textarea
                      value={termsOfService}
                      onChange={(e) => setTermsOfService(e.target.value)}
                      placeholder="যেমন: ওয়েবসাইট ব্যবহারের শর্তাবলী..."
                      className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500 h-32"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Return & Refund Policy</label>
                    <textarea
                      value={returnPolicy}
                      onChange={(e) => setReturnPolicy(e.target.value)}
                      placeholder="যেমন: ৭ দিনের মধ্যে পণ্য পরিবর্তনের সুযোগ দেওয়া হয়..."
                      className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500 h-32"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5 text-sm">Shipping Policy</label>
                    <textarea
                      value={shippingPolicy}
                      onChange={(e) => setShippingPolicy(e.target.value)}
                      placeholder="যেমন: ঢাকা সিটির মধ্যে ২৪-৪৮ ঘণ্টার মধ্যে ডেলিভারি..."
                      className="w-full bg-[#161B28] border border-[#2E3852] rounded-xl px-3.5 py-2.5 text-white focus:border-[#00D68F] outline-none placeholder:text-slate-500 h-32"
                    />
                  </div>
                </div>
              </div>

              {/* Footer Toggle */}
              <div className="bg-[#101420] border border-[#2E3852] rounded-2xl p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="font-bold text-white text-sm mb-0.5">Show Legal Policy links automatically in Storefront Footer</div>
                    <div className="text-xs text-slate-400">Display links to your policies in the footer.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLegalLinks(!showLegalLinks)}
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${showLegalLinks ? 'bg-[#00D68F]' : 'bg-slate-600'}`}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${showLegalLinks ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSubTab !== 'settings_general' && 
           activeSubTab !== 'settings_account' && 
           activeSubTab !== 'settings_security' &&
           activeSubTab !== 'settings_checkout' &&
           activeSubTab !== 'settings_gift' &&
           activeSubTab !== 'settings_invoices' &&
           activeSubTab !== 'settings_properties' &&
           activeSubTab !== 'settings_constraints' &&
           activeSubTab !== 'store_details' && 
           activeSubTab !== 'settings_languages' && 
           activeSubTab !== 'settings_tax' && 
           activeSubTab !== 'settings_nbr' && 
           activeSubTab !== 'settings_notifications' && 
           activeSubTab !== 'settings_api' && 
           activeSubTab !== 'store_domains' &&
           activeSubTab !== 'store_policies' && (
            <div className="py-12 text-center space-y-3 bg-[#101420] border border-[#2E3852] rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-[#00D68F]/10 text-[#00D68F] flex items-center justify-center mx-auto">
                <Sliders className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">{getSubTabTitle()} Configuration</h3>
              <p className="text-slate-400 max-w-md mx-auto text-xs">
                Configure advanced parameters, webhook endpoints, API tokens, and compliance rules for your merchant operations.
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-[#272F45] flex justify-end">
            <button
              type="submit"
              className="px-6 py-3 bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-extrabold rounded-xl text-xs transition flex items-center gap-2 cursor-pointer shadow-lg"
            >
              <Save className="w-4 h-4" />
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </main>

    </div>
  );
};
