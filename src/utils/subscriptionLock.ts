/**
 * Single source of truth for "is this merchant locked out?".
 *
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The dashboard, the storefront and the admin table each used to decide
 * "expired" with slightly different rules. The dashboard gate in particular
 * only fired when NO `subscriptionPlan` was set:
 *
 *     expired = !locked && !merchant.subscriptionPlan && planExpiry < now
 *
 * which meant a store on a PAID plan whose expiry had passed rendered the
 * dashboard normally — the money-losing direction to be wrong in. This module
 * centralises the rule so every surface agrees.
 *
 * RULES (any one is enough to lock):
 *   1. accountStatus === 'suspended' or isLocked/is_locked === true.
 *   2. A real expiry date (planExpiry / subscriptionExpiry / expires_at /
 *      expiresAt / trialEndsAt) strictly in the past.
 *   3. accountStatus === 'expired' (explicitly written by an admin action).
 *
 * A merchant with NO expiry data at all is NOT locked: legacy records and
 * freshly-created stores have no expiry yet, and locking those out would be a
 * regression. Only a definite past date locks.
 */

export type SubscriptionLockReason = 'suspended' | 'expired' | null;

export interface SubscriptionLockState {
  /** True when the merchant must be blocked from the dashboard/storefront. */
  isLocked: boolean;
  /** Why they are locked — drives the overlay copy. */
  reason: SubscriptionLockReason;
  /** The canonical expiry string used for display, when there is one. */
  expiryText: string;
  /** The expiry as epoch ms, or null when unknown/unparseable. */
  expiryMs: number | null;
  /** Days past expiry (>= 0), or null when not expired. */
  daysOverdue: number | null;
}

type AnyRecord = Record<string, any> | null | undefined;

/** First non-empty value among the given keys. */
function pickFirst(record: AnyRecord, keys: string[]): unknown {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/**
 * Parse an expiry value into epoch ms.
 *
 * Accepts ISO timestamps AND bare `YYYY-MM-DD` dates. A date-only value is
 * treated as END OF DAY in local time: `'2026-11-17'` must not count as
 * expired at 00:01 on the 17th, or a plan the merchant paid for that day
 * would be cut off on its last valid day.
 */
export function parseExpiryMs(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  const raw = String(value).trim();
  if (!raw) return null;

  // Date-only (YYYY-MM-DD) → end of that day, local time.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    const endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999);
    return Number.isNaN(endOfDay.getTime()) ? null : endOfDay.getTime();
  }

  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Resolve the lock state for a merchant record (either key spelling).
 * `now` is injectable so this is testable without freezing the clock.
 */
export function resolveSubscriptionLock(
  merchant: AnyRecord,
  now: number = Date.now()
): SubscriptionLockState {
  const accountStatus = String(
    pickFirst(merchant, ['accountStatus', 'account_status']) ?? ''
  ).toLowerCase();
  const isLockedFlag =
    merchant?.isLocked === true || merchant?.is_locked === true ||
    String(pickFirst(merchant, ['status']) ?? '').toLowerCase() === 'suspended';

  const expiryRaw = pickFirst(merchant, [
    'planExpiry', 'plan_expiry',
    'subscriptionExpiry', 'subscription_expiry',
    'expires_at', 'expiresAt',
    'trialEndsAt', 'trial_ends_at',
  ]);
  const expiryMs = parseExpiryMs(expiryRaw);
  const expiryText = expiryRaw === undefined || expiryRaw === null ? '' : String(expiryRaw);

  // 1. Suspension wins — an admin block is not a date question.
  if (accountStatus === 'suspended' || isLockedFlag) {
    return {
      isLocked: true,
      reason: 'suspended',
      expiryText,
      expiryMs,
      daysOverdue: expiryMs !== null && expiryMs < now
        ? Math.floor((now - expiryMs) / 86400000)
        : null,
    };
  }

  // 2. A definite past expiry.
  const pastExpiry = expiryMs !== null && expiryMs < now;
  // 3. An admin-written 'expired' status.
  const statusExpired = accountStatus === 'expired';

  if (pastExpiry || statusExpired) {
    return {
      isLocked: true,
      reason: 'expired',
      expiryText,
      expiryMs,
      daysOverdue: expiryMs !== null && expiryMs < now
        ? Math.max(0, Math.floor((now - expiryMs) / 86400000))
        : null,
    };
  }

  return { isLocked: false, reason: null, expiryText, expiryMs, daysOverdue: null };
}

/** Convenience boolean for call sites that only need the gate. */
export function isSubscriptionLocked(merchant: AnyRecord, now: number = Date.now()): boolean {
  return resolveSubscriptionLock(merchant, now).isLocked;
}
