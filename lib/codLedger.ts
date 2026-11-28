/**
 * COD RECONCILIATION & VENDOR WALLET.
 *
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * Before this module, a delivered COD order only changed a status badge. The
 * cash the courier actually collected — minus the courier's own delivery fee
 * and the platform's commission — existed nowhere, so nobody could answer
 * "how much does this vendor actually have?" or "what did we earn this month?".
 *
 * THE MODEL
 * ---------------------------------------------------------------------------
 * Three collections, all in `zidbdsaas`:
 *
 *   cod_ledger       — ONE immutable row per delivered COD order. This is the
 *                      central record of money MOVEMENT:
 *                        gross_collected (cash the courier took from the buyer)
 *                      − courier_fee       (charged by Pathao/Steadfast/…)
 *                      − platform_commission (vendor_payouts / commission_rates)
 *                      = vendor_credit     (the cash owed to the merchant)
 *                      Final `net_settlement` = gross − courier − commission
 *                      (identical to vendor_credit; kept explicit for treasury).
 *
 *   vendor_wallets   — ONE running balance per vendor:
 *                        available_bdt        credit minus withdrawal holds
 *                        pending_payout_bdt   requested, not yet disbursed
 *                        lifetime_credit_bdt  total ever credited
 *                        lifetime_paid_bdt    total ever paid out
 *
 *   payout_requests  — a vendor's withdrawal request with its own lifecycle
 *                      (pending → approved → paid | rejected).
 *
 * IDEMPOTENCY
 * ---------------------------------------------------------------------------
 * Couriers retry webhooks. The same "Delivered" event can arrive three times.
 * Every write here is keyed on the ORDER, so:
 *   • `cod_ledger` has a unique `order_key` — the second delivery event finds
 *     the row and does NOT credit the wallet twice.
 *   • wallet updates use `$inc`, but ONLY after the ledger insert succeeds.
 * This is what makes `reconcileCodDelivery` safe to call from both the Pathao
 * webhook and a manual "Mark delivered" click.
 *
 * FAILURE BEHAVIOUR
 * ---------------------------------------------------------------------------
 * Reconciliation is a side-effect of a status update: it must never fail the
 * webhook (the courier would retry forever) and must never fail a merchant's
 * dashboard action. Every function returns a result object instead of throwing.
 */
import mongoose from 'mongoose';
import { getMongoDb, getTenantDbs, getPrimaryTrustedDb, DB_NAME } from './db.js';
import { resolveStoreRef, storeMatchClauses, resolveCommission, PAYOUT_COLLECTION } from './marketplace.js';

export const COD_LEDGER_COLLECTION = 'cod_ledger';
export const VENDOR_WALLETS_COLLECTION = 'vendor_wallets';
export const PAYOUT_REQUESTS_COLLECTION = 'payout_requests';

/** Fallback courier delivery fee (BDT) when the merchant never priced one. */
export const DEFAULT_COURIER_FEE_BDT = 60;

export interface LedgerResult {
  ok: boolean;
  /** `created` = first delivery event, `exists` = already reconciled. */
  status: 'created' | 'exists' | 'skipped' | 'error';
  ledger?: Record<string, any>;
  wallet?: Record<string, any>;
  error?: string;
  reason?: string;
}

function toNum(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toPlain(doc: any): any {
  if (!doc || typeof doc !== 'object') return doc;
  const out: any = { ...doc };
  if (out._id != null) out._id = String(out._id);
  return out;
}

/** A JSON-string or array `items` field, always an array. */
function parseItems(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Resolve the courier's delivery fee for an order.
 *
 * Sources, most specific first:
 *   1. the order's own `courier_fee` / `delivery_charge` (what the courier
 *      will actually deduct — a webhook may carry it);
 *   2. the courier's per-zone rate saved by the merchant;
 *   3. the platform fallback.
 *
 * A merchant's own `insideDhakaFee` is the rate they quote the BUYER, which is
 * also what the courier charges them, so it is the honest default.
 */
async function resolveCourierFee(order: Record<string, any>, storeRef: string): Promise<number> {
  const explicit = order.courier_fee ?? order.courierFee ?? order.delivery_charge ?? order.deliveryCharge;
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    const n = toNum(explicit, -1);
    if (n >= 0) return round2(n);
  }

  try {
    const ref = await resolveStoreRef(storeRef);
    const db = await getMongoDb(DB_NAME);
    const store: any = db
      ? await db.collection('stores').findOne({ $or: storeMatchClauses(ref) }).catch(() => null)
      : null;
    const shipping = store?.shippingConfig || store?.shipping_config || {};
    const zone = String(order.delivery_zone || order.deliveryZone || order.customer_city || '').toLowerCase();
    const inside = toNum(shipping.insideDhakaFee ?? store?.inside_dhaka_fee, NaN);
    const outside = toNum(shipping.outsideDhakaFee ?? store?.outside_dhaka_fee, NaN);
    const sub = toNum(shipping.subDhakaFee ?? store?.sub_dhaka_fee, NaN);

    if (zone.includes('sub') && Number.isFinite(sub)) return round2(sub);
    if (zone.includes('outside') && Number.isFinite(outside)) return round2(outside);
    if (zone.includes('inside') && Number.isFinite(inside)) return round2(inside);
    if (Number.isFinite(inside)) return round2(inside);
  } catch (err: any) {
    console.warn('[COD] resolveCourierFee warning:', err?.message || err);
  }

  return DEFAULT_COURIER_FEE_BDT;
}

/** The vendor (store) an order belongs to, as canonical ids. */
function vendorIdentityOf(order: Record<string, any>) {
  const vendorId = String(
    order.vendor_id || order.vendorId || order.store_id || order.storeId ||
    order.merchant_id || order.merchantId || order.store_slug || order.storeSlug || ''
  ).trim();
  const storeSlug = String(order.store_slug || order.storeSlug || '').trim().toLowerCase();
  const vendorName = String(order.vendor_name || order.vendorName || order.store_name || order.storeName || '').trim();
  return { vendorId, storeSlug, vendorName };
}

/**
 * Credit a vendor's wallet by one COD settlement.
 *
 * Returns the updated wallet. Uses `$inc` (atomic) with an upsert so concurrent
 * deliveries to the same vendor cannot lose an update — the classic
 * read-modify-write race that made an earlier wallet implementation undercount.
 */
