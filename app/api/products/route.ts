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
    const store_slug = url.searchParams.get("store_slug") || undefined;
    const store_id   = url.searchParams.get("store_id")   || undefined;

    let query = supabase.from("products").select("*");
    if (store_slug) query = query.eq("store_slug", store_slug);
    else if (store_id) query = query.eq("store_id", store_id);

    const { data, error } = await query;

    if (error) {
      console.error("[/api/products] Supabase error:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(data ?? []);
  } catch (err: any) {
    console.error("[/api/products] Unexpected error:", err?.message ?? err);
    return Response.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
