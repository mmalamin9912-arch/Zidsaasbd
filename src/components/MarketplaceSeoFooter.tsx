import React, { useMemo } from 'react';
import {
  Truck, ShieldCheck, RotateCcw, Wallet, Store, ArrowRight,
  Smartphone, Laptop, HeadphonesIcon, Shirt,
  Home as HomeIcon, Sparkles, Users, Package,
  Facebook, Instagram, Youtube, Twitter, Linkedin, Send,
  Baby, Crown, CreditCard, Banknote, ChevronRight, Apple, Play,
} from 'lucide-react';

/**
 * Noon-style SEO footer for the marketplace homepage.
 *
 * ── What it is ────────────────────────────────────────────────────────────
 * Three zones, in the order Noon uses them:
 *
 *   1. TRUST STRIP   — the four promises a first-time shopper needs before
 *                      they will enter card details (delivery, sellers,
 *                      returns, payment).
 *   2. POPULAR SEARCHES — grouped keyword tags that actually run a search.
 *                      These are the internal links that give a crawler (and a
 *                      shopper) a path into the catalogue from the homepage.
 *   3. PLATFORM OVERVIEW + link columns + legal line.
 *
 * ── SEO notes, honestly stated ────────────────────────────────────────────
 * These tags are real `<button>`s that drive the live search filter rather
 * than `<a href>`s, because the marketplace is a single-page app whose search
 * lives in component state — a crawler following `/marketplace?q=laptop` would
 * get the same shell it already has. They are still valuable: they are real,
 * keyboard-reachable internal navigation for the user, and the descriptive
 * copy below is genuine page content. This is NOT a doorway-page or
 * keyword-stuffing block — the keyword set is a curated list of what the
 * marketplace actually sells, and every tag resolves to a real result set.
 *
 * ── Language ──────────────────────────────────────────────────────────────
 * Fully bilingual. `lang` comes from the marketplace's own switcher, so the
 * footer never disagrees with the page above it.
 */

type Lang = 'en' | 'bn';

const THEME = {
  ink: '#111827',
  inkMuted: '#6b7280',
  line: '#e5e7eb',
  brand: '#3b2fd6',
  surface: '#ffffff',
  bg: '#f6f7fb',
} as const;

/** A keyword tag. `q` is the query actually run — keep it the search term. */
interface SearchTag {
  label: string;
  labelBn: string;
  q: string;
}

/**
 * Keyword groups.
 *
 * Chosen to mirror what the platform's sellers actually list (electronics,
 * fashion, home, beauty) — a "Popular searches" block that offers categories
 * with no inventory is worse than none, because it lands every visitor on an
 * empty result set.
 */
const SEARCH_GROUPS: { title: string; titleBn: string; Icon: React.ComponentType<{ className?: string }>; tags: SearchTag[] }[] = [
  {
    title: 'Mobiles & Gadgets',
    titleBn: 'মোবাইল ও গ্যাজেট',
    Icon: Smartphone,
    tags: [
      { label: 'mobile phone', labelBn: 'মোবাইল ফোন', q: 'mobile phone' },
      { label: 'smartphone', labelBn: 'স্মার্টফোন', q: 'smartphone' },
      { label: 'power bank', labelBn: 'পাওয়ার ব্যাংক', q: 'power bank' },
      { label: 'charger', labelBn: 'চার্জার', q: 'charger' },
      { label: 'phone case', labelBn: 'ফোন কেস', q: 'phone case' },
      { label: 'smart watch', labelBn: 'স্মার্ট ওয়াচ', q: 'smart watch' },
    ],
  },
  {
    title: 'Computers & Audio',
    titleBn: 'কম্পিউটার ও অডিও',
    Icon: Laptop,
    tags: [
      { label: 'laptop', labelBn: 'ল্যাপটপ', q: 'laptop' },
      { label: 'headphones', labelBn: 'হেডফোন', q: 'headphones' },
      { label: 'earbuds', labelBn: 'ইয়ারবাড', q: 'earbuds' },
      { label: 'bluetooth speaker', labelBn: 'ব্লুটুথ স্পিকার', q: 'bluetooth speaker' },
      { label: 'keyboard', labelBn: 'কীবোর্ড', q: 'keyboard' },
      { label: 'monitor', labelBn: 'মনিটর', q: 'monitor' },
    ],
  },
  {
    title: 'Fashion & Lifestyle',
    titleBn: 'ফ্যাশন ও লাইফস্টাইল',
    Icon: Shirt,
    tags: [
      { label: 'saree', labelBn: 'শাড়ি', q: 'saree' },
      { label: 'panjabi', labelBn: 'পাঞ্জাবি', q: 'panjabi' },
      { label: 'kurti', labelBn: 'কুর্তি', q: 'kurti' },
      { label: 't-shirt', labelBn: 'টি-শার্ট', q: 't-shirt' },
      { label: 'sneakers', labelBn: 'স্নিকার্স', q: 'sneakers' },
      { label: 'handbag', labelBn: 'হ্যান্ডব্যাগ', q: 'handbag' },
    ],
  },
  {
    title: 'Home, Beauty & More',
    titleBn: 'হোম, বিউটি ও আরও',
    Icon: HomeIcon,
    tags: [
      { label: 'kitchen', labelBn: 'রান্নাঘর', q: 'kitchen' },
      { label: 'furniture', labelBn: 'আসবাবপত্র', q: 'furniture' },
      { label: 'skincare', labelBn: 'স্কিনকেয়ার', q: 'skincare' },
      { label: 'makeup', labelBn: 'মেকআপ', q: 'makeup' },
      { label: 'baby care', labelBn: 'শিশু যত্ন', q: 'baby care' },
      { label: 'gaming', labelBn: 'গেমিং', q: 'gaming' },
    ],
  },
];