export async function creditVendorWallet(
  vendor: { vendorId: string; storeSlug?: string; vendorName?: string },
  amounts: { available: number; gross: number; commission: number; courierFee: number; orderNumber: string },
  /**
   * Optional database to credit. The wallet MUST live on the same cluster as
   * the order it settles: the shared pool can be pinned to MONGODB_URI_2 (a
   * different, empty cluster), so a credit issued through it created a brand
   * new zero-history wallet there while the real wallet sat untouched on the
   * primary. Omitted by existing callers → unchanged behaviour.
   */
  dbOverride?: any
): Promise<Record<string, any> | null> {
  // The shared pool can be a FAILOVER REUSE of the empty cluster. When the
  // caller did not name a database, prefer the verified primary handle and only
  // fall back to `getMongoDb()` if that is unavailable.
  const db = dbOverride || (await getPrimaryTrustedDb(DB_NAME)) || (await getMongoDb(DB_NAME));
  if (!db) return null;

  const identity = {
    $or: [
      { vendor_id: vendor.vendorId },
      ...(vendor.storeSlug ? [{ store_slug: vendor.storeSlug }] : []),
    ],
  };

  try {
    await db.collection(VENDOR_WALLETS_COLLECTION).updateOne(
      identity,
      {
        $inc: {
          available_bdt: round2(amounts.available),
          lifetime_credit_bdt: round2(amounts.available),
          lifetime_gross_bdt: round2(amounts.gross),
          lifetime_courier_fee_bdt: round2(amounts.courierFee),
          lifetime_commission_bdt: round2(amounts.commission),
          cod_orders_count: 1,
        },
        $set: {
          vendor_id: vendor.vendorId,
          ...(vendor.storeSlug ? { store_slug: vendor.storeSlug } : {}),
          ...(vendor.vendorName ? { vendor_name: vendor.vendorName } : {}),
          last_credit_at: new Date(),
          last_credit_order: amounts.orderNumber,
          updated_at: new Date(),
        },
        $setOnInsert: {
          pending_payout_bdt: 0,
          lifetime_paid_bdt: 0,
          withdrawn_bdt: 0,
          created_at: new Date(),
        },
      },
      { upsert: true }
    );
  } catch (err: any) {
    console.warn('[COD] creditVendorWallet warning:', err?.message || err);
    return null;
  }

  const wallet = await db.collection(VENDOR_WALLETS_COLLECTION).findOne(identity).catch(() => null);
  return toPlain(wallet);
}

/**
 * RECONCILE ONE DELIVERED COD ORDER.
 *
 * Called from:
 *   • the Pathao/Steadfast webhook when the shipment reports "Delivered",
 *   • the dashboard's manual status change to Delivered/Completed.
 *
 * Steps:
 *   1. Refuse anything that is not a COD order or not delivered (a paid bKash
 *      order has no cash to reconcile — crediting the vendor again would be
 *      double payment).
 *   2. Compute gross → courier fee → platform commission → vendor credit.
 *   3. Insert the immutable `cod_ledger` row. A duplicate key means this order
 *      was already reconciled: return `exists` and touch nothing.
 *   4. Credit `vendor_wallets` (only now, so a retry cannot double-credit).
 *
 * Never throws.
 */
