import React, { useState } from 'react';
import { Facebook, MessageCircle, Phone, Send } from 'lucide-react';

interface ContactStoreOwnerWidgetProps {
  /** Digits-only WhatsApp number → `wa.me/<number>`. */
  whatsappNumber?: string | null;
  /** Resolved Messenger link → `m.me/<pageId>` (or the Facebook page URL). */
  messengerHref?: string | null;
  /** Telegram handle → `t.me/<handle>`. */
  telegramHandle?: string | null;
  /** Accessible label for the floating trigger button. */
  label?: string;
}

/**
 * "Contact Store Owner" floating widget for merchant storefronts.
 *
 * Replaces the AI Smart Support Panel on custom store links (`/e/[store]`).
 * Instead of a predefined-issue workflow, it exposes the merchant's own
 * configured chat channels as direct links so a customer can reach the vendor
 * instantly on WhatsApp, Messenger or Telegram — whatever the merchant filled
 * out in their dashboard store-profile settings.
 */
export default function ContactStoreOwnerWidget({
  whatsappNumber,
  messengerHref,
  telegramHandle,
  label = 'Contact Store Owner',
}: ContactStoreOwnerWidgetProps) {
  const [open, setOpen] = useState(false);

  const channels = [
    whatsappNumber && {
      href: `https://wa.me/${String(whatsappNumber).replace(/\D/g, '')}`,
      label: 'WhatsApp',
      icon: <MessageCircle className="w-5 h-5" />,
      color: 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5',
    },
    messengerHref && {
      href: messengerHref,
      label: 'Messenger',
      icon: <Facebook className="w-5 h-5" />,
      color: 'text-[#1877F2] border-[#1877F2]/20 bg-[#1877F2]/5',
    },
    telegramHandle && {
      href: `https://t.me/${String(telegramHandle).replace(/^@/, '')}`,
      label: 'Telegram',
      icon: <Send className="w-5 h-5" />,
      color: 'text-blue-500 border-blue-500/20 bg-blue-500/5',
    },
  ].filter(Boolean);

  if (channels.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-6 z-[9999]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={label}
        className="group flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-white shadow-2xl shadow-indigo-900/40 ring-1 ring-white/25 transition hover:scale-105 active:scale-95 cursor-pointer"
      >
        <Phone className="relative h-5 w-5" />
        <span className="hidden sm:block text-sm font-bold">{label}</span>
      </button>

      {open && (
        <div
          className="absolute bottom-[88px] right-0 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-xl animate-fade-in-up"
        >
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Chat directly with the store owner
          </div>
          {channels.map((channel) => (
            <a
              key={channel.label}
              href={channel.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition border border-transparent hover:border-slate-300"
            >
              {channel.icon}
              <span>{channel.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
