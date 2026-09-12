import { getSupabaseClient } from "@/src/lib/supabase";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORE_CODE_RE = /^ZID-BD-\d{4,}$/i;

/** Extract the store reference from the query string or the last path segment. */
function extractStoreRef(req: Request): string {
  try {
    const url = new URL(req.url);
    const fromQuery =
      url.searchParams.get("slug") ||
      url.searchParams.get("store_slug") ||
      url.searchParams.get("store_id") ||
      url.searchParams.get("store_code");
    if (fromQuery && fromQuery.trim()) return fromQuery.trim();

    const segments = url.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && last !== "stores" && last !== "api") return decodeURIComponent(last);
  } catch {
    /* fall through */
  }
  return "";
}

/**
 * GET /api/stores/[slug]
 *
 * Dynamic store lookup. Accepts a store_slug, a permanent ZID-BD-XXXX store
 * code, or a stores.id UUID. Every Supabase query is wrapped in try/catch and
 * the handler always returns HTTP 200 with valid JSON — an unknown store or a
 * database failure returns `merchant: null`, never a 500.
 */
export async function GET(req: Request) {
  try {
    const ref = extractStoreRef(req);

    if (!ref) {
      return Response.json({ ok: false, store_slug: "", merchant: null });
    }

    const clean = ref.split(":")[0].trim();
    const supabase = getSupabaseClient();

    if (supabase) {
      // 1. Canonical stores table — match by UUID, store code, or slug.
      try {
        if (UUID_RE.test(clean)) {
          const { data } = await supabase.from("stores").select("*").eq("id", clean).maybeSingle();
          if (data) return Response.json({ ok: true, store_slug: data.store_slug ?? clean, merchant: data });
        } else if (STORE_CODE_RE.test(clean)) {
          const { data } = await supabase.from("stores").select("*").ilike("store_code", clean).maybeSingle();
          if (data) return Response.json({ ok: true, store_slug: data.store_slug ?? clean.toLowerCase(), merchant: data });
        } else {
          const { data } = await supabase.from("stores").select("*").eq("store_slug", clean.toLowerCase()).maybeSingle();
          if (data) return Response.json({ ok: true, store_slug: data.store_slug ?? clean.toLowerCase(), merchant: data });
        }
      } catch (e: any) {
        console.warn("[/api/stores/[slug]] stores lookup warning:", e?.message ?? e);
      }

      // 2. Legacy merchants table fallback (slug only).
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
        console.warn("[/api/stores/[slug]] merchants lookup warning:", e?.message ?? e);
      }
    }

    // Unknown store (or DB unavailable) — valid JSON, still 200.
    return Response.json({ ok: true, store_slug: clean.toLowerCase(), merchant: null });
  } catch (err: any) {
    console.error("[/api/stores/[slug]] Unexpected error:", err?.message ?? err);
    return Response.json({ ok: false, store_slug: "", merchant: null });
  }
}
