/**
 * Client-side API helpers for the Super Admin platform configuration.
 *
 * These wrap the Express routes that persist to Supabase-first / MongoDB-
 * fallback (see lib/platformConfig.ts). Every function is defensive: a network
 * or parse failure resolves to a null/empty result rather than throwing, so a
 * dashboard render never breaks because a config endpoint is unreachable.
 */

import type { AdminPaymentGatewayConfig, AuditLog, PlatformSecuritySettings, PlatformSettings } from '../types';

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text || text.trimStart().startsWith('<')) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** The composite platform document: gateways + platform settings + AI/automation. */
export interface PlatformConfigDocument {
  adminPaymentConfig?: Partial<AdminPaymentGatewayConfig>;
  platformSettings?: Partial<PlatformSettings>;
  automationSettings?: Record<string, any>;
  [key: string]: any;
}

export async function fetchPlatformConfig(): Promise<PlatformConfigDocument | null> {
  try {
    const res = await fetch('/api/admin/platform-config', { headers: { Accept: 'application/json' } });
    const data = await safeJson<{ ok: boolean; config: PlatformConfigDocument | null }>(res);
    return data?.config || null;
  } catch (err) {
    console.warn('[platformConfigApi] fetchPlatformConfig failed:', err);
    return null;
  }
}

/* ────────────────────────────
 * Support / Terms contacts (Sidebar modals)
 * ---------------------------------------------------------------------------
 * The Terms and Support modals render this data, and both used to be able to sit
 * on "Loading…" forever. Two independent causes, both handled below:
 *
 *   1. `fetch()` has no deadline. A server that accepts the connection and never
 *      answers leaves the promise pending, so no `.then` AND no `.catch` ever
 *      runs — a timeout is the only way out. Hence `AbortSignal`.
 *   2. Even with the fallback values, the modal must never depend on the network
 *      to leave its loading state, so `resolveSupportConfig` ALWAYS returns a
 *      complete, displayable object.
 */

/** Contact + legal copy shown in the Terms and Support modals. */
export interface SupportContactConfig {
  supportPhone: string;
  supportEmail: string;
  /** wa.me expects digits only; stored without the '+'. */
  whatsappNumber: string;
  /** Optional link to a full published terms document. */
  termsUrl: string;
  /**
   * The merchant guidelines authored in Super Admin → Platform Configuration →
   * Trial & Legal. EMPTY when the operator has published nothing — the modal
   * renders a "not published yet" notice instead of a hardcoded paragraph.
   */
  platformRules: string;
}

/**
 * Contact details shown when the Super Admin has not published any.
 *
 * Note what is NOT here: default legal copy. Earlier versions baked a five-clause
 * "Terms of Service" paragraph into this constant, which meant every merchant saw
 * boilerplate terms the platform operator had never written or agreed to. The
 * rules text is now sourced only from the database.
 */
export const DEFAULT_SUPPORT_CONTACT: SupportContactConfig = {
  supportPhone: '+8801844990011',
  supportEmail: 'support@zid.com',
  whatsappNumber: '8801844990011',
  termsUrl: '',
  platformRules: '',
};

const firstString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
};

/**
 * Merge a platform-config document over the default contact block.
 *
 * Never returns a partial object, so the Support modal always has something to
 * render. The contact fields fall back to the defaults; the rules text does NOT
 * — it stays empty unless the operator published it (see `DEFAULT_SUPPORT_CONTACT`).
 *
 * Several spellings are accepted because the admin form, older records and
 * hand-edited documents disagree on the key names (`platformRules` vs
 * `platform_rules` vs `termsText`).
 */
export function resolveSupportConfig(config: PlatformConfigDocument | null | undefined): SupportContactConfig {
  const settings = (config?.platformSettings || {}) as Record<string, any>;

  const supportPhone = firstString(
    settings.supportPhone,
    settings.supportContactPhone,
    settings.support_contact_phone,
    DEFAULT_SUPPORT_CONTACT.supportPhone
  );
  const supportEmail = firstString(
    settings.supportEmail,
    settings.supportContactEmail,
    settings.support_contact_email,
    DEFAULT_SUPPORT_CONTACT.supportEmail
  );

  // Derive the WhatsApp number from the support phone when it is not set
  // explicitly, so a merchant who fills in one field still gets a wa.me link.
  const whatsappNumber =
    firstString(settings.whatsappNumber, settings.whatsappContact, settings.supportWhatsapp) ||
    supportPhone.replace(/\D/g, '') ||
    DEFAULT_SUPPORT_CONTACT.whatsappNumber;

  return {
    supportPhone,
    supportEmail,
    whatsappNumber,
    termsUrl: firstString(settings.termsUrl, settings.terms_url),
    // Empty string when unpublished — the caller decides how to present that.
    platformRules: firstString(
      settings.platformRules,
      settings.platform_rules,
      settings.termsText,
      settings.termsContent,
      settings.terms_text
    ),
  };
}