export async function reconcileCodDelivery(
  order: Record<string, any>,
  opts: { courierName?: string; courierFee?: number; deliveredAt?: Date } = {}
): Promise<LedgerResult> {
  try {
    const orderNumber = String(
      order.order_number || order.orderNumber || order.id || ''
    ).replace(/^#/, '').trim();
    if (!orderNumber) return { ok: false, status: 'skipped', reason: 'Order has no order_number.' };

    // 1. Preconditions -------------------------------------------------------
    const paymentMethod = String(order.payment_method || order.paymentMethod || '').toLowerCase();
    if (paymentMethod && !paymentMethod.includes('cod') && !paymentMethod.includes('cash')) {
      return { ok: false, status: 'skipped', reason: `Payment method is "${paymentMethod}", not COD.` };
    }

    const fulfillment = String(
      order.fulfillment_status || order.fulfillmentStatus || ''
    ).toLowerCase();
    const status = String(order.status || '').toLowerCase();
    const isDelivered = fulfillment === 'delivered' || status === 'completed';
    if (!isDelivered) {
      return { ok: false, status: 'skipped', reason: 'Order is not delivered yet.' };
    }

    // A cancelled/reversed order is not a settlement.
    if (status === 'cancelled' || fulfillment === 'cancelled') {
      return { ok: false, status: 'skipped', reason: 'Order was cancelled.' };
    }

    const vendor = vendorIdentityOf(order);
    if (!vendor.vendorId) return { ok: false, status: 'skipped', reason: 'Order has no vendor/store identifier.' };

    const db = await getMongoDb(DB_NAME);
    if (!db) return { ok: false, status: 'error', error: 'The database is unavailable.' };

    // Idempotency fast-path: a ledger row for this order already exists.
    const orderKey = `${vendor.vendorId}::${orderNumber}`;
    const existing = await db
      .collection(COD_LEDGER_COLLECTION)
      .findOne({ order_key: orderKey })
      .catch(() => null);
    if (existing) {
      return { ok: true, status: 'exists', ledger: toPlain(existing) };
    }

    // 2. Money ---------------------------------------------------------------
    // What the courier actually collected. `cod_amount` is the cash due on
    // delivery; fall back to the order total when it is absent.
    const gross = round2(Math.max(0, toNum(
      order.cod_amount ?? order.codAmount ?? order.cod_balance ??
      order.codBalanceBDT ?? order.total_price ?? order.totalBDT ?? order.total,
      0
    )));
    if (gross <= 0) {
      return { ok: false, status: 'skipped', reason: 'The collected COD amount is zero.' };
    }

    const storeRef = vendor.storeSlug || vendor.vendorId;
    const courierFee = round2(Math.max(
      0,
      opts.courierFee !== undefined ? toNum(opts.courierFee, 0) : await resolveCourierFee(order, storeRef)
    ));

    // Commission is charged on the GOODS value (COD minus delivery), which is
    // the same base `persistVendorChildren` uses for a multi-vendor child
    // order. A flat courier fee is never commissioned.
    const commissionBase = round2(Math.max(0, gross - courierFee));
    const categories = parseItems(order.items)
      .map((i: any) => String(i?.category || i?.category_id || '').trim())
      .filter(Boolean);
    const ref = await resolveStoreRef(vendor.vendorId).catch(() => ({} as any));
    const commissionResult = await resolveCommission(
      { storeId: ref?.storeId || vendor.vendorId, slug: ref?.slug || vendor.storeSlug, code: ref?.code, name: vendor.vendorName },
      commissionBase,
      [...new Set(categories)]
    );
    const commission = round2(Math.min(commissionBase, commissionResult.commission_bdt));

    // Never let fees exceed the cash collected: the credit floors at zero and
    // the overflow is recorded so treasury can see an under-collected parcel.
    const vendorCredit = round2(Math.max(0, gross - courierFee - commission));
    const shortfall = round2(Math.max(0, courierFee + commission - gross));

    const courierName = String(
      opts.courierName || order.courier_name || order.courierName || 'Courier'
    ).trim();
    const now = new Date();

    const ledgerDoc: Record<string, any> = {
      order_key: orderKey,
      order_id: String(order.id || order._id || orderNumber),
      order_number: orderNumber,
      master_order_id: order.parent_order_id || order.parentOrderId || null,
      master_order_number: order.parent_order_number || order.parentOrderNumber || null,
      vendor_id: vendor.vendorId,
      store_slug: vendor.storeSlug || null,
      vendor_name: vendor.vendorName || null,
      courier_name: courierName,
      tracking_code: order.tracking_code || order.trackingCode || null,
      payment_method: order.payment_method || order.paymentMethod || 'COD',
      gross_collected: gross,
      courier_fee: courierFee,
      platform_commission: commission,
      commission_rate_percent: commissionResult.rate_percent,
      commission_rate_source: commissionResult.source,
      vendor_credit: vendorCredit,
      net_settlement: vendorCredit,
      shortfall,
      status: 'settled',
      delivered_at: opts.deliveredAt || now,
      reconciled_at: now,
      created_at: now,
      updated_at: now,
    };

    // 3. Insert (unique order_key is the idempotency guard) -------------------
    try {
      await db.collection(COD_LEDGER_COLLECTION).createIndex({ order_key: 1 }, { unique: true });
    } catch {
      // An existing non-unique index is tolerated; the pre-check still guards.
    }

    try {
      await db.collection(COD_LEDGER_COLLECTION).insertOne(ledgerDoc);
    } catch (insertErr: any) {
      if (insertErr?.code === 11000) {
        const dupe = await db.collection(COD_LEDGER_COLLECTION).findOne({ order_key: orderKey }).catch(() => null);
        return { ok: true, status: 'exists', ledger: toPlain(dupe) };
      }
      throw insertErr;
    }

    // 4. Credit the vendor wallet -------------------------------------------
    const wallet = await creditVendorWallet(vendor, {
      available: vendorCredit,
      gross,
      commission,
      courierFee,
      orderNumber,
    });

    // Back-reference so the ledger can be traced to the payout request created
    // from it, and the order record shows what it settled.
    await db.collection(COD_LEDGER_COLLECTION).updateOne(
      { order_key: orderKey },
      { $set: { wallet_id: wallet?._id ? String(wallet._id) : null } }
    ).catch(() => undefined);

    await db.collection('orders').updateOne(
      { $or: [{ order_number: orderNumber }, { id: ledgerDoc.order_id }] },
      {
        $set: {
          cod_reconciled: true,
          cod_reconciled_at: now,
          cod_gross_collected: gross,
          cod_courier_fee: courierFee,
          cod_platform_commission: commission,
          cod_vendor_credit: vendorCredit,
          payment_status: 'Paid',
          paymentStatus: 'Paid',
          updated_at: now,
        },
      }
    ).catch((err: any) => console.warn('[COD] order stamp warning:', err?.message || err));

    console.log('[COD] reconciled', {
      order: orderNumber,
      vendor: vendor.storeSlug || vendor.vendorId,
      gross, courier_fee: courierFee, commission, credit: vendorCredit,
    });

    return { ok: true, status: 'created', ledger: ledgerDoc, wallet: wallet || undefined };
  } catch (err: any) {
    console.warn('[COD] reconcileCodDelivery warning:', err?.message || err);
    return { ok: false, status: 'error', error: err?.message || 'COD reconciliation failed.' };
  }
}

/* ───────────────────────────── reads ───────────────────────────── */

export interface LedgerQuery {
  vendorId?: string;
  storeSlug?: string;
  orderNumber?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
}

/** List COD ledger rows, newest first, with a money summary. */
export async function listCodLedger(query: LedgerQuery = {}): Promise<{
  ok: boolean;
  entries: any[];
  summary: { count: number; gross: number; courier: number; commission: number; credit: number };
  error?: string;
}> {
  const summary = { count: 0, gross: 0, courier: 0, commission: 0, credit: 0 };
  try {
    const db = await getMongoDb(DB_NAME);
    if (!db) return { ok: false, entries: [], summary, error: 'The database is unavailable.' };

    const and: Record<string, any>[] = [];
    if (query.vendorId) {
      and.push({ $or: [{ vendor_id: query.vendorId }, ...(query.storeSlug ? [{ store_slug: query.storeSlug }] : [])] });
    } else if (query.storeSlug) {
      and.push({ store_slug: query.storeSlug });
    }
    if (query.orderNumber) and.push({ order_number: String(query.orderNumber) });
    if (query.status) and.push({ status: String(query.status) });
    if (query.from || query.to) {
      const range: Record<string, any> = {};
      if (query.from) range.$gte = new Date(query.from);
      if (query.to) range.$lte = new Date(query.to);
      and.push({ reconciled_at: range });
    }

    const limit = Math.min(1000, Math.max(1, Math.floor(toNum(query.limit, 200))));
    const rows = await db
      .collection(COD_LEDGER_COLLECTION)
      .find(and.length ? { $and: and } : {})
      .sort({ reconciled_at: -1 })
      .limit(limit)
      .toArray();

    for (const row of rows) {
      summary.count += 1;
      summary.gross = round2(summary.gross + toNum(row.gross_collected));
      summary.courier = round2(summary.courier + toNum(row.courier_fee));
      summary.commission = round2(summary.commission + toNum(row.platform_commission));
      summary.credit = round2(summary.credit + toNum(row.vendor_credit));
    }
    return { ok: true, entries: rows.map(toPlain), summary };
  } catch (err: any) {
    return { ok: false, entries: [], summary, error: err?.message || 'The COD ledger could not be read.' };
  }
}

/* ─────────────── backfill: already-Paid orders → wallet ─────────────── */

/**
 * RESOLVE ANY VENDOR REFERENCE TO EVERY SPELLING THIS MERCHANT'S ROWS USE.
 *
 * The dashboard sends `vendor_id=<id>`, and that value can be the store's
 * Mongo `_id` (`6acfd031…`), its `id`/`store_id` (a UUID or `ZID-BD-…`), the
 * slug (`mystore`) or an email — four different identities for one merchant.
 * 
 * `resolveStoreRef()` only recognises UUID / ZID code / slug, so it treats a
 * Mongo `_id` as a SLUG and resolves nothing; matching on that literal value
 * then finds no order and no wallet. Here the id is looked up in `stores` first
 * (ObjectId or string) and its canonical id + slug are added to the candidate
 * set, so the query is correct whatever spelling the browser sent.
 *
 * A slug with no `stores` row is still a valid identity: the merchant's rows
 * are keyed on it, so it is kept and matched as a slug.
 */
async function resolveVendorIdentities(
  vendorRef: string
): Promise<{ ids: string[]; slugs: string[]; name?: string }> {
  const raw = String(vendorRef || '').split(':')[0].trim();
  const ids = new Set<string>();
  const slugs = new Set<string>();
  let name: string | undefined;
  if (!raw) return { ids: [], slugs: [] };
  ids.add(raw);

  // A Mongo ObjectId arrives as a 24-char hex string; it is a document key, not
  // a slug, so it is never matched as one.
  const isObjectId = /^[0-9a-f]{24}$/i.test(raw);
  if (!isObjectId) slugs.add(raw.toLowerCase());

  const ref = await resolveStoreRef(raw).catch(() => ({} as any));
  if (ref?.storeId) ids.add(String(ref.storeId));
  if (ref?.slug) slugs.add(String(ref.slug).toLowerCase());

  try {
    const dbs = await getTenantDbs(DB_NAME);
    for (const db of dbs) {
      const orClauses: Record<string, any>[] = [
        { id: raw }, { store_id: raw }, { store_code: raw }, { store_code: raw.toUpperCase() },
        { store_slug: raw }, { storeSlug: raw },
        { store_slug: raw.toLowerCase() }, { storeSlug: raw.toLowerCase() },
        // A merchant may hold the store under its email (the dashboard can send
        // the merchant email as the vendor ref). Harmless when stores have no
        // email field — those clauses simply never match.
        ...(/@/.test(raw) ? [{ email: raw }, { storeEmail: raw }] : []),
      ];
      if (isObjectId) {
        try {
          const { ObjectId } = await import('mongodb');
          orClauses.push({ _id: new ObjectId(raw) } as any);
        } catch { /* ignore */ }
        orClauses.push({ _id: raw } as any);
      }
      const store = await db.collection('stores').findOne({ $or: orClauses }).catch(() => null);
      if (!store) continue;
      for (const value of [store.id, store.store_id, store.store_code, store._id && String(store._id)]) {
        if (value) ids.add(String(value));
      }
      if (store.store_slug || store.storeSlug) {
        slugs.add(String(store.store_slug || store.storeSlug).toLowerCase());
      }
      // The wallet shows this name; a single-store order record carries no
      // `vendor_name`, so it is taken from the store row itself.
      name = String(store.store_name || store.storeName || store.name || '').trim() || undefined;
      break; // first database that knows this store wins
    }
  } catch (err: any) {
    console.warn('[COD] resolveVendorIdentities warning:', err?.message || err);
  }

  return { ids: Array.from(ids).filter(Boolean), slugs: Array.from(slugs).filter(Boolean), ...(name ? { name } : {}) };
}

/**
 * Mongo clauses matching an order/wallet row that belongs to these identities.
 * `ids` cover `vendor_id` AND the single-store spellings (`store_id`,
 * `merchant_id`), because an order created for one store carries those and may
 * have no `vendor_id` at all.
 */
function identityClauses(identities: { ids: string[]; slugs: string[] }): Record<string, any>[] {
  const clauses: Record<string, any>[] = [];
  for (const id of identities.ids) {
    clauses.push(
      { vendor_id: id }, { vendorId: id },
      { store_id: id }, { storeId: id },
      { merchant_id: id }, { merchantId: id },
    );
  }
  for (const slug of identities.slugs) clauses.push({ store_slug: slug }, { storeSlug: slug });
  return clauses;
}

/**
 * Settlement clauses (`vendor_payouts` / `cod_ledger` rows) for one order.
 *
 * A checkout-written payout row is keyed by `vendor_id`/`store_slug`; a
 * single-store order's own record says `store_id`. Both are matched, so an
 * order that was ALREADY settled is never credited twice just because it was
 * written by a different path.
 */
function settlementClausesForOrder(
  orderNumber: string,
  identities: { ids: string[]; slugs: string[] },
  orderDoc: Record<string, any>,
): Record<string, any>[] {
  const orderIds = Array.from(new Set([
    ...identities.ids,
    orderDoc.vendor_id, orderDoc.vendorId,
    orderDoc.store_id, orderDoc.storeId,
    orderDoc.merchant_id, orderDoc.merchantId,
  ].map((v) => String(v || '').trim()).filter(Boolean)));

  const clauses: Record<string, any>[] = [];
  for (const id of orderIds) {
    clauses.push({ order_number: orderNumber, vendor_id: id });
    clauses.push({ child_order_number: orderNumber, vendor_id: id });
    clauses.push({ order_key: `${id}::${orderNumber}` });
  }
  for (const slug of identities.slugs) {
    clauses.push({ order_number: orderNumber, store_slug: slug });
  }
  if (orderDoc.id) {
    clauses.push({ child_order_id: String(orderDoc.id) });
  }
  return clauses;
}

/**
 * One reconcile pass per vendor at a time.
 *
 * The wallet panel and the payout list load together, and every read heals the
 * wallet. Without this lock two overlapping passes could both read the same
 * "not yet credited" gap and both write it. A pass takes a few hundred ms, so
 * sharing one promise is invisible to the UI and keeps the balance exact.
 */
const reconcileInFlight = new Map<string, Promise<any>>();

/**
 * Is this order a TRUE cash-on-delivery parcel that must not be wallet-credited
 * here?
 *
 * `buildOrderRecord` stores `payment_method: 'COD'` whenever the checkout did
 * not send one, so a bKash / Telegram-approved order commonly arrives looking
 * exactly like a COD order. Skipping on the payment method alone therefore
 * SKIPPED THE VERY ORDERS THIS FUNCTION EXISTS TO CREDIT ("Paid", ৳1,071, no
 * wallet entry).
 *
 * A COD parcel is identified by what actually happened to it:
 *   • `cod_reconciled` / a `cod_gross_collected` figure — the courier collected
 *     the cash and `cod_ledger` already settled it (that ledger row is handled
 *     separately, and authoritatively, in `creditedAmountForOrder`), or
 *   • the advance (delivery fee paid up front) already covers the whole order,
 *     so there is nothing left to collect at the door.
 *
 * NOTE: `cod_amount` is NOT evidence — every order carries it (it is set from
 * the order total in `buildOrderRecord`).
 */
function isTrueCodOrder(orderDoc: Record<string, any>): boolean {
  if (orderDoc.cod_reconciled === true) return true;
  if (toNum(orderDoc.cod_gross_collected, 0) > 0) return true;
  const total = toNum(orderDoc.totalBDT ?? orderDoc.total_price ?? orderDoc.total, 0);
  const advance = toNum(orderDoc.advance_delivery_paid ?? orderDoc.advanceDeliveryPaidBDT, 0);
  if (total > 0 && advance >= total) return true;
  return false;
}

/** Any evidence the customer actually paid through a channel (not at the door). */
function hasPrepaidEvidence(orderDoc: Record<string, any>): boolean {
  const method = String(orderDoc.payment_method || orderDoc.paymentMethod || '').toLowerCase();
  if (method && !method.includes('cod') && !method.includes('cash')) return true;
  if (String(orderDoc.transaction_id || orderDoc.transactionId || orderDoc.trx_id || '').trim()) return true;
  if (String(orderDoc.payment_verified_at || orderDoc.paymentVerifiedAt || '').trim()) return true;
  return false;
}

/** Money already credited to this wallet, from ANY settlement path. */
async function creditedAmountForOrder(
  db: any,
  filters: Record<string, any>[]
): Promise<{ credited: number; settled: boolean }> {
  if (!filters.length) return { credited: 0, settled: false };
  let credited = 0;
  const done = async (collection: string, pick: (doc: any) => number) => {
    const doc = await db.collection(collection).findOne({ $or: filters }).catch(() => null);
    if (doc) credited = Math.max(credited, pick(doc));
    return doc;
  };
  await done(PAYOUT_COLLECTION, (d: any) =>
    toNum(d?.net_payout_bdt ?? d?.net_payable_amount_bdt ?? d?.net_payable_bdt ?? d?.amount_bdt, 0));
  /*
   * A `cod_ledger` row is the authoritative cash settlement: its vendor_credit
   * already had the courier fee deducted, so that order needs no top-up.
   *
   * It only counts when it actually CARRIES a credit — a zero/absent value means
   * the ledger row exists but nothing was released, and treating that as
   * "settled" would leave the merchant permanently at ৳0.
   */
  const ledgerRow = await done(COD_LEDGER_COLLECTION, (d: any) => toNum(d?.vendor_credit ?? d?.net_settlement, 0));
  const settled = Boolean(ledgerRow) && toNum((ledgerRow as any)?.vendor_credit ?? (ledgerRow as any)?.net_settlement, 0) > 0;
  return { credited, settled };
}

/**
 * BRING A VENDOR'S WALLET IN LINE WITH THE ORDERS ALREADY MARKED PAID.
 *
 * The wallet was credited at the moment a payment was approved. Any approval
 * that happened through a path which did not credit (or an approval that was
 * only mirrored to Supabase) left a Paid order with ৳0 in the wallet: the
 * orders screen says "Paid", the wallet says "nothing yet".
 *
 * This pass reconciles the two — it is safe to run on every wallet read:
 *
 *   • MISSING CREDIT — a Paid order that no settlement record covers is
 *     credited now, through the SAME `creditVendorWallet` used everywhere else,
 *     so the wallet shape never diverges.
 *   • TOP-UP — a settlement that exists but credited less than the order's
 *     payable (e.g. only the platform payout row was written) is topped up to
 *     the payable, never above it.
 *   • NO DOUBLE CREDIT — the credit is the DIFFERENCE between what the order
 *     pays and what its settlement rows already granted, so a repeated read (or
 *     a second tab) adds zero. Re-running this forever is a no-op.
 *
 * Refuses a payment the platform voided/cancelled, and only looks at orders
 * belonging to this very vendor, so one merchant's wallet can never absorb
 * another's money.
 */
export async function reconcileVendorWalletWithPaidOrders(
  vendorRef: string,
  opts: { limit?: number } = {}
): Promise<{ ok: boolean; scanned: number; creditedCount: number; creditedBDT: number; error?: string }> {
  const result = { ok: false, scanned: 0, creditedCount: 0, creditedBDT: 0, error: undefined as string | undefined };
  // Why scanned orders were skipped — diagnostic only, no secrets.
  const skipped: Record<string, number> = {};
  const bump = (reason: string) => { skipped[reason] = (skipped[reason] || 0) + 1; };
  try {
    if (!vendorRef) return { ...result, error: 'A vendor id or store slug is required.', skipped };

    // Every cluster that may hold this merchant's data — the shared pool alone
    // can be pinned to the EMPTY secondary (see `getTenantDbs`).
    const dbs = await getTenantDbs(DB_NAME);
    if (!dbs.length) return { ...result, error: 'The database is unavailable.', skipped };

    const identities = await resolveVendorIdentities(vendorRef);
    const ref = await resolveStoreRef(vendorRef).catch(() => ({} as any));
    // Prefer the STORE's canonical id when known: `identities.ids` may start
    // with a Mongo `_id`, which is a unique document key but not the value the
    // order rows carry.
    const vendorId = String(ref.storeId || '').trim() || identities.ids[0] || String(vendorRef).trim();
    // `ref.slug` can be a wrong guess (e.g. a Mongo _id treated as a slug by
    // `resolveStoreRef`). Prefer the real store slug resolved from the store row
    // in `identities.slugs`, falling back to ref.slug only when nothing else is
    // known. ObjectId-shaped strings are never store slugs.
    const isObjectIdShape = /^[0-9a-f]{24}$/i;
    const realSlug = identities.slugs.find((s) => !isObjectIdShape.test(s)) || identities.slugs[0] || '';
    const slug = String(realSlug || ref.slug || '').trim().toLowerCase();

    // Exactly the identifiers this vendor's orders/products carry.
    const identityOr = identityClauses(identities);
    if (slug) identityOr.push({ store_slug: slug }, { storeSlug: slug });

    const limit = Math.min(500, Math.max(1, Math.floor(toNum(opts.limit, 200))));
    /**
     * ORDER NUMBERS ALREADY HANDLED — by ANY database.
     *
     * Two clusters can both carry a row for the same order number. Without this
     * guard each database's copy would be credited once, doubling the money.
     * The set is shared across handles so each order is settled exactly once.
     */
    const handled = new Set<string>();

    for (const db of dbs) {
      const rows = await db
        .collection('orders')
        .find({
          $and: [
            { $or: identityOr },
            { $or: [{ payment_status: /^paid$/i }, { paymentStatus: /^paid$/i }] },
            { status: { $not: /^(cancelled|canceled|refunded|void|voided)$/i } },
          ],
        })
        .limit(limit)
        .toArray()
        .catch(() => [] as any[]);

      // Diagnostic: how many Paid orders this db holds for this vendor.
      console.log('[Wallet] orders scanned on db', {
        vendor: vendorRef, slug, vendorId,
        rowsFound: rows.length, limit,
        sampleIds: rows.slice(0, 3).map((r: any) => ({
          order_number: r.order_number || r.orderNumber || r.id,
          payment_status: r.payment_status || r.paymentStatus,
          status: r.status,
          store_id: r.store_id || r.storeId,
          store_slug: r.store_slug || r.storeSlug,
          vendor_id: r.vendor_id || r.vendorId,
        })),
      });

      for (const row of rows as any[]) {
        result.scanned += 1;
        const orderDoc = toPlain(row);
        const orderNumber = String(
          orderDoc.order_number || orderDoc.orderNumber || orderDoc.id || ''
        ).replace(/^#/, '').trim();
        if (!orderNumber) { bump('no_order_number'); continue; }
        // Already settled from another cluster's copy of this same order.
        if (handled.has(orderNumber)) { bump('duplicate_cross_cluster'); continue; }
        handled.add(orderNumber);

        /*
         * SKIP WHAT THIS PASS MUST NOT TOUCH:
         *
         *   • A TRUE COD parcel — its cash is settled by `cod_ledger` on delivery
         *     (courier fee deducted). Crediting the order total here would pay the
         *     vendor the courier's cut a second time. `isTrueCodOrder` decides this
         *     from actual evidence (`cod_reconciled`, `cod_gross_collected`, or a
         *     fully prepaid advance) — NOT from the payment-method label.
         *   • A MASTER basket — the payable lives on each vendor CHILD, so paying
         *     the master as well would double-credit the whole basket.
         *
         * A PAID order is owed its vendor credit whatever its payment-method label:
         * `buildOrderRecord()` defaults the label to 'COD' when checkout sends none,
         * so a bKash/Telegram-approved order looks like a COD parcel. Skipping on
         * the label alone skipped exactly the orders this pass exists to credit.
         */
        // Only a TRUE COD parcel is settled elsewhere (cod_ledger); skip it here.
        if (isTrueCodOrder(orderDoc)) { bump('true_cod_parcel'); continue; }

        const isMaster = orderDoc.order_type === 'master' ||
          (Array.isArray(orderDoc.child_order_ids) && orderDoc.child_order_ids.length > 0) ||
          (Array.isArray(orderDoc.childOrderIds) && orderDoc.childOrderIds.length > 0);
        if (isMaster) { bump('master_order'); continue; }

        // Settlements are keyed by vendor + order; probe every id spelling that
        // this order and this store can be known by (see settlementClausesForOrder).
        const settlementFilters = settlementClausesForOrder(orderNumber, identities, orderDoc);

        const totalBDT = round2(Math.max(0, toNum(
          orderDoc.totalBDT ?? orderDoc.total_price ?? orderDoc.total_bdt ??
          orderDoc.cod_amount ?? orderDoc.total, 0
        )));
        const commissionBDT = round2(Math.max(0, toNum(orderDoc.commission_bdt ?? orderDoc.commissionBdt, 0)));
        const payable = round2(Math.max(
          0,
          toNum(orderDoc.vendor_net_payable_bdt ?? orderDoc.vendorNetPayableBdt, totalBDT - commissionBDT)
        ));
        if (payable <= 0) { bump('zero_payable'); continue; }

        const settlement = await creditedAmountForOrder(db, settlementFilters);
        // A COD settlement or an explicit "already released" flag is final.
        if (settlement.settled) { bump('already_settled'); continue; }
        let credited = settlement.credited;
        if (String(orderDoc.wallet_credited || '').trim().toLowerCase() === 'true') {
          credited = Math.max(credited, payable);
        }

        const gap = round2(payable - credited);
        if (gap <= 0.004) { bump('already_settled'); continue; } // already settled — nothing to do

        // Credited on the SAME cluster the order was read from (see
        // `creditVendorWallet`), so the real wallet is the one that grows.
        const wallet = await creditVendorWallet(
          {
            vendorId,
            ...(slug ? { storeSlug: slug } : {}),
            ...(String(orderDoc.vendor_name || orderDoc.store_name || identities.name || '').trim()
              ? { vendorName: String(orderDoc.vendor_name || orderDoc.store_name || identities.name).trim() }
              : {}),
          },
          { available: gap, gross: totalBDT, commission: commissionBDT, courierFee: 0, orderNumber },
          db
        );
        if (!wallet) { bump('credit_failed'); continue; }

        result.creditedCount += 1;
        result.creditedBDT = round2(result.creditedBDT + gap);

        await db.collection('orders').updateOne(
          { _id: row._id },
          { $set: { wallet_credited: true, wallet_credited_at: new Date(), updated_at: new Date() } }
        ).catch(() => undefined);
        console.log('[COD] wallet backfilled from a Paid order', { orderNumber, vendor: slug || vendorId, gap });
      }
    }

    // Diagnostic summary for Render logs: how many Paid orders were scanned,
    // how many were skipped and why, and how much was credited. No secrets.
    console.log('[Wallet] reconcile pass', {
      vendor: vendorRef, slug, vendorId, dbs: dbs.length,
      scanned: result.scanned, skipped,
      creditedCount: result.creditedCount, creditedBDT: result.creditedBDT,
    });

    return { ...result, ok: true, skipped };
  } catch (err: any) {
    console.warn('[COD] reconcileVendorWalletWithPaidOrders warning:', err?.message || err);
    return { ...result, error: err?.message || 'The wallet could not be reconciled.', skipped };
  }
}

/** Read (or lazily create) one vendor's wallet. */
export async function getVendorWallet(vendorRef: string): Promise<{ ok: boolean; wallet: Record<string, any> | null; error?: string }> {
  try {
    if (!vendorRef) return { ok: false, wallet: null, error: 'A vendor id or store slug is required.' };

    /*
     * READ FROM EVERY CLUSTER THAT COULD HOLD THIS MERCHANT.
     *
     * `getMongoDb()` alone answers from the shared pool, and that pool fails
     * over to MONGODB_URI_2 — a DIFFERENT cluster with no orders and no wallet.
     * A merchant whose orders live on the primary then got a perfectly valid
     * HTTP 200 carrying `available_bdt: 0`, because the only database this
     * function ever asked held nothing. The first handle that actually HAS a
     * wallet wins; if none has one, the summed orders decision below applies.
     */
    const dbs = await getTenantDbs(DB_NAME);
    if (!dbs.length) return { ok: false, wallet: null, error: 'The database is unavailable.' };

    const identities = await resolveVendorIdentities(vendorRef);
    const ref = await resolveStoreRef(vendorRef);
    const or = identityClauses(identities);
    if (ref.slug) or.push({ store_slug: ref.slug }, { storeSlug: ref.slug });

    // The real store slug for diagnostics; prefer the slug resolved from the
    // store row, falling back to ref.slug then the vendor ref itself. Always
    // defined so no ReferenceError can escape to the wallet handler.
    const slug = String(identities.slugs[0] || ref.slug || vendorRef).trim().toLowerCase();

    // Diagnostic: who this wallet read is for and which clusters it will ask.
    // No secrets — store identifiers only.
    console.log('[Wallet] getVendorWallet', {
      vendor: vendorRef, slug, ids: identities.ids, slugs: identities.slugs,
      ref: { storeId: ref.storeId, slug: ref.slug }, dbs: dbs.length,
    });

    /*
     * SELF-HEAL BEFORE READING — EXACTLY ONCE.
     *
     * An order can be Paid without its approval having credited this wallet
     * (the credit used to live only on one approval path), which is exactly the
     * "orders say Paid, wallet says ৳0" state. `reconcileVendorWalletWithPaidOrders`
     * expands the reference to every id/slug spelling itself and credits only the
     * MISSING difference, so a single call covers the merchant.
     *
     * It must be ONE call, not one per identity: two concurrent reconciles could
     * both read the same gap and both credit it. `reconcileInFlight` additionally
     * collapses parallel wallet reads (the UI asks for wallet + payouts together)
     * onto one pass.
     */
    const inFlightKey = String(vendorRef).toLowerCase();
    const existingRun = reconcileInFlight.get(inFlightKey);
    let reconcileResult: any = undefined;
    if (existingRun) {
      await existingRun.catch(() => undefined);
      reconcileResult = { fromFlight: true };
    } else {
      const run = reconcileVendorWalletWithPaidOrders(vendorRef).catch((err: any) => ({ error: err?.message || err }));
      reconcileInFlight.set(inFlightKey, run as Promise<any>);
      try {
        reconcileResult = await run;
      } finally {
        reconcileInFlight.delete(inFlightKey);
      }
    }

    // Diagnostic: result of the self-heal reconcile pass before reading wallets.
    console.log('[Wallet] reconcile result', {
      vendor: vendorRef, slug, vendorId,
      scanned: reconcileResult?.scanned, creditedCount: reconcileResult?.creditedCount,
      creditedBDT: reconcileResult?.creditedBDT, skipped: reconcileResult?.skipped,
      error: reconcileResult?.error, fromFlight: reconcileResult?.fromFlight,
    });

    let best: Record<string, any> | null = null;
    let walletsSeen = 0;
    for (const db of dbs) {
      const wallet = await db.collection(VENDOR_WALLETS_COLLECTION).findOne({ $or: or }).catch(() => null);
      if (!wallet) continue;
      walletsSeen += 1;
      const plain = toPlain(wallet);
      console.log('[Wallet] wallet doc on db', {
        vendor: vendorRef, vendor_id: plain.vendor_id, store_slug: plain.store_slug,
        available_bdt: plain.available_bdt, lifetime_credit_bdt: plain.lifetime_credit_bdt,
        lifetime_paid_bdt: plain.lifetime_paid_bdt, pending_payout_bdt: plain.pending_payout_bdt,
      });
      // Prefer the wallet that actually carries money (or history); an empty
      // stray document must not hide a funded one on another cluster.
      if (!best || toNum(plain?.lifetime_credit_bdt) > toNum(best?.lifetime_credit_bdt)) best = plain;
    }
    if (best) {
      console.log('[Wallet] getVendorWallet hit', {
        vendor: vendorRef, walletsSeen, available_bdt: best.available_bdt,
        lifetime_credit_bdt: best.lifetime_credit_bdt, lifetime_paid_bdt: best.lifetime_paid_bdt,
        pending_payout_bdt: best.pending_payout_bdt, vendor_id: best.vendor_id, store_slug: best.store_slug,
      });
      return { ok: true, wallet: best };
    }

    console.log('[Wallet] getVendorWallet empty', {
      vendor: vendorRef, walletsSeen, reason: 'no_wallet_document_across_clusters',
    });

    // No settlement yet — answer with a zeroed wallet rather than a 404 so the
    // dashboard can render "৳0 available" instead of an error state.
    const empty = {
      vendor_id: identities.ids[0] || String(vendorRef),
      store_slug: identities.slugs[0] || ref.slug || null,
      available_bdt: 0,
      pending_payout_bdt: 0,
      lifetime_credit_bdt: 0,
      lifetime_paid_bdt: 0,
      cod_orders_count: 0,
      created_at: null,
      is_new: true,
    };
    return { ok: true, wallet: empty };
  } catch (err: any) {
    return { ok: false, wallet: null, error: err?.message || 'The wallet could not be read.' };
  }
}

/* ─────────────────────── payout requests ─────────────────────── */

/** Platform rules for withdrawals (env-overridable). */
export const PAYOUT_RULES = {
  /** Minimum a vendor may withdraw in one request. */
  minAmountBDT: toNum(process.env.PAYOUT_MIN_BDT, 500),
  /** Requests above this need manual review (still allowed). */
  reviewThresholdBDT: toNum(process.env.PAYOUT_REVIEW_BDT, 50000),
};

export interface PayoutRequestInput {
  vendorRef: string;
  amountBDT: number;
  method?: string;
  accountName?: string;
  accountNumber?: string;
  bankName?: string;
  notes?: string;
  requestedBy?: string;
}

/**
 * LOG A VENDOR WITHDRAWAL REQUEST.
 *
 * The money is MOVED, not copied: `available_bdt` decreases and
 * `pending_payout_bdt` increases in one atomic update, so two concurrent
 * requests can never withdraw the same taka. The debit is a conditional
 * `$inc` guarded by `available_bdt >= amount`, which is what makes the check
 * race-free (a plain read-then-write would let both requests pass).
 */
export async function createPayoutRequest(input: PayoutRequestInput): Promise<{
  ok: boolean; request?: Record<string, any>; wallet?: Record<string, any>; error?: string;
}> {
  try {
    // Validate the request BEFORE touching the database, so the vendor gets the
    // real reason ("below minimum") instead of an infrastructure error.
    const amount = round2(toNum(input.amountBDT, 0));
    if (!(amount > 0)) return { ok: false, error: 'Enter a withdrawal amount greater than zero.' };
    if (amount < PAYOUT_RULES.minAmountBDT) {
      return { ok: false, error: `The minimum withdrawal is ৳${PAYOUT_RULES.minAmountBDT}.` };
    }

    const db = await getMongoDb(DB_NAME);
    if (!db) return { ok: false, error: 'The database is unavailable.' };

    const ref = await resolveStoreRef(input.vendorRef);
    const vendorId = ref.storeId || String(input.vendorRef);
    const or = [
      { vendor_id: vendorId },
      ...(ref.slug ? [{ store_slug: ref.slug }] : []),
      { vendor_id: String(input.vendorRef) },
    ];

    // Atomic, race-free debit: only succeeds when the balance covers it.
    const debit = await db.collection(VENDOR_WALLETS_COLLECTION).findOneAndUpdate(
      { $and: [{ $or: or }, { available_bdt: { $gte: amount } }] },
      {
        $inc: { available_bdt: -amount, pending_payout_bdt: amount, withdrawn_bdt: amount },
        $set: { updated_at: new Date() },
      },
      { returnDocument: 'after' }
    );

    const wallet = (debit as any)?.value ?? (debit as any);
    if (!wallet || !wallet.vendor_id) {
      const current = await db.collection(VENDOR_WALLETS_COLLECTION).findOne({ $or: or }).catch(() => null);
      const available = toNum(current?.available_bdt, 0);
      return {
        ok: false,
        error: available > 0
          ? `Insufficient available balance. You can withdraw up to ৳${available.toFixed(2)}.`
          : 'No settled COD earnings are available to withdraw yet.',
        wallet: toPlain(current),
      };
    }

    const requestDoc: Record<string, any> = {
      request_number: `PR-${Date.now().toString(36).toUpperCase()}`,
      vendor_id: vendorId,
      store_slug: ref.slug || wallet.store_slug || null,
      vendor_name: wallet.vendor_name || null,
      amount_bdt: amount,
      status: 'pending',
      requires_review: amount >= PAYOUT_RULES.reviewThresholdBDT,
      method: input.method || null,
      account_name: input.accountName || null,
      account_number: input.accountNumber || null,
      bank_name: input.bankName || null,
      notes: input.notes || null,
      requested_by: input.requestedBy || null,
      requested_at: new Date(),
      processed_at: null,
      payout_reference: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const res = await db.collection(PAYOUT_REQUESTS_COLLECTION).insertOne(requestDoc);

    return {
      ok: true,
      request: { ...requestDoc, _id: String(res.insertedId) },
      wallet: { ...toPlain(wallet), _id: wallet._id != null ? String(wallet._id) : undefined },
    };
  } catch (err: any) {
    console.warn('[COD] createPayoutRequest warning:', err?.message || err);
    return { ok: false, error: err?.message || 'The payout request could not be created.' };
  }
}

/** List payout requests for a vendor (or the whole platform for an admin). */
export async function listPayoutRequests(query: {
  vendorId?: string; storeSlug?: string; status?: string; limit?: number;
} = {}): Promise<{ ok: boolean; requests: any[]; summary: { pending_bdt: number; paid_bdt: number }; error?: string }> {
  const summary = { pending_bdt: 0, paid_bdt: 0 };
  try {
    const db = await getMongoDb(DB_NAME);
    if (!db) return { ok: false, requests: [], summary, error: 'The database is unavailable.' };

    const and: Record<string, any>[] = [];
    if (query.vendorId) {
      and.push({ $or: [{ vendor_id: query.vendorId }, ...(query.storeSlug ? [{ store_slug: query.storeSlug }] : [])] });
    } else if (query.storeSlug) {
      and.push({ store_slug: query.storeSlug });
    }
    if (query.status) and.push({ status: String(query.status) });

    const limit = Math.min(1000, Math.max(1, Math.floor(toNum(query.limit, 100))));
    const rows = await db
      .collection(PAYOUT_REQUESTS_COLLECTION)
      .find(and.length ? { $and: and } : {})
      .sort({ requested_at: -1 })
      .limit(limit)
      .toArray();

    for (const row of rows) {
      if (row.status === 'paid') summary.paid_bdt = round2(summary.paid_bdt + toNum(row.amount_bdt));
      else if (row.status === 'pending' || row.status === 'approved') {
        summary.pending_bdt = round2(summary.pending_bdt + toNum(row.amount_bdt));
      }
    }
    return { ok: true, requests: rows.map(toPlain), summary };
  } catch (err: any) {
    return { ok: false, requests: [], summary, error: err?.message || 'Payout requests could not be read.' };
  }
}

/**
 * Approve / pay / reject a payout request.
 *
 * Lifecycle:
 *   pending   → approved | rejected
 *   approved  → paid | rejected
 *   rejected  → (money returned to `available_bdt`)
 *
 * `paid` moves money OUT of `pending_payout_bdt` and into `lifetime_paid_bdt`.
 * `rejected` returns the held amount to the vendor's available balance.
 */
export async function updatePayoutRequest(
  requestId: string,
  patch: { status: string; payout_reference?: string; notes?: string; processedBy?: string }
): Promise<{ ok: boolean; request?: Record<string, any>; error?: string }> {
  try {
    const db = await getMongoDb(DB_NAME);
    if (!db) return { ok: false, error: 'The database is unavailable.' };
    const allowed = ['pending', 'approved', 'paid', 'rejected', 'cancelled'];
    const status = allowed.includes(patch.status) ? patch.status : '';
    if (!status) return { ok: false, error: `status must be one of: ${allowed.join(', ')}` };

    const filter = mongoose.Types.ObjectId.isValid(String(requestId))
      ? { _id: new mongoose.Types.ObjectId(String(requestId)) }
      : { request_number: String(requestId) };

    const current: any = await db.collection(PAYOUT_REQUESTS_COLLECTION).findOne(filter).catch(() => null);
    if (!current) return { ok: false, error: 'Payout request not found.' };

    const amount = toNum(current.amount_bdt, 0);
    const or = [
      { vendor_id: current.vendor_id },
      ...(current.store_slug ? [{ store_slug: current.store_slug }] : []),
    ];

    // Money movement per transition.
    if (status === 'paid' && current.status !== 'paid') {
      await db.collection(VENDOR_WALLETS_COLLECTION).updateOne(
        { $or: or },
        { $inc: { pending_payout_bdt: -amount, lifetime_paid_bdt: amount }, $set: { last_payout_at: new Date(), updated_at: new Date() } }
      );
    } else if ((status === 'rejected' || status === 'cancelled') && current.status !== 'rejected' && current.status !== 'cancelled') {
      // Return the hold to the vendor.
      await db.collection(VENDOR_WALLETS_COLLECTION).updateOne(
        { $or: or },
        { $inc: { pending_payout_bdt: -amount, available_bdt: amount, withdrawn_bdt: -amount }, $set: { updated_at: new Date() } }
      );
    }

    const set: Record<string, any> = {
      status,
      updated_at: new Date(),
      ...(patch.payout_reference ? { payout_reference: String(patch.payout_reference) } : {}),
      ...(patch.notes ? { notes: String(patch.notes) } : {}),
      ...(patch.processedBy ? { processed_by: String(patch.processedBy) } : {}),
      ...(status !== 'pending' ? { processed_at: new Date() } : {}),
    };
    await db.collection(PAYOUT_REQUESTS_COLLECTION).updateOne(filter, { $set: set });
    const fresh = await db.collection(PAYOUT_REQUESTS_COLLECTION).findOne(filter).catch(() => null);
    return { ok: true, request: toPlain(fresh) };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'The payout request could not be updated.' };
  }
}
