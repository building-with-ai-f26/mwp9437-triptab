// Confirmed without a cost (C21, Mike's call 11/20, from his 11/19 review): a christening is
// Confirmed with no cost and shows a plain green check; a car rental is Confirmed before its price
// is known, keeps its estimate, and gets the green "$ ✓" once the real cost is added; a confirmed
// plan with no cost can go back to Planned, a paid one can't without undoing its cost. At 1280 and
// 390 wide, against TripTab dev (the migration is on dev).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const h = require('./helpers.cjs');

const card = (p, day, title) => p.locator(`#day-${day} .item-card`).filter({ hasText: title }).first();

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `confirmed-${label}`);

  // A christening: Confirmed, no cost.
  await h.addPlan(p, '2027-02-06', 'Add to morning', { title: 'Christening', status: 'Confirmed' });
  if (await h.dlg(p).count()) await h.dlg(p).getByRole('button', { name: 'Close' }).click();
  await card(p, '2027-02-06', 'Christening').getByTestId('badge-confirmed').waitFor();
  r.christening = (await card(p, '2027-02-06', 'Christening').innerText()).replace(/\s+/g, ' ');
  r.christeningNoDollar = (await card(p, '2027-02-06', 'Christening').getByTestId('badge-paid').count()) === 0;

  // It can go back to Planned, and to Confirmed again.
  await card(p, '2027-02-06', 'Christening').click();
  await h.dlg(p).getByRole('radio', { name: 'Planned' }).click();
  await h.dlg(p).getByRole('button', { name: 'Close' }).click();
  await card(p, '2027-02-06', 'Christening').getByTestId('badge-confirmed').waitFor({ state: 'detached' });
  r.backToPlanned = (await card(p, '2027-02-06', 'Christening').innerText()).includes('PLANNED');

  // A car rental: Confirmed before its price is known, with an estimate.
  await h.addPlan(p, '2027-02-05', 'Add to day', { title: 'Car rental pickup', kind: 'Transport', status: 'Confirmed', est: '45' });
  if (await h.dlg(p).count()) await h.dlg(p).getByRole('button', { name: 'Close' }).click();
  const car = card(p, '2027-02-05', 'Car rental pickup');
  await car.getByTestId('badge-confirmed').waitFor();
  r.carBefore = (await car.innerText()).replace(/\s+/g, ' ');
  await h.shot(p, `confirmed-no-cost-${label}`);

  // Add the real cost: $52, paid by you.
  await car.click();
  const d = h.dlg(p);
  r.statusOffered = await d.getByRole('group', { name: 'Status' }).getByRole('radio').allInnerTexts();
  await h.openCost(d);
  await d.getByRole('button', { name: 'Add the real cost' }).click();
  await d.getByLabel('What it cost').fill('52');
  await d.getByRole('radio', { name: 'Total' }).click();
  await d.getByRole('button', { name: 'Confirm and log' }).click();
  await car.getByTestId('badge-paid').waitFor();
  r.carAfter = (await car.innerText()).replace(/\s+/g, ' ');
  // Paid: the status is locked until the cost is undone.
  await car.click();
  await h.dlg(p).getByText('Confirmed and paid. Undo the confirmation to change its status.').waitFor();
  r.paidLocked = (await h.dlg(p).getByRole('group', { name: 'Status' }).count()) === 0;
  await h.dlg(p).getByRole('button', { name: 'Close' }).click();
  r.legend = (await p.getByText('Planned is solid').locator('..').innerText()).replace(/\s+/g, ' ');
  r.overflow = await h.overflowX(p);
  await h.shot(p, `confirmed-paid-${label}`);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok =
        r.christeningNoDollar && !/\$/.test(r.christening) && r.backToPlanned &&
        /~\$45/.test(r.carBefore) && r.statusOffered.join('|') === 'Suggested|Planned|Confirmed' &&
        /\$52/.test(r.carAfter) && !/~\$45/.test(r.carAfter) && r.paidLocked &&
        /Confirmed/.test(r.legend) && /Paid/.test(r.legend) && r.overflow <= 0;
      if (!ok) result.failure = `${label}: a check failed`;
    }
  } catch (e) {
    result.failure = String(e);
  } finally {
    result.errors = h.errors;
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    if (result.failure || result.errors.length) process.exit(1);
  }
})();
