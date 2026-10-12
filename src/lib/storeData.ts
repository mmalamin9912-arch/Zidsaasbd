import type { MerchantProfile, Product, ThemeConfig } from '../types';
import { safeSetItem } from '../utils/safeStorage';
// Force-purge legacy Unsplash demo rows out of the cached theme config so the
// localStorage copy can never resurface them (lib/galleryDefaults.ts).
import { sanitizeStoredThemeConfig } from '../../lib/galleryDefaults';

/** One browser-wide source of truth for the merchant editor and storefront. */
export const ZID_STORE_DATA_KEY = 'zid_store_data';
export const ZID_STORE_DATA_CHANGED = 'zid-store-data-changed';
const LEGACY_STORE_DATA_KEY = 'ZID_MERCHANT_STORE_DATA';

export interface ZidStoreData {
  merchant?: MerchantProfile;
  products?: Product[];
  themes?: ThemeConfig[];
  categories?: unknown[];
  themeCustomization?: Record<string, unknown>;
  [key: string]: unknown;
}

const keyFor = (storeSlug?: string) => storeSlug ? `${ZID_STORE_DATA_KEY}:${storeSlug}` : ZID_STORE_DATA_KEY;

/**
 * Strip legacy Unsplash demo gallery rows from the cached payload.
 *
 * The cache is read on every load, so this is the localStorage half of the
 * force-purge: a stale `zid_store_data` / `ZID_MERCHANT_STORE_DATA` entry can
 * never hand the theme editor or storefront the old demo images again, and the
 * next `writeZidStoreData` persists the cleaned shape back.
 */
function purgeLegacyGallery<T extends ZidStoreData>(data: T): T {
  const next = { ...data };
  const merchant = next.merchant as MerchantProfile | undefined;
  if (merchant && typeof merchant === 'object') {
    const cfg = sanitizeStoredThemeConfig((merchant as any).themeConfig ?? (merchant as any).theme_config);
    if (cfg) {
      next.merchant = { ...merchant, themeConfig: cfg, theme_config: cfg } as MerchantProfile;
    }
  }
  if (next.themeCustomization && typeof next.themeCustomization === 'object') {
    const cfg = sanitizeStoredThemeConfig(next.themeCustomization);
    if (cfg) next.themeCustomization = cfg;
  }
  return next;
}

export function readZidStoreData(storeSlug?: string): ZidStoreData {
  if (typeof window === 'undefined') return {};
  try {
    const shared = JSON.parse(window.localStorage.getItem(keyFor(storeSlug)) || '{}');
    const legacy = JSON.parse(window.localStorage.getItem(LEGACY_STORE_DATA_KEY) || '{}');
    return purgeLegacyGallery({ ...legacy, ...shared });
  } catch {
    return {};
  }
}

export function writeZidStoreData(update: Partial<ZidStoreData>, storeSlug?: string): ZidStoreData {
  const next = { ...readZidStoreData(storeSlug), ...update };
  if (typeof window === 'undefined') return next;
  safeSetItem(keyFor(storeSlug), next);
  // CustomEvent notifies the current tab; the storage event handles other tabs.
  window.dispatchEvent(new CustomEvent(ZID_STORE_DATA_CHANGED, { detail: { storeSlug, data: next } }));
  return next;
}

export function subscribeToZidStoreData(listener: (data: ZidStoreData) => void, storeSlug?: string) {
  if (typeof window === 'undefined') return () => undefined;
  const onChange = (event: Event) => {
    const detail = (event as CustomEvent<{ storeSlug?: string; data?: ZidStoreData }>).detail;
    if (detail?.storeSlug === storeSlug) listener(detail.data || readZidStoreData(storeSlug));
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === keyFor(storeSlug) || (!storeSlug && event.key === LEGACY_STORE_DATA_KEY)) listener(readZidStoreData(storeSlug));
  };
  window.addEventListener(ZID_STORE_DATA_CHANGED, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(ZID_STORE_DATA_CHANGED, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
