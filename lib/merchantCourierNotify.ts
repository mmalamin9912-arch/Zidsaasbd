/**
 * Merchant courier notifications.
 *
 * WHEN THIS RUNS
 * --------------
 * Whenever the Super Admin touches a courier dispatch in “Courier Orders List”:
 *   • changes the courier status (Sent to Courier / Pickup Confirmed / In
 *     Transit / Delivered / Cancelled), or adds a note / issue reason;
 *   • uploads a label or photo.
 *
 * The merchant owns the parcel, so the change must reach their inbox and their
 * verified WhatsApp — not just the dashboard. This module resolves the merchant's
 * contact details from the STORE record (the same record the order belongs to),
 * renders ONE human message, and delivers it through the channels that are
 * actually configured:
 *
 *   1. Email    — `sendEmail()` (Resend → SMTP), with the label attached when it
 *                 is an image/PDF, and a dashboard link.
 *   2. WhatsApp — the platform's existing multi-provider dispatcher (UltraMsg,
 *                 Twilio, Meta Cloud API, GreenAPI, Supabase edge, custom
 *                 gateway). When no provider is configured, a one-tap
 *                 `wa.me` deep link is returned instead, so the admin can still
 *                 send it by hand in one click.
 *
 * Everything here is BEST-EFFORT and never throws: a notification failure must
 * never fail the admin's status change or label upload.
 */

import { sendEmail } from './emailService.js';

export interface MerchantContact {
  email: string;
  /** WhatsApp number, normalised to digits (880…). */
  whatsapp: string;
  /** Plain phone for the mail footer. */
  phone: string;
  storeName: string;
  storeSlug: string;
}

export interface CourierNotificationInput {
  orderNumber: string;
  /** Human status label, e.g. "Sent to Courier" / "Cancelled". */
  statusLabel: string;
  trackingCode?: string;
  courierName?: string;
  /** Note / issue / cancellation reason typed by the admin. */
  note?: string;
  /** Set for a label upload or message dispatch with label. */
  label?: { filename: string; mimeType: string; base64?: string; note?: string; url?: string } | null;
}

export interface CourierNotificationResult {
  email: { attempted: boolean; ok: boolean; error?: string };
  whatsapp: { attempted: boolean; ok: boolean; error?: string; directLink?: string };
  /** Why nothing was sent (no contact details, nothing configured, …). */
  skipped?: string;
}

/** Keep only digits, and put a BD number in `880…` form. */
export function normaliseWhatsAppNumber(raw: unknown): string {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('880')) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `88${digits}`;
  if (digits.length === 10 && digits.startsWith('1')) return `880${digits}`;
  return digits;
}

