/**
 * Bangla copy for the customer-facing marketplace.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * `i18n.tsx` already translates the merchant dashboard and the tenant
 * storefront. The PLATFORM marketplace (MegaMarketplaceView) never used it: it
 * keeps its own `language` preference and, until now, nothing in that view
 * changed when the shopper picked "বাংলা". Switching the pill only relabelled
 * the button.
 *
 * The catalogue below closes that gap for everything the marketplace itself
 * writes: chrome, filters, sort labels, product-card states, basket and the
 * empty/error states.
 *
 * ── What it deliberately does NOT translate ────────────────────────────────
 * Vendor-authored data — product titles, a merchant's own category labels — is
 * translated only when the seller supplied it (`titleBn`). Inventing a Bangla
 * name for a seller's product would be a mistranslation presented as fact, and
 * a machine translation of "iPhone 15 Pro Max" is worse than the original. The
 * lookup order is: seller's Bangla → seller's English → a curated glossary for
 * the small set of generic category names the platform itself seeds.
 */

export type MarketplaceLang = 'en' | 'bn';

type Copy = Record<string, { en: string; bn: string }>;

/**
 * The marketplace's own vocabulary.
 *
 * `{name}` placeholders are substituted by `formatCopy`; nothing here depends
 * on React so it can be unit-tested and reused by the storefront helpers.
 */
