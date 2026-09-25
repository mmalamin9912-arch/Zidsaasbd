/**
 * Safe LocalStorage Utility
 * Protects against QuotaExceededError and prevents storing large Base64 blobs.
 *
 * Every write goes through `safeSetItem`, which NEVER throws: a QuotaExceededError
 * (or any other StorageError) is caught, obsolete bulky caches are purged, and the
 * write degrades gracefully to a lightweight payload (or is skipped entirely).
 */

// Hard ceiling per item. The browser quota is ~5MB; we keep a conservative head
// room so that multiple writes cannot collectively blow the quota and freeze the
// app with an unhandled QuotaExceededError.
const MAX_ITEM_BYTES = 1_500_000;

// Non-critical caches that can be dropped to reclaim space when the quota is tight.
const RECLAIMABLE_KEYS = [
  'ZID_AUDIT_LOGS',
  'ZID_AUDIT_LOGS_INDEX',
  'ZID_BROADCAST_HISTORY',
  'ZID_SUPPORT_TICKETS',
  'ZID_ALL_MERCHANTS',
  'ZID_ALL_MERCHANTS_INDEX',
  'zid_bd_app_integrations',
  'zid_bd_app_integrations_v2',
  'zid_store_categories_v2',
];

// Helper to sanitize and strip large Base64 data URLs from objects before caching
export function sanitizeDataForStorage(data: any, maxDepth = 4): any {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    // If it's a huge base64 data string (e.g. data:image/...), replace with a lightweight placeholder
    if (data.startsWith('data:image/') && data.length > 5000) {
      return 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=400&q=80';
    }
    // Truncate extreme length strings
    if (data.length > 50000) {
      return data.substring(0, 50000);
    }
    return data;
  }
  if (maxDepth <= 0) return data;

  if (Array.isArray(data)) {
    return data.map(item => sanitizeDataForStorage(item, maxDepth - 1));
  }

  if (typeof data === 'object') {
    const cleaned: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      // Avoid storing huge binary / image logs in localStorage
      if (key === 'rawBase64' || key === 'fullImageData') continue;
      cleaned[key] = sanitizeDataForStorage(data[key], maxDepth - 1);
    }
    return cleaned;
  }

  return data;
}

export function safeSetItem(key: string, value: any): boolean {
  try {
    const sanitized = sanitizeDataForStorage(value);
    const serialized = typeof sanitized === 'string' ? sanitized : JSON.stringify(sanitized);

    // Proactive size guard: refuse oversized payloads before they can trigger a
    // QuotaExceededError (or even attempt one). The biggest offenders were the
    // full merchant list and the full audit-log array, which must live in React
    // state now, not in localStorage.
    if (serialized.length > MAX_ITEM_BYTES) {
      console.warn(`[safeStorage] ⚠️ Skipping oversized payload for key "${key}" (${serialized.length} bytes).`);
      purgeReclaimableKeys();
      return false;
    }

    localStorage.setItem(key, serialized);
    return true;
  } catch (error: any) {
    console.warn(`[safeStorage] ⚠️ QuotaExceeded or Storage Error on key "${key}". Cleaning obsolete keys...`, error);

    purgeReclaimableKeys();

    // Try one more time with a very lean payload
    try {
      if (typeof value === 'object' && value !== null) {
        // Strip heavy subfields
        const leanObj = { ...value };
        delete leanObj.orders;
        delete leanObj.customers;
        delete leanObj.auditLogs;
        const leanSerialized = JSON.stringify(sanitizeDataForStorage(leanObj));
        if (leanSerialized.length <= MAX_ITEM_BYTES) {
          localStorage.setItem(key, leanSerialized);
          return true;
        }
      }
    } catch (secondErr) {
      console.warn(`[safeStorage] Could not write key "${key}" even after cleanup:`, secondErr);
    }
    return false;
  }
}

function purgeReclaimableKeys(): void {
  RECLAIMABLE_KEYS.forEach(k => {
    try { localStorage.removeItem(k); } catch (e) {}
  });
}

export function safeGetItem<T = any>(key: string, fallback: T = null as any): T {
  try {
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    try {
      return JSON.parse(item) as T;
    } catch {
      return item as unknown as T;
    }
  } catch (error) {
    console.warn(`[safeStorage] Error reading key "${key}":`, error);
    return fallback;
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(`[safeStorage] Error removing key "${key}":`, error);
  }
}
