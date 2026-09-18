/**
 * Admin subscription-request and theme-purchase data access for the Super Admin
 * Portal (`/admin` -> Approvals & Requests tab).
 *
 * Both request types live in the single `zidbdsaas` MongoDB database:
 *   - subscription_requests      -> plan upgrades / renewals (bKash, Nagad, ...)
 *   - theme_purchase_requests    -> one-off theme buys (legacy: theme_requests)
 *
 * Field names differ between the modern write path (camelCase, written by the
 * checkout / dashboard client) and legacy seed data (snake_case), so every row
 * is normalised through pick() — the same tolerant approach used by
 * lib/adminMerchants.ts. Everything here is best-effort and NEVER throws a 5xx:
 * callers get a fully-shaped envelope with ok:false + a structured dbError when
 * the database is unavailable.
 *
 * Import-safe from the Express bootstrap (server.ts), the Vercel bundled app
 * (api/server.ts) and the standalone Vercel function (api/admin/requests.ts).
 */

import { connectToDatabase, getMongoUri, describeMongoError, DB_NAME } from "./db.js";
import type { MongoFailure } from "./db.js";

export type RequestKind = "subscription" | "theme";

/** Normalised subscription request returned to the admin dashboard. */
export interface AdminSubscriptionRequest {
  id: string;
  kind: "subscription";
  storeName: string;
  storeSlug: string;
  storeId: string;
  email: string;
  planId: string;
  planName: string;
  amountBDT: number;
  paymentMethod: string;
  transactionId: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
}

/** Normalised theme purchase request returned to the admin dashboard. */
export interface AdminThemeRequest {
  id: string;
  kind: "theme";
  storeName: string;
  storeSlug: string;
  storeId: string;
  email: string;
  themeId: string;
  themeName: string;
  amountBDT: number;
  paymentMethod: string;
  transactionId: string;
  requestedAt: string;
  status: "pending_approval" | "approved" | "rejected";
}

export interface AdminRequestCounts {
  all: number;
  pending: number;
  approved: number;
  rejected: number;
}

export interface AdminRequestListResult<T> {
  ok: boolean;
  generatedAt: string;
  database: string;
  /** Rows matching the requested status filter. */
  requests: T[];
  /** Totals for the WHOLE collection (before filtering), for the tab badges. */
  counts: AdminRequestCounts;
  status: string;
  error?: string;
  dbError?: MongoFailure | null;
}

export interface PurgeTestDataResult {
  ok: boolean;
  generatedAt: string;
  database: string;
  /** Documents removed, per collection. */
  deleted: { collection: string; count: number }[];
  totalDeleted: number;
  /** How many documents were inspected before the purge. */
  scanned: number;
  dryRun: boolean;
  error?: string;
  dbError?: MongoFailure | null;
}

/* ----------------------------- helpers ----------------------------- */

type Row = Record<string, any>;

