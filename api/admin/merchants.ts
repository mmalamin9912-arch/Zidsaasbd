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
// Vercel's Node ESM resolver rejects extensionless relative specifiers.
import { listAdminMerchants, createAdminMerchant, applyMerchantAction } from '../../lib/adminMerchants.js';

/**
 * /api/admin/merchants — merchant/store management for the Super Admin Portal.
 *
 *   GET    /api/admin/merchants?status=all|active|trial|suspended&search=...
 *   POST   /api/admin/merchants            { storeName, email, ownerName, phone, plan }
 *   PATCH  /api/admin/merchants/:ref       { action: extend_trial|change_plan|suspend|unsuspend|delete, ... }
 *   DELETE /api/admin/merchants/:ref       (alias for action: delete)
 *
 * Always answers 200 with a well-formed JSON envelope so the dashboard renders
 * even when MongoDB is unavailable (the payload then carries ok:false + error).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // The store reference arrives either as a catch-all query param
  // (?merchants=<ref>) when routed via a rewrite, or as the last path segment.
  const refParam = req.query?.merchants;
  const refFromQuery = Array.isArray(refParam) ? refParam[refParam.length - 1] : refParam;
  const urlPath = String(req.url || '').split('?')[0].replace(/\/+$/, '');
  const refFromPath = urlPath.split('/').filter(Boolean).pop();
  // When the request targets the collection itself, the last segment is
  // 'merchants' — treat that as "no specific record".
  const candidateRef = String(refFromQuery || refFromPath || '').trim();
  const ref = candidateRef && candidateRef !== 'merchants' ? candidateRef : '';

  try {
    if (req.method === 'GET') {
      const status = typeof req.query?.status === 'string' ? req.query.status : 'all';
      const search = typeof req.query?.search === 'string' ? req.query.search : '';
      const result = await listAdminMerchants({ status, search });
      res.status(200).json(result);
      return;
    }

    if (req.method === 'POST') {
      const body = (req.body || {}) as Record<string, any>;
      const result = await createAdminMerchant({
        storeName: body.storeName || body.store_name,
        email: body.email,
        ownerName: body.ownerName || body.owner_name,
        phone: body.phone,
        plan: body.plan || body.subscriptionPlan,
        password: body.password,
      });
      res.status(200).json(result);
      return;
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = (req.body || {}) as Record<string, any>;
      const action = String(body.action || '').trim();
      if (!ref) {
        res.status(200).json({ ok: false, error: 'A merchant reference is required.' });
        return;
      }
      if (!action) {
        res.status(200).json({ ok: false, error: 'An action is required.' });
        return;
      }
      const result = await applyMerchantAction(ref, action, body);
      res.status(200).json(result);
      return;
    }

    if (req.method === 'DELETE') {
      if (!ref) {
        res.status(200).json({ ok: false, error: 'A merchant reference is required.' });
        return;
      }
      const result = await applyMerchantAction(ref, 'delete', {});
      res.status(200).json(result);
      return;
    }

    res.status(405).json({ ok: false, error: 'method_not_allowed', message: 'Use GET, POST, PATCH or DELETE' });
  } catch (err: any) {
    console.error('[/api/admin/merchants] error:', err?.message || err);
    res.status(200).json({
      ok: false,
      generatedAt: new Date().toISOString(),
      merchants: [],
      counts: { all: 0, active: 0, trial: 0, suspended: 0 },
      error: err?.message || 'Merchant request failed.',
    });
  }
}
