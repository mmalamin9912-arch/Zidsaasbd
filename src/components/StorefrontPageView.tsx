/**
 * Dynamic storefront content page — /pages/<slug>.
 *
 * WHY THIS EXISTS
 * ---------------
 * The storefront footer's Quick Links ("About Us", "Shipping Policy",
 * "Return Policy") previously pointed at nothing. The Custom Pages module
 * (`/pages/*` in the merchant dashboard) already lets a merchant write these
 * pages and persists them via `customPages`, so this view is the missing
 * storefront half: it resolves the requested slug against the merchant's saved
 * pages and renders their text.
 *
 * FALLBACK BEHAVIOUR
 * ------------------
 * A merchant who has not written a policy yet must NOT get a blank or broken
 * page — that reads as a bug to a shopper. When no saved page matches the slug,
 * we render a standard placeholder policy (see `FALLBACK_PAGES`) branded with
 * the store name. The copy states plainly that the details are still being
 * finalised, so the shopper knows the store is real while the merchant fills it
 * in. An unknown slug that is not a known policy gets a generic not-found page.
 *
 * Only pages whose status is not "Draft" are treated as published, so a
 * half-written page the merchant saved as a draft falls through to the
 * fallback rather than going live.
 */

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, Phone, ShieldCheck } from 'lucide-react';
import { loadStorefrontModules } from '../lib/storeModulesApi';
import type { CustomPage } from '../lib/storeModulesApi';
import { resolveActiveStoreSlug } from '../lib/activeStore';

/** Props supplied by App.tsx when it routes to this view. */
export interface StorefrontPageViewProps {
  /** Slug from the URL, e.g. `shipping-policy` (no `/pages/` prefix). */
  slug: string;
  /** Store slug from the URL — used to load THIS store's pages/policies. */
  storeSlug?: string;
  /** Store name for branding/fallback copy; falls back to a generic name. */
  storeName?: string;
  /** Live merchant record, used for the contact block and store branding. */
  merchant?: Record<string, any> | null;
  /** Navigate back to the storefront without a full reload. */
  onNavigateHome?: () => void;
}

/** A branded placeholder shown when the merchant has not written the page. */
interface FallbackPage {
  title: string;
  intro: string;
  /** Paragraphs of standard policy/placeholder copy. */
  sections: { heading: string; body: string }[];
}

/**
 * Standard placeholder copy, keyed by slug.
 *
 * Deliberately generic and non-committal — it must not invent binding legal
 * terms on the merchant's behalf. Each states that the store's own policy is
 * still being finalised and points the shopper at the merchant for detail.
 */
