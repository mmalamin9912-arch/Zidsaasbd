/**
 * lib/emailService.ts — Central email transport for the Zid BD platform.
 *
 * WHY THIS EXISTS
 * ---------------
 * The platform previously had several ad-hoc email paths (OTP codes, password
 * resets) each duplicating the Resend + SMTP/Nodemailer fallback chain, while
 * the broadcast / automation-trigger flows never sent a real email at all.
 * This module consolidates the transport into one function so every caller —
 * broadcasts, automation triggers, merchant comms — sends a REAL email through
 * the first configured provider and, on failure, the fallback, with a single
 * consistent log line for tracking delivery problems.
 *
 * Provider priority:
 *   1. Resend HTTP API   (RESEND_API_KEY / RESEND_KEY)
 *   2. SMTP via Nodemailer (SMTP_HOST / SMTP_USER / SMTP_PASS)
 *
 * Both are optional: when neither is configured the caller gets a structured
 * `{ ok: false, delivered: false, error }` result instead of a throw, so a
 * missing provider degrades to a loud log line rather than a broken request.
 */

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  /** Reply-to address, when the platform operator wants replies elsewhere. */
  replyTo?: string;
  attachments?: EmailAttachment[];
}

export interface EmailDeliveryResult {
  ok: boolean;
  delivered: boolean;
  provider?: string;
  error?: string;
  /** Non-fatal diagnostics (e.g. provider rejection reason) for log hunting. */
  detail?: string;
}

const EMAIL_ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalise + validate the recipient list so one bad row never blocks the batch. */
function normalizeRecipients(to: string | string[] | undefined | null): string[] {
  if (!to) return [];
  const list = Array.isArray(to) ? to : [to];
  return list
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value) => EMAIL_ADDRESS_RE.test(value));
}

/** The From header. Resend requires a verified domain; the default is its sandbox sender. */
export function platformFromAddress(): string {
  return process.env.RESEND_FROM || process.env.SMTP_FROM || 'Zid SaaS BD <onboarding@resend.dev>';
}

/** Whether ANY email provider is configured. Used to warn loudly at boot. */
export function isEmailConfigured(): boolean {
  const hasResend = Boolean(
    process.env.RESEND_API_KEY || process.env.RESEND_KEY || process.env.VITE_RESEND_API_KEY
  );
  const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
  return hasResend || hasSmtp;
}

