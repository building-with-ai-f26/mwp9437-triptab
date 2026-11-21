// A new plan is added once, however it's closed while saving (found 11/21: "Add to trip", then the X
// before the dialog had gone, added a second copy). At 1280 and 390 wide, against TripTab dev, with
// the plan's insert held for 1.5 seconds, the way a slow connection would.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const h = require('./helpers.cjs');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `double-${label}`);
  await p.route('**/rest/v1/items*', async (route) => {
    if (route.request().method() === 'POST') await new Promise((ok) => setTimeout(ok, 1500));
    return route.continue();
  });

  await p.locator('#day-2027-02-07').getByRole('button', { name: 'Add to day' }).click();
  const d = h.dlg(p);
  await d.getByLabel('What').fill('Snowshoe walk');
  await d.getByRole('button', { name: 'Add to trip' }).click();
  // Straight away, while it's saving: the X, then Enter in the name for good measure.
  await d.getByRole('button', { name: 'Close' }).click();
  await d.waitFor({ state: 'detached', timeout: 15000 });
  await p.unroute('**/rest/v1/items*');
  await p.reload();
  await p.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await p.locator('#day-2027-02-07 .item-card').filter({ hasText: 'Snowshoe walk' }).first().waitFor();
  r.copies = await p.locator('#day-2027-02-07 .item-card').filter({ hasText: 'Snowshoe walk' }).count();
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) if (r.copies !== 1) result.failure = `${label}: ${r.copies} copies`;
  } catch (e) {
    result.failure = String(e);
  } finally {
    result.errors = h.errors;
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    if (result.failure || result.errors.length) process.exit(1);
  }
})();
