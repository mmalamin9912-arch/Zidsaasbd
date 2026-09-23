/**
 * Automatic onboarding completion, derived from real store data.
 *
 * THE PROBLEM
 * -----------
 * The merchant dashboard's "Onboarding Setup Checklist" tracked its five steps
 * in React component state (`isPhoneConfirmed`, `isLocationSet`, `brandLogo`)
 * that was never persisted. Every reload reset the widget to its initial state,
 * so a merchant who had genuinely added products, a support phone, branding and
 * a pickup address still saw a low percentage and "Pending" clocks. Nothing
 * reconciled the checklist with the data actually stored against the store.
 *
 * THE MODEL
 * ---------
 * Onboarding status is COMPUTED from the store record and its products, never
 * trusted from a client flag. `deriveOnboardingStatus()` is the single place
 * that decides what "done" means, and it evaluates the same predicate against
 * BOTH providers so a store that exists in only one still reports correctly:
 *
 *   add_product     → >= 1 row in `products` for this store_slug / store_id
 *   confirm_phone   → store.phone OR store.support_contact
 *   setup_branding  → store.logo_url OR store.theme / active_theme_id
 *   pickup_point    → store.pickup_address
 *   payment_setup   → store.payment_config / adminPaymentConfig, else available
 *
 * The derived result is ALSO written back with an `onboarding` block
 * (`{ add_product: { completed, at }, … }` plus `onboarding_progress` /
 * `onboardingProgress`) so the status flag is durable in MongoDB and Supabase
 * and readable by the admin Merchant Accounts table. The write is best-effort:
 * a read must never fail because the status could not be stamped.
 *
 * Import-safe from lib/serverApp.ts and the bundled Vercel app.
 */

import { getSupabaseServerConfig } from './hybridDb.js';

/* ────────────────── optional Supabase mirror circuit-breaker ────────────────── */

/**
 * Whether the onboarding status may still be mirrored to Supabase, plus why not.
 *
 * The `stores` Supabase table only carries the `onboarding` / `onboarding_progress`
 * columns on a migrated schema. On a drifted deployment the PATCH answers HTTP 400
 * every time, and because `checkOnboardingStatus` runs on every dashboard load
 * that produced a steady stream of failing requests and warnings.
 *
 * MongoDB is authoritative for onboarding, so the mirror is a nicety. Once the
 * provider has positively rejected the write for a schema reason we stop trying,
 * which turns a per-request warning into a single informational line.
 */
const supabaseOnboardingMirror: {
  disabled: boolean;
  reason?: string;
} = { disabled: false };

export function isSupabaseOnboardingMirrorEnabled(): boolean {
  return !supabaseOnboardingMirror.disabled;
}

function disableSupabaseOnboardingMirror(reason: string | number): void {
  if (supabaseOnboardingMirror.disabled) return;
  supabaseOnboardingMirror.disabled = true;
  supabaseOnboardingMirror.reason = String(reason);
  console.warn(
    `[onboarding] Supabase onboarding mirror disabled (${reason}): the \`stores\` table is ` +
      'missing the onboarding columns. MongoDB remains the source of truth — this is informational only.'
  );
}

/**
 * Resolve once whether the mirror should be attempted. Exposed as a function so
 * the call site reads naturally and the decision stays in one place.
 */
async function shouldMirrorOnboardingToSupabase(): Promise<boolean> {
  return isSupabaseOnboardingMirrorEnabled();
}

/* ────────────────────────── step catalogue ────────────────────────── */

export type OnboardingStepId =
  | 'add_product'
  | 'setup_branding'
  | 'confirm_phone'
  | 'pickup_point'
  | 'payment_setup';

export interface OnboardingStepStatus {
  id: OnboardingStepId;
  label: string;
  /** True when the underlying store/product data satisfies the step. */
  completed: boolean;
  /** Why it counts as complete (or what is still missing) — surfaced in the UI. */
  detail: string;
  /** ISO timestamp of the write that satisfied the step, when known. */
  completedAt?: string | null;
}

export interface OnboardingStatus {
  ok: boolean;
  storeSlug: string;
  /** 0–100, rounded. */
  progress: number;
  completedCount: number;
  totalCount: number;
  steps: OnboardingStepStatus[];
  /** Which providers contributed data. */
  sources: string[];
  /** Product row count seen for this store. */
  productCount: number;
  /** True when the store record itself was never found. */
  storeMissing: boolean;
  error?: string;
}

