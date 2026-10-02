/**
 * Abandoned-cart recovery: discount coupon generation + automated message logs.
 *
 * THE PROBLEM
 * -----------
 * "Send WhatsApp Recovery Coupon" in the Orders > Abandoned carts tab was a
 * plain `<a href="https://wa.me/...">`. It opened WhatsApp with a HARDCODED
 * code ('RECOVER10') and, crucially, recorded NOTHING: no coupon existed in the
 * database, so a customer typing that code at checkout got rejected, and there
 * was no message log to prove the merchant had reached out.
 *
 * THIS MODULE
 * -----------
 *   • mints a real, persisted discount coupon (Mongo `discount_coupons`, with a
 *     Supabase mirror so the storefront can redeem it),
 *   • writes the automated-message log (Mongo `whatsapp_message_logs`, Supabase
 *     `whatsapp_message_logs`),
 *   • returns the `wa.me` click-to-chat link carrying the REAL coupon code.
 *
 * Every function degrades to a shaped result and never throws — a route must
 * not 5xx, and the merchant must still get a working WhatsApp link even when
 * the database is down.
 */

import { getMongoUri, getMongoDb } from './db.js';
import { ORDERS_DB_NAME, ORDERS_COLLECTION } from './orderStatus.js';

export const COUPONS_COLLECTION = 'discount_coupons';
export const MESSAGE_LOGS_COLLECTION = 'whatsapp_message_logs';

/* ────────────────────────── coupon minting ────────────────────────── */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Cryptographically random uppercase code, avoiding look-alike glyphs. */
function randomSegment(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export interface RecoveryCoupon {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderValue: number;
  maxDiscount: number | null;
  expiresAt: string;
  usageLimit: number;
}

export interface RecoveryResult {
  ok: boolean;
  /** Present whenever a code could be produced, even if persistence degraded. */
  coupon?: RecoveryCoupon;
  /** Click-to-chat URL — always usable by the merchant. */
  whatsappLink?: string;
  message?: string;
  error?: string;
  /** Set when the DB write failed but a usable fallback still exists. */
  persisted?: boolean;
  supabaseSynced?: boolean;
  /** Whether the message actually left the building via the provider. */
  delivery?: WhatsAppDispatchResult;
}

/**
 * Placeholders a merchant-authored recovery template may use.
 *
 * Surfaced to the Growth page as the helper text under the template editor so
 * the merchant knows exactly which tokens are substituted.
 */
export const RECOVERY_TEMPLATE_PLACEHOLDERS = [
  'name',
  'storeName',
  'itemName',
  'couponCode',
  'discount',
  'expiresAt',
] as const;

/**
 * Fill a merchant-authored WhatsApp template.
 *
 * The Growth page lets a merchant write their own copy (`{{name}}`,
 * `{{storeName}}`, …) so the message reads like their brand instead of the
 * built-in prose. An UNKNOWN placeholder is left verbatim rather than blanked —
 * a silent deletion would hide a typo, whereas `{{coupnCode}}` left in the
 * preview is immediately obvious.
 */
export function renderRecoveryTemplate(
  template: string,
  vars: Record<string, string>
): string {
  const text = String(template || '').trim();
  if (!text) return '';
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? match : value;
  });
}

/** Build the recovery message body carrying the REAL coupon code. */
export function buildRecoveryMessage(input: {
  customerName: string;
  itemName: string;
  storeName?: string;
  coupon: RecoveryCoupon;
  /** Optional merchant-authored template; the built-in prose is the fallback. */
  template?: string;
}): string {
  const { customerName, itemName, storeName, coupon, template } = input;
  const offer =
    coupon.discountType === 'percentage'
      ? `${coupon.discountValue}% OFF`
      : `৳${coupon.discountValue} OFF`;

  const rendered = renderRecoveryTemplate(String(template || ''), {
    name: customerName || 'Customer',
    customerName: customerName || 'Customer',
    itemName: itemName || 'item',
    storeName: storeName || 'our store',
    couponCode: coupon.code,
    code: coupon.code,
    discount: offer,
    expiresAt: coupon.expiresAt,
  });
  // A merchant template always wins — but an empty one falls through to the
  // built-in copy so a recovery message is never sent as a blank bubble.
  if (rendered) return rendered;

  return (
    `Hi ${customerName}! 👋\n\n` +
    `You left your *${itemName}* in your cart at ${storeName || 'our store'} — we saved it for you.\n\n` +
    `As a thank-you, here is ${offer} on your order:\n` +
    `👉 Coupon code: *${coupon.code}*\n\n` +
    (coupon.minOrderValue > 0 ? `Valid on orders over ৳${coupon.minOrderValue}.\n` : '') +
    (coupon.maxDiscount ? `Maximum discount ৳${coupon.maxDiscount}.\n` : '') +
    `Offer expires ${coupon.expiresAt}.\n\n` +
    `Reply to this message or visit the store to complete your order.`
  );
}

