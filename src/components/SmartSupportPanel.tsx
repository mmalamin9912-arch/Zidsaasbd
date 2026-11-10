/**
 * Smart AI-powered customer support panel.
 *
 * Replaces the free-text support chat with a PRE-DEFINED ISSUE SELECTOR: the
 * customer taps an issue button (no typing), and the AI layer responds
 * instantly.
 *
 * Routing rules
 * -------------
 * - CRITICAL issues ("cancel/reject order", "payment verification") are
 *   escalated to the VENDOR: `onEscalate` fires so the storefront records the
 *   request, which (a) pushes a notification into the vendor's dashboard bell
 *   feed and (b) surfaces the vendor's direct phone / WhatsApp link to the
 *   customer, alongside the customer's phone + order details so both sides can
 *   resolve it without platform/admin intervention.
 * - MINOR issues are answered by the AI with a predefined resolution message.
 */

import React from 'react';
import { AlertTriangle, CheckCircle2, Phone, MessageCircle, ShieldCheck, Loader2 } from 'lucide-react';
import type { Order } from '../types';

export type SupportIssueId =
  | 'cancel_order'
  | 'payment_verification'
  | 'delivery_delay'
  | 'return_refund'
  | 'wrong_item'
  | 'general_question';

export interface SupportIssue {
  id: SupportIssueId;
  /** Button label shown to the customer. */
  label: string;
  /** Bangla label, shown when the storefront runs in Bangla. */
  labelBn: string;
  /** True when selecting this issue must notify the vendor and reveal contacts. */
  critical: boolean;
  /** AI's automated resolution message for minor issues. */
  aiReply: string;
  aiReplyBn: string;
}

export const SUPPORT_ISSUES: SupportIssue[] = [
  {
    id: 'cancel_order',
    label: 'I want to cancel / reject my order',
    labelBn: 'আমি আমার অর্ডার বাতিল / প্রত্যাখ্যান করতে চাই',
    critical: true,
    aiReply: '',
    aiReplyBn: '',
  },
  {
    id: 'payment_verification',
    label: 'Payment verification issue',
    labelBn: 'পেমেন্ট যাচাইকরণ সমস্যা',
    critical: true,
    aiReply: '',
    aiReplyBn: '',
  },
  {
    id: 'delivery_delay',
    label: 'Delivery is delayed',
    labelBn: 'ডেলিভারি দেরি হচ্ছে',
    critical: false,
    aiReply:
      'Deliveries usually complete within 1–3 working days inside Dhaka and 3–5 days outside. Your parcel is still within the normal window. If it has not arrived after that, choose "I want to cancel / reject my order" and the store will contact you directly.',
    aiReplyBn:
      'ঢাকার ভেতরে সাধারণত ১–৩ কর্মদিবস এবং ঢাকার বাইরে ৩–৫ কর্মদিবসে ডেলিভারি সম্পন্ন হয়। আপনার পার্সেল এখনো স্বাভাবিক সময়ের মধ্যেই আছে। এরপরও না পেলে "আমি আমার অর্ডার বাতিল করতে চাই" নির্বাচন করুন — দোকান সরাসরি আপনার সাথে যোগাযোগ করবে।',
  },
  {
    id: 'return_refund',
    label: 'Return / Refund request',
    labelBn: 'রিটার্ন / রিফান্ড রিকোয়েস্ট',
    critical: false,
    aiReply:
      'You can request a return on any delivered order from the Orders tab — open the order and tap "Request Return". The store reviews it and the refund status updates right on the order card.',
    aiReplyBn:
      'ডেলিভারি হওয়া যেকোনো অর্ডারের জন্য Orders ট্যাব থেকে রিটার্ন রিকোয়েস্ট করতে পারেন — অর্ডারটি খুলে "Request Return" চাপুন। দোকান রিভিউ করলে রিফান্ড স্ট্যাটাস অর্ডার কার্ডেই আপডেট হবে।',
  },
  {
    id: 'wrong_item',
    label: 'Received a wrong or damaged item',
    labelBn: 'ভুল বা ক্ষতিগ্রস্ত পণ্য পেয়েছি',
    critical: true,
    aiReply: '',
    aiReplyBn: '',
  },
  {
    id: 'general_question',
    label: 'General question about a product',
    labelBn: 'পণ্য সম্পর্কে সাধারণ প্রশ্ন',
    critical: false,
    aiReply:
      'Every product page lists the full description, variants, stock and delivery charges. Tap any product in the shop to see everything — or use the floating chat button to reach the store on Messenger / WhatsApp.',
    aiReplyBn:
      'প্রতিটি পণ্যের পেজে সম্পূর্ণ বিবরণ, ভ্যারিয়েন্ট, স্টক ও ডেলিভারি চার্জ দেওয়া আছে। দোকান থেকে যেকোনো পণ্যে চাপ দিলেই সব দেখতে পাবেন — অথবা ফ্লোটিং চ্যাট বাটন দিয়ে Messenger / WhatsApp-এ দোকানের সাথে কথা বলুন।',
  },
];

