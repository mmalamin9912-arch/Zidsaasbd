/**
 * Facebook Messenger floating chat button for the storefront.
 * ALWAYS renders a pinned bottom-right button when a Page ID or Page URL
 * exists — never depends on the Meta SDK for visibility. Clicking opens
 * the Messenger / Facebook URL in a new tab. The legacy Customer Chat SDK
 * is still loaded best-effort when a numeric Page ID is present.
 */

import { useEffect } from 'react';

/** Props supplied by the storefront renderer. */
export interface MessengerChatWidgetProps {
  /** Numeric Facebook Page ID → links to `m.me/<id>`. */
  pageId?: string | null;
  /** Fallback Facebook Page URL / handle. Used when `pageId` is absent. */
  pageUrl?: string | null;
  /** Locale for the legacy SDK labels. Defaults to `en_US`. */
  locale?: string;
  /** Smallest allowed width for the legacy SDK chat window. */
  minimizedWidth?: number;
}

/** The element id the Customer Chat SDK looks for; must be unique per document. */
const ROOT_ID = 'zid-fb-customer-chat-root';

/** Set once the script tag has been appended (per document lifetime). */
let sdkLoadPromise: Promise<void> | null = null;

/** The `fbAsyncInit` hook the SDK calls when it has loaded. */
declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (options: Record<string, unknown>) => void;
      XFBML?: { parse: () => void };
      CustomerChat?: { show: () => void; hide: () => void };
    };
  }
}

/** Inject the Customer Chat SDK exactly once, resolving when it is ready. */
function loadMessengerSdk(locale: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise<void>((resolve) => {
    // The SDK calls this global when it finishes loading. The previous handler
    // (if any) is preserved so two widgets cannot clobber each other's init.
    const previousInit = window.fbAsyncInit;
    window.fbAsyncInit = () => {
      try {
        previousInit?.();
      } catch {
        /* a previous widget's init failing must not block ours */
      }
      try {
        window.FB?.init({
          xfbml: true,
          version: 'v19.0',
        });
      } catch {
        /* init is best-effort; the widget still renders below */
      }
      resolve();
    };

    const existing = document.getElementById('facebook-jssdk');
    if (existing) {
      // Already injected by an earlier mount in this document.
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://connect.facebook.net/${encodeURIComponent(locale)}/sdk/xfbml.customerchat.js`;
    script.onerror = () => {
      // Network/blocker failure: resolve so the widget degrades to "no chat"
      // instead of leaving a permanently pending promise.
      resolve();
    };
    document.body.appendChild(script);
  });

  return sdkLoadPromise;
}

export function resolveMessengerHref(pageId?: string | null, pageUrl?: string | null): string {
  const cleanId = String(pageId ?? '').trim();
  if (/^\d{5,25}$/.test(cleanId)) return `https://m.me/${cleanId}`;
  const raw = String(pageUrl ?? '').trim().replace(/^@/, '');
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\d{5,25}$/.test(raw)) return `https://m.me/${raw}`;
  const bare = raw.replace(/^www\./i, '');
  if (/^(facebook\.com|fb\.com|m\.me)(\/|$)/i.test(bare)) return `https://${bare}`;
  if (/^[a-zA-Z0-9._-]{2,100}$/.test(raw) && !raw.includes('.')) return `https://facebook.com/${raw}`;
  const host = bare.split('/')[0].toLowerCase();
  if (/(^|\.)facebook\.com$/.test(host) || /(^|\.)fb\.com$/.test(host) || /(^|\.)messenger\.com$/.test(host)) return `https://${bare}`;
  return '';
}

/** Official Messenger glyph (white on Messenger blue). */
function MessengerGlyph({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M18 3C9.7 3 3 9.1 3 16.6c0 4.2 2.1 7.9 5.4 10.3v4.5l4.1-2.3c1.1.3 2.3.5 3.5.5 8.3 0 15-6.1 15-13.6S26.3 3 18 3zm1.2 18.3-3.7-4-7.2 4 7.9-8.4 3.8 4 7.1-4-7.9 8.4z" />
    </svg>
  );
}

export function MessengerChatWidget({
  pageId,
  pageUrl,
  locale = 'en_US',
  minimizedWidth = 300,
}: MessengerChatWidgetProps) {
  const cleanPageId = String(pageId ?? '').trim();
  const isValidPageId = /^\d{5,25}$/.test(cleanPageId);
  // ALWAYS-visible floating button target: numeric Page ID wins (m.me opens
  // the chat directly), otherwise fall back to the saved Facebook Page URL.
  const href = resolveMessengerHref(pageId, pageUrl);

  useEffect(() => {
    if (!isValidPageId) return;

    let cancelled = false;

    // The root element MUST exist before the SDK parses, and Meta's snippet
    // requires the `attribution="biz_inbox"` attribute to route the chat to the
    // merchant's Page Inbox.
    if (!document.getElementById(ROOT_ID)) {
      const root = document.createElement('div');
      root.id = ROOT_ID;
      root.setAttribute('attribution', 'biz_inbox');
      root.setAttribute('page_id', cleanPageId);
      root.setAttribute('minimized_width', String(minimizedWidth));
      document.body.appendChild(root);
    } else {
      // A previous mount left the root behind (e.g. the merchant just changed
      // their Page ID); point it at the current page before re-parsing.
      document.getElementById(ROOT_ID)?.setAttribute('page_id', cleanPageId);
    }

    void loadMessengerSdk(locale).then(() => {
      if (cancelled) return;
      try {
        window.FB?.XFBML?.parse();
      } catch {
        /* nothing to parse yet — the SDK will parse on its own init */
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cleanPageId, isValidPageId, locale, minimizedWidth]);

  // No Page ID AND no Page URL → nothing to link to, render nothing.
  if (!href) return null;

  // Pinned floating button: fixed bottom-6 right-6 + z-[9999] keeps it above
  // footers, sticky bottom bars and every theme layer. Rendered in the React
  // tree (not the SDK) so it shows even when the SDK is blocked or retired.
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Chat with us on Messenger"
      aria-label="Chat with us on Messenger"
      data-testid="floating-messenger-widget"
      className="fixed bottom-6 right-6 z-[9999] flex h-14 w-14 items-center justify-center rounded-full bg-[#0084FF] text-white shadow-2xl shadow-black/40 ring-1 ring-white/20 transition hover:scale-110 hover:bg-[#0073E0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <MessengerGlyph />
      <span className="absolute -top-1 -right-1 flex h-4 w-4">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-black text-white">
          1
        </span>
      </span>
    </a>
  );
}

export default MessengerChatWidget;
