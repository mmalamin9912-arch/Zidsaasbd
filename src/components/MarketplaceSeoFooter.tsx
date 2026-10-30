import React, { useMemo } from 'react';
import {
  Truck, ShieldCheck, RotateCcw, Wallet, Store, ArrowRight,
  Smartphone, Laptop, HeadphonesIcon, Shirt,
  Home as HomeIcon, Sparkles, Users, Package,
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

        {/* ── Legal ── */}
        <div
          className="mt-6 flex flex-col items-center justify-between gap-2 border-t pt-4 text-[11px] text-slate-400 sm:flex-row"
          style={{ borderColor: THEME.line }}
        >
          <span>
            © {new Date().getFullYear()} ZID Market — {t('ZID SAAS Bangladesh', 'জিআইডি সাস বাংলাদেশ')}
          </span>
          <span className="flex items-center gap-3">
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