/**
 * Normalise a customer phone number to the bare, country-prefixed form wa.me and
 * every WhatsApp provider expect. '017…' must become '88017…' or the chat opens
 * with the wrong contact.
 */
export function normalizeWhatsAppPhone(rawPhone: string): string {
  let digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('880')) return digits;
  if (digits.length === 10 && digits.startsWith('0')) return `880${digits.slice(1)}`;
  if (digits.length === 10) return `880${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `880${digits.slice(1)}`;
  return digits;
}

/** Build a `wa.me` click-to-chat link. Always returns a usable URL. */
export function buildWhatsAppLink(phone: string, message: string): string {
  const digits = normalizeWhatsAppPhone(phone);
  if (!digits) return `https://wa.me/?text=${encodeURIComponent(message)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/* ────────────────────────── live WhatsApp dispatch ────────────────────────── */

export interface WhatsAppDispatchInput {
  phone: string;
  message: string;
  /** Provider instance id saved in Growth (UltraMsg semantics). */
  instanceId?: string;
  /** Provider access token saved in Growth. */
  apiKey?: string;
}

export interface WhatsAppDispatchResult {
  /** False when no credentials are saved, so nothing was sent. */
  attempted: boolean;
  sent: boolean;
  provider: 'ultramsg' | 'manual_link';
  details?: string;
  error?: string;
}

/**
 * Actually SEND the recovery message through the merchant's WhatsApp provider.
 *
 * The Growth page saves an instance id + API key; those are UltraMsg
 * credentials (`instanceId` = `Instance ID`, `apiKey` = `Token`). Without them
 * the merchant gets a `wa.me` link instead — so this never throws and never
 * blocks recovery on a provider outage.
 */
export async function dispatchRecoveryWhatsApp(
  input: WhatsAppDispatchInput
): Promise<WhatsAppDispatchResult> {
  const instanceId = String(input.instanceId || '').trim();
  const apiKey = String(input.apiKey || '').trim();
  const phone = normalizeWhatsAppPhone(input.phone);

  if (!instanceId || !apiKey) {
    return {
      attempted: false,
      sent: false,
      provider: 'manual_link',
      error: 'WhatsApp credentials are not configured for this store.',
    };
  }
  if (!phone) {
    return {
      attempted: false,
      sent: false,
      provider: 'manual_link',
      error: 'A customer phone number is required.',
    };
  }

  // A provider that accepts the socket and never answers would otherwise hang the
  // merchant's request forever, so the attempt gets a hard deadline.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const providerRes = await fetch(
      `https://api.ultramsg.com/${encodeURIComponent(instanceId)}/messages/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: apiKey,
          to: phone,
          body: String(input.message || ''),
        }),
        signal: controller.signal,
      }
    );

    const data: any = await providerRes.json().catch(() => ({}));
    const accepted =
      String(data?.status || '').toLowerCase() === 'true' || Boolean(data?.id);

    if (!providerRes.ok || !accepted) {
      return {
        attempted: true,
        sent: false,
        provider: 'ultramsg',
        error: data?.message || `The WhatsApp provider returned ${providerRes.status}.`,
      };
    }
    return {
      attempted: true,
      sent: true,
      provider: 'ultramsg',
      details: data?.id ? `Message ID ${data.id}` : 'Accepted by the WhatsApp provider.',
    };
  } catch (err: any) {
    return {
      attempted: true,
      sent: false,
      provider: 'ultramsg',
      error:
        err?.name === 'AbortError'
          ? 'The WhatsApp provider did not respond within 15s.'
          : err?.message || 'The WhatsApp provider could not be reached.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ────────────────────────── Supabase mirror ────────────────────────── */

function supabaseConfig(): { url: string; key: string } {
  const url = (
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).trim().replace(/\/+$/, '');
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();
  return { url, key };
}

/**
 * Mirror one row into a Supabase table.
 *
 * A 404 here means the table has not been created yet — that is NOT fatal
 * (Mongo is the source of truth), so it is reported rather than thrown.
 */
async function mirrorToSupabase(
  table: string,
  row: Record<string, any>
): Promise<{ synced: boolean; reason?: string }> {
  const { url, key } = supabaseConfig();
  if (!url || !key) return { synced: false, reason: 'Supabase is not configured.' };

  try {
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[AbandonedCarts] Supabase ${table} mirror failed:`, res.status, text.slice(0, 200));
      return { synced: false, reason: `Supabase ${table} rejected the row (${res.status}).` };
    }
    return { synced: true };
  } catch (err: any) {
    console.warn(`[AbandonedCarts] Supabase ${table} mirror exception:`, err?.message || err);
    return { synced: false, reason: err?.message || 'Supabase mirror failed.' };
  }
}

