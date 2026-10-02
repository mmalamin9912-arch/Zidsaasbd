import {
  MerchantProfile,
  SubscriptionPlan,
  BankAccount,
  MobileBankingConfig,
  CodConfig,
  PaymentGatewayConfig,
  CourierService,
  Order,
  Product,
  Customer,
  DiscountCoupon,
  InvoiceRecord,
  ThemeConfig,
  SubscriptionRequest,
  ThemePurchaseRequest,
  PlatformTheme,
  SupportTicket,
  PlatformAddon,
  AuditLog,
  PlatformSecuritySettings,
  BroadcastMessage,
  PlatformAutomationSettings,
  AdminTeamMember,
  AdminRolePermission,
  PlatformSettings
} from '../types';

export const initialMerchant: MerchantProfile = {
  storeName: 'My Store',
  storeSlug: 'mystore',
  ownerName: 'Store Owner',
  email: '',
  phone: '',
  currency: 'BDT',
  exchangeRateBDT: 120, // 1 USD = 120 BDT
  trialDaysTotal: 30,
  trialDaysRemaining: 30,
  plan_started_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  planStartedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  selectedPlanDays: 30,
  duration_days: 30,
  durationDays: 30,
  subscriptionPlan: 'free_trial',
  subscriptionExpiry: null,
  isLocked: false,
  onboardingProgress: 0,
  logoUrl: '',
  totalSalesBDT: 0,
  activeThemeId: 'theme-1',
  heroTitle: 'Welcome to Our Store',
  heroSubtitle: 'Discover our premium collections.',
  announcementText: 'Welcome to our store! Enjoy fast delivery.',
  shippingConfig: {
    type: 'flat',
    fee: 60
  },
  paymentMethods: {
    cod: true,
    bkash: true,
    cards: false
  },
  tracking: {
  },
  themeConfig: {
    storeLogoText: 'My Store',
    logoImageUrl: '',
    headerBgColor: '#ffffff',
    announcementBg: '#D4AF37',
    headerSticky: true,
    showAnnouncement: true,
    showHeroBanner: true,
    showCategories: true,
    showFeaturedGrid: true,
    categoriesHeading: 'Popular Categories',
    categoriesSubtitle: 'Shop by category',
    categoriesMoreButtonText: 'View All',
    featuredHeading: 'Featured Products',
    heroCtaText: 'Shop Now',
    footerAboutText: 'A simple store powered by Zid Multi-Tenant SaaS Engine.',
    footerLinksTitle: 'Quick Links',
    footerLinks: ['About Us', 'Shipping Policy', 'Return Policy', 'Track Order'],
    contactPhone: '+8801700000000',
    dhakaAddress: 'Dhaka, Bangladesh',
    announcementText: 'Welcome to our store!'
  }
};

export const initialThemes: PlatformTheme[] = [
  {
    id: 'theme-1',
    name: 'Default Modern',
    category: 'General',
    price: 0,
    isFree: true,
    thumbnailUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=400',
    previewUrl: '#',
    status: 'Active'
  },
  {
    id: 'theme-2',
    name: 'Luxury Boutique',
    category: 'Fashion',
    price: 1999,
    isFree: false,
    thumbnailUrl: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&q=80&w=400',
    previewUrl: '#',
    status: 'Active'
  },
  {
    id: 'theme-3',
    name: 'Tech Store Pro',
    category: 'Electronics',
    price: 2499,
    isFree: false,
    thumbnailUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=400',
    previewUrl: '#',
    status: 'Active'
  }
];
export const initialBankAccounts: BankAccount[] = [];
export const initialMobileBanking: MobileBankingConfig[] = [
  {
    id: 'mb-bkash',
    provider: 'bkash',
    displayName: 'bKash Merchant Direct',
    accountType: 'Merchant',
    number: '',
    merchantApiKey: '',
    isEnabled: false,
    chargePercentage: 1.5,
    instructions: '',
    requireTrxId: true,
    canPayAdvanceCharge: true
  },
  {
    id: 'mb-nagad',
    provider: 'nagad',
    displayName: 'Nagad Personal / Agent',
    accountType: 'Personal',
    number: '',
    isEnabled: false,
    chargePercentage: 1.0,
    instructions: '',
    requireTrxId: true,
    canPayAdvanceCharge: true
  },
  {
    id: 'mb-rocket',
    provider: 'rocket',
    displayName: 'Rocket Personal / Merchant',
    accountType: 'Personal',
    number: '',
    isEnabled: false,
    chargePercentage: 1.0,
    instructions: '',
    requireTrxId: true,
    canPayAdvanceCharge: true
  }
];
export const initialOrders: Order[] = [];
export const initialProducts: Product[] = [];
export const initialCustomers: Customer[] = [];
export const initialCoupons: DiscountCoupon[] = [];
export const initialInvoices: InvoiceRecord[] = [];

