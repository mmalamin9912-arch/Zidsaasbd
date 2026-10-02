// =============================================================================
// Growth Tools API client — persistence for the Growth Engine page.
// -----------------------------------------------------------------------------
// WHY THIS EXISTS
//   Every input on the Growth page (Meta/TikTok/GA4 IDs, the WhatsApp provider
//   key + instance id, the recovery message template) was React `useState`, so a
//   page reload threw it all away. Nothing reached the backend, which meant the
//   storefront had no pixel to inject and the "auto-recovery" could never send a
//   message. The server side now persists the block as `growthConfig` on the
//   store record and mirrors it into the `store_settings` collection as
//   `growth_tools`; these helpers are the browser half of that contract.
//
// CONTRACT (mirrors src/lib/storeApi.ts and src/lib/logisticsApi.ts):
//   • every helper talks to a real /api/ route,
//   • a failed request returns the supplied fallback instead of throwing,
//   • `whatsappApiKey` arrives as '••' — treat that as "saved, unchanged" and
//     never write it back, or the real token is destroyed.
// =============================================================================

import { resolveActiveStoreSlug } from './activeStore';
import { safeJson, isUsableStoreRef } from './storeApi';

/** What the server stores for the Growth Engine. Mirrors `normalizeGrowthConfig`. */
export interface GrowthConfig {
  /** Meta / Facebook Pixel ID — injected into the storefront. */
  fbPixelId: string;
  /** TikTok Pixel ID — injected into the storefront. */
  tiktokPixelId: string;
  /** Google Analytics 4 measurement ID (G-XXXXXXX). */
  ga4MeasurementId: string;
  seoOptimized: boolean;

  /** Master switch for abandoned-cart WhatsApp recovery. */
  whatsappRecoveryEnabled: boolean;
  /** Write-only provider token; '••' means "saved, unchanged". */
  whatsappApiKey: string;
  /** WhatsApp provider instance id. */
  whatsappInstanceId: string;
  /** Merchant-authored message copy; see `templatePlaceholders` for the tokens. */
  whatsappRecoveryTemplate: string;
  /** Headline offer substituted into `{{discount}}`. */
  whatsappDiscountPercent: number;
}

/** The headline "Recovered Sales This Month" figure. */
export interface RecoveredSales {
  recoveredCarts: number;
  recoveredSalesBDT: number;
  deliveredMessages: number;
}

/** True for a credential placeholder — the field is set but must not be re-sent. */
export const SECRET_PLACEHOLDER = '••';

export const DEFAULT_RECOVERY_TEMPLATE =
  "Hi {{name}}! 👋\n\n" +
  'You left your *{{itemName}}* in your cart at {{storeName}} — we saved it for you.\n\n' +
  '👉 Coupon code: *{{couponCode}}* ({{discount}})\n' +
  'Offer expires {{expiresAt}}.\n\n' +
  'Reply to this message or visit the store to complete your order.';

export const EMPTY_GROWTH_CONFIG: GrowthConfig = {
  fbPixelId: '',
  tiktokPixelId: '',
  ga4MeasurementId: '',
  seoOptimized: true,
  whatsappRecoveryEnabled: false,
  whatsappApiKey: '',
  whatsappInstanceId: '',
  whatsappRecoveryTemplate: DEFAULT_RECOVERY_TEMPLATE,
  whatsappDiscountPercent: 10,
};

const EMPTY_RECOVERED_SALES: RecoveredSales = {
  recoveredCarts: 0,
  recoveredSalesBDT: 0,
  deliveredMessages: 0,
};

/** Resolve the store ref the same way every other settings panel does. */
function resolveRef(storeRef?: string | null): string {
  if (!isUsableStoreRef(storeRef)) return resolveActiveStoreSlug(storeRef);
  return String(storeRef).split(':')[0].trim().toLowerCase();
}

/** Coerce a partial/unknown server payload into a complete `GrowthConfig`. */
function normalizeGrowthConfig(raw: any): GrowthConfig {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    fbPixelId: String(src.fbPixelId || '').trim(),
    tiktokPixelId: String(src.tiktokPixelId || '').trim(),
    ga4MeasurementId: String(src.ga4MeasurementId || '').trim(),
    seoOptimized: src.seoOptimized !== false,
    whatsappRecoveryEnabled: src.whatsappRecoveryEnabled === true,
    whatsappApiKey: String(src.whatsappApiKey || ''),
    whatsappInstanceId: String(src.whatsappInstanceId || '').trim(),
    whatsappRecoveryTemplate:
      String(src.whatsappRecoveryTemplate || '').trim() || DEFAULT_RECOVERY_TEMPLATE,
    whatsappDiscountPercent:
      Number.isFinite(Number(src.whatsappDiscountPercent)) && Number(src.whatsappDiscountPercent) > 0
        ? Number(src.whatsappDiscountPercent)
        : 10,
  };
}

/**
 * Load the store's Growth settings.
 * Never throws — a failed request yields `EMPTY_GROWTH_CONFIG`.
 */