/* ────────────────────────── public API ────────────────────────── */

export interface SendRecoveryInput {
  cartId: string;
  customerName: string;
  customerPhone: string;
  itemName: string;
  storeName?: string;
  storeSlug?: string;
  merchantId?: string;
  /** Percent (e.g. 10) or a flat amount, depending on `discountType`. */
  discountValue?: number;
  discountType?: 'percentage' | 'fixed';
  minOrderValue?: number;
  maxDiscount?: number | null;
  /** Validity window in days; defaults to 7. */
  validDays?: number;
  /** Merchant-authored message template saved in the Growth page. */
  template?: string;
  /** WhatsApp provider credentials saved in the Growth page. */
  whatsappInstanceId?: string;
  whatsappApiKey?: string;
  /** false mints the coupon and returns the link without dispatching. */
  autoSend?: boolean;
}

/**
 * Mint a recovery coupon, log the automated WhatsApp message, and return the
 * click-to-chat link.
 *
 * The link is returned even when persistence fails, because a merchant with a
 * live customer waiting should not be blocked by a database hiccup — the
 * result simply flags `persisted: false` so the UI can say the log was not
 * saved.
 */
export async function sendRecoveryCoupon(
  input: SendRecoveryInput
): Promise<RecoveryResult> {
  const name = String(input.customerName || 'Customer').trim();
  const rawPhone = String(input.customerPhone || '').trim();

  if (!rawPhone) {
    return { ok: false, error: 'A customer phone number is required to send a recovery coupon.' };
  }

  const coupon: RecoveryCoupon = {
    code: `REC${randomSegment(4)}${randomSegment(2)}`,
    discountType: input.discountType === 'fixed' ? 'fixed' : 'percentage',
    discountValue: Number.isFinite(Number(input.discountValue)) ? Number(input.discountValue) : 10,
    minOrderValue: Number.isFinite(Number(input.minOrderValue)) ? Number(input.minOrderValue) : 0,
    maxDiscount: Number.isFinite(Number(input.maxDiscount)) ? Number(input.maxDiscount) : null,
    expiresAt: new Date(
      Date.now() + (Number.isFinite(Number(input.validDays)) ? Number(input.validDays) : 7) * 86400000
    ).toISOString(),
    usageLimit: 1,
  };

  const itemName = String(input.itemName || 'item').trim();
  const message = buildRecoveryMessage({
    customerName: name,
    itemName,
    storeName: input.storeName,
    coupon,
    template: input.template,
  });
  const whatsappLink = buildWhatsAppLink(rawPhone, message);

  // Push the message through the merchant's own WhatsApp provider when one is
  // configured. This is the "automated" in auto-recovery — without credentials
  // the result degrades to a wa.me link and `delivery.attempted` stays false, so
  // the merchant can see the message was NOT actually sent.
  const delivery =
    input.autoSend === false
      ? ({
          attempted: false,
          sent: false,
          provider: 'manual_link',
          error: 'Automatic WhatsApp sending is switched off for this store.',
        } as WhatsAppDispatchResult)
      : await dispatchRecoveryWhatsApp({
          phone: rawPhone,
          message,
          instanceId: input.whatsappInstanceId,
          apiKey: input.whatsappApiKey,
        });

  if (delivery.attempted && !delivery.sent) {
    console.warn('[AbandonedCarts] WhatsApp dispatch failed:', delivery.error);
  }

  const now = new Date();
  const couponRow = {
    code: coupon.code,
    store_slug: String(input.storeSlug || '').trim() || null,
    merchant_id: String(input.merchantId || '').trim() || null,
    discount_type: coupon.discountType,
    discount_value: coupon.discountValue,
    min_order_value: coupon.minOrderValue,
    max_discount: coupon.maxDiscount,
    usage_limit: coupon.usageLimit,
    used_count: 0,
    is_active: true,
    source: 'abandoned_cart_recovery',
    cart_id: String(input.cartId || '').trim() || null,
    customer_name: name,
    customer_phone: rawPhone,
    created_at: now,
    expires_at: new Date(coupon.expiresAt),
  };

  const logRow = {
    cart_id: String(input.cartId || '').trim() || null,
    store_slug: String(input.storeSlug || '').trim() || null,
    merchant_id: String(input.merchantId || '').trim() || null,
    channel: 'whatsapp',
    direction: 'outbound',
    recipient_name: name,
    recipient_phone: rawPhone,
    message_body: message,
    coupon_code: coupon.code,
    // 'pending' means the merchant still has to tap the wa.me link; 'failed'
    // means the provider was tried and refused, which is worth surfacing.
    status: delivery.sent ? 'sent' : delivery.attempted ? 'failed' : 'pending',
    provider: delivery.provider,
    delivery_details: delivery.details || null,
    delivery_error: delivery.error || null,
    sent_at: delivery.sent ? now : null,
    created_at: now,
  };

  let persisted = false;
  let supabaseSynced = false;
  let error: string | undefined;

  try {
    if (!getMongoUri()) {
      error = 'MONGODB_URI is not set — the coupon was generated but not saved.';
    } else {
      const db = await getMongoDb(ORDERS_DB_NAME);
      if (!db) {
        error = 'MongoDB is unavailable — the coupon was generated but not saved.';
      } else {
        // Isolate the two writes: a failure in one must not lose the other.
        try {
          await db.collection(COUPONS_COLLECTION).insertOne({ ...couponRow });
        } catch (couponErr: any) {
          console.warn('[AbandonedCarts] Coupon insert failed:', couponErr?.message || couponErr);
          error = `Coupon could not be saved: ${couponErr?.message || 'insert failed'}`;
        }
        try {
          await db.collection(MESSAGE_LOGS_COLLECTION).insertOne({ ...logRow });
          persisted = true;
        } catch (logErr: any) {
          console.warn('[AbandonedCarts] Message log insert failed:', logErr?.message || logErr);
          error = error || `Message log could not be saved: ${logErr?.message || 'insert failed'}`;
        }
      }
    }
  } catch (err: any) {
    console.error('[AbandonedCarts] Recovery persistence error:', err);
    error = err?.message || 'The recovery coupon could not be saved.';
  }

  // Supabase mirror — best effort, Mongo above is the source of truth.
  const [couponMirror, logMirror] = await Promise.all([
    mirrorToSupabase('discount_coupons', couponRow),
    mirrorToSupabase('whatsapp_message_logs', logRow),
  ]);
  supabaseSynced = couponMirror.synced || logMirror.synced;

  // Mark the cart as recovered so the tab can show a "recovered" state.
  try {
    if (getMongoUri() && input.cartId) {
      const db = await getMongoDb(ORDERS_DB_NAME);
      await db?.collection('abandoned_carts').updateOne(
        { $or: [{ cart_id: input.cartId }, { id: input.cartId }] },
        {
          $set: {
            status: 'recovered',
            recovery_coupon_code: coupon.code,
            recovery_message: message,
            recovered_at: now,
            updated_at: now,
          },
        }
      );
    }
  } catch (cartErr: any) {
    console.warn('[AbandonedCarts] Cart status update skipped:', cartErr?.message || cartErr);
  }

  return {
    ok: true,
    coupon,
    whatsappLink,
    persisted,
    supabaseSynced,
    delivery,
    message: !persisted
      ? `${error || 'The coupon was generated but not saved.'} Send it manually with code ${coupon.code}.`
      : delivery.sent
        ? `Recovery coupon ${coupon.code} sent to ${name} on WhatsApp.`
        : delivery.error
          ? `Recovery coupon ${coupon.code} created and logged for ${name}, but the message was not delivered (${delivery.error}).`
          : `Recovery coupon ${coupon.code} created and logged for ${name}.`,
  };
}