/** First defined, non-empty value among keys on row. */
function pick(row: Row, keys: string[]): any {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function toNumber(value: any, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toIso(value: any): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

/** Human-readable label fallback when a row carries no explicit plan name. */
function humanizePlanId(planId: string): string {
  return planId.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Collapse the many status spellings written across deployments into the three
 * buckets the admin filter buttons expose.
 */
export function normalizeRequestStatus(kind: RequestKind, raw: any): string {
  const status = String(raw || "").trim().toLowerCase();
  if (!status) return kind === "theme" ? "pending_approval" : "pending";

  if (APPROVED_VALUES.includes(status)) return "approved";
  if (REJECTED_VALUES.includes(status)) return "rejected";

  // Everything else (pending, pending_approval, new, submitted, awaiting_admin...)
  return kind === "theme" ? "pending_approval" : "pending";
}

/** True when a normalised status belongs to the pending bucket. */
function isPending(status: string): boolean {
  return status === "pending" || status === "pending_approval";
}

const APPROVED_VALUES = ["approved", "approve", "active", "completed", "complete", "paid", "success", "succeeded"];
const REJECTED_VALUES = ["rejected", "reject", "declined", "cancelled", "canceled", "failed", "expired"];
const PENDING_VALUES = ["pending", "pending_approval", "new", "submitted", "awaiting", "awaiting_admin", "in_review"];

/**
 * Map the admin filter button (All / Pending / Approved / Rejected) to the raw
 * status values that could be stored for it. Handed to Mongo so the FILTERING
 * HAPPENS IN THE QUERY rather than in the browser.
 */
function statusQuery(status: string): Record<string, any> {
  const filter = String(status || "all").toLowerCase();
  if (filter === "all") return {};

  const wanted =
    filter === "pending" ? PENDING_VALUES : filter === "approved" ? APPROVED_VALUES : filter === "rejected" ? REJECTED_VALUES : null;
  if (!wanted) return {};

  // Case-insensitive match on the raw status. Documents with no status field at
  // all are treated as pending (legacy rows pre-date the field).
  const or: Record<string, any>[] = [
    { status: { $in: wanted } },
    { status: { $regex: "^\\s*(" + wanted.join("|") + ")\\s*$", $options: "i" } },
  ];
  if (filter === "pending") {
    or.push({ status: { $exists: false } }, { status: null }, { status: "" });
  }
  return { $or: or };
}

function normalizeSubscriptionRequest(row: Row): AdminSubscriptionRequest {
  const planId = String(pick(row, ["planId", "plan_id", "plan", "subscription_plan", "requested_plan"]) || "free_trial").toLowerCase();
  return {
    id: String(pick(row, ["id", "requestId", "request_id", "_id"]) || ""),
    kind: "subscription",
    storeName: String(pick(row, ["storeName", "store_name", "merchant_name", "business_name"]) || "Store"),
    storeSlug: String(pick(row, ["storeSlug", "store_slug", "slug"]) || ""),
    storeId: String(pick(row, ["storeId", "store_id", "store_code"]) || ""),
    email: String(pick(row, ["email", "merchant_email", "owner_email"]) || ""),
    planId,
    planName: String(pick(row, ["planName", "plan_name", "planLabel"]) || humanizePlanId(planId)),
    amountBDT: toNumber(pick(row, ["amountBDT", "amount_bdt", "amount", "price", "total"]), 0),
    paymentMethod: String(pick(row, ["paymentMethod", "payment_method", "method", "gateway"]) || "Admin").replace(/_admin$/, ""),
    transactionId: String(pick(row, ["transactionId", "transaction_id", "trxId", "trx_id"]) || "-"),
    requestedAt: toIso(pick(row, ["requestedAt", "requested_at", "created_at", "createdAt", "submittedAt", "submitted_at"])),
    status: normalizeRequestStatus("subscription", pick(row, ["status"])) as AdminSubscriptionRequest["status"],
  };
}

function normalizeThemeRequest(row: Row): AdminThemeRequest {
  return {
    id: String(pick(row, ["id", "requestId", "request_id", "_id"]) || ""),
    kind: "theme",
    storeName: String(pick(row, ["storeName", "store_name", "merchant_name", "business_name"]) || "Store"),
    storeSlug: String(pick(row, ["storeSlug", "store_slug", "slug"]) || ""),
    storeId: String(pick(row, ["storeId", "store_id", "store_code"]) || ""),
    email: String(pick(row, ["email", "merchant_email", "owner_email"]) || ""),
    themeId: String(pick(row, ["themeId", "theme_id", "template_id"]) || ""),
    themeName: String(pick(row, ["themeName", "theme_name", "template_name", "name"]) || "Theme"),
    amountBDT: toNumber(pick(row, ["amountBDT", "amount_bdt", "amount", "price", "total"]), 0),
    paymentMethod: String(pick(row, ["paymentMethod", "payment_method", "method", "gateway"]) || "Admin").replace(/_admin$/, ""),
    transactionId: String(pick(row, ["transactionId", "transaction_id", "trxId", "trx_id"]) || "-"),
    requestedAt: toIso(pick(row, ["requestedAt", "requested_at", "created_at", "createdAt", "submittedAt", "submitted_at"])),
    status: normalizeRequestStatus("theme", pick(row, ["status"])) as AdminThemeRequest["status"],
  };
}

/** Collections each request kind may live in (modern name first, then legacy). */
const COLLECTIONS: Record<RequestKind, string[]> = {
  subscription: ["subscription_requests", "subscriptionRequests"],
  theme: ["theme_purchase_requests", "themePurchaseRequests", "theme_requests", "themeRequests"],
};

/** Collections the "Clean Test Data" purge is allowed to touch. */
const PURGE_COLLECTIONS = ["subscription_requests", "theme_purchase_requests", "theme_requests"];

async function getDb(dbName: string = DB_NAME): Promise<{ db: any | null; failure: MongoFailure | null }> {
  if (!getMongoUri()) {
    return { db: null, failure: describeMongoError(new Error("MONGODB_URI is not set")) };
  }
  try {
    const mongoose = await connectToDatabase(dbName);
    const db = mongoose.connection.db ?? null;
    return { db, failure: db ? null : describeMongoError(new Error("connection handle unavailable")) };
  } catch (err) {
    const failure = describeMongoError(err);
    console.warn("[adminRequests] Mongo connection failure:", failure.detail || failure.message);
    return { db: null, failure };
  }
}

function isMissingCollection(err: any): boolean {
  return /ns not found|does not exist/i.test(String(err?.message || ""));
}

/**
 * Read every document for a request kind, de-duplicated by id across the modern
 * and legacy collections so a row mirrored into both is only shown once.
 */
async function readRequests(db: any, kind: RequestKind, status: string, query?: Record<string, any>): Promise<Row[]> {
  const rows: Row[] = [];
  const seen = new Set<string>();
  const filter = query ?? statusQuery(status);

  for (const collectionName of COLLECTIONS[kind]) {
    try {
      const found: Row[] = await db
        .collection(collectionName)
        .find(filter)
        .sort({ created_at: -1, createdAt: -1, _id: -1 })
        .limit(5000)
        .toArray();
      for (const row of found) {
        const key = String(pick(row, ["id", "requestId", "request_id", "_id"]) || "");
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        rows.push(row);
      }
    } catch (err: any) {
      if (!isMissingCollection(err)) {
        console.warn("[adminRequests] " + collectionName + " lookup warning:", err?.message || err);
      }
    }
  }
  return rows;
}

function matchesFilter(normalizedStatus: string, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "pending") return isPending(normalizedStatus);
  return normalizedStatus === filter;
}

function countByStatus(rows: { status: string }[]): AdminRequestCounts {
  return {
    all: rows.length,
    pending: rows.filter((r) => isPending(r.status)).length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };
}

/* --------------------------- public API --------------------------- */

/**
 * List subscription requests, optionally filtered by the admin status buttons.
 *
 * @param opts.status one of all|pending|approved|rejected (case-insensitive)
 */
export async function listSubscriptionRequests(opts: { status?: string } = {}): Promise<AdminRequestListResult<AdminSubscriptionRequest>> {
  const status = String(opts.status || "all").toLowerCase();
  const base: AdminRequestListResult<AdminSubscriptionRequest> = {
    ok: true,
    generatedAt: new Date().toISOString(),
    database: DB_NAME,
    requests: [],
    counts: { all: 0, pending: 0, approved: 0, rejected: 0 },
    status,
  };

  const { db, failure } = await getDb();
  if (!db) return { ...base, ok: false, error: failure?.message || "MongoDB is not configured or unavailable.", dbError: failure };

  // Counts describe the WHOLE collection, so that read is always unfiltered. The
  // rows are read with the status pushed into the Mongo query, so the ALL /
  // PENDING / APPROVED / REJECTED buttons change what is fetched from the DB.
  const all = (await readRequests(db, "subscription", "all")).map(normalizeSubscriptionRequest);
  const filtered = status === "all"
    ? all
    : (await readRequests(db, "subscription", status, statusQuery(status))).map(normalizeSubscriptionRequest);
  return {
    ...base,
    requests: filtered.filter((r) => matchesFilter(r.status, status)),
    counts: countByStatus(all),
  };
}

/**
 * List theme purchase requests, optionally filtered by the admin status buttons.
 *
 * @param opts.status one of all|pending|approved|rejected (case-insensitive)
 */
export async function listThemeRequests(opts: { status?: string } = {}): Promise<AdminRequestListResult<AdminThemeRequest>> {
  const status = String(opts.status || "all").toLowerCase();
  const base: AdminRequestListResult<AdminThemeRequest> = {
    ok: true,
    generatedAt: new Date().toISOString(),
    database: DB_NAME,
    requests: [],
    counts: { all: 0, pending: 0, approved: 0, rejected: 0 },
    status,
  };

  const { db, failure } = await getDb();
  if (!db) return { ...base, ok: false, error: failure?.message || "MongoDB is not configured or unavailable.", dbError: failure };

  const all = (await readRequests(db, "theme", "all")).map(normalizeThemeRequest);
  const filtered = status === "all"
    ? all
    : (await readRequests(db, "theme", status, statusQuery(status))).map(normalizeThemeRequest);
  return {
    ...base,
    requests: filtered.filter((r) => matchesFilter(r.status, status)),
    counts: countByStatus(all),
  };
}

/**
 * Does this document look like seeded mock/demo data rather than a real payment?
 *
 * Deliberately conservative — a row is only a "test" row when it carries an
 * obvious marker, so a real transaction can never be destroyed by accident.
 * Real rows always have a genuine merchant TrxID; test rows use demo ids or an
 * explicit test/demo/sample flag.
 */
export function isTestTransaction(row: Row): boolean {
  const flags = ["isTest", "is_test", "test", "demo", "isDemo", "is_demo", "isMock", "is_mock", "sample", "seed"];
  for (const flag of flags) {
    if (row?.[flag] === true) return true;
  }

  const trx = String(pick(row, ["transactionId", "transaction_id", "trxId", "trx_id"]) || "").trim().toUpperCase();
  if (!trx) return false;

  // Explicit markers: TEST, DEMO, SAMPLE, DUMMY, MOCK, FAKE — e.g. "TEST-001".
  if (/^(TEST|DEMO|SAMPLE|DUMMY|MOCK|FAKE)[-_0-9A-Z]*/.test(trx)) return true;
  // Numbered placeholders written by the old client-side mock flow.
  if (/^(TRX|TXN|TXNID|TRANSACTION)[-_]?(TEST|DEMO|SAMPLE|MOCK|000|111|123)\d*$/.test(trx)) return true;
  // Pure zero / placeholder ids.
  if (/^0+$/.test(trx)) return true;

  return false;
}

/**
 * Permanently delete mock/test transaction rows from the request collections.
 *
 * Safety:
 *  - Only subscription_requests and theme_* collections are touched — never
 *    merchants, orders, products or any other operational data.
 *  - Only documents matching isTestTransaction() are removed; anything that
 *    cannot be positively classified as test data is KEPT.
 *  - dryRun: true reports what WOULD be deleted without deleting anything.
 */
export async function purgeTestTransactions(opts: { dryRun?: boolean; dbName?: string } = {}): Promise<PurgeTestDataResult> {
  const dryRun = Boolean(opts.dryRun);
  const base: PurgeTestDataResult = {
    ok: true,
    generatedAt: new Date().toISOString(),
    database: opts.dbName || DB_NAME,
    deleted: [],
    totalDeleted: 0,
    scanned: 0,
    dryRun,
  };

  const { db, failure } = await getDb(opts.dbName || DB_NAME);
  if (!db) return { ...base, ok: false, error: failure?.message || "MongoDB is not configured or unavailable.", dbError: failure };

  const deleted: { collection: string; count: number }[] = [];
  let totalDeleted = 0;
  let scanned = 0;

  for (const collectionName of PURGE_COLLECTIONS) {
    let docs: Row[] = [];
    try {
      docs = await db.collection(collectionName).find({}).limit(5000).toArray();
    } catch (err: any) {
      // A collection that does not exist on this deployment is not an error.
      if (!isMissingCollection(err)) {
        console.warn("[adminRequests] purge " + collectionName + " warning:", err?.message || err);
      }
      continue;
    }

    scanned += docs.length;
    const ids = docs.filter(isTestTransaction).map((d) => d._id).filter((id) => id !== undefined);
    if (ids.length === 0) {
      deleted.push({ collection: collectionName, count: 0 });
      continue;
    }

    if (dryRun) {
      totalDeleted += ids.length;
      deleted.push({ collection: collectionName, count: ids.length });
      continue;
    }

    try {
      const res = await db.collection(collectionName).deleteMany({ _id: { $in: ids } });
      const count = res?.deletedCount || 0;
      totalDeleted += count;
      deleted.push({ collection: collectionName, count });
    } catch (err: any) {
      console.warn("[adminRequests] purge " + collectionName + " delete warning:", err?.message || err);
      deleted.push({ collection: collectionName, count: 0 });
    }
  }

  return { ...base, deleted, totalDeleted, scanned };
}

/**
 * High-level purge that reloads BOTH request lists afterwards, so the client can
 * refresh its two tables from a single round trip.
 */
export async function purgeTestTransactionsAndReload(opts: { dryRun?: boolean } = {}): Promise<{
  purge: PurgeTestDataResult;
  subscription: AdminRequestListResult<AdminSubscriptionRequest>;
  theme: AdminRequestListResult<AdminThemeRequest>;
}> {
  const purge = await purgeTestTransactions(opts);
  const [subscription, theme] = await Promise.all([listSubscriptionRequests({ status: "all" }), listThemeRequests({ status: "all" })]);
  return { purge, subscription, theme };
}
