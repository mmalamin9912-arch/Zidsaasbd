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

// Explicit '.js' extension required: package.json sets "type": "module", so
// Vercel's Node ESM resolver rejects extensionless relative specifiers with
// ERR_MODULE_NOT_FOUND ('/var/task/src/lib/aiService'). Vercel emits aiService.js.
import { ZID_AI_SYSTEM_INSTRUCTION } from '../../src/lib/aiService.js';

/**
 * POST /api/ai/generate-text
 * Body: { prompt: string, systemInstruction?: string }
 *
 * Uses the Gemini API with GEMINI_API_KEY from server-side environment
 * variables (never exposed to the browser).
 *
 * The canonical Zid AI platform instruction (Sales Copilot + Platform Support
 * Specialist + Bengali/English language matching) is ALWAYS applied. If the
 * caller passes its own systemInstruction, it is appended as extra context.
 *
 * Responses:
 *  - 200 { text: string }
 *  - 400 { error: 'missing_api_key', message: string }  -> key not configured
 *  - 401 { error: 'invalid_api_key', message: string }  -> key rejected by provider
 *  - 429 { error: 'rate_limited', message: string }
 *  - 500 { error: 'server_error', message: string }
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

  try {
    const { prompt, systemInstruction } = (req.body || {}) as { prompt?: string; systemInstruction?: string };

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'bad_request', message: 'A non-empty "prompt" is required.' });
      return;
    }

    const apiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(400).json({
        error: 'missing_api_key',
        message: 'AI features are not configured: GEMINI_API_KEY is missing on the server. Add it in Vercel > Settings > Environment Variables.'
      });
      return;
    }

    const model = 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const payload: Record<string, unknown> = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 1024 }
    };
    if (systemInstruction) {
      // Merge: platform instruction first, caller instruction as extra context.
      payload.systemInstruction = { parts: [{ text: `${ZID_AI_SYSTEM_INSTRUCTION}\n\n## ADDITIONAL CONTEXT FROM THE CALLING FEATURE\n${systemInstruction}` }] };
    } else {
      payload.systemInstruction = { parts: [{ text: ZID_AI_SYSTEM_INSTRUCTION }] };
    }

    const providerRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (providerRes.status === 400 || providerRes.status === 403) {
      const detail = await providerRes.json().catch(() => ({}));
      const msg = (detail as any)?.error?.message || 'The AI provider rejected the API key.';
      res.status(401).json({ error: 'invalid_api_key', message: `The configured GEMINI_API_KEY is invalid or lacks access: ${msg}` });
      return;
    }
    if (providerRes.status === 429) {
      res.status(429).json({ error: 'rate_limited', message: 'AI request limit reached. Please try again in a moment.' });
      return;
    }
    if (!providerRes.ok) {
      const detail = await providerRes.json().catch(() => ({}));
      res.status(500).json({
        error: 'server_error',
        message: `AI provider error (${providerRes.status}): ${(detail as any)?.error?.message || 'Unknown error'}`
      });
      return;
    }

    const data = await providerRes.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('')?.trim() || '';

    if (!text) {
      res.status(500).json({ error: 'empty_response', message: 'The AI returned an empty response. Please try again.' });
      return;
    }

    res.status(200).json({ text });
  } catch (err: any) {
    console.error('[/api/ai/generate-text] error:', err?.message || err);
    res.status(500).json({ error: 'server_error', message: 'Unexpected server error while generating AI text.' });
  }
}