const FALLBACK_PAGES: Record<string, FallbackPage> = {
  'about-us': {
    title: 'About Us',
    intro: 'Our story is still being written.',
    sections: [
      {
        heading: 'Who we are',
        body: 'We are an online store serving customers across Bangladesh. A detailed introduction to our business, our team, and the products we carry will be published on this page shortly.',
      },
      {
        heading: 'What we stand for',
        body: 'We are committed to offering genuine products at fair prices, with dependable delivery nationwide. Our full brand story and mission statement will be added here soon.',
      },
    ],
  },
  'shipping-policy': {
    title: 'Shipping Policy',
    intro: 'Our full shipping terms will be published here shortly.',
    sections: [
      {
        heading: 'Delivery coverage',
        body: 'We deliver across Bangladesh. Standard delivery charges and estimated timelines for inside Dhaka, Dhaka suburbs, and outside Dhaka are shown at checkout before you confirm your order.',
      },
      {
        heading: 'Order processing',
        body: 'Orders are typically processed within 1–2 business days. You will receive a confirmation once your order is placed and a further update once it is handed to our delivery partner.',
      },
      {
        heading: 'Tracking your order',
        body: 'You can follow your parcel at any time from the "Track Order" link in our store footer using the order details provided at checkout.',
      },
    ],
  },
  'return-policy': {
    title: 'Return & Refund Policy',
    intro: 'Our full return and refund terms will be published here shortly.',
    sections: [
      {
        heading: 'Returns',
        body: 'If an item arrives damaged, defective, or is not what you ordered, please contact us so we can arrange a replacement or refund. Please keep the item unused and in its original packaging where possible.',
      },
      {
        heading: 'Refunds',
        body: 'Approved refunds are issued through the original payment method. Processing times vary by payment provider, including mobile financial services such as bKash and Nagad.',
      },
      {
        heading: 'How to start a return',
        body: 'Reach out to us using the contact details below with your order information and we will guide you through the process.',
      },
    ],
  },
  'privacy-policy': {
    title: 'Privacy Policy',
    intro: 'Our full privacy policy will be published here shortly.',
    sections: [
      {
        heading: 'Information we collect',
        body: 'We collect only the details needed to process and deliver your order, such as your name, contact number, and delivery address.',
      },
      {
        heading: 'How your information is used',
        body: 'Your information is used to fulfil your order, provide delivery updates, and respond to your support requests. It is never sold to third parties.',
      },
    ],
  },
  'terms-of-service': {
    title: 'Terms of Service',
    intro: 'Our full terms of service will be published here shortly.',
    sections: [
      {
        heading: 'Use of this store',
        body: 'By placing an order you confirm that the information you provide is accurate and that you are able to enter into a purchase agreement.',
      },
      {
        heading: 'Pricing and availability',
        body: 'Prices and stock are subject to change. If an item becomes unavailable after your order, we will contact you to offer an alternative or a refund.',
      },
    ],
  },
  'contact-us': {
    title: 'Contact Us',
    intro: 'We would love to hear from you.',
    sections: [
      {
        heading: 'Get in touch',
        body: 'For questions about an order, a product, or anything else, please reach out using the contact details shown below. Our support team will respond as soon as possible.',
      },
    ],
  },
  faq: {
    title: 'Frequently Asked Questions',
    intro: 'Our FAQ will be published here shortly.',
    sections: [
      {
        heading: 'Orders and delivery',
        body: 'Answers to the questions we are asked most often — about ordering, payment methods, delivery times, and returns — will be added to this page soon. In the meantime, please contact us directly with any question.',
      },
    ],
  },
  // Parcel tracking reached from the footer's "Track Order" link. The live
  // tracking form lives on the storefront order-tracking view; this copy is the
  // static explanation shown in its place, so the route is never a dead end.
  'track-order': {
    title: 'Track Your Order',
    intro: 'You can follow your parcel from dispatch to delivery.',
    sections: [
      {
        heading: 'Where to track',
        body: 'Use the order tracking form on our store page with the order number and the phone number you used at checkout. Once your order has been handed to our delivery partner, the latest status will be shown there.',
      },
      {
        heading: 'Delivery updates',
        body: 'We send an update when your order is confirmed, when it is handed to the courier, and when it is out for delivery. Delivery typically completes within 1–3 business days depending on your district.',
      },
      {
        heading: 'Need help?',
        body: 'If your tracking details are not showing, or the parcel appears delayed, please contact us with your order number and we will follow it up with the courier on your behalf.',
      },
    ],
  },
};

/** Shown for a slug that is neither a saved page nor a known policy. */
const NOT_FOUND_PAGE: FallbackPage = {
  title: 'Page Not Found',
  intro: 'The page you are looking for is not available.',
  sections: [
    {
      heading: 'What happened?',
      body: 'This link may be broken, or the page may have been moved or removed. Please use the store navigation to continue shopping.',
    },
  ],
};

