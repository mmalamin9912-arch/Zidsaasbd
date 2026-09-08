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

