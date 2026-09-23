/**
 * Shared Gemini-backed FAQ generator.
 *
 * Used by BOTH:
 *   - the Vercel serverless function  `api/ai/generate-faq.ts`
 *   - the local dev Express route     `server.ts`  (POST /api/ai/generate-faq)
 *
 * Keeping the prompt + parsing here means the local dev server and the deployed
 * function produce identical results, and there is exactly one place to change
 * the model, the prompt, or the response shape.
 *
 * Input : { policies: { privacy, terms, return, shipping }, storeName? }
 * Output: { faq: Array<{ question, answer }>, chatbotScript: string }
 */

export interface FaqPair {
  question: string;
  answer: string;
}

export interface FaqGenerationResult {
  ok: boolean;
  faq: FaqPair[];
  chatbotScript: string;
  error?: string;
  message?: string;
}

/** Build the generation prompt from the merchant's filled policy texts. */
function buildPrompt(
  policies: { privacy?: string; terms?: string; return?: string; shipping?: string },
  storeName?: string
): string {
  const store = (storeName || 'the store').trim();
  const sections: string[] = [];
  if (policies.privacy?.trim()) sections.push(`## PRIVACY POLICY\n${policies.privacy.trim()}`);
  if (policies.terms?.trim()) sections.push(`## TERMS OF SERVICE\n${policies.terms.trim()}`);
  if (policies.return?.trim()) sections.push(`## RETURN & REFUND POLICY\n${policies.return.trim()}`);
  if (policies.shipping?.trim()) sections.push(`## SHIPPING POLICY\n${policies.shipping.trim()}`);

  return [
    `You are building the customer-facing FAQ and chatbot knowledge base for the online store "${store}".`,
    `Read the store's legal policies below and produce a structured FAQ a chatbot response script.`,
    ``,
    sections.join('\n\n'),
    ``,
    `TASK:`,
    `1. Write 6–10 frequently asked questions a customer would ask about these policies, each with a concise, accurate answer drawn ONLY from the policy text above.`,
    `2. Write a chatbot response script: a short greeting followed by intent → reply rules the storefront chatbot can follow.`,
    ``,
    `Respond in the SAME language as the majority of the policy text (Bengali if the policies are in Bengali, otherwise English).`,
    ``,
    `OUTPUT FORMAT — return ONLY valid JSON, no markdown fences, matching exactly:`,
    `{`,
    `  "faq": [ { "question": "string", "answer": "string" } ],`,
    `  "chatbotScript": "string"`,
    `}`,
  ].join('\n');
}

/** Extract the first balanced JSON object from a model response. */
function extractJson(text: string): any | null {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Normalise the parsed model output into our response contract. */
function normalizeFaqResult(parsed: any): { faq: FaqPair[]; chatbotScript: string } {
  const rawFaq = Array.isArray(parsed?.faq) ? parsed.faq : [];
  const faq: FaqPair[] = rawFaq
    .map((item: any) => ({
      question: String(item?.question || item?.q || '').trim(),
      answer: String(item?.answer || item?.a || '').trim(),
    }))
    .filter((item: FaqPair) => item.question && item.answer);

  const chatbotScript = String(parsed?.chatbotScript || parsed?.script || '').trim();
  return { faq, chatbotScript };
}

/**
 * Generate FAQ pairs + a chatbot script from policy text.
 * Never throws — all failures are returned as { ok:false, error, message }.
 */
export async function generateFaqFromPolicies(
  policies: { privacy?: string; terms?: string; return?: string; shipping?: string },
  storeName?: string
): Promise<FaqGenerationResult> {
  const hasAny = Boolean(
    policies?.privacy?.trim() || policies?.terms?.trim() || policies?.return?.trim() || policies?.shipping?.trim()
  );
  if (!hasAny) {
    return { ok: false, faq: [], chatbotScript: '', error: 'no_policies', message: 'Fill in at least one policy before generating an FAQ.' };
  }

  const apiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return {
      ok: false,
      faq: [],
      chatbotScript: '',
      error: 'missing_api_key',
      message: 'AI features are not configured: GEMINI_API_KEY is missing on the server.',
    };
  }

  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const providerRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(policies, storeName) }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048, responseMimeType: 'application/json' },
      }),
    });

    if (providerRes.status === 400 || providerRes.status === 403) {
      const detail = await providerRes.json().catch(() => ({}));
      return {
        ok: false,
        faq: [],
        chatbotScript: '',
        error: 'invalid_api_key',
        message: `The configured GEMINI_API_KEY is invalid or lacks access: ${(detail as any)?.error?.message || ''}`,
      };
    }
    if (providerRes.status === 429) {
      return { ok: false, faq: [], chatbotScript: '', error: 'rate_limited', message: 'AI request limit reached. Please try again shortly.' };
    }
    if (!providerRes.ok) {
      const detail = await providerRes.json().catch(() => ({}));
      return {
        ok: false,
        faq: [],
        chatbotScript: '',
        error: 'server_error',
        message: `AI provider error (${providerRes.status}): ${(detail as any)?.error?.message || 'Unknown error'}`,
      };
    }

    const data = await providerRes.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('')?.trim() || '';

    const parsed = extractJson(text);
    if (!parsed) {
      return { ok: false, faq: [], chatbotScript: '', error: 'parse_error', message: 'The AI returned an unreadable response. Please try again.' };
    }

    const { faq, chatbotScript } = normalizeFaqResult(parsed);
    if (!faq.length) {
      return { ok: false, faq: [], chatbotScript, error: 'empty_response', message: 'The AI did not return any FAQ pairs. Please try again.' };
    }

    return { ok: true, faq, chatbotScript };
  } catch (err: any) {
    return { ok: false, faq: [], chatbotScript: '', error: 'server_error', message: err?.message || 'Unexpected error generating the FAQ.' };
  }
}
