import { getSupabaseClient } from "@/src/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return Response.json(
      { error: "Supabase is not configured. Check environment variables." },
      { status: 503 }
    );
  }

  try {
    const url = new URL(req.url);
    const rawSlug = url.searchParams.get("store_slug") || "";
    const rawId = url.searchParams.get("store_id") || "";
    const store_slug = rawSlug.trim() || undefined;
    const store_id = rawId.trim() || undefined;

    try {
      // 1. Prefer store_id — exact match, no lookup needed.
      if (store_id) {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .eq("store_id", store_id);
        if (error) console.error("[/api/products] Supabase error (store_id):", error.message);
        return Response.json(Array.isArray(data) ? data : []);
      }

      // 2. Resolve store_id from store_slug.
      let resolvedId: string | null = null;
      if (store_slug) {
        const { data: storeRow, error: storeErr } = await supabase
          .from("stores")
          .select("id")
          .eq("store_slug", store_slug)
          .maybeSingle();
        if (storeErr) {
          console.warn("[/api/products] store lookup warning:", storeErr.message);
        } else if (storeRow?.id) {
          resolvedId = String(storeRow.id);
        }
      }

      // 3. Slug invalid / not found (or missing) — fall back to the first
      //    active store instead of erroring.
      if (!resolvedId) {
        const { data: firstStore, error: firstErr } = await supabase
          .from("stores")
          .select("id")
          .eq("status", "active")
          .limit(1)
          .maybeSingle();
        if (firstErr) {
          console.warn("[/api/products] first-store fallback warning:", firstErr.message);
        } else if (firstStore?.id) {
          resolvedId = String(firstStore.id);
        }
      }

      // 4. No store exists at all — safely return an empty list.
      if (!resolvedId) {
        return Response.json({ products: [] });
      }

      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", resolvedId);

      if (error) {
        console.error("[/api/products] Supabase error (resolved store):", error.message);
        return Response.json({ products: [] });
      }

      return Response.json(Array.isArray(data) ? data : []);
    } catch (innerErr: any) {
      // NEVER 500 on lookup problems — degrade to an empty list.
      console.error("[/api/products] Query error:", innerErr?.message ?? innerErr);
      return Response.json({ products: [] });
    }
  } catch (err: any) {
    console.error("[/api/products] Unexpected error:", err?.message ?? err);
    return Response.json({ products: [] });
  }
}
