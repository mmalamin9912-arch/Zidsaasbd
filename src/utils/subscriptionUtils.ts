import { SubscriptionPlanId } from '../types';

/**
 * Standard free-trial length. Referenced everywhere so the header, the billing
 * page and the server can never disagree about what a "30-day trial" is.
 */
export const TRIAL_DURATION_DAYS = 30;

/**
 * Normalise any timestamp-ish value to epoch milliseconds using UTC semantics.
 *
 * Dates from MongoDB arrive as BSON `Date`, ISO strings, or `YYYY-MM-DD`
 * strings. A bare `YYYY-MM-DD` is parsed by `Date` as UTC midnight, which is the
 * only reading that gives the same answer in every browser timezone — using
 * local parsing here was what made the trial counter differ between Dhaka and a
 * machine set to another timezone.
 */
export const toUtcMs = (value?: string | number | Date | null): number => {
  if (value === undefined || value === null || value === '') return 0;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const raw = String(value).trim();
  if (!raw) return 0;

  // A date-only string is anchored to UTC midnight explicitly.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    return Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }

  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Days of free trial remaining, computed deterministically.
 *
 *   remaining = max(0, trialDays - floor((now - trialStart) / 86400000))
 *
 * This is a PURE function of two inputs — the trial start timestamp stored when
 * the account was created, and the current time. It reads no localStorage, keeps
 * no cached anchor and has no random fallback, so refreshing the page (or opening
 * it on another device) cannot change the answer.
 *
 * `floor` (not `ceil`) is deliberate: it matches the "whole days elapsed"
 * semantics the badge promises, so a trial started 29d 6h ago shows 1 day left,
 * and a trial started 29d 20h ago still shows 1 day rather than jumping to 0.
 *
 * Returns `null` when no usable start timestamp exists — the caller should then
 * fall back to whatever signed-in record it has, and should NOT invent "now",
 * which is what made the counter reset to 30 on every refresh.
 */
export const calculateTrialDaysRemaining = (
  trialStartValue?: string | number | Date | null,
  options: { now?: number; trialDays?: number } = {}
): number | null => {
  const startMs = toUtcMs(trialStartValue);
  if (!startMs) return null;

  const now = options.now ?? Date.now();
  const trialDays = options.trialDays ?? TRIAL_DURATION_DAYS;
  const elapsedDays = Math.floor((now - startMs) / (1000 * 60 * 60 * 24));
  return Math.max(0, trialDays - elapsedDays);
};

/**
 * UTC date string (`YYYY-MM-DD`) for a timestamp, so a date shown on screen does
 * not shift by a day depending on the viewer's timezone.
 */
export const toUtcDateString = (value: number | string | Date): string => {
  const ms = toUtcMs(value);
  if (!ms) return '';
  return new Date(ms).toISOString().slice(0, 10);
};

/**
 * Maps plan ID to its exact duration in days:
 * - Free Trial / 1 Month: 30 days
 * - Starter Plan / 3 Months: 90 days
 * - Pro Plan / 6 Months: 180 days
 * - Enterprise Plan / 12 Months: 365 days
 */
export const getPlanDurationInDays = (planId?: string): number => {
  if (!planId) return 30;
  const lower = planId.toLowerCase().trim();
  
  if (
    lower.includes('12m') ||
    lower.includes('12_months') ||
    lower.includes('enterprise') ||
    lower.includes('annual') ||
    lower.includes('12_month') ||
    lower.includes('year')
  ) {
    return 365;
  }
  if (
    lower.includes('6m') ||
    lower.includes('6_months') ||
    lower.includes('pro') ||
    lower.includes('6_month') ||
    lower.includes('half_year')
  ) {
    return 180;
  }
  if (
    lower.includes('3m') ||
    lower.includes('3_months') ||
    lower.includes('starter_3m') ||
    lower.includes('starter') ||
    lower.includes('3_month')
  ) {
    return 90;
  }
  if (
    lower.includes('1m') ||
    lower.includes('1_month') ||
    lower.includes('starter_1m') ||
    lower.includes('free_trial') ||
    lower.includes('trial') ||
    lower.includes('month')
  ) {
    return 30;
  }
  return 30;
};

/**
 * Returns formatted human-readable plan name
 */
export const getPlanDisplayName = (planId?: string): string => {
  if (!planId || planId === 'free_trial' || planId === 'trial') return 'Free Trial (30 Days)';
  const lower = planId.toLowerCase();
  if (lower.includes('12m') || lower.includes('enterprise')) {
    return 'Enterprise Plan (12 Months)';
  }
  if (lower.includes('6m') || lower.includes('pro')) {
    return 'Pro Plan (6 Months)';
  }
  if (lower.includes('3m') || lower.includes('starter')) {
    return 'Starter Plan (3 Months)';
  }
  if (lower.includes('1m') || lower.includes('month') || lower === 'starter_1m') {
    return '1-Month Plan';
  }
  return planId.replace(/_/g, ' ').toUpperCase();
};

/**
 * Generates absolute ISO timestamps for plan start and expiration
 * Requirement 1: plan_started_at (Timestamp) and expires_at (Timestamp = plan_started_at + duration)
 */
export const calculatePlanTimestamps = (
  planId?: string,
  startDate: Date = new Date()
): {
  plan_started_at: string;
  expires_at: string;
  expiryDate: string;
  durationDays: number;
  durationMs: number;
} => {
  const durationDays = getPlanDurationInDays(planId);
  const durationMs = durationDays * 24 * 60 * 60 * 1000;
  const startMs = startDate.getTime();
  const expiryMs = startMs + durationMs;
  const plan_started_at = new Date(startMs).toISOString();
  const expires_at = new Date(expiryMs).toISOString();
  const expiryDate = expires_at.split('T')[0];

  return {
    plan_started_at,
    expires_at,
    expiryDate,
    durationDays,
    durationMs
  };
};

/**
 * Dynamically calculates the subscription expiry date starting from today (or specified fromDate)
 * Returns date formatted as YYYY-MM-DD
 */
export const calculateSubscriptionExpiry = (
  planId?: string,
  fromDate: Date = new Date()
): { expiryDate: string; durationDays: number; plan_started_at: string; expires_at: string } => {
  const { expiryDate, durationDays, plan_started_at, expires_at } = calculatePlanTimestamps(planId, fromDate);
  return {
    expiryDate,
    durationDays,
    plan_started_at,
    expires_at
  };
};

/**
 * Offline Continuous Calculation:
 * Calculates remaining time dynamically using: Remaining Time = expires_at - Date.now()
 * Ensures countdown continues in background/offline mode seamlessly.
 */
export const calculateRemainingTimeFromExpiry = (expiresAtStr?: string) => {
  if (!expiresAtStr) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, totalDaysFloat: 0, diffMs: 0 };
  }
  const expiryTime = new Date(expiresAtStr).getTime();
  if (isNaN(expiryTime)) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, totalDaysFloat: 0, diffMs: 0 };
  }
  
  const nowMs = Date.now();
  const diffMs = Math.max(0, expiryTime - nowMs);
  const totalSeconds = Math.floor(diffMs / 1000);
  const totalDaysFloat = diffMs / (1000 * 60 * 60 * 24);

  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds, totalSeconds, totalDaysFloat, diffMs };
};

/**
 * Calculates remaining days dynamically from an expiry date string (YYYY-MM-DD or ISO string)
 */
export const calculateRemainingDays = (expiryDateStr?: string): number => {
  if (!expiryDateStr) return 0;
  const expiryTime = new Date(expiryDateStr).getTime();
  if (isNaN(expiryTime)) return 0;
  return Math.max(0, Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24)));
};

/**
 * Checks if merchant has an active paid subscription
 */
export const isPaidSubscriptionActive = (merchant?: { subscriptionPlan?: SubscriptionPlanId; subscriptionExpiry?: string; expires_at?: string } | null): boolean => {
  if (!merchant || !merchant.subscriptionPlan) return false;
  if (merchant.subscriptionPlan === 'free_trial' || merchant.subscriptionPlan === 'trial') return false;
  const expiry = merchant.expires_at || merchant.subscriptionExpiry;
  if (!expiry) return true; // plan assigned without explicit expiry is considered active
  return calculateRemainingDays(expiry) > 0;
};


