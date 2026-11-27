/**
 * “Send to Courier” ledger — SUPABASE (PostgREST) implementation.
 *
 * THE PRODUCTION FAILURE THIS FIXES
 * ---------------------------------------------------------------------------
 * The courier ledger used to be written ONLY to MongoDB. The deployed runtime
 * (`zid-marketplace.onrender.com`) reports `provider: "Supabase Data Layer"`,
 * and there MongoDB is optional / often unreachable. So:
 *
 *   • `recordCourierDispatchAttempt()` returned `{ok:false}` (“MongoDB is
 *     unavailable”) after EVERY click — including the 11:10 click that sent the
 *     Telegram alert for #ZID-507745498 — and nothing was persisted;
 *   • `GET /api/admin/courier-orders` read only the Mongo `courier_orders` /
 *     `orders` collections, so it answered `orders: []` and the portal showed
 *     “NO COURIER ORDERS YET” even though the click really happened.
 *
 * This module is the same ledger, stored in Postgres through `postgrestWrite`.
 *
 * STORAGE STRATEGY (works with the CURRENT schema — no migration required)
 * ---------------------------------------------------------------------------
 * 1. PRIMARY: the `courier_orders` table, when the project has one. The row is
 *    keyed on `id` (the lowercased order number) so a retry UPSERTs.
 * 2. FALLBACK: `postgrestWrite` drops every column the deployed table does not
 *    have and retries, so a partial or differently-named `courier_orders` table
 *    still receives whatever it can hold.
 * 3. LAST RESORT: if there is no usable table (PGRST205 / 42P01 / every column
 *    rejected), the row is written into `platform_config` — a configuration
 *    table every deployment already has — as `courier_order:<order>` documents.
 *    The list route reads that key back, so the feature works on a project that
 *    has never run a migration. As soon as a real `courier_orders` table
 *    exists, rows are read/written there.
 *
 * Labels are base64 inside the ledger row (`courier_labels`), exactly like the
 * Mongo implementation, so the Admin list and the merchant dashboard share them.
 */

import { postgrestWrite } from './supabaseSchema.js';

export const COURIER_LEDGER_TABLE = 'courier_orders';
/** Where rows go when the project has no `courier_orders` table. */
export const COURIER_LEDGER_FALLBACK_TABLE = 'platform_config';
const FALLBACK_KEY_PREFIX = 'courier_order:';
const FALLBACK_KEY_PREFIX_LC = FALLBACK_KEY_PREFIX;

export type CourierLedgerRow = Record<string, any>;

export interface CourierLedgerStoreConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

/** Strip a `#`, trim, lowercase — the ledger's identity for one order. */
export function ledgerOrderKey(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const text = String(candidate ?? '').replace(/^#/, '').trim();
    if (text) return text.toLowerCase();
  }
  return '';
}

/** Does this PostgREST error mean “the table itself does not exist”? */
function isMissingTable(detail: string, status: number): boolean {
  return (
    status === 404 ||
    /PGRST205|PGRST202/i.test(detail) ||
    /relation .* does not exist/i.test(detail) ||
    /Could not find the table/i.test(detail)
  );
}

/** True when EVERY payload key was rejected (a table with a foreign schema). */
function everythingRejected(detail: string): boolean {
  return /All payload fields were rejected/i.test(detail);
}

function jsonHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/vnd.pgrst.object+json, application/json',
  };
}

/**
 * Read every ledger row.
 *
 * Returns `{ rows, source }` where `source` is 'table' or 'fallback' so the
 * caller (and the HTTP response headers) can say WHICH storage answered.
 */
