// Customer-facing order status helpers.
//
// The merchant dashboard and the customer storefront read the SAME MongoDB
// `orders` collection, so a status change made by the store owner is reflected
// for the customer on the next load/poll. This module is the single source of
// truth for how a raw order row is projected into the customer timeline, badge
// colour and return eligibility, so the storefront cards, the order dashboard
// modal and the tracking stepper never disagree.

/** A single step in the customer-visible delivery timeline. */
export interface TrackingStep {
  key: 'placed' | 'processing' | 'shipped' | 'delivered';
  /** English label; callers may translate via `t(...)`. */
  label: string;
  /** Bengali label, used when the storefront language is Bengali. */
  labelBn: string;
}

/** The canonical four-step customer timeline. */
export const TRACKING_STEPS: TrackingStep[] = [
  { key: 'placed', label: 'Order Placed', labelBn: 'অর্ডার সম্পন্ন' },
  { key: 'processing', label: 'Processing', labelBn: 'প্রক্রিয়াধীন' },
  { key: 'shipped', label: 'Out for Delivery', labelBn: 'ডেলিভারির পথে' },
  { key: 'delivered', label: 'Delivered', labelBn: 'ডেলিভার হয়েছে' },
];

/** Badge tone → Tailwind classes. Kept semantic so every caller looks identical. */
export interface StatusBadge {
  label: string;
  labelBn: string;
  className: string;
  /** Higher = more advanced; used to order the timeline. */
  rank: number;
  /** True for terminal-but-cancelled states. */
  cancelled: boolean;
}

/**
 * Normalises any combination of `fulfillmentStatus` / `status` / `paymentStatus`
 * into a single customer-facing badge with a colour code:
 * Pending (yellow), Processing (blue), Shipped/In Transit (purple),
 * Delivered (green), Cancelled (red).
 */
export function getOrderStatusBadge(order: any): StatusBadge {
  const raw = String(
    order?.fulfillmentStatus || order?.fulfillment_status || order?.status || ''
  ).toLowerCase();

  if (raw.includes('cancel') || raw.includes('void') || raw.includes('revers')) {
    return {
      label: 'Cancelled',
      labelBn: 'বাতিল',
      className: 'bg-red-100 text-red-700 border-red-200',
      rank: -1,
      cancelled: true,
    };
  }
  if (raw.includes('deliver') || raw.includes('complete')) {
    return {
      label: 'Delivered',
      labelBn: 'ডেলিভার হয়েছে',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      rank: 3,
      cancelled: false,
    };
  }
  if (raw.includes('transit') || raw.includes('shipped') || raw.includes('courier') || raw.includes('delivery')) {
    return {
      label: 'In Transit',
      labelBn: 'পরিবহনে',
      className: 'bg-purple-100 text-purple-700 border-purple-200',
      rank: 2,
      cancelled: false,
    };
  }
  if (raw.includes('process') || raw.includes('prepar') || raw.includes('ready') || raw.includes('assign')) {
    return {
      label: 'Processing',
      labelBn: 'প্রক্রিয়াধীন',
      className: 'bg-blue-100 text-blue-700 border-blue-200',
      rank: 1,
      cancelled: false,
    };
  }
  return {
    label: 'Pending',
    labelBn: 'অপেক্ষমাণ',
    className: 'bg-amber-100 text-amber-700 border-amber-200',
    rank: 0,
    cancelled: false,
  };
}

/**
 * Returns the index (0-3) of the active tracking step, or -1 when the order is
 * cancelled (the stepper then renders a cancelled state instead of progress).
 */
export function getTrackingStepIndex(order: any): number {
  const badge = getOrderStatusBadge(order);
  if (badge.cancelled) return -1;
  return Math.max(0, Math.min(3, badge.rank));
}

/**
 * Human-friendly payment status badge. Reads the same field the dashboard
 * writes, so "Paid" / "Cash on Delivery" / "Unpaid" stay in sync.
 */
