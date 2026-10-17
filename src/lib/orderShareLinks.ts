/**
 * Shareable storefront links for one order (invoice + tracking).
 *
 * WHY THIS EXISTS
 * ---------------
 * The F-commerce workflow this file serves: a merchant types a manual order in
 * the dashboard, then sends the customer a link over Facebook Messenger so the
 * shopper can view the invoice and track the parcel without an account. The link
 * must therefore (a) point at the merchant's OWN storefront, not the platform
 * dashboard, and (b) keep working whether the storefront is served on its
 * subdomain (`storename.zidbdsaas.com`) or on the path form
 * (`/store/<slug>`) — the two hosts the app supports.
 *
 * The order token is the same deterministic value the A4 receipt prints and the
 * QR code encodes (`getOrderToken` in components/orders/PrintLabel), so a link
 * shared over Messenger opens exactly the document the merchant printed.
 */

/** Minimal order shape these helpers read. Kept structural so callers can pass
 *  a full `Order`, a Mongo row, or a partial preview object. */
export interface ShareableOrder {
  orderNumber?: string;
  orderToken?: string;
  id?: string;
  trackingCode?: string;
}

/** Lowercase, DNS-safe slug — or '' when the value cannot be a subdomain label. */
function safeSlug(slug: string): string {
  const value = String(slug || '').trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) return '';
  return value;
}

/**
 * Root domain for the CURRENT host.
 *
 * On production this is `zidbdsaas.com`; on a preview deployment it is the
 * deployment's own root, so a shared link always resolves. A localhost or IP
 * host has no meaningful root and returns '' so the caller uses the path form.
 */
export function storefrontRootDomain(): string {
  if (typeof window === 'undefined') return '';
  const host = String(window.location.hostname || '').toLowerCase();
  if (!host || /^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(host)) return '';
  const parts = host.split('.');
  // Strip an existing store subdomain so we never build `a.b.zidbdsaas.com`.
  const root = parts.length >= 3 ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
  if (/^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(root)) return '';
  return root;
}

/**
 * The merchant's storefront origin — subdomain when possible, path form
 * otherwise. Mirrors the URL builder in Header.tsx so the two never disagree.
 */
export function storefrontOrigin(slug: string): string {
  const safe = safeSlug(slug);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const root = storefrontRootDomain();
  if (safe && root) {
    const proto = (typeof window !== 'undefined' && window.location.protocol) || 'https:';
    return `${proto}//${safe}.${root}`;
  }
  // Path form: the SPA understands `/store/<slug>` on the platform host.
  return safe ? `${origin}/store/${safe}` : origin;
}

/** Deterministic order token — identical to the A4 receipt's token. */
export function orderTokenFor(order: ShareableOrder): string {
  if (order?.orderToken) return String(order.orderToken);
  const cleanId = String(order?.orderNumber || order?.id || '72200789').replace(/[^a-zA-Z0-9]/g, '');
  return `TRK-${cleanId}`;
}

/** Order number with a leading `#`, exactly as the UI renders it. */
export function orderNumberFor(order: ShareableOrder): string {
  const raw = String(order?.orderNumber || '').trim();
  if (!raw) return '';
  return raw.startsWith('#') ? raw : `#${raw}`;
}

/**
 * Absolute URL to the order's tracking page on the merchant's storefront.
 * `/track-order?token=…&order=…` — the storefront resolves the order by token.
 */
export function buildOrderTrackUrl(slug: string, order: ShareableOrder): string {
  const base = `${storefrontOrigin(slug)}/track-order`;
  const params = new URLSearchParams();
  const token = orderTokenFor(order);
  const number = orderNumberFor(order);
  if (token) params.set('token', token);
  if (number) params.set('order', number.replace(/^#/, ''));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Absolute URL to the order's invoice/receipt page on the storefront. */
export function buildOrderInvoiceUrl(slug: string, order: ShareableOrder): string {
  const base = `${storefrontOrigin(slug)}/invoice`;
  const params = new URLSearchParams();
  const token = orderTokenFor(order);
  const number = orderNumberFor(order);
  if (token) params.set('token', token);
  if (number) params.set('order', number.replace(/^#/, ''));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * The pre-formatted Messenger message for one order.
 *
 * Deliberately short and friendly: a shopper reads it on a phone in a chat
 * bubble. The invoice and tracking links are the two things they need, so both
 * are included on their own line.
 */
export function buildMessengerOrderMessage(
  slug: string,
  order: ShareableOrder,
  customerName?: string,
): string {
  const name = String(customerName || '').trim();
  const number = orderNumberFor(order);
  const greeting = name ? `Hi ${name},` : 'Hi,';
  const invoiceUrl = buildOrderInvoiceUrl(slug, order);
  const trackUrl = buildOrderTrackUrl(slug, order);
  return (
    `${greeting} thanks for your order ${number}! ` +
    `View invoice & track here: ${invoiceUrl}\n` +
    `Track your parcel: ${trackUrl}`
  );
}

/**
 * Open (or reuse) a Messenger chat with the given page, pre-filled is not
 * possible via `m.me` — the customer types the message — so we instead open the
 * chat and let the caller copy the text. Returns false when the page id is not
 * usable so the caller can fall back to clipboard-only.
 */
export function openMessengerChat(pageId: string): boolean {
  const id = String(pageId || '').trim();
  if (!/^[0-9]{5,25}$/.test(id)) return false;
  if (typeof window === 'undefined') return false;
  const url = `https://m.me/${id}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/**
 * Copy text to the clipboard, returning a promise that resolves to whether it
 * succeeded. Falls back to the legacy `execCommand` path for older Safari.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
