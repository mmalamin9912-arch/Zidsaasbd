/**
 * Admin Team & Role Permissions persistence for the Super Admin portal.
 *
 * STRATEGY (matches lib/platformConfig.ts and lib/supportComms.ts)
 * ----------------------------------------------------------------
 *   - admin_team:        one document per team member, keyed by `id`. A write
 *                        upserts the member; a delete removes it.
 *   - role_permissions:  a singleton config document (config_key='roles') whose
 *                        `roles` field holds the role → allowedTabs matrix.
 *
 * Supabase is written FIRST (canonical) and mirrored to MongoDB (fallback AND
 * redundancy); reads query BOTH and merge. All functions never throw — callers
 * always get a shaped result so a route can answer 200 with a diagnosis.
 *
 * Import-safe from the Express bootstrap (server.ts) and the Vercel app.
 */

import { getMongoDb, getMongoUri, describeMongoError, DB_NAME } from './db.js';
import { getSupabaseServerConfig, querySupabaseTable, queryMongoCollection } from './hybridDb.js';
import type { DataSource } from './hybridDb.js';
import { readConfigDocument, writeConfigDocument } from './platformConfig.js';

/**
 * Remove keys MongoDB will not accept inside `$set`.
 *
 * `_id` is immutable: including it in an update operator aborts the entire write
 * with error code 66. A caller's record may be a row that was previously read
 * back from Mongo, so it is not guaranteed to be free of `_id`. `$`-prefixed keys
 * are operator names rather than data and must never be persisted as fields.
 */
function stripImmutableKeys(record: Record<string, any>): Record<string, any> {
  if (!record || typeof record !== 'object') return {};
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === '_id' || key.startsWith('$')) continue;
    if (value === undefined) continue;
    clean[key] = value;
  }
  return clean;
}

export interface TeamResult<T = Record<string, any>> {
  ok: boolean;
  data: T | null;
  sources: DataSource[];
  error?: string;
  diagnostics?: Record<string, any>;
}

/* ────────────────────────── Supabase REST helpers ────────────────────────── */

