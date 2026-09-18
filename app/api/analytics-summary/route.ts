import { getMongoDb, DB_NAME, getMongoUri } from "@/lib/db";
import { buildAnalyticsSummaryPrompt, buildFallbackSummary, getGeminiApiKey, getPlatformAnalytics } from "@/lib/adminAnalytics";

export const dynamic = "force-dynamic";

/**
 * POST /api/analytics-summary  (App Router mirror)
 *
 * Same contract as the Vercel function at api/analytics-summary.ts:
 *   1. Read platform metrics from MongoDB.
 *   2. Ask Gemini (process.env.GEMINI_API_KEY) to summarise them.
 *   3. On a missing key, a provider error, a timeout or an empty response,
 *      return a deterministic summary computed from those same MongoDB numbers.
 *
 * ALWAYS answers 200 with a `summary` string, so the admin panel can never show
 * "Failed to generate summary". GET is also exported so a browser hitting the
 * URL directly, or a health probe, sees JSON rather than a 405.
 */
export async function POST(req: Request) {
  let analyticsData: any = {};
  try {
    const body = await req.json().catch(() => ({}));
    analyticsData = body?.analyticsData || body || {};
  } catch {
    /* an empty or malformed body is fine — DB metrics fill the gaps */
  }

  return buildSummaryResponse(analyticsData);
}

export async function GET(req: Request) {
  // Allow ?metrics=<json> style probing; otherwise fall back to DB metrics.
  try {
    const url = new URL(req.url);
    const fromQuery = url.searchParams.get("analyticsData") || url.searchParams.get("metrics");
    if (fromQuery) return buildSummaryResponse(JSON.parse(fromQuery));
  } catch {
    /* fall through to DB-only metrics */
  }
  return buildSummaryResponse({});
}

/** Shared implementation: DB metrics + Gemini, with a guaranteed fallback. */
async function buildSummaryResponse(analyticsData: any): Promise<Response> {
  // Authoritative numbers straight from the database. A Mongo failure is
  // reported in the payload, never thrown at the caller.
  let dbMetrics: any = null;
  let dbError: string | null = null;
  try {
    if (getMongoUri()) {
      // Touch the handle so a connection problem is caught here rather than
      // surfacing as an opaque failure in the AI path.
      await getMongoDb(DB_NAME);
    }
    const platform = await getPlatformAnalytics();
    dbMetrics = platform.overview;
    if (platform.ok === false) dbError = platform.error || "MongoDB unavailable.";
  } catch (err: any) {
    dbError = err?.message || "MongoDB unavailable.";
    console.warn("[/api/analytics-summary] DB metrics unavailable:", dbError);
  }

  const fallback = () => ({
    summary: buildFallbackSummary(analyticsData, dbMetrics),
    fallback: true,
    dbError,
  });

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return Response.json({ ...fallback(), reason: "missing_api_key" });
  }

  try {
    const key = apiKey;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;
    const providerRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildAnalyticsSummaryPrompt(analyticsData, dbMetrics) }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 600 },
      }),
    });

    if (!providerRes.ok) {
      console.warn("[/api/analytics-summary] provider status:", providerRes.status);
      return Response.json({ ...fallback(), reason: `provider_status_${providerRes.status}` });
    }

    const data = await providerRes.json().catch(() => null);
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("")?.trim() || "";

    if (!text) {
      return Response.json({ ...fallback(), reason: "empty_provider_response" });
    }

    return Response.json({ summary: text, fallback: false, dbError });
  } catch (err: any) {
    // Network error / abort / malformed provider payload — still a clean 200.
    console.error("[/api/analytics-summary] provider error:", err?.message || err);
    return Response.json({ ...fallback(), reason: "provider_error" });
  }
}