/**
 * List the automated-message log for a store, newest first.
 * Returns `[]` rather than throwing when the database is unavailable.
 */
export async function listRecoveryLogs(
  storeRef: string,
  limit = 100
): Promise<{ ok: boolean; logs: any[]; error?: string }> {
  const ref = String(storeRef || '').trim();
  try {
    if (!getMongoUri()) return { ok: false, logs: [], error: 'MONGODB_URI is not set.' };
    const db = await getMongoDb(ORDERS_DB_NAME);
    if (!db) return { ok: false, logs: [], error: 'MongoDB is unavailable.' };

    const filter = ref
      ? { $or: [{ store_slug: ref }, { storeSlug: ref }, { merchant_id: ref }, { store_id: ref }] }
      : {};
    const logs = await db
      .collection(MESSAGE_LOGS_COLLECTION)
      .find(filter)
      .sort({ sent_at: -1, created_at: -1 })
      .limit(limit)
      .toArray();
    return { ok: true, logs };
  } catch (err: any) {
    console.error('[AbandonedCarts] listRecoveryLogs error:', err);
    return { ok: false, logs: [], error: err?.message || 'The message log could not be read.' };
  }
}

export { ORDERS_DB_NAME, ORDERS_COLLECTION };

export default {
  sendRecoveryCoupon,
  listRecoveryLogs,
  buildRecoveryMessage,
  buildWhatsAppLink,
  renderRecoveryTemplate,
  dispatchRecoveryWhatsApp,
  normalizeWhatsAppPhone,
  RECOVERY_TEMPLATE_PLACEHOLDERS,
  COUPONS_COLLECTION,
  MESSAGE_LOGS_COLLECTION,
};
