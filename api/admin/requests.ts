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

// Explicit ".js" extension required: package.json sets "type": "module", so
// Vercel's Node ESM resolver rejects extensionless relative specifiers.
import {
  listSubscriptionRequests,
  listThemeRequests,
  purgeTestTransactionsAndReload,
} from "../../lib/adminRequests.js";

/**
 * /api/admin/requests — Approvals & Requests tables for the Super Admin Portal.
 *
 *   GET    /api/admin/requests?type=subscription|theme&status=all|pending|approved|rejected
 *   POST   /api/admin/requests            { action: "purge_test_data", dryRun?: boolean }
 *
 * `type` defaults to `subscription` and `status` to `all`, so a bare
 * GET /api/admin/requests is a valid request for the first table.
 *
 * The status filter is applied IN the Mongo query (see lib/adminRequests.ts), so
 * the ALL / PENDING / APPROVED / REJECTED buttons genuinely change the data that
 * is fetched rather than hiding rows already in the browser.
 *
 * Always answers 200 with a well-formed JSON envelope so the dashboard renders
 * even when MongoDB is unavailable (the payload then carries ok:false + error).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const queryValue = (key: string): string => {
    const raw = req.query?.[key];
    return String(Array.isArray(raw) ? raw[raw.length - 1] : raw || "").trim();
  };

  try {
    if (req.method === "GET") {
      const type = (queryValue("type") || "subscription").toLowerCase();
      const status = (queryValue("status") || "all").toLowerCase();

      if (type === "theme" || type === "theme_purchase" || type === "theme-purchase") {
        res.status(200).json(await listThemeRequests({ status }));
        return;
      }
      res.status(200).json(await listSubscriptionRequests({ status }));
      return;
    }

    if (req.method === "POST") {
      const body = (req.body || {}) as Record<string, any>;
      const action = String(body.action || "").trim().toLowerCase();

      if (action === "purge_test_data") {
        const dryRun = body.dryRun === true || String(queryValue("dryRun")) === "true";
        res.status(200).json(await purgeTestTransactionsAndReload({ dryRun }));
        return;
      }

      res.status(200).json({ ok: false, error: "unknown_action", message: 'Supported action: "purge_test_data".' });
      return;
    }

    res.status(405).json({ ok: false, error: "method_not_allowed", message: "Use GET or POST" });
  } catch (err: any) {
    console.error("[/api/admin/requests] error:", err?.message || err);
    res.status(200).json({
      ok: false,
      generatedAt: new Date().toISOString(),
      requests: [],
      counts: { all: 0, pending: 0, approved: 0, rejected: 0 },
      error: err?.message || "Request listing failed.",
    });
  }
}