/* ─────────────────────── multi-column navigation ─────────────────────── */

interface NavLink {
  label: string;
  labelBn: string;
  /** Search term run when clicked; omitted for external/real links. */
  q?: string;
}

interface NavColumn {
  title: string;
  titleBn: string;
  Icon: React.ComponentType<{ className?: string }>;
  links: NavLink[];
}

/**
 * The bottom navigation columns.
 *
 * Every entry is a keyword that exists in the catalogue taxonomy — a column
 * linking to a category with no inventory is a dead end for the shopper and a
 * thin page for a crawler. "Top Brands" is search-driven because brands are a
 * product attribute, not a taxonomy node.
 */
const NAV_COLUMNS: NavColumn[] = [
  {
    title: 'Electronics',
    titleBn: 'ইলেকট্রনিক্স',
    Icon: Smartphone,
    links: [
      { label: 'Mobile Phones', labelBn: 'মোবাইল ফোন', q: 'mobile phone' },
      { label: 'Laptops', labelBn: 'ল্যাপটপ', q: 'laptop' },
      { label: 'Headphones', labelBn: 'হেডফোন', q: 'headphones' },
      { label: 'Smart Watches', labelBn: 'স্মার্ট ওয়াচ', q: 'smart watch' },
      { label: 'Cameras', labelBn: 'ক্যামেরা', q: 'camera' },
      { label: 'Gaming', labelBn: 'গেমিং', q: 'gaming' },
    ],
  },
  {
    title: 'Fashion',
    titleBn: 'ফ্যাশন',
    Icon: Shirt,
    links: [
      { label: 'Sarees', labelBn: 'শাড়ি', q: 'saree' },
      { label: 'Panjabi', labelBn: 'পাঞ্জাবি', q: 'panjabi' },
      { label: 'Kurti', labelBn: 'কুর্তি', q: 'kurti' },
      { label: 'T-Shirts', labelBn: 'টি-শার্ট', q: 't-shirt' },
      { label: 'Sneakers', labelBn: 'স্নিকার্স', q: 'sneakers' },
      { label: 'Handbags', labelBn: 'হ্যান্ডব্যাগ', q: 'handbag' },
    ],
  },
  {
    title: 'Home & Kitchen',
    titleBn: 'হোম ও কিচেন',
    Icon: HomeIcon,
    links: [
      { label: 'Kitchen Appliances', labelBn: 'রান্নাঘরের যন্ত্রপাতি', q: 'kitchen' },
      { label: 'Furniture', labelBn: 'আসবাবপত্র', q: 'furniture' },
      { label: 'Home Decor', labelBn: 'হোম ডেকোর', q: 'home decor' },
      { label: 'Bedding', labelBn: 'বিছানার চাদর', q: 'bedding' },
      { label: 'Cookware', labelBn: 'রান্নার পাত্র', q: 'cookware' },
    ],
  },
  {
    title: 'Beauty',
    titleBn: 'বিউটি',
    Icon: Sparkles,
    links: [
      { label: 'Skincare', labelBn: 'স্কিনকেয়ার', q: 'skincare' },
      { label: 'Makeup', labelBn: 'মেকআপ', q: 'makeup' },
      { label: 'Haircare', labelBn: 'চুলের যত্ন', q: 'haircare' },
      { label: 'Fragrance', labelBn: 'সুগন্ধি', q: 'perfume' },
      { label: 'Health & Wellness', labelBn: 'স্বাস্থ্য ও সুস্থতা', q: 'health' },
    ],
  },
  {
    title: 'Baby & Toys',
    titleBn: 'শিশু ও খেলনা',
    Icon: Baby,
    links: [
      { label: 'Baby Care', labelBn: 'শিশু যত্ন', q: 'baby care' },
      { label: 'Diapers', labelBn: 'ডায়াপার', q: 'diaper' },
      { label: 'Toys & Games', labelBn: 'খেলনা ও গেম', q: 'toy' },
      { label: 'Kids Clothing', labelBn: 'শিশুদের পোশাক', q: 'kids clothing' },
      { label: 'School Supplies', labelBn: 'স্কুল সামগ্রী', q: 'stationery' },
    ],
  },
  {
    title: 'Top Brands',
    titleBn: 'শীর্ষ ব্র্যান্ড',
    Icon: Crown,
    links: [
      { label: 'Samsung', labelBn: 'স্যামসাং', q: 'samsung' },
      { label: 'Xiaomi', labelBn: 'শাওমি', q: 'xiaomi' },
      { label: 'Walton', labelBn: 'ওয়ালটন', q: 'walton' },
      { label: 'Aarong', labelBn: 'আড়ং', q: 'aarong' },
      { label: 'Transcom', labelBn: 'ট্রান্সকম', q: 'transcom' },
    ],
  },
];

