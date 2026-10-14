/**
 * Super Admin Gateway PIN verification (client side).
 *
 * The PIN's source of truth is SERVER-side — `SUPER_ADMIN_PIN` (falling back
 * to `ADMIN_MASTER_KEY`) — checked by `POST /api/admin/verify-pin`
 * (lib/serverApp.ts). Verifying here means the secret never ships in the JS
 * bundle, and rotating it needs no rebuild.
 *
 * This utility NEVER throws: every failure path returns a structured
 * `{ ok: false, error }` whose message is safe to render in the gateway UI.
 * When the server has no PIN configured (or the API is unreachable — e.g. the
 * dashboard is served statically without the Express backend), it degrades to
 * the legacy client-bundled `VITE_SUPER_ADMIN_PASSCODE` so existing
 * deployments keep working.
 */

/** Setup instructions rendered verbatim when the server has no PIN set. */
export const SUPER_ADMIN_SETUP_HINT =
  "Super Admin access is not configured for this environment. To enable it: (1) open (or create) " +
  "the .env.local file in the project root, (2) add SUPER_ADMIN_PIN=your-strong-pin " +
  "(ADMIN_MASTER_KEY is accepted as a fallback), (3) restart the dev server with `npm run dev` — " +
  "or redeploy — and try again.";

/**
 * LEGACY client-bundled passcode. Honoured ONLY as a fallback when the server
 * itself has no PIN configured / is unreachable. Prefer `SUPER_ADMIN_PIN`: a
 * VITE_ variable is compiled into the bundle and visible in DevTools.
 */
const LEGACY_CLIENT_PASSCODE = String(
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPER_ADMIN_PASSCODE) ||
  (typeof process !== 'undefined' && process.env?.VITE_SUPER_ADMIN_PASSCODE) ||
  ''
).trim();

export interface AdminPinVerificationResult {
  ok: boolean;
  /** Safe-to-render reason when `ok` is false. */
  error?: string;
}

/**
 * Verify the entered Super Admin PIN against the server.
 *
 * Response handling (see lib/serverApp.ts for the route contract):
 *   - `ok: true`                                        → authenticated
 *   - `configured: false` / missing env                 → setup instructions,
 *     unless the legacy client passcode matches (graceful fallback)
 *   - `INVALID_PIN` / `PIN_REQUIRED` / `RATE_LIMITED`   → the server's message
 *   - non-JSON / network failure                        → legacy fallback, then
 *     an actionable "API unreachable" notice
 */
export async function verifySuperAdminPin(pin: string): Promise<AdminPinVerificationResult> {
  const entered = String(pin || '').trim();
  if (!entered) return { ok: false, error: 'Enter the Master Password / PIN.' };

  try {
    const res = await fetch('/api/admin/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: entered }),
      cache: 'no-store',
    });
    const text = await res.text().catch(() => '');
    let data: any = null;
    try {
      data = text && !text.trimStart().startsWith('<') ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (data && typeof data.ok === 'boolean') {
      if (data.ok) return { ok: true };
      if (data.code === 'ADMIN_PIN_NOT_CONFIGURED') {
        // Graceful fallback: deployments still using the legacy client
        // passcode keep working even though the server env is empty.
        if (LEGACY_CLIENT_PASSCODE && entered === LEGACY_CLIENT_PASSCODE) return { ok: true };
        return { ok: false, error: String(data.error || SUPER_ADMIN_SETUP_HINT) };
      }
      return { ok: false, error: String(data.error || 'Invalid Master Password / PIN.') };
    }

    // Non-JSON answer (proxy page, cold function, …) — try the legacy passcode
    // before reporting the outage, so the gateway is never bricked by it.
    if (LEGACY_CLIENT_PASSCODE && entered === LEGACY_CLIENT_PASSCODE) return { ok: true };
    return {
      ok: false,
      error: `${SUPER_ADMIN_SETUP_HINT} (The verification API did not respond — check that the backend is running.)`,
    };
  } catch {
    if (LEGACY_CLIENT_PASSCODE && entered === LEGACY_CLIENT_PASSCODE) return { ok: true };
    return {
      ok: false,
      error: `${SUPER_ADMIN_SETUP_HINT} (The verification API is unreachable.)`,
    };
  }
}
