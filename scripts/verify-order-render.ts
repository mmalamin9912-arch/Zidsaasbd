/**
 * Reproduces the reported crash: raw MongoDB order rows (total_price,
 * created_at, items as a JSON string) fed straight to the dashboard used to
 * throw "Cannot read properties of undefined (reading 'toLocaleString')".
 *
 * This asserts that:
 *   1. normalization produces renderable values for every field the UI formats
 *   2. the OLD unguarded render path WOULD have thrown (regression proof)
 *   3. the NEW safe render helpers never throw, even for entirely empty rows
 */
import { normalizeOrders, normalizeOrder, safeAmount, safeDate, toNumber } from '../src/utils/orderUtils';

let failures = 0;
function check(name, fn) {
  try {
    const result = fn();
    if (result === true) {
      console.log(`PASS  ${name}`);
    } else {
      console.log(`FAIL  ${name} -> ${result}`);
      failures++;
    }
  } catch (err) {
    console.log(`FAIL  ${name} -> threw: ${err.message}`);
    failures++;
  }
}

// A realistic raw Mongo document, exactly as GET /api/orders returns it.
const rawMongoRow = {
  _id: '66f0',
  store_id: '12345678-1234-1234-1234-123456789012',
  store_slug: 'mystore',
  merchant_id: 'merchant-1',
  order_number: 'ORD-1',
  customer_name: 'Ada',
  items: JSON.stringify([{ productName: 'Shirt', quantity: 2, unitPriceBDT: 499 }]),
  total_price: 998,
  status: 'New',
  created_at: '2026-07-28T10:30:00.000Z', // Mongo returns a Date -> serialized string over HTTP
};

// 1. The OLD path (unguarded .toLocaleString on a Mongo field) would crash.
check('old unguarded path throws on raw Mongo rows', () => {
  try {
    // This is what the table used to do: ord.totalBDT is undefined for Mongo rows.
    // Typed `any` on purpose — accessing a field the UI type does not declare is
    // exactly the mistake this test reproduces.
    const ord: any = rawMongoRow;
    void ord.totalBDT.toLocaleString();
    return 'expected it to throw but it did not';
  } catch (err) {
    return /toLocaleString/.test(err.message) ? true : `wrong error: ${err.message}`;
  }
});

// 2. Normalization makes every rendered field safe.
check('normalizeOrders maps Mongo row into UI shape', () => {
  const [ord] = normalizeOrders([rawMongoRow]);
  if (!Array.isArray(ord.items) || ord.items.length !== 1) return 'items not parsed into an array';
  if (ord.items[0].productName !== 'Shirt') return 'item name lost';
  if (ord.items[0].unitPriceBDT !== 499) return 'item unit price lost';
  if (ord.totalBDT !== 998) return `totalBDT not mapped: ${ord.totalBDT}`;
  if (typeof ord.createdAt !== 'string' || !ord.createdAt) return 'createdAt not normalized to a string';
  return true;
});

// 3. The NEW render path is safe on a normalized row.
check('safe renderers do not throw on a normalized row', () => {
  const [ord] = normalizeOrders([rawMongoRow]);
  void safeAmount(ord?.totalBDT);
  void safeDate(ord?.createdAt);
  for (const it of ord.items) {
    void safeAmount(it?.unitPriceBDT);
    void safeAmount(toNumber(it?.unitPriceBDT) * toNumber(it?.quantity, 0));
  }
  return true;
});

// 4. The reported failure mode: rows with MISSING date + amount fields.
check('missing date/amount fields render as safe fallbacks', () => {
  const [ord] = normalizeOrders([{ order_number: 'ORD-2' }]);
  if (safeAmount(ord?.totalBDT) !== '0') return `expected "0", got "${safeAmount(ord?.totalBDT)}"`;
  if (safeDate(ord?.createdAt) === 'N/A' && ord.createdAt === 'N/A') return 'createdAt placeholder leaked as N/A';
  if (!ord.createdAt || ord.createdAt === 'N/A') return `createdAt not defaulted: ${ord.createdAt}`;
  return true;
});

// 5. Non-numeric / garbage amounts must not produce NaN in the UI.
check('garbage amounts coerce to 0, never NaN', () => {
  const [ord] = normalizeOrders([{ total_price: 'abc', items: 'not-json' }]);
  if (safeAmount(ord?.totalBDT) !== '0') return `NaN leaked: ${safeAmount(ord?.totalBDT)}`;
  if (!Array.isArray(ord.items)) return 'items not an array';
  return true;
});

// 6. Fully empty / null-ish payloads must render without throwing.
check('empty rows and null payloads are safe', () => {
  void normalizeOrder(undefined);
  void normalizeOrder(null);
  normalizeOrders(null);
  normalizeOrders(undefined);
  normalizeOrders('not-an-array');
  void safeAmount(undefined);
  void safeDate(null);
  void safeDate('not-a-date');
  void safeAmount('not-a-number');
  return true;
});

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
