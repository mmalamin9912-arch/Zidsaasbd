import { getMongoDb, DB_NAME, getMongoUri } from "@/lib/db";
import { getSupabaseClient } from "@/src/lib/supabase";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORE_CODE_RE = /^ZID-BD-\d{4,}$/i;

/**
 * GET /api/stores/slug/[slug]
 *
 * Dynamic store lookup for the App Router. Accepts a store slug
 * ("dhaka-threads"), a permanent ZID-BD-XXXX store code, or a stores.id UUID.
 *
 * WHY THIS ROUTE EXISTS
 * ---------------------------------------------------------------------------
 * The client and the Express app both call `/api/stores/slug/:slug`, but only
 * `app/api/stores/[slug]` and `app/api/stores/by-slug` existed here. A request
 * to the missing shape fell through to the platform's 404 **HTML** page, which
 * the browser surfaced as "The page could not be found" (NOT_FOUND) and which
 * broke `res.json()` in the caller.
 *
 * Lookup order: MongoDB `stores` collection first (where the operational store
 * data lives per ARCHITECTURE.md), then Supabase as a fallback for older
 * records. Always answers 200 with a well-formed JSON body — an unknown store
 * yields `merchant: null`.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> | { slug: string } }) {
  try {
    // Next.js 15 passes params as a promise; older versions pass it directly.
    const resolved = await (ctx?.params as any);
    const rawFromParams = String(resolved?.slug ?? "");

    const url = new URL(req.url);
    const raw =
      rawFromParams ||
      url.searchParams.get("slug") ||
      url.searchParams.get("store_slug") ||
      url.searchParams.get("store_id") ||
      url.searchParams.get("store_code") ||
      // last path segment fallback (…/api/stores/slug/<ref>)
      url.pathname.split("/").filter(Boolean).pop() ||
      "";

    const clean = decodeURIComponent(String(raw)).split(":")[0].trim();
    if (!clean || ["slug", "stores", "api"].includes(clean.toLowerCase())) {
      return Response.json({ ok: true, store_slug: "", merchant: null });
    }

    // 1. MongoDB — the canonical operational store data.
    try {
      if (getMongoUri()) {
        const db = await getMongoDb(DB_NAME);
        if (db) {
          const lower = clean.toLowerCase();
          const orClauses: Record<string, unknown>[] = [
            { store_slug: lower },
            { storeSlug: lower },
            { store_code: { $in: [clean, clean.toUpperCase()] } },
            { storeCode: { $in: [clean, clean.toUpperCase()] } },
          ];
          if (UUID_RE.test(clean)) orClauses.push({ id: clean }, { _id: clean });
          const doc = await db.collection("stores").findOne({ $or: orClauses });
          if (doc) {
            return Response.json({
              ok: true,
              store_slug: String((doc as any).store_slug || (doc as any).storeSlug || lower),
              merchant: doc,
            });
          }
        }
      }
    } catch (e: any) {
      console.warn("[/api/stores/slug/[slug]] MongoDB lookup warning:", e?.message ?? e);
    }

    // 2. Supabase fallback — stores table, then the legacy merchants table.
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        if (UUID_RE.test(clean)) {
          const { data } = await supabase.from("stores").select("*").eq("id", clean).maybeSingle();
          if (data) return Response.json({ ok: true, store_slug: data.store_slug ?? clean, merchant: data });
        } else if (STORE_CODE_RE.test(clean)) {
          const { data } = await supabase.from("stores").select("*").ilike("store_code", clean).maybeSingle();
          if (data) return Response.json({ ok: true, store_slug: data.store_slug ?? clean.toLowerCase(), merchant: data });
        }
      } catch (e: any) {
        console.warn("[/api/stores/slug/[slug]] stores lookup warning:", e?.message ?? e);
      }

      try {
        const { data } = await supabase
          .from("merchants")
          .select("*")
          .eq("store_slug", clean.toLowerCase())
          .maybeSingle();
        if (data) {
          return Response.json({ ok: true, store_slug: data.store_slug ?? clean.toLowerCase(), merchant: data });
        }
      } catch (e: any) {
        console.warn("[/api/stores/slug/[slug]] merchants lookup warning:", e?.message ?? e);
      }
    }

    // Unknown store (or DB unavailable) — valid JSON, still 200.
    return Response.json({ ok: true, store_slug: clean.toLowerCase(), merchant: null });
  } catch (err: any) {
    console.error("[/api/stores/slug/[slug]] Unexpected error:", err?.message ?? err);
    return Response.json({ ok: true, store_slug: "", merchant: null, error: err?.message ?? "store lookup failed" });
  }
}
