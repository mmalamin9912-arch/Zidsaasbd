type TenantPayload = Record<string, unknown>;

/**
 * Shape of the merchant security block persisted alongside the tenant payload.
 * Everything here is written through `saveTenantSecurity` and read back with
 * `getTenantSecurity` so the Security settings tab survives a page reload.
 */
export interface TenantSecurity {
  twoFactorEnabled: boolean;
  merchantApiKey: string;
  webhookSecret: string;
  /** Rotated on every regenerate so old keys can be invalidated. */
  credentialsUpdatedAt: string;
}

/** A single logged-in device/browser for the merchant account. */
export interface TenantSession {
  id: string;
  device: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastActiveAt: string;
}

const DEFAULT_SECURITY: TenantSecurity = {
  twoFactorEnabled: false,
  merchantApiKey: '',
  webhookSecret: '',
  credentialsUpdatedAt: '',
};

const memoryStore = new Map<string, TenantPayload>();

/** In-memory session registry — KV-backed when KV_REST_API_* is configured. */
const memorySessions = new Map<string, TenantSession[]>

/**
 * Cryptographically-strong secret generator. Falls back to a Math.random loop
 * only when `globalThis.crypto` is unavailable (very old Node runtimes).
 * The merchant API key is prefixed `sk_live_` and the webhook secret `whsec_`
 * so they are recognisable, and both are 32+ characters of entropy.
 */
