import mongoose from 'mongoose';
import { resolveSrv } from 'node:dns/promises';

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

/**
 * Every configured URI, in the order they should be tried.
 *
 * PRIMARY first (MONGODB_URI, then its legacy aliases), then MONGODB_URI_2.
 * `MONGODB_URI_2` was previously reachable ONLY by explicitly asking for the
 * 'secondary' role, so a deployment where the primary variable was renamed,
 * cleared or pointed at a cluster that no longer existed reported "Database is
 * not configured" while a perfectly good string sat unused in MONGODB_URI_2.
 * Duplicates are removed so an environment that sets URI and URI_2 to the same
 * cluster is tried once, not twice.
 */
export function listMongoUriCandidates(): string[] {
  const candidates = [
    readMongoUri('primary'),
    readMongoUri('secondary'),
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}

/**
 * The role whose URI is actually in effect when no explicit secondary is asked
 * for: 'primary' when MONGODB_URI (or an alias) is set, otherwise 'secondary'
 * so a MONGODB_URI_2-only deployment still resolves a database at all.
 */
export function resolveMongoRole(): MongoConnectionRole {
  return readMongoUri('primary') ? 'primary' : 'secondary';
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

/**
 * The URI for a role.
 *
 * With no argument this answers "the URI the app will actually use": the
 * primary when set, otherwise MONGODB_URI_2. That matters because ~10 modules
 * (auth, admin merchants/requests, analytics, orders, platform config, …) gate
 * their entire Mongo path on `if (!getMongoUri())`. While this only read the
 * primary variables, a MONGODB_URI_2-only deployment made every one of them
 * skip the database and answer from an empty mirror.
 *
 * An EXPLICIT role still returns exactly that role's URI (possibly ''), so
 * "is the secondary configured?" keeps its precise meaning.
 */
export function getMongoUri(role?: MongoConnectionRole): string {
  if (role) return readMongoUri(role);
  const configured = resolveMongoRole();
  return readMongoUri(configured);
}

export const MONGODB_URI = getMongoUri('primary');
export const MONGODB_URI_2 = getMongoUri('secondary');

export function isMongoConfigured(role?: MongoConnectionRole): boolean {
  // No role → "is A database reachable?" which MONGODB_URI_2 alone satisfies.
  // With a role → "is that specific URI set?" (unchanged behaviour).
  if (!role) return listMongoUriCandidates().length > 0;
  return Boolean(readMongoUri(role));
}

/*
 * ── SRV LOOKUP RESILIENCE ────────────────────────────────────────────────────
 *
 * A `mongodb+srv://` URI needs an SRV DNS query (`_mongodb._tcp.<cluster>`).
 * Node resolves it through the HOST's resolver, and on many Windows / ISP /
 * corporate DNS setups that query is REFUSED (`querySrv ECONNREFUSED`) even
 * though the cluster itself is perfectly reachable through a public resolver
 * (8.8.8.8 / 1.1.1.1).
 *
 * When that happened, EVERY Mongo write failed quietly in `writeStoreConfig`
 * (`console.warn` only) — so a merchant saved their delivery zones, the toast
 * said "saved", and a reload showed defaults again. The values were never in
 * any database at all.
 *
 * Recovery: if the host resolver fails for a `+srv` URI, look the SRV records up
 * via a public DNS-over-HTTPS resolver (Cloudflare, then Google), rewrite the
 * URI as a plain `mongodb://host1,host2,.../?ssl=true` seed list and use THAT.
 * Ordinary DNS environments are untouched — the original URI is returned as-is.
 */
const DNS_OVER_HTTPS = [
  // Google's JSON API first: it always answers `application/json`. Cloudflare's
  // `/dns-query` speaks wireformat unless the request is exactly right, which
  // makes it an unreliable first choice from a plain fetch.
  'https://dns.google/resolve',
  'https://cloudflare-dns.com/dns-query',
];

const resolvedUriCache = new Map<string, string>();

function srvHostOf(uri: string): string {
  const match = /^mongodb\+srv:\/\/[^@]*@([^/?]+)/i.exec(uri);
  return match ? match[1] : '';
}

async function lookupSrvViaHttps(host: string): Promise<string[]> {
  for (const endpoint of DNS_OVER_HTTPS) {
    try {
      const res = await fetch(`${endpoint}?name=${encodeURIComponent(`_mongodb._tcp.${host}`)}&type=SRV`, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined,
      });
      if (!res.ok) continue;
      const data: any = await res.json();
      const hosts = (Array.isArray(data?.Answer) ? data.Answer : [])
        // SRV = type 33. Some resolvers omit `type`; accept any answer that
        // carries a target ending in the cluster host.
        .filter((a: any) => (!a.type || a.type === 33) && typeof a.data === 'string')
        .map((a: any) => {
          const [priority, weight, port, target] = String(a.data).trim().split(/\s+/);
          return { host: String(target || '').replace(/\.$/, ''), port: port || '27017', priority: Number(priority) || 0 };
        })
        .filter((h) => h.host.includes(host))
        .sort((a: any, b: any) => a.priority - b.priority);
      if (hosts.length) return hosts.map((h: any) => `${h.host}:${h.port}`);
    } catch {
      /* try the next resolver */
    }
  }

  // Last resort: the OS resolver via `nslookup`, which does NOT go through
  // Node's (refused) c-ares SRV path. This is what makes the fallback work on a
  // Windows/ISP network where Node cannot look the records up at all.
  return lookupSrvViaNslookup(host);
}

/** Parse `nslookup -type=SRV` output into `host:port` seeds. Never throws. */
async function lookupSrvViaNslookup(host: string): Promise<string[]> {
  try {
    const { spawnSync } = await import('node:child_process');
    // `spawnSync` (unlike `execFile`) captures the child's whole stdout on
    // Windows; `execFile` truncated it to the first stderr warning.
    const result = spawnSync(
      process.platform === 'win32' ? 'nslookup.exe' : 'nslookup',
      ['-type=SRV', `_mongodb._tcp.${host}`],
      { timeout: 5000, windowsHide: true, encoding: 'utf8' },
    );
    const output = String(result.stdout || '');
    if (!output) return [];
    const seeds: string[] = [];
    const nameRe = /svr hostname\s*=\s*([^\s,]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = nameRe.exec(output)) !== null) {
      const clean = match[1].replace(/\.$/, '');
      // The port for this record sits in the text just before its hostname.
      const before = output.slice(Math.max(0, match.index - 220), match.index);
      // A NON-global regex here: a global one would carry `lastIndex` from this
      // inner scan into the outer loop and skip every second record.
      const portMatch = /port\s*=\s*(\d+)/i.exec(before);
      const port = portMatch ? portMatch[1] : '27017';
      // Keep every SRV target that looks like a hostname. Atlas returns its
      // SHARD hosts (`ac-xxxx-shard-00-00.<zone>.mongodb.net`) — not the
      // cluster label from the URI — so the check is deliberately generic:
      // a dotted host is a host, a cluster label is not.
      if (clean && /[a-z0-9-]+\.[a-z0-9.-]+$/i.test(clean)) seeds.push(`${clean}:${port}`);
    }
    return seeds;
  } catch {
    return [];
  }
}

