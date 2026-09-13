/**
 * Vercel Serverless entry point for the Zid-BD merchant dashboard / storefront.
 *
 * WHY THIS FILE LOOKS THE WAY IT DOES
 * ---------------------------------------------------------------------------
 * This project has `"type": "module"` in package.json, so Vercel treats every
 * api/*.ts file as ESM. Under Node's ESM resolver a *relative* import MUST
 * carry a file extension. The previous version did:
 *
 *     import app from '../server';   // <-- no extension
 *
 * which Vercel's Node runtime cannot resolve, producing the exact error seen in
 * the runtime logs:
 *
 *     Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/server'
 *
 * That import failure aborts the whole function, so EVERY route served by this
 * handler (/api/orders, /api/stores, /api/storefront, ...) returned a 500.
 *
 * The app is therefore resolved at call time from an explicit list of
 * candidate specifiers. Static `import` statements are evaluated before any
 * code runs, so a bad specifier cannot be caught — a dynamic import can, and it
 * lets us report the real reason instead of erroring out silently.
 * ---------------------------------------------------------------------------
 */

import mongoose from 'mongoose';

type ExpressApp = (req: any, res: any) => any;

/**
 * Candidate specifiers for the Express app, in resolution order.
 *
 * `../server.js` is listed FIRST on purpose: Vercel compiles TypeScript to
 * JavaScript before shipping the function, so the emitted sibling file is
 * `server.js` and that is what the runtime can actually find. The extensionless
 * and `.ts` forms are kept as fallbacks for local `tsx` / `vercel dev` runs
 * where the TS source is evaluated directly.
 */
const APP_CANDIDATES = [
  '../server.js',
  '../server.ts',
  '../server',
] as const;

let cachedApp: ExpressApp | null = null;

async function loadApp(): Promise<ExpressApp> {
  if (cachedApp) return cachedApp;

  const failures: string[] = [];

  for (const specifier of APP_CANDIDATES) {
    try {
      const mod: any = await import(specifier);
      const app = mod?.default ?? mod?.app ?? mod;
      if (typeof app === 'function') {
        cachedApp = app as ExpressApp;
        return cachedApp;
      }
      failures.push(`${specifier}: module loaded but has no callable default export`);
    } catch (err: any) {
      failures.push(`${specifier}: ${err?.message || err}`);
    }
  }

  // Include a directory listing so the next runtime log tells us exactly which
  // files Vercel actually shipped, instead of the opaque '/var/task/server'.
  let shippedFiles = 'unavailable';
  try {
    const fs = await import('fs/promises');
    shippedFiles = (await fs.readdir(process.cwd())).join(', ');
  } catch { /* best effort */ }

  throw new Error(
    `Unable to resolve the Express app from ${APP_CANDIDATES.join(' | ')}. ` +
    `cwd=${process.cwd()} files=[${shippedFiles}] attempts=[${failures.join(' ;; ')}]`
  );
}

/**
 * Reuse one Mongo connection across warm invocations. The connection promise is
 * cached on `global` so concurrent cold requests share a single in-flight
 * handshake rather than opening one pool each.
 */
declare global {
  // eslint-disable-next-line no-var
  var __vercelMongoCache: { promise: Promise<typeof mongoose> | null } | undefined;
}

const mongoCache = global.__vercelMongoCache ?? (global.__vercelMongoCache = { promise: null });

async function ensureMongo(): Promise<{ ok: boolean; error?: string }> {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL || process.env.DATABASE_URL;

  if (mongoose.connection.readyState === 1) return { ok: true };

  if (!uri) {
    // Not fatal: routes that are Supabase-only (storefront, products) must keep
    // working. Routes that need Mongo report the missing variable themselves.
    return { ok: false, error: 'MONGODB_URI is not set in this environment' };
  }

  if (!mongoCache.promise) {
    mongoCache.promise = mongoose
      .connect(uri, {
        dbName: process.env.MONGODB_DB || 'zidbdsaas',
        bufferCommands: false,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      })
      .catch((err) => {
        mongoCache.promise = null; // allow the next request to retry
        throw err;
      });
  }

  try {
    await mongoCache.promise;
    return { ok: true };
  } catch (err: any) {
    mongoCache.promise = null;
    return { ok: false, error: err?.message || String(err) };
  }
}

export default async function handler(req: any, res: any) {
  // Let the Express app own CORS too, but answer a bare preflight even if the
  // app failed to load so the browser always gets a usable CORS response.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  let app: ExpressApp;
  try {
    app = await loadApp();
  } catch (err: any) {
    console.error('[api/index] Failed to load Express app:', err?.message || err);
    return res.status(500).json({
      success: false,
      error: 'Serverless entry point could not load the Express app',
      detail: err?.message || String(err),
    });
  }

  const mongo = await ensureMongo();
  if (!mongo.ok) {
    // Surface the reason on the response so the runtime log is actionable.
    console.error('[api/index] MongoDB unavailable:', mongo.error);
    res.setHeader('x-mongodb-status', 'error');
  }

  try {
    return await app(req, res);
  } catch (err: any) {
    console.error('[api/index] Unhandled error from Express app:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: err?.message || 'Internal Server Error',
        mongodb: mongo.ok ? 'connected' : mongo.error,
      });
    }
  }
}