const STEP_LABELS: Record<OnboardingStepId, string> = {
  add_product: 'Add product',
  setup_branding: 'Store Branding',
  confirm_phone: 'Support Contact',
  pickup_point: 'Pickup Point',
  payment_setup: 'Payment & Finance',
};

/* ────────────────────────── value helpers ────────────────────────── */

/** First defined, non-empty, non-blank value among `keys`. */
function firstValue(row: Record<string, any> | null | undefined, keys: string[]): any {
  if (!row) return undefined;
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    // An empty object/array is not evidence of "configured".
    if (typeof value === 'object') {
      if (Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0) continue;
      // A theme object is only meaningful when it actually configures something.
      if (key.toLowerCase().includes('theme') || key.toLowerCase().includes('config')) {
        const meaningful = Object.entries(value).some(([k, v]) => {
          if (['id', 'themeId', 'name', 'slug'].includes(k)) return false;
          return v !== undefined && v !== null && v !== '' && !(typeof v === 'object' && Object.keys(v as any).length === 0);
        });
        if (!meaningful) continue;
      }
    }
    return value;
  }
  return undefined;
}

/** Human-readable rendering of a phone/address value. */
function describe(value: any): string {
  const text = String(value ?? '').trim();
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

/* ────────────────────────── provider reads ────────────────────────── */

/**
 * Read the store record for `slug` from MongoDB, falling back to the Supabase
 * `stores` table. Returns the FIRST row that carries onboarding-relevant data so
 * a partially-populated Mongo document cannot mask a complete Supabase one.
 * NEVER throws.
 */
export async function fetchStoreForOnboarding(slug: string): Promise<{
  record: Record<string, any> | null;
  sources: string[];
  errors: string[];
}> {
  const clean = String(slug || '').trim().toLowerCase();
  const sources: string[] = [];
  const errors: string[] = [];
  if (!clean) return { record: null, sources, errors: ['No store slug supplied.'] };

  let mongoRecord: Record<string, any> | null = null;
  let supabaseRecord: Record<string, any> | null = null;

  // 1. MongoDB — authoritative operational store.
  try {
    const { getMongoUri, getMongoDb, DB_NAME } = await import('./db.js');
    if (getMongoUri()) {
      const db = await getMongoDb(DB_NAME);
      if (db) {
        const rows = await db
          .collection('stores')
          .find({
            $or: [
              { store_slug: clean },
              { storeSlug: clean },
              { store_code: clean },
              { slug: clean },
            ],
          })
          .limit(10)
          .toArray();
        if (Array.isArray(rows) && rows.length > 0) {
          // Prefer the richest document: several rows can describe one store.
          mongoRecord = rows.reduce((best: any, row: any) =>
            Object.keys(row || {}).length > Object.keys(best || {}).length ? row : best, rows[0]);
          sources.push('mongodb');
        }
      }
    }
  } catch (err: any) {
    errors.push(`MongoDB: ${err?.message || err}`);
  }

  // 2. Supabase — mirror. Consulted so a store present only there still counts.
  try {
    const { supabaseUrl, supabaseKey, isConfigured } = getSupabaseServerConfig();
    if (isConfigured) {
      const params = new URLSearchParams();
      params.set('select', '*');
      // PostgREST `or=` needs the value quoted when it can contain a dash/space.
      params.set('or', `(store_slug.eq.${clean},store_code.eq.${clean})`);
      params.set('limit', '10');
      const res = await fetch(`${supabaseUrl}/rest/v1/stores?${params.toString()}`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
      });
      if (res.ok) {
        const text = await res.text();
        const parsed = text && !text.trimStart().startsWith('<') ? JSON.parse(text) : [];
        if (Array.isArray(parsed) && parsed.length > 0) {
          supabaseRecord = parsed.reduce((best: any, row: any) =>
            Object.keys(row || {}).length > Object.keys(best || {}).length ? row : best, parsed[0]);
          sources.push('supabase');
        }
      } else {
        // A drifted/locked table is a warning, not a failure — Mongo already answered.
        errors.push(`Supabase stores responded ${res.status}`);
      }
    }
  } catch (err: any) {
    errors.push(`Supabase: ${err?.message || err}`);
  }

  // Merge so a field set in EITHER provider counts (Mongo wins per field).
  if (!mongoRecord && !supabaseRecord) return { record: null, sources, errors };
  if (!mongoRecord) return { record: supabaseRecord, sources, errors };

  const merged: Record<string, any> = { ...(supabaseRecord || {}) };
  for (const [key, value] of Object.entries(mongoRecord)) {
    if (value !== undefined && value !== null && value !== '') merged[key] = value;
  }
  return { record: merged, sources, errors };
}

