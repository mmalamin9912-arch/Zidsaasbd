/**
 * Shared, cached subscription-status client.
 *
 * WHY THIS EXISTS
 * ---------------
 * `App` and `Header` both need the merchant's authoritative activation state
 * (`/api/subscription/status`). They each ran their OWN 30s `setInterval`, and
 * `Header` re-ran its effect whenever `merchant.email` / `merchant.storeSlug`
 * changed — while `App` itself rewrites `merchant` on nearly every data load.
 * That produced a self-sustaining loop: fetch → `setMerchant` → effect re-runs
 * → fetch → …, which is the 80+ pending/400 rows in DevTools.
 *
 * This module collapses all of that into ONE request per store identity:
 *   • in-flight requests are shared (concurrent callers await the same promise),
 *   • a fulfilled result is cached for `CACHE_TTL_MS` and served from memory,
 *   • the background refresh is a single timer owned by the first caller, not
 *     one timer per component, and it stops once nobody is subscribed.
 *
 * Every consumer therefore renders the SAME status from the SAME read, so the
 * "Unlock" badges can no longer disagree with each other or flicker between the
 * local profile value and the MongoDB value.
 */

export interface SubscriptionStatusSnapshot {
  /** Raw, upper-cased `subscription_status` (`ACTIVE`, `PENDING`, …) or null. */
  status: string | null;
  /** Canonical plan id when the server reported one. */
  planId: string | null;
  planName: string | null;
  expiresAt: string | null;
  planStartedAt: string | null;
  durationDays: number | null;
  /**
   * The anchor used for the deterministic trial countdown:
   * `trial_start_date` is authoritative, `created_at` is the fallback.
   */
  anchorIso: string | null;
  /** The raw store document, for callers that need anything else. */
  store: Record<string, any> | null;
}

const EMPTY: SubscriptionStatusSnapshot = {
  status: null,
  planId: null,
  planName: null,
  expiresAt: null,
  planStartedAt: null,
  durationDays: null,
  anchorIso: null,
  store: null,
};

/** How long a fulfilled read is served from memory before a refresh is allowed. */
const CACHE_TTL_MS = 60_000;
/** How often the shared background refresh re-reads a live subscription. */
const REFRESH_INTERVAL_MS = 120_000;

type Listener = (snapshot: SubscriptionStatusSnapshot) => void;

/** key → the last resolved snapshot. */
const cache = new Map<string, SubscriptionStatusSnapshot>();
/** key → the in-flight request, so concurrent callers share one round-trip. */
const inFlight = new Map<string, Promise<SubscriptionStatusSnapshot>>();
/** key → { snapshot, expiresAt }. */
const entries = new Map<string, { snapshot: SubscriptionStatusSnapshot; expiresAt: number }>();
/** key → listener set. */
const listeners = new Map<string, Set<Listener>>();
/** key → the shared refresh timer. */
const timers = new Map<string, ReturnType<typeof setInterval>>();

/** Build the cache key + query params for a merchant identity. */
function identityOf(email?: string | null, storeSlug?: string | null) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const slug = String(storeSlug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const key = cleanEmail || slug ? `${cleanEmail}|${slug}` : '';
  return { key, cleanEmail, slug };
}

function readSnapshot(data: any): SubscriptionStatusSnapshot {
  const store = (data?.store && typeof data.store === 'object' ? data.store : {}) as Record<string, any>;
  const statusRaw = data?.subscription_status ?? store.subscription_status ?? null;
  const planIdRaw = store.subscription_plan ?? data?.subscription_plan ?? null;
  const durationRaw = store.duration_days ?? data?.duration_days ?? null;
  const duration = Number(durationRaw);
  return {
    status: statusRaw ? String(statusRaw).toUpperCase() : null,
    planId: planIdRaw ? String(planIdRaw) : null,
    planName: store.plan_name ? String(store.plan_name) : null,
    expiresAt: store.expires_at ? String(store.expires_at) : null,
    planStartedAt: store.plan_started_at ? String(store.plan_started_at) : null,
    durationDays: Number.isFinite(duration) && duration > 0 ? duration : null,
    anchorIso: store.trial_start_date || store.created_at || null,
    store: Object.keys(store).length ? store : null,
  };
}

