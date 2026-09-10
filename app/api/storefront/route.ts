import { getSupabaseClient } from "@/src/lib/supabase";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORE_CODE_RE = /^ZID-BD-\d{4,}$/i;

function cleanEnvUrl(raw?: string): string {
  if (!raw) return "";
  let str = String(raw).trim();
  str = str.replace(/^["'`\\]+|["'`\\]+$/g, "").trim();
  return str.replace(/\/+$/, "");
}

/** Resolve store_slug from UUID or ZID-BD code */
async function resolveStoreSlugByRef(ref: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    if (UUID_RE.test(ref)) {
      const { data } = await supabase
        .from("stores")
        .select("store_slug")
        .eq("id", ref)
        .maybeSingle();
      return data?.store_slug ?? null;
    }
    if (STORE_CODE_RE.test(ref)) {
      const { data } = await supabase
        .from("stores")
        .select("store_slug")
        .ilike("store_code", ref)
        .maybeSingle();
      return data?.store_slug ?? null;
    }
  } catch (e) {
    console.warn("[/api/storefront] resolveStoreSlugByRef error:", e);
  }
  return null;
}

/** Resolve canonical store_id (UUID) from a slug */
async function resolveStoreIdBySlug(slug: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("stores")
      .select("id")
      .eq("store_slug", slug)
      .maybeSingle();
    return data?.id ?? null;
  } catch (e) {
    console.warn("[/api/storefront] resolveStoreIdBySlug error:", e);
  }
  return null;
}

/** Fetch products for a given store */
async function fetchProducts(storeSlug: string, storeId: string | null): Promise<any[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const allProducts: any[] = [];

    const { data: slugData, error: slugErr } = await supabase
      .from("products")
      .select("*")
      .eq("store_slug", storeSlug);
    if (!slugErr && Array.isArray(slugData)) allProducts.push(...slugData);

    if (storeId) {
      const { data: idData, error: idErr } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", storeId);
      if (!idErr && Array.isArray(idData)) allProducts.push(...idData);
    }

    if (allProducts.length > 0) {
      const seen = new Set<string>();
      return allProducts.filter((p) => {
        const key = String(p.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  } catch (e: any) {
    console.warn("[/api/storefront] fetchProducts error:", e?.message ?? e);
  }
  return [];
}

/** Fetch categories for a given store */
async function fetchCategories(storeSlug: string, storeId: string | null): Promise<any[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("store_slug", storeSlug);
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch (e: any) {
    console.warn("[/api/storefront] fetchCategories error:", e?.message ?? e);
  }
  return [];
}

/** Fetch merchant/store config from stores table */
async function fetchMerchant(storeSlug: string): Promise<any | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("stores")
      .select("*")
      .eq("store_slug", storeSlug)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch (e: any) {
    console.warn("[/api/storefront] fetchMerchant error:", e?.message ?? e);
  }
  return null;
}

export async function GET(req: Request) {
  if (!getSupabaseClient()) {
    return Response.json(
      { ok: false, error: "Supabase is not configured. Check environment variables." },
      { status: 503 }
    );
  }

  try {
    const url = new URL(req.url);

    // Resolve slug from query params or path segments
    let rawSlug =
      url.searchParams.get("store_slug") ||
      url.searchParams.get("slug") ||
      url.searchParams.get("store_id") ||
      url.searchParams.get("store_code") ||
      // last path segment after /api/storefront/
      url.pathname.split("/").filter(Boolean).slice(2).join("/") ||
      "bd";

    let cleanSlug = String(rawSlug).split(":")[0].trim().toLowerCase() || "bd";

    // Resolve UUID/ZID-BD codes to store_slug
    if (UUID_RE.test(cleanSlug) || STORE_CODE_RE.test(cleanSlug)) {
      const resolved = await resolveStoreSlugByRef(cleanSlug);
      if (resolved) cleanSlug = resolved;
    }

    const storeId = await resolveStoreIdBySlug(cleanSlug);
    const [merchant, products, categories] = await Promise.all([
      fetchMerchant(cleanSlug),
      fetchProducts(cleanSlug, storeId),
      fetchCategories(cleanSlug, storeId),
    ]);

    return Response.json({
      ok: true,
      store_slug: cleanSlug,
      storefront: {
        merchant: merchant ?? null,
        products,
        categories,
      },
    });
  } catch (err: any) {
    console.error("[/api/storefront] Unexpected error:", err?.message ?? err);
    return Response.json(
      { ok: false, error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const tenant = body?.tenant;
    const patch = body?.patch;
    const store_slug = body?.store_slug || "bd";

    if (!tenant && !patch) {
      return Response.json(
        { ok: false, error: "tenant or patch must be provided" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return Response.json(
        { ok: false, error: "Supabase is not configured." },
        { status: 503 }
      );
    }

    const payload = tenant || patch;
    const { error } = await supabase
      .from("stores")
      .upsert({ store_slug, ...payload }, { onConflict: "store_slug" });

    if (error) {
      console.error("[/api/storefront] POST upsert error:", error.message);
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true, store_slug });
  } catch (err: any) {
    console.error("[/api/storefront] POST Unexpected error:", err?.message ?? err);
    return Response.json(
      { ok: false, error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
