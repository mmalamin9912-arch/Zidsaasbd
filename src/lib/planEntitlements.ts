// =============================================================================
// Dynamic feature entitlements — what the merchant's ACTIVE plan actually grants.
// -----------------------------------------------------------------------------
// WHY THIS EXISTS
//   Until now every "Pro feature" lock in the dashboard was hardcoded to a plan
//   ID (`isGrowthTierPlan(merchant.subscriptionPlan)`, `plan !== 'pro_6m'`, …).
//   That meant the "FEATURE ACCESS TIERS" toggles in the Super Admin plan
//   manager were cosmetic: an admin could switch OFF Meta Pixel for the Growth
//   plan, save it to MongoDB, and Growth merchants kept the tool.
//
//   This module is the ONE place that answers "may this merchant use this
//   capability?". It resolves the merchant's plan from the live catalogue
//   (the same rows `/api/plans` serves and the Super Admin edits) and reads that
//   row's `featureFlags`. Turning a toggle off therefore locks the tool on the
//   next catalogue load, with no redeploy.
//
//   Gates should call `useEntitlements()` and ask for a capability key. They
//   must NOT compare plan IDs directly — a tier change is a data edit, and an
//   id comparison silently inverts its meaning when the catalogue is rebuilt.
//
//   FAIL-CLOSED BY DESIGN
//   An unrecognised plan id resolves to NO capabilities rather than all of them.
//   Handing a merchant every paid tool because the catalogue failed to load is
//   a far worse failure than showing an upgrade prompt.
// =============================================================================

import { useMemo, useSyncExternalStore } from 'react';
import type { PlanFeatureFlags, SubscriptionPlan } from '../types';
import {
  NO_FEATURE_FLAGS,
  featureFlagsOf,
  isFreeTierPlan,
  isGrowthTierPlan,
  productLimitOf,
} from './planPricing';
import { subscriptionPlans } from '../data/initialData';

/** Every capability an admin can toggle. */
export type PlanCapability = keyof PlanFeatureFlags;

/**
 * Retired plan ids → the catalogue id that now carries that tier.
 *
 * Merchants subscribed before the catalogue was rebuilt keep the tier they paid
 * for: a `pro_6m` subscriber resolves to `growth_plan` and keeps Pro
 * entitlements, instead of silently dropping to nothing because their id is no
 * longer in the catalogue.
 */
const LEGACY_PLAN_ALIASES: Record<string, string> = {
  pro_6m: 'growth_plan',
  enterprise_12m: 'growth_plan',
  growth: 'growth_plan',
  pro: 'growth_plan',
  enterprise: 'growth_plan',
  starter_3m: 'starter_plan',
  starter_1m: 'starter_plan',
  rise: 'starter_plan',
  trial: 'free_trial',
  free: 'free_trial',
};

export interface Entitlements {
  /** The catalogue row backing these entitlements, when one was found. */
  plan: SubscriptionPlan | null;
  /** Plan id the entitlements were resolved from (after alias mapping). */
  resolvedPlanId: string;
  /** Full flag set; every key is present and boolean. */
  flags: PlanFeatureFlags;
  /** True when a matching catalogue row was found. */
  isKnownPlan: boolean;
  /** May this merchant use the given capability? */
  can: (capability: PlanCapability) => boolean;
  /** Product cap for the tier; 0 means unlimited. */
  productLimit: number;
  /** True when the plan is the free trial. */
  isFreeTrial: boolean;
  /** True when the plan is the top (Growth / Pro) tier. */
  isGrowthTier: boolean;
}

const denyAll = (): Entitlements => ({
  plan: null,
  resolvedPlanId: '',
  flags: { ...NO_FEATURE_FLAGS },
  isKnownPlan: false,
  can: () => false,
  productLimit: 0,
  isFreeTrial: false,
  isGrowthTier: false,
});

/**
 * Find the catalogue row for a plan id.
 *
 * Lookup order: live catalogue → bundled seed (so a failed `/api/plans` request
 * still resolves correctly) → alias mapping for a retired id.
 */
export function resolveActivePlan(
  planId: string | null | undefined,
  plans: SubscriptionPlan[] | null | undefined
): SubscriptionPlan | null {
  const key = String(planId ?? '').trim().toLowerCase();
  if (!key) return null;

  const search = (list: SubscriptionPlan[] | null | undefined) =>
    (list || []).find((p) => String(p?.id || '').trim().toLowerCase() === key) || null;

  const direct = search(plans) || search(subscriptionPlans);
  if (direct) return direct;

  const alias = LEGACY_PLAN_ALIASES[key];
  if (alias) return search(plans) || search(subscriptionPlans) || null;

  return null;
}

/** Resolve the entitlement set for a plan id against a catalogue. */
export function entitlementsFor(
  planId: string | null | undefined,
  plans: SubscriptionPlan[] | null | undefined
): Entitlements {
  const rawKey = String(planId ?? '').trim().toLowerCase();
  if (!rawKey) return denyAll();

  const plan = resolveActivePlan(rawKey, plans);
  if (!plan) {
    // Fail closed, but keep the cheap tier booleans honest so UI that only asks
    // "is this the top tier?" still behaves correctly on an unknown id.
    return {
      ...denyAll(),
      resolvedPlanId: LEGACY_PLAN_ALIASES[rawKey] || rawKey,
      isFreeTrial: isFreeTierPlan(rawKey),
      isGrowthTier: isGrowthTierPlan(rawKey),
    };
  }

  const flags = featureFlagsOf(plan);
  return {
    plan,
    resolvedPlanId: String(plan.id).toLowerCase(),
    flags,
    isKnownPlan: true,
    can: (capability: PlanCapability) => flags[capability] === true,
    productLimit: productLimitOf(plan),
    isFreeTrial: isFreeTierPlan(plan.id),
    isGrowthTier: isGrowthTierPlan(plan.id),
  };
}

// -----------------------------------------------------------------------------
// Store — lets any view read the active plan without prop drilling from App.
// -----------------------------------------------------------------------------

type State = {
  planId: string | null;
  plans: SubscriptionPlan[];
};

let state: State = { planId: null, plans: [] };
const listeners = new Set<() => void>();

/** Called by App whenever the catalogue or the merchant's plan changes. */
export function primeEntitlements(next: Partial<State>): void {
  const planId = next.planId !== undefined ? next.planId : state.planId;
  const plans = next.plans !== undefined ? next.plans : state.plans;
  if (planId === state.planId && plans === state.plans) return;
  state = { planId, plans };
  listeners.forEach((fn) => fn());
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

const getSnapshot = () => state;

const NO_PLAN: Entitlements = denyAll();

/**
 * Read the current merchant's entitlements.
 *
 * ```ts
 * const { can } = useEntitlements();
 * if (!can('metaPixels')) showUpgradePrompt();
 * ```
 *
 * Memoised on the two inputs so `can` stays referentially stable and safe to
 * use inside `useEffect` / `useCallback` dependency arrays.
 */
export function useEntitlements(): Entitlements {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => (s.planId ? entitlementsFor(s.planId, s.plans) : NO_PLAN), [s.planId, s.plans]);
}

export default {
  entitlementsFor,
  resolveActivePlan,
  primeEntitlements,
  useEntitlements,
};