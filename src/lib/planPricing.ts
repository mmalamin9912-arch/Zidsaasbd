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

/** Flags applied to a plan row that carries no feature flags of its own. */
export const NO_FEATURE_FLAGS: PlanFeatureFlags = {
  premiumThemes: false,
  customDomain: false,
  aiTools: false,
  metaPixels: false,
  whatsappRecovery: false,
  courierApi: false,
  removeBg: false,
  prioritySupport: false,
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
  return { ...NO_FEATURE_FLAGS, ...(plan.featureFlags || {}) };
}

/**
 * The human-readable bullet list a plan card renders.
 *
 * Derived from the STRUCTURED flags, not from the admin's `features` prose, so
 * what the card claims is exactly what the flag says. The admin's own text is
 * still appended afterwards — it is the part they actually wrote, and it may
 * mention things the flag set does not model.
 */
export function derivePlanFeatures(plan: SubscriptionPlan): string[] {
  const flags = featureFlagsOf(plan);
  const derived = [productLimitLabel(plan)];

  if (flags.premiumThemes) derived.push('Premium themes');
  else derived.push('Standard themes');

  if (flags.customDomain) derived.push('Custom domain');
  if (flags.aiTools) derived.push('AI tools unlocked');
  if (flags.metaPixels) derived.push('Meta & TikTok pixels');
  if (flags.whatsappRecovery) derived.push('WhatsApp cart recovery');
  if (flags.courierApi) derived.push('Courier API integrations');
  if (flags.removeBg) derived.push('AI background remover');
  derived.push(flags.prioritySupport ? 'Priority support' : 'Standard support');

  return derived;
}

/**
 * Ordered flag list for the Super Admin tier editor. Defined once here so the
 * admin UI, `derivePlanFeatures` and the entitlement gate all iterate the same
 * set — a flag shown in the editor can never be missing from the card text.
 */
export const FEATURE_FLAG_LABELS: Array<{ key: keyof PlanFeatureFlags; label: string }> = [
  { key: 'premiumThemes', label: 'Premium themes' },
  { key: 'customDomain', label: 'Custom domain' },
  { key: 'aiTools', label: 'AI tools' },
  { key: 'metaPixels', label: 'Meta & TikTok pixels' },
  { key: 'whatsappRecovery', label: 'WhatsApp recovery' },
  { key: 'courierApi', label: 'Courier API' },
  { key: 'removeBg', label: 'Background remover' },
  { key: 'prioritySupport', label: 'Priority support' },
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