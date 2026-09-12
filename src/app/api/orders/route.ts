import { NextResponse } from "next/server";
import { MongoClient, Db } from "mongodb";

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
  return client.db("zidbdsaas");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const db = await getOrdersDb();

    await db.collection("orders").insertOne(body);

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: unknown) {
    console.error("[POST /api/orders] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to process order";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}