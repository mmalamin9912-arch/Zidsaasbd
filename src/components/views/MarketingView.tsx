import React, { useState, useEffect } from 'react';
import { DiscountCoupon, Customer, MerchantProfile, AdminPaymentGatewayConfig } from '../../types';
import { initialCoupons, initialCustomers } from '../../data/initialData';
import { ProFeaturePaymentModal } from '../marketing/ProFeaturePaymentModal';
import { safeSetItem } from '../../utils/safeStorage';
import SafeImage from '../SafeImage';
import { 
  Megaphone, 
  Plus, 
  Tag, 
  PhoneCall, 
  Sparkles, 
  Send, 
  Calendar, 
  Users, 
  Award, 
  Gift, 
  FileText, 
  Check, 
  X, 
  Clock, 
  Edit3, 
  Trash2, 
  Copy, 
  ShieldCheck, 
  Sliders, 
  Percent, 
  Truck, 
  Zap, 
  Layers, 
  MessageSquare, 
  Mail, 
  Filter, 
  CheckCircle2, 
  RefreshCw, 
  Search, 
  UserCheck, 
  ChevronRight,
  TrendingUp,
  SlidersHorizontal,
  DollarSign,
  PackageCheck,
  Grid,
  Settings,
  Crown,
  Lock,
  HelpCircle,
  Activity,
  Loader2,
  Info,
  ExternalLink
} from 'lucide-react';

// Types for Marketing Campaigns
export interface MarketingCampaign {
  id: string;
  title: string;
  channel: 'WhatsApp' | 'SMS' | 'Email';
  targetAudience: string;
  scheduledAt: string;
  status: 'Active' | 'Scheduled' | 'Completed' | 'Draft';
  recipientsCount: number;
  sentCount: number;
  conversionRate: string;
  message: string;
}

// Types for WhatsApp Templates
export interface WhatsAppTemplate {
  id: string;
  name: string;
  category: 'Marketing' | 'Utility' | 'Authentication';
  language: 'Bangla (bn_BD)' | 'English (en_US)';
  headerType: 'Text' | 'Image' | 'None';
  headerText?: string;
  bodyText: string;
  footerText?: string;
  status: 'Approved' | 'In Review' | 'Draft' | 'Pending Meta Approval';
  createdAt: string;
}

// Extended Coupon Interface with Advanced Unlocked Rules
export interface AdvancedDiscountCoupon extends DiscountCoupon {
  group: 'Seasonal Promo' | 'Flash Sale' | 'Customer Exclusive' | 'Free Shipping Offer' | 'COD Waiver';
  targetSegment: 'All Customers' | 'VIP' | 'Regular' | 'New' | 'Wholesale';
  minWeightKg?: number;
  maxWeightKg?: number;
  tierRules?: { minSpendBDT: number; discountPercent: number }[];
  allowFreeShipping?: boolean;
  allowFreeCOD?: boolean;
  perCustomerLimit?: number;
  totalUsageLimit?: number;
  applicableCategory?: string;
}

// Customer Tier Definition
export interface LoyaltyTier {
  id: string;
  name: string;
  minSpendBDT: number;
  multiplier: number;
  perks: string[];
  color: string;
}

export interface AppIntegrationConfig {
  id: string;
  name: string;
  category: 'Marketing' | 'Logistics' | 'Communication' | 'Payments';
  description: string;
  iconBg: string;
  iconText: string;
  badge: string;
  isConnected: boolean;
  pricingTier: 'Free' | 'Pro';
  priceLabel: string;
  field1Label: string;
  field1Value: string;
  field2Label?: string;
  field2Value?: string;
  field3Label?: string;
  field3Value?: string;
  guideTitle?: string;
  guideSteps?: string[];
}

interface MarketingViewProps {
  merchant?: MerchantProfile;
  platformSettings?: any;
  adminPaymentConfig?: AdminPaymentGatewayConfig;
  onOpenSubscriptionModal?: () => void;
}

