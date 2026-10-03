/**
 * Merchant notification API client.
 *
 * Backs the dashboard header bell:
 *   • `fetchNotifications()` — live feed + unread count for the signed-in store.
 *   • `markNotificationRead()` — acknowledge one notification for that store.
 *   • `sendNotification()` — Super Admin broadcast (all / specific / cohort).
 *
 * Follows the house convention from src/lib/supportComms.ts: never throw, always
 * return a usable value, and warn once in the console on failure so a dead API
 * degrades to an empty bell instead of breaking the dashboard shell.
 *
 * Store identity is resolved through `resolveActiveStoreSlug()`, matching every
 * other store-scoped client (src/lib/logisticsApi.ts) — the server has no
 * session and takes the store ref from the query string.
 */

import { resolveActiveStoreSlug } from './activeStore';

export type NotificationKind = 'info' | 'warning' | 'success' | 'broadcast';

export interface MerchantNotification {
  id: string;
  targetAudience: 'all' | 'specific';
  merchantId: string;
  title: string;
  message: string;
  type: NotificationKind;
  createdAt: string;
  /** Always resolved FOR THE CALLING MERCHANT by the server. */
  isRead: boolean;
  audienceFilter: 'all' | 'free_trial' | 'paid';
  /** Optional target URL carried over from the broadcast that created this notification. */
  actionUrl?: string;
}

export interface NotificationFeed {
  notifications: MerchantNotification[];
  unreadCount: number;
  /** True when the request succeeded, so the caller can tell empty from broken. */
  ok: boolean;
  error?: string;
  /**
   * True when some notifications came from the server's in-process fallback
   * cache because no database was reachable. The rows are real and should be
   * displayed; this just lets a caller label the degraded state.
   */
  fromCache?: boolean;
  /** Server warning, e.g. 'Saved to runtime cache'. */
  warning?: string;
}

interface NotificationResponse {
  ok?: boolean;
  notifications?: MerchantNotification[];
  unreadCount?: number;
  fromCache?: boolean;
  warning?: string;
  error?: string;
}

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    // A non-JSON error body (an HTML error page, an empty 500) must resolve to
    // `null` rather than throwing, so the caller degrades to its fallback.
    if (!res || typeof res.text !== 'function') return null;
    const text = await res.text();
    if (!text || text.trimStart().startsWith('<')) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Strip the `slug:extra` form `resolveActiveStoreSlug` may hand back. */
function resolveRef(storeRef?: string | null): string {
  const slug = resolveActiveStoreSlug(storeRef);
  return String(slug || '').split(':')[0].trim();
}

/** Load the live notification feed for the signed-in store. */
export async function fetchNotifications(storeRef?: string | null): Promise<NotificationFeed> {
  const store_slug = resolveRef(storeRef);
  if (!store_slug) return { notifications: [], unreadCount: 0, ok: false, error: 'No active store.' };

  try {
    const res = await fetch(`/api/notifications?store_slug=${encodeURIComponent(store_slug)}`, {
      headers: { Accept: 'application/json' },
    });
    const data = await safeJson<NotificationResponse>(res);
    if (!data || data.ok === false) {
      return { notifications: [], unreadCount: 0, ok: false, error: data?.error || 'Could not load notifications.' };
    }
    const notifications = Array.isArray(data.notifications) ? data.notifications : [];
    return {
      notifications,
      // Trust the server's count, but fall back to counting locally so the badge
      // still works if an older server build omits the field.
      unreadCount: Number.isFinite(Number(data.unreadCount))
        ? Number(data.unreadCount)
        : notifications.filter((n) => !n.isRead).length,
      ok: true,
      fromCache: Boolean(data.fromCache),
      warning: data.warning,
    };
  } catch (err: any) {
    console.warn('[notificationsApi] fetchNotifications failed:', err?.message || err);
    return { notifications: [], unreadCount: 0, ok: false, error: 'Could not load notifications.' };
  }
}

/**
 * Mark one notification read for the signed-in store.
 *
 * The local list is NOT mutated here — the caller owns the optimistic update so
 * a failure can roll it back without a refetch.
 */
export async function markNotificationRead(
  notificationId: string,
  storeRef?: string | null
): Promise<boolean> {
  const store_slug = resolveRef(storeRef);
  const id = String(notificationId || '').trim();
  if (!store_slug || !id) return false;

  try {
    const res = await fetch(
      `/api/notifications/${encodeURIComponent(id)}/read?store_slug=${encodeURIComponent(store_slug)}`,
      { method: 'POST', headers: { Accept: 'application/json' } }
    );
    const data = await safeJson<{ ok?: boolean }>(res);
    return Boolean(data?.ok);
  } catch (err: any) {
    console.warn('[notificationsApi] markNotificationRead failed:', err?.message || err);
    return false;
  }
}

export interface SendNotificationInput {
  title: string;
  message: string;
  type?: NotificationKind;
  /** Omit for every merchant, or list store ids to target specific ones. */
  merchantIds?: string[];
  /** Narrow an audience-wide send to one plan cohort. */
  audienceFilter?: 'all' | 'free_trial' | 'paid';
  adminUser?: string;
}

/** Super Admin: send a notification to all merchants, a cohort, or specific stores. */
export async function sendNotification(input: SendNotificationInput): Promise<boolean> {
  if (!input?.title?.trim()) return false;

  try {
    const res = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        ...input,
        targetAudience: input.merchantIds?.length ? 'specific' : 'all',
      }),
    });
    const data = await safeJson<{ ok?: boolean }>(res);
    return Boolean(data?.ok);
  } catch (err: any) {
    console.warn('[notificationsApi] sendNotification failed:', err?.message || err);
    return false;
  }
}

export default {
  fetchNotifications,
  markNotificationRead,
  sendNotification,
};