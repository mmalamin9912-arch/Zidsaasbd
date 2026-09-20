/**
 * Platform configuration persistence for the Super Admin portal.
 *
 * STRATEGY (matches lib/supabaseAdminCRUD.ts and lib/hybridDb.ts)
 * -------------------------------------------------------------
 * Every Super Admin configuration surface — payment gateways, platform/security
 * settings, AI controls and audit logs — is stored in BOTH providers:
 *
 *   - Supabase is written FIRST (the canonical config store).
 *   - MongoDB is the fallback AND the redundancy mirror, so a config write
 *     survives a Supabase outage and vice-versa.
 *
 * Reads query BOTH and prefer whichever has a value, so the admin UI is never
 * empty even if one database is degraded.
 *
 * All functions are best-effort and NEVER throw: callers always get a shaped
 * result (`{ ok, data, sources, error }`) so a route can answer 200 with a
 * diagnosis rather than an opaque 500.
 *
 * Import-safe from the Express bootstrap (server.ts) and the bundled Vercel app.
 */

import { getMongoDb, getMongoUri, describeMongoError, DB_NAME } from './db.js';
import { getSupabaseServerConfig, querySupabaseTable, queryMongoCollection } from './hybridDb.js';
import type { DataSource } from './hybridDb.js';

/* ────────────────────────── result envelope ────────────────────────── */

export interface ConfigResult<T = Record<string, any>> {
  ok: boolean;
  data: T | null;
  sources: DataSource[];
  error?: string;
  /** Raw provider diagnostics, useful in the admin UI. */
  diagnostics?: Record<string, any>;
}

/* ────────────────────────── Supabase REST helpers ────────────────────────── */

async function writeSupabaseRow(
  table: string,
  record: Record<string, any>,
  matchColumn = 'config_key'
): Promise<{ ok: boolean; error?: string; statusCode?: number }> {
  const { supabaseUrl, supabaseKey, isConfigured } = getSupabaseServerConfig();
  if (!isConfigured) return { ok: false, error: 'Supabase is not configured.' };

  const headers: Record<string, string> = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };

  try {
    // on_conflict makes a repeat save UPDATE the existing row instead of
    // violating the unique key on `config_key`.
    const res = await fetch(
      `${supabaseUrl}/rest/v1/${table}?on_conflict=${encodeURIComponent(matchColumn)}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(record),
        signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
      }
    );
    if (res.ok) return { ok: true, statusCode: res.status };
    return { ok: false, error: `Supabase ${table} responded ${res.status}`, statusCode: res.status };
  } catch (err: any) {
    return { ok: false, error: err?.message || `Supabase ${table} write failed` };
  }
}

async function deleteSupabaseRow(
  table: string,
  matchColumn: string,
  matchValue: string
): Promise<{ ok: boolean; error?: string }> {
  const { supabaseUrl, supabaseKey, isConfigured } = getSupabaseServerConfig();
  if (!isConfigured) return { ok: false, error: 'Supabase is not configured.' };
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/${table}?${matchColumn}=eq.${encodeURIComponent(matchValue)}`,
      {
        method: 'DELETE',
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
      }
    );
    if (res.ok) return { ok: true };
    return { ok: false, error: `Supabase ${table} DELETE responded ${res.status}` };
  } catch (err: any) {
    return { ok: false, error: err?.message || `Supabase ${table} delete failed` };
  }
}

/* ────────────────────────── MongoDB helpers ────────────────────────── */

async function safeMongoDb() {
  if (!getMongoUri()) return { db: null, error: describeMongoError(new Error('MONGODB_URI is not set')).message };
  try {
    const db = await getMongoDb(DB_NAME);
    return db ? { db } : { db: null, error: 'MongoDB connection handle unavailable.' };
  } catch (err: any) {
    return { db: null, error: describeMongoError(err).message };
  }
}

/** Upsert a single config document in Mongo, keyed by a match column. */
async function upsertMongoDoc(
  collection: string,
  record: Record<string, any>,
  matchColumn: string,
  matchValue: string
): Promise<{ ok: boolean; error?: string }> {
  const { db, error } = await safeMongoDb();
  if (!db) return { ok: false, error };

  const now = new Date().toISOString();
  const doc = { ...record, [matchColumn]: matchValue, updated_at: now, updatedAt: now };
  try {
    await db.collection(collection).updateOne(
      { [matchColumn]: matchValue },
      { $set: doc, $setOnInsert: { created_at: now, createdAt: now } },
      { upsert: true }
    );
    return { ok: true };
  } catch (err: any) {
    if (/E11000|duplicate key/i.test(String(err?.message || ''))) return { ok: true };
    return { ok: false, error: err?.message || 'MongoDB write failed' };
  }
}

