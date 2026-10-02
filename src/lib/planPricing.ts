// =============================================================================
// Plan pricing & tiering — the ONE place billing-cycle maths lives.
// -----------------------------------------------------------------------------
// WHY THIS EXISTS
//   The plan catalogue gained a monthly/yearly toggle and structured feature
//   flags. The price for a cycle is NOT stored as a single number, because a
//   plan's legacy `price`/`durationDays` pair still has to keep working for
//   records written before the toggle existed. So the maths — "what does this
//   plan cost for a month vs a year, and how much does annual save?" — was at
//   risk of being reimplemented (and drifting) in the modal, the billing page
//   and the public pricing page.
//
//   `resolvePlanPricing` is the single resolver; `sortPlansByTier` the single
//   ordering. Import these rather than re-deriving a price from `plan.price`.
//
// TIER LADDER
//   Starter (basic) → Growth (popular) → Pro → Enterprise (advanced). Lower
//   tiers get the essentials with hard caps; the paid tiers unlock premium
//   themes, custom domain, AI tools, tracking pixels and WhatsApp recovery.
// =============================================================================

import type { BillingCycle, PlanFeatureFlags, SubscriptionPlan } from '../types';

/** Days granted by each billing term. Matches `getPlanDurationInDays` on the server. */
export const CYCLE_DURATION_DAYS: Record<BillingCycle, number> = {
  monthly: 30,
  yearly: 365,
};

/** Headline annual discount used when a plan sets no explicit yearly price. */
export const DEFAULT_ANNUAL_DISCOUNT_PERCENT = 20;

/**
 * Flags applied to a plan row that carries no feature flags of its own.
 *
 * Every key defaults to `false`, so a plan with no stored flags grants nothing.
 * That is deliberate: defaulting the paid capabilities to `true` would hand a
 * merchant access the admin never approved.
 */
export const NO_FEATURE_FLAGS: PlanFeatureFlags = {
  freeSubdomain: false,
  customDomain: false,
  premiumThemes: false,
  cssCustomizer: false,
  courierApi: false,
  courierAutoSync: false,
  metaPixels: false,
  googleAnalytics: false,
  aiCaption: false,
  aiContent: false,
  removeBg: false,
  aiCopilot: false,
  whatsappRecovery: false,
  emailSupport: false,
  phoneSupport: false,
  prioritySupport: false,
};

/**
 * LEGACY flag names, kept only to migrate rows written before the ladder was
 * split into fine-grained capabilities. `aiTools` used to mean "AI unlocked",
 * which is the broadest reading, so it maps onto the full content suite —
 * a merchant who already paid for it keeps working access.
 */
export const LEGACY_FEATURE_FLAG_ALIASES: Record<string, keyof PlanFeatureFlags> = {
  aiTools: 'aiContent',
  customDomain: 'customDomain',
};

const toNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Whole-percent clamp for the annual saving badge. */
function normalizeDiscount(value: unknown): number {
  const n = toNumber(value, DEFAULT_ANNUAL_DISCOUNT_PERCENT);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n), 90);
}

/**
 * Effective monthly price.
 *
 * Prefers the explicit `monthlyPrice` the admin configured; otherwise divides
 * the plan's own term price down to a 30-day rate so a legacy row (which only
 * has `price` + `durationDays`) still quotes sensibly on the monthly toggle.
 */
export function monthlyPriceOf(plan: SubscriptionPlan): number {
  const explicit = toNumber(plan.monthlyPrice, 0);
  if (explicit > 0) return explicit;

  const days = toNumber(plan.durationDays, 30);
  if (days <= 0) return toNumber(plan.price, 0);
  return Math.round((toNumber(plan.price, 0) / days) * 30);
}

/**
 * Full price for the requested billing term.
 *
 * Yearly = monthly × 12 − discount, rounded to the nearest 10 BDT (merchants
 * price in round taka, not round taka-and-paisa). An explicit `yearlyPrice`
 * from the admin always wins over the derived figure.
 */
