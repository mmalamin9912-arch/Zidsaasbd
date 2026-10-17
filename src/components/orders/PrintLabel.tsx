/**
 * A4 Premium Colored Invoice & Packing Slip — print template builder.
 *
 * The dashboard opens a popup window and writes a complete standalone HTML
 * document into it; this module owns that document so BOTH print entry points
 * (the bulk "Print Invoices" action and the shipping-label modal) share one
 * premium A4 layout:
 *
 *  • `@page { size: A4; margin: 20mm; }` + `print-color-adjust: exact` so the
 *    colored PDF / hardcopy matches the screen (no washed-out seals/badges).
 *  • Brand header: large merchant logo (initials medallion fallback), store
 *    name, address and contact line.
 *  • Realistic rotated payment seal — green PAID, orange COD, red UNPAID,
 *    amber PARTIAL/PENDING, slate VOIDED — top-right of every page.
 *  • Itemised product table: name + SKU/variant, qty, unit price, line total.
 *  • Full money breakdown: subtotal → delivery → VAT (default ৳0.00 BDT when
 *    unconfigured) → highlighted bold grand total / collectible COD amount.
 *  • The shipping block KEEPS the old thermal-label details: barcode, QR,
 *    courier (Steadfast default), tracking ID, recipient name/phone/address.
 *
 * Token/QR helpers live here too so the on-screen previews in OrdersView and
 * this printable document never drift apart.
 */
import { Order } from '../../types';
import { safeDate, toNumber } from '../../utils/orderUtils';

/** Store branding shown on the printed document. */
export interface PrintStoreInfo {
  name: string;
  logoUrl: string;
  address: string;
  phone: string;
  email: string;
  /** VAT / TIN / BIN registration number, when the merchant configured one. */
  vatNumber: string;
  /** Header title from Settings → Invoices. */
  title: string;
  /** Footer note from Settings → Invoices (return policy, support, …). */
  footerNote: string;
}

/** Deterministic tracking token for one order (legacy `TRK-…` format). */
export const getOrderToken = (ord: any) => {
  if (ord?.orderToken) return ord.orderToken;
  const cleanId = String(ord?.orderNumber || ord?.id || '72200789').replace(/[^a-zA-Z0-9]/g, '');
  let sum = 0;
  for (let i = 0; i < cleanId.length; i++) sum += cleanId.charCodeAt(i);
  const hex = (sum * 9973).toString(16).toUpperCase();
  return `TRK-${cleanId.slice(-4).toUpperCase()}${hex.slice(-4)}`;
};