/** A pretty status label from the stored slug (`pickup_confirmed` → `Pickup Confirmed`). */
export function courierStatusLabel(raw: unknown): string {
  const text = String(raw ?? '').trim();
  if (!text) return 'Updated';
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** True when the status means “this parcel will NOT be delivered”. */
export function isProblemStatus(raw: unknown): boolean {
  return /cancell?ed|reject|return|fail|hold|issue/i.test(String(raw ?? ''));
}

/** The message body shared by email and WhatsApp. */
export function buildCourierMessage(input: CourierNotificationInput, contact: MerchantContact): string {
  const lines: string[] = [];
  const shop = contact.storeName || contact.storeSlug || 'your store';

  lines.push(`🚚 *Courier update — ${input.orderNumber}*`);
  lines.push('');
  lines.push(`Store: ${shop}`);
  if (input.courierName) lines.push(`Courier: ${input.courierName}`);
  lines.push(`Status: *${input.statusLabel}*`);
  if (input.trackingCode) lines.push(`Tracking / Token: ${input.trackingCode}`);

  if (input.note) {
    lines.push('');
    lines.push(isProblemStatus(input.statusLabel) ? `Reason: ${input.note}` : `Note: ${input.note}`);
  }

  if (input.label) {
    lines.push('');
    lines.push(`📎 Label attached: ${input.label.filename}`);
    if (input.label.note) lines.push(`Label note: ${input.label.note}`);
    if (input.label.url) lines.push(`🔗 View/Download Token: ${input.label.url}`);
  }

  lines.push('');
  lines.push('Open your dashboard → Orders → this order to see the details.');
  return lines.join('\n');
}

/** Minimal HTML body for the email (inline styles, no external CSS). */
function buildCourierHtml(input: CourierNotificationInput, contact: MerchantContact, dashboardUrl: string): string {
  const esc = (v: unknown) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const problem = isProblemStatus(input.statusLabel);
  const accent = problem ? '#e11d48' : '#0f766e';

  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:6px 0;color:#64748b;font-size:13px">${esc(label)}</td>` +
        `<td style="padding:6px 0;font-weight:700;font-size:13px;color:#0f172a">${esc(value)}</td></tr>`
      : '';

  return (
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto">` +
    `<h2 style="margin:0 0 4px;font-size:18px;color:#0f172a">Courier update for ${esc(input.orderNumber)}</h2>` +
    `<p style="margin:0 0 16px;color:#64748b;font-size:13px">${esc(contact.storeName || contact.storeSlug || 'Your store')}</p>` +
    `<div style="display:inline-block;padding:6px 12px;border-radius:999px;background:${accent};color:#fff;` +
    `font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase">${esc(input.statusLabel)}</div>` +
    `<table style="width:100%;border-collapse:collapse;margin-top:16px">` +
    row('Courier', input.courierName || '') +
    row('Tracking / Token', input.trackingCode || '') +
    row(problem ? 'Reason' : 'Note', input.note || '') +
    row('Label', input.label ? (input.label.url ? `<a href="${esc(input.label.url)}" style="color:#0ea5e9;text-decoration:underline">${esc(input.label.filename)}</a>` : input.label.filename) : '') +
    `</table>` +
    `<p style="margin-top:20px"><a href="${esc(dashboardUrl)}" style="background:#0f172a;color:#fff;` +
    `padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700;font-size:13px">Open in dashboard</a></p>` +
    `</div>`
  );
}

type WhatsAppDispatcher = (
  phone: string,
  message: string,
  context: { kind: 'courier'; orderNumber: string },
) => Promise<{ sent: boolean; provider?: string; error?: string; directLink?: string }>;

/**
 * Notify the merchant about a courier change.
 *
 * `dispatchWhatsApp` is injected by the server (it owns the provider chain), so
 * this module stays free of transport details and is trivially testable.
 * Never throws.
 */
export async function notifyMerchantCourierUpdate(
  input: CourierNotificationInput,
  contact: MerchantContact | null,
  options: {
    dashboardUrl?: string;
    dispatchWhatsApp?: WhatsAppDispatcher;
  } = {},
): Promise<CourierNotificationResult> {
  const result: CourierNotificationResult = {
    email: { attempted: false, ok: false },
    whatsapp: { attempted: false, ok: false },
  };

  if (!contact || (!contact.email && !contact.whatsapp)) {
    result.skipped = 'The store has no merchant email or WhatsApp number on file.';
    return result;
  }

  const message = buildCourierMessage(input, contact);
  const dashboardUrl = options.dashboardUrl || '';

  // ── WhatsApp first (the channel a shopkeeper actually reads) ──
  if (contact.whatsapp && options.dispatchWhatsApp) {
    result.whatsapp.attempted = true;
    try {
      const sent = await options.dispatchWhatsApp(contact.whatsapp, message, {
        kind: 'courier',
        orderNumber: input.orderNumber,
      });
      result.whatsapp.ok = Boolean(sent?.sent);
      result.whatsapp.directLink = sent?.directLink;
      if (!result.whatsapp.ok) result.whatsapp.error = sent?.error || 'WhatsApp dispatch did not confirm delivery.';
    } catch (err: any) {
      result.whatsapp.error = err?.message || 'WhatsApp dispatch threw.';
    }
  }

  // ── Email (also carries the label as a real attachment) ──
  if (contact.email) {
    result.email.attempted = true;
    try {
      const attachments =
        input.label && input.label.base64
          ? [{ filename: input.label.filename, content: Buffer.from(input.label.base64, 'base64'), contentType: input.label.mimeType }]
          : undefined;

      const mail = await sendEmail({
        to: contact.email,
        subject: `Courier ${input.statusLabel} — ${input.orderNumber}`,
        text: message.replace(/\*/g, ''),
        html: buildCourierHtml(input, contact, dashboardUrl),
        ...(attachments ? { attachments } : {}),
      });
      result.email.ok = Boolean(mail.ok && mail.delivered);
      if (!result.email.ok) result.email.error = mail.error || 'Email dispatch failed.';
    } catch (err: any) {
      result.email.error = err?.message || 'Email dispatch threw.';
    }
  }

  if (!result.email.attempted && !result.whatsapp.attempted) {
    result.skipped = 'No notification channel is configured on the server.';
  }
  return result;
}

/** A `wa.me` deep link the admin can click when no WhatsApp provider is configured. */
export function whatsAppDirectLink(whatsappNumber: string, message: string): string {
  const digits = normaliseWhatsAppNumber(whatsappNumber);
  if (!digits) return '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