/** Trim and normalise a slug for comparison. */
function normalizeSlug(value: string): string {
  const raw = String(value || '').toLowerCase().trim();
  // Short public alias: /e/<slug>/about and /store/<slug>/about are the About Us page.
  if (raw === 'about' || raw === 'about-us' || raw === 'pages/about-us' || raw === '/about' || raw === 'pages/about') return 'about-us';
  return String(value || '')
    .toLowerCase()
    .replace(/^\/?pages\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A saved page counts as live unless it is explicitly a draft. */
function isPublished(page: CustomPage): boolean {
  return String(page?.status || '').trim().toLowerCase() !== 'draft';
}

export function StorefrontPageView({
  slug,
  storeSlug,
  storeName,
  merchant,
  onNavigateHome,
}: StorefrontPageViewProps) {
  const target = normalizeSlug(slug);
  const displayName = String(storeName || 'our store').trim() || 'our store';

  // Prefer the store slug from the URL (deep link) so THIS store's
  // pages/policies load — never another merchant's cached session slug.
  const storeRef = resolveActiveStoreSlug(storeSlug || null);

  // Load the merchant's saved pages so their own text wins over the fallback.
  // The load is async (it hits /api/storefront/<slug>), so the fallback renders
  // first and is replaced once the merchant's pages arrive — the shopper never
  // sees a blank frame, and a network failure simply leaves the fallback in
  // place, which is the safe outcome.
  const [savedPages, setSavedPages] = useState<CustomPage[]>([]);
  // Live legal-policy texts from the merchant's store settings (Supabase via
  // /api/store/policies). Direct-link pages (/e/<slug>/shipping-policy, …)
  // prefer these over the generic template; empty => placeholder below.
  const [livePolicies, setLivePolicies] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!storeRef) return;
    let cancelled = false;

    loadStorefrontModules(storeRef)
      .then((modules) => {
        if (cancelled) return;
        setSavedPages(Array.isArray(modules?.customPages) ? modules.customPages : []);
      })
      .catch((e: any) => {
        if (!cancelled) {
          console.warn('[StorefrontPageView] page load failed:', e?.message || e);
        }
      });

    // Policy texts live outside customPages (Settings → Legal policies).
    fetch(`/api/store/policies?store_slug=${encodeURIComponent(storeRef)}`)
      .then((r) => r.json().catch(() => null))
      .then((data: any) => {
        if (cancelled || !data?.ok || !data.policies) return;
        setLivePolicies({
          'privacy-policy': String(data.policies.privacyPolicy || '').trim(),
          'terms-of-service': String(data.policies.termsOfService || '').trim(),
          'return-policy': String(data.policies.returnRefundPolicy || '').trim(),
          'shipping-policy': String(data.policies.shippingPolicy || '').trim(),
        });
      })
      .catch(() => { /* placeholder fallback stays */ });

    // Guard against a stale response overwriting a newer slug's result.
    return () => {
      cancelled = true;
    };
  }, [storeRef, target]);

  const savedPage = useMemo<CustomPage | null>(() => {
    if (!savedPages.length) return null;
    const match = savedPages.find((page) => normalizeSlug(page?.slug || page?.title || '') === target);
    if (!match || !isPublished(match)) return null;
    return match;
  }, [savedPages, target]);

  // A saved "track-order" page is accepted too, but the canonical key is
  // `track-order`, so a merchant page saved as "Track Order" still matches.
  const fallback = FALLBACK_PAGES[target] || NOT_FOUND_PAGE;
  // Merchant policy text (Supabase) wins for the four legal pages when the
  // merchant actually filled it in; otherwise the custom page; otherwise the
  // "Information will be updated soon" placeholder template.
  const policyTextForTarget = livePolicies[target] || '';
  const merchantBody = policyTextForTarget || (savedPage ? String(savedPage.content || '').trim() : '');
  const hasMerchantContent = Boolean(merchantBody);
  const title =
    target === 'about-us' && (merchant as any)?.storeDescription
      ? 'About Us'
      : savedPage?.title || fallback.title;
  const phone = String(merchant?.supportPhone || merchant?.phone || '').trim();
  const email = String(merchant?.supportEmail || merchant?.email || '').trim();

  useEffect(() => {
    document.title = title ? `${title} — ${displayName}` : displayName;
  }, [title, displayName]);

  return (
    <div className="min-h-screen bg-slate-50" data-testid="storefront-page-view">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <button
          type="button"
          onClick={onNavigateHome}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to store
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-slate-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {displayName}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mb-4">
            {title}
          </h1>

          {hasMerchantContent ? (
            // Merchant-authored copy (Supabase policy text wins, else the saved
            // custom page). Rendered as preformatted text so the paragraphs and
            // line breaks they typed in the dashboard survive.
            <div className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
              {target === 'about-us' && !merchantBody
                ? String((merchant as any)?.storeDescription || '').trim()
                : merchantBody || savedPage?.content}
            </div>
          ) : (
            <div className="space-y-6">
              <p className="text-sm leading-relaxed text-slate-700">
                Information will be updated soon
              </p>

              {fallback.sections.map((section, i) => (
                <div key={`section-${i}`}>
                  <h2 className="text-sm font-bold text-slate-900 mb-1.5">{section.heading}</h2>
                  <p className="text-sm leading-relaxed text-slate-700">{section.body}</p>
                </div>
              ))}

              {/* Reassure the shopper that the placeholder is temporary. */}
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                <ShieldCheck className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-[11px] leading-relaxed text-amber-800">
                  Information will be updated soon. For anything urgent,
                  please contact {displayName} directly.
                </p>
              </div>
            </div>
          )}

          {(phone || email) && (
            <div className="mt-8 pt-5 border-t border-slate-100">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                Contact
              </h2>
              <div className="space-y-1">
                {phone && (
                  <div className="flex items-center gap-2 text-xs text-slate-700">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <a href={`tel:${phone.replace(/\D/g, '')}`} className="hover:underline">
                      {phone}
                    </a>
                  </div>
                )}
                {email && (
                  <div className="flex items-center gap-2 text-xs text-slate-700">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <a href={`mailto:${email}`} className="hover:underline">
                      {email}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
