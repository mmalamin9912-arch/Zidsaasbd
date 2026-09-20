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
};