/** Read one config document from Mongo by match column. */
async function readMongoDoc(collection: string, matchColumn: string, matchValue: string) {
  const result = await queryMongoCollection<Record<string, any>>(collection, { [matchColumn]: matchValue });
  return result.rows[0] || null;
}

/* ────────────────────────── generic single-doc config ────────────────────────── */

/**
 * Read a singleton config document ("platform", "security", etc.) from Supabase
 * first, then MongoDB. Supabase wins when both have a value; Mongo fills gaps.
 */
export async function readConfigDocument<T = Record<string, any>>(
  supabaseTable: string,
  mongoCollection: string,
  configKey: string
): Promise<ConfigResult<T>> {
  const sources: DataSource[] = [];

  // Supabase first.
  const supa = await querySupabaseTable<Record<string, any>>(supabaseTable, {
    filters: { config_key: `eq.${configKey}` },
    limit: 1,
  });
  const supaRow = supa.rows[0] || null;
  if (supaRow) sources.push('supabase');

  // MongoDB fallback / mirror.
  const mongoRow = await readMongoDoc(mongoCollection, 'config_key', configKey);
  if (mongoRow) sources.push('mongodb');

  const merged = mergeConfigRows(supaRow, mongoRow);

  return {
    ok: Boolean(merged),
    data: (merged as T) || null,
    sources,
    error: merged ? undefined : (supa.error || undefined),
    diagnostics: {
      supabase: { ok: !supa.error, found: Boolean(supaRow), error: supa.error },
      mongodb: { ok: Boolean(mongoRow) || !getMongoUri(), found: Boolean(mongoRow) },
    },
  };
}

/**
 * Merge a Supabase config row over a Mongo one. Supabase is authoritative per
 * field (it is written first), Mongo backfills only the fields Supabase lacks.
 */
function mergeConfigRows(
  supabaseRow: Record<string, any> | null,
  mongoRow: Record<string, any> | null
): Record<string, any> | null {
  if (!supabaseRow && !mongoRow) return null;
  if (!supabaseRow) return { ...mongoRow };
  if (!mongoRow) return { ...supabaseRow };

  const merged: Record<string, any> = { ...mongoRow };
  for (const [k, v] of Object.entries(supabaseRow)) {
    if (v !== undefined && v !== null && v !== '') merged[k] = v;
    else if (merged[k] === undefined) merged[k] = v;
  }
  return merged;
}

/**
 * Upsert a singleton config document into BOTH providers. Supabase is attempted
 * first; MongoDB is always written so the config is redundantly stored.
 */
export async function writeConfigDocument(
  supabaseTable: string,
  mongoCollection: string,
  configKey: string,
  payload: Record<string, any>
): Promise<ConfigResult> {
  const sources: DataSource[] = [];
  const now = new Date().toISOString();

  // Strip Mongo-only helper keys before sending to Supabase.
  const cleanPayload: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k === '_id' || k.startsWith('_')) continue;
    cleanPayload[k] = v;
  }

  const sb = await writeSupabaseRow(supabaseTable, {
    config_key: configKey,
    payload: cleanPayload,
    ...cleanPayload,
    updated_at: now,
  });
  if (sb.ok) sources.push('supabase');
  else console.warn(`[platformConfig] ${supabaseTable} write warning:`, sb.error);

  const mongo = await upsertMongoDoc(mongoCollection, {
    config_key: configKey,
    payload: cleanPayload,
    ...cleanPayload,
  }, 'config_key', configKey);
  if (mongo.ok) sources.push('mongodb');
  else console.warn(`[platformConfig] ${mongoCollection} write warning:`, mongo.error);

  return {
    ok: sources.length > 0,
    data: { config_key: configKey, ...cleanPayload },
    sources,
    error: sources.length > 0 ? undefined : `Failed to persist ${configKey} to any provider.`,
  };
}

/* ────────────────────────── named config surfaces ────────────────────────── */

/** Payment gateways + platform settings + AI/automation (one platform doc). */
export const readPlatformConfig = () =>
  readConfigDocument('platform_config', 'platform_config', 'platform');

export const writePlatformConfig = (payload: Record<string, any>) =>
  writeConfigDocument('platform_config', 'platform_config', 'platform', payload);

/** Security policy document. */
export const readSecuritySettings = () =>
  readConfigDocument('security_settings', 'security_settings', 'security');

export const writeSecuritySettings = (payload: Record<string, any>) =>
  writeConfigDocument('security_settings', 'security_settings', 'security', payload);