export function getPaymentBadge(order: any): { label: string; labelBn: string; className: string } {
  const method = String(order?.paymentMethod || order?.payment_method || '').toUpperCase();
  const status = String(order?.paymentStatus || order?.payment_status || '').toLowerCase();

  if (status.includes('paid') && !status.includes('unpaid') && !status.includes('partial')) {
    return { label: 'Paid', labelBn: 'পরিশোধিত', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  }
  if (status.includes('partial')) {
    return { label: 'Partially Paid', labelBn: 'আংশিক পরিশোধিত', className: 'bg-blue-100 text-blue-700 border-blue-200' };
  }
  if (status.includes('pending') || status.includes('verif')) {
    return { label: 'Pending Verification', labelBn: 'যাচাই অপেক্ষমাণ', className: 'bg-amber-100 text-amber-700 border-amber-200' };
  }
  if (method.includes('COD') || method.includes('CASH')) {
    return { label: 'Cash on Delivery', labelBn: 'ক্যাশ অন ডেলিভারি', className: 'bg-slate-100 text-slate-700 border-slate-200' };
  }
  return { label: 'Unpaid', labelBn: 'অপরিশোধিত', className: 'bg-red-100 text-red-700 border-red-200' };
}

/**
 * True when the order is Delivered and still inside the return window.
 *
 * The window length comes from the MERCHANT's store settings so each shop can
 * offer its own policy; `windowDays` defaults to 7 days when unset. A returned
 * item (already having a pending/approved return) is excluded by the caller.
 */
export function isReturnEligible(order: any, windowDays = 7): boolean {
  const badge = getOrderStatusBadge(order);
  if (badge.rank !== 3) return false; // must be Delivered

  const created = order?.deliveredAt || order?.delivered_at || order?.updatedAt || order?.createdAt || order?.created_at;
  const ts = created ? new Date(created).getTime() : NaN;
  if (!Number.isFinite(ts)) return true; // no trustworthy date → allow (merchant can reject)

  const days = Math.max(0, Number(windowDays) || 7);
  const ageMs = Date.now() - ts;
  return ageMs <= days * 24 * 60 * 60 * 1000;
}

/** True when the merchant's status says the items were delivered. */
export function isDelivered(order: any): boolean {
  return getOrderStatusBadge(order).rank === 3;
}

/**
 * Commerce Admin "notifies merchant admin dashboard": returns the fields the
 * admin orders view uses to highlight new reverse requests. Kept here so the
 * storefront and the admin badge read the same shape.
 */
export const CUSTOMER_ORDERS_POLL_MS = 15000;

/** The customer-facing tone for a return decision on the tracking timeline. */
export interface ReturnStatusBadge {
  label: string;
  labelBn: string;
  className: string;
}

/**
 * Return-decision badge for the customer's order tracking timeline.
 *
 * The merchant's Approve / Reject / Refund decision is written back onto the
 * order as `return_status` by `PATCH /api/returns/:id`; this projects it for the
 * strip rendered directly under the four-step tracking bar, so the timeline
 * reflects the decision on the customer's next poll. Returns `null` when the
 * order has never had a return requested (no strip is drawn).
 */
export function getReturnStatusBadge(order: any): ReturnStatusBadge | null {
  const raw = String(
    order?.return_status ?? order?.returnStatus ?? order?.reverse_status ?? ''
  )
    .toLowerCase()
    .trim();
  if (!raw) return null;

  if (raw.includes('reject')) {
    return {
      label: 'Return Rejected',
      labelBn: 'রিটার্ন প্রত্যাখ্যাত',
      className: 'bg-rose-100 text-rose-700 border-rose-200',
    };
  }
  if (raw.includes('refund') || raw.includes('revers')) {
    return {
      label: 'Refunded',
      labelBn: 'ফেরত দেওয়া হয়েছে',
      className: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    };
  }
  if (raw.includes('approv')) {
    return {
      label: 'Return Approved',
      labelBn: 'রিটার্ন অনুমোদিত',
      className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    };
  }
  return {
    label: 'Return Requested',
    labelBn: 'রিটার্নের অনুরোধ হয়েছে',
    className: 'bg-amber-100 text-amber-700 border-amber-200',
  };
}
