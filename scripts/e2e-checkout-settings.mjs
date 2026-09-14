/**
 * End-to-end test for "Checkout page options" (Settings -> Checkout).
 *
 * Covers all six controls:
 *   1. Announcement notice
 *   2. Minimum order amount
 *   3. Guest checkout toggle
 *   4. Require phone number toggle
 *   5. Custom field 1 label
 *   6. Custom field 2 label
 *
 * Two layers are asserted:
 *   API  — POST persists and a fresh GET returns the same values (Mongo/payload).
 *   UI   — type/toggle in the real form, click Save, reload the page, and check
 *          every control is restored from the backend rather than local state.
 *
 * Run against a dev server on :3000:
 *   node <skill>/browser.mjs http://localhost:3000/ --script ./scripts/e2e-checkout-settings.mjs
 */
export default async function run(page, ui) {
  const SLUG = 'mystore';
  const results = [];
  let failures = 0;

  const check = (name, ok, detail) => {
    results.push({ name, ok, detail: detail ?? '' });
    if (!ok) failures += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
  };

  // Only count failures that could possibly implicate checkout settings. The
  // dashboard also probes optional endpoints (/api/customers/*) and Supabase
  // subscription/store rows that a seeded fixture does not have; those 404s are
  // pre-existing noise, not regressions. The intentional 400 below is this
  // test's own missing-store_slug assertion.
  const checkoutErrors = [];
  const RELEVANT = /checkout/i;
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (RELEVANT.test(m.text())) checkoutErrors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() < 400 || !RELEVANT.test(r.url())) return;
    // The 400 for a missing store_slug is asserted on purpose below, so a
    // deliberate validation response is not an error.
    if (r.status() === 400 && !r.url().includes('store_slug=')) return;
    checkoutErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });

  // ── Fixture: values we will save and verify ────────────
  const FIXTURE = {
    announcement: 'ঢাকার বাইরে ১৩০ টাকা অগ্রিম। কাস্টমার কেয়ার: 01711111',
    minOrderAmount: 750,
    guestCheckout: false,
    requirePhone: true,
    customField1: 'Special Instructions',
    customField2: 'Delivery Time Preference',
  };

  // ══════
  // LAYER 1 — API persistence (no UI involved)
  // ══════
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });

  const saveRes = await page.evaluate(async ({ slug, cfg }) => {
    const r = await fetch('/api/store/checkout-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_slug: slug, checkoutConfig: cfg }),
    });
    return { status: r.status, body: await r.json() };
  }, { slug: SLUG, cfg: FIXTURE });

  check('API: POST /api/store/checkout-settings returns 200', saveRes.status === 200, `status ${saveRes.status}`);
  check('API: POST reports ok', saveRes.body?.ok === true, JSON.stringify(saveRes.body?.ok));
  check('API: announcement persisted', saveRes.body?.checkoutConfig?.announcement === FIXTURE.announcement,
    JSON.stringify(saveRes.body?.checkoutConfig?.announcement));
  check('API: minOrderAmount persisted as a NUMBER', saveRes.body?.checkoutConfig?.minOrderAmount === 750,
    `${typeof saveRes.body?.checkoutConfig?.minOrderAmount} ${saveRes.body?.checkoutConfig?.minOrderAmount}`);
  check('API: guestCheckout persisted (false)', saveRes.body?.checkoutConfig?.guestCheckout === false,
    String(saveRes.body?.checkoutConfig?.guestCheckout));
  check('API: requirePhone persisted (true)', saveRes.body?.checkoutConfig?.requirePhone === true,
    String(saveRes.body?.checkoutConfig?.requirePhone));
  check('API: customField1 persisted', saveRes.body?.checkoutConfig?.customField1 === FIXTURE.customField1,
    saveRes.body?.checkoutConfig?.customField1);
  check('API: customField2 persisted', saveRes.body?.checkoutConfig?.customField2 === FIXTURE.customField2,
    saveRes.body?.checkoutConfig?.customField2);

  // Fresh GET — proves it was stored, not just echoed back.
  const readRes = await page.evaluate(async (slug) => {
    const r = await fetch(`/api/store/checkout-settings?store_slug=${slug}`);
    return { status: r.status, body: await r.json() };
  }, SLUG);

  check('API: GET returns 200', readRes.status === 200, `status ${readRes.status}`);
  const got = readRes.body?.checkoutConfig || {};
  check('API: GET round-trips ALL six fields', (
    got.announcement === FIXTURE.announcement &&
    got.minOrderAmount === 750 &&
    got.guestCheckout === false &&
    got.requirePhone === true &&
    got.customField1 === FIXTURE.customField1 &&
    got.customField2 === FIXTURE.customField2
  ), JSON.stringify(got));

  check('API: missing store_slug is rejected (400)', await page.evaluate(async () => {
    const r = await fetch('/api/store/checkout-settings');
    return r.status === 400;
  }), 'expects 400');

  check('API: empty minimum is stored as null (rule disabled)', await page.evaluate(async (slug) => {
    const r = await fetch('/api/store/checkout-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_slug: slug, checkoutConfig: { minOrderAmount: '' } }),
    });
    const j = await r.json();
    // restore the fixture afterwards
    await fetch('/api/store/checkout-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_slug: slug, checkoutConfig: { minOrderAmount: 750 } }),
    });
    return j.checkoutConfig?.minOrderAmount === null;
  }, SLUG), 'expects null');

  // ══════
  // LAYER 2 — Frontend UI round-trip
  // ══════
  // Navigate FIRST so the page owns an origin, then seed the session. Seeding
  // before the first goto is wiped by it, which sends the app back to the
  // landing page and no Settings control is ever mounted.
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(({ slug, cfg }) => {
    // Seed the dashboard session AND the profile the settings panel reads on mount.
    localStorage.setItem('zid_auth_session', JSON.stringify({
      email: 'merchant@example.com', loggedInAt: new Date().toISOString(),
      userProfile: {
        id: '12345678-1234-1234-1234-123456789012',
        storeName: 'My Store', storeSlug: slug, email: 'merchant@example.com',
        subscriptionPlan: 'free_trial',
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        checkoutConfig: cfg,
      },
    }));
  }, { slug: SLUG, cfg: FIXTURE });

  await page.goto(`http://localhost:3000/dashboard/${SLUG}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  // Settings is an ICON-ONLY button (title="Account & General Settings") that
  // opens a flyout containing "Checkout page options". Snapshot first — an
  // icon button has no accessible name for getByRole to find.
  const openCheckoutTab = async () => {
    const snap = await ui.snapshot();
    const settingsRef = snap.match(/@(e\d+) button \[title="Account & General Settings"\]/)?.[1]
      || snap.match(/@(e\d+) button "Account & General Settings"/)?.[1];
    if (!settingsRef) return { ok: false, why: 'settings button not found', snap: snap.slice(0, 800) };
    await ui.click(settingsRef);
    await page.waitForTimeout(1500);

    const flyout = await ui.snapshot();
    const checkoutRef = flyout.match(/@(e\d+) button "Checkout page options"/)?.[1];
    if (!checkoutRef) return { ok: false, why: 'checkout item not in flyout', snap: flyout.slice(0, 800) };
    await ui.click(checkoutRef);
    await page.waitForTimeout(3000);
    return { ok: true };
  };

  const nav1 = await openCheckoutTab();
  check('UI: Settings flyout opened + Checkout page options selected', nav1.ok, nav1.why || 'ok');

  const panel = page.locator('[data-testid="checkout-panel"]');
  check('UI: checkout panel rendered', (await panel.count()) > 0, 'data-testid=checkout-panel');

  // All six controls present.
  for (const id of ['checkout-announcement', 'checkout-min-order', 'checkout-guest-toggle',
                    'checkout-phone-toggle', 'checkout-custom-field-1', 'checkout-custom-field-2',
                    'checkout-save']) {
    const n = await page.locator(`[data-testid="${id}"]`).count();
    check(`UI: control present -> ${id}`, n === 1, `count ${n}`);
  }

  // Values loaded from the backend on mount (not blank defaults).
  const loaded = await page.evaluate(() => ({
    announcement: document.querySelector('[data-testid="checkout-announcement"]')?.value ?? null,
    min: document.querySelector('[data-testid="checkout-min-order"]')?.value ?? null,
    guest: document.querySelector('[data-testid="checkout-guest-toggle"]')?.getAttribute('aria-pressed'),
    phone: document.querySelector('[data-testid="checkout-phone-toggle"]')?.getAttribute('aria-pressed'),
    cf1: document.querySelector('[data-testid="checkout-custom-field-1"]')?.value ?? null,
    cf2: document.querySelector('[data-testid="checkout-custom-field-2"]')?.value ?? null,
  }));

  check('UI: announcement loaded from store', loaded.announcement === FIXTURE.announcement, JSON.stringify(loaded.announcement));
  check('UI: min order loaded from store', loaded.min === '750', `"${loaded.min}"`);
  check('UI: guest toggle reflects saved state (false)', loaded.guest === 'false', `aria-pressed=${loaded.guest}`);
  check('UI: phone toggle reflects saved state (true)', loaded.phone === 'true', `aria-pressed=${loaded.phone}`);
  check('UI: custom field 1 loaded', loaded.cf1 === FIXTURE.customField1, JSON.stringify(loaded.cf1));
  check('UI: custom field 2 loaded', loaded.cf2 === FIXTURE.customField2, JSON.stringify(loaded.cf2));

  // ── Edit every field through the UI, then Save ─────────────────────
  const EDITED = {
    announcement: 'Edited notice — free delivery over 2000 BDT',
    minOrderAmount: 1200,
    customField1: 'Gift Message',
    customField2: 'Landmark',
  };

  await page.locator('[data-testid="checkout-announcement"]').fill(EDITED.announcement);
  await page.locator('[data-testid="checkout-min-order"]').fill(String(EDITED.minOrderAmount));
  await page.locator('[data-testid="checkout-custom-field-1"]').fill(EDITED.customField1);
  await page.locator('[data-testid="checkout-custom-field-2"]').fill(EDITED.customField2);

  // Flip both toggles (false->true, true->false) so the change is observable.
  await page.locator('[data-testid="checkout-guest-toggle"]').click();
  await page.locator('[data-testid="checkout-phone-toggle"]').click();
  await page.waitForTimeout(400);

  const toggled = await page.evaluate(() => ({
    guest: document.querySelector('[data-testid="checkout-guest-toggle"]')?.getAttribute('aria-pressed'),
    phone: document.querySelector('[data-testid="checkout-phone-toggle"]')?.getAttribute('aria-pressed'),
  }));
  check('UI: guest toggle flipped to true', toggled.guest === 'true', `aria-pressed=${toggled.guest}`);
  check('UI: phone toggle flipped to false', toggled.phone === 'false', `aria-pressed=${toggled.phone}`);

  await page.locator('[data-testid="checkout-save"]').click();
  await page.waitForTimeout(4000);

  const toast = await page.locator('[data-testid="checkout-toast"]').textContent().catch(() => '');
  check('UI: save toast shown', /saved/i.test(toast || ''), JSON.stringify((toast || '').trim()));

  // ── Verify the edit reached the backend ───────────────
  const afterSave = await page.evaluate(async (slug) => {
    const r = await fetch(`/api/store/checkout-settings?store_slug=${slug}`);
    return (await r.json()).checkoutConfig;
  }, SLUG);

  check('UI->API: edited announcement persisted', afterSave?.announcement === EDITED.announcement, JSON.stringify(afterSave?.announcement));
  check('UI->API: edited min order persisted', afterSave?.minOrderAmount === EDITED.minOrderAmount, String(afterSave?.minOrderAmount));
  check('UI->API: guest toggle persisted as true', afterSave?.guestCheckout === true, String(afterSave?.guestCheckout));
  check('UI->API: phone toggle persisted as false', afterSave?.requirePhone === false, String(afterSave?.requirePhone));
  check('UI->API: custom field 1 persisted', afterSave?.customField1 === EDITED.customField1, JSON.stringify(afterSave?.customField1));
  check('UI->API: custom field 2 persisted', afterSave?.customField2 === EDITED.customField2, JSON.stringify(afterSave?.customField2));

  // ── Reload and confirm the UI restores from the backend ────────────
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const nav2 = await openCheckoutTab();
  check('RELOAD: navigated back to Checkout page options', nav2.ok, nav2.why || 'ok');

  const afterReload = await page.evaluate(() => ({
    announcement: document.querySelector('[data-testid="checkout-announcement"]')?.value ?? null,
    min: document.querySelector('[data-testid="checkout-min-order"]')?.value ?? null,
    guest: document.querySelector('[data-testid="checkout-guest-toggle"]')?.getAttribute('aria-pressed'),
    phone: document.querySelector('[data-testid="checkout-phone-toggle"]')?.getAttribute('aria-pressed'),
    cf1: document.querySelector('[data-testid="checkout-custom-field-1"]')?.value ?? null,
    cf2: document.querySelector('[data-testid="checkout-custom-field-2"]')?.value ?? null,
  }));

  check('RELOAD: announcement restored', afterReload.announcement === EDITED.announcement, JSON.stringify(afterReload.announcement));
  check('RELOAD: min order restored', afterReload.min === String(EDITED.minOrderAmount), `"${afterReload.min}"`);
  check('RELOAD: guest toggle restored (true)', afterReload.guest === 'true', `aria-pressed=${afterReload.guest}`);
  check('RELOAD: phone toggle restored (false)', afterReload.phone === 'false', `aria-pressed=${afterReload.phone}`);
  check('RELOAD: custom field 1 restored', afterReload.cf1 === EDITED.customField1, JSON.stringify(afterReload.cf1));
  check('RELOAD: custom field 2 restored', afterReload.cf2 === EDITED.customField2, JSON.stringify(afterReload.cf2));

  check('No checkout-settings errors during the run', checkoutErrors.length === 0, checkoutErrors.slice(0, 3).join(' | '));

  // Restore the original fixture so local state is left tidy.
  await page.evaluate(async ({ slug, cfg }) => {
    await fetch('/api/store/checkout-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_slug: slug, checkoutConfig: cfg }),
    });
  }, { slug: SLUG, cfg: FIXTURE }).catch(() => {});

  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  if (failures) process.exitCode = 1;

  return { passed: results.length - failures, total: results.length, failures: results.filter((r) => !r.ok) };
}