/**
 * Count products belonging to `slug`. ANY store identity key matching is enough
 * (`store_slug`, `storeSlug`, `store_id`, `store_code`) — products written by
 * different code paths carry different keys.
 * NEVER throws.
 */
export async function countProductsForStore(slug: string, storeIds: string[] = []): Promise<{
  count: number;
  sources: string[];
  errors: string[];
}> {
  const clean = String(slug || '').trim().toLowerCase();
  const ids = [clean, ...storeIds.map((id) => String(id || '').trim())].filter(Boolean);
  const sources: string[] = [];
  const errors: string[] = [];
  let count = 0;

  if (ids.length === 0) return { count: 0, sources, errors: ['No store identifier supplied.'] };

  // 1. MongoDB `products` collection.
  try {
    const { getMongoUri, getMongoDb, DB_NAME } = await import('./db.js');
    if (getMongoUri()) {
      const db = await getMongoDb(DB_NAME);
      if (db) {
        const query = {
          $or: [
            { store_slug: { $in: ids } },
            { storeSlug: { $in: ids } },
            { store_id: { $in: ids } },
            { storeId: { $in: ids } },
            { store_code: { $in: ids } },
          ],
        };
        const mongoCount = await db.collection('products').countDocuments(query);
        count = Math.max(count, Number(mongoCount) || 0);
        if (mongoCount > 0) sources.push('mongodb');
      }
    }
  } catch (err: any) {
    errors.push(`MongoDB products: ${err?.message || err}`);
  }

  // 2. Supabase `products` table (count via the exact-count response header).
  if (count === 0) {
    try {
      const { supabaseUrl, supabaseKey, isConfigured } = getSupabaseServerConfig();
      if (isConfigured) {
        const params = new URLSearchParams();
        params.set('select', 'id');
        params.set('limit', '1');
        params.set('store_slug', `in.(${ids.join(',')})`);
        const res = await fetch(`${supabaseUrl}/rest/v1/products?${params.toString()}`, {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            Accept: 'application/json',
            Prefer: 'count=exact',
          },
          signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
        });
        if (res.ok) {
          const range = res.headers.get('content-range') || '';
          const total = Number(range.split('/')[1]);
          if (Number.isFinite(total)) {
            count = total;
            if (total > 0) sources.push('supabase');
          }
        } else {
          errors.push(`Supabase products responded ${res.status}`);
        }
      }
    } catch (err: any) {
      errors.push(`Supabase products: ${err?.message || err}`);
    }
  }

  return { count, sources, errors };
}

/* ────────────────────────── derivation ────────────────────────── */

/**
 * Decide each step's completion from the store record + product count.
 * Pure function — the single definition of "onboarding done" in this codebase.
 */
