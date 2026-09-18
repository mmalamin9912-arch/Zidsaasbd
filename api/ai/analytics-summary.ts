type VercelRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
};

type VercelResponse = {
  status: (status: number) => VercelResponse;
  json: (body: unknown) => unknown;
  setHeader: (name: string, value: string) => void;
  end: () => void;
};

// Explicit '.js' extension required under "type": "module" (see api/ai/generate-text.ts).
import {
  buildAnalyticsSummaryPrompt,
  buildFallbackSummary,
  getGeminiApiKey,
  getPlatformAnalytics,
} from '../../lib/adminAnalytics.js';

/**
 * POST /api/ai/analytics-summary
 * Body: { analyticsData: PlatformAnalyticsResult }  (or the analytics payload directly)
 *
 * Turns the numeric platform analytics payload into a short natural-language
 * EXECUTIVE BRIEFING for the Super Admin Portal.
 *
 * The Gemini key is read from EITHER `GEMINI_API_KEY` (server-only) OR
 * `VITE_GEMINI_API_KEY` (name used by AI Studio/Vercel templates). If neither
 * is configured, or the provider rejects the key, or the provider call times
 * out, the route STILL answers 200 with a deterministic summary computed from
 * the DB metrics (`fallback: true`) — it never throws and never returns 5xx, so
 * the admin AI panel is never empty and never shows a hard error.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed', message: 'Use POST' });
    return;
  }

  const body = (req.body || {}) as any;
  const analyticsData = body.analyticsData || body;

  // Authoritative numbers straight from the database. Used (a) as the source for
  // the fallback summary when the key is missing, and (b) to fill in any metric
  // the request body omitted. A Mongo failure is reported, never thrown.
  let dbMetrics: any = null;
  let dbError: string | null = null;
  try {
    const platform = await getPlatformAnalytics();
    dbMetrics = platform.overview;
    if (platform.ok === false) dbError = platform.error || 'MongoDB unavailable.';
  } catch (err: any) {
    dbError = err?.message || 'MongoDB unavailable.';
    console.warn('[/api/ai/analytics-summary] DB metrics unavailable:', dbError);
  }

  const respondFallback = (reason: string) => {
    res.status(200).json({
      summary: buildFallbackSummary(analyticsData, dbMetrics),
      fallback: true,
      reason,
      dbError,
    });
  };

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    // No key configured (checked both env spellings) — deterministic summary.
    respondFallback('missing_api_key');
    return;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const providerRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildAnalyticsSummaryPrompt(analyticsData, dbMetrics) }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 600 },
      }),
    });

    if (!providerRes.ok) {
      console.warn('[/api/ai/analytics-summary] provider status:', providerRes.status);
      respondFallback(`provider_status_${providerRes.status}`);
      return;
    }

    const data = await providerRes.json().catch(() => null);
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('')?.trim() || '';

    if (!text) {
      respondFallback('empty_provider_response');
      return;
    }

    res.status(200).json({ summary: text, fallback: false, dbError });
  } catch (err: any) {
    // Network error / abort / malformed provider payload — still a clean 200.
    console.error('[/api/ai/analytics-summary] provider error:', err?.message || err);
    respondFallback('provider_error');
  }
}
