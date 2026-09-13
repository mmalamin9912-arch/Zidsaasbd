export default async function run(page, ui) {
  // 1. Seed an authenticated session so /dashboard mounts.
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('zid_auth_session', JSON.stringify({
      userProfile: {
        id: '12345678-1234-1234-1234-123456789012',
        storeName: 'My Store',
        storeSlug: 'mystore',
        email: 'merchant@example.com',
        subscriptionPlan: 'free_trial',
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    }));
  });

  // 2. Stub GET /api/orders to return RAW Mongo documents — the exact payload
  //    that used to crash the dashboard (total_price, created_at, items string,
  //    plus one row with every date/amount field missing).
  await page.route('**/api/orders**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          _id: '66f0a1',
          store_id: '12345678-1234-1234-1234-123456789012',
          store_slug: 'mystore',
          merchant_id: '12345678-1234-1234-1234-123456789012',
          order_number: 'ORD-RAW-1',
          customer_name: 'Ada Lovelace',
          customer_phone: '01700000',
          customer_city: 'Dhaka',
          items: JSON.stringify([{ productName: 'Shirt', quantity: 2, unitPriceBDT: 499 }]),
          total_price: 998,
          payment_method: 'COD',
          payment_status: 'Unpaid',
          status: 'New',
          created_at: '2026-07-28T10:30:00.000Z',
        },
        {
          _id: '66f0a2',
          store_slug: 'mystore',
          order_number: 'ORD-RAW-2',
          customer_name: 'Grace Hopper',
          status: 'New',
        },
      ]),
    }),
  );

  // 3. Load the dashboard.
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // 4. Click through to the Orders tab if it is not already active.
  const snap = await ui.snapshot();
  const ordersTab = snap.match(/@(e\d+) [^\n]*"Orders"/)?.[1];
  if (ordersTab) {
    await ui.click(ordersTab).catch(() => {});
    await page.waitForTimeout(2500);
  }

  const text = await page.evaluate(() => document.body?.innerText || '');

  return {
    bodyChars: text.length,
    rootChildren: await page.evaluate(() => document.querySelector('#root')?.children.length ?? -1),
    mountedOrdersHeading: /order/i.test(text),
    showsRawOrder1: text.includes('ORD-RAW-1'),
    showsRawOrder2: text.includes('ORD-RAW-2'),
    showsFormattedTotal: /998/.test(text),
    showsDateFallback: text.includes('N/A'),
    hasCrashText: /Cannot read properties of undefined|toLocaleString/i.test(text),
    sample: text.slice(0, 750),
  };
}
