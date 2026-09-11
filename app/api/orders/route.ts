import { MongoClient, Db } from "mongodb";

export const dynamic = "force-dynamic";

// MongoDB is the system of record for orders — nothing is written to Supabase.
//
// The database ('zidbdsaas') and collection ('orders') are targeted explicitly
// below rather than inferred from the connection string, so the write lands in a
// known place regardless of what the URI's default auth database happens to be.
//
// NextResponse is not a hard dependency of this project (the app builds with
// Vite, and `next` is not installed), so a tiny JSON responder is used instead.
// It produces exactly the same Response shape NextResponse.json() would.
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const DB_NAME = "zidbdsaas";
const COLLECTION_NAME = "orders";

// ---------------------------------------------------------------------------
// Pooled native MongoClient, cached across warm serverless invocations.
// A module-level promise guard prevents a stampede of parallel connections.
// ---------------------------------------------------------------------------
let cachedClientPromise: Promise<MongoClient> | null = null;

function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set in environment variables");
  }
  if (!cachedClientPromise) {
    cachedClientPromise = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 10000,
    }).connect();
  }
  return cachedClientPromise;
}

async function getOrdersDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(DB_NAME);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Kept only for validating/resolving a store reference that the client already
// sends — no Supabase read or write happens in this route.
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

/**
 * Resolve the incoming store reference to a stored identifier.
 * A UUID is used as-is; anything else is stored verbatim as the slug/code so the
 * document is still written even when the client only knows its store_slug.
 * Deliberately does NOT call out to Supabase.
 */
function resolveStoreId(ref: string): string | null {
  const clean = String(ref || "").split(":")[0].trim();
  if (!clean) return null;
  return UUID_RE.test(clean) ? clean : clean.toLowerCase();
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

    // ---------- 2. Connect to MongoDB ('zidbdsaas' via MONGODB_URI) ----------
    const db = await getOrdersDb();

    const inserted: any[] = [];
    const failures: string[] = [];

    for (const order of rawOrders) {
      if (!order || typeof order !== "object") continue;

      try {
        // ---------- 3. Extract the order details ----------
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
        const storeId = resolveStoreId(storeRef);

        const orderNumber =
          firstString(order.order_number, order.orderNumber, order.id).replace(/^#/, "") ||
          `ORD-${Date.now()}`;

        const items = toItems(order.items);
        const totalPrice =
          Number(order.total_price ?? order.total_price_bdt ?? order.totalBDT ?? order.total) || 0;

        const document: Record<string, unknown> = {
          id: firstString(order.id) || `ord-${Date.now()}`,
          order_number: orderNumber,
          // Flat, queryable identity — mirrors the shape server.ts already reads
          // back through GET /api/orders/:storeRef.
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
          created_at: order.created_at ? new Date(order.created_at) : new Date(),
          updated_at: new Date(),
        };

        // ---------- 4. Insert into zidbdsaas.orders ----------
        const result = await db.collection(COLLECTION_NAME).insertOne(document);
        inserted.push({ ...document, _id: result.insertedId });
      } catch (orderErr: any) {
        const message = orderErr?.message || "Failed to insert order";
        console.error("[POST /api/orders] Insert failed:", message);
        failures.push(message);
      }
    }

    if (inserted.length === 0) {
      return jsonResponse(
        {
          success: false,
          error: failures[0] || "Failed to process order",
          failures,
        },
        500
      );
    }

    return jsonResponse({ success: true }, 201);
  } catch (error: any) {
    // ---------- 6. Error -> JSON 500 ----------
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
    store: "mongodb",
    database: DB_NAME,
    collection: COLLECTION_NAME,
    configured: Boolean(process.env.MONGODB_URI),
    methods: ["POST", "GET", "OPTIONS"],
  });
}

/**
 * Explicit CORS/preflight handler. Without this, a browser preflight (or any
 * method the router has no handler for) is answered by the platform with a bare
 * 405 — which is exactly the symptom being fixed here.
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "POST, GET, OPTIONS",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
