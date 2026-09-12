import mongoose from 'mongoose';

/**
 * Robust MongoDB connection handler for serverless environments (Vercel).
 *
 * Why this exists:
 *  - Serverless functions are frozen/thawed and modules can be re-evaluated
 *    between invocations. Naively calling `mongoose.connect()` on every request
 *    exhausts the connection pool and triggers "too many connections" errors.
 *  - The fix is to cache both the connection promise AND the resolved db handle
 *    on the Node `global` object, so a warm function reuses one pool across all
 *    invocations, and concurrent requests share a single in-flight connection.
 *
 * All data lives in the 'zidbdsaas' database, so `dbName` is always applied to
 * override whatever database the connection string's path points at.
 */

export const DB_NAME = 'zidbdsaas';

const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGODB_URL ||
  process.env.DATABASE_URL ||
  '';

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

// Persist the cache across hot reloads (dev) and warm invocations (serverless).
declare global {
  // eslint-disable-next-line no-var
  var __mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache =
  global.__mongooseCache ?? (global.__mongooseCache = { conn: null, promise: null });

export function getMongoUri(): string {
  return MONGODB_URI;
}

export function isMongoConfigured(): boolean {
  return Boolean(MONGODB_URI);
}

/**
 * Establish (or reuse) a single shared mongoose connection.
 * Throws a descriptive Error if the connection cannot be established so that
 * callers can surface real details instead of an opaque 500.
 */
export async function connectToDatabase(dbName: string = DB_NAME): Promise<typeof mongoose> {
  if (!MONGODB_URI) {
    throw new Error('[MongoDB] MONGODB_URI is not set. Set it in your environment variables.');
  }

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      dbName,
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    };

    console.log(`[MongoDB] Opening new connection pool (dbName=${dbName})`);

    cached.promise = mongoose
      .connect(MONGODB_URI, opts)
      .then((m) => {
        console.log('[MongoDB] Connected successfully');
        return m;
      })
      .catch((err) => {
        // Reset so the next request can retry instead of reusing a dead promise.
        cached.promise = null;
        cached.conn = null;
        console.error('[MongoDB] Connection failed:', err?.message || err);
        throw new Error(`[MongoDB] Connection failed: ${err?.message || err}`);
      });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err: any) {
    cached.promise = null;
    cached.conn = null;
    throw new Error(`[MongoDB] Unable to establish connection: ${err?.message || err}`);
  }
}

/**
 * Resolve the native MongoDB `Db` handle for a specific database. Reuses the
 * shared (global-cached) mongoose connection pool.
 */
export async function getMongoDb(dbName: string = DB_NAME) {
  if (!MONGODB_URI) return null;
  await connectToDatabase(dbName);
  return mongoose.connection.db ?? null;
}

export default connectToDatabase;
