// Client-side AI service. Talks to the /api/ai/generate-text serverless
// function — the GEMINI_API_KEY itself lives ONLY on the server (env vars),
// never in the browser bundle.

export type AiTextError =
  | 'missing_api_key'
  | 'invalid_api_key'
  | 'rate_limited'
  | 'network_error'
  | 'server_error'
  | 'bad_request';

export interface AiTextResult {
  ok: boolean;
  text?: string;
  error?: AiTextError;
  message?: string;
}

const AI_ENDPOINT = '/api/ai/generate-text';

/**
 * Current active Gemini models, in preference order.
 *
 * `models/gemini-2.0-flash` and other 2.0 ids were retired by the provider and
 * now answer `404 NOT_FOUND` / "no longer available", which surfaced in the UI as
 * a frozen AI button. The server owns the actual provider call and reads this
 * list to fall back down the chain, so a single retired id can never take the
 * whole feature offline.
 *
 * Keep this in sync with lib/serverApp.ts (`GEMINI_MODEL_CANDIDATES`).
 */
export const GEMINI_MODEL_CANDIDATES = ['gemini-2.5-flash', 'gemini-1.5-flash'] as const;

/** The model the client asks for first. The server overrides it if retired. */
export const DEFAULT_GEMINI_MODEL = GEMINI_MODEL_CANDIDATES[0];

/**
 * Hard ceiling on a single AI request.
 *
 * Without this, a provider that accepts the socket but never answers leaves the
 * awaiting handler pending forever — the spinner never clears and the AI buttons
 * look "frozen". Aborting turns that into a normal, catchable error the caller
 * already knows how to render.
 */
const AI_REQUEST_TIMEOUT_MS = 20000;

/**
 * Canonical system instruction for the Zid AI Assistant.
 *
 * The assistant is BOTH a Sales Copilot (growth/marketing/sales insights)
 * AND a Platform Support Specialist (billing, plans, subscriptions,
 * products, orders, domains, payments, theme, etc.).
 *
 * It must always mirror the user's language (Bengali, Banglish or English).
 */
export const ZID_AI_SYSTEM_INSTRUCTION = `You are "Zid AI" — the built-in AI assistant of the Zid SaaS e-commerce platform for Bangladeshi merchants.

## YOUR TWO ROLES

1. **Sales Copilot & Growth Advisor**: You help merchants grow their business — sales strategy, marketing tips, product pricing, bundling, Facebook/Instagram/WhatsApp marketing, Ramadan/Eid campaign ideas, cart-abandonment recovery, upselling/cross-selling, customer retention, and reading analytics (revenue, orders, top products, stock status). Always give concrete, actionable advice tailored to a Bangladeshi online store (bKash/Nagad, COD, Steadfast-style courier culture).

2. **Platform Support Specialist**: You guide merchants through the platform itself — products, categories, orders, payments setup, shipping, domains, storefront theme customization, customer management, and billing.

## PLATFORM KNOWLEDGE (FACTUAL — NEVER INVENT)

- **Plans & subscriptions**: This platform runs on subscription plans. Plan upgrades/purchases require ADMIN APPROVAL. If a merchant asks about a pending plan, upgrade, subscription status, or billing, you MUST explain (in the user's language):
  "When you upgrade or purchase a plan, it stays in 'Pending' status until the Admin verifies the payment. Once verified, your plan will be activated automatically."
  (Bengali version: "আপনি যখন প্ল্যান আপগ্রেড বা কেনাকাটা করেন, তা Admin পেমেন্ট যাচাই না করা পর্যন্ত 'Pending' স্ট্যাটাসে থাকে। পেমেন্ট যাচাই হওয়ার পর আপনার প্ল্যান স্বয়ংক্রিয়ভাবে অ্যাক্টিভ হয়ে যাবে।")
- Subscription billing issues (charged but not activated, wrong plan) → advise the merchant to contact platform support / the admin, since activation is manual after payment verification.
- Products are managed under the Products tab; orders under Orders; payments under Settings → Payments (bKash, Nagad, cards, COD); domains under Settings → Domains; storefront design under the Theme Customizer.

## CONTEXT-AWARE QUERY HANDLING

Classify each message and respond accordingly:
- **Subscriptions / Plans / Billing / Payments / Support / How-to questions** → give direct, step-by-step platform guidance and instructions (with exact tab/section names).
- **Sales / Marketing / Growth / Analytics questions** → give growth insights, benchmarks, and practical tips for a Bangladeshi D2C store.
- If a message mixes both, answer both parts.
- If you genuinely lack the data (e.g. live sales numbers), say what you can do and what the merchant should check — never fabricate statistics.

## LANGUAGE RULES (CRITICAL)

- **Always respond in the exact same language used by the user. Do not switch languages mid-conversation.**
- Detect the language of EACH user message dynamically:
  - Bengali script (অ-য়) → reply in clear, professional Bengali.
  - Banglish / Romanized Bengali (e.g. "amar plan keno pending ache?", "kivabe product upload korbo?") → reply in clear, professional Bengali written in the Bengali script.
  - English → reply in clear, professional English.
- Keep tone friendly, professional and concise. Use short paragraphs or numbered steps for instructions.
- Do not mix English sentences into a Bengali reply (platform tab/feature names like "Products", "Settings → Payments" may stay in English).`;

export async function generateAiText(
  prompt: string,
  systemInstruction?: string
): Promise<AiTextResult> {
  // AbortController so a hung provider cannot freeze the caller indefinitely.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The server validates this against its own candidate list, so a retired
      // id here degrades to the next active model instead of failing the request.
      body: JSON.stringify({ prompt, systemInstruction, model: DEFAULT_GEMINI_MODEL }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: (data?.error as AiTextError) || 'server_error',
        message:
          data?.message ||
          (res.status === 404
            ? 'The AI service is temporarily unavailable. You can continue saving the product.'
            : 'AI request failed. You can continue saving the product.')
      };
    }

    if (!data?.text) {
      return { ok: false, error: 'server_error', message: 'AI generation is temporarily unavailable. You can continue saving the product.' };
    }

    return { ok: true, text: data.text };
  } catch (err: any) {
    // An abort is our own timeout, not a user-visible network failure — report it
    // with a message that tells the merchant the request can simply be retried.
    if (err?.name === 'AbortError') {
      return {
        ok: false,
        error: 'network_error',
        message: 'The AI took too long to respond. Please try again.'
      };
    }
    return {
      ok: false,
      error: 'network_error',
      message: 'Could not reach the AI service. Check your internet connection and try again.'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Maps an AI error to a short, user-facing alert message (English + Bangla). */
export function aiErrorMessage(result: AiTextResult): string {
  switch (result.error) {
    case 'missing_api_key':
      return 'AI is not configured: the GEMINI_API_KEY is missing on the server.\n\nAI is not configured: the GEMINI_API_KEY is missing on the server (Vercel > Settings > Environment Variables).';
    case 'invalid_api_key':
      return 'The AI API key is invalid or rejected.\n\nThe configured AI API key is invalid — verify GEMINI_API_KEY on the server.';
    case 'rate_limited':
      return 'AI usage limit reached. Please try again in a minute.\n\nAI usage limit reached — please try again in a while.';
    case 'network_error':
      return 'Network error: could not reach the AI service. Check your connection.';
    default:
      return result.message || 'AI request failed. Please try again.';
  }
}
