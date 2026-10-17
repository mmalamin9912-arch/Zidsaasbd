/**
 * Live payment-gateway execution for Bangladesh (SSLCommerz / Shurjopay).
 *
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The dashboard already let a merchant pick a gateway (`gatewayConfig.gateway`
 * = 'SSLCommerz' | 'Shurjopay') and store its credentials, and the checkout UI
 * even said "Customer will be redirected to {gateway} secure payment portal".
 * But there were NO server routes to actually initiate a payment, receive the
 * callback, or verify a signature — so the "live gateway" option collected
 * configuration and never charged anyone. Every payment was the MANUAL TrxID
 * path. This module adds the missing execution layer.
 *
 * FLOWS
 * ---------------------------------------------------------------------------
 * SSLCommerz (one call to initiate, then an IPN + redirect callback):
 *   1. POST https://{host}/gwprocess/v4/api.php  -> { GatewayPageURL }
 *   2. Customer pays on SSLCommerz; we receive the IPN POST.
 *   3. GET  https://{host}/validator/api/validationserverAPI.php?val_id=…
 *      -> { status: VALID|VALIDATED|FAILED|CANCELLED, amount, tran_id, … }
 *   4. We confirm the nonce (verify_sign/verify_key) and the RE-VALIDATED
 *      amount against our own stored order total.
 *
 * Shurjopay (token -> order -> redirect, then a verified return):
 *   1. POST /api/get_token            -> { token }
 *   2. POST /api/secret-pay           -> { checkout_url }
 *   3. POST /api/verification         -> { sp_code, amount, … }
 *
 * SECURITY RULES (these are the reason this file is written defensively)
 * ---------------------------------------------------------------------------
 *  • A callback is NEVER trusted on its own. `status=VALID` in a POST body is
 *    attacker-controlled; every success is re-validated server-to-server and
 *    the returned amount is compared with the amount WE stored.
 *  • Signature/nonce comparison is CONSTANT-TIME and length-checked, so a
 *    forged hash cannot be found by timing.
 *  • Amounts are compared as integers (poisha), never floats — `"100.00"` vs
 *    `100` must not be able to disagree, and a rounded float must not let a
 *    BDT 1 difference slip through.
 *  • Every callback is IDEMPOTENT: a gateway retry (they do retry) must not
 *    double-credit or re-send confirmation SMS.
 *  • Secrets are read from the store record or env and never echoed back.
 */

import crypto from 'node:crypto';

export type PaymentGateway = 'SSLCommerz' | 'Shurjopay';

/** Credentials for one gateway, resolved from the store's saved config. */
export interface GatewayCredentials {
  /** SSLCommerz `store_id` / Shurjopay username. */
  storeId: string;
  /** SSLCommerz `store_passwd` / Shurjopay password. */
  storePassword: string;
  /** Shurjopay-only: the merchant prefix used to build unique order ids. */
  merchantPrefix?: string;
  /** When true, hit the sandbox host instead of the live host. */
  sandbox: boolean;
}

/** Result of an initiate call. */
export interface InitiateResult {
  ok: boolean;
  /** Where to send the customer. */
  redirectUrl?: string;
  /** Our unique transaction reference, echoed by the gateway. */
  transactionId?: string;
  message: string;
  raw?: any;
}

/** Result of a validation / verification call. */
export interface VerifyResult {
  ok: boolean;
  /** Gateway's own status word (VALID / VALIDATED / SUCCESS / …). */
  status: string;
  /** Amount the gateway says was actually paid. */
  amount?: number;
  transactionId?: string;
  /** Gateway-side reference (val_id / sp_code / bank_tran_id). */
  gatewayRef?: string;
  message: string;
  raw?: any;
}

// ── Host selection ──────────────────────────────────────────────────────────

/**
 * SSLCommerz host. Sandbox and live are DIFFERENT DOMAINS, not just a flag —
 * posting sandbox credentials to the live host (or the reverse) fails with an
 * opaque "Invalid store" error.
 */
export function sslcommerzHost(sandbox: boolean): string {
  return sandbox ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com';
}

/**
 * Shurjopay host. Shurjopay ALSO uses a different *path prefix* per environment,
 * which is easy to miss: `sandbox.shurjopayment.com` vs `engine.shurjopayment.com`.
 */
export function shurjopayBase(sandbox: boolean): string {
  return sandbox ? 'https://sandbox.shurjopayment.com' : 'https://engine.shurjopayment.com';
}

// ── Money helpers ───────────────────────────────────────────────────────────

/**
 * Convert a BDT amount to integer poisha (1 BDT = 100 poisha).
 *
 * WHY: gateways return amounts as strings ("100.00", "100"). Comparing those
 * as floats invites `0.1 + 0.2` style drift and lets `100.001` match `100`.
 * Rounding both sides to an integer removes the whole class of bug.
 */
