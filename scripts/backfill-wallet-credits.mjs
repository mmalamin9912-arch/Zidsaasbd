/**
 * BACKFILL: credit the vendor wallet for orders already marked Paid but never credited.
 *
 * Usage:
 *   MONGODB_URI="mongodb://..." node scripts/backfill-wallet-credits.mjs
 *
 * Safety rules:
 *   • Skips COD orders (settled via cod_ledger on delivery — already idempotent).
 *   • Skips orders whose order_number already has a cod_ledger row (already settled).
 *   • Skips orders already carrying wallet_credited: true (already processed).
 *   • Skips orders with no vendor_id or zero net amount.
 *   • Never throws — logs errors per order and continues.
 */
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'], quiet: true });

import { getMongoDb } from '../lib/db.js';
import { creditVendorWallet } from '../lib/codLedger.js';

const DB_NAME = 'zidbdsaas';

function toNum(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
}
function round2(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }

async function main() {
  const uriOk = Boolean(process.env.MONGODB_URI || process.env.MONGODB_URI_2 || process.env.DATABASE_URL);
  if (!uriOk) {
    console.error('MONGODB_URI (or MONGODB_URI_2 / DATABASE_URL) is not set.');
    process.exitCode = 1;
    return;
  }

  const db = await getMongoDb(DB_NAME).catch((e) => {
    console.error('DB connect failed:', e?.message || e);
    return null;
  });
  if (!db) {
    console.error('Database unavailable.');
    process.exitCode = 1;
    return;
  }

  // 1. Existing cod_ledger order_keys — orders already settled via COD delivery.
  const ledgerRows = await db.collection('cod_ledger').find({}, { projection: { order_number: 1, vendor_id: 1 } }).toArray();
  const settledOrderKeys = new Set();
  for (const row of ledgerRows) {
    const vn = String(row.vendor_id || '').trim();
    const on = String(row.order_number || row.order_id || '').trim().replace(/^#/, '');
    if (vn && on) settledOrderKeys.add(`${vn}::${on}`);
  }

  // 2. Orders marked Paid (either spelling) that were never credited.
  const orders = await db.collection('orders').find(
    {
      $and: [
        {
          $or: [
            { payment_status: 'Paid' },
            { payment_status: 'paid' },
            { paymentStatus: 'Paid' },
            { paymentStatus: 'paid' },
          ],
        },
        {
          $or: [
            { wallet_credited: { $ne: true } },
            { wallet_credited: { $exists: false } },
          ],
        },
      ],
    },
    {
      projection: {
        order_number: 1, orderNumber: 1, _id: 1,
        totalBDT: 1, total_price: 1, total_bdt: 1, total: 1,
        commission_bdt: 1, commissionBdt: 1,
        vendor_id: 1, vendorId: 1, store_id: 1, storeId: 1,
        merchant_id: 1, merchantId: 1,
        vendor_name: 1, vendorName: 1, store_name: 1, storeName: 1,
        store_slug: 1, storeSlug: 1,
        payment_method: 1, paymentMethod: 1,
      },
    },
  ).sort({ created_at: 1 }).toArray();

  console.log(`Found ${orders.length} Paid order(s) without wallet_credited.`);

  let processed = 0;
  let credited = 0;
  let skipped = 0;
  let errors = 0;

  for (const order of orders) {
    processed += 1;

    const orderNumber = String(order.order_number || order.orderNumber || order._id || '').replace(/^#/, '').trim();
    if (!orderNumber) { skipped += 1; continue; }

    const vendorId = String(order.vendor_id || order.vendorId || order.store_id || order.storeId || order.merchant_id || order.merchantId || '').trim();
    const storeSlug = String(order.store_slug || order.storeSlug || '').trim().toLowerCase();
    const vendorName = String(order.vendor_name || order.vendorName || order.store_name || order.storeName || '').trim();
    const storeRef = storeSlug || vendorId;

    // Skip COD orders — their wallet credit happens via cod_ledger on delivery.
    const paymentMethod = String(order.payment_method || order.paymentMethod || '').toLowerCase();
    if (paymentMethod.includes('cod') || paymentMethod.includes('cash')) { skipped += 1; continue; }

    // Skip if already settled in the COD ledger for this vendor+order.
    if (storeRef && settledOrderKeys.has(`${vendorId}::${orderNumber}`)) { skipped += 1; continue; }

    const totalBDT = toNum(order.totalBDT ?? order.total_price ?? order.total_bdt ?? order.total, 0);
    const commissionBDT = toNum(order.commission_bdt ?? order.commissionBdt ?? 0, 0);
    const netAmount = round2(Math.max(0, totalBDT - commissionBDT));
    if (!vendorId || netAmount <= 0) { skipped += 1; continue; }

    const result = await creditVendorWallet(
      { vendorId, ...(storeSlug ? { storeSlug } : {}), ...(vendorName ? { vendorName } : {}) },
      { available: netAmount, gross: totalBDT, commission: commissionBDT, courierFee: 0, orderNumber },
    ).catch((e) => ({ ok: false, error: e?.message || e }));

    if (!result || !result.ok) {
      errors += 1;
      console.error(`  [ERR] ${orderNumber} (${vendorId}): ${result?.error || 'credit failed'}`);
      continue;
    }

    await db.collection('orders').updateOne(
      { _id: order._id },
      { $set: { wallet_credited: true, wallet_credited_at: new Date(), wallet_credited_by: 'backfill' } },
    ).catch(() => undefined);

    credited += 1;
    console.log(`  [OK] ${orderNumber} → ${vendorId} credited ৳${netAmount.toFixed(2)} (gross ৳${totalBDT.toFixed(2)}, commission ৳${commissionBDT.toFixed(2)})`);
  }

  console.log(`\nDone: processed=${processed}, credited=${credited}, skipped=${skipped}, errors=${errors}.`);
  process.exitCode = errors > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('Fatal:', err?.message || err);
  process.exitCode = 1;
});
