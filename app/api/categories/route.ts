import { supabase } from "@/src/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data: categories, error } = await supabase
      .from("categories")
      .select("*");

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(categories);
  } catch (err: any) {
    return Response.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
