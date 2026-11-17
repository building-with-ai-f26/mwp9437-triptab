// A rehearsal of the two-minute demo's live minute (runbook, Two-minute demo), at 1280 wide:
// a Suggested plan shows dotted, confirming the fondue at $120 turns it solid with the green $ check,
// Money shows who owes what and Settle up the fewest payments.
//   E2E_BASE='https://building-with-ai-f26.github.io/mwp9437-triptab/app/#' node e2e/demo-rehearsal.cjs
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const o = h.watch(await (await h.context(browser, h.DESKTOP)).newPage(), 'mike');
  const r = {};
  await h.startSkiTrip(o, 'demo-mike');
  await h.addPlan(o, '2027-02-06', 'Add to evening', { title: 'Fondue at La Caleche', kind: 'Meal', status: 'Planned', est: '40', perPerson: true });
  await o.locator('section[aria-labelledby="people-title"]').getByRole('button', { name: 'Add', exact: true }).click();
  const d = h.dlg(o);
  for (const name of ['Vic', 'Priya']) {
    await d.getByLabel('Name').fill(name);
    await d.getByRole('button', { name: 'Add to trip' }).click();
    await d.getByText(new RegExp(`Added .*${name}`)).waitFor();
  }
  await d.getByRole('button', { name: 'Done' }).click();
  // Live (60 sec)
  await h.addPlan(o, '2027-02-06', 'Add to morning', { title: 'Ski school', status: 'Suggested' });
  r.skiSchoolStatus = await o.locator('#day-2027-02-06 .item-card').filter({ hasText: 'Ski school' }).getAttribute('data-status');
  await o.locator('#day-2027-02-06 .item-card').filter({ hasText: 'Fondue' }).click();
  await h.dlg(o).getByRole('button', { name: 'Confirm with the real cost' }).click();
  await h.dlg(o).getByLabel('What it cost').fill('120');
  await h.dlg(o).getByRole('radio', { name: 'Total' }).click();
  await h.dlg(o).getByRole('button', { name: 'Confirm and log' }).click();
  const fondue = o.locator('#day-2027-02-06 .item-card').filter({ hasText: 'Fondue' });
  await fondue.locator('[title="Confirmed and paid"]').waitFor();
  r.fondueCard = (await fondue.innerText()).replace(/\s+/g, ' ');
  await o.locator('#day-2027-02-06').scrollIntoViewIfNeeded();
  await h.shot(o, 'demo-live-desktop');
  r.money = (await o.locator('section[aria-labelledby="money-title"]').first().innerText()).replace(/\s+/g, ' ').slice(0, 220);
  await o.getByRole('button', { name: 'Settle up' }).click();
  r.settleUp = (await h.dlg(o).innerText()).replace(/\s+/g, ' ').slice(0, 220);
  r.overflow = await h.overflowX(o);
  r.errors = h.errors;
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('REHEARSAL FAILED:', e.message.split('\n').slice(0, 4).join(' | '));
  console.error('errors so far:', h.errors);
  process.exit(1);
});