export const MARKETPLACE_COPY: Copy = {
  // ── Header / chrome ──
  deliver_to: { en: 'Deliver to', bn: 'ডেলিভারি হবে' },
  locating: { en: 'Locating…', bn: 'অবস্থান খোঁজা হচ্ছে…' },
  deliver_to_all: { en: 'Deliver to all 64 districts', bn: 'সারাদেশের ৬৪ জেলায় ডেলিভারি' },
  deliver_to_label: { en: 'Deliver to', bn: 'ডেলিভারি হবে' },
  search_btn: { en: 'Search', bn: 'খুঁজুন' },
  search_go: { en: 'Go', bn: 'যান' },
  search_all: { en: 'All', bn: 'সব' },
  search_aria: { en: 'Search the marketplace', bn: 'মার্কেটপ্লেসে খুঁজুন' },
  search_suggestions: { en: 'Search suggestions', bn: 'সার্চ সাজেশন' },
  search_for: { en: 'Search for “{q}”', bn: '“{q}” খুঁজুন' },
  trending_searches: { en: 'Trending searches', bn: 'জনপ্রিয় সার্চ' },
  recent_searches: { en: 'Recent searches', bn: 'সাম্প্রতিক সার্চ' },
  clear_history: { en: 'Clear', bn: 'মুছুন' },
  search_in: { en: 'Search in {name}…', bn: '{name}-এ খুঁজুন…' },
  view_product: { en: 'View {name}', bn: '{name} দেখুন' },
  save_to_wishlist: { en: 'Save {name} to wishlist', bn: '{name} উইশলিস্টে রাখুন' },
  remove_from_wishlist: { en: 'Remove {name} from wishlist', bn: '{name} উইশলিস্ট থেকে সরান' },

  // ── Language / account ──
  language: { en: 'Change language', bn: 'ভাষা পরিবর্তন' },
  hi_sign_in: { en: 'Hi, sign in', bn: 'হ্যালো, সাইন ইন করুন' },
  account: { en: 'Account', bn: 'অ্যাকাউন্ট' },
  orders: { en: 'Orders', bn: 'অর্ডার' },
  account_menu: { en: 'Account menu', bn: 'অ্যাকাউন্ট মেনু' },
  account_overview: { en: 'Account overview', bn: 'অ্যাকাউন্ট ওভারভিউ' },
  welcome_zid: { en: 'Welcome to ZID', bn: 'ZID-তে স্বাগতম' },
  sign_in_desc: { en: 'Sign in to see orders, returns and addresses.', bn: 'অর্ডার, রিটার্ন ও ঠিকানা দেখতে সাইন ইন করুন।' },
  sign_in_menu: { en: 'Sign In', bn: 'সাইন ইন করুন' },
  my_orders: { en: 'My Orders', bn: 'আমার অর্ডার' },
  returns: { en: 'Returns', bn: 'রিটার্ন' },
  addresses: { en: 'Addresses', bn: 'ঠিকানা' },
  profile_menu: { en: 'Profile', bn: 'প্রোফাইল' },
  sign_out: { en: 'Sign Out', bn: 'সাইন আউট' },
  wishlist: { en: 'Wishlist', bn: 'উইশলিস্ট' },
  cart: { en: 'Cart', bn: 'কার্ট' },
  my_account: { en: 'My Account', bn: 'আমার অ্যাকাউন্ট' },
  track_orders: { en: 'Track orders', bn: 'অর্ডার ট্র্যাক করুন' },
  customer_sign_in: { en: 'Customer sign in', bn: 'কাস্টমার সাইন ইন' },
  merchant_login: { en: 'Merchant login', bn: 'মার্চেন্ট লগইন' },
  sell_on_zid: { en: 'Sell on ZID', bn: 'ZID-তে বিক্রি করুন' },

  // ── Category rail / mega menu ──
  all_categories: { en: 'All categories', bn: 'সব ক্যাটাগরি' },
  categories: { en: 'Categories', bn: 'ক্যাটাগরি' },
  vendors: { en: 'Vendors', bn: 'সেলার' },
  marketplace_title: { en: 'Marketplace', bn: 'মার্কেটপ্লেস' },
  product_count: { en: '{n} products', bn: '{n}টি পণ্য' },
  seller_count: { en: '{n} sellers', bn: '{n}টি সেলার' },
  shop_by_category: { en: 'Shop by category', bn: 'ক্যাটাগরি অনুযায়ী কিনুন' },
  view_all: { en: 'View all', bn: 'সব দেখুন' },
  browse_categories: { en: 'Browse categories', bn: 'ক্যাটাগরি দেখুন' },
  subcategories: { en: 'Sub-categories', bn: 'উপ-ক্যাটাগরি' },
  deals_tab: { en: 'Deals', bn: 'ডিল' },
  new_in_tab: { en: 'New in', bn: 'নতুন এসেছে' },
  free_delivery_tab: { en: 'Get Free Delivery', bn: 'ফ্রি ডেলিভারি নিন' },
  marketplace: { en: 'Marketplace', bn: 'মার্কেটপ্লেস' },
  sellers: { en: '{n} sellers', bn: '{n}টি সেলার' },
  sort_label: { en: 'Sort', bn: 'সাজান' },
  free_delivery_strip: { en: 'Free delivery over ৳2,000', bn: '৳২,০০০-এর বেশি অর্ডারে ফ্রি ডেলিভারি' },
  easy_returns_strip: { en: '7-day easy returns', bn: '৭ দিনের সহজ রিটার্ন' },
  helpline: { en: '09600-000000', bn: '০৯৬০০-০০০০০০' },

  // ── Promo rails ──
  deals: { en: 'Deals', bn: 'ডিল' },
  new_in: { en: 'New in', bn: 'নতুন এসেছে' },
  featured_picks: { en: 'Featured picks', bn: 'নির্বাচিত পণ্য' },
  best_deals: { en: 'Today’s best deals', bn: 'আজকের সেরা ডিল' },
  mega_sale: { en: 'MEGA MARKETPLACE SALE', bn: 'মেগা মার্কেটপ্লেস সেল' },
  upcoming: { en: 'Upcoming', bn: 'শীঘ্রই আসছে' },
  free_delivery: { en: 'Get Free Delivery', bn: 'ফ্রি ডেলিভারি নিন' },

  // ── Sort / filters ──
  filters: { en: 'Filters', bn: 'ফিল্টার' },
  sort_by: { en: 'Sort by', bn: 'সাজান' },
  sort_newest: { en: 'Newest arrivals', bn: 'নতুন পণ্য' },
  sort_price_low: { en: 'Price: low to high', bn: 'দাম: কম থেকে বেশি' },
  sort_price_high: { en: 'Price: high to low', bn: 'দাম: বেশি থেকে কম' },
  sort_rating: { en: 'Top rated', bn: 'সেরা রেটিং' },
  sort_popular: { en: 'Most popular', bn: 'সবচেয়ে জনপ্রিয়' },
  price: { en: 'Price', bn: 'দাম' },
  any_price: { en: 'Any price', bn: 'যেকোনো দাম' },
  apply: { en: 'Apply', bn: 'প্রয়োগ করুন' },
  clear_all: { en: 'Clear all', bn: 'সব মুছুন' },
  close: { en: 'Close', bn: 'বন্ধ করুন' },

  // ── Product card states ──
  sold_out: { en: 'Sold out', bn: 'স্টক শেষ' },
  only_left: { en: 'Only {n} left', bn: 'মাত্র {n}টি বাকি' },
  new_badge: { en: 'New', bn: 'নতুন' },
  add_to_cart: { en: 'Add to cart', bn: 'কার্টে যোগ করুন' },
  added_to_basket: { en: 'Added to basket', bn: 'কার্টে যোগ হয়েছে' },
  saved_to_wishlist: { en: 'Saved to wishlist', bn: 'উইশলিস্টে রাখা হয়েছে' },
  removed_from_wishlist: { en: 'Removed from wishlist', bn: 'উইশলিস্ট থেকে সরানো হয়েছে' },
  reviews: { en: '{n} reviews', bn: '{n}টি রিভিউ' },
  review_one: { en: '1 review', bn: '১টি রিভিউ' },
  by_vendor: { en: 'by {name}', bn: '{name} থেকে' },

  // ── Basket / wishlist sheets ──
  basket: { en: 'Basket', bn: 'কার্ট' },
  cart_empty: { en: 'Your cart is empty', bn: 'আপনার কার্ট খালি' },
  cart_empty_desc: { en: 'Browse the marketplace and add products to your basket.', bn: 'মার্কেটপ্লেস ঘুরে দেখুন এবং পণ্য কার্টে যোগ করুন।' },
  wishlist_empty: { en: 'Your wishlist is empty', bn: 'আপনার উইশলিস্ট খালি' },
  wishlist_empty_desc: { en: 'Tap the heart on a product to save it for later.', bn: 'পরে কেনার জন্য পণ্যের হার্ট আইকনে ট্যাপ করুন।' },
  subtotal: { en: 'Subtotal', bn: 'সাবটোটাল' },
  delivery: { en: 'Delivery', bn: 'ডেলিভারি' },
  total: { en: 'Total', bn: 'মোট' },
  checkout: { en: 'Checkout', bn: 'চেকআউট' },
  continue_shopping: { en: 'Continue shopping', bn: 'কেনাকাটা চালিয়ে যান' },
  remove: { en: 'Remove', bn: 'সরান' },
  move_to_cart: { en: 'Move to cart', bn: 'কার্টে নিন' },
  qty: { en: 'Qty', bn: 'পরিমাণ' },

  // ── Results / empty states ──
  products_found: { en: '{n} products found', bn: '{n}টি পণ্য পাওয়া গেছে' },
  no_products: { en: 'No products found', bn: 'কোনো পণ্য পাওয়া যায়নি' },
  no_products_desc: { en: 'Try a different keyword or clear your filters.', bn: 'অন্য কিছু লিখে দেখুন অথবা ফিল্টার মুছে দিন।' },
  load_more: { en: 'Load more', bn: 'আরও দেখুন' },
  loading: { en: 'Loading…', bn: 'লোড হচ্ছে…' },
  results_for: { en: 'Results for “{q}”', bn: '“{q}”-এর ফলাফল' },
  every_store: { en: 'Every store, one basket', bn: 'সব স্টোর, একটি কার্ট' },
};

