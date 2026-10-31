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

// Vercel serverless duration ceiling (seconds). The AI routes
// (/api/ai/generate-text, /api/zid-ai) chain multiple provider attempts; without
// this export the platform default (10s on Hobby) cut the function off
// mid-request and returned an opaque 504 to the client. The routes themselves
// enforce a tighter 15s provider budget and answer with a smart fallback payload
// long before this ceiling is ever reached.
export const maxDuration = 30;

import app from '../lib/serverApp.js';
import { connectToDatabase, describeMongoError, DB_NAME } from '../lib/db.js';

/**
 * Process-level safety nets. On Vercel a stray unhandled rejection can kill the
 * warm function invocation without a useful log; logging it (once) keeps the
 * backend observable and prevents silent failures. Registration is guarded so
 * module re-evaluation across warm invocations does not stack listeners.
 */
declare global {
  // eslint-disable-next-line no-var
  var __zidProcessGuards: boolean | undefined;
}
if (!global.__zidProcessGuards) {
  global.__zidProcessGuards = true;
  process.on('unhandledRejection', (reason: any) => {
    console.error('[api/index] unhandledRejection:', reason?.message || reason);
  });
  process.on('uncaughtException', (err: any) => {
    console.error('[api/index] uncaughtException:', err?.message || err);
  });
}

type ExpressApp = (req: any, res: any) => any;

/**
 * Reuse ONE shared Mongo connection across warm invocations.
 *
 * Delegates to `lib/db.js`'s `connectToDatabase`, which caches the connection
 * promise + resolved handle on the Node `global` object (`__mongooseCache`).
 * Every route module and this entry point now share the SAME pool instead of
 * each opening its own `mongoose.connect()` — the previous duplicate
 * `__vercelMongoCache` here created a second pool per container and exhausted
 * the Atlas M0 connection limit ("too many connections").
 */
async function ensureMongo(): Promise<{ ok: boolean; error?: string; code?: string }> {
  try {
    await connectToDatabase(DB_NAME);
    return { ok: true };
  } catch (err: any) {
    const failure = describeMongoError(err);
    return { ok: false, error: failure.message, code: failure.code };
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
    // Surface the reason on the response headers so the runtime log and the
    // client can both see it. Routes that need Mongo add `ok:false` themselves.
    console.error('[api/index] MongoDB unavailable:', mongo.error);
    res.setHeader('x-mongodb-status', 'error');
    res.setHeader('x-mongodb-error', String(mongo.error || '').slice(0, 300));
  } else {
    res.setHeader('x-mongodb-status', 'connected');
  }

  try {
    return await expressApp(req, res);
  } catch (err: any) {
    console.error('[api/index] Unhandled error from Express app:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: err?.message || 'Internal Server Error',
        // Structured DB diagnosis so a Mongo failure is never an opaque 500.
        database: mongo.ok
          ? { connected: true }
          : { connected: false, code: mongo.code, message: mongo.error },
        mongodb: mongo.ok ? 'connected' : mongo.error,
      });
    }
  }
}
