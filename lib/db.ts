import mongoose from 'mongoose';

/**
 * Robust MongoDB connection handler for serverless environments (Vercel).
 *
 * Why this exists:
 * - Serverless functions are frozen/thawed and modules can be re-evaluated
 *   between invocations. Naively calling `mongoose.connect()` on every request
 *   exhausts the connection pool and triggers "too many connections" errors.
 * - The fix is to cache both the connection promise AND the resolved db handle
 *   on the Node `global` object, so a warm function reuses one pool across all
 *   invocations, and concurrent requests share a single in-flight connection.
 *
 * All data lives in the 'zidbdsaas' database, so `dbName` is always applied to
 * override whatever database the connection string's path points at.
 */

export const DB_NAME = 'zidbdsaas';
export const MongoConnectionRole = {
  primary: 'primary',
  secondary: 'secondary',
} as const;
export type MongoConnectionRole = (typeof MongoConnectionRole)[keyof typeof MongoConnectionRole];

/**
 * Read the MongoDB URI from environment variables on every call rather than
 * freezing it at module load. Serverless functions can have module state created
 * before the runtime injects its environment, and a cached empty value would
 * make the app report "Database is not configured" even though MONGODB_URI IS set
 * in Vercel.
 */
function readMongoUri(role: MongoConnectionRole = 'primary'): string {
  if (role === 'secondary') {
    return (process.env.MONGODB_URI_2 || '').trim();
  }
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

type SecondaryCache = {
  conn: mongoose.Connection | null;
  promise: Promise<mongoose.Connection> | null;
};

/**
 * Persist the cache across hot reloads (dev) and warm invocations (serverless).
 * The cache lives on `global` so that across Vercel cold starts that evaluate
 * the module fresh, a previously-warmed invocation's connection is reused.
 */
declare global {
  // eslint-disable-next-line no-var
  var __mongooseCache: MongooseCache | undefined;
  var __mongooseSecondaryCache: SecondaryCache | undefined;
}

const cached: MongooseCache =
  global.__mongooseCache ?? (global.__mongooseCache = {
    conn: null,
    promise: null,
  });

const secondaryCached: SecondaryCache =
  global.__mongooseSecondaryCache ?? (global.__mongooseSecondaryCache = {
    conn: null,
    promise: null,
  });

export function getMongoUri(role: MongoConnectionRole = 'primary'): string {
  return readMongoUri(role);
}

export const MONGODB_URI = getMongoUri('primary');
export const MONGODB_URI_2 = getMongoUri('secondary');

export function isMongoConfigured(role: MongoConnectionRole = 'primary'): boolean {
  return Boolean(readMongoUri(role));
}

export const mongooseConnectionPromise: Promise<typeof mongoose> | null = null;

/**
 * Configure mongoose connection options for optimal pooling on MongoDB Atlas.
 *
 * Rationale:
 * - maxPoolSize: 10 connections per M0 cluster is generous enough for typical
 *   traffic while preventing runaway connection counts. Adjust upward only if
 *   you hit legitimate concurrency bottlenecks and have scaled beyond M0.
 * - minPoolSize: 2 keeps 2 connections warm in the pool without excessive
 *   resource usage. This prevents "cold connection" latency on every request.
 * - connectTimeoutMS: 5s to fail fast if the cluster is unreachable.
 * - socketTimeoutMS: 45s per socket; aligns with typical query durations.
 * - maxIdleTimeMS: 30min to automatically close idle connections and keep
 *   the pool lean. This is critical for serverless where connections may sit
 *   idle between invocations.
 * - bufferCommands: false disables mongoose's command buffering so writes fail
 *   fast instead of being silently queued during connection transitions.
 * - serverSelectionTimeoutMS: 5s to wait for a server to become available.
 *
 * NOTE: The MongoDB Node.js driver (v6+) removed the legacy uppercase
 * connectionTimeoutMS / socketTimeoutMS / maxIdleTimeMS options from the
 * top-level connect() config. Those keys are no longer honored and cause the
 * driver to throw "Unknown options: connectiontimeoutms, ..." which surfaces as
 * HTTP 500 in serverless routes. Only the camelCase driver options below are
 * standard and supported by Mongoose 9 / MongoDB driver 6.
 */
function getConnectionOpts(dbName: string) {
  return {
    dbName,
    bufferCommands: false,
    maxPoolSize: 10,
    minPoolSize: 2,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 5000,
  };
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
  const uri = readMongoUri('primary');
  if (!uri) {
    throw new Error('[MongoDB] MONGODB_URI is not set. Set it in your environment variables.');
  }

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // Another module (e.g. the Vercel entry point) already opened the global
  // mongoose connection. Adopt it instead of opening a second redundant pool.
  if (mongoose.connection.readyState === 1 && !cached.conn) {
    cached.conn = mongoose;
    return cached.conn;
  }

  // Connection is disconnected / unreachable — reset so we can retry.
  if (mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3) {
    cached.promise = null;
    cached.conn = null;
  }

  if (!cached.promise) {
    const opts = getConnectionOpts(dbName);

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
 * Open the secondary Atlas pool independently from Mongoose's primary pool.
 * This is intentionally a separate `Connection`: switching URI 2 must never
 * replace the models and transactions used by core order/auth routes.
 */
export async function connectToSecondaryDatabase(dbName: string = DB_NAME): Promise<mongoose.Connection> {
  const uri = readMongoUri('secondary');
  if (!uri) {
    throw new Error('[MongoDB] MONGODB_URI_2 is not set for the secondary database.');
  }
  if (secondaryCached.conn?.readyState === 1) return secondaryCached.conn;
  if (!secondaryCached.promise) {
    const opts = getConnectionOpts(dbName);
    console.log(`[MongoDB] Opening secondary connection pool (dbName=${dbName})`);
    secondaryCached.promise = mongoose
      .createConnection(uri, opts)
      .asPromise()
      .then((connection) => {
        secondaryCached.conn = connection;
        console.log('[MongoDB] Secondary connection established');
        return connection;
      })
      .catch((err) => {
        secondaryCached.promise = null;
        secondaryCached.conn = null;
        console.error('[MongoDB] Secondary connection failed:', err?.message || err);
        throw new Error(`[MongoDB] Secondary connection failed: ${err?.message || err}`);
      });
  }
  return secondaryCached.promise;
}

/**
 * Set up connection event listeners for error handling and pool management.
 */
function setupConnectionListeners(mongooseInstance: typeof mongoose): void {
  const conn = mongooseInstance.connection;

  // Error events - log and track failures
  conn.on('error', (err) => {
    console.error('[MongoDB] Connection error:', err?.message || err);
  });

  // Disconnected event - attempt reconnection logic
  conn.on('disconnected', () => {
    console.warn('[MongoDB] Connection disconnected');
    // Don't immediately retry - let the next request trigger reconnection
  });

  // Closed event
  conn.on('closed', () => {
    console.error('[MongoDB] Connection closed');
  });

  // Reconnected event
  conn.on('reconnected', () => {
    console.log('[MongoDB] Connection reconnected');
  });
}

/**
 * Resolve the native MongoDB `Db` handle for a specific database. Reuses the
 * shared (global-cached) mongoose connection pool.
 */
export async function getMongoDb(
  dbName: string = DB_NAME,
  role: MongoConnectionRole = 'primary',
) {
  if (!readMongoUri(role)) return null;
  if (role === 'secondary') {
    const connection = await connectToSecondaryDatabase(dbName);
    return connection.db ?? null;
  }
  await connectToDatabase(dbName);
  return mongoose.connection.db ?? null;
}

export async function getSecondaryMongoDb(dbName: string = DB_NAME) {
  return getMongoDb(dbName, 'secondary');
}

export default connectToDatabase;

/**
 * Gracefully close the mongoose connection. Useful for shutdown hooks or
 * forcing a reconnection on the next request.
 */
export async function closeConnection(): Promise<void> {
  if (cached.conn) {
    console.log('[MongoDB] Closing connection pool');
    cached.promise = null;
    cached.conn = null;
    if (secondaryCached.conn) {
      await secondaryCached.conn.close().catch(() => undefined);
    }
    secondaryCached.promise = null;
    secondaryCached.conn = null;
    return Promise.resolve();
  }
  // Nothing open
  cached.promise = null;
  cached.conn = null;
  return Promise.resolve();
}

/**
 * Force reset the cached connection state. Useful after a catastrophic failure
 * or when you need to guarantee a fresh connection on the next request.
 */
export function resetConnection(): void {
  cached.promise = null;
  cached.conn = null;
  secondaryCached.promise = null;
  secondaryCached.conn = null;
  console.log('[MongoDB] Connection state reset forced');
}