/**
 * Curated Bangla names for category words the platform seeds itself.
 *
 * This is a GLOSSARY, not a translator: it is applied word-by-word to a label,
 * so "Mobile Phones" → "মোবাইল ফোন" and "Men's Clothing" → "পুরুষদের পোশাক"
 * both work without a phrase table. A word that is not listed is left in
 * English rather than guessed.
 */
/**
 * Bangla for the utility-strip lines the platform seeds by default.
 *
 * The strip's text is authored in Admin → Marketplace Studio, so it is DATA and
 * normally rendered verbatim in whatever language the admin wrote it in. These
 * are the stock defaults only: a line the admin changed is left exactly as it
 * is, because silently rewriting custom promotional copy would be wrong.
 */
const STRIP_DEFAULTS_BN: Record<string, string> = {
  'deliver to all 64 districts': 'সারাদেশের ৬৪ জেলায় ডেলিভারি',
  'free delivery over ৳2,000': '৳২,০০০-এর বেশি অর্ডারে ফ্রি ডেলিভারি',
  '7-day easy returns': '৭ দিনের সহজ রিটার্ন',
  '09600-000000': '০৯৬০০-০০০০০০',
  'cash on delivery nationwide': 'সারাদেশে ক্যাশ অন ডেলিভারি',
};

