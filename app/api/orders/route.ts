import { getSupabaseClient } from "@/src/lib/supabase";
import { connectToDatabase } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

// NextResponse is not a hard dependency of this project (the app builds with
// Vite, and `next` is not installed), so a tiny JSON responder is used instead.
// It produces exactly the same Response shape NextResponse.json() would.
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Orders are inserted into Supabase (the system of record) and, best-effort,
// mirrored into MongoDB so the merchant dashboard keeps its existing history.
// Every failure path returns JSON — never an HTML error page.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

/** Normalize items whether they arrive as an array, JSON string, or single object. */
function toItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Resolve a store slug / code / UUID to the canonical stores.id UUID. */
async function resolveStoreId(ref: string): Promise<string | null> {
  if (!ref) return null;
  if (UUID_RE.test(ref)) return ref;
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase
      .from("stores")
      .select("id")
      .or(`store_slug.eq.${ref},store_code.eq.${ref}`)
      .limit(1)
      .maybeSingle();
    return data?.id ? String(data.id) : null;
  } catch (e: any) {
    console.warn("[POST /api/orders] store lookup warning:", e?.message ?? e);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    // ---------- 1. Parse the request body ----------
    // The storefront sends `[order]`; the dashboard sends `order[]`.
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    const rawOrders: any[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.orders)
        ? body.orders
        : body && typeof body === "object"
          ? [body]
          : [];

    if (rawOrders.length === 0) {
      return jsonResponse({ success: false, error: "No order data provided" }, 400);
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return jsonResponse(
        {
          success: false,
          error: "Supabase is not configured. Check environment variables.",
        },
        503
      );
    }

    const inserted: any[] = [];
    const failures: string[] = [];

    for (const order of rawOrders) {
      if (!order || typeof order !== "object") continue;

      try {
        // ---------- 2. Extract the order details ----------
        const storeRef = firstString(
          order.store_id,
          order.storeId,
          order.store_code,
          order.storeCode,
          order.store_slug,
          order.storeSlug,
          order.merchantId,
          order.merchant_id
        );
        const storeSlug =
          firstString(order.store_slug, order.storeSlug).split(":")[0].trim().toLowerCase() ||
          firstString(storeRef).split(":")[0].trim().toLowerCase();
        const storeId = await resolveStoreId(storeRef);

        const orderNumber = firstString(
          order.order_number,
          order.orderNumber,
          order.id
        ).replace(/^#/, "") || `ORD-${Date.now()}`;

        const items = toItems(order.items);
        const totalPrice =
          Number(order.total_price ?? order.total_price_bdt ?? order.totalBDT ?? order.total) || 0;

        const record: Record<string, unknown> = {
          id: firstString(order.id) || `ord-${Date.now()}`,
          order_number: orderNumber,
          // store_id is a FK to stores(id); send null when it cannot be
          // resolved so the INSERT policy does not silently reject the row.
          store_id: storeId,
          store_slug: storeSlug || null,
          merchant_id: firstString(order.merchant_id, order.merchantId) || null,
          customer_name: firstString(order.customer_name, order.customerName) || "Customer",
          customer_phone: firstString(order.customer_phone, order.customerPhone),
          customer_city: firstString(order.customer_city, order.customerCity),
          shipping_address: firstString(order.shipping_address, order.address),
          items,
          total_price: totalPrice,
          payment_method: firstString(order.payment_method, order.paymentMethod) || "COD",
          payment_status: firstString(order.payment_status, order.paymentStatus) || "Unpaid",
          transaction_id: firstString(order.transaction_id, order.transactionId) || null,
          status: firstString(order.status) || "New",
          created_at: order.created_at || new Date().toISOString(),
        };

        // ---------- 3. Insert into Supabase ----------
        const { data, error } = await supabase
          .from("orders")
          .insert(record)
          .select()
          .maybeSingle();

        if (error) throw new Error(error.message);
        inserted.push(data ?? record);

        // Best-effort MongoDB mirror — a Mongo outage must not fail checkout.
        try {
          const { db } = await connectToDatabase();
          if (db) await db.collection("orders").insertOne({ ...record });
        } catch (mongoErr: any) {
          console.warn(
            "[POST /api/orders] MongoDB mirror skipped:",
            mongoErr?.message ?? mongoErr
          );
        }
      } catch (orderErr: any) {
        const message = orderErr?.message || "Failed to insert order";
        console.error("[POST /api/orders] Insert failed:", message);
        failures.push(message);
      }
    }

    if (inserted.length === 0) {
      return jsonResponse(
        { success: false, error: failures[0] || "Failed to process order", failures },
        500
      );
    }

    // ---------- 4. Success ----------
    return jsonResponse({
      success: true,
      data: inserted.length === 1 ? inserted[0] : inserted,
      count: inserted.length,
      ...(failures.length > 0 ? { failures } : {}),
    });
  } catch (error: any) {
    // ---------- 5. Unexpected failure -> JSON 500 ----------
    console.error("[POST /api/orders] Error inserting order:", error);
    return jsonResponse(
      { success: false, error: error?.message || "Failed to process order" },
      500
    );
  }
}

/** Simple health probe so a GET returns JSON instead of a 405 HTML page. */
export async function GET() {
  return jsonResponse({
    success: true,
    route: "/api/orders",
    configured: Boolean(getSupabaseClient()),
  });
}