/** Self-contained QR code SVG (no external service — prints offline). */
export const generateQRCodeSVG = (text: string, size = 64) => {
  let rects = '';
  const modulesCount = 21;

  const drawFinder = (sr: number, sc: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        if (isOuter || isInner) {
          rects += `<rect x="${(sc + c) * 2}" y="${(sr + r) * 2}" width="2" height="2" fill="black"/>`;
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, modulesCount - 7);
  drawFinder(modulesCount - 7, 0);

  for (let i = 0; i < modulesCount; i++) {
    if (i % 2 === 0) {
      rects += `<rect x="${i * 2}" y="24" width="2" height="2" fill="black"/>`;
      rects += `<rect x="24" y="${i * 2}" width="2" height="2" fill="black"/>`;
    }
  }

  return `<svg viewBox="0 0 42 42" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
};

/**
 * HTML-escape every dynamic value. Product names, addresses and store branding
 * are merchant/customer controlled — a stray `<` or `"` would otherwise break
 * the printed document (or worse, inject markup into it).
 */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Money with two decimals — `৳1,200.00` / `৳0.00` for the breakdown rows. */
function money(value: unknown): string {
  const n = Number(toNumber(value, 0));
  return `৳${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Resolve the merchant's branding for the printed document.
 *
 * OrdersView only receives `merchantId` / `storeSlug`, so the profile the App
 * auto-saves into localStorage (`ZID_MERCHANT_STORE_DATA.merchant`, mirrored
 * into the auth session) is the source of truth here. Every field degrades to
 * a sensible fallback so the print never renders "undefined".
 */
export function resolvePrintStoreInfo(): PrintStoreInfo {
  const fallback: PrintStoreInfo = {
    name: 'My Store',
    logoUrl: '',
    address: '',
    phone: '',
    email: '',
    vatNumber: '',
    title: 'Tax Invoice & Packing Slip',
    footerNote: '',
  };

  try {
    let merchant: any = null;
    try {
      const raw = localStorage.getItem('zid_auth_session');
      if (raw) merchant = JSON.parse(raw)?.userProfile || null;
    } catch {
      // session cache unreadable — the store-data cache below still works.
    }
    if (!merchant) {
      const raw = localStorage.getItem('ZID_MERCHANT_STORE_DATA');
      if (raw) merchant = JSON.parse(raw)?.merchant || null;
    }
    if (!merchant) return fallback;

    const theme = merchant.themeConfig || merchant.theme_config || {};
    const invoiceCfg = merchant.invoiceConfig || {};
    const taxCfg = merchant.taxConfig || {};

    return {
      name: merchant.storeName || merchant.store_name || fallback.name,
      logoUrl: merchant.logoUrl || theme.logoUrl || '',
      // MerchantProfile has no canonical `address`; pickup location is what
      // Settings → onboarding persists, with theme/contact fallbacks.
      address: merchant.pickupAddress || merchant.address || merchant.storeAddress || theme.contactAddress || theme.address || '',
      phone: merchant.supportPhone || merchant.phone || '',
      email: merchant.supportEmail || merchant.email || '',
      vatNumber: invoiceCfg.vatRegistrationNumber || taxCfg.vatRegistrationNumber || taxCfg.vatNumber || merchant.vatNumber || '',
      title: invoiceCfg.title || fallback.title,
      footerNote: invoiceCfg.footerNote || '',
    };
  } catch {
    return fallback;
  }
}

/** One colored payment seal variant (rendered as a rotated double ring). */
interface PaymentSeal {
  label: string;
  sub: string;
  cls: string;
}

function paymentSealFor(ord: Order): PaymentSeal {
  const status = String(ord?.paymentStatus || 'Unpaid').trim();
  if (status === 'Paid') return { label: 'PAID', sub: 'Payment Received', cls: 'seal-paid' };
  if (status === 'Partially paid') return { label: 'PARTIAL', sub: 'Partially Paid', cls: 'seal-partial' };
  if (status === 'Pending Verification') return { label: 'PENDING', sub: 'Verification', cls: 'seal-partial' };
  if (status === 'Voided') return { label: 'VOIDED', sub: 'No Payment Due', cls: 'seal-void' };
  // Unpaid: cash-on-delivery gets its own collect-on-delivery stamp.
  if (ord?.paymentMethod === 'COD') return { label: 'COD', sub: 'Collect on Delivery', cls: 'seal-cod' };
  return { label: 'UNPAID', sub: 'Payment Due', cls: 'seal-unpaid' };
}

/**
 * Deterministic visual barcode derived from the tracking id / order token.
 * Purely decorative (Code-39 style bars) but stable per order, so reprints of
 * the same order always show the same barcode.
 */
function barcodeBars(seed: string): string {
  const src = String(seed || 'ZID0000').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const code = src.charCodeAt(i);
    out += '|'.repeat(1 + (code % 4)) + ' '.repeat(1 + (code % 2)) + '|| ';
  }
  return out.trim() || '|||| |||| ||||';
}

/** Brand header + meta box (billed-to / payment & delivery) for one page. */
function invoiceHeadSection(
  ord: Order,
  info: PrintStoreInfo,
  seal: PaymentSeal,
  tracking: string,
  courier: string
): string {
  // Large brand logo with an initials-medallion fallback underneath, so a
  // missing/broken logo URL still prints a polished header.
  const logo = info.logoUrl
    ? `<img src="${esc(info.logoUrl)}" alt="" onerror="this.remove();" />`
    : '';
  const initials = esc((info.name || 'M').trim().charAt(0).toUpperCase());

  return `
    <div class="invoice-box">
      <div class="accent"></div>

      <div class="header">
        <div class="brand">
          <div class="logo">${logo}<span class="logo-initials">${initials}</span></div>
          <div>
            <h1>${esc(info.name)}</h1>
            ${info.address ? `<p class="addr">${esc(info.address)}</p>` : ''}
            ${(info.phone || info.email) ? `<p class="addr">${[info.phone ? esc(info.phone) : '', info.email ? esc(info.email) : ''].filter(Boolean).join(' &bull; ')}</p>` : ''}
            ${info.vatNumber ? `<p class="vat-line">VAT / BIN: ${esc(info.vatNumber)} &bull; Tax Registered Merchant</p>` : ''}
          </div>
        </div>

        <div class="head-right">
          <span class="doc-badge">Tax Invoice &amp; Packing Slip</span>
          <p class="order-num">Order #${esc(ord?.orderNumber || ord?.id)}</p>
          <p class="date">Placed: ${esc(safeDate(ord?.createdAt))}</p>
          <div class="seal ${seal.cls}" title="${esc(seal.label)}">
            <span class="seal-main">${esc(seal.label)}</span>
            <span class="seal-sub">${esc(seal.sub)}</span>
          </div>
        </div>
      </div>

      <div class="meta-box">
        <div>
          <span class="label">Billed To</span>
          <p class="customer-name">${esc(ord?.customerName)}</p>
          <p class="ship-line">${esc(ord?.customerPhone)}</p>
          <p class="ship-line">${esc(ord?.address)}, ${esc(ord?.customerCity)}${ord?.deliveryZone ? ` (${esc(ord.deliveryZone)})` : ''}</p>
        </div>
        <div>
          <span class="label">Payment &amp; Delivery</span>
          <p class="ship-line">Method: <b>${esc(ord?.paymentMethod)}</b></p>
          <p class="ship-line">Status: <b>${esc(ord?.paymentStatus)}</b>${ord?.transactionId ? ` &bull; Trx: ${esc(ord.transactionId)}` : ''}</p>
          <p class="ship-line">Courier: <b>${esc(courier)}</b></p>
          <p class="ship-line">Tracking ID: <b>${esc(tracking || 'Not assigned yet')}</b></p>
        </div>
      </div>`;
}

/** Items table, shipping block and the itemised price breakdown. */
function invoiceTailSection(
  ord: Order,
  info: PrintStoreInfo,
  amounts: { subtotal: number; delivery: number; vat: number; grand: number; lineSum: number },
  token: string,
  tracking: string,
  courier: string,
  isCod: boolean
): string {
  const items = Array.isArray(ord?.items) ? ord.items : [];
  const itemRows = items.map((it: any, idx: number) => {
    const qty = toNumber(it?.quantity, 1);
    const unit = toNumber(it?.unitPriceBDT);
    const sku = String(it?.sku || it?.SKU || it?.skuCode || '').trim();
    const variant = String(it?.variant || '').trim();
    const meta: string[] = [];
    if (sku) meta.push(`SKU: ${esc(sku)}`);
    if (variant) meta.push(`Variant: ${esc(variant)}`);
    return `
              <tr>
                <td class="rownum">${idx + 1}</td>
                <td>
                  <b>${esc(it?.productName || 'Item')}</b>
                  ${meta.length ? `<div class="sku">${meta.join(' &bull; ')}</div>` : ''}
                </td>
                <td class="qty">${qty}</td>
                <td class="num">${money(unit)}</td>
                <td class="num">${money(unit * qty)}</td>
              </tr>`;
  }).join('');

  return `
      <table class="items">
        <thead>
          <tr>
            <th class="rownum">#</th>
            <th>Product Name &amp; SKU / Variant</th>
            <th class="qty">Qty</th>
            <th class="num">Unit Price</th>
            <th class="num">Line Total</th>
          </tr>
        </thead>
        <tbody>${itemRows || `
          <tr><td colspan="5" class="empty">No itemised products recorded for this order.</td></tr>`}
        </tbody>
      </table>

      <div class="bottom-grid">
        <div class="ship-card">
          <h3>Delivery &amp; Shipping</h3>
          <p class="recipient-name">${esc(ord?.customerName)}</p>
          <p class="ship-line">${esc(ord?.customerPhone)}</p>
          <p class="ship-line">${esc(ord?.address)}, ${esc(ord?.customerCity)}</p>
          <p class="ship-line"><span class="courier-chip">${esc(courier)}</span> <span class="tracking-id">Tracking: ${esc(tracking || 'Pending')}</span></p>
          <div class="barcode">${esc(barcodeBars(tracking || token))}</div>
          <p class="barcode-text">${esc(tracking || token)}</p>
          <div class="qr-row">
            <div class="qr">${generateQRCodeSVG(token, 72)}</div>
            <div>
              <p class="label">Order Token</p>
              <p class="token">${esc(token)}</p>
            </div>
          </div>
        </div>

        <div class="totals">
          <div class="tot-row"><span>Subtotal (Total Items Price)</span><span>${money(amounts.subtotal)}</span></div>
          <div class="tot-row"><span>Delivery Charge / Shipping Fee</span><span>${money(amounts.delivery)}</span></div>
          <div class="tot-row"><span>VAT / Tax${toNumber(ord?.taxRate, 0) > 0 ? ` (${toNumber(ord.taxRate)}%)` : ''}</span><span>${money(amounts.vat)}</span></div>
          <div class="tot-row grand">
            <span>Grand Total${isCod ? ' &bull; Collectible COD Amount' : ''}</span>
            <span>${money(amounts.grand)} BDT</span>
          </div>
        </div>
      </div>

      <div class="footer">
        <span class="thanks">Thank you for shopping with ${esc(info.name)}!</span>
        <span class="note">${esc(info.footerNote || 'Goods once delivered are subject to the store return policy. Keep this invoice for your records.')}</span>
      </div>
    </div>`;
}

/** Build the premium A4 invoice & packing-slip markup for ONE order. */
function buildInvoicePage(ord: Order, info: PrintStoreInfo): string {
  const items = Array.isArray(ord?.items) ? ord.items : [];
  const lineSum = items.reduce((sum, it) => sum + toNumber(it?.unitPriceBDT) * toNumber(it?.quantity), 0);
  // Recorded subtotal wins; orders saved before it existed fall back to the
  // sum of the line items so the printed breakdown always adds up.
  const subtotal = toNumber(ord?.subtotalBDT, 0) > 0 ? toNumber(ord?.subtotalBDT) : lineSum;
  const delivery = toNumber(ord?.deliveryCharge, 0);
  // VAT defaults to ৳0.00 BDT when the order/store never configured tax.
  const vat = toNumber(ord?.taxBDT, 0);
  const grand = toNumber(ord?.totalBDT, 0) > 0 ? toNumber(ord?.totalBDT) : subtotal + delivery + vat;

  const seal = paymentSealFor(ord);
  const token = getOrderToken(ord);
  const tracking = String(ord?.trackingCode || `TRACK-${ord?.orderNumber || ''}`).trim();
  const courier = String(ord?.courierName || 'Steadfast Courier');
  const isCod = ord?.paymentMethod === 'COD';

  return (
    invoiceHeadSection(ord, info, seal, tracking, courier) +
    invoiceTailSection(ord, info, { subtotal, delivery, vat, grand, lineSum }, token, tracking, courier, isCod)
  );
}

/**
 * Build the complete standalone A4 HTML document written into the print popup.
 *
 * Every selected order becomes one `.invoice-box` page; pages are separated by
 * `.page-break` so each invoice prints on its own A4 sheet. The popup
 * auto-opens the browser print dialog on load (Save as PDF included).
 */
export function buildA4InvoiceHtml(orders: Order[], store?: PrintStoreInfo): string {
  const info = store || resolvePrintStoreInfo();
  const list = Array.isArray(orders) ? orders.filter(Boolean) : [];
  const pages = list
    .map((ord) => buildInvoicePage(ord as Order, info))
    .join('<div class="page-break"></div>');
  const docTitle = `${info.name} — Tax Invoice & Packing Slip`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(docTitle)}</title>
    <style>
      /* ── A4 print geometry: one premium sheet per order ───────────────── */
      @page { size: A4; margin: 20mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body {
        margin: 0;
        padding: 24px;
        background: #eef2f7;
        color: #0f172a;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      .no-selection { text-align: center; color: #64748b; font-size: 14px; padding: 40px 0; }
      .invoice-box {
        position: relative;
        width: 100%;
        max-width: 172mm;
        margin: 0 auto 28px;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        overflow: hidden;
        padding-bottom: 6px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      }
      .accent { height: 8px; background: linear-gradient(90deg, #0f172a 0%, #d4af37 55%, #00d68f 100%); }

      /* ── Brand header + payment seal ──────────────────────────────────── */
      .header { display: flex; justify-content: space-between; gap: 18px; padding: 24px 30px 16px; border-bottom: 2px solid #0f172a; }
      .brand { display: flex; gap: 16px; align-items: center; }
      .logo { position: relative; width: 78px; height: 78px; flex: none; }
      .logo .logo-initials {
        display: flex; align-items: center; justify-content: center;
        width: 78px; height: 78px; border-radius: 16px;
        background: linear-gradient(135deg, #d4af37, #b38728);
        color: #ffffff; font-size: 36px; font-weight: 900;
      }
      .logo img {
        position: absolute; inset: 0; width: 100%; height: 100%;
        object-fit: cover; border-radius: 16px; border: 2px solid #d4af37;
      }
      h1 { margin: 0; font-size: 24px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
      .addr { margin: 4px 0 0; font-size: 12px; color: #475569; }
      .vat-line { margin: 4px 0 0; font-size: 11px; font-weight: 700; color: #0369a1; }
      .head-right { flex: none; display: flex; flex-direction: column; align-items: flex-end; text-align: right; }
      .doc-badge { background: #0f172a; color: #d4af37; font-size: 10px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; padding: 6px 12px; border-radius: 999px; }
      .order-num { font-family: "SFMono-Regular", Consolas, monospace; font-size: 15px; font-weight: 800; margin: 8px 0 2px; }
      .date { margin: 0; font-size: 11px; color: #64748b; }
      .seal {
        position: relative; width: 108px; height: 108px; margin-top: 12px;
        border-radius: 50%; border: 3px double currentColor;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        transform: rotate(-13deg); text-align: center;
      }
      .seal::after { content: ""; position: absolute; inset: 7px; border: 1.5px dashed currentColor; border-radius: 50%; }
      .seal-main { font-size: 22px; font-weight: 900; letter-spacing: 2px; line-height: 1; }
      .seal-sub { margin-top: 5px; font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; max-width: 84px; }
      .seal-paid { color: #047857; background: rgba(5, 150, 105, 0.08); }
      .seal-cod { color: #c2410c; background: rgba(234, 88, 12, 0.08); }
      .seal-unpaid { color: #b91c1c; background: rgba(220, 38, 38, 0.08); }
      .seal-partial { color: #b45309; background: rgba(217, 119, 6, 0.10); }
      .seal-void { color: #475569; background: rgba(100, 116, 139, 0.10); }
      /* ── Meta box, items table ─────────────────────────────────────────── */
      .meta-box {
        display: grid; grid-template-columns: 1.2fr 1fr; gap: 14px;
        margin: 16px 30px 0; background: #f8fafc; border: 1px solid #e2e8f0;
        border-radius: 12px; padding: 14px 16px; font-size: 12px;
      }
      .label { display: block; margin-bottom: 5px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
      .customer-name { margin: 0 0 3px; font-size: 14px; font-weight: 900; }
      .ship-line { margin: 3px 0; color: #334155; }
      .items { width: calc(100% - 60px); margin: 16px 30px 0; border-collapse: collapse; font-size: 12.5px; }
      .items thead th { background: #0f172a; color: #ffffff; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; padding: 10px 12px; text-align: left; }
      .items th.rownum, .items td.rownum { width: 34px; text-align: center; }
      .items th.qty, .items td.qty { width: 54px; text-align: center; }
      .items th.num, .items td.num { width: 96px; text-align: right; }
      .items tbody td { padding: 11px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
      .items tbody tr:nth-child(even) { background: #f8fafc; }
      .sku { margin-top: 3px; font-family: monospace; font-size: 10px; color: #64748b; }
      td.qty { font-family: monospace; font-weight: 800; }
      td.num { font-family: monospace; font-weight: 700; }
      .empty { padding: 18px !important; text-align: center; color: #94a3b8; font-style: italic; }

      /* ── Shipping block + itemised price breakdown ────────────────────── */
      .bottom-grid { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 16px; margin: 18px 30px 0; align-items: start; }
      .ship-card { border: 1.5px solid #0f172a; border-radius: 12px; padding: 14px 16px; }
      .ship-card h3 { margin: 0 0 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; }
      .recipient-name { margin: 0; font-size: 15px; font-weight: 900; }
      .courier-chip { display: inline-block; background: #0f172a; color: #d4af37; padding: 3px 9px; border-radius: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; }
      .tracking-id { font-family: monospace; font-size: 11px; font-weight: 700; color: #334155; }
      .barcode { margin-top: 10px; font-family: monospace; font-size: 19px; font-weight: 900; letter-spacing: 2px; white-space: nowrap; overflow: hidden; }
      .barcode-text { margin: 2px 0 0; font-family: monospace; font-size: 11px; font-weight: 800; letter-spacing: 3px; text-align: center; }
      .qr-row { display: flex; gap: 12px; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1; }
      .token { margin: 2px 0 0; font-family: monospace; font-size: 10px; font-weight: 800; }
      .totals { border: 1.5px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
      .tot-row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 14px; font-size: 12.5px; border-bottom: 1px solid #e2e8f0; }
      .tot-row span:last-child { font-family: monospace; font-weight: 700; }
      .tot-row.grand { background: linear-gradient(135deg, #0f172a, #1e293b); color: #ffffff; border-bottom: none; padding: 15px 14px; }
      .tot-row.grand span { font-weight: 900; }
      .tot-row.grand span:last-child { font-size: 17px; color: #d4af37; }
      /* ── Footer, page breaks, print & responsive rules ─────────────────── */
      .footer { display: flex; justify-content: space-between; gap: 14px; margin: 18px 30px 0; padding-top: 12px; border-top: 2px solid #0f172a; font-size: 11px; color: #64748b; }
      .thanks { font-style: italic; }
      .note { text-align: right; max-width: 55%; }
      .page-break { page-break-after: always; break-after: page; height: 0; }
      @media print {
        body { padding: 0 !important; background: #ffffff !important; }
        .invoice-box { max-width: none; margin: 0; border: none; border-radius: 0; box-shadow: none; }
      }
      /* On-screen preview inside the popup (tablet/phone widths). */
      @media screen and (max-width: 760px) {
        body { padding: 10px; }
        .header { flex-direction: column; align-items: flex-start; padding: 18px 14px 14px; }
        .head-right { align-items: flex-start; text-align: left; }
        .meta-box, .bottom-grid { grid-template-columns: 1fr !important; margin-left: 14px; margin-right: 14px; }
        .items { width: calc(100% - 28px); margin: 16px 14px 0; display: block; overflow-x: auto; }
        .footer { flex-direction: column; margin: 16px 14px 0; }
        .note { text-align: left; max-width: none; }
        .barcode { font-size: 14px; }
      }
    </style>
  </head>
  <body>
    ${pages || '<p class="no-selection">No orders selected to print.</p>'}
    <!-- Generated by components/orders/PrintLabel.tsx — A4 premium invoice & packing slip. -->

    <script>
      window.onload = function() {
        window.print();
        setTimeout(function() { window.close(); }, 500);
      };
    </script>
  </body>
</html>`;
}