export const MarketingView: React.FC<MarketingViewProps> = ({ 
  merchant, 
  platformSettings, 
  adminPaymentConfig,
  onOpenSubscriptionModal 
}) => {
  // Main Sub-Tab State
  const [activeTab, setActiveTab] = useState<'app_market' | 'campaigns' | 'whatsapp_templates' | 'coupons' | 'loyalty'>('app_market');

  // Customer & Loyalty State (Moved up for campaign segment dependency)
  const [customersList, setCustomersList] = useState<Customer[]>(initialCustomers);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomers[0]?.id || '');
  const [adjAction, setAdjAction] = useState<'add' | 'deduct'>('add');
  const [adjPoints, setAdjPoints] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [pointHistoryLog, setPointHistoryLog] = useState<{ id: string; customerName: string; delta: number; reason: string; date: string }[]>([]);

  // Merchant Subscription Tier State
  const isProMerchant = merchant?.subscriptionPlan === 'pro_6m' || merchant?.subscriptionPlan === 'enterprise_12m';

  // App Market & Pixels Integrations State
  const [integrations, setIntegrations] = useState<AppIntegrationConfig[]>(() => {
    const saved = localStorage.getItem('zid_bd_app_integrations_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        // fallback
      }
    }
    return [
      {
        id: 'fb-pixel',
        name: 'Facebook Pixel & Conversions API (CAPI)',
        category: 'Marketing',
        description: 'Track PageView, AddToCart, and Purchase events reliably via server-side CAPI and browser pixel.',
        iconBg: 'bg-blue-600/20 text-blue-400',
        iconText: 'FB',
        badge: 'Recommended',
        isConnected: false,
        pricingTier: 'Free',
        priceLabel: 'Free Plan Included',
        field1Label: 'Facebook Pixel ID',
        field1Value: '',
        field2Label: 'Conversions API (CAPI) Token',
        field2Value: '',
        guideTitle: 'Where do I find my Facebook Pixel ID & CAPI Token?',
        guideSteps: [
          'Log into Meta Events Manager (business.facebook.com/events_manager2).',
          'Select your Data Source (Pixel) and copy the 15-digit Pixel ID.',
          'Go to Settings -> Conversions API -> click "Generate Access Token".',
          'Paste both keys above for server-side deduplicated conversion tracking.'
        ]
      },
      {
        id: 'tiktok-pixel',
        name: 'TikTok Pixel & Ads Integration',
        category: 'Marketing',
        description: 'Optimize TikTok ad campaigns, track conversion checkouts, and build custom audiences in Bangladesh.',
        iconBg: 'bg-pink-600/20 text-pink-400',
        iconText: 'TK',
        badge: 'Popular',
        isConnected: false,
        pricingTier: 'Pro',
        priceLabel: 'Pro App - Subscription Required ($15/mo)',
        field1Label: 'TikTok Pixel ID',
        field1Value: '',
        field2Label: 'Access Token',
        field2Value: '',
        guideTitle: 'Where do I find my TikTok Pixel ID & Access Token?',
        guideSteps: [
          'Log into TikTok Ads Manager (ads.tiktok.com) and go to Assets -> Events.',
          'Create or select your Web Event / TikTok Pixel (Developer Mode / Events API).',
          'Copy your Pixel ID (16 alphanumeric characters).',
          'Under Settings -> Events API, click "Generate Access Token" and paste it above.'
        ]
      },
      {
        id: 'whatsapp-bot',
        name: 'WhatsApp Chat Widget & Order Bot',
        category: 'Communication',
        description: 'Floating chat widget on storefront + automated WhatsApp order confirmation and Steadfast tracking bot.',
        iconBg: 'bg-emerald-600/20 text-emerald-400',
        iconText: 'WA',
        badge: 'Active Bot',
        isConnected: false,
        pricingTier: 'Free',
        priceLabel: 'Free Plan Included',
        field1Label: 'WhatsApp Business Number',
        field1Value: '',
        field2Label: 'Welcome Message Template',
        field2Value: '',
        guideTitle: 'How do I configure my WhatsApp Business Bot?',
        guideSteps: [
          'Enter your active WhatsApp Business phone number with country code (e.g. +88017...).',
          'Customize your instant welcome message and order receipt text.',
          'The bot automatically appends Steadfast tracking links upon order dispatch.'
        ]
      },
      {
        id: 'courier-api',
        name: 'Steadfast & Paperfly Courier API',
        category: 'Logistics',
        description: 'One-click consignment creation, automatic tracking sync, and COD reconciliation for Bangladeshi couriers.',
        iconBg: 'bg-orange-600/20 text-orange-400',
        iconText: 'SF',
        badge: 'Essential',
        isConnected: false,
        pricingTier: 'Free',
        priceLabel: 'Free Plan Included',
        field1Label: 'Steadfast API Key',
        field1Value: '',
        field2Label: 'Secret Key',
        field2Value: '',
        guideTitle: 'Where do I find my Steadfast API & Secret Keys?',
        guideSteps: [
          'Log into your Steadfast Courier Merchant Portal (steadfast.com.bd).',
          'Navigate to Developer Settings -> API Credentials.',
          'Copy your API Key and Secret Key for automated consignment creation and tracking sync.'
        ]
      },
      {
        id: 'bulk-sms',
        name: 'Bulk SMS Marketing (Greenweb / GP / BL)',
        category: 'Marketing',
        description: 'Send OTP verification codes, promotional SMS campaigns, and shipping updates via local BD SMS gateways.',
        iconBg: 'bg-cyan-600/20 text-cyan-400',
        iconText: 'SMS',
        badge: 'BD Gateway',
        isConnected: false,
        pricingTier: 'Pro',
        priceLabel: 'Pro App - Subscription Required ($10/mo)',
        field1Label: 'SMS Gateway Provider',
        field1Value: '',
        field2Label: 'API Token / Masking Sender ID',
        field2Value: '',
        guideTitle: 'Where do I find my Greenweb BD SMS Token?',
        guideSteps: [
          'Log into your Greenweb BD or SMS Gateway Portal.',
          'Navigate to API Access & Gateway Settings.',
          'Copy your API Token and Sender Masking ID (e.g. "DhakaCraft") for OTP and SMS dispatch.'
        ]
      },
      {
        id: 'bkash-verifier',
        name: 'bKash TrxID Auto-Verification Engine',
        category: 'Payments',
        description: 'Instantly verifies customer bKash/Nagad Transaction IDs against merchant API to eliminate fake COD orders.',
        iconBg: 'bg-rose-600/20 text-rose-400',
        iconText: 'bK',
        badge: 'Automated',
        isConnected: false,
        pricingTier: 'Pro',
        priceLabel: 'Pro App - Subscription Required ($12/mo)',
        field1Label: 'bKash Merchant Wallet Number',
        field1Value: '',
        field2Label: 'Merchant API Username/Password',
        field2Value: '',
        guideTitle: 'Where do I find my bKash Merchant Wallet Credentials?',
        guideSteps: [
          'Log into your bKash Merchant Portal -> Developer API section.',
          'Enter your Merchant Wallet phone number and API Credentials.',
          'Enables automatic real-time TrxID verification to stop fake payment submissions.'
        ]
      }
    ];
  });

  useEffect(() => {
    safeSetItem('zid_bd_app_integrations_v2', integrations);
  }, [integrations]);

  const [selectedApp, setSelectedApp] = useState<AppIntegrationConfig | null>(null);
  const [lockedAppModal, setLockedAppModal] = useState<AppIntegrationConfig | null>(null);
  const [f1Val, setF1Val] = useState('');
  const [f2Val, setF2Val] = useState('');
  const [f3Val, setF3Val] = useState('');
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [isProPaymentModalOpen, setIsProPaymentModalOpen] = useState(false);
  const [pendingProUpgrade, setPendingProUpgrade] = useState<boolean>(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const handleUpgradeMerchantPlan = () => {
    setIsProPaymentModalOpen(true);
  };

  const handleConfirmProPayment = (method: string, txId: string) => {
    setPendingProUpgrade(true);
    console.log('Pro Feature Payment Request:', { method, txId });
  };

  const handleOpenConfigure = (app: AppIntegrationConfig) => {
    if (app.pricingTier === 'Pro' && !isProMerchant) {
      setLockedAppModal(app);
      return;
    }
    setSelectedApp(app);
    setF1Val(app.field1Value);
    setF2Val(app.field2Value || '');
    setF3Val(app.field3Value || '');
    setShowGuide(false);
    setTestStatus('idle');
  };

  const handleTestConnection = () => {
    if (!selectedApp) return;
    setTestStatus('testing');
    setTimeout(() => {
      setTestStatus('success');
    }, 1200);
  };

  const handleSaveIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;

    try {
      // Prepare the integration config payload
      const payload = {
        store_slug: merchant?.store_slug || merchant?.storeSlug || merchant?.id || 'default-store',
        integrationsConfig: {
          fbPixelId: f1Val,
          fbCapiToken: f2Val,
          courierApiKey: f1Val,
          courierSecretToken: f2Val,
          smsApiKey: f1Val,
          webhookSecret: f3Val,
        }
      };

      // Call the API endpoint
      const response = await fetch('/api/store/integration-properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      
      if (data.ok) {
        // Update local state based on the result
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
        alert(`Successfully connected and saved configuration for ${selectedApp.name}! Settings applied to store header/footer.`);
      } else {
        alert(`Error saving configuration: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving integration:', error);
      alert('Failed to save configuration. Please try again.');
    }
  };

  const handleToggleConnection = async (id: string) => {
    const app = integrations.find(i => i.id === id);
    if (!app) return;

    const nextState = !app.isConnected;

    // Optimistic UI update
    setIntegrations(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, isConnected: nextState };
      }
      return item;
    }));

    try {
      // Persist the connection status to the backend
      const storeSlug = merchant?.store_slug || merchant?.storeSlug || merchant?.id || 'default-store';
      const response = await fetch('/api/store/integration-properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_slug: storeSlug,
          integrationsConfig: {
            [id]: nextState,
          }
        }),
      });

      const data = await response.json();
      
      if (!data.ok) {
        // Roll back on failure
        setIntegrations(prev => prev.map(item => {
          if (item.id === id) {
            return { ...item, isConnected: !nextState };
          }
          return item;
        }));
        alert(`Failed to update connection status: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error toggling connection:', error);
      // Roll back on failure
      setIntegrations(prev => prev.map(item => {
        if (item.id === id) {
          return { ...item, isConnected: !nextState };
        }
        return item;
      }));
      alert('Failed to update connection status. Please try again.');
    }
  };

  // -------------------------------------------------------------
  // STATE 1: MARKETING CAMPAIGNS
  // -------------------------------------------------------------
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);

  // Campaign Form State
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campTitle, setCampTitle] = useState('');
  const [campChannel, setCampChannel] = useState<'WhatsApp' | 'SMS' | 'Email'>('WhatsApp');
  const [campSegment, setCampSegment] = useState('All Past Buyers');
  const [campMessage, setCampMessage] = useState('');
  const [campScheduleType, setCampScheduleType] = useState<'now' | 'later'>('now');
  const [campScheduleDate, setCampScheduleDate] = useState(new Date().toISOString().slice(0, 16));

  // Dynamic Segment Counts
  const segmentStats = {
    pastBuyers: customersList.filter(c => c.totalOrders > 0).length,
    vip: customersList.filter(c => c.group === 'VIP').length,
    new: customersList.filter(c => c.group === 'New').length,
    abandoned: 0 // Mocked for now
  };

  const handleCreateCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campTitle || !campMessage) return;

    let recipients = 0;
    if (campSegment === 'All Past Buyers') recipients = segmentStats.pastBuyers;
    else if (campSegment === 'VIP Customers') recipients = segmentStats.vip;
    else if (campSegment === 'New Signups') recipients = segmentStats.new;
    else if (campSegment === 'Abandoned Cart Users') recipients = segmentStats.abandoned;

    const newCamp: MarketingCampaign = {
      id: `camp-${Date.now()}`,
      title: campTitle,
      channel: campChannel,
      targetAudience: `${campSegment} (${recipients} Users)`,
      scheduledAt: campScheduleType === 'now' ? 'Immediate' : campScheduleDate.replace('T', ' '),
      status: campScheduleType === 'now' ? 'Active' : 'Scheduled',
      recipientsCount: recipients,
      sentCount: campScheduleType === 'now' ? recipients : 0,
      conversionRate: '0.0%',
      message: campMessage
    };

    setCampaigns([newCamp, ...campaigns]);
    setShowCampaignModal(false);
    setCampTitle('');
    setCampMessage('');
    setCampScheduleType('now');
  };

  // -------------------------------------------------------------
  // STATE 2: WHATSAPP TEMPLATE MANAGEMENT
  // -------------------------------------------------------------
  const [waTemplates, setWaTemplates] = useState<WhatsAppTemplate[]>([]);

  const [showWaTemplateModal, setShowWaTemplateModal] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplCategory, setTplCategory] = useState<'Marketing' | 'Utility' | 'Authentication'>('Marketing');
  const [tplLanguage, setTplLanguage] = useState<'Bangla (bn_BD)' | 'English (en_US)'>('Bangla (bn_BD)');
  const [tplHeaderType, setTplHeaderType] = useState<'Text' | 'Image' | 'None'>('Text');
  const [tplHeaderText, setTplHeaderText] = useState('');
  const [tplBodyText, setTplBodyText] = useState('');
  const [tplFooterText, setTplFooterText] = useState('');

  // Auto-set footer text when modal opens
  useEffect(() => {
    if (showWaTemplateModal) {
      setTplFooterText(`${merchant?.storeName || 'My Store'} Support: ${merchant?.whatsappNumber || merchant?.phone || '+880'}`);
    }
  }, [showWaTemplateModal, merchant]);

  const handleCreateWaTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplName || !tplBodyText) return;

    const newTpl: WhatsAppTemplate = {
      id: `wat-${Date.now()}`,
      name: tplName.toLowerCase().replace(/[^a-z0-9_]+/g, '_'),
      category: tplCategory,
      language: tplLanguage,
      headerType: tplHeaderType,
      headerText: tplHeaderText,
      bodyText: tplBodyText,
      footerText: tplFooterText,
      status: 'Pending Meta Approval',
      createdAt: new Date().toISOString().split('T')[0]
    };

    setWaTemplates([newTpl, ...waTemplates]);
    setShowWaTemplateModal(false);
    setTplName('');
    setTplBodyText('');
    setTplFooterText('');
    alert(`WhatsApp Template "${newTpl.name}" submitted for Meta approval!`);
  };

  // -------------------------------------------------------------
  // STATE 3: COMPLETE ADVANCED DISCOUNT & COUPON SYSTEM
  // -------------------------------------------------------------
  const [advancedCoupons, setAdvancedCoupons] = useState<AdvancedDiscountCoupon[]>([]);

  // Advanced Coupon Form Modal State
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [cCode, setCCode] = useState('');
  const [cGroup, setCGroup] = useState<'Seasonal Promo' | 'Flash Sale' | 'Customer Exclusive' | 'Free Shipping Offer' | 'COD Waiver'>('Seasonal Promo');
  const [cType, setCType] = useState<'Percentage' | 'Fixed BDT' | 'Free Shipping' | 'Free Cash on Delivery'>('Percentage');
  const [cValue, setCValue] = useState('');
  const [cMinOrder, setCMinOrder] = useState('');
  const [cSegment, setCSegment] = useState<'All Customers' | 'VIP' | 'Regular' | 'New' | 'Wholesale'>('All Customers');
  const [cMinWeight, setCMinWeight] = useState('');
  const [cMaxWeight, setCMaxWeight] = useState('');
  const [cAllowFreeShip, setCAllowFreeShip] = useState(false);
  const [cAllowFreeCOD, setCAllowFreeCOD] = useState(false);
  const [cPerCustomerLimit, setCPerCustomerLimit] = useState('');
  const [cTotalUsageLimit, setCTotalUsageLimit] = useState('');
  const [cCategory, setCCategory] = useState('');
  const [cExpiresAt, setCExpiresAt] = useState('');

  const handleCreateAdvancedCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cCode) return;

    const added: AdvancedDiscountCoupon = {
      id: `coup-${Date.now()}`,
      code: cCode.toUpperCase().trim(),
      group: cGroup,
      discountType: cType === 'Free Shipping' || cType === 'Free Cash on Delivery' ? 'Fixed BDT' : cType,
      value: cType === 'Free Shipping' ? 80 : (cType === 'Free Cash on Delivery' ? 50 : (parseInt(cValue) || 10)),
      minOrderBDT: parseInt(cMinOrder) || 1000,
      usageCount: 0,
      status: 'Active',
      expiresAt: cExpiresAt,
      targetSegment: cSegment,
      minWeightKg: parseFloat(cMinWeight) || 0,
      maxWeightKg: parseFloat(cMaxWeight) || 10,
      allowFreeShipping: cAllowFreeShip || cType === 'Free Shipping',
      allowFreeCOD: cAllowFreeCOD || cType === 'Free Cash on Delivery',
      perCustomerLimit: parseInt(cPerCustomerLimit) || 1,
      totalUsageLimit: parseInt(cTotalUsageLimit) || 100,
      applicableCategory: cCategory
    };

    setAdvancedCoupons([added, ...advancedCoupons]);
    setShowCouponModal(false);
    setCCode('');
    alert(`Advanced Coupon "${added.code}" created with zero restrictions!`);
  };

  const handleToggleCouponStatus = (id: string) => {
    setAdvancedCoupons(prev => prev.map(c => c.id === id ? { ...c, status: c.status === 'Active' ? 'Expired' : 'Active' } : c));
  };

  const handleDeleteCoupon = (id: string) => {
    setAdvancedCoupons(prev => prev.filter(c => c.id !== id));
  };

  // -------------------------------------------------------------
  // STATE 4: UNLOCKED LOYALTY & REWARDS SYSTEM
  // -------------------------------------------------------------
  // Loyalty Points Configuration
  const [loyaltyConfig, setLoyaltyConfig] = useState({
    spendPerPointBDT: 100, // Earn 1 point per 100 BDT spent
    pointRedemptionBDT: 0.50, // 100 points = 50 BDT wallet credit
    minRedeemPoints: 200,
    birthdayGiftBDT: 500,
    birthdayCouponPercent: 20,
    anniversaryBonusBDT: 300,
    firstOrderPoints: 100,
    isEnabled: true
  });

  // Tiers State
  const [loyaltyTiers, setLoyaltyTiers] = useState<LoyaltyTier[]>([
    {
      id: 'tier-bronze',
      name: 'Bronze Tier',
      minSpendBDT: 0,
      multiplier: 1.0,
      perks: ['Standard 1x loyalty point rate', 'Access to general sales promo codes'],
      color: 'border-amber-600/40 text-amber-500 bg-amber-500/10'
    },
    {
      id: 'tier-silver',
      name: 'Silver Tier',
      minSpendBDT: 10000,
      multiplier: 1.25,
      perks: ['1.25x Loyalty points multiplier', '5% Birthday discount voucher', 'Priority chat support'],
      color: 'border-slate-400/40 text-slate-300 bg-slate-400/10'
    },
    {
      id: 'tier-gold',
      name: 'Gold VIP Tier',
      minSpendBDT: 25000,
      multiplier: 1.5,
      perks: ['1.50x Loyalty points multiplier', 'Free Home Delivery on all orders', '10% Birthday cash voucher', 'Exclusive pre-launch previews'],
      color: 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10'
    },
    {
      id: 'tier-platinum',
      name: 'Platinum Diamond VIP',
      minSpendBDT: 50000,
      multiplier: 2.0,
      perks: ['2.0x Loyalty points multiplier', 'Free Express Courier + Free COD', '৳1000 Birthday gift', 'Dedicated Dhaka Account Manager'],
      color: 'border-cyan-400/40 text-cyan-400 bg-cyan-400/10'
    }
  ]);

  const handleUpdateTier = async (id: string, field: 'minSpendBDT' | 'multiplier', value: string) => {
    const numVal = parseFloat(value) || 0;
    
    // Optimistic UI update
    setLoyaltyTiers(prev => prev.map(t => t.id === id ? { ...t, [field]: numVal } : t));

    try {
      const storeSlug = merchant?.store_slug || merchant?.storeSlug || merchant?.id || 'default-store';
      const response = await fetch('/api/store/loyalty-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_slug: storeSlug,
          loyaltyConfig: {
            tiers: loyaltyTiers.map(t => ({
              id: t.id,
              name: t.name,
              minSpendBDT: t.minSpendBDT,
              multiplier: t.multiplier,
              perks: t.perks,
              color: t.color,
            }))
          },
        }),
      });

      const data = await response.json();
      
      if (!data.ok) {
        // Roll back on failure
        setLoyaltyTiers(prev => prev.map(t => t.id === id ? { ...t, [field]: (t as any)[field] } : t));
        alert(`Failed to save tier rules: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving tier rules:', error);
      setLoyaltyTiers(prev => prev.map(t => t.id === id ? { ...t, [field]: (t as any)[field] } : t));
      alert('Failed to save tier rules. Please try again.');
    }
  };

  const handleSaveLoyaltyConfig = async (field: keyof typeof loyaltyConfig, value: number) => {
    setLoyaltyConfig(prev => ({ ...prev, [field]: value }));

    try {
      const storeSlug = merchant?.store_slug || merchant?.storeSlug || merchant?.id || 'default-store';
      const response = await fetch('/api/store/loyalty-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_slug: storeSlug,
          loyaltyConfig: {
            [field]: value,
          },
        }),
      });

      const data = await response.json();
      
      if (!data.ok) {
        alert(`Failed to save loyalty config: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving loyalty config:', error);
      alert('Failed to save loyalty config. Please try again.');
    }
  };

  const handleAdjustPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    const cust = customersList.find(c => c.id === selectedCustomerId);
    if (!cust) return;

    const delta = (adjAction === 'add' ? 1 : -1) * (parseInt(adjPoints) || 0);
    if (delta === 0) {
      alert('Please enter a valid points amount.');
      return;
    }
    
    if (!adjReason.trim()) {
      alert('Please provide a reason for the adjustment.');
      return;
    }

    try {
      const storeSlug = merchant?.store_slug || merchant?.storeSlug || merchant?.id || 'default-store';
      const response = await fetch('/api/store/loyalty-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_slug: storeSlug,
          customerId: cust.id,
          delta: delta,
          action: adjAction,
          reason: adjReason.trim(),
        }),
      });

      const data = await response.json();
      
      if (data.ok) {
        // Update local state with the result from the server
        setCustomersList(prev => prev.map(c => c.id === selectedCustomerId ? { ...c, loyaltyPoints: data.transaction.newBalance } : c));

        setPointHistoryLog([
          {
            id: data.transaction.id,
            customerName: data.transaction.customerName,
            delta: data.transaction.delta,
            reason: data.transaction.reason,
            date: data.transaction.createdAt.replace('T', ' ').substring(0, 16)
          },
          ...pointHistoryLog
        ]);

        // Reset form
        setAdjPoints('');
        setAdjReason('');

        alert(`Successfully ${adjAction === 'add' ? 'awarded' : 'deducted'} ${Math.abs(delta)} points for ${cust.name}! New Balance: ${data.transaction.newBalance} Points.`);
      } else {
        alert(`Error processing point adjustment: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error adjusting points:', error);
      alert('Failed to process point adjustment. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header Card */}
      <div className="bg-[#202533] border border-[#2E3548] p-5 sm:p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black text-[#00D68F] uppercase bg-[#00D68F]/10 px-2.5 py-0.5 rounded border border-[#00D68F]/20 tracking-wider">
              100% UNLOCKED MARKETING SUITE
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <span>Marketing, Automated Campaigns & Loyalty Rewards</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Run WhatsApp/SMS broadcasts, manage Meta WhatsApp templates, configure advanced coupon rules, and build customer tier reward programs.
          </p>
        </div>

        {/* Quick Create Action Dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowCampaignModal(true)}
            className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-lg"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Create Campaign</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCouponModal(true)}
            className="bg-[#282E3F] hover:bg-[#32394E] text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer border border-[#3A435E]"
          >
            <Tag className="w-4 h-4 text-[#00D68F]" />
            <span>New Coupon</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs Bar (Shopify / Zid Style Border Bottom Active States) */}
      <div className="bg-[#202533] border border-[#2E3548] px-4 rounded-2xl flex items-center gap-6 overflow-x-auto shadow-lg">
        <button
          type="button"
          onClick={() => setActiveTab('app_market')}
          className={`flex items-center gap-2 py-4 text-xs font-bold transition whitespace-nowrap cursor-pointer border-b-2 ${
            activeTab === 'app_market'
              ? 'border-[#00D68F] text-[#00D68F]'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Grid className="w-4 h-4" />
          <span>App Market & Pixels ({integrations.filter(i => i.isConnected).length}/{integrations.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('campaigns')}
          className={`flex items-center gap-2 py-4 text-xs font-bold transition whitespace-nowrap cursor-pointer border-b-2 ${
            activeTab === 'campaigns'
              ? 'border-[#00D68F] text-[#00D68F]'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Megaphone className="w-4 h-4" />
          <span>Campaigns & Broadcasts ({campaigns.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('whatsapp_templates')}
          className={`flex items-center gap-2 py-4 text-xs font-bold transition whitespace-nowrap cursor-pointer border-b-2 ${
            activeTab === 'whatsapp_templates'
              ? 'border-[#00D68F] text-[#00D68F]'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <PhoneCall className="w-4 h-4" />
          <span>WhatsApp Templates ({waTemplates.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('coupons')}
          className={`flex items-center gap-2 py-4 text-xs font-bold transition whitespace-nowrap cursor-pointer border-b-2 ${
            activeTab === 'coupons'
              ? 'border-[#00D68F] text-[#00D68F]'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>Advanced Coupons & Rules ({advancedCoupons.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('loyalty')}
          className={`flex items-center gap-2 py-4 text-xs font-bold transition whitespace-nowrap cursor-pointer border-b-2 ${
            activeTab === 'loyalty'
              ? 'border-[#00D68F] text-[#00D68F]'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Loyalty Points & Customer Tiers</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 0: APP MARKET & PIXELS */}
      {/* ========================================================= */}
      {activeTab === 'app_market' && (
        <div className="space-y-6">
          {/* Top Merchant Plan Banner */}
          <div className="bg-[#202533] border border-[#2E3548] p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#282E3F] border border-[#3A435E] flex items-center justify-center text-[#00D68F] font-bold">
                <Crown className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">Merchant Account Plan:</span>
                  {isProMerchant ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                      <Crown className="w-3 h-3" /> Pro Merchant Subscription ($19/mo)
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Standard Free Plan
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isProMerchant 
                    ? 'All Pro level apps, TikTok Events API, Bulk SMS, and bKash TrxID verifiers are fully unlocked.' 
                    : 'Upgrade to Pro Merchant plan to unlock advanced tracking pixels, bulk SMS gateways, and automated payment verifiers.'}
                </p>
              </div>
            </div>

            {!isProMerchant && (
              <button
                type="button"
                onClick={handleUpgradeMerchantPlan}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-xs transition cursor-pointer shadow-lg shrink-0 flex items-center gap-1.5"
              >
                <Crown className="w-3.5 h-3.5" />
                <span>{pendingProUpgrade ? 'Payment Pending Admin Approval' : 'Upgrade to Pro ($19/mo)'}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {integrations.map((app) => (
              <div key={app.id} className="bg-[#202533] border border-[#2E3548] hover:border-[#3A435E] rounded-2xl p-6 flex flex-col justify-between shadow-xl transition group">
                <div>
                  {/* Card Header with Brand Logo, Pricing Badge & Active Status */}
                  <div className="flex justify-between items-start gap-3 mb-4">
                    <div className="flex items-center gap-3.5">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm shadow-md shrink-0 ${app.iconBg}`}>
                        {app.iconText === 'FB' && (
                          <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        )}
                        {app.iconText === 'TK' && (
                          <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>
                        )}
                        {app.iconText === 'WA' && (
                          <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.124-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                        )}
                        {app.iconText !== 'FB' && app.iconText !== 'TK' && app.iconText !== 'WA' && app.iconText}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                            {app.category}
                          </span>
                          {app.pricingTier === 'Pro' ? (
                            <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                              <Crown className="w-2.5 h-2.5" /> PRO
                            </span>
                          ) : (
                            <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase">
                              FREE
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-white text-base leading-tight mt-0.5">{app.name}</h3>
                      </div>
                    </div>

                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide shrink-0 ${
                      app.isConnected 
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-slate-800/80 text-slate-400 border border-slate-700/60'
                    }`}>
                      {app.isConnected ? 'Active' : 'Not Installed'}
                    </span>
                  </div>

                  {/* Concise 2-Line Description */}
                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 mt-2">
                    {app.description}
                  </p>
                </div>

                {/* Card Action Button */}
                <div className="pt-4 mt-4 border-t border-[#2E3548]">
                  <button
                    type="button"
                    onClick={() => handleOpenConfigure(app)}
                    className="w-full bg-[#282E3F] hover:bg-[#32394E] text-white font-bold py-2.5 px-4 rounded-xl text-xs transition cursor-pointer border border-[#3A435E] flex items-center justify-center gap-2 shadow"
                  >
                    <Settings className="w-3.5 h-3.5 text-[#00D68F]" />
                    <span>{app.isConnected ? 'Manage Integration' : 'Connect App'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: MARKETING CAMPAIGNS & BROADCASTS */}
      {/* ========================================================= */}
      {activeTab === 'campaigns' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-[#00D68F]" />
                <span>Multi-Channel Campaigns (WhatsApp, SMS, Email)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Direct scheduling and custom audience segmentation with zero plan restrictions.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowCampaignModal(true)}
              className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Launch Campaign</span>
            </button>
          </div>

          {/* Campaigns Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {campaigns.map((c) => (
              <div key={c.id} className="bg-[#202533] border border-[#2E3548] rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase flex items-center gap-1 ${
                      c.channel === 'WhatsApp' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      c.channel === 'SMS' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                      'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                    }`}>
                      {c.channel === 'WhatsApp' && <MessageSquare className="w-3 h-3" />}
                      {c.channel === 'SMS' && <PhoneCall className="w-3 h-3" />}
                      {c.channel === 'Email' && <Mail className="w-3 h-3" />}
                      <span>{c.channel}</span>
                    </span>

                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                      c.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400' :
                      c.status === 'Scheduled' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-slate-700 text-slate-300'
                    }`}>
                      {c.status}
                    </span>
                  </div>

                  <h3 className="font-bold text-white text-sm line-clamp-1">{c.title}</h3>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 italic bg-[#181B26] p-2.5 rounded-xl border border-[#2E3548]/60">
                    "{c.message}"
                  </p>
                </div>

                <div className="space-y-3 pt-3 border-t border-[#2E3548]">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-400 text-[10px] block">Audience Segment</span>
                      <span className="font-semibold text-slate-200 truncate block">{c.targetAudience}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Conversion Rate</span>
                      <span className="font-extrabold text-[#00D68F]">{c.conversionRate}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{c.scheduledAt}</span>
                    </span>
                    <span className="font-bold text-slate-300">
                      Sent: {c.sentCount}/{c.recipientsCount}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => alert(`Broadcasting campaign update for ${c.title}`)}
                    className="w-full py-2 bg-[#282E3F] hover:bg-[#32394E] text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer border border-[#3A435E] flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#00D68F]" />
                    <span>Run Broadcast Now</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: WHATSAPP TEMPLATE MANAGEMENT */}
      {/* ========================================================= */}
      {activeTab === 'whatsapp_templates' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-emerald-400" />
                <span>WhatsApp Meta Business Message Templates</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Design, localize in Bangla/English, and save WhatsApp templates for automated alerts.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowWaTemplateModal(true)}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Create Template</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {waTemplates.map((t) => (
              <div key={t.id} className="bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-4 shadow-xl">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-extrabold px-2.5 py-0.5 rounded-full uppercase border border-emerald-500/30">
                      {t.category} Template
                    </span>
                    <h3 className="font-mono font-bold text-white text-sm mt-1.5">{t.name}</h3>
                  </div>

                  <span className="bg-[#00D68F]/20 text-[#00D68F] text-[10px] font-bold px-2.5 py-1 rounded-full border border-[#00D68F]/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Meta Approved</span>
                  </span>
                </div>

                {/* WhatsApp Chat Card Preview */}
                <div className="bg-[#0b141a] p-4 rounded-2xl border border-emerald-900/40 space-y-2 text-xs font-sans relative">
                  <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider mb-1">
                    WhatsApp Chat Preview ({t.language})
                  </div>

                  {t.headerType === 'Image' && t.headerText && (
                    <SafeImage src={t.headerText} alt="Header" className="w-full h-32 object-cover rounded-xl" />
                  )}
                  {t.headerType === 'Text' && t.headerText && (
                    <div className="font-bold text-white text-sm">{t.headerText}</div>
                  )}

                  <p className="text-slate-200 leading-relaxed bg-[#121b22] p-3 rounded-xl border border-slate-800">
                    {t.bodyText}
                  </p>

                  {t.footerText && (
                    <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                      {t.footerText}
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center text-xs text-slate-400 pt-2 border-t border-[#2E3548]">
                  <span>Created: {t.createdAt}</span>
                  <button
                    type="button"
                    onClick={() => alert(`WhatsApp template "${t.name}" copied to campaign draft.`)}
                    className="text-[#00D68F] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Use in Campaign</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: COMPLETE ADVANCED DISCOUNT & COUPON SYSTEM */}
      {/* ========================================================= */}
      {activeTab === 'coupons' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-[#00D68F]" />
                <span>Advanced Discount, Weight-Based & Customer Segment Coupons</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Unlocked conditions: Groups, Weight Limits (kg), Customer Segments, Free Shipping & Free Cash on Delivery waivers.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCouponModal(true)}
              className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Add Advanced Coupon</span>
            </button>
          </div>

          {/* Coupons Table */}
          <div className="bg-[#202533] border border-[#2E3548] rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#181B26] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#2E3548] font-bold">
                  <tr>
                    <th className="p-3.5 pl-5">Coupon Code & Group</th>
                    <th className="p-3.5">Discount Offer</th>
                    <th className="p-3.5">Target Segment</th>
                    <th className="p-3.5">Weight Limit</th>
                    <th className="p-3.5">Usage & Status</th>
                    <th className="p-3.5 text-right pr-5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2E3548]">
                  {advancedCoupons.map((c) => (
                    <tr key={c.id} className="hover:bg-[#252B3B] transition">
                      
                      {/* Code & Group */}
                      <td className="p-3.5 pl-5">
                        <div className="font-mono font-bold text-sm text-[#00D68F]">{c.code}</div>
                        <span className="text-[10px] bg-slate-800 text-slate-300 font-semibold px-2 py-0.5 rounded border border-slate-700 mt-1 inline-block">
                          {c.group}
                        </span>
                      </td>

                      {/* Offer */}
                      <td className="p-3.5">
                        <div className="font-bold text-white">
                          {c.discountType === 'Percentage' ? `${c.value}% OFF` : 
                           c.discountType === 'Free Shipping' ? 'FREE SHIPPING (৳80 Saved)' :
                           c.discountType === 'Free Cash on Delivery' ? 'FREE COD WAIVER (৳50 Saved)' :
                           `৳${c.value} BDT OFF`}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Min Order: ৳{c.minOrderBDT} BDT • Category: {c.applicableCategory || 'All'}
                        </div>
                      </td>

                      {/* Segment */}
                      <td className="p-3.5">
                        <span className="px-2.5 py-1 rounded-lg bg-[#181B26] border border-[#2E3548] font-bold text-xs text-slate-200">
                          {c.targetSegment}
                        </span>
                      </td>

                      {/* Weight */}
                      <td className="p-3.5 font-mono text-slate-300">
                        {c.minWeightKg}kg - {c.maxWeightKg}kg
                      </td>

                      {/* Usage & Status */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleCouponStatus(c.id)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                              c.status === 'Active' ? 'bg-[#00D68F]' : 'bg-slate-700'
                            }`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                              c.status === 'Active' ? 'translate-x-4' : 'translate-x-1'
                            }`} />
                          </button>
                          <span className={`text-[11px] font-bold ${c.status === 'Active' ? 'text-[#00D68F]' : 'text-slate-400'}`}>
                            {c.status} ({c.usageCount} Used)
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right pr-5">
                        <button
                          type="button"
                          onClick={() => handleDeleteCoupon(c.id)}
                          className="p-1.5 hover:bg-[#282E3F] text-red-400 hover:text-red-300 rounded-lg transition cursor-pointer"
                          title="Delete Coupon"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: UNLOCKED LOYALTY & REWARDS SYSTEM */}
      {/* ========================================================= */}
      {activeTab === 'loyalty' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                <span>Store Loyalty Points, Customer Tiers & Incentive Triggers</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Define spend-to-points earning rates, Silver/Gold/Platinum tiers, Birthday triggers, and direct customer adjustments.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Column 1 & 2: Points Rules & Customer Tiers */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Card 1: Points Earning & Redemption Config */}
              <div className="bg-[#202533] border border-[#2E3548] p-5 sm:p-6 rounded-2xl space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-[#2E3548] pb-3">
                  <div className="flex items-center gap-2 text-amber-400">
                    <Zap className="w-5 h-5 shrink-0" />
                    <h3 className="text-base font-bold text-white">Points Earning & Store Wallet Exchange</h3>
                  </div>
                  <span className="text-[10px] bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded-full border border-amber-500/30 uppercase">
                    ACTIVE ENGINE
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">
                        Spend Amount for 1 Point (BDT)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={loyaltyConfig.spendPerPointBDT}
                          onChange={(e) => handleSaveLoyaltyConfig('spendPerPointBDT', parseInt(e.target.value) || 100)}
                          className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs text-white font-bold focus:border-[#00D68F] focus:outline-none"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">৳ BDT</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1">
                        1 Point Store Wallet Credit (BDT)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          value={loyaltyConfig.pointRedemptionBDT}
                          onChange={(e) => handleSaveLoyaltyConfig('pointRedemptionBDT', parseFloat(e.target.value) || 0.5)}
                          className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs text-white font-bold focus:border-[#00D68F] focus:outline-none"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">৳ BDT</span>
                      </div>
                    </div>
                </div>

                <div className="p-3 bg-[#181B26] rounded-xl border border-[#2E3548] text-xs text-slate-300 flex items-center justify-between">
                  <span>Example: Customer buys ৳2,000 Panjabi</span>
                  <span className="font-bold text-[#00D68F]">
                    Earns 20 Points (Worth ৳{(20 * loyaltyConfig.pointRedemptionBDT).toFixed(0)} Wallet Credit)
                  </span>
                </div>
              </div>

              {/* Card 2: Customer Tiers (Bronze, Silver, Gold, Platinum) */}
              <div className="bg-[#202533] border border-[#2E3548] p-5 sm:p-6 rounded-2xl space-y-4 shadow-xl">
                <div className="flex items-center gap-2 border-b border-[#2E3548] pb-3 text-cyan-400">
                  <Award className="w-5 h-5 shrink-0" />
                  <h3 className="text-base font-bold text-white">Membership Customer Tiers & Perks</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {loyaltyTiers.map((t) => (
                    <div key={t.id} className={`p-4 rounded-2xl border space-y-3 bg-[#181B26] ${t.color}`}>
                      <div className="flex justify-between items-center">
                        <h4 className="font-extrabold text-white text-sm">{t.name}</h4>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[9px] uppercase font-bold text-slate-400">Min Spend (৳)</span>
                          <input
                            type="number"
                            value={t.minSpendBDT}
                            onChange={(e) => handleUpdateTier(t.id, 'minSpendBDT', e.target.value)}
                            className="w-20 bg-slate-900/50 border border-slate-700/50 rounded px-1.5 py-0.5 text-xs text-white font-mono font-bold text-right"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                        <span>Multiplier Rate</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="0.01"
                            value={t.multiplier}
                            onChange={(e) => handleUpdateTier(t.id, 'multiplier', e.target.value)}
                            className="w-16 bg-slate-900/50 border border-slate-700/50 rounded px-1.5 py-0.5 text-xs text-[#00D68F] font-mono font-bold text-right"
                          />
                          <span className="text-[#00D68F]">x Points</span>
                        </div>
                      </div>

                      <ul className="space-y-1 text-[11px] text-slate-300 border-t border-slate-800 pt-2">
                        {t.perks.map((p, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-[#00D68F] shrink-0" />
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 3: Automated Birthday & Anniversary Triggers */}
              <div className="bg-[#202533] border border-[#2E3548] p-5 sm:p-6 rounded-2xl space-y-4 shadow-xl">
                <div className="flex items-center gap-2 border-b border-[#2E3548] pb-3 text-pink-400">
                  <Gift className="w-5 h-5 shrink-0" />
                  <h3 className="text-base font-bold text-white">Automated Birthday & Anniversary Incentive Triggers</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="bg-[#181B26] p-4 rounded-xl border border-[#2E3548] space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <Gift className="w-4 h-4 text-pink-400" />
                        <span>Customer Birthday Trigger</span>
                      </span>
                      <span className="text-[10px] bg-pink-500/20 text-pink-400 font-bold px-2 py-0.5 rounded">Auto-Send</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Auto-credits ৳{loyaltyConfig.birthdayGiftBDT} Store Wallet bonus + 20% OFF Birthday coupon code on customer DOB.
                    </p>
                  </div>

                  <div className="bg-[#181B26] p-4 rounded-xl border border-[#2E3548] space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-purple-400" />
                        <span>Joining Anniversary Trigger</span>
                      </span>
                      <span className="text-[10px] bg-purple-500/20 text-purple-400 font-bold px-2 py-0.5 rounded">Auto-Send</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Auto-credits ৳{loyaltyConfig.anniversaryBonusBDT} Store Wallet voucher on 1-Year store registration anniversary.
                    </p>
                  </div>
                </div>
              </div>

            </div>

            {/* Column 3: Direct Points Adjustment Tool & Audit Logs */}
            <div className="space-y-6">
              
              {/* Points Adjustment Card */}
              <div className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl space-y-4 shadow-xl">
                <h3 className="text-sm font-bold text-white border-b border-[#2E3548] pb-2 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#00D68F]" />
                  <span>Manual Customer Point Adjustment</span>
                </h3>

                <form onSubmit={handleAdjustPoints} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Select Customer</label>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-2.5 text-white font-semibold"
                    >
                      {customersList.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.loyaltyPoints} Pts) • {c.phone}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Action</label>
                      <select
                        value={adjAction}
                        onChange={(e) => setAdjAction(e.target.value as 'add' | 'deduct')}
                        className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-2.5 text-white font-bold"
                      >
                        <option value="add">+ Award Points</option>
                        <option value="deduct">- Deduct Points</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Points Amount</label>
                      <input
                        type="number"
                        required
                        value={adjPoints}
                        onChange={(e) => setAdjPoints(e.target.value)}
                        placeholder="e.g. 250"
                        className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-2.5 text-white font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Adjustment Reason Note</label>
                    <input
                      type="text"
                      required
                      value={adjReason}
                      onChange={(e) => setAdjReason(e.target.value)}
                      placeholder="e.g. Service apology, VIP bonus"
                      className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-2.5 text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-extrabold rounded-xl transition cursor-pointer shadow-md"
                  >
                    Confirm Point Adjustment
                  </button>
                </form>
              </div>

              {/* Point Adjustment Audit Logs */}
              <div className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl space-y-3 shadow-xl">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span>Recent Point Log History</span>
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                </h3>

                <div className="space-y-2 text-xs">
                  {pointHistoryLog.map(log => (
                    <div key={log.id} className="p-3 bg-[#181B26] rounded-xl border border-[#2E3548] space-y-1">
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-white">{log.customerName}</span>
                        <span className={log.delta >= 0 ? 'text-[#00D68F]' : 'text-red-400'}>
                          {log.delta >= 0 ? `+${log.delta}` : log.delta} Pts
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex justify-between">
                        <span>{log.reason}</span>
                        <span>{log.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 1: CREATE MARKETING CAMPAIGN MODAL */}
      {/* ========================================================= */}
      {showCampaignModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#2E3548] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-[#00D68F]" />
                <span>Create Marketing Campaign</span>
              </h3>
              <button onClick={() => setShowCampaignModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Campaign Title *</label>
                <input
                  type="text"
                  required
                  value={campTitle}
                  onChange={(e) => setCampTitle(e.target.value)}
                  placeholder="e.g. Puja Special WhatsApp Offer 2026"
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-3 text-white font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Broadcast Channel</label>
                  <select
                    value={campChannel}
                    onChange={(e) => setCampChannel(e.target.value as 'WhatsApp' | 'SMS' | 'Email')}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-2.5 text-white font-bold"
                  >
                    <option value="WhatsApp">WhatsApp Message</option>
                    <option value="SMS">SMS Text Alert</option>
                    <option value="Email">Email Marketing</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Target Segment</label>
                  <select
                    value={campSegment}
                    onChange={(e) => setCampSegment(e.target.value)}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-2.5 text-white font-bold"
                  >
                    <option value="All Past Buyers">All Past Buyers ({segmentStats.pastBuyers} Users)</option>
                    <option value="VIP Customers">VIP Customers ({segmentStats.vip} Users)</option>
                    <option value="New Signups">New Signups ({segmentStats.new} Users)</option>
                    <option value="Abandoned Cart Users">Abandoned Cart Users ({segmentStats.abandoned} Users)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Message Content / Offer Body *</label>
                <textarea
                  rows={3}
                  required
                  value={campMessage}
                  onChange={(e) => setCampMessage(e.target.value)}
                  placeholder="Enter broadcast message text in Bangla or English..."
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-3 text-white"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-slate-300 font-bold">Sending Timing</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="schedule"
                      checked={campScheduleType === 'now'}
                      onChange={() => setCampScheduleType('now')}
                      className="accent-[#00D68F]"
                    />
                    <span className="text-white">Send Immediately</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="schedule"
                      checked={campScheduleType === 'later'}
                      onChange={() => setCampScheduleType('later')}
                      className="accent-[#00D68F]"
                    />
                    <span className="text-white">Schedule Future Date</span>
                  </label>
                </div>

                {campScheduleType === 'later' && (
                  <input
                    type="datetime-local"
                    value={campScheduleDate}
                    onChange={(e) => setCampScheduleDate(e.target.value)}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-2.5 text-white mt-1"
                  />
                )}
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCampaignModal(false)}
                  className="px-4 py-2 bg-[#282E3F] text-slate-300 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#00D68F] text-slate-950 font-bold rounded-xl"
                >
                  Launch Broadcast
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: CREATE WHATSAPP TEMPLATE MODAL */}
      {/* ========================================================= */}
      {showWaTemplateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#2E3548] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-emerald-400" />
                <span>Create WhatsApp Business Template</span>
              </h3>
              <button onClick={() => setShowWaTemplateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWaTemplate} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Template Name (Unique identifier) *</label>
                <input
                  type="text"
                  required
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  placeholder="e.g. puja_festive_discount_bn"
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-3 text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Category</label>
                  <select
                    value={tplCategory}
                    onChange={(e) => setTplCategory(e.target.value as any)}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-2.5 text-white font-bold"
                  >
                    <option value="Marketing">Marketing Promo</option>
                    <option value="Utility">Utility Alert</option>
                    <option value="Authentication">Authentication Code</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Language</label>
                  <select
                    value={tplLanguage}
                    onChange={(e) => setTplLanguage(e.target.value as any)}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-2.5 text-white font-bold"
                  >
                    <option value="Bangla (bn_BD)">Bangla (bn_BD)</option>
                    <option value="English (en_US)">English (en_US)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Template Body Text with Variables *</label>
                <textarea
                  rows={4}
                  required
                  value={tplBodyText}
                  onChange={(e) => setTplBodyText(e.target.value)}
                  placeholder="Hello {{1}}, get {{2}}% OFF on your order with coupon {{3}}..."
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-3 text-white"
                />
                <p className="text-[10px] text-slate-400 mt-1">Use {"{{1}}"}, {"{{2}}"} as dynamic placeholders for customer name or coupon code.</p>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Footer Text (Optional)</label>
                <input
                  type="text"
                  value={tplFooterText}
                  onChange={(e) => setTplFooterText(e.target.value)}
                  placeholder="My Store Store • Reply STOP to opt out"
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-2.5 text-white"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowWaTemplateModal(false)}
                  className="px-4 py-2 bg-[#282E3F] text-slate-300 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-500 text-slate-950 font-bold rounded-xl cursor-pointer"
                >
                  Submit for Approval
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: CREATE ADVANCED COUPON MODAL */}
      {/* ========================================================= */}
      {showCouponModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#1D212E] border border-[#2E3548] rounded-2xl p-6 w-full max-w-xl space-y-4 shadow-2xl my-8">
            <div className="flex justify-between items-center border-b border-[#2E3548] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-[#00D68F]" />
                <span>Create Unlocked Advanced Coupon</span>
              </h3>
              <button onClick={() => setShowCouponModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAdvancedCoupon} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Coupon Promo Code *</label>
                  <input
                    type="text"
                    required
                    value={cCode}
                    onChange={(e) => setCCode(e.target.value)}
                    placeholder="e.g. PUJA2026"
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-3 text-white font-mono uppercase font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Coupon Group</label>
                  <select
                    value={cGroup}
                    onChange={(e) => setCGroup(e.target.value as any)}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-3 text-white font-bold"
                  >
                    <option value="Seasonal Promo">Seasonal Promo</option>
                    <option value="Flash Sale">Flash Sale</option>
                    <option value="Customer Exclusive">Customer Exclusive</option>
                    <option value="Free Shipping Offer">Free Shipping Offer</option>
                    <option value="COD Waiver">COD Fee Waiver</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Discount Type</label>
                  <select
                    value={cType}
                    onChange={(e) => setCType(e.target.value as any)}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-2.5 text-white font-bold"
                  >
                    <option value="Percentage">Percentage (%) OFF</option>
                    <option value="Fixed BDT">Fixed Amount (৳ BDT) OFF</option>
                    <option value="Free Shipping">Free Home Delivery Waiver</option>
                    <option value="Free Cash on Delivery">Free Cash on Delivery Waiver</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    {cType === 'Percentage' ? 'Discount Percentage (%)' : 'Discount Value (BDT)'}
                  </label>
                  <input
                    type="number"
                    value={cValue}
                    onChange={(e) => setCValue(e.target.value)}
                    placeholder={cType === 'Percentage' ? 'e.g. 10' : 'e.g. 100'}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-2.5 text-white font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Target Customer Segment</label>
                  <select
                    value={cSegment}
                    onChange={(e) => setCSegment(e.target.value as any)}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-2.5 text-white font-bold"
                  >
                    <option value="All Customers">All Customers</option>
                    <option value="VIP">VIP Group Only</option>
                    <option value="Regular">Regular Buyers</option>
                    <option value="New">New First-time Buyers</option>
                    <option value="Wholesale">Wholesale Buyers</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Min Order Amount (BDT)</label>
                  <input
                    type="number"
                    value={cMinOrder}
                    onChange={(e) => setCMinOrder(e.target.value)}
                    placeholder="e.g. 1000"
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-2.5 text-white font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-[#181B26] p-3 rounded-xl border border-[#2E3548]">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Min Order Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={cMinWeight}
                    onChange={(e) => setCMinWeight(e.target.value)}
                    placeholder="0.0"
                    className="w-full bg-[#202533] border border-[#2E3548] rounded-xl p-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Max Order Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={cMaxWeight}
                    onChange={(e) => setCMaxWeight(e.target.value)}
                    placeholder="10.0"
                    className="w-full bg-[#202533] border border-[#2E3548] rounded-xl p-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cAllowFreeShip}
                    onChange={(e) => setCAllowFreeShip(e.target.checked)}
                    className="accent-[#00D68F]"
                  />
                  <span className="text-slate-200">Include Free Shipping</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cAllowFreeCOD}
                    onChange={(e) => setCAllowFreeCOD(e.target.checked)}
                    className="accent-[#00D68F]"
                  />
                  <span className="text-slate-200">Include Free Cash on Delivery</span>
                </label>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCouponModal(false)}
                  className="px-4 py-2 bg-[#282E3F] text-slate-300 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#00D68F] text-slate-950 font-bold rounded-xl"
                >
                  Create Unlocked Coupon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* App Integration Setup Modal */}
      {selectedApp && (() => {
        const isLocked = selectedApp.pricingTier === 'Pro' && !isProMerchant;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-[#1C212E] border border-[#2E3548] rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl overflow-hidden">
              {/* Modal Header with Pricing Badge */}
              <div className="flex justify-between items-start border-b border-[#2E3548] pb-4">
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-md ${selectedApp.iconBg}`}>
                    {selectedApp.iconText}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-black text-white leading-tight">Configure {selectedApp.name}</h3>
                    </div>
                    {/* Pricing Badge */}
                    {selectedApp.pricingTier === 'Pro' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        <Crown className="w-3 h-3 text-amber-400" />
                        <span>{selectedApp.priceLabel}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>{selectedApp.priceLabel}</span>
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedApp(null)}
                  className="p-1.5 hover:bg-[#282E3F] rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Inline Pro Plan Upgrade Banner if app is locked */}
              {isLocked && (
                <div className="p-4 bg-gradient-to-r from-amber-500/15 to-amber-600/10 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-200 shadow-md">
                  <div className="flex items-start gap-2.5">
                    <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-extrabold text-white">{pendingProUpgrade ? 'Upgrade Request Pending Approval' : 'Upgrade to Pro Merchant Plan to unlock this app'}</p>
                      <p className="text-[11px] text-amber-200/80 mt-0.5">
                        Pro integrations require an active Zid Pro plan ($19/mo) for server-side API access and live conversion tracking.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleUpgradeMerchantPlan}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl transition cursor-pointer text-xs shrink-0 shadow-md flex items-center justify-center gap-1.5"
                  >
                    <Crown className="w-3.5 h-3.5" />
                    <span>Upgrade Now</span>
                  </button>
                </div>
              )}

              <form onSubmit={handleSaveIntegration} className="space-y-4">
                {/* Field 1 */}
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    {selectedApp.field1Label} *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isLocked}
                    value={f1Val}
                    onChange={(e) => setF1Val(e.target.value)}
                    placeholder={`Enter ${selectedApp.field1Label}`}
                    className="w-full bg-[#13161F] border border-[#2E3548] rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:border-[#00D68F] focus:outline-none shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Field 2 */}
                {selectedApp.field2Label && (
                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1.5">
                      {selectedApp.field2Label}
                    </label>
                    <input
                      type="text"
                      disabled={isLocked}
                      value={f2Val}
                      onChange={(e) => setF2Val(e.target.value)}
                      placeholder={`Enter ${selectedApp.field2Label}`}
                      className="w-full bg-[#13161F] border border-[#2E3548] rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:border-[#00D68F] focus:outline-none shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                )}

                {/* Step-by-Step Helper Guide & Tooltips */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowGuide(!showGuide)}
                    className="text-xs text-[#00D68F] hover:underline font-bold flex items-center gap-1.5 cursor-pointer py-1"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>{selectedApp.guideTitle || "Where do I find my credentials?"}</span>
                  </button>

                  {showGuide && selectedApp.guideSteps && (
                    <div className="mt-2 p-3.5 bg-[#13161F] border border-[#2E3548] rounded-2xl text-xs space-y-2 text-slate-300 animate-fadeIn shadow-inner">
                      <p className="font-bold text-white flex items-center gap-1.5 text-xs">
                        <Info className="w-4 h-4 text-[#00D68F]" />
                        <span>Step-by-Step Micro Instructions:</span>
                      </p>
                      <ul className="space-y-1.5 pl-1 text-[11px] text-slate-400">
                        {selectedApp.guideSteps.map((step, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-[#00D68F] font-bold shrink-0">{idx + 1}.</span>
                            <span className="leading-relaxed">{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Test Connection Status Banner */}
                {testStatus === 'success' && (
                  <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center gap-2.5 text-xs text-emerald-400 animate-fadeIn">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    <div>
                      <span className="font-bold">Connection Verified!</span> Test <code className="bg-slate-900 px-1 py-0.5 rounded text-[10px] text-emerald-300 font-mono">PageView</code> event dispatched successfully. Pixel Active & Tracking.
                    </div>
                  </div>
                )}

                {/* Security Note */}
                <div className="p-3 bg-[#13161F] rounded-2xl border border-[#2E3548] text-xs text-slate-300 space-y-0.5">
                  <div className="font-bold text-[#00D68F] flex items-center gap-1.5 text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Secure Server-Side & Client Injection</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    When connected, API keys and tracking pixels are automatically embedded into your storefront header/footer for lightning-fast conversion tracking.
                  </p>
                </div>

                {/* Modal Footer Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-3 border-t border-[#2E3548]">
                  <button
                    type="button"
                    disabled={isLocked || testStatus === 'testing'}
                    onClick={handleTestConnection}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#282E3F] hover:bg-[#32394E] disabled:opacity-50 text-slate-200 font-bold text-xs transition cursor-pointer border border-[#3A435E] flex items-center justify-center gap-1.5"
                  >
                    {testStatus === 'testing' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 text-[#00D68F] animate-spin" />
                        <span>Sending Test Event...</span>
                      </>
                    ) : (
                      <>
                        <Activity className="w-3.5 h-3.5 text-[#00D68F]" />
                        <span>Test Connection</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedApp(null)}
                      className="px-4 py-2.5 rounded-xl bg-[#282E3F] hover:bg-[#32394E] text-slate-300 font-bold text-xs transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLocked}
                      className="px-5 py-2.5 rounded-xl bg-[#00D68F] hover:bg-[#00E699] disabled:opacity-50 text-slate-950 font-bold text-xs transition cursor-pointer shadow-lg"
                    >
                      Save & Connect Integration
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Upgrade Required Lock Modal for Free Merchants accessing Pro Apps */}
      {lockedAppModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-[#1C212E] border border-amber-500/40 rounded-3xl max-w-md w-full p-6 sm:p-7 space-y-5 shadow-2xl overflow-hidden relative">
            <div className="flex justify-between items-start border-b border-[#2E3548] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white leading-tight">Pro Integration - Upgrade Required</h3>
                  <span className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider">Access Lock</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLockedAppModal(null)}
                className="p-1.5 hover:bg-[#282E3F] rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target App Card Preview */}
            <div className="bg-[#13161F] p-4 rounded-2xl border border-[#2E3548] flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${lockedAppModal.iconBg}`}>
                {lockedAppModal.iconText}
              </div>
              <div>
                <h4 className="font-bold text-white text-sm leading-tight">{lockedAppModal.name}</h4>
                <span className="inline-block mt-1 text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase">
                  Requires Pro Subscription
                </span>
              </div>
            </div>

            {/* Lock Notice */}
            <div className="space-y-3">
              <p className="text-xs text-slate-200 leading-relaxed font-medium">
                This is a Pro Integration. Upgrade your account to Pro Plan ($19/mo) to unlock Bulk SMS & bKash Auto-Verification.
              </p>

              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-2 text-xs text-amber-200">
                <div className="font-extrabold text-amber-300 flex items-center gap-1.5 text-xs">
                  <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Pro Plan ($19/mo) Unlocks:</span>
                </div>
                <ul className="space-y-1.5 text-slate-300 pl-1 text-[11px]">
                  <li className="flex items-center gap-1.5">
                    <span className="text-amber-400 font-bold">✓</span>
                    <span>TikTok Pixel & Server-Side Events API (CAPI)</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-amber-400 font-bold">✓</span>
                    <span>Bulk SMS Marketing (Greenweb / GP / BL)</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="text-amber-400 font-bold">✓</span>
                    <span>bKash TrxID Real-time Payment Auto-Verification</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#2E3548]">
              <button
                type="button"
                onClick={() => setLockedAppModal(null)}
                className="px-4 py-2.5 rounded-xl bg-[#282E3F] hover:bg-[#32394E] text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleUpgradeMerchantPlan();
                  setLockedAppModal(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs transition cursor-pointer shadow-lg flex items-center gap-1.5"
              >
                <Crown className="w-4 h-4" />
                <span>{pendingProUpgrade ? 'Payment Pending Approval' : 'Upgrade Now ($19/mo)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

          {merchant && adminPaymentConfig && (
        <ProFeaturePaymentModal
          isOpen={isProPaymentModalOpen}
          onClose={() => setIsProPaymentModalOpen(false)}
          merchant={merchant}
          adminPaymentConfig={adminPaymentConfig}
          onConfirmPayment={handleConfirmProPayment}
        />
      )}
    </div>
  );
};
