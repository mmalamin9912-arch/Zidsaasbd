import express from 'express';
import app from './server';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) { console.log('NO_URI'); process.exit(0); }

// fresh express app that mounts the real server's routes
const probe = express();
probe.use(express.json());
probe.use((req, _res, next) => next());
probe.use(app);

const listener = probe.listen(4321, async () => {
  await new Promise(r => setTimeout(r, 500));
  const res = await fetch('http://127.0.0.1:4321/api/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ storeCode: 'probe-store', orderNumber: 'PROBE-1', customerName: 'Probe', totalBDT: 1 }]),
  });
  console.log('STATUS', res.status, await res.text());

  const c = new MongoClient(uri);
  await c.connect();
  const dbs = (await c.db().admin().listDatabases()).databases.map(d => d.name);
  console.log('DATABASES', dbs.join(' | '));
  const cnt = await c.db('zidbdsaas').collection('orders').countDocuments();
  console.log('zidbdsaas.orders count =', cnt);
  await c.close();
  listener.close();
  process.exit(0);
});
