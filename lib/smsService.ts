/**
 * SMS dispatch for Bangladesh gateway providers.
 *
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The merchant dashboard already let a shop save its SMS settings — sender id,
 * the four trigger toggles, message templates — and those settings were
 * persisted correctly onto the store record. But NOTHING EVER SENT AN SMS:
 * there was no dispatch code anywhere in the codebase, and the stored
 * `smsApiKey` had no consumer at all. A merchant could switch on "SMS on order
 * confirmation", take an order, and no message left the building.
 *
 * This module is that missing dispatch layer.
 *
 * PROVIDERS
 * ---------------------------------------------------------------------------
 * Bangladeshi SMS gateways all expose a slightly different HTTP shape. We
 * support the four that matter for this market, selected per-store:
 *
 *   greenweb      Greenweb BD      https://api.greenweb.com.bd/api.php
 *   sslwireless   SSL Wireless     https://smsplus.sslwireless.com/api/v3/send-sms
 *   bulksmsbd     Bulk SMS BD      http://bulksmsbd.net/api/smsapi
 *   alpha         Alpha SMS        https://api.sms.net.bd/sendsms
 *
 * Credentials come from the store's saved `smsApiKey` / `smsSenderId` (the
 * integration-properties panel), or from the platform env vars as a fallback so
 * a deployment can offer SMS without every merchant bringing their own key.
 *
 * DESIGN RULES
 * ---------------------------------------------------------------------------
 *  • NEVER throw. Every entry point returns a shaped result. SMS is a
 *    side-effect of placing an order; a gateway outage must never fail the
 *    order or 500 a route.
 *  • NEVER block the caller. Dispatch is invoked with `void` from the order
 *    path, with a hard timeout, so a slow gateway cannot stall checkout.
 *  • NEVER log the API key or the full recipient number.
 *  • Secrets are echoed back ONLY as a presence marker by the config layer —
 *    nothing here returns a key to the browser.
 */

/** Providers we can physically dispatch through. */
export type SmsProvider = 'greenweb' | 'sslwireless' | 'bulksmsbd' | 'alpha';

export const SMS_PROVIDERS: SmsProvider[] = ['greenweb', 'sslwireless', 'bulksmsbd', 'alpha'];

/** The trigger events the dashboard exposes (mirrors SMS_TRIGGER_KEYS). */
export type SmsTriggerKey =
  | 'order_confirmation'
  | 'order_shipped'
  | 'delivery_success'
  | 'otp_verification';

/** Result of one dispatch attempt. Always returned, never thrown. */
export interface SmsDispatchResult {
  ok: boolean;
  sent: boolean;
  provider: SmsProvider | '';
  /** Safe, human-readable explanation for the dashboard / server log. */
  message: string;
  /** Provider-side message id when the gateway echoes one. */
  messageId?: string;
  /** True when the provider accepted the request but we could not confirm. */
  accepted?: boolean;
}

/** Per-provider endpoint + credential shape. */
interface ProviderSpec {
  label: string;
  /** Build the outbound request from credentials + recipient + body. */
  build: (args: {
    apiKey: string;
    senderId: string;
    to: string;
    text: string;
  }) => { url: string; init: RequestInit };
  /** Pull a message id out of the provider's response body, if it has one. */
  extractId?: (data: any) => string;
}

/** Normalise a BD phone number to the international digits-only form. */
export function normalizeBdPhone(raw: unknown): string {
  let digits = String(raw || '').replace(/[^0-9+]/g, '');
  digits = digits.replace(/^\+/, '');

  // 01XXXXXXXXX (11 digits, local) -> 8801XXXXXXXXX
  if (/^01[3-9]\d{8}$/.test(digits)) return `88${digits}`;
  // 8801XXXXXXXXX already international
  if (/^8801[3-9]\d{8}$/.test(digits)) return digits;
  // 1XXXXXXXXX (10 digits, missing both prefixes)
  if (/^1[3-9]\d{8}$/.test(digits)) return `880${digits}`;
  // Anything else: return the digits if they look dialable, else '' so the
  // caller skips the send instead of asking a gateway to deliver nonsense.
  return /^\d{10,15}$/.test(digits) ? digits : '';
}

/**
 * Mask a phone number for logs: keep the last 4 digits only.
 * An SMS log line is not a place to leak a customer's full number.
 */
export function maskPhone(phone: string): string {
  const s = String(phone || '');
  if (s.length <= 4) return '***';
  return `${'*'.repeat(Math.max(3, s.length - 4))}${s.slice(-4)}`;
}

