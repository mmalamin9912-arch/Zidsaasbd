/**
 * Vercel Serverless entry point for the Zid-BD merchant dashboard / storefront.
 *
 * WHY THIS FILE LOOKS THE WAY IT DOES
 * ---------------------------------------------------------------------------
 * Vercel only bundles the /api directory into the serverless function. Root
 * files such as the original `server.ts` are NOT present in /var/task at
 * runtime, which is why the previous entry point failed with:
 *
 *     Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/server.js'
 *     cwd=/var/task files=[.v8-cache, ___vc, api, node_modules, package.json]
 *
 * The Express app therefore lives in `api/server.ts` — a SIBLING of this file,
 * inside the bundled /api directory — and is imported with an explicit `.js`
 * extension (required because package.json declares "type": "module").
 *
 * `./server.js` resolves to the compiled `api/server.js` that Vercel emits from
 * `api/server.ts`; bundlers (vite/esbuild) and `tsx` map it back to the .ts
 * source for local runs. Importing a sibling that Vercel actually ships means
 * no runtime resolution failure is possible.
 * ---------------------------------------------------------------------------
 */

import mongoose from 'mongoose';
import app from './server.js';

type ExpressApp = (req: any, res: any) => any;

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

  const expressApp: ExpressApp = app;

  const mongo = await ensureMongo();
  if (!mongo.ok) {
    // Surface the reason on the response so the runtime log is actionable.
    console.error('[api/index] MongoDB unavailable:', mongo.error);
    res.setHeader('x-mongodb-status', 'error');
  }

  try {
    return await expressApp(req, res);
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