export function resolvePlanPricing(
  plan: SubscriptionPlan,
  cycle: BillingCycle = 'monthly'
): {
  cycle: BillingCycle;
  /** Total BDT charged for this term. */
  price: number;
  /** Days the subscription will be granted for. */
  durationDays: number;
  /** Whole-percent saving vs paying monthly for 12 months; 0 unless yearly. */
  discountPercent: number;
  /** Monthly-equivalent price, for the "/mo" caption. */
  perMonth: number;
  /** What 12 monthly payments would cost — the strikethrough on yearly. */
  compareAtPrice: number;
  /** Absolute BDT saved by choosing yearly. */
  savingsBDT: number;
} {
  const monthly = monthlyPriceOf(plan);
  const days = CYCLE_DURATION_DAYS[cycle] ?? CYCLE_DURATION_DAYS.monthly;

  if (cycle !== 'yearly') {
    return {
      cycle,
      price: monthly > 0 ? monthly : toNumber(plan.price, 0),
      durationDays: days,
      discountPercent: 0,
      perMonth: monthly,
      compareAtPrice: monthly * 12,
      savingsBDT: 0,
    };
  }

  const twelveMonths = monthly * 12;
  const explicitYearly = toNumber(plan.yearlyPrice, 0);
  const discountPercent = normalizeDiscount(
    plan.annualDiscountPercent ?? DEFAULT_ANNUAL_DISCOUNT_PERCENT
  );

  const derived = Math.round((twelveMonths * (1 - discountPercent / 100)) / 10) * 10;
  const price = explicitYearly > 0 ? explicitYearly : derived;
  // Derive the badge from the ACTUAL figures so it can never claim a saving the
  // admin's own yearly price contradicts.
  const realDiscount = twelveMonths > 0 ? Math.round((1 - price / twelveMonths) * 100) : 0;

  return {
    cycle,
    price,
    durationDays: days,
    discountPercent: realDiscount > 0 ? realDiscount : 0,
    perMonth: price > 0 ? Math.round(price / 12) : monthly,
    compareAtPrice: twelveMonths,
    savingsBDT: Math.max(0, twelveMonths - price),
  };
}

/**
 * Order the catalogue the way a merchant should read it.
 *
 * Explicit `displayOrder` wins (that is the admin's control). Rows without one
 * keep their relative catalogue order but sort after the ordered ones, and ties
 * break on price so a mis-ordered set still reads low → high. `free_trial` is
 * pushed to the front regardless — it is not a purchasable tier.
 */
export function sortPlansByTier(plans: SubscriptionPlan[]): SubscriptionPlan[] {
  const decorated = (plans || []).map((plan, index) => {
    const order = toNumber(plan.displayOrder, NaN);
    return { plan, index, order: Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER };
  });

  decorated.sort((a, b) => {
    // Free trial always leads — it is the entry point, not a paid tier.
    const aFree = isFreeTrial(a.plan.id);
    const bFree = isFreeTrial(b.plan.id);
    if (aFree !== bFree) return aFree ? -1 : 1;

    if (a.order !== b.order) return a.order - b.order;
    const priceDelta = monthlyPriceOf(a.plan) - monthlyPriceOf(b.plan);
    if (priceDelta !== 0) return priceDelta;
    return a.index - b.index;
  });

  return decorated.map((d) => d.plan);
}

const isFreeTrial = (id: string) => {
  const lower = String(id || '').toLowerCase();
  return lower === 'free_trial' || lower === 'trial' || lower === 'free';
};

/** True when the plan caps products; 0/absent means unlimited. */
export function productLimitOf(plan: SubscriptionPlan): number {
  const n = toNumber(plan.maxProducts, 0);
  return n > 0 ? Math.round(n) : 0;
}

export const productLimitLabel = (plan: SubscriptionPlan): string => {
  const limit = productLimitOf(plan);
  return limit > 0 ? `${limit.toLocaleString()} products` : 'Unlimited products';
};