/**
 * Send a transactional email through Resend first, then SMTP/Nodemailer.
 * Never throws — callers decide how to surface failure in their response.
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailDeliveryResult> {
  const recipients = normalizeRecipients(options.to);
  if (recipients.length === 0) {
    return { ok: false, delivered: false, error: 'No valid recipient email address was provided.' };
  }
  if (!options.subject || !String(options.subject).trim()) {
    return { ok: false, delivered: false, error: 'An email subject is required.' };
  }

  const from = platformFromAddress();
  const subject = String(options.subject).trim();
  const text = options.text || (options.html ? String(options.html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
  const logPrefix = `[Email] to=${recipients.join(',')} subject="${subject}"`;

  // ── 1. Resend HTTP API ────────────────────────────────────────────────────
  const resendApiKey =
    process.env.RESEND_API_KEY || process.env.RESEND_KEY || process.env.VITE_RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: recipients,
          subject,
          html: options.html || undefined,
          text: text || undefined,
          reply_to: options.replyTo || undefined,
          attachments: options.attachments?.map((a) => ({
            filename: a.filename,
            content: a.content.toString('base64'),
            content_type: a.contentType,
          })),
        }),
      });
      if (res.ok) {
        const data: any = await res.json().catch(() => ({}));
        const provider = data?.id ? `Resend (${data.id})` : 'Resend';
        console.log(`${logPrefix} ✅ DELIVERED via ${provider}`);
        return { ok: true, delivered: true, provider };
      }
      const errText = await res.text().catch(() => '');
      console.error(`${logPrefix} ❌ Resend rejected (${res.status}): ${errText.slice(0, 300)}`);
      // A 4xx from Resend (bad sender, unverified domain) will not improve on
      // retry — but SMTP may still be configured, so fall through.
    } catch (err: any) {
      console.error(`${logPrefix} ❌ Resend exception: ${err?.message || err}`);
    }
  } else {
    console.warn(`${logPrefix} ⚠️ RESEND_API_KEY not set — skipping Resend provider.`);
  }

  // ── 2. SMTP / Nodemailer fallback ────────────────────────────────────────
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    try {
      const nodemailer = await import('nodemailer');
      const transport = nodemailer.default
        ? nodemailer.default.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' },
          })
        : (nodemailer as any).createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' },
          });
      await transport.sendMail({
        from,
        to: recipients,
        subject,
        text: text || undefined,
        html: options.html || undefined,
        replyTo: options.replyTo || undefined,
        attachments: options.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
      console.log(`${logPrefix} ✅ DELIVERED via SMTP / NodeMailer`);
      return { ok: true, delivered: true, provider: 'SMTP / NodeMailer' };
    } catch (err: any) {
      console.error(`${logPrefix} ❌ SMTP dispatch error: ${err?.message || err}`);
    }
  } else {
    console.warn(`${logPrefix} ⚠️ SMTP_HOST/SMTP_USER not set — skipping SMTP provider.`);
  }

  const error = isEmailConfigured()
    ? 'All configured email providers failed to deliver this message.'
    : 'No email provider is configured. Set RESEND_API_KEY or SMTP_HOST / SMTP_USER / SMTP_PASS.';
  console.error(`${logPrefix} ❌ NOT DELIVERED — ${error}`);
  return { ok: false, delivered: false, error };
}

// ── Branded HTML template ────────────────────────────────────────────────────

/**
 * Wrap message content in the platform's dark-gold brand shell so automated
 * emails (broadcasts, automation triggers) look like the product, not like a
 * system notification from a stranger.
 */
export function buildBrandedEmailHtml(options: {
  heading: string;
  bodyHtml: string;
  actionUrl?: string | null;
  actionLabel?: string;
  footerNote?: string;
}): string {
  const actionBlock =
    options.actionUrl
      ? `<div style="margin:28px 0 8px;">
           <a href="${String(options.actionUrl)}"
              style="display:inline-block;background:#D4AF37;color:#0b1020;font-weight:700;
                     padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px;">
             ${options.actionLabel || 'Open Dashboard'}
           </a>
         </div>`
      : '';
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0b1020;font-family:Segoe UI,Arial,sans-serif;">
  <div style="max-width:620px;margin:0 auto;padding:32px 16px;">
    <div style="background:#111726;border:1px solid #2E3852;border-radius:16px;overflow:hidden;">
      <div style="padding:24px 32px;border-bottom:1px solid #2E3852;">
        <span style="font-size:20px;font-weight:900;color:#D4AF37;letter-spacing:1px;">ZID BD</span>
        <span style="font-size:11px;color:#64748b;margin-left:8px;">Merchant Platform</span>
      </div>
      <div style="padding:32px;">
        <h1 style="margin:0 0 16px;font-size:22px;color:#ffffff;">${options.heading}</h1>
        <div style="font-size:15px;line-height:1.7;color:#cbd5e1;">${options.bodyHtml}</div>
        ${actionBlock}
      </div>
      <div style="padding:16px 32px;border-top:1px solid #2E3852;">
        <p style="margin:0;font-size:11px;color:#64748b;">
          ${options.footerNote || 'You are receiving this because you are a Zid BD merchant.'}
        </p>
      </div>
    </div>
    <p style="text-align:center;font-size:10px;color:#475569;margin-top:16px;">
      © ${new Date().getFullYear()} Zid SaaS BD · Automated platform message
    </p>
  </div>
</body>
</html>`;
}

/** Escape user-provided text before it is interpolated into the HTML template. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Turn plain-text paragraphs into <p> blocks for the branded template. */
export function paragraphsFromText(text: string): string {
  return String(text || '')
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

export default {
  sendEmail,
  isEmailConfigured,
  platformFromAddress,
  buildBrandedEmailHtml,
  escapeHtml,
  paragraphsFromText,
};
