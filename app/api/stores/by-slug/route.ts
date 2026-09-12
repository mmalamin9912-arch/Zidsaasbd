import { getSupabaseClient } from "@/src/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/stores/by-slug?slug=xxx
 *
 * Resolves a merchant/store record by slug. Every Supabase query is wrapped in
 * try/catch and the handler always returns HTTP 200 with a well-formed JSON
 * body — a missing slug or a database failure yields `merchant: null` rather
 * than an unhandled exception or 500.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get("slug") || url.searchParams.get("store_slug") || "")
      .trim()
      .toLowerCase();

    if (!slug) {
      return Response.json({ ok: false, store_slug: "", merchant: null });
    }

    const supabase = getSupabaseClient();

    if (supabase) {
      // 1. Canonical stores table.
      try {
        const { data, error } = await supabase
          .from("stores")
          .select("*")
          .eq("store_slug", slug)
          .maybeSingle();
        if (!error && data) {
          return Response.json({ ok: true, store_slug: slug, merchant: data });
        }
        if (error) console.warn("[/api/stores/by-slug] stores lookup:", error.message);
      } catch (e: any) {
        console.warn("[/api/stores/by-slug] stores lookup warning:", e?.message ?? e);
      }

      // 2. Legacy merchants table fallback.
      try {
        const { data, error } = await supabase
          .from("merchants")
          .select("*")
          .eq("store_slug", slug)
          .maybeSingle();
        if (!error && data) {
          return Response.json({ ok: true, store_slug: slug, merchant: data });
        }
        if (error) console.warn("[/api/stores/by-slug] merchants lookup:", error.message);
      } catch (e: any) {
        console.warn("[/api/stores/by-slug] merchants lookup warning:", e?.message ?? e);
      }
    }

    // Slug not found (or DB unavailable) — valid JSON, still 200.
    return Response.json({ ok: true, store_slug: slug, merchant: null });
  } catch (err: any) {
    console.error("[/api/stores/by-slug] Unexpected error:", err?.message ?? err);
    return Response.json({ ok: false, store_slug: "", merchant: null });
  }
}