export async function listSupabaseLedger(
  cfg: CourierLedgerStoreConfig,
  limit = 500,
  /**
   * Caller-supplied deadline. The ledger is an ENRICHMENT for `/api/orders`;
   * a caller that must answer quickly passes an `AbortSignal` here so this
   * function's own 10s-per-request retry ladder (table → plain → fallback → …)
   * cannot hold the order list hostage.
   */
  signal?: AbortSignal,
): Promise<{ rows: CourierLedgerRow[]; source: 'table' | 'fallback' | 'none'; error?: string }> {
  if (!cfg.supabaseUrl || !cfg.supabaseKey) return { rows: [], source: 'none', error: 'Supabase is not configured.' };
  const timeoutSignal = (ms: number) => (AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);
  const requestSignal = signal && AbortSignal.any
    ? AbortSignal.any([signal, timeoutSignal(10_000)].filter(Boolean) as AbortSignal[])
    : (signal || timeoutSignal(10_000));

  const tableUrl =
    `${cfg.supabaseUrl}/rest/v1/${COURIER_LEDGER_TABLE}` +
    `?select=*&order=updated_at.desc.nullslast&limit=${Math.min(Math.max(limit, 1), 2000)}`;

  try {
    const res = await fetch(tableUrl, {
      headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}`, Accept: 'application/json' },
      signal: requestSignal,
    });
    if (res.ok) {
      const rows = await res.json().catch(() => []);
      return { rows: Array.isArray(rows) ? rows : [], source: 'table' };
    }
    const detail = await res.text().catch(() => '');
    /*
     * Any failure on the real table (missing, RLS, wrong shape) falls through to
     * the fallback store instead of pretending the list is empty. `415` shows up
     * when an `order=` column does not exist — retry without the ORDER BY first.
     */
    if (!isMissingTable(detail, res.status)) {
      const plain = await fetch(
        `${cfg.supabaseUrl}/rest/v1/${COURIER_LEDGER_TABLE}?select=*&limit=${Math.min(Math.max(limit, 1), 2000)}`,
        {
          headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}`, Accept: 'application/json' },
          signal: requestSignal,
        },
      ).catch(() => null);
      if (plain?.ok) {
        const rows = await plain.json().catch(() => []);
        return { rows: Array.isArray(rows) ? rows : [], source: 'table' };
      }
      const plainDetail = plain ? await plain.text().catch(() => '') : detail;
      if (!isMissingTable(plainDetail, plain?.status ?? 0) && plain?.status && plain.status < 500) {
        console.warn('[CourierLedger] table read failed:', plain.status, plainDetail.slice(0, 200));
      }
    }
  } catch (err: any) {
    console.warn('[CourierLedger] table read threw:', err?.message || err);
  }

  return readFallbackRows(cfg, signal);
}

/** Read the `platform_config` fallback documents. */
async function readFallbackRows(
  cfg: CourierLedgerStoreConfig,
  signal?: AbortSignal,
): Promise<{ rows: CourierLedgerRow[]; source: 'fallback' | 'none'; error?: string }> {
  const requestSignal = signal && AbortSignal.any
    ? AbortSignal.any([signal, AbortSignal.timeout ? AbortSignal.timeout(10_000) : undefined].filter(Boolean) as AbortSignal[])
    : (signal || (AbortSignal.timeout ? AbortSignal.timeout(10_000) : undefined));
  try {
    // 1. Try config_key (the standard column in 0004_platform_config.sql)
    let res = await fetch(
      `${cfg.supabaseUrl}/rest/v1/${COURIER_LEDGER_FALLBACK_TABLE}` +
      `?select=*&config_key=like.${encodeURIComponent(FALLBACK_KEY_PREFIX_LC + '*')}&limit=2000`,
      {
        headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}`, Accept: 'application/json' },
        signal: requestSignal,
      },
    );

    // 2. Fall back to key=like if config_key column was rejected
    if (!res.ok) {
      res = await fetch(
        `${cfg.supabaseUrl}/rest/v1/${COURIER_LEDGER_FALLBACK_TABLE}` +
        `?select=*&key=like.${encodeURIComponent(FALLBACK_KEY_PREFIX_LC + '*')}&limit=2000`,
        {
          headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}`, Accept: 'application/json' },
          signal: requestSignal,
        },
      );
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn('[CourierLedger] fallback read failed:', res.status, detail.slice(0, 200));
      return { rows: [], source: 'none', error: detail || `HTTP ${res.status}` };
    }
    const docs = await res.json().catch(() => []);
    const rows: CourierLedgerRow[] = [];
    for (const doc of Array.isArray(docs) ? docs : []) {
      const value = doc?.payload ?? doc?.value ?? doc?.data ?? doc?.config ?? doc?.json ?? null;
      const parsed = typeof value === 'string'
        ? (() => { try { return JSON.parse(value); } catch { return null; } })()
        : value;
      const row = parsed && typeof parsed === 'object'
        ? parsed
        : (doc?.payload && typeof doc.payload === 'object' ? doc.payload : null);
      if (row && typeof row === 'object') rows.push(row as CourierLedgerRow);
    }
    return { rows, source: rows.length > 0 ? 'fallback' : 'none' };
  } catch (err: any) {
    return { rows: [], source: 'none', error: err?.message || String(err) };
  }
}

