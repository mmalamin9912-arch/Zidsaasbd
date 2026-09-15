import { useEffect } from 'react';

/**
 * Marketing/tracking IDs a merchant configures in Settings -> API integrations.
 * All are optional — a store with none configured gets no scripts at all.
 */
export interface StorefrontTrackingConfig {
  fbPixelId?: string;
  /** Reserved for server-side Conversions API calls; never exposed client-side. */
  fbCapiToken?: string;
  ga4MeasurementId?: string;
  ga4ApiSecret?: string;
}

/** Marker attribute so a script is only ever injected once per page. */
const INJECTED_ATTR = 'data-zid-tracking';

/** True when an ID looks configured rather than an empty/placeholder value. */
const isSet = (value?: string) => typeof value === 'string' && value.trim() !== '' && value.trim() !== '••';

function injectScript(id: string, build: () => HTMLScriptElement): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`script[${INJECTED_ATTR}="${id}"]`)) return;
  const el = build();
  el.setAttribute(INJECTED_ATTR, id);
  el.async = true;
  document.head.appendChild(el);
}

/**
 * Inject the Meta (Facebook) Pixel loader and queue an initial PageView.
 *
 * The standard bootstrap is inlined so events fired before the remote script
 * downloads are still captured by `fbq`'s own queue.
 */
function injectMetaPixel(pixelId: string): void {
  if (typeof window === 'undefined') return;

  const w = window as unknown as { fbq?: any; _fbq?: any };
  if (!w.fbq) {
    // Minimal, behaviourally-equivalent bootstrap of Meta's own snippet.
    const fbq: any = function (...args: any[]) {
      (fbq.queue = fbq.queue || []).push(args);
    };
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = '2.0';
    w.fbq = fbq;
    w._fbq = fbq;
  }

  injectScript('meta-pixel', () => {
    const el = document.createElement('script');
    el.src = 'https://connect.facebook.net/en_US/fbevents.js';
    return el;
  });

  // Queue the initial page view for this SPA route.
  (window as unknown as { fbq: (...a: any[]) => void }).fbq('init', pixelId);
  (window as unknown as { fbq: (...a: any[]) => void }).fbq('track', 'PageView');
}

/**
 * Inject Google Analytics 4 (gtag.js) and configure the data stream.
 *
 * `ga4ApiSecret` is deliberately NOT used here — it is a write-only credential
 * for the server-side Measurement Protocol and must never reach the browser.
 */
function injectGa4(measurementId: string): void {
  if (typeof window === 'undefined') return;

  const w = window as unknown as { dataLayer?: any[]; gtag?: (...a: any[]) => void };
  w.dataLayer = w.dataLayer || [];
  if (!w.gtag) {
    w.gtag = function (...args: any[]) {
      (w.dataLayer as any[]).push(args);
    };
  }

  injectScript('ga4', () => {
    const el = document.createElement('script');
    el.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    return el;
  });

  (w.gtag as (...a: any[]) => void)('js', new Date());
  (w.gtag as (...a: any[]) => void)('config', measurementId);
}

/**
 * Inject the storefront's configured tracking scripts.
 *
 * Runs client-side after mount so it works for both the SPA dashboard preview
 * and the public storefront route. Each script is injected at most once, and
 * nothing is loaded when the merchant has not configured an ID.
 */
export function useStorefrontTracking(config?: StorefrontTrackingConfig | null): void {
  const pixelId = config?.fbPixelId;
  const ga4Id = config?.ga4MeasurementId;

  useEffect(() => {
    if (isSet(pixelId)) injectMetaPixel(String(pixelId).trim());
    if (isSet(ga4Id)) injectGa4(String(ga4Id).trim());
  }, [pixelId, ga4Id]);
}

export default useStorefrontTracking;
