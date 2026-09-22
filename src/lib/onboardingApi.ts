/**
 * Client helpers for the onboarding checklist.
 *
 * The checklist state is NOT owned by the component. It is computed on the
 * server from the store record and the `products` collection, so it survives a
 * reload and cannot disagree with the data. These helpers only fetch that
 * server-computed status and push the values a step is derived from.
 *
 * Every function is defensive: a network/parse failure resolves to null/empty
 * rather than throwing, so a render never breaks.
 */

import { safeJson } from './storeApi';

export type OnboardingStepId =
  | 'add_product'
  | 'setup_branding'
  | 'confirm_phone'
  | 'pickup_point'
  | 'payment_setup';

export interface OnboardingStep {
  id: OnboardingStepId;
  label: string;
  completed: boolean;
  /** Why the step counts as complete, or what is still missing. */
  detail: string;
  completedAt?: string | null;
}

export interface OnboardingStatus {
  ok: boolean;
  storeSlug: string;
  /** 0–100. */
  progress: number;
  completedCount: number;
  totalCount: number;
  steps: OnboardingStep[];
  sources?: string[];
  productCount?: number;
  storeMissing?: boolean;
  error?: string;
}

const EMPTY: OnboardingStatus = {
  ok: false,
  storeSlug: '',
  progress: 0,
  completedCount: 0,
  totalCount: 5,
  steps: [],
};

/**
 * Fetch the server-computed onboarding status for a store.
 *
 * Pass `persist: false` to inspect the status without letting the server stamp
 * it back onto the store document.
 */
export async function fetchOnboardingStatus(
  storeSlug: string,
  opts: { persist?: boolean; signal?: AbortSignal } = {}
): Promise<OnboardingStatus> {
  const slug = String(storeSlug || '').trim().toLowerCase();
  if (!slug) return { ...EMPTY };

  try {
    const params = new URLSearchParams({ store_slug: slug });
    if (opts.persist === false) params.set('persist', '0');
    const res = await fetch(`/api/onboarding/check-status?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: opts.signal,
    });
    const data = await safeJson<OnboardingStatus>(res);
    if (!data || !Array.isArray(data.steps)) return { ...EMPTY };
    return data;
  } catch (err: any) {
    // An aborted request (component unmounted / slug changed) is expected noise.
    if (err?.name !== 'AbortError') {
      console.warn('[onboardingApi] fetchOnboardingStatus failed:', err?.message || err);
    }
    return { ...EMPTY };
  }
}

/**
 * Persist the VALUE behind one step (phone number, logo URL, pickup address…)
 * and return the recomputed status, so the caller can update the whole widget
 * from one authoritative response.
 */
export async function completeOnboardingStep(
  storeSlug: string,
  step: OnboardingStepId,
  value?: unknown,
  extra: Record<string, unknown> = {}
): Promise<OnboardingStatus | null> {
  const slug = String(storeSlug || '').trim().toLowerCase();
  if (!slug) return null;

  try {
    const res = await fetch('/api/onboarding/complete-step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_slug: slug, step, value, ...extra }),
    });
    const data = await safeJson<OnboardingStatus & { completed?: boolean }>(res);
    // Even a `completed: false` response carries a fresh status worth applying.
    if (data && Array.isArray(data.steps)) return data;
    return null;
  } catch (err: any) {
    console.warn('[onboardingApi] completeOnboardingStep failed:', err?.message || err);
    return null;
  }
}

/** Convenience predicate for callers that only need one step. */
export function isStepComplete(status: OnboardingStatus | null, step: OnboardingStepId): boolean {
  return Boolean(status?.steps?.find((s) => s.id === step)?.completed);
}

export default { fetchOnboardingStatus, completeOnboardingStep, isStepComplete };