export interface LedgerUpsertResult {
  ok: boolean;
  source: 'table' | 'fallback' | 'none';
  droppedColumns?: string[];
  error?: string;
}

/**
 * Columns that must NEVER be blanked by a later, partial write.
 *
 * A retry re-posts only what the courier modal knows, so `customer_name`,
 * `amount` and friends arrive EMPTY (`''` / `0`). Writing them over the row that
 * the first, fuller click created erased the customer and the ৳ amount — the
 * admin row survived but looked broken. Same rule as the MongoDB writer.
 */
const PROTECTED_COLUMNS = [
  'store_slug', 'storeSlug', 'store_code', 'storeCode', 'store_id', 'store_name', 'storeName',
  'merchant_phone', 'merchantPhone', 'pickup_address', 'pickupAddress',
  'customer_name', 'customerName', 'customer_phone', 'customerPhone',
  'customer_address', 'shipping_address', 'customer_city',
  'payment_method', 'paymentMethod', 'payment_status', 'paymentStatus',
  'order_number', 'orderNumber', 'courier_name', 'courierName', 'tracking_id',
  'courier_labels', 'created_at',
] as const;

/** Numeric columns where `0` means “this write did not say”, not “zero”. */
const AMOUNT_COLUMNS = ['amount', 'total_price', 'totalBDT'] as const;

/**
 * Merge `incoming` onto the row already stored for this order.
 *
 * - a blank/null value never overwrites a known one;
 * - a `0` amount never overwrites a positive one;
 * - labels are kept when the new write carries none;
 * - a status the admin already advanced (in_transit / delivered / …) is not
 *   rolled back by a routine re-dispatch.
 */
export function mergeLedgerRow(
  existing: CourierLedgerRow | null | undefined,
  incoming: CourierLedgerRow,
): CourierLedgerRow {
  const out: CourierLedgerRow = { ...incoming };
  if (!existing) return out;

  const isBlank = (v: unknown) => v === undefined || v === null || v === '';
  const isBlankJson = (v: unknown) => isBlank(v) || v === '[]' || v === '{}';

  for (const col of PROTECTED_COLUMNS) {
    if (!(col in out)) continue;
    const prev = existing[col];
    if (isBlank(prev)) continue;
    const next = out[col];
    const blankNext = col === 'courier_labels' ? isBlankJson(next) : isBlank(next);
    if (blankNext) {
      out[col] = prev;
      continue;
    }
    // Labels are additive: keep everything already attached.
    if (col === 'courier_labels') {
      const prevList = Array.isArray(prev) ? prev : parseJsonArray(prev);
      const nextList = Array.isArray(next) ? next : parseJsonArray(next);
      const byId = new Map<string, any>();
      for (const l of [...prevList, ...nextList]) {
        const key = String(l?.id || l?.filename || JSON.stringify(l));
        byId.set(key, l);
      }
      out[col] = Array.from(byId.values());
    }
  }

  for (const col of AMOUNT_COLUMNS) {
    if (!(col in out)) continue;
    const prev = Number(existing[col]);
    if (Number(out[col]) === 0 && Number.isFinite(prev) && prev > 0) out[col] = existing[col];
  }

  const ADVANCED = ['pickup_confirmed', 'in_transit', 'delivered', 'cancelled'];
  if (
    ADVANCED.includes(String(existing.courier_status || '')) &&
    !ADVANCED.includes(String(incoming.courier_status || ''))
  ) {
    out.courier_status = existing.courier_status;
  }

  return out;
}

