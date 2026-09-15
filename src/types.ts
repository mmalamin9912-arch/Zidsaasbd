export interface GalleryImage {
  url: string;
  caption?: string;
  link?: string;
}

export type NavigationTab =
  | 'dashboard'
  | 'orders'
  | 'products'
  | 'customers'
  | 'marketing'
  | 'whatsapp'
  | 'store'
  | 'analytics'
  | 'logistics'
  | 'payments'
  | 'financing'
  | 'growth'
  | 'channels'
  | 'billing'
  | 'apps'
  | 'settings'
  | 'super_admin_portal';

export type ProductSubTab =
  | 'all_products'
  | 'categories'
  | 'preorder_campaigns'
  | 'inventory'
  | 'stock_changes'
  | 'filters'
  | 'custom_fields'
  | 'options_library';

export type CustomerSubTab =
  | 'all_customers'
  | 'customer_wallet'
  | 'groups'
  | 'customer_tickets'
  | 'reviews'
  | 'questions'
  | 'stock_notifications';

export type StoreSubTab =
  | 'themes'
  | 'landing_pages'
  | 'brand'
  | 'menu'
  | 'blog'
  | 'pages'
  | 'seo'
  | 'faqs';

export type SettingsSubTab =
  | 'settings_general'
  | 'settings_account'
  | 'settings_security'
  | 'settings_languages'
  | 'settings_checkout'
  | 'settings_gift'
  | 'settings_invoices'
  | 'settings_properties'
  | 'settings_constraints'
  | 'settings_tax'
  | 'settings_nbr'
  | 'settings_notifications'
  | 'settings_api'
  | 'settings_export'
  | 'comm_sms'
  | 'comm_whatsapp'
  | 'comm_email'
  | 'store_details'
  | 'store_domains'
  | 'store_policies';

export type ProductType = 'single' | 'grouped' | 'voucher' | 'digital' | 'bundle';

export interface WarehouseStock {
  id: string;
  name: string;
  location?: string;
  stock: number;
  unlimited?: boolean;
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  priceBDT: number;
  stock: number;
  image?: string;
}

export interface ProductCustomField {
  id: string;
  fieldName: string;
  fieldValue: string;
}

export interface Product {
  id: string;
  title: string;
  titleBn?: string;
  titleAr?: string;
  type?: ProductType;
  sku: string;
  barcode?: string;
  category: string;
  categoryId?: string;
  category_id?: string;
  priceBDT: number;
  costPriceBDT?: number;
  compareAtPriceBDT?: number;
  weightKg?: number;
  stock: number;
  warehouseStocks?: WarehouseStock[];
  status: 'Active' | 'Draft' | 'Out of Stock' | 'Published' | 'active' | 'published' | string;
  is_published?: boolean;
  storeSlug?: string;
  store_slug?: string;
  image: string;
  additionalImages?: string[];
  youtubeUrl?: string;
  videoUrl?: string;
  variantsCount: number;
  variants?: ProductVariant[];
  salesCount: number;
  createdAt?: string;
  updatedAt?: string;
  descriptionEn?: string;
  descriptionBn?: string;
  descriptionAr?: string;
  brand?: string;
  taxRatePercent?: number;
  maxOrderQuantity?: number;
  customizationEnabled?: boolean;
  customizationLabel?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoSlug?: string;
  templateStyle?: 'standard' | 'minimalist' | 'featured' | 'luxury';
  requiresShipping?: boolean;
  isTaxExempt?: boolean;
  hasDiscount?: boolean;
  merchantId?: string;
  customFields?: ProductCustomField[];
  colorImages?: Record<string, string>;
  deliveryRates?: { zoneName: string; fee: number }[];
  selectedFilter?: string;
}