const PROVIDER_SPECS: Record<SmsProvider, ProviderSpec> = {
  /**
   * Greenweb BD. GET with the token inline, `to` as a comma-separated list.
   * Answers with a plain-text status line, so success is judged on HTTP status
   * plus the absence of the words "error"/"invalid" in the body.
   */
  greenweb: {
    label: 'Greenweb BD',
    build: ({ apiKey, to, text }) => ({
      url: 'https://api.greenweb.com.bd/api.php',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: apiKey, to, message: text }).toString(),
      },
    }),
  },

  /**
   * SSL Wireless SMS Plus v3. Requires `api_token` + `sid` + `msisdn` and
   * answers JSON: `{ status: "SUCCESS", smsinfo: { sms_status, ... } }`.
   */
  sslwireless: {
    label: 'SSL Wireless',
    build: ({ apiKey, senderId, to, text }) => ({
      url: 'https://smsplus.sslwireless.com/api/v3/send-sms',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_token: apiKey,
          sid: senderId || 'ZIDBD',
          msisdn: to,
          sms: text,
          csms_id: `zid${Date.now()}`,
        }),
      },
    }),
    extractId: (data) => String(data?.smsinfo?.csms_id || data?.smsinfo?.sms_id || ''),
  },

  /**
   * Bulk SMS BD. POST with `api_key`, `senderid`, `number`, `message`.
   * Answers `{ response_code: 202, success_message: ... }` on success.
   */
  bulksmsbd: {
    label: 'Bulk SMS BD',
    build: ({ apiKey, senderId, to, text }) => ({
      url: 'http://bulksmsbd.net/api/smsapi',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          api_key: apiKey,
          type: 'text',
          number: to,
          senderid: senderId,
          message: text,
        }).toString(),
      },
    }),
    extractId: (data) => String(data?.message_id || ''),
  },

  /**
   * Alpha SMS (sms.net.bd). POST JSON with `api_key`, `msg`, `to`, `sender_id`.
   * Answers `{ error: 0, msg: ..., data: { request_id } }`.
   */
  alpha: {
    label: 'Alpha SMS',
    build: ({ apiKey, senderId, to, text }) => ({
      url: 'https://api.sms.net.bd/sendsms',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          msg: text,
          to,
          sender_id: senderId,
        }),
      },
    }),
    extractId: (data) => String(data?.data?.request_id || ''),
  },
};

/** Provider-specific reading of a response body. */
function interpretResponse(
  provider: SmsProvider,
  httpOk: boolean,
  rawBody: string,
  data: any
): { ok: boolean; message: string } {
  if (!httpOk) {
    return { ok: false, message: `The ${PROVIDER_SPECS[provider].label} gateway rejected the request (HTTP).` };
  }

  switch (provider) {
    case 'sslwireless': {
      const status = String(data?.status || '').toUpperCase();
      if (status === 'SUCCESS') return { ok: true, message: 'Sent via SSL Wireless.' };
      return { ok: false, message: String(data?.error_message || 'SSL Wireless did not accept the message.') };
    }
    case 'bulksmsbd': {
      const code = Number(data?.response_code);
      if (code === 202 || code === 200) return { ok: true, message: 'Sent via Bulk SMS BD.' };
      return { ok: false, message: String(data?.error_message || 'Bulk SMS BD did not accept the message.') };
    }
    case 'alpha': {
      if (Number(data?.error) === 0) return { ok: true, message: 'Sent via Alpha SMS.' };
      return { ok: false, message: String(data?.msg || 'Alpha SMS did not accept the message.') };
    }
    case 'greenweb':
    default: {
      // Greenweb answers plain text; treat an explicit error word as failure.
      const body = String(rawBody || '');
      if (/\b(error|invalid|unauthorized|not\s+enough)\b/i.test(body)) {
        return { ok: false, message: body.trim().slice(0, 200) || 'Greenweb rejected the message.' };
      }
      return { ok: true, message: 'Sent via Greenweb BD.' };
    }
  }
}

/**
 * Send ONE SMS. Never throws.
 *
 * `timeoutMs` is deliberately short by default: this typically runs inline
 * after an order is written, and a customer waiting on a checkout response
 * must not wait on an SMS gateway.
 */