export async function loadGrowthConfig(
  storeRef?: string | null
): Promise<GrowthConfig> {
  const store_slug = resolveRef(storeRef);
  try {
    const res = await fetch(
      `/api/store/growth-tools?store_slug=${encodeURIComponent(store_slug)}`
    );
    const data = await safeJson<{ ok?: boolean; growthConfig?: any; error?: string }>(res);
    if (!data || data.ok === false) {
      if (data?.error) console.warn('[growthToolsApi] load rejected:', data.error);
      return EMPTY_GROWTH_CONFIG;
    }
    return normalizeGrowthConfig(data.growthConfig);
  } catch (e: any) {
    console.warn('[growthToolsApi] load failed:', e?.message || e);
    return EMPTY_GROWTH_CONFIG;
  }
}

/**
 * Persist the Growth settings.
 *
 * `whatsappApiKey` is stripped when it still holds the '••' placeholder, so
 * saving an otherwise unchanged form cannot wipe the stored provider token.
 * Returns the saved (redacted) config, or null when the save failed.
 */
export async function saveGrowthConfig(
  config: Partial<GrowthConfig>,
  storeRef?: string | null
): Promise<GrowthConfig | null> {
  const store_slug = resolveRef(storeRef);
  try {
    const patch: Record<string, any> = { ...config };
    if (patch.whatsappApiKey === SECRET_PLACEHOLDER) delete patch.whatsappApiKey;

    const res = await fetch('/api/store/growth-tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_slug, growthConfig: patch }),
    });
    const data = await safeJson<{ ok?: boolean; growthConfig?: any; error?: string }>(res);
    if (!data || data.ok === false) {
      console.warn('[growthToolsApi] save rejected:', data?.error || 'unknown error');
      return null;
    }
    return normalizeGrowthConfig(data.growthConfig);
  } catch (e: any) {
    console.warn('[growthToolsApi] save failed:', e?.message || e);
    return null;
  }
}

/** Read the real "Recovered Sales This Month" aggregate for the store. */
export async function loadRecoveredSales(
  storeRef?: string | null
): Promise<RecoveredSales> {
  const store_slug = resolveRef(storeRef);
  try {
    const res = await fetch(
      `/api/store/growth-tools/recovered-sales?store_slug=${encodeURIComponent(store_slug)}`
    );
    const data = await safeJson<{
      ok?: boolean;
      recoveredCarts?: number;
      recoveredSalesBDT?: number;
      deliveredMessages?: number;
    }>(res);
    if (!data || data.ok === false) return EMPTY_RECOVERED_SALES;
    return {
      recoveredCarts: Number(data.recoveredCarts) || 0,
      recoveredSalesBDT: Number(data.recoveredSalesBDT) || 0,
      deliveredMessages: Number(data.deliveredMessages) || 0,
    };
  } catch (e: any) {
    console.warn('[growthToolsApi] recovered sales failed:', e?.message || e);
    return EMPTY_RECOVERED_SALES;
  }
}

/** A caption produced by the AI writer, already split into copy and hashtags. */
export interface GeneratedCaption {
  caption: string;
  hashtags: string[];
  callToAction: string;
  /** True when the AI was unavailable and this is local fallback copy. */
  fallback: boolean;
  error?: string;
}

export interface CaptionRequest {
  /** What the post is about — the merchant's own words. */
  prompt: string;
  storeName?: string;
  /** facebook | instagram | tiktok | … (free text; defaults to facebook). */
  platform?: string;
  tone?: string;
}

/**
 * Generate a promotional caption + hashtags through the backend AI route.
 *
 * `/api/ai/generate-caption` never 5xx — it degrades to flagged fallback copy —
 * so `fallback` is what the UI must branch on, not the HTTP status. Never throws.
 */
export async function generateCaption(
  request: CaptionRequest
): Promise<GeneratedCaption | null> {
  const prompt = String(request.prompt || '').trim();
  if (!prompt) return null;

  try {
    const res = await fetch('/api/ai/generate-caption', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        storeName: request.storeName,
        platform: request.platform,
        tone: request.tone,
      }),
    });
    const data = await safeJson<{
      ok?: boolean;
      caption?: string;
      hashtags?: string[];
      callToAction?: string;
      fallback?: boolean;
      error?: string;
      message?: string;
    }>(res);

    if (!data) {
      console.warn('[growthToolsApi] caption returned a non-JSON response');
      return null;
    }
    // A 400 is the only shape that is genuinely unusable (no prompt at all).
    if (!res.ok && !data.caption) {
      console.warn('[growthToolsApi] caption rejected:', data.message || data.error);
      return null;
    }
    if (!data.caption) return null;

    return {
      caption: String(data.caption),
      hashtags: Array.isArray(data.hashtags)
        ? data.hashtags.map((t: any) => String(t)).filter(Boolean)
        : [],
      callToAction: String(data.callToAction || ''),
      fallback: data.fallback === true,
      error: data.error,
    };
  } catch (e: any) {
    console.warn('[growthToolsApi] caption request failed:', e?.message || e);
    return null;
  }
}

/** Caption + hashtags rendered as one paste-ready block. */
export function formatCaptionForClipboard(result: GeneratedCaption): string {
  const hashtags = result.hashtags.join(' ');
  return [result.caption, result.callToAction, hashtags].filter(Boolean).join('\n\n').trim();
}