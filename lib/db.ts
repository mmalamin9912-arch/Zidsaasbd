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
  /*
   * STRIP SURROUNDING QUOTES.
   *
   * Render / Vercel / Heroku env editors and many `.env` files store the value
   * as `"mongodb+srv://…"`, and Node passes those quote characters straight
   * through. The driver then received `"mongodb+srv://…"` and answered
   * `bad auth` on EVERY attempt, so the app failed over to MONGODB_URI_2 — a
   * different cluster whose database is empty — and the whole dashboard loaded
   * blank while the data sat on the primary.
   */
  const clean = (value: string | undefined): string =>
    String(value ?? '')
      .trim()
      .replace(/^["'`\\]+|["'`\\]+$/g, '')
      .trim();

  if (role === 'secondary') return clean(process.env.MONGODB_URI_2);
  return clean(
    process.env.MONGODB_URI ||
    process.env.MONGODB_URL ||
    process.env.DATABASE_URL,
  );
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
  var __mongoosePrimaryDirectCache: SecondaryCache | undefined;
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

const primaryDirectCached: SecondaryCache =
  global.__mongoosePrimaryDirectCache ?? (global.__mongoosePrimaryDirectCache = {
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
      // Atlas answers with SHARD targets (`ac-xxxx-shard-00-00.<zone>.mongodb.net`)
      // which do NOT contain the cluster label from the URI. Comparing the PARENT
      // domain is the only correct suffix test; `includes(host)` matched nothing
      // and produced an empty seed list → a URI with no host → `bad auth`.
      const srvDomain = host.split('.').slice(1).join('.').toLowerCase();
      const hosts = (Array.isArray(data?.Answer) ? data.Answer : [])
        // SRV = type 33. Some resolvers omit `type`; accept any answer that
        // carries a target inside the cluster's parent domain.
        .filter((a: any) => (!a.type || a.type === 33) && typeof a.data === 'string')
        .map((a: any) => {
          const [priority, weight, port, target] = String(a.data).trim().split(/\s+/);
          /*
           * STRIP THE TRAILING DOT — an SRV target is a fully-qualified name
           * (`ac-xxxx-shard-00-00.zone.mongodb.net.`). Joining the port to a name
           * that still ends in `.` yields `….mongodb.net.27017`, an invalid host
           * the driver answers with `bad auth`.
           */
          return { host: String(target || '').replace(/\.+$/, ''), port: port || '27017', priority: Number(priority) || 0 };
        })
        .filter((h: any) => {
          const target = String(h.host).toLowerCase();
          if (!target) return false;
          return srvDomain ? target.endsWith(srvDomain) : target.includes(host.toLowerCase());
        })
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
  // An empty list must never be used to rewrite the URI: `replace('@…','@')`
  // yields `mongodb://user:pass@/db` (NO HOST), which the driver reports as
  // `bad auth`. Keep the original `+srv` URI instead and let the driver try.
  const usableSeeds = seeds.filter((s) => /:\d+$/.test(String(s)));
  if (!usableSeeds.length) return uri;

  // mongodb+srv://user:pass@cluster/db?opts  →  mongodb://user:pass@h1:27017,h2:27017/db?opts&ssl=true
  //
  // NEVER INVENT `authSource`. `+srv` defaults it to the URI's database (or
  // `admin`), and Atlas users normally live in `admin` — but a cluster that
  // authenticates against the DATABASE ITSELF rejects `authSource=admin` with
  // "Authentication failed". Forcing it here made the primary look permanently
  // unusable, so every dashboard read silently fell back to the second cluster
  // (which holds no merchant data). Only the TLS flag is added now; the
  // driver's own default applies, exactly as for the original `+srv` URI.
  const replaced = uri.replace(/^mongodb\+srv:\/\//i, 'mongodb://').replace(`@${host}`, `@${usableSeeds.join(',')}`);
  const withTls = /[?&](ssl|tls)=/i.test(replaced)
    ? replaced
    : `${replaced}${replaced.includes('?') ? '&' : '?'}ssl=true`;
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

  // A REJECTED CREDENTIAL IS THE ONLY NON-RETRYABLE FAILURE.
  //
  // Every other failure (DNS, timeout, server selection) can be a TRANSIENT
  // outage — an Atlas blip, an IP allow-list change, a cold pool. Those must be
  // retried on the next request, never cached as "database is gone".
  const isAuthRejection = (message: string) => /bad auth|authentication failed|auth failed/i.test(message);

  for (let i = 0; i < candidates.length; i += 1) {
    const uri = await resolveMongoUriForDriver(candidates[i]);
    // Label the URI by its ACTUAL role, not by loop position: `listMongoUriCandidates()`
    // can yield only one entry (the secondary) when MONGODB_URI is unset, and that
    // entry used to be reported as "primary" in every log and error message.
    const label = candidates[i] === readMongoUri('primary') ? 'primary' : 'secondary';
    console.log(`[MongoDB] Opening new connection pool via ${label} URI (dbName=${dbName}, host=${redactUri(uri)})`);

    try {
      /*
       * DO NOT TEAR DOWN A CONNECTION THAT IS MERELY RECONNECTING.
       *
       * `readyState !== 0` also matches 3 ("disconnected", which the driver
       * reaches transiently and then retries on its own) and 2 ("connecting").
       * Disconnecting in those states destroyed the shared global pool the
       * mongoose models (`Order`, `Product`, …) are bound to, so a brief blip
       * turned into a permanently dead database until the process restarted —
       * exactly the "data exists but everything loads empty" state. Only a
       * genuinely closed handle (0 = disconnected, never connected) needs the
       * socket state cleared here.
       */
      if (mongoose.connection.readyState === 0) {
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
      if (isAuthRejection(message)) {
        throw new Error(`[MongoDB] Authentication failed for the ${label} URI. Check the username and password.`);
      }

      /*
       * A TRANSIENT HANDSHAKE FAILURE ON AN ALREADY-CONNECTED POOL IS NOT FATAL.
       *
       * `mongoose.connect()` rejects when the driver briefly cannot reach a
       * server. If another module already opened this shared connection and its
       * readyState is still 1 (or the driver is reconnecting on its own), the
       * existing pool is the one every model is bound to — keep using it
       * instead of reporting the whole database as down.
       */
      const state = mongoose.connection.readyState as number;
      if (state === 1 || state === 3) {
        console.warn(
          `[MongoDB] ${label} URI handshake failed but the shared connection is still ` +
          `usable (readyState=${state}) — reusing it instead of failing the request.`,
        );
        return mongoose;
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
/**
 * The database named in a connection URI, or '' when it names none.
 *
 * `mongodb+srv://…/?opts` (no path) and `mongodb://…/` both name no database;
 * a reader must then fall back to the explicit `dbName` it was asked for
 * instead of the driver's default.
 */
export function uriDatabaseName(uri: string): string {
  try {
    const withoutScheme = String(uri || '').replace(/^mongodb(\+srv)?:\/\//i, '');
    const afterHosts = withoutScheme.slice(withoutScheme.indexOf('/') + 1);
    if (withoutScheme.indexOf('/') === -1) return '';
    const name = afterHosts.split('?')[0];
    return decodeURIComponent(name || '').trim();
  } catch {
    return '';
  }
}

export async function connectToSecondaryDatabase(dbName: string = DB_NAME): Promise<mongoose.Connection> {
  /* SECONDARY is a preference, not a requirement. A deployment with only
   * MONGODB_URI set used to throw here and every catalogue read silently
   * dropped to the file mirror; the primary is a perfectly good catalog
   * source, so it is the fallback rather than an error. */
  return connectNamedPool('secondary', readMongoUri('secondary') || readMongoUri('primary'), secondaryCached, dbName);
}

/**
 * A DEDICATED pool for the PRIMARY URI, independent of the shared connection.
 *
 * The shared `mongoose.connect()` pool is chosen by failover: when the primary
 * briefly fails to authenticate, the app settles on MONGODB_URI_2 — a DIFFERENT
 * cluster whose `zidbdsaas` database has no stores / products / orders. From
then on every tenant read is answered by the empty cluster and the dashboard
 * renders "No products found" indefinitely, even after the primary recovers.
 *
 * This pool is opened directly against MONGODB_URI, so the data-bearing cluster
 * is always among the candidates a route reads (see `getAllTenantDbs`).
 */
export async function connectToPrimaryDatabase(dbName: string = DB_NAME): Promise<mongoose.Connection> {
  const uri = readMongoUri('primary');
  if (!uri) throw new Error('[MongoDB] MONGODB_URI is not set for the primary database.');
  return connectNamedPool('primary-direct', uri, primaryDirectCached, dbName);
}

/** Shared implementation for the named, non-default connection pools. */
async function connectNamedPool(
  label: string,
  rawUri: string,
  cache: SecondaryCache,
  dbName: string,
): Promise<mongoose.Connection> {
  const uri = await resolveMongoUriForDriver(rawUri);
  if (!uri || /^\s*$/.test(uri)) {
    throw new Error(`[MongoDB] No URI configured for the ${label} database.`);
  }
  if (cache.conn?.readyState === 1) return cache.conn;
  if (!cache.promise) {
    /*
     * ALWAYS TARGET AN EXPLICIT DATABASE.
     *
     * `opts.dbName` only sets the default database of a connection that has NO
     * database path. MONGODB_URI_2 is configured as `…/?compressors=zlib` (no
     * path), so reads could land on whatever the driver defaults to instead of
     * `zidbdsaas`. When the URI names a database, that name wins.
     */
    const targetDb = uriDatabaseName(uri) || dbName;
    const opts = getConnectionOpts(targetDb);
    console.log(`[MongoDB] Opening ${label} connection pool (dbName=${targetDb})`);
    cache.promise = mongoose
      .createConnection(uri, opts)
      .asPromise()
      .then((connection) => {
        cache.conn = connection;
        console.log(`[MongoDB] ${label} connection established`);
        return connection;
      })
      .catch((err) => {
        cache.promise = null;
        cache.conn = null;
        console.error(`[MongoDB] ${label} connection failed:`, err?.message || err);
        throw new Error(`[MongoDB] ${label} connection failed: ${err?.message || err}`);
      });
  }
  return cache.promise;
}

async function connectToSecondaryDatabaseLegacy(dbName: string = DB_NAME): Promise<mongoose.Connection> {
  return connectToSecondaryDatabase(dbName);
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
    try {
      const connection = await connectToSecondaryDatabase(dbName);
      return connection.db ?? (connection.getClient ? connection.getClient().db(dbName) : null);
    } catch {
      return null;
    }
  }
  try {
    await connectToDatabase(dbName);
    if ((mongoose.connection.readyState as number) === 1) {
      const db = mongoose.connection.db || (mongoose.connection as any).getClient?.()?.db?.(dbName);
      if (db) return db;
    }
  } catch (err: any) {
    console.warn('[MongoDB] getMongoDb primary connection attempt warning:', err?.message || err);
  }

  // Fallback to secondary if primary is unavailable
  if (readMongoUri(SECONDARY_DB_ROLE) && readMongoUri(SECONDARY_DB_ROLE) !== readMongoUri('primary')) {
    try {
      const connection = await connectToSecondaryDatabase(dbName);
      return connection.db ?? (connection.getClient ? connection.getClient().db(dbName) : null);
    } catch {}
  }
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