export function deriveOnboardingStatus(input: {
  storeSlug: string;
  store: Record<string, any> | null;
  productCount: number;
  sources?: string[];
  errors?: string[];
  /** Previously stamped flags, used only to carry `completedAt` forward. */
  previous?: Record<string, any> | null;
}): OnboardingStatus {
  const { storeSlug, store, productCount } = input;
  const previous = input.previous || {};
  const storedFlags = (previous.onboarding || previous.onboardingStatus || {}) as Record<string, any>;

  const completedAtFor = (id: OnboardingStepId): string | null => {
    const entry = storedFlags[id];
    if (entry && typeof entry === 'object' && entry.at) return String(entry.at);
    return null;
  };

  // ── the four data-derived steps + payment ──
  const phone = firstValue(store, ['phone', 'support_contact', 'supportContact', 'support_phone', 'supportPhone', 'contact_phone']);
  const logo = firstValue(store, ['logo_url', 'logoUrl', 'logo']);
  const theme = firstValue(store, ['theme', 'active_theme_id', 'activeThemeId', 'theme_config', 'themeConfig', 'branding', 'banner_url', 'bannerUrl']);
  const pickup = firstValue(store, ['pickup_address', 'pickupAddress', 'pickup_point', 'pickupLocation', 'address']);
  const payment = firstValue(store, [
    'payment_config', 'paymentConfig', 'adminPaymentConfig', 'payment_methods', 'paymentMethods',
    'payment_gateways', 'paymentGateways', 'bkash_number', 'bank_account',
  ]);

  const steps: OnboardingStepStatus[] = [
    {
      id: 'add_product',
      label: STEP_LABELS.add_product,
      completed: productCount > 0,
      detail: productCount > 0 ? `${productCount} product${productCount === 1 ? '' : 's'} listed` : 'No products yet',
      completedAt: completedAtFor('add_product'),
    },
    {
      id: 'setup_branding',
      label: STEP_LABELS.setup_branding,
      completed: Boolean(logo || theme),
      detail: logo ? `Logo set: ${describe(logo)}` : (theme ? 'Theme applied' : 'Logo and theme not set'),
      completedAt: completedAtFor('setup_branding'),
    },
    {
      id: 'confirm_phone',
      label: STEP_LABELS.confirm_phone,
      completed: Boolean(phone),
      detail: phone ? describe(phone) : 'Support phone not set',
      completedAt: completedAtFor('confirm_phone'),
    },
    {
      id: 'pickup_point',
      label: STEP_LABELS.pickup_point,
      completed: Boolean(pickup),
      detail: pickup ? describe(pickup) : 'Pickup address not set',
      completedAt: completedAtFor('pickup_point'),
    },
    {
      id: 'payment_setup',
      label: STEP_LABELS.payment_setup,
      completed: Boolean(payment) || previous.paymentSetupCompleted === true,
      detail: payment ? 'Payment method configured' : 'No payment method configured',
      completedAt: completedAtFor('payment_setup'),
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const totalCount = steps.length;

  return {
    ok: true,
    storeSlug,
    progress: Math.round((completedCount / totalCount) * 100),
    completedCount,
    totalCount,
    steps,
    sources: [...new Set(input.sources || [])],
    productCount,
    storeMissing: !store,
    error: (input.errors || []).filter(Boolean).join(' | ') || undefined,
  };
}

/**
 * Stamp the derived status back onto the `stores` document so the flag is
 * durable (`onboarding.<step>.completed = true`) and the admin table can read a
 * plain `onboarding_progress` number. Best-effort in both providers.
 */
export async function stampOnboardingStatus(
  slug: string,
  status: OnboardingStatus,
  opts: { store?: Record<string, any> | null } = {}
): Promise<{ ok: boolean; sources: string[]; error?: string }> {
  const clean = String(slug || '').trim().toLowerCase();
  if (!clean) return { ok: false, sources: [], error: 'No store slug supplied.' };

  const sources: string[] = [];
  const now = new Date().toISOString();

  // Build `onboarding: { confirm_phone: { completed, at } , … }`, preserving the
  // timestamp of the write that FIRST satisfied each step.
  const onboarding: Record<string, any> = {};
  for (const step of status.steps) {
    onboarding[step.id] = {
      completed: step.completed,
      label: step.label,
      detail: step.detail,
      at: step.completed ? (step.completedAt || now) : null,
    };
  }

  const flags: Record<string, any> = {
    onboarding,
    onboardingStatus: onboarding,
    onboarding_progress: status.progress,
    onboardingProgress: status.progress,
    onboarding_completed: status.completedCount === status.totalCount,
    onboardingCompleted: status.completedCount === status.totalCount,
    onboarding_updated_at: now,
    updated_at: now,
  };

  // 1. MongoDB — primary.
  try {
    const { getMongoUri, getMongoDb, DB_NAME } = await import('./db.js');
    if (getMongoUri()) {
      const db = await getMongoDb(DB_NAME);
      if (db) {
        // Match every identity a store document may carry. A store created during
        // signup is often keyed by `email` rather than a slug, and matching only
        // slug-shaped columns meant the stamp silently hit nothing and the
        // checklist could never show as complete.
        const or: Record<string, any>[] = [
          { store_slug: clean },
          { storeSlug: clean },
          { store_code: clean },
          { slug: clean },
        ];
        const storeEmail = String(opts.store?.email || '').trim().toLowerCase();
        const storeId = String(opts.store?.id || opts.store?.store_id || '').trim();
        if (storeEmail) or.push({ email: storeEmail }, { merchant_email: storeEmail });
        if (storeId) or.push({ store_id: storeId }, { id: storeId });

        const res = await db.collection('stores').updateOne({ $or: or }, { $set: flags });
        if (res.matchedCount > 0 || res.modifiedCount > 0) sources.push('mongodb');
        else console.warn('[onboarding] status stamp matched no store document:', { clean, storeEmail, storeId });
      }
    }
  } catch (err: any) {
    console.warn('[onboarding] MongoDB status stamp warning:', err?.message || err);
  }

  // 2. Supabase — optional mirror, restricted to columns the `stores` table has.
  //
  // WHY THIS IS GUARDED RATHER THAN ALWAYS ATTEMPTED
  // ------------------------------------------------
  // `onboarding` is a JSONB column that only exists on a migrated `stores` table.
  // On a drifted schema this PATCH answers HTTP 400 on EVERY call — and because
  // it fires from check-status, that meant one guaranteed-failing request per
  // dashboard load, which is what made the logs noisy. MongoDB is authoritative,
  // so the mirror is a bonus: we attempt it once, remember the outcome, and skip
  // it afterwards instead of repeating a known-doomed request.
  const supabaseMirrorEnabled = await shouldMirrorOnboardingToSupabase();
  if (supabaseMirrorEnabled) {
    try {
      const { supabaseUrl, supabaseKey, isConfigured } = getSupabaseServerConfig();
      if (isConfigured) {
        const res = await fetch(`${supabaseUrl}/rest/v1/stores?store_slug=eq.${encodeURIComponent(clean)}`, {
          method: 'PATCH',
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            onboarding,
            onboarding_progress: status.progress,
            updated_at: now,
          }),
          signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
        });
        if (res.ok) {
          sources.push('supabase');
        } else {
          // 400/404 means the column or table is absent — disable the mirror so
          // this warning is emitted ONCE per process rather than per request.
          if (res.status === 400 || res.status === 404) {
            disableSupabaseOnboardingMirror(res.status);
          } else {
            console.warn('[onboarding] Supabase status stamp warning:', res.status);
          }
        }
      }
    } catch (err: any) {
      const message = err?.message || String(err);
      // A timeout/network error is transient; only a schema rejection is sticky.
      if (/timeout|abort/i.test(message)) {
        console.warn('[onboarding] Supabase status stamp timed out; MongoDB holds the status.');
      } else {
        console.warn('[onboarding] Supabase status stamp warning:', message);
      }
    }
  }

  return { ok: sources.length > 0, sources, error: sources.length ? undefined : 'Could not stamp the onboarding status in any provider.' };
}

