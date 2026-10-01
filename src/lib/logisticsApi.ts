/**
 * Logistics persistence — delivery fees + courier API credentials.
 *
 * WHY THIS EXISTS
 * ---------------
 * Both panels in the Logistics view were component-state only: the shipping
 * fees lived on `codConfig` in localStorage and the courier keys never left
 * React state (they were not even in App's persistence dependency list). The
 * result was that a merchant saved a fee or a Steadfast key, and the storefront
 * checkout — a different tab, often a different device — kept quoting the old
 * fee and had no credentials at all.
 *
 * These helpers talk to the per-store config endpoints, which persist onto the
 * store record in MongoDB (see `storeConfigs` in lib/serverApp.ts):
 *
 *   POST /api/store/shipping-config       → shippingConfig (+ mirrored to codConfig)
 *   POST /api/store/courier-integrations  → courierConfig
 *
 * Courier secrets are redacted server-side before they are echoed back, so a
 * loaded config reports that a key is *set* without revealing it.
 */

import { resolveActiveStoreSlug } from './activeStore';

/** Delivery-fee rules as edited in Logistics → Shipping settings. */
export interface ShippingConfig {
  isEnabled: boolean;
  /** `null` means "this zone was never priced" — distinct from a deliberate ৳0. */
  insideDhakaFee: number | null;
  outsideDhakaFee: number | null;
  subDhakaFee: number | null;
  /** Cart total above which delivery is free. `null` disables the offer. */
  freeShippingThreshold: number | null;
  maxOrderLimit: number | null;
  requestAdvanceDeliveryCharge: boolean;
  advanceDeliveryChargeAmount: number | null;
  notes: string;
}

/** One courier's stored credentials/state. Secrets arrive redacted ('••'). */
export interface CourierCredentialEntry {
  isConnected: boolean;
  /** Simulate parcel booking locally instead of calling the live courier API. */
  sandboxMode?: boolean;
  apiKey: string;
  secretKey: string;
  clientId: string;
  clientSecret: string;
  storeId: string;
  pickupAddress: string;
  autoSyncOrders: boolean;
}

export interface CourierConfig {
  selectedCourierId: string;
  perCourier: Record<string, CourierCredentialEntry>;
  updatedAt?: string;
}

/** Normalise a raw response value to a fee-or-null (never NaN). */
function toNullableFee(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function normalizeShipping(raw: any): ShippingConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    isEnabled: raw.isEnabled !== false,
    insideDhakaFee: toNullableFee(raw.insideDhakaFee ?? raw.insideCityFee),
    outsideDhakaFee: toNullableFee(raw.outsideDhakaFee ?? raw.outsideCityFee),
    subDhakaFee: toNullableFee(raw.subDhakaFee),
    freeShippingThreshold: toNullableFee(raw.freeShippingThreshold),
    maxOrderLimit: toNullableFee(raw.maxOrderLimit),
    requestAdvanceDeliveryCharge: raw.requestAdvanceDeliveryCharge === true,
    advanceDeliveryChargeAmount: toNullableFee(raw.advanceDeliveryChargeAmount),
    notes: typeof raw.notes === 'string' ? raw.notes : '',
  };
}

/** Resolve the slug to write under, tolerating a missing/invalid ref. */
function resolveRef(storeRef?: string | null): string {
  const slug = resolveActiveStoreSlug(storeRef);
  return String(slug || '').split(':')[0].trim();
}

/** Persist the delivery-fee rules. Returns the server's normalised copy. */
export async function saveShippingConfig(
  storeRef: string | null | undefined,
  config: Partial<ShippingConfig> & Record<string, any>,
): Promise<ShippingConfig | null> {
  const store_slug = resolveRef(storeRef);
  if (!store_slug) return null;
  try {
    const res = await fetch('/api/store/shipping-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_slug, shippingConfig: config }),
    });
    const data = await safeJson<Record<string, any>>(res);
    if (!data || data.ok === false) {
      if (data?.error) console.warn('[logisticsApi] shipping save rejected:', data.error);
      return null;
    }
    return normalizeShipping(data.shippingConfig);
  } catch (e: any) {
    console.warn('[logisticsApi] shipping save failed:', e?.message || e);
    return null;
  }
}

/** Load the delivery-fee rules for a store. */
export async function loadShippingConfig(
  storeRef: string | null | undefined,
): Promise<ShippingConfig | null> {
  const store_slug = resolveRef(storeRef);
  if (!store_slug) return null;
  try {
    const res = await fetch(`/api/store/shipping-config?store_slug=${encodeURIComponent(store_slug)}`);
    const data = await safeJson<Record<string, any>>(res);
    if (!data || data.ok === false) return null;
    return normalizeShipping(data.shippingConfig);
  } catch (e: any) {
    console.warn('[logisticsApi] shipping load failed:', e?.message || e);
    return null;
  }
}

/** Persist courier credentials/selection. Returns the redacted stored copy. */
export async function saveCourierConfig(
  storeRef: string | null | undefined,
  config: Partial<CourierConfig>,
): Promise<CourierConfig | null> {
  const store_slug = resolveRef(storeRef);
  if (!store_slug) return null;
  try {
    const res = await fetch('/api/store/courier-integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_slug, courierConfig: config }),
    });
    const data = await safeJson<Record<string, any>>(res);
    if (!data || data.ok === false) {
      if (data?.error) console.warn('[logisticsApi] courier save rejected:', data.error);
      return null;
    }
    return (data.courierConfig || null) as CourierConfig | null;
  } catch (e: any) {
    console.warn('[logisticsApi] courier save failed:', e?.message || e);
    return null;
  }
}

/** Load the stored courier configuration (secrets redacted). */
export async function loadCourierConfig(
  storeRef: string | null | undefined,
): Promise<CourierConfig | null> {
  const store_slug = resolveRef(storeRef);
  if (!store_slug) return null;
  try {
    const res = await fetch(`/api/store/courier-integrations?store_slug=${encodeURIComponent(store_slug)}`);
    const data = await safeJson<Record<string, any>>(res);
    if (!data || data.ok === false) return null;
    return (data.courierConfig || null) as CourierConfig | null;
  } catch (e: any) {
    console.warn('[logisticsApi] courier load failed:', e?.message || e);
    return null;
  }
}

export default {
  saveShippingConfig,
  loadShippingConfig,
  saveCourierConfig,
  loadCourierConfig,
};
