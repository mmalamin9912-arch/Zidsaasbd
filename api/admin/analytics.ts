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
// ERR_MODULE_NOT_FOUND. Vercel emits the compiled sibling as
// lib/adminAnalytics.js, which this resolves to; bundlers (vite/esbuild) and
// tsx map it back to the .ts source for local runs.
import { getPlatformAnalytics } from '../../lib/adminAnalytics.js';

/**
 * GET /api/admin/analytics
 *
 * Platform-wide aggregation for the Super Admin Portal (`/admin`):
 *   - Total Platform Sales   : sum of completed order totals across ALL stores (BDT)
 *   - Total Order Volume     : count of every order created platform-wide
 *   - BaaS Subscription Rev. : earnings from active paid subscriptions (BDT)
 *   - Active Merchants       : count of active (non-suspended) stores
 *   - Top Revenue Stores     : stores ranked by completed-order revenue
 *   - Recent Sub Renewals    : latest subscription/renewal transactions
 *
 * Always answers 200 with a well-formed envelope so the dashboard renders even
 * when MongoDB is unavailable (the payload then carries ok:false + error).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed', message: 'Use GET' });
    return;
  }

  try {
    const result = await getPlatformAnalytics();
    res.status(200).json(result);
  } catch (err: any) {
    console.error('[/api/admin/analytics] error:', err?.message || err);
    res.status(200).json({
      ok: false,
      generatedAt: new Date().toISOString(),
      overview: {
        totalPlatformSalesBDT: 0,
        totalOrderVolume: 0,
        completedOrderCount: 0,
        baasSubscriptionRevenueBDT: 0,
        activeMerchants: 0,
        totalMerchants: 0,
        paidMerchants: 0,
        averageOrderValueBDT: 0,
      },
      topStores: [],
      recentRenewals: [],
      error: err?.message || 'Could not aggregate platform analytics.',
    });
  }
}
