// Build 4 click-through (no AI pieces): the week view. Run with the dev server up:
//   node e2e/build4-flow.cjs
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};

  const ownerCtx = await h.context(browser, h.DESKTOP);
  const o = h.watch(await ownerCtx.newPage(), 'owner');
  result.tripUrl = await h.startSkiTrip(o);
  await h.addPlan(o, '2027-02-05', "Add where everyone's staying", { title: 'Chamonix Airbnb', checkout: '2027-02-12', status: 'Planned', est: '2400' });
  await h.addPlan(o, '2027-02-06', 'Add to morning', { title: 'Ski school', status: 'Planned', est: '90', perPerson: true });
  await h.addPlan(o, '2027-02-06', 'Add to evening', { title: 'Fondue at La Caleche', kind: 'Meal', est: '40', perPerson: true });
  await h.addPlan(o, '2027-02-08', 'Add to night', { title: 'Apres-ski at Chambre Neuf' });
  await h.addPlan(o, '2027-02-12', 'Add to day', { title: 'Train to Barcelona', kind: 'Transport', status: 'Planned' });

  // Week view: seven days side by side.
  await o.getByRole('radio', { name: 'Week' }).click();
  const week = o.getByRole('region', { name: 'Week view' });
  await week.getByText('Week 1 of 2').waitFor();
  result.week1Plans = await week.locator('.item-card').count();
  await h.shot(o, 'week-view-desktop');

  // Add from an empty cell in the week view.
  await week.getByRole('button', { name: 'Add to morning on Sun 2/7' }).click();
  await h.dlg(o).getByLabel('What').fill('Aiguille du Midi cable car');
  await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
  await week.getByText('Aiguille du Midi cable car').waitFor();

  await week.getByRole('button', { name: 'Next week' }).click();
  await week.getByText('Week 2 of 2').waitFor();
  result.week2HasTrain = await week.getByText('Train to Barcelona').count();

  // Phone: the grid scrolls inside its card; the page itself doesn't scroll sideways.
  const pCtx = await h.context(browser, { ...h.PHONE, storageState: await ownerCtx.storageState() });
  const p = h.watch(await pCtx.newPage(), 'owner-phone');
  await p.goto(result.tripUrl);
  await p.getByRole('radio', { name: 'Week' }).click();
  await p.getByRole('region', { name: 'Week view' }).getByText('Week 1 of 2').waitFor();
  await p.waitForTimeout(500);
  result.phoneOverflow = await h.overflowX(p);
  await h.shot(p, 'week-view-phone');

  await o.waitForTimeout(5000);
  result.errors = h.errors;
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('FLOW FAILED:', e.message.split('\n')[0]);
  console.error('errors so far:', h.errors);
  process.exit(1);
});