export interface MerchantProfile {
  /** Canonical Supabase stores.id UUID — used for ALL database queries. */
  id?: string;
  /** Permanent system ID (e.g. ZID-BD-1001) — set once at registration. */
  storeCode?: string;
  /** Alias of storeCode (snake_case mirror of the DB column). */
  store_code?: string;
  /** Canonical store UUID mirror for order/customer payloads. */
  storeId?: string;
  storeName: string;
  /** Display-only custom slug — never used for database queries. */
  storeSlug: string;
  ownerName?: string;
  email?: string;
  phone?: string;
  supportEmail?: string;
  supportPhone?: string;
  currency?: 'BDT' | 'USD';
  language?: 'en' | 'bn' | 'ar';
  exchangeRateBDT?: number; // 1 USD = X BDT (e.g. 120)
  trialDaysTotal?: number;
  trialDaysRemaining?: number;
  trialEndsAt?: string; // ISO date string
  plan_started_at?: string; // ISO timestamp string
  expires_at?: string; // ISO timestamp string
  planStartedAt?: string;
  expiresAt?: string;
  selectedPlanDays?: number;
  duration_days?: number;
  durationDays?: number;
  subscriptionStartDate?: string;
  subscriptionEndDate?: string;
  subscriptionPlan?: SubscriptionPlanId;
  subscriptionExpiry?: string;
  isLocked?: boolean;
  onboardingProgress?: number; // percentage
  logoUrl?: string;
  storeTagline?: string;
  storeDescription?: string;
  whatsappNumber?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  totalSalesBDT?: number;
  activeThemeId?: string;
  themeConfig?: any;
  heroTitle?: string;
  heroSubtitle?: string;
  heroImage?: string;
  announcementText?: string;
  shippingConfig?: {
    type: 'flat' | 'free' | 'advance';
    fee: number;
  };
  /**
   * Checkout page options, edited in Settings -> Checkout.
   * Persisted on the store record as `checkoutConfig`.
   */
  checkoutConfig?: {
    /** Notice shown at the top of the customer checkout page. */
    announcement?: string;
    /** Orders below this value (BDT) are blocked. 0 / empty disables the rule. */
    minOrderAmount?: number | null;
    /** Allow checkout without creating an account. */
    guestCheckout?: boolean;
    /** Make the phone number field mandatory. */
    requirePhone?: boolean;
    /** Optional custom field labels rendered on the checkout form. */
    customField1?: string;
    customField2?: string;
  };
  /**
   * Gift options, edited in Settings -> Gift options.
   * Persisted on the store record as `giftOptions`.
   */
  giftOptions?: {
    /** Offer gift wrapping as a checkout add-on. */
    enableGiftPackaging?: boolean;
    /** Extra charge (BDT) for gift wrapping. `null` means free. */
    giftPackagingFee?: number | null;
    /** Let the customer attach a personalised gift card message. */
    allowGiftCardMessage?: boolean;
    /** Omit the price from the invoice packed with the parcel. */
    hideInvoicePriceTag?: boolean;
    // ── Legacy spellings ──
    // Accepted on read for records saved before the rename. The API always
    // responds with the canonical names above.
    /** @deprecated Use `allowGiftCardMessage`. */
    allowGiftMessage?: boolean;
    /** @deprecated Use `hideInvoicePriceTag`. */
    hideInvoicePrice?: boolean;
  };
  /**
   * @deprecated Legacy storage key for {@link giftOptions}. Still read by the
   * API so merchants who saved settings before the rename keep them.
   */
  giftConfig?: MerchantProfile['giftOptions'];
  /**
   * Tax settings, edited in Settings -> Tax.
   * Persisted on the store record as `taxConfig`.
   */
  taxConfig?: {
    /** Business VAT / TIN registration number shown on invoices. */
    vatNumber?: string;
    /** Default VAT percentage applied to orders (0-100). */
    defaultTaxRate?: number;
    /** Product prices already include VAT (true) or VAT is added on top. */
    includeTaxInPrices?: boolean;
    /** Also charge VAT on delivery/shipping fees. */
    applyTaxToDelivery?: boolean;
    /** Show the Net + VAT = Total breakdown on checkout and receipts. */
    showTaxBreakdown?: boolean;
  };
  /**
   * Inventory & order properties, edited in Settings -> Orders and products
   * properties. Persisted on the store record as `inventoryConfig`.
   */
  inventoryConfig?: {
    /** Hide products with zero stock from the storefront catalog. */
    hideOutOfStock?: boolean;
    /** Allow ordering out-of-stock products as a pre-order. */
    allowPreOrder?: boolean;
    /** Stock level at or below which the merchant is warned. */
    lowStockThreshold?: number | null;
    /** Minimum quantity per product at checkout. `null` means no minimum. */
    minOrderQty?: number | null;
    /** Maximum quantity allowed per order. `null` means no maximum. */
    maxOrderQty?: number | null;
    /** Hours before an unpaid order is auto-cancelled. `null` disables. */
    unpaidAutoCancelHours?: number | null;
    /** Prefix prepended to auto-generated product SKUs. */
    skuPrefix?: string;
    /** Show AI 'frequently bought together' recommendations. */
    enableAiRecommendations?: boolean;
  };
  /**
   * Invoice branding & numbering, edited in Settings -> Invoices.
   * Persisted on the store record as `invoiceConfig`.
   */
  invoiceConfig?: {
    /** Print the store logo at the top of the invoice. */
    showLogo?: boolean;
    /** Header text / title printed on the invoice. */
    title?: string;
    /** Prefix prepended to generated invoice numbers. */
    prefix?: string;
    /** Business VAT / Tax registration number shown on the invoice. */
    vatRegistrationNumber?: string;
    /** Footer note, typically the return policy and support contact. */
    footerNote?: string;
    /** Paper format used when printing. */
    printFormat?: 'Standard A4 / PDF' | '3-Inch Thermal Receipt Printer (POS)';
  };
  /**
   * NBR VAT & E-Invoicing integration, edited in Settings -> NBR.
   * Persisted on the store record as `nbrConfig`. `apiSecret` is write-only:
   * the API returns a redacted placeholder rather than the stored value.
   */
  nbrConfig?: {
    /** 9 or 13 digit Business Identification Number. */
    binNumber?: string;
    /** Automatically generate Mushak 6.3 e-invoices for each order. */
    autoGenerateMushak?: boolean;
    /** NBR API secret — never returned by the API once saved. */
    apiSecret?: string;
    /** Print the BIN on the customer receipt. */
    showBinOnReceipt?: boolean;
  };
  paymentMethods?: {
    cod: boolean;
    bkash: boolean;
    cards: boolean;
  };
  tracking?: {
    fbPixelId?: string;
    tiktokPixelId?: string;
    ga4Id?: string;
  };
  unlockedThemeIds?: string[];
}