/* ────────────────────────── public entry point ────────────────────────── */

/**
 * Compute the onboarding status for a store, and stamp it back by default.
 *
 * This is what `/api/onboarding/check-status` calls on every dashboard load, so
 * the widget reflects stored data rather than transient component state.
 */
export async function checkOnboardingStatus(
  slug: string,
  opts: { persist?: boolean } = {}
): Promise<OnboardingStatus> {
  const clean = String(slug || '').trim().toLowerCase();
  if (!clean) {
    return {
      ok: false,
      storeSlug: '',
      progress: 0,
      completedCount: 0,
      totalCount: 5,
      steps: [],
      sources: [],
      productCount: 0,
      storeMissing: true,
      error: 'A store slug (`slug` or `store_slug`) is required.',
    };
  }

  const { record, sources, errors } = await fetchStoreForOnboarding(clean);

  const storeIds = record
    ? [record.id, record.store_id, record.storeId, record.store_code, record.storeCode]
        .map((v) => String(v || '').trim())
        .filter(Boolean)
    : [];
  const productResult = await countProductsForStore(clean, storeIds);

  const status = deriveOnboardingStatus({
    storeSlug: clean,
    store: record,
    productCount: productResult.count,
    sources: [...sources, ...productResult.sources],
    errors: [...errors, ...productResult.errors],
    previous: record,
  });

  if (opts.persist !== false && record) {
    await stampOnboardingStatus(clean, status, { store: record });
  }

  return status;
}

/**
 * Mark ONE step complete by persisting the underlying field the step is derived
 * from (never a bare boolean), so the flag and the data can never disagree.
 *
 * The caller supplies the real value (e.g. the phone number); the step's status
 * is then recomputed from the store and stamped.
 */
export const STEP_FIELD_MAP: Record<OnboardingStepId, string[]> = {
  // product completion is derived from the products collection, not a store field.
  add_product: [],
  setup_branding: ['logo_url', 'logoUrl'],
  confirm_phone: ['phone', 'support_contact'],
  pickup_point: ['pickup_address'],
  payment_setup: ['payment_config'],
};

/** Every step id this module understands, for request validation. */
export const ONBOARDING_STEP_IDS: OnboardingStepId[] = [
  'add_product',
  'setup_branding',
  'confirm_phone',
  'pickup_point',
  'payment_setup',
];

export default {
  checkOnboardingStatus,
  deriveOnboardingStatus,
  fetchStoreForOnboarding,
  countProductsForStore,
  stampOnboardingStatus,
  STEP_FIELD_MAP,
  ONBOARDING_STEP_IDS,
};
