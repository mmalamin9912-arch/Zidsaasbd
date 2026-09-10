import mongoose from "mongoose";

const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGODB_URL ||
  "";

let cachedDb: any = null;

export async function connectToDatabase() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    return { db: cachedDb };
  }

  if (mongoose.connection.readyState !== 1) {
    if (!MONGODB_URI) {
      console.warn("[MongoDB] Warning: MONGODB_URI is not set in environment variables");
    }
    await mongoose.connect(MONGODB_URI);
  }

  cachedDb = mongoose.connection.db;
  return { db: cachedDb };
}
