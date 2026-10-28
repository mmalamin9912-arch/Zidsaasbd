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
import { getMongoDb, DB_NAME } from './db.js';
import { resolveStoreRef, storeMatchClauses, resolveCommission } from './marketplace.js';

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
  amounts: { available: number; gross: number; commission: number; courierFee: number; orderNumber: string }
): Promise<Record<string, any> | null> {
  const db = await getMongoDb(DB_NAME);
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

/** Read (or lazily create) one vendor's wallet. */
export async function getVendorWallet(vendorRef: string): Promise<{ ok: boolean; wallet: Record<string, any> | null; error?: string }> {
  try {
    const db = await getMongoDb(DB_NAME);
    if (!db) return { ok: false, wallet: null, error: 'The database is unavailable.' };
    if (!vendorRef) return { ok: false, wallet: null, error: 'A vendor id or store slug is required.' };

    const ref = await resolveStoreRef(vendorRef);
    const or = [
      { vendor_id: String(vendorRef) },
      ...(ref.storeId ? [{ vendor_id: ref.storeId }] : []),
      ...(ref.slug ? [{ store_slug: ref.slug }] : []),
    ];
    const existing = await db.collection(VENDOR_WALLETS_COLLECTION).findOne({ $or: or }).catch(() => null);
    if (existing) return { ok: true, wallet: toPlain(existing) };

    // No settlement yet — answer with a zeroed wallet rather than a 404 so the
    // dashboard can render "৳0 available" instead of an error state.
    const empty = {
      vendor_id: ref.storeId || String(vendorRef),
      store_slug: ref.slug || null,
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