/**
 * Fetch (or reuse) the subscription status for an identity.
 *
 * Always resolves — a network failure returns the last known snapshot (or the
 * empty one) rather than throwing, so a hiccup can never reset an active Pro
 * store back to a locked state.
 */
export function fetchSubscriptionStatus(
  email?: string | null,
  storeSlug?: string | null,
  { force = false }: { force?: boolean } = {}
): Promise<SubscriptionStatusSnapshot> {
  const { key, cleanEmail, slug } = identityOf(email, storeSlug);
  if (!key) return Promise.resolve(EMPTY);

  const hit = entries.get(key);
  if (!force && hit && hit.expiresAt > Date.now()) {
    return Promise.resolve(hit.snapshot);
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const params = new URLSearchParams();
  if (cleanEmail) params.set('email', cleanEmail);
  if (slug) params.set('store_slug', slug);

  const request = (async (): Promise<SubscriptionStatusSnapshot> => {
    try {
      const res = await fetch(`/api/subscription/status?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => null);
      if (!data?.ok) return cache.get(key) || EMPTY;
      const snapshot = readSnapshot(data);
      // A successful read is cached and broadcast. A response that carries no
      // status at all is treated as "still unknown" so we never overwrite a good
      // ACTIVE value with a null that would re-lock the dashboard.
      if (snapshot.status || !cache.get(key)) {
        cache.set(key, snapshot);
        entries.set(key, { snapshot, expiresAt: Date.now() + CACHE_TTL_MS });
        emit(key, snapshot);
      }
      return cache.get(key) || snapshot;
    } catch {
      // Keep the last known value — never downgrade an active store on a hiccup.
      return cache.get(key) || EMPTY;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
}

function emit(key: string, snapshot: SubscriptionStatusSnapshot) {
  listeners.get(key)?.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (err) {
      console.warn('[subscriptionStatus] listener failed:', err);
    }
  });
}

function stopTimer(key: string) {
  const timer = timers.get(key);
  if (timer) {
    clearInterval(timer);
    timers.delete(key);
  }
}

/**
 * Subscribe to a merchant's subscription status.
 *
 * `onSnapshot` is called SYNCHRONOUSLY with the cached value (if any) before
 * any network work, so the first render already has the right state and the UI
 * does not flash a locked badge while the request is in flight.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToSubscriptionStatus(
  email: string | null | undefined,
  storeSlug: string | null | undefined,
  onSnapshot: (snapshot: SubscriptionStatusSnapshot) => void
): () => void {
  const { key } = identityOf(email, storeSlug);
  if (!key) return () => undefined;

  // Synchronous seed: paint the cached value before the first network read so
  // "Unlock" badges never render locked-then-unlocked.
  const hit = entries.get(key);
  const seeded = hit?.snapshot || cache.get(key) || EMPTY;
  onSnapshot(seeded);

  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(onSnapshot);

  // One shared timer per identity, started only once and torn down when the last
  // subscriber leaves — so N components cost 1 request, not N.
  if (!timers.has(key)) {
    const timer = setInterval(() => {
      void fetchSubscriptionStatus(email, storeSlug, { force: true });
    }, REFRESH_INTERVAL_MS);
    timers.set(key, timer);
  }

  void fetchSubscriptionStatus(email, storeSlug);

  return () => {
    const current = listeners.get(key);
    current?.delete(onSnapshot);
    if (current && current.size === 0) {
      listeners.delete(key);
      stopTimer(key);
    }
  };
}

/**
 * Force the next `fetchSubscriptionStatus` to hit the network.
 *
 * Call this after a mutation that legitimately changes the plan (an admin
 * approval, a renewal) so the new state is visible immediately.
 */
export function invalidateSubscriptionStatus(
  email?: string | null,
  storeSlug?: string | null
) {
  const { key } = identityOf(email, storeSlug);
  if (!key) return;
  entries.delete(key);
  void fetchSubscriptionStatus(email, storeSlug, { force: true });
}

/**
 * Seed the cache from a merchant profile the app already has, WITHOUT a request.
 *
 * The local profile is not authoritative for activation, but it IS enough to
 * stop the flash on first paint for the overwhelmingly common case of a store
 * that is already on a paid plan. A later authoritative read overwrites it.
 */
export function primeSubscriptionStatus(
  email: string | null | undefined,
  storeSlug: string | null | undefined,
  merchant: {
    subscriptionPlan?: string | null;
    subscription_status?: string | null;
    trial_start_date?: string | null;
    created_at?: string | null;
    plan_started_at?: string | null;
    expires_at?: string | null;
    duration_days?: number | null;
  } | null | undefined
) {
  if (!merchant) return;
  const { key } = identityOf(email, storeSlug);
  if (!key) return;

  const planId = merchant.subscriptionPlan ? String(merchant.subscriptionPlan) : null;
  const hasPaidPlan = !!planId && planId !== 'free_trial' && planId !== 'trial';
  const explicitStatus = merchant.subscription_status
    ? String(merchant.subscription_status).toUpperCase()
    : null;

  // Only prime an ACTIVE status when the profile genuinely says so. Priming a
  // paid plan without an explicit status is safe (an admin writes the plan id on
  // approval), but we must never invent ACTIVE for a `free_trial` store.
  const status = explicitStatus || (hasPaidPlan ? 'ACTIVE' : null);
  if (!status) return;

  const duration = Number(merchant.duration_days);
  const snapshot: SubscriptionStatusSnapshot = {
    status,
    planId,
    planName: null,
    expiresAt: merchant.expires_at ? String(merchant.expires_at) : null,
    planStartedAt: merchant.plan_started_at ? String(merchant.plan_started_at) : null,
    durationDays: Number.isFinite(duration) && duration > 0 ? duration : null,
    anchorIso: merchant.trial_start_date || merchant.created_at || null,
    store: null,
  };

  // Never clobber a value we already read from the server.
  if (!cache.has(key)) {
    cache.set(key, snapshot);
    entries.set(key, { snapshot, expiresAt: Date.now() + CACHE_TTL_MS });
    emit(key, snapshot);
  }
}

/**
 * Read the current snapshot for an identity WITHOUT subscribing or fetching.
 *
 * Returns the last known value, or `null` when nothing has been resolved yet.
 * This is what lets a component render the correct state on its very first
 * paint (synchronously, during render) instead of showing a placeholder that
 * flips once the request resolves.
 */
export function peekSubscriptionStatus(
  email?: string | null,
  storeSlug?: string | null
): SubscriptionStatusSnapshot | null {
  const { key } = identityOf(email, storeSlug);
  if (!key) return null;
  return cache.get(key) || entries.get(key)?.snapshot || null;
}

/**
 * Is the store on a paid, active plan?
 *
 * `subscriptionPlan` is the local profile value. It is `null`/`undefined` until
 * the profile hydrates, which is exactly why a Pro store's badges used to flash
 * locked on first render. This helper answers from whichever signal is
 * available, preferring the authoritative DB status when we have it and falling
 * back to the plan id, so an approved store is never shown a paywall it has
 * already paid for.
 */
export function isProAccessGranted(
  planId: string | null | undefined,
  status: string | null | undefined
): boolean {
  if (String(status || '').toUpperCase() === 'ACTIVE') return true;
  const plan = String(planId || '').trim();
  return !!plan && plan !== 'free_trial' && plan !== 'trial';
}

export default {
  fetchSubscriptionStatus,
  subscribeToSubscriptionStatus,
  invalidateSubscriptionStatus,
  primeSubscriptionStatus,
  peekSubscriptionStatus,
  isProAccessGranted,
};