export interface TicketMessage {
  id: string;
  sender: 'merchant' | 'admin';
  message: string;
  timestamp: string;
}

export interface SupportTicket {
  id: string;
  storeName: string;
  merchantEmail: string;
  subject: string;
  category: 'Billing' | 'Technical' | 'General' | 'Account';
  priority: 'Low' | 'Medium' | 'High';
  status: 'Open' | 'In Progress' | 'Resolved';
  createdAt: string;
  messages: TicketMessage[];
}

export interface AdminTeamMember {
  id: string;
  fullName: string;
  email: string;
  role: 'Super Admin' | 'Support Lead' | 'Finance Admin' | 'Marketing Admin';
  lastActive: string;
  status: 'Active' | 'Inactive';
}

export interface AdminRolePermission {
  role: string;
  allowedTabs: string[]; // List of tab IDs like 'analytics', 'gateways', etc.
}

export interface PlatformAddon {
  id: string;
  name: string;
  category: 'Marketing' | 'Logistics' | 'Communication' | 'Domain' | 'General';
  pricingType: 'Free' | 'One-time Fee' | 'Monthly Recurring';
  price: number;
  description: string;
  icon: string;
  isPublished: boolean;
}

export interface BroadcastMessage {
  id: string;
  timestamp: string;
  audience: 'All Merchants' | 'Free Trial Users' | 'Paid Subscriptions';
  subject: string;
  type: 'In-App Announcement' | 'Email Alert' | 'Both';
  body: string;
  message?: string;
  status: 'Delivered' | 'Pending' | 'Failed';
}

export interface PlatformAutomationSettings {
  subscriptionExpiryWarning: boolean;
  welcomeEmail: boolean;
  paymentApprovalAlert: boolean;
  merchantSuspensionAlert: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  adminUser: string;
  action: string;
  targetEntity: string;
  ipAddress: string;
  severity: 'Info' | 'Warning' | 'Critical';
}

export interface PlatformSecuritySettings {
  force2FAForMerchants: boolean;
  adminSessionTimeout: number; // minutes
  ipWhitelistingEnabled: boolean;
  maxLoginAttempts: number;
}