export interface SmartSupportPanelProps {
  /** The customer's active orders, newest first — used to attach context to the escalation. */
  orders: Order[];
  /** The customer's own phone number (session), shared with the vendor on escalation. */
  customerPhone: string;
  /** The customer's display name. */
  customerName: string;
  /** Vendor (store) direct contact number, digits only. Empty when the store has none. */
  vendorPhone: string;
  /** Vendor display name, e.g. the store name. */
  vendorName: string;
  /** Bangla UI flag from the storefront language toggle. */
  isBangla: boolean;
  /**
   * Called when a CRITICAL issue is selected. The storefront persists the
   * escalation and pushes it to the vendor's notification feed; the promise
   * resolves when the vendor-side write has finished (best effort).
   */
  onEscalate: (issue: SupportIssue, order: Order | null) => void | Promise<void>;
}

interface ChatLine {
  from: 'ai' | 'customer';
  text: string;
  /** Critical-issue routing payload rendered under the AI line. */
  routing?: {
    vendorPhone: string;
    vendorName: string;
    waHref: string;
    telHref: string;
    orderNumber: string;
    orderTotal: string;
  };
}

const digitsOnly = (v: unknown): string => String(v || '').replace(/\D/g, '');

/** The order the escalation is about: the newest non-delivered order, else the newest. */
function pickOrderForIssue(orders: Order[]): Order | null {
  if (!orders.length) return null;
  const active = orders.find((o) => !['Delivered', 'Completed', 'Cancelled', 'Reversed'].includes(String(o.fulfillmentStatus || '')));
  return active || orders[0];
}

/**
 * Turn the storefront's stored number into a wa.me target. A local BD number
 * ("01XXXXXXXXX") gets the +88 country code; an already-international number
 * is passed through unchanged.
 */
function toWaTarget(phone: string): string {
  const d = digitsOnly(phone);
  if (!d) return '';
  if (d.startsWith('880')) return d;
  if (d.startsWith('0')) return `88${d}`;
  return d;
}

