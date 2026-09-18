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

/**
 * Resolve the connection string on every call rather than freezing it at module
 * load. Serverless functions can have module state created before the runtime
 * injects its environment, and a cached empty value would make the app report
 * "Database is not configured" even though MONGODB_URI IS set in Vercel.
 */
function readMongoUri(): string {
  return (
    process.env.MONGODB_URI ||
    process.env.MONGODB_URL ||
    process.env.DATABASE_URL ||
    ''
  ).trim();
}

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
  return readMongoUri();
}

export function isMongoConfigured(): boolean {
  return Boolean(readMongoUri());
}

export type MongoFailure = {
  /** Machine-readable reason the DB is unusable. */
  code: 'not_configured' | 'auth_failed' | 'dns_failed' | 'timeout' | 'connection_failed';
  /** Operator-facing sentence safe to return in an API payload. */
  message: string;
  /** Raw driver message, for logs only (never contains credentials). */
  detail?: string;
};

/**
 * Translate a mongoose/driver connection error into an actionable, non-leaky
 * description. Callers use this to report DB trouble in a JSON envelope instead
 * of throwing an opaque 500 at the dashboard.
 */
export function describeMongoError(err: unknown): MongoFailure {
  const raw = (err as any)?.message || String(err || '');
  const detail = raw && !/MONGODB_URI is not set/.test(raw) ? raw : undefined;

  if (!readMongoUri()) {
    return {
      code: 'not_configured',
      message: 'Database is not configured: MONGODB_URI is missing on the server. Add it in Vercel > Settings > Environment Variables.',
    };
  }
  if (/authentication failed|bad auth|unauthorized|invalid credentials/i.test(raw)) {
    return { code: 'auth_failed', message: 'Database connection rejected: MONGODB_URI credentials are invalid or lack access to the cluster.', detail };
  }
  if (/ENOTFOUND|querySrv|getaddrinfo|DNS/i.test(raw)) {
    return { code: 'dns_failed', message: 'Database host could not be resolved: the cluster hostname in MONGODB_URI is wrong or unreachable.', detail };
  }
  if (/timed out|timeout|server selection/i.test(raw)) {
    return { code: 'timeout', message: 'Database connection timed out: the cluster did not respond — check the Atlas IP allow-list (allow 0.0.0.0/0 for Vercel).', detail };
  }
  return { code: 'connection_failed', message: 'Database unavailable: could not establish a MongoDB connection.', detail };
}

/**
 * Establish (or reuse) a single shared mongoose connection.
 * Throws a descriptive Error if the connection cannot be established so that
 * callers can surface real details instead of an opaque 500.
 */
export async function connectToDatabase(dbName: string = DB_NAME): Promise<typeof mongoose> {
  const uri = readMongoUri();
  if (!uri) {
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
      .connect(uri, opts)
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
  if (!readMongoUri()) return null;
  await connectToDatabase(dbName);
  return mongoose.connection.db ?? null;
}

export default connectToDatabase;
