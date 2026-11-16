// Live updates click-through: two people on the same trip, no refreshes. The owner adds a plan
// and Vic sees it appear; Vic opts out and the owner's card changes. Run with the dev server up:
//   node e2e/live-flow.cjs
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  const oCtx = await h.context(browser, h.DESKTOP);
  const o = h.watch(await oCtx.newPage(), 'owner');
  result.tripUrl = await h.startSkiTrip(o);

  await o.locator('section[aria-labelledby="people-title"]').getByRole('button', { name: 'Add', exact: true }).click();
  await h.dlg(o).getByLabel('Name').fill('Vic');
  await h.dlg(o).getByRole('radio', { name: 'Viewer' }).click();
  await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
  await h.dlg(o).getByText('Added Vic').waitFor();
  await h.dlg(o).getByRole('button', { name: 'Done' }).click();
  const groupUrl = (await o.locator('section[aria-labelledby="link-title"] code').textContent()).trim();

  const v = h.watch(await (await h.context(browser, h.PHONE)).newPage(), 'vic');
  await v.goto(groupUrl);
  await v.getByRole('button', { name: 'Vic' }).click();
  await h.signUp(v, 'Vic', 'vic');
  await v.getByRole('button', { name: 'Join the trip' }).click();
  await v.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await v.waitForTimeout(1500); // let the live channel connect

  // Owner adds a plan; Vic's screen updates by itself.
  const t0 = Date.now();
  await h.addPlan(o, '2027-02-06', 'Add to evening', { title: 'Fondue at La Caleche', kind: 'Meal', status: 'Planned' });
  await v.locator('#day-2027-02-06').getByText('Fondue at La Caleche').waitFor({ timeout: 15000 });
  result.vicSawPlanAfterMs = Date.now() - t0;

  // The owner's People list shows Vic joined, without a refresh.
  await o.locator('section[aria-labelledby="people-title"]').getByText('Joined').nth(1).waitFor({ timeout: 15000 });
  result.ownerSawVicJoin = true;

  // Vic opts out; the owner's card changes by itself.
  await v.locator('#day-2027-02-06').getByText('Fondue at La Caleche').click();
  const t1 = Date.now();
  await h.dlg(v).getByRole('radio', { name: "I'm out" }).click();
  await o.locator('#day-2027-02-06').getByText('1 of 2 in').waitFor({ timeout: 15000 });
  result.ownerSawOptOutAfterMs = Date.now() - t1;
  await v.locator('#day-2027-02-06').scrollIntoViewIfNeeded();

  await o.waitForTimeout(3000);
  result.errors = h.errors;
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('FLOW FAILED:', e.message.split('\n')[0]);
  console.error('errors so far:', h.errors);
  process.exit(1);
});