/** Translate a utility-strip line when it matches a stock default. */
export function stripText(text: string, lang: MarketplaceLang): string {
  if (lang === 'en') return text;
  return STRIP_DEFAULTS_BN[String(text || '').trim().toLowerCase()] ?? text;
}

const CATEGORY_GLOSSARY: Record<string, string> = {
  // top-level
  'fashion': 'ফ্যাশন',
  'electronics': 'ইলেকট্রনিক্স',
  'mobile': 'মোবাইল',
  'phones': 'ফোন',
  'phone': 'ফোন',
  'computers': 'কম্পিউটার',
  'laptop': 'ল্যাপটপ',
  'laptops': 'ল্যাপটপ',
  'home': 'হোম',
  'kitchen': 'রান্নাঘর',
  'beauty': 'বিউটি',
  'health': 'স্বাস্থ্য',
  'grocery': 'মুদি পণ্য',
  'baby': 'শিশু',
  'toys': 'খেলনা',
  'sports': 'খেলাধুলা',
  'books': 'বই',
  'automotive': 'অটোমোবাইল',
  'appliances': 'গৃহস্থালি যন্ত্রপাতি',
  'gaming': 'গেমিং',
  'jewelry': 'গহনা',
  // The seed taxonomy uses the UK spelling; both must resolve.
  'jewellery': 'গহনা',
  'jewel': 'গহনা',
  'watches': 'ঘড়ি',
  'shoes': 'জুতা',
  'bags': 'ব্যাগ',
  'furniture': 'আসবাবপত্র',
  'gadgets': 'গ্যাজেট',
  'accessories': 'অ্যাক্সেসরিজ',
  'groceries': 'মুদি',
  'food': 'খাবার',
  'pet': 'পোষা প্রাণী',
  'stationery': 'স্টেশনারি',
  'uncategorized': 'অশ্রেণীবদ্ধ',
  // common sub-categories
  'smartphones': 'স্মার্টফোন',
  'headphones': 'হেডফোন',
  'earbuds': 'ইয়ারবাড',
  'cameras': 'ক্যামেরা',
  'televisions': 'টেলিভিশন',
  'tv': 'টিভি',
  'speakers': 'স্পিকার',
  'chargers': 'চার্জার',
  'cables': 'কেবল',
  'cases': 'কভার',
  'tablets': 'ট্যাবলেট',
  'men': 'পুরুষ',
  'women': 'মহিলা',
  'kids': 'শিশু',
  'children': 'শিশু',
  'mens': 'পুরুষদের',
  'womens': 'মহিলাদের',
  'clothing': 'পোশাক',
  'shirts': 'শার্ট',
  't-shirts': 'টি-শার্ট',
  'panjabi': 'পাঞ্জাবি',
  'saree': 'শাড়ি',
  'sarees': 'শাড়ি',
  'kurta': 'কুর্তা',
  'salwar': 'সালোয়ার',
  'kameez': 'কামিজ',
  'saris': 'শাড়ি',
  'sneakers': 'স্নিকার্স',
  'sandals': 'স্যান্ডেল',
  'skincare': 'স্কিনকেয়ার',
  'makeup': 'মেকআপ',
  'fragrance': 'সুগন্ধি',
  'supplements': 'সাপ্লিমেন্ট',
  'rice': 'চাল',
  'spices': 'মসলা',
  'tea': 'চা',
  'snacks': 'স্ন্যাকস',
  'diapers': 'ডায়াপার',
  'stationary': 'স্টেশনারি',
  'novels': 'উপন্যাস',
  'academic': 'একাডেমিক',
};

