/**
 * QA harness — reproduces the two production failures and proves the fixes.
 *
 *   A. "Send to Courier" must write a row into public.courier_orders and
 *      GET /api/admin/courier-orders must read it back.
 *   B. POST /api/stores/update must not hit a Mongo store_slug duplicate-key
 *      conflict, and must not send a non-bigint `id` to Supabase (22P02).
 *
 * A tiny PostgREST mock stands in for Supabase; MongoDB is an in-memory server.
 */
const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.NODE_ENV = 'production';

/* ── PostgREST mock ─────────────────────────────────────────────────────── */
const db = {
  tables: {
    courier_orders: [],
    platform_config: [],
    stores: [],
    orders: [],
  },
  // Simulates a hand-provisioned `stores` table whose PK is a bigint.
  storesIdIsBigint: true,
  log: [],
};

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : null); } catch { resolve(null); }
    });
  });
}

const mock = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const m = /^\/rest\/v1\/([A-Za-z0-9_]+)/.exec(url.pathname);
  const send = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(o === undefined ? '' : JSON.stringify(o)); };
  if (!m) return send(404, { message: 'not found' });
  const table = m[1];
  const rows = db.tables[table];
  if (!rows) {
    return send(404, { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` });
  }
  const body = await readBody(req);
  db.log.push({ method: req.method, table, query: url.search, body });

  // 22P02: a non-numeric id written into a bigint PK.
  if (table === 'stores' && db.storesIdIsBigint && body && body.id !== undefined && !/^\d+$/.test(String(body.id))) {
    return send(400, { code: '22P02', message: `invalid input syntax for type bigint: "${body.id}"` });
  }

  if (req.method === 'GET') {
    let out = rows.slice();
    const idEq = url.searchParams.get('id');
    if (idEq) out = out.filter((r) => String(r.id) === idEq.replace(/^eq\./, ''));
    const slugEq = url.searchParams.get('store_slug');
    if (slugEq) out = out.filter((r) => r.store_slug === slugEq.replace(/^eq\./, ''));
    const emailEq = url.searchParams.get('email');
    if (emailEq) out = out.filter((r) => r.email === emailEq.replace(/^eq\./, ''));
    const ckEq = url.searchParams.get('config_key');
    if (ckEq) out = out.filter((r) => r.config_key === ckEq.replace(/^eq\./, ''));
    const ckLike = url.searchParams.get('config_key') || '';
    if (ckLike.startsWith('like.')) {
      const p = decodeURIComponent(ckLike.slice(5)).replace(/\*$/, '');
      out = rows.filter((r) => String(r.config_key || '').startsWith(p));
    }
    const or = url.searchParams.get('or');
    if (or) {
      const ids = [...or.matchAll(/(?:id|order_id)\.eq\.([^,)]+)/g)].map((x) => decodeURIComponent(x[1]));
      const nums = [...or.matchAll(/order_number\.eq\.([^,)]+)/g)].map((x) => decodeURIComponent(x[1]));
      if (ids.length || nums.length) {
        out = out.filter((r) => ids.includes(String(r.id)) || nums.includes(String(r.order_number)));
      }
    }
    return send(200, out.slice(0, Number(url.searchParams.get('limit') || 1000)));
  }

  if (req.method === 'POST') {
    const list = Array.isArray(body) ? body : [body];
    const out = [];
    for (const raw of list) {
      const row = { ...raw };
      if (table === 'courier_orders') {
        const i = rows.findIndex((r) => r.id === row.id);
        if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push(row);
      } else if (table === 'stores') {
        const i = rows.findIndex((r) => (row.store_slug && r.store_slug === row.store_slug) || (row.email && r.email === row.email));
        if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push({ id: rows.length + 1, ...row });
      } else {
        const i = rows.findIndex((r) => r.config_key === row.config_key);
        if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push(row);
      }
      out.push(row);
    }
    return send(201, out);
  }

  if (req.method === 'PATCH') {
    let touched = 0;
    const patch = { ...(body || {}) };
    if (table === 'stores' && db.storesIdIsBigint && patch.id !== undefined && !/^\d+$/.test(String(patch.id))) {
      return send(400, { code: '22P02', message: `invalid input syntax for type bigint: "${patch.id}"` });
    }
    for (const r of rows) {
      const match =
        (url.searchParams.get('id') && String(r.id) === url.searchParams.get('id').replace(/^eq\./, '')) ||
        (url.searchParams.get('store_slug') && r.store_slug === url.searchParams.get('store_slug').replace(/^eq\./, '')) ||
        (url.searchParams.get('email') && r.email === url.searchParams.get('email').replace(/^eq\./, '')) ||
        (url.searchParams.get('config_key') && r.config_key === url.searchParams.get('config_key').replace(/^eq\./, ''));
      if (match) { Object.assign(r, patch); touched += 1; }
    }
    /*
     * PostgREST answers `204 No Content` for a PATCH that matched NOTHING, and
     * `200` with the updated rows when it did. The app relies on that
     * distinction to decide whether to INSERT, so the mock must reproduce it.
     */
    return send(touched ? 200 : 204, touched ? rows.filter((r) => r.store_slug === url.searchParams.get('store_slug')?.replace(/^eq\./, '')) : undefined);
  }
  return send(405, { message: 'nope' });
});

(async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('zidbdsaas');
  process.env.MONGODB_URI_2 = '';

  /*
   * POINT EVERY SUPABASE VARIABLE AT THE MOCK.
   *
   * `lib/serverApp.ts` resolves the mirror target through
   * `getServerSupabaseConfig()`, which prefers VITE_SUPABASE_URL /
   * NEXT_PUBLIC_SUPABASE_URL. `.env` on this machine holds the REAL project
   * URL, so setting only SUPABASE_URL sent the store mirror to production and
   * it came back `401 Invalid API key` — the harness was testing the wrong
   * server, not the code.
   */
  await new Promise((r) => mock.listen(4557, r));
  const mockUrl = 'http://127.0.0.1:4557';
  const mockKey = 'qa-service-key';
  for (const k of ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'DATABASE_URL']) {
    process.env[k] = mockUrl;
  }
  for (const k of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_KEY']) {
    process.env[k] = mockKey;
  }

  const mongoose = require('mongoose');
  const client = await mongoose.createConnection(process.env.MONGODB_URI, { dbName: 'zidbdsaas' }).asPromise();

  const bundle = require('../dist/server.cjs');
  const app = bundle && bundle.listen ? bundle : bundle.default;
  const server = app.listen(4558);
  const base = 'http://127.0.0.1:4558';

  const post = async (p, b) => {
    const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  const get = async (p) => {
    const r = await fetch(base + p);
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  const wait = (ms = 2500) => new Promise((r) => setTimeout(r, ms));

  let fails = 0;
  const check = (label, cond, extra) => {
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${cond || extra === undefined ? '' : `  <- ${JSON.stringify(extra)}`}`);
    if (!cond) fails += 1;
  };

  /* ── A. Send to Courier ────────────────────────────────────────────── */
  console.log('\n[A1] Send to Courier (Steadfast 401) writes public.courier_orders');
  const ORDER = 'ZID-507745498';
  const res = await post('/api/courier/send', {
    courier: 'Steadfast Courier',
    storeSlug: 'qa-store',
    order: {
      invoice_id: ORDER, orderNumber: ORDER, id: ORDER,
      customerName: 'QA Customer', customerPhone: '01700000000',
      address: 'House 1, Road 2', customerCity: 'Dhaka',
      totalBDT: 1450, paymentMethod: 'COD', storeSlug: 'qa-store', items: [],
    },
  });
  console.log('    provider:', res.json?.error || res.json?.success);
  await wait();

  const row = db.tables.courier_orders.find((r) => r.id === ORDER.toLowerCase());
  check('row exists in courier_orders', Boolean(row), db.tables.courier_orders.length);
  if (row) {
    check('store_slug saved', row.store_slug === 'qa-store', row.store_slug);
    check('customer_name saved', row.customer_name === 'QA Customer', row.customer_name);
    check('amount saved', Number(row.amount) === 1450, row.amount);
    check('payment_method saved', row.payment_method === 'COD', row.payment_method);
    check('courier_status saved', row.courier_status === 'failed', row.courier_status);
    check('error reason saved', String(row.courier_last_error || '').length > 0, row.courier_last_error);
  }

  console.log('\n[A2] GET /api/admin/courier-orders reads it');
  const list = await get('/api/admin/courier-orders?limit=20');
  const rows = Array.isArray(list.json?.orders) ? list.json.orders : [];
  check('list is not empty', rows.length >= 1, rows.length);
  const adminRow = rows.find((r) => String(r.id || r.order_number).toLowerCase() === ORDER.toLowerCase()) || {};
  check('admin row has store', adminRow.store_slug === 'qa-store', adminRow.store_slug);
  check('admin row has customer', adminRow.customerName === 'QA Customer', adminRow.customerName);
  check('admin row has amount', Number(adminRow.totalBDT) === 1450, adminRow.totalBDT);

  console.log('\n[A3] Retry upserts, no duplicate');
  await post('/api/courier/send', { courier: 'Steadfast Courier', storeSlug: 'qa-store', order: { invoice_id: ORDER, orderNumber: ORDER, id: ORDER } });
  await wait();
  check('still one row', db.tables.courier_orders.filter((r) => r.id === ORDER.toLowerCase()).length === 1);

  /* ── B. /api/stores/update ─────────────────────────────────────────── */
  console.log('\n[B1] Store update: no Mongo store_slug duplicate-key conflict');
  await client.db.collection('stores').createIndex({ store_slug: 1 }, { unique: true }).catch(() => null);
  await client.db.collection('stores').insertOne({ id: 's-1', store_slug: 'existing-store', email: 'a@x.com', store_name: 'A' });

  const upd = await post('/api/stores/update', {
    merchant: {
      id: 'MP-non-numeric-id',
      email: 'a@x.com',
      storeSlug: 'existing-store',
      store_name: 'A renamed',
      storeName: 'A renamed',
      is_cod_enabled: 'true',
    },
  });
  check('store update returns ok', upd.status === 200 && upd.json?.ok !== false, upd.json);
  const mongoRow = await client.db.collection('stores').findOne({ store_slug: 'existing-store' });
  check('name updated', mongoRow?.store_name === 'A renamed', mongoRow?.store_name);
  const dupCount = await client.db.collection('stores').countDocuments({ store_slug: 'existing-store' });
  check('no duplicate store document', dupCount === 1, dupCount);

  console.log('\n[B2] Store update: Supabase mirror sends no bigint-breaking id');
  await wait(1200);
  const sbCalls = db.log.filter((l) => l.table === 'stores' && (l.method === 'POST' || l.method === 'PATCH'));
  const sentId = sbCalls.find((c) => c.body && c.body.id !== undefined);
  check('no non-numeric id was sent', !sentId, sentId && sentId.body && sentId.body.id);
  const sbRow = db.tables.stores.find((r) => r.store_slug === 'existing-store');
  check('Supabase store row written', Boolean(sbRow), db.tables.stores.length);
  check('supabase store name updated', sbRow?.store_name === 'A renamed', sbRow?.store_name);
  const badCast = db.log.some((l) => l.table === 'stores' && l.body && l.body.id && !/^\d+$/.test(String(l.body.id)));
  check('no 22P02-risky payload attempted', !badCast);

  server.close();
  mock.close();
  await client.close();
  await mongod.stop();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
