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
import { buildAnalyticsSummaryPrompt, buildFallbackSummary } from '../../lib/adminAnalytics.js';

/**
 * POST /api/ai/analytics-summary
 * Body: { analyticsData: PlatformAnalyticsResult }  (or the analytics payload directly)
 *
 * Turns the numeric platform analytics payload into a short natural-language
 * EXECUTIVE BRIEFING for the Super Admin Portal.
 *
 * Always answers 200 with a `summary` string — if GEMINI_API_KEY is missing or
 * the provider call fails, a deterministic fallback summary built from the same
 * numbers is returned (`fallback: true`), so the AI panel is never empty.
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

  try {
    const apiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(200).json({ summary: buildFallbackSummary(analyticsData), fallback: true });
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const providerRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildAnalyticsSummaryPrompt(analyticsData) }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 600 },
      }),
    });

    if (!providerRes.ok) {
      console.warn('[/api/ai/analytics-summary] provider status:', providerRes.status);
      res.status(200).json({ summary: buildFallbackSummary(analyticsData), fallback: true });
      return;
    }

    const data = await providerRes.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('')?.trim() || '';

    res.status(200).json({ summary: text || buildFallbackSummary(analyticsData), fallback: !text });
  } catch (err: any) {
    console.error('[/api/ai/analytics-summary] error:', err?.message || err);
    res.status(200).json({ summary: buildFallbackSummary(analyticsData), fallback: true });
  }
}