/* ────────────────────────── audit logs ────────────────────────── */

export interface AuditLogRow {
  id: string;
  timestamp: string;
  adminUser: string;
  action: string;
  targetEntity: string;
  ipAddress: string;
  severity: 'Info' | 'Warning' | 'Critical';
  [key: string]: any;
}

/** Normalise a stored audit log row into the UI shape. */
export function normalizeAuditLog(row: Record<string, any>): AuditLogRow {
  const severityRaw = String(row.severity || row.level || 'Info');
  const severity: AuditLogRow['severity'] =
    severityRaw === 'Critical' || severityRaw === 'Warning' ? severityRaw : 'Info';
  return {
    id: String(row.id || row._id || `log-${Math.random().toString(36).slice(2, 9)}`),
    timestamp: String(row.timestamp || row.created_at || row.createdAt || new Date().toISOString()),
    adminUser: String(row.admin_user || row.adminUser || row.user || 'System'),
    action: String(row.action || row.message || ''),
    targetEntity: String(row.target_entity || row.targetEntity || row.entity || ''),
    ipAddress: String(row.ip_address || row.ipAddress || ''),
    severity,
  };
}

/** Read audit logs from Supabase + MongoDB, newest first, merged by id. */
export async function readAuditLogs(limit = 500): Promise<ConfigResult<AuditLogRow[]>> {
  const supa = await querySupabaseTable<Record<string, any>>('audit_logs', { limit });
  const mongo = await queryMongoCollection<Record<string, any>>('audit_logs', {}, { limit });

  const byId = new Map<string, AuditLogRow>();
  for (const row of [...mongo.rows, ...supa.rows]) {
    const log = normalizeAuditLog(row);
    if (!byId.has(log.id)) byId.set(log.id, log);
  }
  const logs = [...byId.values()].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const sources: DataSource[] = [];
  if (supa.rows.length) sources.push('supabase');
  if (mongo.rows.length) sources.push('mongodb');

  return {
    ok: true,
    data: logs,
    sources,
    error: supa.error || mongo.error,
    diagnostics: {
      supabase: { ok: !supa.error, count: supa.rows.length, error: supa.error },
      mongodb: { ok: !mongo.error, count: mongo.rows.length, error: mongo.error },
    },
  };
}

/** Append a single audit log entry to BOTH providers. NEVER throws. */
export async function appendAuditLog(entry: Partial<AuditLogRow>): Promise<ConfigResult<AuditLogRow>> {
  const log = normalizeAuditLog(entry);
  const sources: DataSource[] = [];

  const sb = await writeSupabaseRow('audit_logs', {
    id: log.id,
    timestamp: log.timestamp,
    admin_user: log.adminUser,
    action: log.action,
    target_entity: log.targetEntity,
    ip_address: log.ipAddress,
    severity: log.severity,
  }, 'id');
  if (sb.ok) sources.push('supabase');

  const mongo = await upsertMongoDoc('audit_logs', {
    id: log.id,
    timestamp: log.timestamp,
    adminUser: log.adminUser,
    action: log.action,
    targetEntity: log.targetEntity,
    ipAddress: log.ipAddress,
    severity: log.severity,
  }, 'id', log.id);
  if (mongo.ok) sources.push('mongodb');

  return { ok: sources.length > 0, data: log, sources, error: sources.length ? undefined : 'Could not persist audit log.' };
}

/** Clear ALL audit logs from BOTH providers. NEVER throws. */
export async function clearAuditLogs(): Promise<ConfigResult<{ cleared: boolean }>> {
  const sources: DataSource[] = [];

  // Supabase: delete every row (match on id with a wildcard-ish filter).
  const { supabaseUrl, supabaseKey, isConfigured } = getSupabaseServerConfig();
  if (isConfigured) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/audit_logs?id=not.is.null`, {
        method: 'DELETE',
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
      });
      if (res.ok) sources.push('supabase');
    } catch (err: any) {
      console.warn('[platformConfig] audit_logs Supabase clear warning:', err?.message || err);
    }
  }

  const { db } = await safeMongoDb();
  if (db) {
    try {
      await db.collection('audit_logs').deleteMany({});
      sources.push('mongodb');
    } catch (err: any) {
      console.warn('[platformConfig] audit_logs Mongo clear warning:', err?.message || err);
    }
  }

  return { ok: sources.length > 0, data: { cleared: sources.length > 0 }, sources };
}

export default {
  readPlatformConfig,
  writePlatformConfig,
  readSecuritySettings,
  writeSecuritySettings,
  readAuditLogs,
  appendAuditLog,
  clearAuditLogs,
};
