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
// ERR_MODULE_NOT_FOUND. Vercel emits the compiled sibling as lib/faqGenerator.js,
// which this resolves to; bundlers (vite/esbuild) and tsx map it back to .ts.
import { generateFaqFromPolicies } from '../../lib/faqGenerator.js';

/**
 * POST /api/ai/generate-faq
 * Body: { policies: { privacy, terms, return, shipping }, storeName?: string }
 *
 * Reads the merchant's filled policy texts and asks Gemini to produce structured
 * FAQ pairs + a chatbot response script for the storefront.
 *
 * Responses:
 *  - 200 { faq: Array<{question,answer}>, chatbotScript: string }
 *  - 400 { error, message }  -> bad payload / missing API key
 *  - 401 { error, message }  -> provider rejected the key
 *  - 429 { error, message }  -> rate limited
 *  - 500 { error, message }  -> unexpected
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
    const body = (req.body || {}) as {
      policies?: { privacy?: string; terms?: string; return?: string; shipping?: string };
      storeName?: string;
    };

    const result = await generateFaqFromPolicies(body.policies || {}, body.storeName);

    if (!result.ok) {
      const statusByError: Record<string, number> = {
        no_policies: 400,
        missing_api_key: 400,
        invalid_api_key: 401,
        rate_limited: 429,
        parse_error: 500,
        empty_response: 500,
        server_error: 500,
      };
      const status = statusByError[result.error || 'server_error'] || 500;
      res.status(status).json({ error: result.error, message: result.message, faq: [], chatbotScript: '' });
      return;
    }

    res.status(200).json({ faq: result.faq, chatbotScript: result.chatbotScript });
  } catch (err: any) {
    console.error('[/api/ai/generate-faq] error:', err?.message || err);
    res.status(500).json({ error: 'server_error', message: 'Unexpected server error while generating the FAQ.' });
  }
}
