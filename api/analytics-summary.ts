/**
 * POST /api/analytics-summary
 *
 * Plain-path alias for the AI executive-summary endpoint. The admin dashboard
 * historically probed `/api/analytics-summary`, while newer builds use
 * `/api/ai/analytics-summary`; both must resolve to the same implementation.
 *
 * This is a thin re-export of the canonical handler so there is exactly ONE
 * place where the prompt + Gemini call + fallback live
 * (api/ai/analytics-summary.ts).
 */
export { default } from './ai/analytics-summary.js';