export interface PlatformTheme {
  id: string;
  name: string;
  category: string;
  price: number;
  isFree: boolean;
  previewUrl: string;
  thumbnailUrl: string;
  status: 'Active' | 'Hidden';
}

export interface ThemeConfig {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  bannerTypography: string;
  headerLayout: 'minimal' | 'modern' | 'centered';
  productCardStyle: 'card' | 'flat' | 'elevated';
  template: 'minimal' | 'modern' | 'fashion' | 'corporate';
  logoImageUrl?: string;
}

export type SubscriptionPlanId = 'free_trial' | 'starter_3m' | 'pro_6m' | 'enterprise_12m' | (string & {});

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  badge: string;
  features: string[];
  isPopular?: boolean;
  isActive?: boolean;
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  routingNumber: string;
  swiftCode: string;
  branchName: string;
  isVisibleAtCheckout: boolean;
  isPrimary: boolean;
}

export interface MobileBankingConfig {
  id: string;
  provider: 'bkash' | 'nagad' | 'rocket';
  displayName: string;
  accountType: 'Personal' | 'Agent' | 'Merchant';
  number: string;
  merchantApiKey?: string;
  qrCodeUrl?: string;
  isEnabled: boolean;
  chargePercentage: number;
  instructions: string;
  requireTrxId: boolean;
  canPayAdvanceCharge: boolean;
}

export interface CodConfig {
  isEnabled: boolean;
  insideDhakaFee: number | string;
  outsideDhakaFee: number | string;
  subDhakaFee: number | string;
  freeShippingThreshold: number | string;
  maxOrderLimit: number | string;
  requestAdvanceDeliveryCharge?: boolean;
  advanceDeliveryChargeAmount?: number | string;
  notes: string;
}

export interface CourierService {
  id: 'steadfast' | 'pathao' | 'redx' | 'ecourier' | 'paperfly';
  name: string;
  logo: string;
  description: string;
  isConnected: boolean;
  coverage: string;
  avgDeliveryDays: string;
  apiCredentials: {
    apiKey?: string;
    secretKey?: string;
    storeId?: string;
    clientId?: string;
    clientSecret?: string;
    warehouseId?: string;
  };
  pickupAddress: string;
  autoSyncOrders: boolean;
}

export interface OrderItem {
  id: string;
  productName: string;
  variant: string;
  quantity: number;
  unitPriceBDT: number;
  image: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  source?: 'Store' | 'Manual' | 'POS' | 'WhatsApp';
  customerName: string;
  customerPhone: string;
  customerCity: string;
  deliveryZone: 'Inside Dhaka' | 'Outside Dhaka' | 'Sub Dhaka';
  address: string;
  platform?: 'Mobile web' | 'iOS App' | 'Android App' | 'Desktop Web' | 'POS';
  subtotalBDT?: number;
  deliveryCharge?: number;
  /** VAT percentage applied to this order. */
  taxRate?: number;
  /** VAT amount charged (inclusive or added on top, per store settings). */
  taxBDT?: number;
  /** Net amount before VAT, recorded for the printed breakdown. */
  netBeforeTaxBDT?: number;
  /** Whether the price already contained VAT. */
  taxInclusive?: boolean;
  /** Business VAT number captured at time of order. */
  vatNumber?: string;
  totalBDT: number;
  paymentMethod: 'bKash' | 'Nagad' | 'Rocket' | 'Bank Transfer' | 'COD';
  paymentStatus: 'Paid' | 'Partially paid' | 'Unpaid' | 'Voided' | 'Pending Verification';
  transactionId?: string;
  fulfillmentStatus: 'Unfulfilled' | 'Assigned Courier' | 'In Transit' | 'Delivered' | 'Cancelled';
  status?: 'New' | 'Preparing' | 'Ready' | 'In delivery' | 'Completed' | 'Cancelled' | 'Processing reverse' | 'Partially Reversed' | 'Reversed';
  courierName?: string;
  trackingCode?: string;
  tags?: string[];
  createdAt: string;
  orderToken?: string;
  merchantId?: string;
  storeSlug?: string;
  storeId?: string;
  items: OrderItem[];
}