/**
 * Default plan catalogue — a Bangladesh-market SaaS ladder.
 *
 * Structure: Starter → Growth → Pro → Enterprise. `displayOrder` (10/20/30/40)
 * is what renders the grid left-to-right; `sortPlansByTier` applies it.
 *
 * TIER DIFFERENCES ARE DELIBERATE AND NON-OVERLAPPING.
 * Each tier lists only what it uniquely grants, so no bullet appears on two
 * cards:
 *   Starter    — 50 products, free subdomain, standard themes, basic courier, email support
 *   Growth     — 500 products, custom .com, premium themes, Meta+GA tracking, AI caption, phone support
 *   Pro        — unlimited products, all themes + CSS customizer, full AI suite, WhatsApp recovery, 24/7 VIP
 *   Enterprise — the Pro capability set on the longest term
 *
 * `features` is the prose the card renders (see `derivePlanFeatures`); the
 * `featureFlags` next to it are the machine-readable entitlements the Super
 * Admin toggles. Keep the two in step when editing either.
 *
 * PRICING
 * `price` + `durationDays` are the legacy single-term pair kept for older
 * readers and deliberately NOT user-facing: the term a merchant buys is chosen
 * with the Monthly/Yearly toggle, so a hardcoded term in the plan name or card
 * would contradict the price they are being quoted. The UI quotes
 * `monthlyPrice` / `yearlyPrice` through src/lib/planPricing.ts.
 */
export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: 'rise',
    name: 'Rise',
    price: 999,
    durationDays: 30,
    badge: 'STARTER',
    displayOrder: 10,
    monthlyPrice: 999,
    maxProducts: 100,
    featureFlags: {
      freeSubdomain: true,
      customDomain: true,
      premiumThemes: false,
      cssCustomizer: false,
      courierApi: true,
      courierAutoSync: false,
      metaPixels: false,
      googleAnalytics: false,
      aiCaption: false,
      aiContent: false,
      removeBg: false,
      aiCopilot: false,
      whatsappRecovery: false,
      emailSupport: true,
      phoneSupport: false,
      prioritySupport: false,
    },
    features: [
      'Up to 100 Products',
      'Standard Themes Store',
      'Link Custom Domain',
      'Integrated Courier & COD Payments',
      'Standard Support',
    ],
    isActive: true,
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 2499,
    durationDays: 30,
    badge: 'ENTERPRISE',
    displayOrder: 20,
    monthlyPrice: 2499,
    maxProducts: 0,
    featureFlags: {
      freeSubdomain: true,
      customDomain: true,
      premiumThemes: true,
      cssCustomizer: true,
      courierApi: true,
      courierAutoSync: true,
      metaPixels: true,
      googleAnalytics: true,
      aiCaption: true,
      aiContent: true,
      removeBg: true,
      aiCopilot: true,
      whatsappRecovery: true,
      emailSupport: true,
      phoneSupport: true,
      prioritySupport: true,
    },
    features: [
      'UNLIMITED Products',
      'Access All Premium Themes & Custom CSS',
      'Meta Pixel, TikTok Pixel & Google Analytics (GA4)',
      'AI Social Caption & Description Generator',
      'WhatsApp Abandoned Cart Auto-Recovery',
      'Priority 24/7 Direct Support',
    ],
    isPopular: true,
    isActive: true,
  },
];

export const initialCodConfig: CodConfig = {
  isEnabled: true,
  insideDhakaFee: '',
  outsideDhakaFee: '',
  subDhakaFee: '',
  freeShippingThreshold: '',
  maxOrderLimit: '',
  requestAdvanceDeliveryCharge: false,
  advanceDeliveryChargeAmount: '',
  notes: ''
};