/** Words that should not be translated on their own inside a label. */
const KEEP_AS_IS = new Set(['and', '&', 'of', 'for', 'the', 'a', 'with', 'in', 'on', 'to']);

/**
 * Translate a category label into Bangla, word by word.
 *
 * Returns the input unchanged when the label is already Bangla (so a seller's
 * own `nameBn` is never double-processed) or when no glossary word matched:
 * a half-translated label ("মোবাইল Accessories") reads worse than the original.
 */
export function translateCategoryLabel(label: string, lang: MarketplaceLang): string {
  const raw = String(label || '').trim();
  if (!raw || lang === 'en') return raw;
  // Already Bangla (starts with a Bengali code point U+0980–U+09FF).
  if (/^[\u0980-\u09FF]/.test(raw)) return raw;

  const words = raw.split(/\s+/);
  let matched = 0;
  const translated = words.map((word) => {
    const key = word.toLowerCase().replace(/[’']s$/, '').replace(/[^a-z0-9&-]/g, '');
    if (!key) return word;
    if (KEEP_AS_IS.has(key)) return word;
    const hit = CATEGORY_GLOSSARY[key];
    if (hit) {
      matched += 1;
      return hit;
    }
    return word;
  });

  // Nothing recognisable: keep the seller's English rather than a fragment.
  if (!matched) return raw;
  return translated.join(' ');
}

/** Look up one marketplace string with `{placeholder}` substitution. */
export function marketplaceCopy(
  key: keyof typeof MARKETPLACE_COPY | string,
  lang: MarketplaceLang,
  vars?: Record<string, string | number>,
): string {
  const entry = MARKETPLACE_COPY[key];
  if (!entry) return key;
  let text = lang === 'bn' ? entry.bn : entry.en;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
    }
  }
  return text;
}

/**
 * The name to render for a product.
 *
 * Priority: the seller's Bangla title (when the shopper reads Bangla), then the
 * seller's English title. The English title is ALWAYS the fallback — a product
 * with no Bangla name must still show a name, never an empty card.
 */
export function productTitle(
  product: { title?: string; titleBn?: string; title_bn?: string } | null | undefined,
  lang: MarketplaceLang,
): string {
  const en = String(product?.title || '').trim();
  const bn = String(product?.titleBn || product?.title_bn || '').trim();
  if (lang === 'bn' && bn) return bn;
  return en || bn || '';
}

/** Category name for display, preferring a seller-supplied Bangla name. */
export function categoryName(
  category: { name?: string; nameBn?: string; name_bn?: string } | string | null | undefined,
  lang: MarketplaceLang,
): string {
  const obj = typeof category === 'string' ? { name: category } : (category || {});
  const en = String(obj.name || '').trim();
  const bn = String((obj as any).nameBn || (obj as any).name_bn || '').trim();
  if (lang === 'bn') {
    if (bn) return bn;
    return translateCategoryLabel(en, 'bn');
  }
  return en;
}