function randomToken(prefix: string): string {
  const bytes = new Uint8Array(24);
  try {
    globalThis.crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}${hex}`;
}

export function generateMerchantApiKey(): string {
  return randomToken('sk_live_');
}

export function generateWebhookSecret(): string {
  return randomToken('whsec_');
}
const kvUrl = process.env.KV_REST_API_URL;
const kvToken = process.env.KV_REST_API_TOKEN;
const keyFor = (storeSlug: string) => `zid:tenant:${storeSlug}`;

async function kv(command: string, ...args: string[]) {
  if (!kvUrl || !kvToken) return null;
  const response = await fetch(`${kvUrl}/${command}/${args.map(encodeURIComponent).join('/')}`, { headers: { Authorization: `Bearer ${kvToken}` } });
  if (!response.ok) throw new Error(`KV ${command} failed`);
  return response.json() as Promise<{ result: unknown }>;
}

export async function getTenant(storeSlug: string): Promise<TenantPayload | null> {
  try {
    const result = await kv('get', keyFor(storeSlug));
    if (typeof result?.result === 'string') return JSON.parse(result.result) as TenantPayload;
  } catch { /* use the development fallback below */ }
  return memoryStore.get(storeSlug) || null;
}

export async function saveTenant(storeSlug: string, payload: TenantPayload) {
  memoryStore.set(storeSlug, payload);
  try { await kv('set', keyFor(storeSlug), JSON.stringify(payload)); } catch { /* local fallback remains available */ }
  return payload;
}

// ---------------------------------------------------------------------------
// Security settings (2FA + API credentials)
// ---------------------------------------------------------------------------

/**
 * Read the merged security block for a store. Cookie-free, never throws —
 * an unknown store gets auto-generated credentials so the UI always has
 * something real to display instead of the old hard-coded fake keys.
 */
export async function getTenantSecurity(storeSlug: string): Promise<TenantSecurity> {
  const tenant = await getTenant(storeSlug);
  const stored = (tenant?.security || {}) as Partial<TenantSecurity>;

  return {
    twoFactorEnabled: stored.twoFactorEnabled === true,
    merchantApiKey: typeof stored.merchantApiKey === 'string' && stored.merchantApiKey
      ? stored.merchantApiKey
      : generateMerchantApiKey(),
    webhookSecret: typeof stored.webhookSecret === 'string' && stored.webhookSecret
      ? stored.webhookSecret
      : generateWebhookSecret(),
    credentialsUpdatedAt: typeof stored.credentialsUpdatedAt === 'string' ? stored.credentialsUpdatedAt : '',
  };
}

/**
 * Persist a partial security patch onto the tenant payload without clobbering
 * the rest of the tenant document (products, themes, merchant, ...).
 */
export async function saveTenantSecurity(
  storeSlug: string,
  patch: Partial<TenantSecurity>,
): Promise<TenantSecurity> {
  const tenant = (await getTenant(storeSlug)) || {};
  const current = await getTenantSecurity(storeSlug);
  const next: TenantSecurity = {
    ...current,
    ...patch,
    credentialsUpdatedAt: new Date().toISOString(),
  };

  await saveTenant(storeSlug, { ...tenant, security: next });
  return next;
}

// ---------------------------------------------------------------------------
// Active sessions registry
// ---------------------------------------------------------------------------

function sessionsKeyFor(storeSlug: string) {
  return `zid:sessions:${storeSlug}`;
}

async function readSessions(storeSlug: string): Promise<TenantSession[]> {
  try {
    const result = await kv('get', sessionsKeyFor(storeSlug));
    if (typeof result?.result === 'string') {
      const parsed = JSON.parse(result.result);
      if (Array.isArray(parsed)) return parsed as TenantSession[];
    }
  } catch { /* fall through to the in-memory registry */ }
  return memorySessions.get(storeSlug) || [];
}

async function writeSessions(storeSlug: string, sessions: TenantSession[]) {
  memorySessions.set(storeSlug, sessions);
  try { await kv('set', sessionsKeyFor(storeSlug), JSON.stringify(sessions)); } catch { /* memory fallback */ }
  return sessions;
}

/**
 * Register (or refresh) the calling device as an active session. Returns the
 * full session list so the UI can render every logged-in device.
 */
export async function registerTenantSession(
  storeSlug: string,
  device: { id?: string; device?: string; ip?: string; userAgent?: string },
): Promise<TenantSession[]> {
  if (!storeSlug) return [];

  const now = new Date().toISOString();
  const id = device.id || randomToken('sess_');
  const existing = await readSessions(storeSlug);

  const session: TenantSession = {
    id,
    device: device.device || 'Unknown device',
    ip: device.ip || 'Unknown',
    userAgent: device.userAgent || '',
    createdAt: existing.find((s) => s.id === id)?.createdAt || now,
    lastActiveAt: now,
  };

  const next = [session, ...existing.filter((s) => s.id !== id)].slice(0, 20);
  return writeSessions(storeSlug, next);
}

/** All active sessions for a store, newest activity first. */
export async function getTenantSessions(storeSlug: string): Promise<TenantSession[]> {
  const sessions = await readSessions(storeSlug);
  return [...sessions].sort((a, b) => String(b.lastActiveAt).localeCompare(String(a.lastActiveAt)));
}

/**
 * Revoke every session except the caller's own. `keepSessionId` is optional —
 * when omitted EVERY session is revoked (full sign-out on all devices).
 * Returns `{ revoked, sessions }` with the remaining registry.
 */
export async function revokeOtherTenantSessions(
  storeSlug: string,
  keepSessionId?: string,
): Promise<{ revoked: number; sessions: TenantSession[] }> {
  const existing = await readSessions(storeSlug);
  const kept = keepSessionId ? existing.filter((s) => s.id === keepSessionId) : [];
  const revoked = existing.length - kept.length;
  const sessions = await writeSessions(storeSlug, kept);
  return { revoked, sessions };
}

export function publicTenant(tenant: TenantPayload | null) {
  if (!tenant) return null;
  const mobileBanking = Array.isArray(tenant.mobileBanking)
    ? tenant.mobileBanking.map((item) => {
        const { merchantApiKey, ...publicMethod } = item as Record<string, unknown>;
        return publicMethod;
      })
    : [];
  return {
    merchant: tenant.merchant || null,
    products: Array.isArray(tenant.products) ? tenant.products : [],
    categories: Array.isArray(tenant.categories) ? tenant.categories : [],
    themes: Array.isArray(tenant.themes) ? tenant.themes : [],
    themeCustomization: tenant.themeCustomization || {},
    mobileBanking,
    bankAccounts: Array.isArray(tenant.bankAccounts) ? tenant.bankAccounts : [],
    codConfig: tenant.codConfig || null,
  };
}
