// Run with the dev server up (npm run dev): node e2e/span-flow.cjs
// Plans that span time (11/16), at 1280 and at 390 wide: skiing every day of a stop is ONE plan
// shown in each slot it covers, with one cost; a red-eye departs Friday evening and lands
// Saturday morning, on the day view and the week view.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const cards = (page, title) => page.locator('.item-card').filter({ hasText: title });
const inDay = (page, day, title) => page.locator(`#day-${day} .item-card`).filter({ hasText: title });
const flat = async (loc) => (await loc.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());

async function run(browser, label, opts, result) {
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  const r = (result[label] = {});
  await h.startSkiTrip(p, `span-${label}`);

  // 1. Skiing, morning to day, Sat 2/6 through Thu 2/11: one plan, twelve slots.
  await p.locator('#day-2027-02-06').getByRole('button', { name: 'Add to morning' }).click();
  await h.dlg(p).getByLabel('What').fill('Skiing');
  await h.dlg(p).getByRole('radio', { name: 'Planned' }).click();
  // Parts of the day are select all that apply (11/17): Morning is on, add Day.
  await h.dlg(p).getByRole('group', { name: 'Part of the day' }).getByRole('button', { name: 'Day', exact: true }).click();
  await h.dlg(p).getByLabel('Every day through').selectOption('2027-02-11');
  await h.dlg(p).getByRole('button', { name: /^Cost/ }).click();
  await h.dlg(p).getByLabel(/Estimated/).fill('84');
  await h.dlg(p).getByRole('radio', { name: 'Per person' }).click();
  await h.dlg(p).getByLabel('Every day through').scrollIntoViewIfNeeded();
  await h.shot(p, `span-activity-dialog-${label}`);
  await h.dlg(p).getByRole('button', { name: 'Add to trip' }).click();
  await inDay(p, '2027-02-11', 'Skiing').first().waitFor();
  r.skiSlots = await cards(p, 'Skiing').count();
  r.skiPricesShown = await cards(p, 'Skiing').filter({ hasText: '$84' }).count();
  r.skiFirstDay = await flat(inDay(p, '2027-02-06', 'Skiing'));
  r.skiLastDay = await flat(inDay(p, '2027-02-11', 'Skiing'));
  r.skiDayAfter = await inDay(p, '2027-02-12', 'Skiing').count();

  // 2. A red-eye: departs Fri 2/5 at 5:05 PM, lands Sat 2/6 at 7:10 AM.
  await p.locator('#day-2027-02-05').getByRole('button', { name: 'Add to evening' }).click();
  await h.dlg(p).getByLabel('What').fill('UA 57 Newark to Geneva');
  await h.dlg(p).getByRole('radio', { name: 'Flight' }).click();
  await h.dlg(p).getByLabel('Departs at (optional)').fill('17:05');
  await h.dlg(p).getByLabel('Lands at (optional)').fill('07:10');
  await h.dlg(p).getByLabel('Lands on').selectOption('2027-02-06');
  r.partsFollowTimes = [
    await h.dlg(p).getByRole('radio', { name: 'Evening' }).getAttribute('aria-checked'),
    await h.dlg(p).getByLabel('Lands in the').inputValue(),
  ];
  await h.dlg(p).getByLabel('Lands on').scrollIntoViewIfNeeded();
  await h.shot(p, `span-flight-dialog-${label}`);
  await h.dlg(p).getByRole('button', { name: 'Add to trip' }).click();
  await inDay(p, '2027-02-06', 'UA 57').waitFor();
  r.flightFri = await flat(inDay(p, '2027-02-05', 'UA 57'));
  // The red-eye's night: the flight sits in the stay row, and with the whole group on it (just the
  // owner here), there's no prompt for a bed (11/17 pod feedback).
  const friStay = p.locator('#day-2027-02-05 [data-testid="overnight"]');
  r.redEyeInStayRow = (await friStay.innerText()).replace(/\s+/g, ' ');
  r.noBedPromptFri = (await p.locator('#day-2027-02-05').getByRole('button', { name: /Add where everyone's staying|Add a stay for the others/ }).count()) === 0;
  r.bedPromptSat = (await p.locator('#day-2027-02-06').getByRole('button', { name: "Add where everyone's staying" }).count()) === 1;
  r.flightSat = await flat(inDay(p, '2027-02-06', 'UA 57'));
  await p.locator('#day-2027-02-05').scrollIntoViewIfNeeded();
  await p.evaluate(() => document.getElementById('day-2027-02-05').scrollIntoView({ block: 'start' }));
  await p.waitForTimeout(400);
  await h.shot(p, `span-days-${label}`);

  // 3. Opening any slot opens the one plan; a later slot is the same plan.
  await inDay(p, '2027-02-08', 'Skiing').last().click();
  r.openedFromALaterSlot = await h.dlg(p).getByLabel('What').inputValue();
  r.itKeptItsSpan = [
    (await h.dlg(p).getByRole('group', { name: 'Part of the day' }).getByRole('button', { pressed: true }).allInnerTexts()).join(' and '),
    await h.dlg(p).getByLabel('Every day through').inputValue(),
  ];
  // One cost for the whole plan: confirm it once.
  await h.dlg(p).getByRole('button', { name: 'Confirm with the real cost' }).click();
  await h.dlg(p).getByLabel('What it cost').fill('504');
  await h.dlg(p).getByRole('radio', { name: 'Total' }).click();
  await h.dlg(p).getByRole('button', { name: 'Confirm and log' }).click();
  await inDay(p, '2027-02-06', 'Skiing').first().locator('[title="Confirmed and paid"]').waitFor();
  r.confirmedBadges = await cards(p, 'Skiing').locator('[title="Confirmed and paid"]').count();
  r.pricesAfterConfirm = await cards(p, 'Skiing').filter({ hasText: '$504' }).count();
  if (label === 'phone') await p.getByRole('tab', { name: /Money/ }).click();
  r.money = (await p.locator('section[aria-labelledby="money-title"] p.text-xs').first().innerText()).replace(/\s+/g, ' ');
  if (label === 'phone') await p.getByRole('tab', { name: /Itinerary/ }).click();

  // 4. The week view shows the same spans.
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.getByRole('radio', { name: 'Week' }).click();
  const week = p.getByRole('region', { name: 'Week view' });
  await week.waitFor();
  r.weekSkiSlots = await week.locator('.item-card').filter({ hasText: 'Skiing' }).count();
  r.weekSkiPrices = await week.locator('.item-card').filter({ hasText: 'Skiing' }).filter({ hasText: '$504' }).count();
  r.weekFlight = await flat(week.locator('.item-card').filter({ hasText: 'UA 57' }));
  await week.scrollIntoViewIfNeeded();
  await h.shot(p, `span-week-${label}`);
  r.overflow = await h.overflowX(p);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  await run(browser, 'desktop', h.DESKTOP, result);
  await run(browser, 'phone', h.PHONE, result);
  result.errors = h.errors;
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  for (const r of [result.desktop, result.phone]) {
    const ok = /Overnight · Lands Sat 7:10 AM/i.test(r.redEyeInStayRow) && /Everyone's on it, so no stay needed tonight/.test(r.redEyeInStayRow) && r.noBedPromptFri && r.bedPromptSat;
    if (!ok || result.errors.length) process.exit(1);
  }
})().catch((e) => {
  console.error('FLOW FAILED:', e.message.split('\n').slice(0, 4).join(' | '));
  console.error('errors so far:', h.errors);
  process.exit(1);
});
