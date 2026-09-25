import type { MerchantProfile, Product, ThemeConfig } from '../types';
import { safeSetItem } from '../utils/safeStorage';

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

export function readZidStoreData(storeSlug?: string): ZidStoreData {
  if (typeof window === 'undefined') return {};
  try {
    const shared = JSON.parse(window.localStorage.getItem(keyFor(storeSlug)) || '{}');
    const legacy = JSON.parse(window.localStorage.getItem(LEGACY_STORE_DATA_KEY) || '{}');
    return { ...legacy, ...shared };
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