/** About / Careers / Terms / Privacy / Sell — the utility strip. */
const UTILITY_LINKS: { label: string; labelBn: string }[] = [
  { label: 'About Us', labelBn: 'আমাদের সম্পর্কে' },
  { label: 'Careers', labelBn: 'ক্যারিয়ার' },
  { label: 'Terms of Use', labelBn: 'ব্যবহারের শর্তাবলী' },
  { label: 'Privacy Policy', labelBn: 'গোপনীয়তা নীতি' },
  { label: 'Sell with Us', labelBn: 'আমাদের সাথে বিক্রি করুন' },
];

/**
 * Social destinations.
 *
 * These are placeholders pointing at the platform's handle namespace. They are
 * real anchors (not buttons) because a social profile is a genuine external URL
 * a crawler can follow; swap the `href` for the live page when the handles are
 * confirmed. `rel="noopener noreferrer"` is mandatory for `target="_blank"`
 * so the opened tab cannot reach back through `window.opener`.
 */
const SOCIAL_LINKS: { name: string; Icon: React.ComponentType<{ className?: string }>; href: string; color: string }[] = [
  { name: 'Facebook', Icon: Facebook, href: 'https://facebook.com/zidmarketbd', color: '#1877F2' },
  { name: 'Instagram', Icon: Instagram, href: 'https://instagram.com/zidmarketbd', color: '#E1306C' },
  { name: 'YouTube', Icon: Youtube, href: 'https://youtube.com/@zidmarketbd', color: '#FF0000' },
  { name: 'X', Icon: Twitter, href: 'https://x.com/zidmarketbd', color: '#111827' },
  { name: 'LinkedIn', Icon: Linkedin, href: 'https://linkedin.com/company/zidmarketbd', color: '#0A66C2' },
  { name: 'WhatsApp', Icon: Send, href: 'https://wa.me/8809600000000', color: '#25D366' },
];

interface Props {
  lang: Lang;
  /** Run a search for a keyword tag. */
  onSearch: (query: string) => void;
  /** Total live product count, when known — shown in the overview copy. */
  productCount?: number;
  /** Number of active sellers, when known. */
  sellerCount?: number;
  /** Open the category browse ("All categories"). */
  onBrowseCategories?: () => void;
  /** Open the merchant signup / plans page. */
  onGoToPlans?: () => void;
}

