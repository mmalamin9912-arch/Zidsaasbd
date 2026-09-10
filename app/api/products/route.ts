import { NextResponse } from "next/server";
import { supabase } from "@/src/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data: products, error } = await supabase
      .from("products")
      .select("*");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(products);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