const SmartSupportPanel: React.FC<SmartSupportPanelProps> = ({
  orders,
  customerPhone,
  customerName,
  vendorPhone,
  vendorName,
  isBangla,
  onEscalate,
}) => {
  const [chat, setChat] = React.useState<ChatLine[]>([]);
  const [selectedId, setSelectedId] = React.useState<SupportIssueId | null>(null);
  const [escalating, setEscalating] = React.useState(false);

  const handleSelect = async (issue: SupportIssue) => {
    setSelectedId(issue.id);
    // Echo the customer's choice as their side of the conversation.
    setChat((prev) => [...prev, { from: 'customer', text: isBangla ? issue.labelBn : issue.label }]);

    if (!issue.critical) {
      // MINOR issue — the AI answers instantly with the predefined resolution.
      setChat((prev) => [...prev, { from: 'ai', text: isBangla ? issue.aiReplyBn : issue.aiReply }]);
      return;
    }

    // CRITICAL issue — notify the vendor, then route both parties to each other.
    setEscalating(true);
    try {
      await onEscalate(issue, pickOrderForIssue(orders));
    } finally {
      setEscalating(false);
    }

    const order = pickOrderForIssue(orders);
    const waTarget = toWaTarget(vendorPhone);
    const firstLine =
      isBangla
        ? `সমস্যাটি দোকান (${vendorName || 'দোকান'}) কে জানিয়ে দেওয়া হয়েছে ✅ সরাসরি সমাধানের জন্য নিচের যোগাযোগ মাধ্যমগুলো ব্যবহার করুন।`
        : `The store${vendorName ? ` (${vendorName})` : ''} has been notified about this issue ✅ Use the direct contact options below to resolve it right away.`;
    const routing = {
      vendorPhone,
      vendorName,
      waHref: waTarget ? `https://wa.me/${waTarget}` : '',
      telHref: waTarget ? `tel:+${waTarget}` : '',
      orderNumber: String(order?.orderNumber || order?.id || ''),
      orderTotal: order ? `৳${Number(order.totalBDT || 0).toLocaleString()}` : '',
    };
    const details =
      isBangla
        ? `আপনার তথ্য দোকানের কাছে পাঠানো হয়েছে: ${customerName || 'কাস্টমার'}${customerPhone ? ` (${customerPhone})` : ''}${order ? ` — অর্ডার #${routing.orderNumber}, ${routing.orderTotal}` : ''}`
        : `Your details were shared with the store: ${customerName || 'Customer'}${customerPhone ? ` (${customerPhone})` : ''}${order ? ` — order #${routing.orderNumber}, ${routing.orderTotal}` : ''}`;
    setChat((prev) => [
      ...prev,
      { from: 'ai', text: firstLine, routing },
      ...(customerPhone || order ? [{ from: 'ai', text: details }] : []),
    ]);
  };

  return (
    <div className="space-y-3">
      {/* Predefined issue buttons — no typing required. */}
      <div className="grid grid-cols-1 gap-2">
        {SUPPORT_ISSUES.map((issue) => {
          const isSelected = selectedId === issue.id;
          return (
            <button
              key={issue.id}
              type="button"
              disabled={escalating}
              onClick={() => handleSelect(issue)}
              className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left text-sm font-semibold transition cursor-pointer disabled:opacity-60 ${
                isSelected
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2.5">
                {issue.critical ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-slate-400" />
                )}
                <span>{isBangla ? issue.labelBn : issue.label}</span>
              </span>
              {escalating && issue.critical && isSelected && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
              )}
            </button>
          );
        })}
      </div>

      {/* AI conversation thread. */}
      {chat.length > 0 && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          {chat.map((line, idx) => (
            <div key={idx} className={`flex ${line.from === 'customer' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  line.from === 'customer'
                    ? 'rounded-br-sm bg-slate-800 text-white'
                    : 'rounded-bl-sm border border-slate-200 bg-white text-slate-700'
                }`}
              >
                {line.from === 'ai' && (
                  <div className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-600">
                    <ShieldCheck className="h-3 w-3" /> Zid AI
                  </div>
                )}
                <p className="whitespace-pre-wrap">{line.text}</p>

                {/* Vendor routing card for critical issues. */}
                {line.routing && (line.routing.waHref || line.routing.orderNumber) && (
                  <div className="mt-2 space-y-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
                    {line.routing.orderNumber && (
                      <div className="text-[11px] font-bold text-slate-700">
                        {isBangla ? 'সংশ্লিষ্ট অর্ডার' : 'Related order'}: #{line.routing.orderNumber}
                        {line.routing.orderTotal ? ` · ${line.routing.orderTotal}` : ''}
                      </div>
                    )}
                    {line.routing.waHref ? (
                      <div className="flex flex-wrap gap-1.5">
                        <a
                          href={line.routing.waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp {line.routing.vendorName ? `· ${line.routing.vendorName}` : ''}
                        </a>
                        <a
                          href={line.routing.telHref}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                        >
                          <Phone className="h-3.5 w-3.5" /> {line.routing.vendorPhone}
                        </a>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500">
                        {isBangla
                          ? 'দোকানের সরাসরি নম্বর পাওয়া যায়নি — দোকান শীঘ্রই আপনার নম্বরে যোগাযোগ করবে।'
                          : 'The store has no published direct number — they will reach you on your number shortly.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SmartSupportPanel;
