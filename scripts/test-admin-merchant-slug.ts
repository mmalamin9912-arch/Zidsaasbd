/** Run against a disposable local replica set:
 * MONGODB_URI=mongodb://127.0.0.1:27018/?replicaSet=slugtest npx tsx --test scripts/test-admin-merchant-slug.ts
 */
import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoClient, ObjectId } from 'mongodb';
import { adminMerchantSlugRouter } from '../lib/adminMerchantSlugRoute.js';
import { validateMerchantSlug } from '../lib/merchantSlug.js';

const uri = process.env.MONGODB_URI || '';
if (!uri.startsWith('mongodb://127.0.0.1:27018/')) {
  throw new Error('Tests require a disposable MongoDB replica set on 127.0.0.1:27018.');
}
// Never send synthetic fixtures or credentials to the optional external mirror.
for (const key of Object.keys(process.env)) if (key.includes('SUPABASE')) delete process.env[key];
process.env.SUPER_ADMIN_PASSWORD = randomBytes(32).toString('hex');
const client = new MongoClient(uri);
const db = client.db('zidbdsaas');
const app = express().use(express.json()).use(adminMerchantSlugRouter);
let server: ReturnType<typeof app.listen>;
let base: string;
let ownsDatabase = false;
const objectId = new ObjectId();

before(async () => {
  await client.connect();
  assert.equal((await db.listCollections().toArray()).length, 0, 'Use an empty disposable database');
  ownsDatabase = true;
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});

beforeEach(async () => {
  for (const name of ['stores', 'merchants', 'products']) await db.collection(name).deleteMany({});
  await db.collection('stores').insertMany([
    { _id: objectId, id: 'first', store_slug: 'first-shop', storeSlug: 'first-shop', store_code: 'ZID-BD-1000' },
    { id: 'second', store_slug: 'second-shop' },
  ]);
  await db.collection('merchants').insertMany([
    { id: 'mirror-first', store_slug: 'first-shop', slug: 'first-shop' },
    { id: 'legacy', storeSlug: 'Legacy-Shop' },
  ]);
  await db.collection('products').insertMany([
    { id: 'product-one', store_slug: 'first-shop', storeSlug: 'first-shop', store_id: 'first', slug: 'product-slug' },
    { id: 'product-two', store_slug: 'second-shop' },
  ]);
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  await mongoose.disconnect();
  // Only remove collections this suite created.
  for (const name of ownsDatabase ? ['stores', 'merchants', 'products', 'admin_slug_locks'] : []) {
    await db.collection(name).drop().catch(() => {});
  }
  await client.close();
});

async function rename(id: string, slug: unknown, expected = 'first-shop', password = process.env.SUPER_ADMIN_PASSWORD!) {
  const response = await fetch(`${base}/api/admin/merchants/${id}/slug`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
    body: JSON.stringify({ store_slug: slug, expected_store_slug: expected }),
  });
  return { status: response.status, body: await response.json() };
}

test('requires the configured admin password', async () => {
  assert.equal((await rename('first', 'new-shop', 'first-shop', '')).status, 403);
  assert.equal((await rename('first', 'new-shop', 'first-shop', 'wrong')).status, 403);
  const password = process.env.SUPER_ADMIN_PASSWORD;
  delete process.env.SUPER_ADMIN_PASSWORD;
  assert.equal((await rename('first', 'new-shop', 'first-shop', 'wrong')).status, 503);
  process.env.SUPER_ADMIN_PASSWORD = password;
  assert.equal((await db.collection('stores').findOne({ id: 'first' }))?.store_slug, 'first-shop');
});

test('rejects invalid and reserved slugs before writing', async () => {
  for (const slug of ['', 'bad slug', '-bad', 'bad--slug', 'bad/', 'a'.repeat(64), 'admin', 'ZID-BD-1234', { $ne: '' }, null]) {
    assert.equal((await rename('first', slug)).status, 400, JSON.stringify(slug));
  }
  assert.equal(validateMerchantSlug(' A-New-Shop ').slug, 'a-new-shop');
});

test('rejects collisions in both collections and legacy aliases case-insensitively', async () => {
  for (const slug of ['SECOND-SHOP', 'legacy-shop']) {
    assert.equal((await rename('first', slug)).status, 409);
  }
  assert.equal((await db.collection('products').findOne({ id: 'product-one' }))?.store_slug, 'first-shop');
});

test('renames by ObjectId, synchronizes aliases and linked records, preserves other stores and IDs', async () => {
  const result = await rename(String(objectId), ' New-Shop ');
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.body.merchant.storeSlug, 'new-shop');
  const current = await db.collection('stores').findOne({ id: 'first' });
  assert.equal(current?.store_slug, 'new-shop');
  assert.equal(current?.store_code, 'ZID-BD-1000');
  assert.equal((await db.collection('merchants').findOne({ id: 'mirror-first' }))?.slug, 'new-shop');
  const product = await db.collection('products').findOne({ id: 'product-one' });
  assert.equal(product?.store_slug, 'new-shop');
  assert.equal(product?.storeSlug, 'new-shop');
  assert.equal(product?.store_id, 'first');
  assert.equal(product?.slug, 'product-slug');
  assert.equal((await db.collection('products').findOne({ id: 'product-two' }))?.store_slug, 'second-shop');
});

test('supports a merchant held only in the legacy collection', async () => {
  assert.equal((await rename('legacy', 'legacy-renamed', 'Legacy-Shop')).status, 200);
  assert.equal((await db.collection('merchants').findOne({ id: 'legacy' }))?.store_slug, 'legacy-renamed');
});

test('returns not found and stale edit conflicts', async () => {
  assert.equal((await rename('missing', 'new-shop')).status, 404);
  assert.equal((await rename('first', 'new-shop', 'outdated')).status, 409);
});

test('only one concurrent merchant can claim the same slug across collections', async () => {
  const results = await Promise.all([
    rename('first', 'contested'), rename('legacy', 'contested', 'Legacy-Shop'),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
});

test('rolls back all writes when a dependent collection rejects a change', async () => {
  await db.command({ collMod: 'products', validator: { store_slug: { $ne: 'blocked-shop' } } });
  try {
    assert.equal((await rename('first', 'blocked-shop')).status, 503);
    assert.equal((await db.collection('stores').findOne({ id: 'first' }))?.store_slug, 'first-shop');
    assert.equal((await db.collection('merchants').findOne({ id: 'mirror-first' }))?.store_slug, 'first-shop');
    assert.equal((await db.collection('products').findOne({ id: 'product-one' }))?.store_slug, 'first-shop');
  } finally {
    await db.command({ collMod: 'products', validator: {} });
  }
});