export const initialCouriers: CourierService[] = [
  {
    id: 'steadfast',
    name: 'Steadfast Courier',
    // Self-hosted brand icon. Every courier previously pointed at a remote CDN
    // URL that now 404s (or times out), which is why all five logos rendered
    // broken. Local assets cannot rot.
    logo: '/couriers/steadfast.svg',
    description: 'Fastest 24-hour home delivery service in Dhaka and 64 districts coverage.',
    isConnected: false,
    coverage: '64 Districts',
    avgDeliveryDays: '1-3 Days',
    apiCredentials: {
      apiKey: '',
      secretKey: '',
      clientId: ''
    },
    pickupAddress: '',
    autoSyncOrders: false
  },
  {
    id: 'pathao',
    name: 'Pathao Courier',
    logo: '/couriers/pathao.svg',
    description: 'Relentless moving with largest delivery fleet in Bangladesh.',
    isConnected: false,
    coverage: 'Nationwide',
    avgDeliveryDays: 'Same Day / 24h',
    apiCredentials: {
      apiKey: '',
      clientId: '',
      clientSecret: '',
      storeId: ''
    },
    pickupAddress: '',
    autoSyncOrders: false
  },
  {
    id: 'redx',
    name: 'RedX Logistics',
    logo: '/couriers/redx.svg',
    description: 'End-to-end logistics solutions for e-commerce businesses.',
    isConnected: false,
    coverage: 'Nationwide',
    avgDeliveryDays: '2-4 Days',
    apiCredentials: {
      apiKey: '',
      storeId: ''
    },
    pickupAddress: '',
    autoSyncOrders: false
  },
  {
    id: 'ecourier',
    name: 'eCourier',
    logo: '/couriers/ecourier.svg',
    description: 'Traditional & specialized logistics service provider.',
    isConnected: false,
    coverage: '64 Districts',
    avgDeliveryDays: '2-3 Days',
    apiCredentials: {
      apiKey: '',
      secretKey: '',
      storeId: ''
    },
    pickupAddress: '',
    autoSyncOrders: false
  },
  {
    id: 'paperfly',
    name: 'Paperfly',
    logo: '/couriers/paperfly.svg',
    description: 'Smart logistics for e-commerce with nationwide doorstep delivery.',
    isConnected: false,
    coverage: '4400+ Unions',
    avgDeliveryDays: '2-4 Days',
    apiCredentials: {
      apiKey: '',
      secretKey: '',
      storeId: ''
    },
    pickupAddress: '',
    autoSyncOrders: false
  }
];

export const initialPaymentGateway: PaymentGatewayConfig = {
  gateway: 'SSLCommerz',
  storeId: '',
  storePassword: '',
  isEnabled: false
};

export const initialPlatformSettings: PlatformSettings = {
  siteTitle: 'Zid SaaS BD',
  logoUrl: '',
  faviconUrl: '',
  supportPhone: '+8801844990011',
  supportEmail: 'support@zid.com',
  supportAddress: '123 Tech Plaza, Dhaka, Bangladesh',
  currencySymbol: '৳ BDT',
  taxRate: 5,
  facebookUrl: 'https://facebook.com/zidsaas',
  whatsappNumber: '+8801844990011',
  termsUrl: '/terms',
  privacyUrl: '/privacy',
  // Intentionally blank: the Super Admin authors these in Platform
  // Configuration → Trial & Legal. Seeded with no copy so the merchant modal
  // shows its "not published" notice instead of fabricated legal text.
  platformRules: '',
  globalTrialDays: 30,
  aiContentProOnly: true,
  aiWhatsAppMarketingProOnly: true,
  aiBgRemoverProOnly: true
};

export const initialPlatformAnnouncement: any = {
  id: 'ann-1',
  message: 'Welcome to your dashboard! Enjoy your subscription.',
  isActive: true,
  type: 'Info',
  targetAudience: 'All Merchants',
  ctaText: 'View Guide',
  ctaUrl: 'https://docs.zid.com',
  createdAt: new Date().toISOString()
};

export const initialAllMerchants: MerchantProfile[] = [];

export const initialPendingSubscriptions: SubscriptionRequest[] = [];

