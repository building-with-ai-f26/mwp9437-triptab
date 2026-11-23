// Trip settings click-through: rename, change stops (refused when a plan would fall outside the
// new dates), then delete the trip. Run with the dev server up: node e2e/settings-flow.cjs
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  const ctx = await h.context(browser, h.DESKTOP);
  const o = h.watch(await ctx.newPage(), 'owner');
  result.tripUrl = await h.startSkiTrip(o);
  await h.addPlan(o, '2027-02-15', 'Add to day', { title: 'Last ski day in Andorra', status: 'Planned' });

  await o.getByRole('button', { name: 'Stops and dates' }).click();
  const d = h.dlg(o);
  await d.getByLabel('Trip name').fill('Euro ski trip 2027');
  // Ending Andorra on 2/14 would strand the 2/15 plan: refused.
  await d.getByLabel('Stop 3 to').fill('2027-02-14');
  await d.getByRole('button', { name: 'Save' }).click();
  await d.getByText(/fall outside the new dates/).waitFor();
  result.refusalNamesPlan = (await d.getByText(/fall outside the new dates/).innerText()).includes('(');
  result.refused = true;
  // Ending on 2/17 instead works.
  await d.getByLabel('Stop 3 to').fill('2027-02-17');
  await h.shot(o, 'trip-settings-desktop');
  await d.getByRole('button', { name: 'Save' }).click();
  await o.getByRole('heading', { name: 'Euro ski trip 2027' }).waitFor();
  result.subtitle = await o.locator('header p').first().innerText();
  result.days = await o.locator('section[id^="day-"]').count();

  // Phone view of the dialog.
  const p = h.watch(await (await h.context(browser, { ...h.PHONE, storageState: await ctx.storageState() })).newPage(), 'phone');
  await p.goto(result.tripUrl);
  await p.getByRole('button', { name: 'Stops and dates' }).click();
  await h.dlg(p).getByLabel('Trip name').waitFor();
  result.phoneOverflow = await h.overflowX(p);
  await h.shot(p, 'trip-settings-phone');

  // Delete the trip.
  o.once('dialog', (dlg) => dlg.accept());
  await o.getByRole('button', { name: 'Stops and dates' }).click();
  await h.dlg(o).getByRole('button', { name: 'Delete trip' }).click();
  await o.waitForURL(/\/trips$/);
  await o.getByText('No trips yet').waitFor();
  result.deleted = true;

  await o.waitForTimeout(3000);
  result.errors = h.errors;
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('FLOW FAILED:', e.message.split('\n')[0]);
  console.error('errors so far:', h.errors);
  process.exit(1);
});
