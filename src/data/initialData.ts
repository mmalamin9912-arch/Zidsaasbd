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

export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: 'starter_1m',
    name: '1-Month Plan',
    price: 1200,
    durationDays: 30,
    badge: '1_MONTH',
    features: ['Up to 100 Products', 'Standard Themes', 'Basic AI Tools', 'Standard Support'],
    isActive: true
  },
  {
    id: 'starter_3m',
    name: 'Starter Plan (3 Months)',
    price: 3000,
    durationDays: 90,
    badge: '3_MONTHS',
    features: ['Up to 500 Products', 'Standard Themes', 'Pro AI Tools (Description, Image, Pricing)', 'Standard Support'],
    isActive: true
  },
  {
    id: 'pro_6m',
    name: 'Pro Plan (6 Months)',
    price: 5500,
    durationDays: 180,
    badge: '6_MONTHS',
    features: ['Unlimited Products', 'Premium Themes', 'Pro AI Marketing & Caption Tools', 'Priority Support'],
    isPopular: true,
    isActive: true
  },
  {
    id: 'enterprise_12m',
    name: 'Enterprise Plan (12 Months)',
    price: 15000,
    durationDays: 365,
    badge: '12_MONTHS',
    features: ['Unlimited Products', 'Full AI Suite Unlocked', 'Priority Support', 'Custom Domain'],
    isActive: true
  }
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
    logo: 'https://steadfast.com.bd/assets/img/logo.png',
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
    logo: 'https://pathao.com/wp-content/uploads/2018/12/Pathao-Logo.png',
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
    logo: 'https://redx.com.bd/static/redx-logo-red.svg',
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
    logo: 'https://ecourier.com.bd/wp-content/uploads/2018/11/ecourier-logo.png',
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
    logo: 'https://www.paperfly.com.bd/img/paperfly_logo.png',
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
