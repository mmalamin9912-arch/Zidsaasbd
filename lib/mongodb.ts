import { connectToDatabase as connect, getMongoDb, DB_NAME } from '../lib/db';

/**
 * Thin compatibility shim. All connection caching now lives in lib/db.ts,
 * which caches on the Node `global` object so serverless (Vercel) invocations
 * reuse a single connection pool.
 */
export async function connectToDatabase() {
  await connect(DB_NAME);
  return { db: await getMongoDb(DB_NAME) };
}