export const initialThemePurchaseRequests: ThemePurchaseRequest[] = [];
// No mock support tickets. Tickets are sourced from real merchant submissions
// in Supabase/MongoDB; an empty array renders the clean "No tickets found"
// empty state until a real ticket arrives.
export const initialSupportTickets: SupportTicket[] = [];
export const initialPlatformAddons: PlatformAddon[] = [
  {
    id: 'addon-1',
    name: 'Facebook Pixel',
    category: 'Marketing',
    pricingType: 'Free',
    price: 0,
    description: 'Track conversions and optimize your ads with ease.',
    icon: 'Target',
    isPublished: true
  },
  {
    id: 'addon-2',
    name: 'Custom Domain',
    category: 'Domain',
    pricingType: 'Monthly Recurring',
    price: 499,
    description: 'Connect your own professional domain to your store.',
    icon: 'Globe',
    isPublished: true
  },
  {
    id: 'addon-3',
    name: 'SMS Notifications',
    category: 'Communication',
    pricingType: 'One-time Fee',
    price: 999,
    description: 'Send automated order updates to your customers via SMS.',
    icon: 'MessageSquare',
    isPublished: true
  }
];

export const initialAuditLogs: AuditLog[] = [
  {
    id: 'log-1',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    adminUser: 'Super Admin',
    action: 'Approved Subscription',
    targetEntity: 'Gadget Hub',
    ipAddress: '192.168.1.1',
    severity: 'Info'
  },
  {
    id: 'log-2',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    adminUser: 'Super Admin',
    action: 'Suspended Merchant',
    targetEntity: 'Fraudulent Store',
    ipAddress: '192.168.1.5',
    severity: 'Critical'
  },
  {
    id: 'log-3',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    adminUser: 'Super Admin',
    action: 'Updated Theme Price',
    targetEntity: 'Luxury Boutique',
    ipAddress: '192.168.1.1',
    severity: 'Warning'
  },
  {
    id: 'log-4',
    timestamp: new Date(Date.now() - 172800000).toISOString(),
    adminUser: 'Support Lead',
    action: 'Resolved Ticket',
    targetEntity: 'Ticket #4422',
    ipAddress: '192.168.1.12',
    severity: 'Info'
  },
  {
    id: 'log-5',
    timestamp: new Date(Date.now() - 259200000).toISOString(),
    adminUser: 'Finance Admin',
    action: 'Rejected Refund',
    targetEntity: 'Order #3391',
    ipAddress: '192.168.1.18',
    severity: 'Warning'
  }
];

export const initialSecuritySettings: PlatformSecuritySettings = {
  force2FAForMerchants: false,
  adminSessionTimeout: 30,
  ipWhitelistingEnabled: false,
  maxLoginAttempts: 5
};

export const initialBroadcastHistory: BroadcastMessage[] = [
  {
    id: 'bc-1',
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
    audience: 'All Merchants',
    subject: 'System Maintenance Update',
    type: 'In-App Announcement',
    body: 'We will be performing scheduled maintenance on Sunday at 2 AM BST.',
    status: 'Delivered'
  },
  {
    id: 'bc-2',
    timestamp: new Date(Date.now() - 86400000 * 5).toISOString(),
    audience: 'Paid Subscriptions',
    subject: 'New Premium Feature: Advanced Analytics',
    type: 'Both',
    body: 'Unlock deeper insights with our new Advanced Analytics dashboard.',
    status: 'Delivered'
  }
];

export const initialAutomationSettings: PlatformAutomationSettings = {
  subscriptionExpiryWarning: true,
  welcomeEmail: true,
  paymentApprovalAlert: true,
  merchantSuspensionAlert: true
};

// Only the real, seeded platform administrator remains. The previous mock
// members (Sara Khan, Tanvir Hossain) were removed from the platform.
export const initialAdminTeam: AdminTeamMember[] = [
  {
    id: 'adm-1',
    fullName: 'System Administrator',
    email: 'admin@zid.com',
    role: 'Super Admin',
    lastActive: new Date().toISOString(),
    status: 'Active'
  }
];

export const initialRolePermissions: AdminRolePermission[] = [
  {
    role: 'Super Admin',
    allowedTabs: ['analytics', 'gateways', 'approvals', 'merchants', 'settings', 'announcements', 'plans', 'themes', 'support', 'addons', 'security', 'broadcast', 'team']
  },
  {
    role: 'Support Lead',
    allowedTabs: ['merchants', 'support', 'announcements', 'team']
  },
  {
    role: 'Finance Admin',
    allowedTabs: ['analytics', 'gateways', 'approvals', 'plans']
  },
  {
    role: 'Marketing Admin',
    allowedTabs: ['announcements', 'addons', 'broadcast']
  }
];
