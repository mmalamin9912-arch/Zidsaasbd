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

// Explicit '.js' extension required: package.json sets "type": "module".
import { fetchHybridPlans, fetchHybridSubscriptions, pick, toNumber } from '../../lib/hybridDb.js';

/**
 * GET /api/admin/subscription-plans
 *
 * HYBRID read: MongoDB `subscription_plans` (authoritative) merged with the
 * Supabase `subscription_plans` / `plans` tables. A plan that exists in either
 * provider is returned; a plan present in both is merged with Mongo's values
 * winning per field.
 *
 * Always answers 200 with a well-formed JSON envelope. If BOTH providers are
 * unavailable the response still carries `ok:false` + `plans: []` plus a
 * per-provider error report — never a 404 and never a 500.
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
    const [plans, subscriptions] = await Promise.all([fetchHybridPlans(), fetchHybridSubscriptions()]);

    // Normalise to the shape the admin dashboard renders. Field spellings vary
    // between the Mongo write path and the Supabase mirror, so read both.
    const normalized = plans.data.map((plan: Record<string, any>) => {
      const id = String(pick(plan, ['plan_id', 'planId', 'id', 'slug', 'code']) || '').toLowerCase();
      return {
        id,
        name: String(pick(plan, ['name', 'plan_name', 'planName', 'title', 'label']) || id || 'Plan'),
        priceBDT: toNumber(pick(plan, ['priceBDT', 'price_bdt', 'price', 'amountBDT', 'amount']), 0),
        durationDays: toNumber(pick(plan, ['durationDays', 'duration_days', 'duration', 'days']), 0),
        isActive: pick(plan, ['isActive', 'is_active', 'active', 'enabled']) !== false,
        maxProducts: toNumber(pick(plan, ['maxProducts', 'max_products', 'productLimit', 'product_limit']), 0),
        features: Array.isArray(plan.features) ? plan.features : [],
        source: plan._source || 'unknown',
      };
    });

    // Subscription counts per plan, so the admin table can show adoption.
    // Merge both providers so a plan with Mongo rows and Supabase rows totals up.
    const subscriptionCounts: Record<string, number> = {};
    for (const sub of subscriptions.data) {
      const planId = String(pick(sub, ['plan_id', 'planId', 'plan', 'subscription_plan']) || '').toLowerCase();
      if (!planId) continue;
      subscriptionCounts[planId] = (subscriptionCounts[planId] || 0) + 1;
    }

    const plansWithCounts = normalized.map((plan: Record<string, any>) => ({
      ...plan,
      subscriberCount: subscriptionCounts[plan.id] || 0,
    }));

    res.status(200).json({
      ok: plans.ok || plansWithCounts.length > 0,
      generatedAt: new Date().toISOString(),
      // Which providers actually answered — lets the UI explain a partial result.
      sources: plans.sources,
      counts: {
        plans: plansWithCounts.length,
        subscriptions: subscriptions.data.length,
      },
      plans: plansWithCounts,
      diagnostics: {
        mongodb: plans.mongodb,
        supabase: plans.supabase,
        subscriptions: { mongodb: subscriptions.mongodb, supabase: subscriptions.supabase },
      },
      // Present only when nothing at all came back, so the UI can say why.
      warning:
        plansWithCounts.length === 0
          ? 'No subscription plans were returned by MongoDB or Supabase. Configure MONGODB_URI or the Supabase keys to populate this table.'
          : undefined,
    });
  } catch (err: any) {
    // Never a 5xx: a shaped envelope keeps the admin table rendering.
    console.error('[/api/admin/subscription-plans] error:', err?.message || err);
    res.status(200).json({
      ok: false,
      generatedAt: new Date().toISOString(),
      sources: [],
      counts: { plans: 0, subscriptions: 0 },
      plans: [],
      error: err?.message || 'Could not load subscription plans.',
    });
  }
}
