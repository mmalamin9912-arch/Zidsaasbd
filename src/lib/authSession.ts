/**
 * Zid-BD Merchant Dashboard - Multi-layer Auth Session Persistence & Management
 *
 * Guarantees session persistence across browser reloads, tab switches, and hydration:
 * 1. Synchronizes session across LocalStorage, SessionStorage, and Browser Cookies.
 * 2. Communicates with server-side session validator (/api/auth/session).
 * 3. Prevents premature/eager redirects on page refresh.
 */

import { safeGetItem, safeSetItem, safeRemoveItem } from '../utils/safeStorage';
import { MerchantProfile } from '../types';

export interface AuthSession {
  email: string;
  loggedInAt: string;
  userProfile: MerchantProfile;
  token?: string;
}

const SESSION_STORAGE_KEY = 'zid_auth_session';
const COOKIE_SESSION_KEY = 'zid_auth_session';
const COOKIE_TOKEN_KEY = 'zid_session_token';

/**
 * Safely parse cookie string on client side
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const match = document.cookie.match(
      new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)')
    );
    return match ? decodeURIComponent(match[1]) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Set client cookie with SameSite=Lax and long expiration
 */
function setCookie(name: string, value: string, days = 30) {
  if (typeof document === 'undefined') return;
  try {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch (e) {
    console.warn('[authSession] Could not set cookie:', e);
  }
}

/**
 * Expire client cookie immediately
 */
function deleteCookie(name: string) {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  } catch (e) {
    console.warn('[authSession] Could not delete cookie:', e);
  }
}

/**
 * Validate that an object has the minimal structure of an AuthSession
 */
function isValidSessionObject(obj: any): obj is AuthSession {
  if (!obj || typeof obj !== 'object') return false;
  const hasEmail = typeof obj.email === 'string' && obj.email.includes('@');
  const hasProfile = obj.userProfile && typeof obj.userProfile === 'object';
  return Boolean(hasEmail || hasProfile);
}

/**
 * Read the current auth session from any persistent storage layer:
 * 1. LocalStorage (`zid_auth_session`)
 * 2. SessionStorage (`zid_auth_session`)
 * 3. Client Cookie (`zid_auth_session`)
 * 4. Fallback Store Data (`ZID_MERCHANT_STORE_DATA`)
 */
export function getStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;

  // 1. Try LocalStorage
  try {
    const rawLocal = localStorage.getItem(SESSION_STORAGE_KEY);
    if (rawLocal) {
      const parsed = JSON.parse(rawLocal);
      if (isValidSessionObject(parsed)) {
        return parsed;
      }
    }
  } catch {}

  // 2. Try SessionStorage
  try {
    const rawSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (rawSession) {
      const parsed = JSON.parse(rawSession);
      if (isValidSessionObject(parsed)) {
        // Heal LocalStorage from SessionStorage
        safeSetItem(SESSION_STORAGE_KEY, parsed);
        return parsed;
      }
    }
  } catch {}

  // 3. Try Cookie
  try {
    const rawCookie = getCookie(COOKIE_SESSION_KEY);
    if (rawCookie) {
      const parsed = JSON.parse(rawCookie);
      if (isValidSessionObject(parsed)) {
        // Heal LocalStorage and SessionStorage from Cookie
        safeSetItem(SESSION_STORAGE_KEY, parsed);
        try { sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(parsed)); } catch {}
        return parsed;
      }
    }
  } catch {}

  // 4. Try legacy / fallback store cache
  try {
    const storeData = localStorage.getItem('ZID_MERCHANT_STORE_DATA');
    if (storeData) {
      const parsed = JSON.parse(storeData);
      const merchant = parsed?.merchant;
      if (merchant && typeof merchant.email === 'string' && merchant.email.includes('@')) {
        const reconstructed: AuthSession = {
          email: merchant.email,
          loggedInAt: new Date().toISOString(),
          userProfile: merchant,
        };
        // Heal storage layers
        setStoredSession(reconstructed);
        return reconstructed;
      }
    }
  } catch {}

  return null;
}

/**
 * Durably save session across LocalStorage, SessionStorage, and Cookies
 */
export function setStoredSession(session: AuthSession): void {
  if (typeof window === 'undefined' || !session) return;

  const serialized = JSON.stringify(session);

  // 1. LocalStorage
  safeSetItem(SESSION_STORAGE_KEY, session);

  // 2. SessionStorage
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
  } catch (e) {
    console.warn('[authSession] SessionStorage write warning:', e);
  }

  // 3. Cookie (for cross-context and reload survival)
  setCookie(COOKIE_SESSION_KEY, serialized, 30);
  if (session.token) {
    setCookie(COOKIE_TOKEN_KEY, session.token, 30);
  }
}

/**
 * Remove session from all storage layers and notify server
 */
export function clearStoredSession(): void {
  if (typeof window === 'undefined') return;

  // 1. LocalStorage
  safeRemoveItem(SESSION_STORAGE_KEY);
  safeRemoveItem('zid_intended_plan');
  safeRemoveItem('zid_pre_payment');

  // 2. SessionStorage
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {}

  // 3. Cookies
  deleteCookie(COOKIE_SESSION_KEY);
  deleteCookie(COOKIE_TOKEN_KEY);

  // 4. Invalidate server-side HTTP-only cookie
  fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
}

/**
 * Validate session against server backend (/api/auth/session)
 */
export async function validateSessionWithServer(): Promise<{
  ok: boolean;
  authenticated?: boolean;
  merchant?: MerchantProfile | null;
}> {
  try {
    const local = getStoredSession();
    const token = local?.token || getCookie(COOKIE_TOKEN_KEY) || '';
    const email = local?.email || local?.userProfile?.email || '';

    const query = new URLSearchParams();
    if (token) query.set('token', token);
    if (email) query.set('email', email);

    const res = await fetch(`/api/auth/session?${query.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return { ok: false, authenticated: false };
    }

    const data = await res.json().catch(() => null);
    if (data?.ok && data?.authenticated && data?.merchant) {
      // Re-sync local storage with authoritative merchant profile
      if (local) {
        local.userProfile = { ...local.userProfile, ...data.merchant };
        setStoredSession(local);
      }
      return { ok: true, authenticated: true, merchant: data.merchant };
    }

    return { ok: false, authenticated: false };
  } catch (err) {
    console.warn('[authSession] validateSessionWithServer warning:', err);
    return { ok: false, authenticated: false };
  }
}