/** Deadline for the support-config fetch. Comfortably under a browser's own timeout. */
const SUPPORT_CONFIG_TIMEOUT_MS = 10000;

/**
 * Load the Terms/Support contact block, always resolving.
 *
 * Unlike `fetchPlatformConfig`, this NEVER returns null and NEVER rejects: the
 * caller's loading flag is cleared in a `finally`-equivalent path no matter what,
 * which is what stops the modal spinning forever when the endpoint is slow,
 * unreachable, or returns an HTML error page.
 */
export async function fetchSupportContactConfig(
  timeoutMs: number = SUPPORT_CONFIG_TIMEOUT_MS
): Promise<SupportContactConfig> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('/api/admin/platform-config', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const data = await safeJson<{ ok: boolean; config: PlatformConfigDocument | null }>(res);
    return resolveSupportConfig(data?.config);
  } catch (err: any) {
    // An abort here means the server never answered — the fallback is the whole
    // point of this helper, so a timeout is a normal outcome, not an error.
    console.warn(
      '[platformConfigApi] fetchSupportContactConfig fell back to defaults:',
      err?.name === 'AbortError' ? 'request timed out' : err?.message || err
    );
    return { ...DEFAULT_SUPPORT_CONTACT };
  } finally {
    clearTimeout(timer);
  }
}

export async function savePlatformConfig(config: PlatformConfigDocument): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/platform-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    });
    const data = await safeJson<{ ok: boolean }>(res);
    return Boolean(data?.ok);
  } catch (err) {
    console.warn('[platformConfigApi] savePlatformConfig failed:', err);
    return false;
  }
}

export async function fetchSecuritySettings(): Promise<Partial<PlatformSecuritySettings> | null> {
  try {
    const res = await fetch('/api/admin/security-settings', { headers: { Accept: 'application/json' } });
    const data = await safeJson<{ ok: boolean; settings: Partial<PlatformSecuritySettings> | null }>(res);
    return data?.settings || null;
  } catch (err) {
    console.warn('[platformConfigApi] fetchSecuritySettings failed:', err);
    return null;
  }
}

export async function saveSecuritySettings(
  settings: Partial<PlatformSecuritySettings>,
  adminUser = 'Super Admin'
): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/security-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings, adminUser }),
    });
    const data = await safeJson<{ ok: boolean }>(res);
    return Boolean(data?.ok);
  } catch (err) {
    console.warn('[platformConfigApi] saveSecuritySettings failed:', err);
    return false;
  }
}

export async function fetchAuditLogs(limit = 500): Promise<AuditLog[]> {
  try {
    const res = await fetch(`/api/admin/audit-logs?limit=${encodeURIComponent(String(limit))}`, {
      headers: { Accept: 'application/json' },
    });
    const data = await safeJson<{ ok: boolean; logs: AuditLog[] }>(res);
    return Array.isArray(data?.logs) ? data.logs : [];
  } catch (err) {
    console.warn('[platformConfigApi] fetchAuditLogs failed:', err);
    return [];
  }
}

export async function appendAuditLog(entry: Partial<AuditLog>): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    const data = await safeJson<{ ok: boolean }>(res);
    return Boolean(data?.ok);
  } catch (err) {
    console.warn('[platformConfigApi] appendAuditLog failed:', err);
    return false;
  }
}

export async function clearAuditLogs(): Promise<boolean> {
  try {
    const res = await fetch('/api/admin/audit-logs', { method: 'DELETE' });
    const data = await safeJson<{ ok: boolean }>(res);
    return Boolean(data?.ok);
  } catch (err) {
    console.warn('[platformConfigApi] clearAuditLogs failed:', err);
    return false;
  }
}

export default {
  fetchPlatformConfig,
  savePlatformConfig,
  fetchSecuritySettings,
  saveSecuritySettings,
  fetchAuditLogs,
  appendAuditLog,
  clearAuditLogs,
  fetchSupportContactConfig,
  resolveSupportConfig,
  DEFAULT_SUPPORT_CONTACT,
};
