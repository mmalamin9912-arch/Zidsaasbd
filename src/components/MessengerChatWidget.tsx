/**
 * Facebook Messenger Customer Chat widget for the storefront.
 *
 * WHY THIS EXISTS
 * ---------------
 * Bangladeshi merchants sell primarily through Facebook. A shopper who lands on
 * `storename.zidbdsaas.com` expects the same "Message us" button they see on the
 * merchant's Facebook page. This component loads Meta's official Customer Chat
 * SDK and renders it as a floating button, so a conversation started on the
 * storefront continues in the shopper's Messenger inbox.
 *
 * CONFIGURATION
 * -------------
 * The merchant pastes their numeric Facebook Page ID into
 * Dashboard → Settings → API → "Facebook Messenger Page ID"
 * (`integrationsConfig.facebookPageId`). The value is PUBLIC — the same ID ships
 * in the widget snippet on any website — so the server returns it unredacted.
 * When it is empty this component renders nothing at all.
 *
 * The SDK is injected lazily on mount and guarded by a module-level flag so a
 * re-render (or a second widget instance in the theme preview) cannot load the
 * script twice. If the merchant changes their Page ID while the tab is open, the
 * widget is torn down and re-initialised against the new page.
 */

import { useEffect } from 'react';

/** Props supplied by the storefront renderer. */
export interface MessengerChatWidgetProps {
  /**
   * Numeric Facebook Page ID. An empty/blank value disables the widget, and a
   * non-numeric value (a pasted URL or @username) is ignored rather than being
   * injected into the snippet.
   */
  pageId?: string | null;
  /**
   * Optional locale for the widget's own labels, e.g. `en_US` / `bn_IN`.
   * Defaults to Meta's `en_US`.
   */
  locale?: string;
  /** Smallest allowed width for the expanded chat window. */
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

export function MessengerChatWidget({
  pageId,
  locale = 'en_US',
  minimizedWidth = 300,
}: MessengerChatWidgetProps) {
  // Only digits are valid; anything else would break the `page_id` attribute.
  const cleanPageId = String(pageId ?? '').trim();
  const isValidPageId = /^\d{5,25}$/.test(cleanPageId);

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

  // The visible widget is rendered by Meta's SDK into the root element above, so
  // this React tree intentionally renders nothing.
  return null;
}

export default MessengerChatWidget;
