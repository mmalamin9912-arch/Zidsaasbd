import { getMongoDb, DB_NAME } from "@/lib/db";

export const dynamic = "force-dynamic";

const ORDERS_DB_NAME = DB_NAME;
const ORDERS_COLLECTION = "orders";

/**
 * GET /api/orders
 *
 * Lists orders from MongoDB. Optional filters: ?store_id= | ?store_slug= |
 * ?merchant_id= | ?storeRef=. Every database access is wrapped in try/catch and
 * the handler always returns HTTP 200 — a database outage degrades to `[]`.
 */
export async function GET(req: Request) {
  try {
    const db = await getMongoDb(ORDERS_DB_NAME);
    if (!db) return Response.json([]);

    const url = new URL(req.url);
    const storeRef = (
      url.searchParams.get("store_id") ||
      url.searchParams.get("storeRef") ||
      url.searchParams.get("store_slug") ||
      url.searchParams.get("merchant_id") ||
      ""
    ).trim();

    const query: Record<string, unknown> = storeRef
      ? { $or: [{ store_id: storeRef }, { store_slug: storeRef }, { merchant_id: storeRef }] }
      : {};

    let orders: any[] = [];
    try {
      orders = await db
        .collection(ORDERS_COLLECTION)
        .find(query)
        .sort({ created_at: -1 })
        .limit(500)
        .toArray();
    } catch (queryErr: any) {
      console.warn("[/api/orders] query warning:", queryErr?.message ?? queryErr);
      orders = [];
    }

    return Response.json(Array.isArray(orders) ? orders : []);
  } catch (err: any) {
    console.error("[/api/orders] GET error:", err?.message ?? err);
    return Response.json([]);
  }
}

/**
 * POST /api/orders
 *
 * Batch-syncs orders into MongoDB. Accepts either a bare array or an object
 * with an `orders` array. Each insert is isolated so one malformed order can
 * never fail the batch, and the handler always returns HTTP 200 with a JSON
 * envelope — never a 500.
 */
export async function POST(req: Request) {
  try {
    const body: any = await req.json().catch(() => ({}));
    const arr: any[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.orders)
        ? body.orders
        : [];

    let synced = 0;
    const db = await getMongoDb(ORDERS_DB_NAME);

    if (db) {
      for (const order of arr) {
        if (!order || typeof order !== "object") continue;
        try {
          const merchantRef = String(
            order.storeCode ||
              order.store_code ||
              order.storeId ||
              order.store_id ||
              order.merchantId ||
              order.merchant_id ||
              order.storeSlug ||
              order.store_slug ||
              "",
          ).trim();
          const slug = String(merchantRef).split(":")[0].trim().toLowerCase() || "bd";

          const record: Record<string, unknown> = {
            ...order,
            store_id: order.store_id || order.storeId || merchantRef || slug,
            store_slug: slug,
            merchant_id: order.merchantId || order.merchant_id || "",
            order_number: String(
              order.orderNumber || order.order_number || order.id || `ORD-${Date.now()}`,
            ).replace(/^#/, ""),
            customer_name: order.customerName || order.customer_name || "Customer",
            customer_phone: order.customerPhone || order.customer_phone || "",
            customer_city: order.customerCity || order.customer_city || "",
            shipping_address: String(order.address || order.shipping_address || "").trim(),
            items: typeof order.items === "string" ? order.items : JSON.stringify(order.items || []),
            total_price: order.totalBDT ?? order.total_amount ?? order.total ?? 0,
            payment_method: order.paymentMethod || order.payment_method || "COD",
            payment_status: order.paymentStatus || order.payment_status || "Unpaid",
            transaction_id: order.transactionId || order.transaction_id || null,
            status: order.status || "New",
            created_at: new Date(),
          };

          await db.collection(ORDERS_COLLECTION).insertOne(record);
          synced += 1;
        } catch (insertErr: any) {
          console.warn("[/api/orders] insert warning:", insertErr?.message ?? insertErr);
        }
      }
    }

    return Response.json({
      ok: true,
      success: true,
      synced,
      message: "Order placed successfully",
    });
  } catch (err: any) {
    console.error("[/api/orders] POST error:", err?.message ?? err);
    return Response.json({ ok: false, success: false, synced: 0, error: err?.message ?? "Order sync failed" });
  }
}