export interface Customer {
  id: string;
  name: string;
  customerType: 'Individual' | 'Company';
  phone: string;
  email?: string;
  gender?: 'Male' | 'Female' | 'Other' | '';
  country: string;
  city: string;
  channel: 'Store' | 'Mobile App' | 'POS' | 'WhatsApp';
  totalOrders: number;
  loyaltyPoints: number;
  totalSpentBDT: number;
  walletBalanceBDT: number;
  status: 'Active' | 'Banned';
  dob?: string;
  group?: 'VIP' | 'Regular' | 'New' | 'Wholesale';
  joinedDate?: string;
}

export interface DiscountCoupon {
  id: string;
  code: string;
  discountType: 'Percentage' | 'Fixed BDT' | 'Free Shipping' | 'Free Cash on Delivery';
  value: number;
  minOrderBDT: number;
  usageCount: number;
  status: 'Active' | 'Expired';
  expiresAt: string;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  date: string;
  planName: string;
  amountUSD: number;
  amountBDT: number;
  paymentMethod: string;
  status: 'Paid' | 'Pending Approval' | 'Unpaid';
  pdfUrl?: string;
}

export interface SubscriptionRequest {
  id: string;
  storeName: string;
  email: string;
  planId: string;
  planName: string;
  amountBDT: number;
  paymentMethod: string;
  transactionId: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface AdminCustomGateway {
  id: string;
  name: string;
  details: string;
  logoUrl?: string;
  qrCodeUrl?: string;
  isActive: boolean;
}

export interface AdminPaymentGatewayConfig {
  bkashNumber: string;
  bkashType: string;
  bkashActive: boolean;
  nagadNumber: string;
  nagadType: string;
  nagadActive: boolean;
  rocketNumber: string;
  rocketType: string;
  rocketActive: boolean;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branchName: string;
  routingNumber: string;
  bankActive: boolean;
  qrTitle: string;
  qrAccountName: string;
  qrImageUrl: string;
  qrActive: boolean;
  customGateways: AdminCustomGateway[];
  instructions: string;
  enableManualVerification?: boolean;
}

export interface PaymentGatewayConfig {
  gateway: 'SSLCommerz' | 'Shurjopay';
  storeId: string;
  storePassword?: string;
  isEnabled: boolean;
}

export interface PlatformSettings {
  siteTitle: string;
  logoUrl: string;
  faviconUrl: string;
  supportPhone: string;
  supportEmail: string;
  supportAddress: string;
  currencySymbol: string;
  taxRate: number;
  facebookUrl: string;
  whatsappNumber: string;
  termsUrl: string;
  privacyUrl: string;
  globalTrialDays: number;
  aiContentProOnly: boolean;
  aiWhatsAppMarketingProOnly: boolean;
  aiBgRemoverProOnly: boolean;
}

export interface PlatformAnnouncement {
  id: string;
  message: string;
  isActive: boolean;
  type: 'Info' | 'Critical Alert' | 'Success Announcement' | 'System Maintenance';
  targetAudience: 'All Merchants' | 'Free Trial Users Only' | 'Subscribed Merchants Only';
  ctaText?: string;
  ctaUrl?: string;
  createdAt: string;
}

export interface SubscriptionPlanConfig extends SubscriptionPlan {}

export interface ThemePurchaseRequest {
  id: string;
  storeName: string;
  email: string;
  themeId: string;
  themeName: string;
  amountBDT: number;
  paymentMethod: 'bKash' | 'Nagad' | 'Bank Transfer' | string;
  transactionId: string;
  requestedAt: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  storeId?: string; // Merchant Store ID
}

export interface PreorderCampaign {
  id: string;
  name: string;
  productId: string;
  productTitle: string;
  discountPercentage: number;
  advanceDepositPercentage: number;
  targetEndDate: string;
  status: 'Active' | 'Draft' | 'Ended';
}

export interface GlobalCustomField {
  id: string;
  name: string;
  nameBn: string;
  type: 'Text' | 'Dropdown' | 'Checkbox';
  appliesTo: string;
  required: boolean;
}

export interface VariantOptionPreset {
  id: string;
  title: string;
  values: string[];
  type: 'Pill Buttons' | 'Color Swatches' | 'Dropdown List';
}

