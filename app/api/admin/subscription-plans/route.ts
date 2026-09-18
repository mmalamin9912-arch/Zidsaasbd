import { fetchHybridPlans, fetchHybridSubscriptions, pick, toNumber } from "@/lib/hybridDb";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/subscription-plans  (App Router mirror)
 *
 * Hybrid read: MongoDB `subscription_plans` is authoritative; the Supabase
 * `subscription_plans` / `plans` tables fill in (and add) plans. Per-plan
 * subscriber counts are merged from both subscription sources.
 *
 * Always answers 200 with a shaped envelope — a missing key or a provider
 * timeout degrades to an empty `plans: []` plus diagnostics, never a 404/500.
 */
export async function GET() {
  try {
    const [plans, subscriptions] = await Promise.all([fetchHybridPlans(), fetchHybridSubscriptions()]);

    const normalized = plans.data.map((plan: Record<string, any>) => {
      const id = String(pick(plan, ["plan_id", "planId", "id", "slug", "code"]) || "").toLowerCase();
      return {
        id,
        name: String(pick(plan, ["name", "plan_name", "planName", "title", "label"]) || id || "Plan"),
        priceBDT: toNumber(pick(plan, ["priceBDT", "price_bdt", "price", "amountBDT", "amount"]), 0),
        durationDays: toNumber(pick(plan, ["durationDays", "duration_days", "duration", "days"]), 0),
        isActive: pick(plan, ["isActive", "is_active", "active", "enabled"]) !== false,
        maxProducts: toNumber(pick(plan, ["maxProducts", "max_products", "productLimit", "product_limit"]), 0),
        features: Array.isArray(plan.features) ? plan.features : [],
        source: plan._source || "unknown",
      };
    });

    const subscriptionCounts: Record<string, number> = {};
    for (const sub of subscriptions.data) {
      const planId = String(pick(sub, ["plan_id", "planId", "plan", "subscription_plan"]) || "").toLowerCase();
      if (!planId) continue;
      subscriptionCounts[planId] = (subscriptionCounts[planId] || 0) + 1;
    }

    const plansWithCounts = normalized.map((plan: Record<string, any>) => ({
      ...plan,
      subscriberCount: subscriptionCounts[plan.id] || 0,
    }));

    return Response.json({
      ok: plans.ok || plansWithCounts.length > 0,
      generatedAt: new Date().toISOString(),
      sources: plans.sources,
      counts: { plans: plansWithCounts.length, subscriptions: subscriptions.data.length },
      plans: plansWithCounts,
      diagnostics: {
        mongodb: plans.mongodb,
        supabase: plans.supabase,
        subscriptions: { mongodb: subscriptions.mongodb, supabase: subscriptions.supabase },
      },
      warning:
        plansWithCounts.length === 0
          ? "No subscription plans were returned by MongoDB or Supabase. Configure MONGODB_URI or the Supabase keys to populate this table."
          : undefined,
    });
  } catch (err: any) {
    console.error("[/api/admin/subscription-plans] error:", err?.message ?? err);
    return Response.json({
      ok: false,
      generatedAt: new Date().toISOString(),
      sources: [],
      counts: { plans: 0, subscriptions: 0 },
      plans: [],
      error: err?.message || "Could not load subscription plans.",
    });
  }
}