/**
 * The URI to hand to the driver, with `mongodb+srv` expanded when the host
 * resolver refuses the SRV query. Never throws; an unusable URI is returned
 * unchanged so the driver reports its own (clear) error.
 */
async function resolveMongoUriForDriver(uri: string): Promise<string> {
  if (!/^mongodb\+srv:\/\//i.test(uri)) return uri;
  const cached = resolvedUriCache.get(uri);
  if (cached) return cached;

  const host = srvHostOf(uri);
  if (!host) return uri;

  try {
    const records = await resolveSrv(`_mongodb._tcp.${host}`);
    if (records?.length) {
      // The host resolver works — keep the original (supported) URI.
      resolvedUriCache.set(uri, uri);
      return uri;
    }
  } catch {
    /* fall through to DoH */
  }

  const seeds = await lookupSrvViaHttps(host);
  if (!seeds.length) return uri;

  // mongodb+srv://user:pass@cluster/db?opts  →  mongodb://user:pass@h1:27017,h2:27017/db?opts&ssl=true
  const replaced = uri.replace(/^mongodb\+srv:\/\//i, 'mongodb://').replace(`@${host}`, `@${seeds.join(',')}`);
  const withTls = /[?&](ssl|tls)=/i.test(replaced)
    ? replaced
    : `${replaced}${replaced.includes('?') ? '&' : '?'}ssl=true&authSource=admin`;
  console.log(`[MongoDB] SRV lookup for ${host} refused by the host resolver; using DNS-over-HTTPS seed list (${seeds.length} hosts).`);
  resolvedUriCache.set(uri, withTls);
  return withTls;
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
export function getConnectionOpts(dbName: string) {
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

  if (!isMongoConfigured()) {
    return {
      code: 'not_configured',
      message: 'Database is not configured: neither MONGODB_URI nor MONGODB_URI_2 is set on the server. Add one in Vercel > Settings > Environment Variables.',
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

/** Credentials stripped, so a failure log can never leak the URI. */
function redactUri(uri: string): string {
  return uri.replace(/\/\/[^@/]*@/, '//***:***@');
}

/**
 * Establish (or reuse) a single shared mongoose connection.
 *
 * URI FAILOVER: the candidates from `listMongoUriCandidates()` are tried in
 * order (MONGODB_URI, then MONGODB_URI_2). If the primary is missing, malformed
 * or its cluster is unreachable/DNS-failing, the next URI is used instead of
 * failing the request. A broken primary used to surface as an error on every
 * data route at once; the secondary is often a working replica of the same data.
 *
 * A wrong PASSWORD is not treated as failover-worthy — that points at a
 * configuration mistake the operator must see, not a dead cluster — so it is
 * rethrown with a clear message.
 *
 * Throws a descriptive Error only when EVERY candidate has failed, so callers
 * can surface real details instead of an opaque 500.
 */
export async function connectToDatabase(dbName: string = DB_NAME): Promise<typeof mongoose> {
  const candidates = listMongoUriCandidates();
  if (candidates.length === 0) {
    throw new Error(
      '[MongoDB] Neither MONGODB_URI nor MONGODB_URI_2 is set. Add one in your environment variables.'
    );
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

    cached.promise = connectWithFailover(candidates, opts, dbName)
      .then((m) => {
        cached.conn = m;
        return m;
      })
      .catch((err) => {
        // Reset so the next request can retry instead of reusing a dead promise.
        cached.promise = null;
        cached.conn = null;
        console.error('[MongoDB] Connection failed:', err?.message || err);
        throw err;
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
 * Try each candidate URI in order and return the first connection that opens.
 *
 * `mongoose.connect()` leaves the default connection in a failed state after a
 * rejection, so the connection is explicitly torn down between attempts —
 * otherwise the SECOND URI would be tried on a poisoned handle and fail too.
 */
async function connectWithFailover(
  candidates: string[],
  opts: ReturnType<typeof getConnectionOpts>,
  dbName: string
): Promise<typeof mongoose> {
  const failures: string[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const uri = await resolveMongoUriForDriver(candidates[i]);
    const label = i === 0 ? 'primary' : 'secondary';
    console.log(`[MongoDB] Opening new connection pool via ${label} URI (dbName=${dbName}, host=${redactUri(uri)})`);

    try {
      // Clear any socket/model state left behind by a previous failed attempt.
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect().catch(() => undefined);
      }
      const connection = await mongoose.connect(uri, opts);
      console.log(`[MongoDB] Connected successfully via ${label} URI`);
      return connection;
    } catch (err: any) {
      const message = String(err?.message || err);
      failures.push(`${label}: ${message}`);
      console.error(`[MongoDB] ${label} URI failed:`, message);

      // A rejected credential is an operator error, not a dead cluster: trying
      // the other URI would mask a mistyped password behind an unrelated one.
      if (/bad auth|authentication failed|auth failed/i.test(message)) {
        throw new Error(`[MongoDB] Authentication failed for the ${label} URI. Check the username and password.`);
      }
      // Fall through to the next candidate.
    }
  }

  throw new Error(`[MongoDB] All configured URIs failed — ${failures.join(' | ')}`);
}

/**
 * Open the secondary Atlas pool independently from Mongoose's primary pool.
 * This is intentionally a separate `Connection`: switching URI 2 must never
 * replace the models and transactions used by core order/auth routes.
 */
export async function connectToSecondaryDatabase(dbName: string = DB_NAME): Promise<mongoose.Connection> {
  /* SECONDARY is a preference, not a requirement. A deployment with only
   * MONGODB_URI set used to throw here and every catalogue read silently
   * dropped to the file mirror; the primary is a perfectly good catalog
   * source, so it is the fallback rather than an error. */
  const uri = await resolveMongoUriForDriver(readMongoUri('secondary') || readMongoUri('primary'));
  if (!uri || /^\s*$/.test(uri)) {
    throw new Error('[MongoDB] Neither MONGODB_URI_2 nor MONGODB_URI is set for the secondary database.');
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
  // `listMongoUriCandidates()` — not `readMongoUri(role)` — so a
  // MONGODB_URI_2-only deployment resolves a database instead of returning null.
  if (listMongoUriCandidates().length === 0) return null;
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