export function toPoisha(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

/** Do two money values (string|number) represent the same amount? */
export function amountsMatch(a: unknown, b: unknown): boolean {
  const pa = toPoisha(a);
  const pb = toPoisha(b);
  return Number.isFinite(pa) && Number.isFinite(pb) && pa === pb;
}

// ── Constant-time comparison ────────────────────────────────────────────────

/**
 * Timing-safe string equality.
 *
 * `===` on a hash leaks how many leading characters matched, which is enough
 * for an attacker to walk a forged signature into place byte by byte. Lengths
 * are compared first (a length mismatch is not secret), then the bytes.
 */
export function safeEqual(a: unknown, b: unknown): boolean {
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  if (!sa || !sb) return false;
  const bufA = Buffer.from(sa, 'utf8');
  const bufB = Buffer.from(sb, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify SSLCommerz's IPN `verify_sign` nonce.
 *
 * SSLCommerz sends the full field list back plus a `verify_key` naming which
 * fields are included. The signature is:
 *
 *   md5( store_passwd + "=" + value1 + "&" + value2 … )
 *
 * computed over the named fields, joined in the order given by `verify_key`,
 * with NO `&` before the first value. This is their documented scheme.
 *
 * Returns false (never throws) when anything is missing or malformed — a
 * callback we cannot authenticate is a callback we reject.
 */
export function verifySslcommerzNonce(
  body: Record<string, any>,
  storePassword: string
): boolean {
  const providedSign = String(body?.verify_sign || '').trim();
  const verifyKey = String(body?.verify_key || '').trim();
  if (!providedSign || !verifyKey || !storePassword) return false;

  const fields = verifyKey.split(',').map((f) => f.trim()).filter(Boolean);
  if (fields.length === 0) return false;

  let payload = `${storePassword}=`;
  fields.forEach((field, index) => {
    const value = String(body?.[field] ?? '');
    payload += index === 0 ? value : `&${value}`;
  });

  const expected = crypto.createHash('md5').update(payload, 'utf8').digest('hex');
  return safeEqual(expected, providedSign);
}

// ── SSLCommerz: initiate ────────────────────────────────────────────────────

export interface SslcommerzInitiateArgs {
  credentials: GatewayCredentials;
  /** Our unique reference. Must be unique per attempt across the merchant's life. */
  transactionId: string;
  amount: number;
  currency?: string;
  /** Absolute URLs the gateway redirects the customer back to. */
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  ipnUrl: string;
  customer: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    postcode?: string;
    country?: string;
  };
  /** Free-form passthrough fields SSLCommerz echoes back untouched. */
  valueA?: string;
  valueB?: string;
  productName?: string;
  timeoutMs?: number;
}

/**
 * Create an SSLCommerz session and return the customer redirect URL.
 * Never throws — a transport or gateway failure is a shaped result.
 */
export async function initiateSslcommerz(args: SslcommerzInitiateArgs): Promise<InitiateResult> {
  const { credentials } = args;
  if (!credentials.storeId || !credentials.storePassword) {
    return {
      ok: false,
      message:
        'SSLCommerz credentials are missing. Add the Store ID and Store Password in Settings → Payments.',
    };
  }

  const host = sslcommerzHost(credentials.sandbox);
  const form = new URLSearchParams({
    store_id: credentials.storeId,
    store_passwd: credentials.storePassword,
    total_amount: args.amount.toFixed(2),
    // BDT is the only currency the BD acquirer settles in.
    currency: args.currency || 'BDT',
    tran_id: args.transactionId,
    success_url: args.successUrl,
    fail_url: args.failUrl,
    cancel_url: args.cancelUrl,
    ipn_url: args.ipnUrl,
    // SSLCommerz rejects the session when cus_* is absent in live mode.
    cus_name: args.customer.name || 'Customer',
    cus_email: args.customer.email || 'customer@example.com',
    cus_add1: args.customer.address || 'N/A',
    cus_city: args.customer.city || 'Dhaka',
    cus_postcode: args.customer.postcode || '1000',
    cus_country: args.customer.country || 'Bangladesh',
    cus_phone: args.customer.phone || '01700000000',
    // Mirror shipping onto the customer so the gateway form is fully populated.
    ship_name: args.customer.name || 'Customer',
    ship_add1: args.customer.address || 'N/A',
    ship_city: args.customer.city || 'Dhaka',
    ship_postcode: args.customer.postcode || '1000',
    ship_country: args.customer.country || 'Bangladesh',
    product_name: args.productName || 'Order',
    product_category: 'ecommerce',
    product_profile: 'general',
    shipping_method: 'NO',
    num_of_item: '1',
  });
  // Passthrough so the callback can map back to our order without a lookup.
  if (args.valueA) form.set('value_a', args.valueA);
  if (args.valueB) form.set('value_b', args.valueB);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 15000);
  try {
    const res = await fetch(`${host}/gwprocess/v4/api.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: controller.signal,
    });
    const rawText = await res.text().catch(() => '');
    let data: any = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }

    const redirectUrl = String(data?.GatewayPageURL || '').trim();
    if (!redirectUrl) {
      const reason = String(data?.failedreason || data?.error || '').trim();
      return {
        ok: false,
        message: reason
          ? `SSLCommerz refused the session: ${reason}`
          : 'SSLCommerz did not return a payment URL. Check the Store ID, password and sandbox setting.',
        raw: data,
      };
    }

    return { ok: true, redirectUrl, transactionId: args.transactionId, message: 'Session created.', raw: data };
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      message: aborted
        ? 'SSLCommerz did not respond in time.'
        : 'Could not reach SSLCommerz. Check the server’s network access.',
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── SSLCommerz: validate ────────────────────────────────────────────────────

/**
 * Re-validate a transaction server-to-server.
 *
 * This is the step that makes an IPN trustworthy. The POST body is fully
 * attacker-controllable; only this call proves the payment exists at the
 * gateway. A `status` of VALID or VALIDATED with a matching amount is the
 * ONLY thing we treat as paid.
 */
export async function validateSslcommerz(args: {
  credentials: GatewayCredentials;
  valId: string;
  timeoutMs?: number;
}): Promise<VerifyResult> {
  const { credentials } = args;
  if (!args.valId) {
    return { ok: false, status: '', message: 'No val_id was supplied in the callback.' };
  }
  if (!credentials.storeId || !credentials.storePassword) {
    return { ok: false, status: '', message: 'SSLCommerz credentials are missing.' };
  }

  const host = sslcommerzHost(credentials.sandbox);
  const url =
    `${host}/validator/api/validationserverAPI.php` +
    `?val_id=${encodeURIComponent(args.valId)}` +
    `&store_id=${encodeURIComponent(credentials.storeId)}` +
    `&store_passwd=${encodeURIComponent(credentials.storePassword)}` +
    `&format=json`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 15000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const rawText = await res.text().catch(() => '');
    let data: any = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }
    if (!data) {
      return { ok: false, status: '', message: 'SSLCommerz returned an unreadable validation response.' };
    }

    const status = String(data?.status || '').toUpperCase();
    // VALID = first validation; VALIDATED = a repeat call for an already-valid
    // transaction (the gateway does this on retries). Both mean PAID.
    const ok = status === 'VALID' || status === 'VALIDATED';

    return {
      ok,
      status,
      amount: Number(data?.amount),
      transactionId: String(data?.tran_id || ''),
      gatewayRef: String(data?.val_id || args.valId),
      message: ok ? 'Transaction validated.' : String(data?.error || `Transaction status: ${status || 'unknown'}`),
      raw: data,
    };
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      status: '',
      message: aborted
        ? 'SSLCommerz validation timed out.'
        : 'Could not reach the SSLCommerz validator.',
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Shurjopay ───────────────────────────────────────────────────────────────

/** Fetch a Shurjopay bearer token (valid ~1 hour). Returns '' on any failure. */
export async function shurjopayToken(credentials: GatewayCredentials, timeoutMs = 15000): Promise<string> {
  const base = shurjopayBase(credentials.sandbox);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/get_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: credentials.storeId,
        password: credentials.storePassword,
      }),
      signal: controller.signal,
    });
    const data: any = await res.json().catch(() => null);
    return String(data?.token || '');
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

export interface ShurjopayInitiateArgs {
  credentials: GatewayCredentials;
  transactionId: string;
  amount: number;
  /** Absolute URL Shurjopay sends the customer back to (it POSTs the result). */
  returnUrl: string;
  cancelUrl: string;
  customer: { name?: string; email?: string; phone?: string; address?: string; city?: string };
  timeoutMs?: number;
}

/** Create a Shurjopay order and return its checkout URL. Never throws. */
export async function initiateShurjopay(args: ShurjopayInitiateArgs): Promise<InitiateResult> {
  const { credentials } = args;
  if (!credentials.storeId || !credentials.storePassword) {
    return {
      ok: false,
      message: 'Shurjopay credentials are missing. Add the merchant username and password in Settings → Payments.',
    };
  }

  const token = await shurjopayToken(credentials, args.timeoutMs);
  if (!token) {
    return { ok: false, message: 'Shurjopay authentication failed. Re-check the username, password and sandbox setting.' };
  }

  const base = shurjopayBase(credentials.sandbox);
  // Shurjopay requires a merchant-prefixed order id to guarantee uniqueness.
  const orderId = `${credentials.merchantPrefix || 'ZID'}${args.transactionId}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 15000);
  try {
    const res = await fetch(`${base}/api/secret-pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        prefix: credentials.merchantPrefix || 'ZID',
        token,
        return_url: args.returnUrl,
        cancel_url: args.cancelUrl,
        store_id: credentials.storeId,
        amount: args.amount,
        order_id: orderId,
        currency: 'BDT',
        // Shurjopay's field names differ from SSLCommerz's; keep them exact.
        customer_name: args.customer.name || 'Customer',
        customer_address: args.customer.address || 'N/A',
        customer_city: args.customer.city || 'Dhaka',
        customer_phone: args.customer.phone || '01700000000',
        customer_email: args.customer.email || 'customer@example.com',
        // These four are required by the Shurjopay schema.
        value1: args.customer.phone || '',
        value2: '',
        value3: '',
        value4: '',
      }),
      signal: controller.signal,
    });

    const data: any = await res.json().catch(() => null);
    const checkoutUrl = String(data?.checkout_url || '').trim();
    if (!checkoutUrl) {
      return {
        ok: false,
        message: String(data?.message || 'Shurjopay did not return a checkout URL.'),
        raw: data,
      };
    }
    return { ok: true, redirectUrl: checkoutUrl, transactionId: orderId, message: 'Order created.', raw: data };
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      message: aborted ? 'Shurjopay did not respond in time.' : 'Could not reach Shurjopay.',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verify a Shurjopay order server-to-server.
 * Shurjopay returns the result as a POST to `return_url`; the body is not
 * trustworthy, so the order id is re-checked at the gateway.
 */
export async function verifyShurjopay(args: {
  credentials: GatewayCredentials;
  orderId: string;
  timeoutMs?: number;
}): Promise<VerifyResult> {
  const { credentials } = args;
  if (!args.orderId) {
    return { ok: false, status: '', message: 'No order id was supplied in the callback.' };
  }

  const token = await shurjopayToken(credentials, args.timeoutMs);
  if (!token) {
    return { ok: false, status: '', message: 'Shurjopay authentication failed during verification.' };
  }

  const base = shurjopayBase(credentials.sandbox);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 15000);
  try {
    const res = await fetch(`${base}/api/verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ order_id: args.orderId }),
      signal: controller.signal,
    });
    const data: any = await res.json().catch(() => null);
    if (!data) {
      return { ok: false, status: '', message: 'Shurjopay returned an unreadable verification response.' };
    }

    // Shurjopay answers sp_code "1000" for a successful payment.
    const spCode = String(data?.sp_code ?? '');
    const status = String(data?.bank_status || data?.sp_message || '').toLowerCase();
    const ok = spCode === '1000' || status.includes('success');

    return {
      ok,
      status: status || spCode,
      amount: Number(data?.amount),
      transactionId: String(data?.customer_order_id || data?.order_id || ''),
      gatewayRef: String(data?.sp_code || ''),
      message: ok ? 'Transaction verified.' : String(data?.sp_message || 'Shurjopay did not confirm the payment.'),
      raw: data,
    };
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      status: '',
      message: aborted ? 'Shurjopay verification timed out.' : 'Could not reach Shurjopay for verification.',
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Build a gateway-unique transaction reference.
 *
 * The gateway rejects a reused `tran_id`, and a merchant retrying a failed
 * payment must get a NEW reference — so a random suffix is appended to the
 * order number rather than reusing it.
 */
export function buildTransactionId(orderNumber: string): string {
  const base = String(orderNumber || 'ORD').replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'ORD';
  return `${base}${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/** Normalise the gateway name saved on the store config. */
export function normalizeGateway(raw: unknown): PaymentGateway | '' {
  const v = String(raw || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (v === 'sslcommerz' || v === 'sslcz') return 'SSLCommerz';
  if (v === 'shurjopay' || v === 'shurjopayment') return 'Shurjopay';
  return '';
}

/** Env-var fallbacks so the platform can run gateway live for all merchants. */
export function platformGatewayCredentials(gateway: PaymentGateway): Partial<GatewayCredentials> {
  if (gateway === 'SSLCommerz') {
    return {
      storeId: String(process.env.SSLCOMMERZ_STORE_ID || ''),
      storePassword: String(process.env.SSLCOMMERZ_STORE_PASSWORD || ''),
      merchantPrefix: String(process.env.SSLCOMMERZ_MERCHANT_PREFIX || ''),
      sandbox: String(process.env.SSLCOMMERZ_SANDBOX || '') === 'true',
    };
  }
  return {
    storeId: String(process.env.SHURJOPAY_USERNAME || ''),
    storePassword: String(process.env.SHURJOPAY_PASSWORD || ''),
    merchantPrefix: String(process.env.SHURJOPAY_PREFIX || ''),
    sandbox: String(process.env.SHURJOPAY_SANDBOX || '') === 'true',
  };
}
