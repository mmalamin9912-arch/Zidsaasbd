import { connectToDatabase } from "@/lib/mongodb";

export async function POST(req: Request) {
  try {
    const orderData = await req.json();
    const { db } = await connectToDatabase();
    
    const result = await db.collection("orders").insertOne({
      ...orderData,
      created_at: orderData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    return Response.json({ success: true, orderId: result.insertedId });
  } catch (error: any) {
    console.error("[POST /api/orders] Error inserting order:", error);
    return Response.json(
      { success: false, error: error?.message || "Failed to process order" },
      { status: 500 }
    );
  }
}