export const MarketplaceSeoFooter: React.FC<Props> = ({
  lang,
  onSearch,
  productCount,
  sellerCount,
  onBrowseCategories,
  onGoToPlans,
}) => {
  const t = (en: string, bn: string) => (lang === 'bn' ? bn : en);

  const totalTags = useMemo(
    () => SEARCH_GROUPS.reduce((n, g) => n + g.tags.length, 0),
    [],
  );

  const trust = [
    {
      Icon: Truck,
      title: t('Nationwide delivery', 'সারাদেশে ডেলিভারি'),
      sub: t('All 64 districts', 'সব ৬৪ জেলা'),
    },
    {
      Icon: ShieldCheck,
      title: t('Verified sellers', 'যাচাইকৃত সেলার'),
      sub: sellerCount != null
        ? t(`${sellerCount} active stores`, `${sellerCount}টি সক্রিয় স্টোর`)
        : t('Checked before they list', 'তালিকাভুক্তির আগে যাচাইকৃত'),
    },
    {
      Icon: RotateCcw,
      title: t('7-day returns', '৭ দিনের রিটার্ন'),
      sub: t('On damaged items', 'ক্ষতিগ্রস্ত পণ্যে'),
    },
    {
      Icon: Wallet,
      title: t('Cash on delivery', 'ক্যাশ অন ডেলিভারি'),
      sub: t('Pay when it arrives', 'পণ্য হাতে পেয়ে টাকা দিন'),
    },
  ];

  return (
    <footer
      className="mt-8 border-t bg-white"
      style={{ borderColor: THEME.line }}
      aria-labelledby="mm-seo-footer-heading"
    >
      <div className="mx-auto max-w-[1400px] px-4 py-7 sm:py-8">
        {/* ── 1. Trust strip ── */}
        <div
          className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border sm:grid-cols-4"
          style={{ borderColor: THEME.line, backgroundColor: THEME.line }}
        >
          {trust.map(({ Icon, title, sub }) => (
            <div key={title} className="flex items-center gap-2.5 bg-white px-3 py-3.5 sm:px-4">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: '#eef0ff' }}
              >
                <Icon className="h-4 w-4" style={{ color: THEME.brand }} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[12px] font-black text-slate-800">{title}</div>
                <div className="truncate text-[10.5px] text-slate-500">{sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── 2. Popular searches ── */}
        <section className="mt-7" aria-labelledby="mm-seo-footer-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="mm-seo-footer-heading"
              className="flex items-center gap-2 text-[15px] font-black tracking-tight text-slate-900"
            >
              <Sparkles className="h-4 w-4" style={{ color: '#ff9f1c' }} />
              {t('Popular Searches', 'জনপ্রিয় সার্চ')}
            </h2>
            <p className="text-[11px] text-slate-400">
              {t(`${totalTags} keywords across ${SEARCH_GROUPS.length} groups`, `${SEARCH_GROUPS.length}টি গ্রুপে ${totalTags}টি কীওয়ার্ড`)}
            </p>
          </div>

          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SEARCH_GROUPS.map(({ title, titleBn, Icon, tags }) => (
              <div key={title}>
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500">
                  <Icon className="h-3.5 w-3.5" style={{ color: THEME.brand }} />
                  {lang === 'bn' ? titleBn : title}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <button
                      key={tag.q}
                      type="button"
                      onClick={() => onSearch(tag.q)}
                      // `text-wrap` keeps a long tag on one line inside its pill
                      // without the pill stretching its column.
                      className="rounded-full border px-2.5 py-1 text-[11.5px] font-semibold text-slate-600 transition hover:-translate-y-px hover:border-[#3b2fd6] hover:text-[#3b2fd6] hover:shadow-sm"
                      style={{ borderColor: THEME.line, backgroundColor: '#fff' }}
                    >
                      {lang === 'bn' ? tag.labelBn : tag.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 3. Overview + links ── */}
        <div className="mt-7 grid gap-6 border-t pt-6 lg:grid-cols-[1.6fr_1fr_1fr]" style={{ borderColor: THEME.line }}>
          <section aria-labelledby="mm-about-heading">
            <h3 id="mm-about-heading" className="text-[12.5px] font-black text-slate-900">
              {t('Shop Bangladesh’s multi-vendor marketplace', 'বাংলাদেশের মাল্টি-ভেন্ডর মার্কেটপ্লেসে কিনুন')}
            </h3>
            <p className="mt-2 max-w-prose text-[12px] leading-relaxed text-slate-600">
              {productCount != null && productCount > 0
                ? t(
                  `Browse ${productCount.toLocaleString()} products from ${sellerCount ?? 0} verified stores across Bangladesh — all in one basket. Every seller is checked before they list, prices are shown in Bangladeshi Taka (৳), and delivery reaches all 64 districts with cash on delivery available. Filter by category, compare prices side by side, and pay the way you prefer: bKash, Nagad, Rocket, bank transfer or cash on delivery. If something isn’t right, request a return within 7 days of delivery.`,
                  `বাংলাদেশের ${sellerCount ?? 0}টি যাচাইকৃত স্টোরের ${productCount.toLocaleString()}টি পণ্য এক কার্টে ঘুরে দেখুন। প্রতিটি সেলার তালিকাভুক্তির আগে যাচাই করা হয়, দাম বাংলাদেশি টাকায় (৳) দেখানো হয়, এবং সব ৬৪ জেলায় ক্যাশ অন ডেলিভারিসহ পৌঁছে দেওয়া হয়। ক্যাটাগরি অনুযায়ী ফিল্টার করুন, পাশাপাশি দাম তুলনা করুন এবং আপনার পছন্দমতো পরিশোধ করুন: বিকাশ, নগদ, রকেট, ব্যাংক ট্রান্সফার বা ক্যাশ অন ডেলিভারি। কোনো সমস্যা হলে ডেলিভারির ৭ দিনের মধ্যে রিটার্নের অনুরোধ করুন।`,
                )
                : t(
                  'Shop across hundreds of verified Bangladeshi stores in one basket. Every seller is checked before they list, prices are shown in Bangladeshi Taka (৳), and delivery reaches all 64 districts with cash on delivery available. Filter by category, compare prices side by side, and pay the way you prefer: bKash, Nagad, Rocket, bank transfer or cash on delivery. If something isn’t right, request a return within 7 days of delivery.',
                  'শত শত যাচাইকৃত বাংলাদেশি স্টোর থেকে এক কার্টেই কেনাকাটা করুন। প্রতিটি সেলার তালিকাভুক্তির আগে যাচাই করা হয়, দাম বাংলাদেশি টাকায় (৳) দেখানো হয়, এবং সব ৬৪ জেলায় ক্যাশ অন ডেলিভারিসহ পৌঁছে দেওয়া হয়। ক্যাটাগরি অনুযায়ী ফিল্টার করুন, পাশাপাশি দাম তুলনা করুন এবং আপনার পছন্দমতো পরিশোধ করুন: বিকাশ, নগদ, রকেট, ব্যাংক ট্রান্সফার বা ক্যাশ অন ডেলিভারি। কোনো সমস্যা হলে ডেলিভারির ৭ দিনের মধ্যে রিটার্নের অনুরোধ করুন।',
                )}
            </p>
          </section>

          <nav aria-labelledby="mm-shoplinks-heading">
            <h3 id="mm-shoplinks-heading" className="text-[12.5px] font-black text-slate-900">
              {t('Shop', 'কেনাকাটা')}
            </h3>
            <ul className="mt-2 space-y-1.5">
              {[
                { label: t('All categories', 'সব ক্যাটাগরি'), onClick: onBrowseCategories, Icon: Package },
                { label: t('Trending searches', 'জনপ্রিয় সার্চ'), onClick: () => onSearch('mobile phone'), Icon: Users },
                { label: t('New arrivals', 'নতুন পণ্য'), onClick: () => onSearch('new'), Icon: Sparkles },
              ].map(({ label, onClick, Icon }) => (
                <li key={label}>
                  <button
                    type="button"
                    onClick={onClick}
                    className="flex items-center gap-1.5 text-[12px] text-slate-600 transition hover:text-[#3b2fd6] hover:underline"
                  >
                    <Icon className="h-3 w-3 shrink-0 text-slate-400" />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="mm-sellerlinks-heading">
            <h3 id="mm-sellerlinks-heading" className="text-[12.5px] font-black text-slate-900">
              {t('Sell with us', 'আমাদের সাথে বিক্রি করুন')}
            </h3>
            <ul className="mt-2 space-y-1.5">
              {[
                { label: t('Open your store', 'আপনার স্টোর খুলুন'), onClick: onGoToPlans, Icon: Store },
                { label: t('View plans', 'প্ল্যান দেখুন'), onClick: onGoToPlans, Icon: ArrowRight },
                { label: t('Merchant login', 'মার্চেন্ট লগইন'), onClick: onGoToPlans, Icon: Users },
              ].map(({ label, onClick, Icon }) => (
                <li key={label}>
                  <button
                    type="button"
                    onClick={onClick}
                    disabled={!onClick}
                    className="flex items-center gap-1.5 text-[12px] text-slate-600 transition hover:text-[#3b2fd6] hover:underline disabled:cursor-default disabled:opacity-60"
                  >
                    <Icon className="h-3 w-3 shrink-0 text-slate-400" />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* ═════════ MULTI-COLUMN CATEGORY NAVIGATION ═════════
            Noon's signature block: six category columns, then a utility row.
            Collapsed into an accordion-free grid on phones — the columns are
            short enough that stacking them is still scannable, and a hidden
            accordion would bury exactly the internal links this footer exists
            to expose. */}
        <nav
          className="mt-7 border-t pt-6"
          style={{ borderColor: THEME.line }}
          aria-labelledby="mm-catnav-heading"
        >
          <h3 id="mm-catnav-heading" className="sr-only">
            {t('Browse categories', 'ক্যাটাগরি দেখুন')}
          </h3>
          <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            {NAV_COLUMNS.map(({ title, titleBn, Icon, links }) => (
              <div key={title}>
                <div className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-black uppercase tracking-wide text-slate-800">
                  <Icon className="h-3.5 w-3.5" style={{ color: THEME.brand }} />
                  {lang === 'bn' ? titleBn : title}
                </div>
                <ul className="space-y-1.5">
                  {links.map((link) => (
                    <li key={link.label}>
                      <button
                        type="button"
                        onClick={() => onSearch(link.q || link.label)}
                        className="group flex w-full items-center justify-between gap-1 text-left text-[11.5px] text-slate-500 transition hover:text-[#3b2fd6]"
                      >
                        <span className="truncate group-hover:underline">
                          {lang === 'bn' ? link.labelBn : link.label}
                        </span>
                        <ChevronRight className="h-3 w-3 shrink-0 opacity-0 transition group-hover:opacity-100" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Utility row — About / Careers / Terms / Privacy / Sell */}
          <div
            className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4"
            style={{ borderColor: THEME.line }}
          >
            {UTILITY_LINKS.map((link) => {
              const label = lang === 'bn' ? link.labelBn : link.label;
              const isSell = link.label === 'Sell with Us';
              return (
                <button
                  key={link.label}
                  type="button"
                  onClick={isSell && onGoToPlans ? onGoToPlans : undefined}
                  disabled={!isSell || !onGoToPlans}
                  className={`text-[11.5px] font-semibold transition ${isSell
                    ? 'text-[#3b2fd6] hover:underline'
                    : 'text-slate-500 hover:text-slate-800'
                    } disabled:cursor-default`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* ═════════ APPS · SOCIAL · PAYMENTS ═════════
            The three-column connect band Noon closes with. Each column is a
            real destination: the store badges are anchors, the social icons
            are anchors with noreferrer, and the payment marks are static
            labels (there is no payment page for a shopper to visit). */}
        <div
          className="mt-7 grid gap-6 border-t pt-6 sm:grid-cols-3"
          style={{ borderColor: THEME.line }}
        >
          {/* SHOP ON THE GO */}
          <section aria-labelledby="mm-apps-heading">
            <h3 id="mm-apps-heading" className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-400">
              {t('Shop on the go', 'অ্যাপে কেনাকাটা করুন')}
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href="https://apps.apple.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 min-w-[132px] items-center gap-2 rounded-lg bg-slate-900 px-2.5 text-white transition hover:bg-slate-800"
                aria-label={t('Download on the App Store', 'অ্যাপ স্টোর থেকে ডাউনলোড করুন')}
              >
                <Apple className="h-5 w-5 shrink-0" />
                <span className="flex flex-col leading-tight">
                  <span className="text-[8px] uppercase tracking-wide text-white/70">
                    {t('Download on the', 'ডাউনলোড করুন')}
                  </span>
                  <span className="text-[12.5px] font-bold">App Store</span>
                </span>
              </a>
              <a
                href="https://play.google.com/store"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 min-w-[132px] items-center gap-2 rounded-lg bg-slate-900 px-2.5 text-white transition hover:bg-slate-800"
                aria-label={t('Get it on Google Play', 'গুগল প্লে থেকে নিন')}
              >
                <Play className="h-4 w-4 shrink-0" />
                <span className="flex flex-col leading-tight">
                  <span className="text-[8px] uppercase tracking-wide text-white/70">
                    {t('Get it on', 'পান')}
                  </span>
                  <span className="text-[12.5px] font-bold">Google Play</span>
                </span>
              </a>
            </div>
          </section>

          {/* CONNECT WITH US */}
          <section aria-labelledby="mm-social-heading">
            <h3 id="mm-social-heading" className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-400">
              {t('Connect with us', 'আমাদের সাথে যুক্ত থাকুন')}
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {SOCIAL_LINKS.map(({ name, Icon, href, color }) => (
                <a
                  key={name}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={name}
                  title={name}
                  className="flex h-8 w-8 items-center justify-center rounded-full border transition hover:-translate-y-px hover:shadow-sm"
                  style={{ borderColor: THEME.line, color }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
            <p className="mt-2.5 text-[11px] text-slate-400">
              {t('Follow us for deals and new arrivals.', 'ডিল ও নতুন পণ্যের জন্য আমাদের ফলো করুন।')}
            </p>
          </section>

          {/* PAYMENT METHODS */}
          <section aria-labelledby="mm-pay-heading">
            <h3 id="mm-pay-heading" className="text-[10.5px] font-black uppercase tracking-[0.16em] text-slate-400">
              {t('We accept', 'আমরা গ্রহণ করি')}
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {/*
                Payment marks stay in their LATIN brand spelling in both
                languages. These are logos, not prose: transliterating only
                some of them ("নগদ" beside "bKash" and "Rocket") reads as a
                half-finished translation and breaks brand recognition.
              */}
              {[
                { label: 'bKash', bg: '#E2136E', fg: '#fff' },
                { label: 'Nagad', bg: '#EE1C25', fg: '#fff' },
                { label: 'Rocket', bg: '#8C3494', fg: '#fff' },
              ].map((p) => (
                <span
                  key={p.label}
                  className="flex h-7 items-center rounded-md px-2.5 text-[10.5px] font-black"
                  style={{ backgroundColor: p.bg, color: p.fg }}
                >
                  {p.label}
                </span>
              ))}
              <span
                className="flex h-7 items-center gap-1 rounded-md border bg-white px-2.5 text-[10.5px] font-bold text-slate-700"
                style={{ borderColor: THEME.line }}
              >
                <CreditCard className="h-3.5 w-3.5 text-slate-500" />
                {t('Cards', 'কার্ড')}
              </span>
              <span
                className="flex h-7 items-center gap-1 rounded-md border bg-white px-2.5 text-[10.5px] font-bold text-slate-700"
                style={{ borderColor: THEME.line }}
              >
                <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                {t('Cash on Delivery', 'ক্যাশ অন ডেলিভারি')}
              </span>
            </div>
          </section>
        </div>

        {/* ── Legal ── */}
        <div
          className="mt-6 flex flex-col items-center justify-between gap-2 border-t pt-4 text-[11px] text-slate-400 sm:flex-row"
          style={{ borderColor: THEME.line }}
        >
          <span>
            © {new Date().getFullYear()} ZID Market — {t('ZID SAAS Bangladesh', 'জিআইডি সাস বাংলাদেশ')}
          </span>
          <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <span>{t('All prices in BDT (৳)', 'সব দাম বাংলাদেশি টাকায় (৳)')}</span>
            <span className="flex items-center gap-1">
              <HeadphonesIcon className="h-3 w-3" />
              {t('Customer support 9am–9pm', 'কাস্টমার সাপোর্ট সকাল ৯টা–রাত ৯টা')}
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
};

export default MarketplaceSeoFooter;