async function writeSupabaseRow(
  table: string,
  record: Record<string, any>,
  matchColumn = 'id'
): Promise<{ ok: boolean; error?: string; statusCode?: number }> {
  const { supabaseUrl, supabaseKey, isConfigured } = getSupabaseServerConfig();
  if (!isConfigured) return { ok: false, error: 'Supabase is not configured.' };

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/${table}?on_conflict=${encodeURIComponent(matchColumn)}`,
      {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
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
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
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
    // A missing ROW (or a table that this deployment never provisioned) is not a
    // failure for a MIRROR provider: the canonical delete already happened in
    // MongoDB, so there is nothing left to remove. PostgREST answers 404 for an
    // absent table and 200 with an empty body for an absent row, so a 404 here
    // is a "nothing to do" outcome — treating it as an error produced a steady
    // stream of `Supabase admin_team DELETE responded 404` warnings.
    if (res.status === 404) return { ok: false, skipped: true, error: `Supabase ${table} has no matching row to delete (HTTP 404).` };
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

async function upsertMongoById(
  collection: string,
  record: Record<string, any>
): Promise<{ ok: boolean; error?: string }> {
  const { db, error } = await safeMongoDb();
  if (!db) return { ok: false, error };

  const id = String(record.id || '');
  if (!id) return { ok: false, error: 'Record id is required.' };

  const now = new Date().toISOString();
  try {
    // `_id` cannot appear in `$set` — MongoDB rejects the whole write with error
    // 66. `record` may originate from a previously-read row, so strip it (and any
    // `$`-prefixed operator keys) before building the update.
    const cleanRecord = stripImmutableKeys(record);
    await db.collection(collection).updateOne(
      { id },
      { $set: { ...cleanRecord, updated_at: now, updatedAt: now }, $setOnInsert: { created_at: now, createdAt: now } },
      { upsert: true }
    );
    return { ok: true };
  } catch (err: any) {
    if (/E11000|duplicate key/i.test(String(err?.message || ''))) return { ok: true };
    return { ok: false, error: err?.message || 'MongoDB write failed' };
  }
}

/** Delete a member (by id, or by email as a secondary key) from Mongo. */
async function deleteMongoById(
  collection: string,
  id: string
): Promise<{ ok: boolean; deleted: number; error?: string }> {
  const { db, error } = await safeMongoDb();
  if (!db) return { ok: false, deleted: 0, error };
  try {
    const res = await db.collection(collection).deleteMany({ id: String(id) });
    return { ok: true, deleted: res?.deletedCount || 0 };
  } catch (err: any) {
    return { ok: false, deleted: 0, error: err?.message || 'MongoDB delete failed' };
  }
}

/* ────────────────────────── normalisers ────────────────────────── */

/** Normalise a stored team-member row (Supabase columns, Mongo doc, or UI shape). */
export function normalizeMember(row: Record<string, any>): Record<string, any> {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  return {
    id: String(row?.id || payload?.id || `adm-${Math.random().toString(36).slice(2, 8)}`),
    fullName: String(row?.full_name || row?.fullName || payload?.fullName || 'Team Member'),
    email: String(row?.email || payload?.email || ''),
    role: (row?.role || payload?.role || 'Support Lead'),
    lastActive: String(row?.last_active || row?.lastActive || payload?.lastActive || new Date().toISOString()),
    status: (row?.status || payload?.status || 'Active'),
  };
}

/* ────────────────────────── admin team members ────────────────────────── */

/** Read every admin team member from Supabase + MongoDB, merged by id. */
export async function readAdminTeam(): Promise<TeamResult<Record<string, any>[]>> {
  const [supa, mongo] = await Promise.all([
    querySupabaseTable<Record<string, any>>('admin_team', { limit: 1000 }),
    queryMongoCollection<Record<string, any>>('admin_team', {}, { limit: 1000 }),
  ]);

  const byId = new Map<string, Record<string, any>>();
  for (const row of [...mongo.rows, ...supa.rows]) {
    const member = normalizeMember(row);
    byId.set(member.id, { ...(byId.get(member.id) || {}), ...member });
  }

  const sources: DataSource[] = [];
  if (supa.rows.length) sources.push('supabase');
  if (mongo.rows.length) sources.push('mongodb');

  return {
    ok: true,
    data: [...byId.values()],
    sources,
    error: supa.error || mongo.error,
    diagnostics: {
      supabase: { ok: !supa.error, count: supa.rows.length, error: supa.error },
      mongodb: { ok: !mongo.error, count: mongo.rows.length, error: mongo.error },
    },
  };
}

/** Upsert one admin team member to BOTH providers. Never throws. */
export async function writeAdminMember(raw: Record<string, any>): Promise<TeamResult<Record<string, any>>> {
  const member = normalizeMember(raw);
  const sources: DataSource[] = [];
  const now = new Date().toISOString();

  const sb = await writeSupabaseRow('admin_team', {
    id: member.id,
    full_name: member.fullName,
    email: member.email,
    role: member.role,
    last_active: member.lastActive,
    status: member.status,
    payload: member,
    updated_at: now,
  }, 'id');
  if (sb.ok) sources.push('supabase');
  else console.warn('[adminTeamConfig] admin_team Supabase write warning:', sb.error);

  const mongo = await upsertMongoById('admin_team', member);
  if (mongo.ok) sources.push('mongodb');
  else console.warn('[adminTeamConfig] admin_team Mongo write warning:', mongo.error);

  return {
    ok: sources.length > 0,
    data: member,
    sources,
    error: sources.length ? undefined : 'Failed to persist admin member to any provider.',
  };
}

/** Delete an admin team member from BOTH providers. Never throws. */
export async function deleteAdminMember(
  id: string
): Promise<TeamResult<{ id: string; deleted: boolean }>> {
  const sources: DataSource[] = [];

  const sb = await deleteSupabaseRow('admin_team', 'id', id);
  if (sb.ok) sources.push('supabase');
  else if (!sb.skipped) console.warn('[adminTeamConfig] admin_team Supabase delete warning:', sb.error);

  const mongo = await deleteMongoById('admin_team', id);
  if (mongo.ok) sources.push('mongodb');
  else console.warn('[adminTeamConfig] admin_team Mongo delete warning:', mongo.error);

  return {
    ok: sources.length > 0,
    data: { id, deleted: sources.length > 0 },
    sources,
    error: sources.length ? undefined : 'Failed to delete admin member from any provider.',
  };
}

/* ────────────────────────── role permissions ────────────────────────── */

/** Read the role→allowedTabs matrix from the singleton config document. */
export async function readRolePermissions(): Promise<TeamResult<Record<string, any>[]>> {
  const doc = await readConfigDocument<Record<string, any>>('role_permissions', 'role_permissions', 'roles');
  const roles = Array.isArray(doc.data?.roles) ? doc.data!.roles : null;
  return {
    ok: Boolean(roles),
    data: roles,
    sources: doc.sources,
    error: doc.error,
    diagnostics: doc.diagnostics,
  };
}

/** Persist the role→allowedTabs matrix to BOTH providers. Never throws. */
export async function writeRolePermissions(
  roles: Record<string, any>[]
): Promise<TeamResult<Record<string, any>[]>> {
  const clean = Array.isArray(roles) ? roles : [];
  const result = await writeConfigDocument('role_permissions', 'role_permissions', 'roles', { roles: clean });
  return {
    ok: result.ok,
    data: clean,
    sources: result.sources,
    error: result.error,
  };
}

export default {
  readAdminTeam,
  writeAdminMember,
  deleteAdminMember,
  readRolePermissions,
  writeRolePermissions,
  normalizeMember,
};