/** Parse a JSON array column that may arrive as a string. */
function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Write ONE ledger row (insert, or merge onto the existing row for this order).
 *
 * Never throws. Falls back to `platform_config` when the table path cannot
 * accept the row, so a deployment without a `courier_orders` table still gets
 * a durable, listable record of the click.
 */
export async function upsertSupabaseLedger(
  cfg: CourierLedgerStoreConfig,
  row: CourierLedgerRow,
): Promise<LedgerUpsertResult> {
  if (!cfg.supabaseUrl || !cfg.supabaseKey) {
    return { ok: false, source: 'none', error: 'Supabase is not configured.' };
  }
  const key = ledgerOrderKey(row.id, row.order_id, row.order_number, row.orderNumber);
  if (!key) return { ok: false, source: 'none', error: 'No order identifier was supplied.' };

  /*
   * READ-MERGE-WRITE. A plain upsert would let a partial retry blank the
   * customer/amount the first click stored; the existing row is therefore read
   * first and the new payload merged ONTO it (see `mergeLedgerRow`).
   */
  const previous = await findSupabaseLedgerRow(cfg, key);
  const merged = mergeLedgerRow(previous.row, { ...row, id: key, order_id: row.order_id || key });
  const payload: CourierLedgerRow = { ...merged, id: key, order_id: merged.order_id || key };

  // ── 1. The real table (upsert on the natural key). ──
  const tableResult = await postgrestWrite(
    cfg.supabaseUrl,
    cfg.supabaseKey,
    `/rest/v1/${COURIER_LEDGER_TABLE}?on_conflict=id`,
    {
      method: 'POST',
      headers: { ...jsonHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: payload,
      conflictPatchPath: `/rest/v1/${COURIER_LEDGER_TABLE}?id=eq.${encodeURIComponent(key)}`,
      timeoutMs: 10_000,
      maxRetries: 14,
    },
  );
  if (tableResult.ok) {
    console.log('[CourierLedger] table write OK for order', key);
    return { ok: true, source: 'table', droppedColumns: tableResult.droppedColumns };
  }

  const missing = isMissingTable(tableResult.detail, tableResult.status);
  const rejectedAll = everythingRejected(tableResult.detail);
  if (!missing && !rejectedAll) {
    /*
     * A REAL error (RLS 42501, bad cast that survived the retries, …). Still
     * fall back, because a lost click is worse than a duplicated copy: the
     * admin must see the row. The reason is logged so the table can be fixed.
     */
    console.warn('[CourierLedger] table write failed:', {
      status: tableResult.status,
      detail: (tableResult.detail || '').slice(0, 300),
      droppedColumns: tableResult.droppedColumns,
    });
  }

  // ── 2. `platform_config` fallback (always present). ──
  const fallback = await writeFallbackRow(cfg, key, payload);
  if (fallback.ok) {
    console.log('[CourierLedger] fallback write OK for order', key, '(platform_config)');
    return { ...fallback, droppedColumns: tableResult.droppedColumns };
  }
  console.error('[CourierLedger] both table and fallback writes FAILED for order', key, {
    tableError: (tableResult.detail || '').slice(0, 200),
    fallbackError: (fallback.error || '').slice(0, 200),
  });
  return {
    ok: false,
    source: 'none',
    droppedColumns: tableResult.droppedColumns,
    error: `table: ${(tableResult.detail || '').slice(0, 200)} | fallback: ${fallback.error || 'failed'}`,
  };
}

/** Upsert one `courier_order:<order>` document in `platform_config`. */
async function writeFallbackRow(
  cfg: CourierLedgerStoreConfig,
  key: string,
  row: CourierLedgerRow,
): Promise<LedgerUpsertResult> {
  const docKey = `${FALLBACK_KEY_PREFIX_LC}${key}`;
  const now = new Date().toISOString();

  // Send payload with BOTH column conventions (config_key+payload per 0004_platform_config.sql,
  // AND key+value as alias). postgrestWrite automatically drops any column the target table lacks.
  const payloadDoc = {
    config_key: docKey,
    payload: row,
    key: docKey,
    value: row,
    updated_at: now,
  };

  // 1. Try PATCH on config_key first
  const patched = await postgrestWrite(
    cfg.supabaseUrl,
    cfg.supabaseKey,
    `/rest/v1/${COURIER_LEDGER_FALLBACK_TABLE}?config_key=eq.${encodeURIComponent(docKey)}`,
    {
      method: 'PATCH',
      headers: { ...jsonHeaders(), Prefer: 'return=representation' },
      body: payloadDoc,
      timeoutMs: 10_000,
    },
  );
  if (patched.ok) {
    const check = await readFallbackRow(cfg, docKey);
    if (check) return { ok: true, source: 'fallback' };
  }

  // 2. Try PATCH on key=eq if config_key was not recognized
  const patchedKey = await postgrestWrite(
    cfg.supabaseUrl,
    cfg.supabaseKey,
    `/rest/v1/${COURIER_LEDGER_FALLBACK_TABLE}?key=eq.${encodeURIComponent(docKey)}`,
    {
      method: 'PATCH',
      headers: { ...jsonHeaders(), Prefer: 'return=representation' },
      body: payloadDoc,
      timeoutMs: 10_000,
    },
  );
  if (patchedKey.ok) {
    const check = await readFallbackRow(cfg, docKey);
    if (check) return { ok: true, source: 'fallback' };
  }

  // 3. Try POST with conflictPatchPath on config_key
  const inserted = await postgrestWrite(
    cfg.supabaseUrl,
    cfg.supabaseKey,
    `/rest/v1/${COURIER_LEDGER_FALLBACK_TABLE}?on_conflict=config_key`,
    {
      method: 'POST',
      headers: { ...jsonHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: payloadDoc,
      conflictPatchPath: `/rest/v1/${COURIER_LEDGER_FALLBACK_TABLE}?config_key=eq.${encodeURIComponent(docKey)}`,
      timeoutMs: 10_000,
    },
  );
  if (inserted.ok) return { ok: true, source: 'fallback' };

  // 4. Try POST plain
  const insertedPlain = await postgrestWrite(
    cfg.supabaseUrl,
    cfg.supabaseKey,
    `/rest/v1/${COURIER_LEDGER_FALLBACK_TABLE}`,
    {
      method: 'POST',
      headers: { ...jsonHeaders(), Prefer: 'return=minimal' },
      body: payloadDoc,
      conflictPatchPath: `/rest/v1/${COURIER_LEDGER_FALLBACK_TABLE}?config_key=eq.${encodeURIComponent(docKey)}`,
      timeoutMs: 10_000,
    },
  );
  if (insertedPlain.ok) return { ok: true, source: 'fallback' };

  return {
    ok: false,
    source: 'none',
    error: (inserted.detail || insertedPlain.detail || patched.detail || patchedKey.detail || '').slice(0, 300) || 'Could not write the fallback row.',
  };
}

async function readFallbackRow(
  cfg: CourierLedgerStoreConfig,
  docKey: string,
): Promise<CourierLedgerRow | null> {
  try {
    // 1. Try config_key
    let res = await fetch(
      `${cfg.supabaseUrl}/rest/v1/${COURIER_LEDGER_FALLBACK_TABLE}?select=*&config_key=eq.${encodeURIComponent(docKey)}&limit=1`,
      {
        headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout ? AbortSignal.timeout(8_000) : undefined,
      },
    );
    // 2. Try key
    if (!res.ok) {
      res = await fetch(
        `${cfg.supabaseUrl}/rest/v1/${COURIER_LEDGER_FALLBACK_TABLE}?select=*&key=eq.${encodeURIComponent(docKey)}&limit=1`,
        {
          headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}`, Accept: 'application/json' },
          signal: AbortSignal.timeout ? AbortSignal.timeout(8_000) : undefined,
        },
      );
    }
    if (!res.ok) return null;
    const rows = await res.json().catch(() => []);
    const first = Array.isArray(rows) ? rows[0] : null;
    if (!first) return null;
    const value = first.payload ?? first.value ?? first.data ?? first.config ?? null;
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

/** Find one ledger row (table first, then fallback). */
export async function findSupabaseLedgerRow(
  cfg: CourierLedgerStoreConfig,
  orderId: string,
): Promise<{ row: CourierLedgerRow | null; source: 'table' | 'fallback' | 'none'; tableRow?: CourierLedgerRow | null }> {
  const key = ledgerOrderKey(orderId);
  if (!key) return { row: null, source: 'none' };

  let tableRow: CourierLedgerRow | null = null;
  try {
    const rawNum = String(orderId).replace(/^#/, '').trim();
    const filters = [
      `id.eq.${encodeURIComponent(key)}`,
      `order_id.eq.${encodeURIComponent(key)}`,
      `order_number.eq.${encodeURIComponent(rawNum)}`,
    ].join(',');
    const res = await fetch(
      `${cfg.supabaseUrl}/rest/v1/${COURIER_LEDGER_TABLE}?select=*&or=(${filters})&limit=1`,
      {
        headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout ? AbortSignal.timeout(8_000) : undefined,
      },
    );
    if (res.ok) {
      const rows = await res.json().catch(() => []);
      tableRow = Array.isArray(rows) ? rows[0] || null : null;
      if (tableRow) return { row: tableRow, source: 'table', tableRow };
    }
  } catch { /* fall through to the config store */ }

  const fallbackRow = await readFallbackRow(cfg, `${FALLBACK_KEY_PREFIX_LC}${key}`);
  if (fallbackRow) return { row: fallbackRow, source: 'fallback', tableRow };
  return { row: null, source: 'none' };
}

/**
 * Merge a patch into whichever store currently holds this order's row.
 *
 * Used by the status dropdown and the label routes: it must update the row the
 * LIST is reading, so it writes to both the table (when a row exists there) and
 * the fallback document — cheap, and immune to which one the list prefers.
 */
export async function patchSupabaseLedgerRow(
  cfg: CourierLedgerStoreConfig,
  orderId: string,
  patch: CourierLedgerRow,
): Promise<{ ok: boolean; row?: CourierLedgerRow | null; source: 'table' | 'fallback' | 'none'; error?: string }> {
  const key = ledgerOrderKey(orderId);
  if (!key) return { ok: false, source: 'none', error: 'An order id is required.' };

  const existing = await findSupabaseLedgerRow(cfg, orderId);
  if (!existing.row) return { ok: false, source: 'none', error: 'The order is not in the courier ledger.' };

  const merged: CourierLedgerRow = { ...existing.row, ...patch, id: key, order_id: existing.row.order_id || key };
  const written = await upsertSupabaseLedger(cfg, merged);
  if (!written.ok) return { ok: false, source: written.source, error: written.error };
  return { ok: true, row: merged, source: written.source };
}