export async function sendSms(args: {
  provider: SmsProvider;
  apiKey: string;
  senderId?: string;
  to: string;
  text: string;
  timeoutMs?: number;
}): Promise<SmsDispatchResult> {
  const provider = args.provider;
  if (!SMS_PROVIDERS.includes(provider)) {
    return { ok: false, sent: false, provider: '', message: `"${provider}" is not a supported SMS gateway.` };
  }
  if (!args.apiKey) {
    return {
      ok: false,
      sent: false,
      provider,
      message: 'No SMS API key is saved. Add it in Settings → Integrations, or set the provider env var on the server.',
    };
  }

  const to = normalizeBdPhone(args.to);
  if (!to) {
    return { ok: false, sent: false, provider, message: 'The recipient phone number is missing or not a valid BD number.' };
  }

  const text = String(args.text || '').trim();
  if (!text) {
    return { ok: false, sent: false, provider, message: 'The SMS body is empty.' };
  }
  // GSM-7 length guard — an over-long body is silently truncated or rejected by
  // most BD gateways, which looks like a delivery failure. Truncate locally so
  // the merchant gets a predictable 480-char (3-part) ceiling.
  const body = text.length > 480 ? `${text.slice(0, 477)}...` : text;

  const built = PROVIDER_SPECS[provider].build({
    apiKey: args.apiKey,
    senderId: String(args.senderId || '').trim() || 'ZIDBD',
    to,
    text: body,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 8000);

  try {
    const res = await fetch(built.url, { ...built.init, signal: controller.signal });
    const rawBody = await res.text().catch(() => '');

    let data: any = null;
    try {
      data = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      data = null; // Greenweb answers plain text; that is expected, not an error.
    }

    const verdict = interpretResponse(provider, res.ok, rawBody, data);

    // The provider name and a masked recipient are the only things we log.
    if (!verdict.ok) {
      console.warn(`[SMS] ${PROVIDER_SPECS[provider].label} send failed for ${maskPhone(to)}: ${verdict.message}`);
    }

    return {
      ok: verdict.ok,
      sent: verdict.ok,
      provider,
      message: verdict.message,
      messageId: verdict.ok ? PROVIDER_SPECS[provider].extractId?.(data) || undefined : undefined,
    };
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    const message = aborted
      ? `The ${PROVIDER_SPECS[provider].label} gateway did not respond in time.`
      : `Could not reach the ${PROVIDER_SPECS[provider].label} gateway.`;
    console.warn(`[SMS] ${PROVIDER_SPECS[provider].label} transport error for ${maskPhone(to)}:`, err?.message || err);
    return { ok: false, sent: false, provider, message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Which gateway should this store use?
 *
 * Prefers the store's saved provider, then infers from whichever env var is
 * configured, so the platform can enable SMS centrally without touching each
 * merchant's record.
 */
export function resolveSmsProvider(saved?: unknown): SmsProvider | '' {
  const name = String(saved || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases: Record<string, SmsProvider> = {
    greenweb: 'greenweb',
    greenwebbd: 'greenweb',
    sslwireless: 'sslwireless',
    ssl: 'sslwireless',
    bulksmsbd: 'bulksmsbd',
    bulksms: 'bulksmsbd',
    alpha: 'alpha',
    alphasms: 'alpha',
    smsnetbd: 'alpha',
  };
  if (aliases[name]) return aliases[name];

  // Fall back to env configuration.
  if (process.env.SMS_PROVIDER) {
    const envProvider = aliases[String(process.env.SMS_PROVIDER).toLowerCase().replace(/[^a-z0-9]/g, '')];
    if (envProvider) return envProvider;
  }
  if (process.env.GREENWEB_API_KEY) return 'greenweb';
  if (process.env.SSLWIRELESS_API_KEY) return 'sslwireless';
  if (process.env.BULKSMSBD_API_KEY) return 'bulksmsbd';
  if (process.env.ALPHA_SMS_API_KEY) return 'alpha';
  return '';
}

/** The env-var name carrying each provider's key (for messages + fallback). */
export const SMS_ENV_KEYS: Record<SmsProvider, string> = {
  greenweb: 'GREENWEB_API_KEY',
  sslwireless: 'SSLWIRELESS_API_KEY',
  bulksmsbd: 'BULKSMSBD_API_KEY',
  alpha: 'ALPHA_SMS_API_KEY',
};

/** Platform-level fallback credential for a provider, if the env var is set. */
export function platformSmsKey(provider: SmsProvider): string {
  return String(process.env[SMS_ENV_KEYS[provider]] || '').trim();
}