/** The plan's capability flags, with every missing key defaulted to `false`. */
export function featureFlagsOf(plan: SubscriptionPlan): PlanFeatureFlags {
  const stored = (plan.featureFlags || {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...NO_FEATURE_FLAGS };
  for (const key of Object.keys(NO_FEATURE_FLAGS)) merged[key] = stored[key];
  // Migrate legacy spellings without letting them override a current key.
  for (const [legacy, current] of Object.entries(LEGACY_FEATURE_FLAG_ALIASES)) {
    if (legacy !== current && stored[legacy] === true) merged[current] = true;
  }
  return merged as unknown as PlanFeatureFlags;
}

/**
 * The bullet list a plan card renders.
 *
 * The admin's OWN `features` array wins. This function used to synthesise
 * bullets from the flags and discard that array entirely, which is why every
 * card claimed a "themes" line and a "support" line regardless of tier and the
 * published ladder looked duplicated. Deriving is now only the FALLBACK for a
 * plan whose admin left the list blank, so the card is never empty.
 */
export function derivePlanFeatures(plan: SubscriptionPlan): string[] {
  const authored = (plan.features || []).map((f) => String(f).trim()).filter(Boolean);
  if (authored.length > 0) return authored;

  const flags = featureFlagsOf(plan);
  const derived = [productLimitLabel(plan)];

  if (flags.premiumThemes) derived.push(flags.cssCustomizer ? 'All themes & CSS color customizer' : 'Premium theme library');
  else derived.push('Standard themes only');

  if (flags.customDomain) derived.push('Custom domain integration (.com)');
  else if (flags.freeSubdomain) derived.push('Free subdomain (.zidbd.com)');

  if (flags.metaPixels && flags.googleAnalytics) derived.push('Meta Pixel & Google Analytics tracking');
  else if (flags.metaPixels) derived.push('Meta Pixel & TikTok tracking');
  else if (flags.googleAnalytics) derived.push('Google Analytics 4');

  if (flags.aiContent) derived.push('Full AI suite (content, image cleanup, copilot)');
  else if (flags.aiCaption) derived.push('AI social caption writer');
  if (flags.removeBg) derived.push('AI background remover');

  if (flags.courierAutoSync) derived.push('Live courier API auto-sync');
  else if (flags.courierApi) derived.push('Basic courier integration');

  if (flags.whatsappRecovery) derived.push('WhatsApp abandoned-cart auto-recovery');

  if (flags.prioritySupport) derived.push('Priority 24/7 VIP phone & WhatsApp support');
  else if (flags.phoneSupport) derived.push('Standard phone support');
  else if (flags.emailSupport) derived.push('Email support');

  return derived;
}

/**
 * Ordered flag list for the Super Admin tier editor. Defined once here so the
 * admin UI, `derivePlanFeatures` and the entitlement gate all iterate the same
 * set — a flag shown in the editor can never be missing from the card text.
 */
export const FEATURE_FLAG_LABELS: Array<{ key: keyof PlanFeatureFlags; label: string }> = [
  { key: 'freeSubdomain', label: 'Free .zidbd.com subdomain' },
  { key: 'customDomain', label: 'Custom .com domain' },
  { key: 'premiumThemes', label: 'Premium theme library' },
  { key: 'cssCustomizer', label: 'CSS / color customizer' },
  { key: 'courierApi', label: 'Basic courier integration' },
  { key: 'courierAutoSync', label: 'Courier API auto-sync' },
  { key: 'metaPixels', label: 'Meta Pixel & TikTok' },
  { key: 'googleAnalytics', label: 'Google Analytics 4' },
  { key: 'aiCaption', label: 'AI caption writer' },
  { key: 'aiContent', label: 'Full AI content suite' },
  { key: 'removeBg', label: 'AI image cleanup' },
  { key: 'aiCopilot', label: 'AI store copilot' },
  { key: 'whatsappRecovery', label: 'WhatsApp cart recovery' },
  { key: 'emailSupport', label: 'Email support' },
  { key: 'phoneSupport', label: 'Phone support' },
  { key: 'prioritySupport', label: 'Priority 24/7 VIP support' },
];

export default {
  resolvePlanPricing,
  sortPlansByTier,
  monthlyPriceOf,
  featureFlagsOf,
  derivePlanFeatures,
  productLimitOf,
  productLimitLabel,
  FEATURE_FLAG_LABELS,
  CYCLE_DURATION_DAYS,
  DEFAULT_ANNUAL_DISCOUNT_PERCENT,
};