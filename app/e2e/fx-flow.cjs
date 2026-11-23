// A cost in another currency typed by hand (C33, Mike's call 11/21), at 1280 and 390 wide, against
// TripTab dev with the day's rate canned (1 EUR or GBP = $1.099):
// - Add a plan, "Yes, log it now", EUR 6,947.50 for the chalet: split in dollars at the rate, an
//   estimate pending, and a to-do for whoever paid; Settle up shows it; entering the card's charge
//   settles it.
// - Confirming a dinner in GBP, then keeping the estimate.
// - An estimate in EUR on a new plan: dollars on the plan, the euro amount in its notes.
// Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await p.route('**/api.frankfurter.dev/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ amount: 1, base: 'EUR', date: '2026-11-20', rates: { USD: 1.099 } }) }),
  );
  await h.startSkiTrip(p, `fx-${label}`);

  // The chalet, paid in euros.
  await p.locator('#day-2027-02-05').getByRole('button', { name: "Add where everyone's staying" }).click();
  const d = h.dlg(p);
  await d.getByLabel('What').fill('Chalet');
  await d.getByLabel('Check out').selectOption('2027-02-12');
  await h.openCost(d);
  await d.getByRole('radio', { name: 'Yes, log it now' }).click();
  await d.getByLabel('What it cost in total').fill('6947.50');
  await d.getByLabel('Currency', { exact: true }).selectOption('EUR');
  r.about = (await d.getByTestId('fx-about').innerText()).replace(/\s+/g, ' ').trim();
  await h.shot(p, `fx-paid-now-${label}`);
  await d.getByRole('button', { name: 'Add to trip' }).click();
  await d.waitFor({ state: 'detached' });

  if (label === 'phone') await p.getByRole('tab', { name: 'To do' }).click();
  const todo = p.locator('section[aria-labelledby="actions-title"]');
  await todo.getByText(/Check what your card was charged for Chalet/).waitFor();
  r.todo = (await todo.getByText(/Check what your card was charged for Chalet/).innerText()).trim();

  if (label === 'phone') await p.getByRole('tab', { name: 'Money' }).click();
  const fx = p.getByTestId('fx-pending').first();
  await fx.waitFor();
  r.pending = (await fx.innerText()).replace(/\s+/g, ' ').trim();
  await h.shot(p, `fx-pending-${label}`);
  await fx.getByLabel('What the card charged for Chalet').fill('7700');
  await fx.getByRole('button', { name: 'Save' }).click();
  await p.getByTestId('fx-pending').first().waitFor({ state: 'detached' });
  r.spend = (await p.getByText(/^Trip spend /).first().innerText()).trim();

  // A dinner confirmed in pounds, then the estimate kept.
  if (label === 'phone') await p.getByRole('tab', { name: /Itinerary/ }).click();
  await h.addPlan(p, '2027-02-06', 'Add to evening', { title: 'Dinner at the Tap', est: '100' });
  if (await h.dlg(p).count()) await h.dlg(p).getByRole('button', { name: 'Close' }).click();
  await p.locator('#day-2027-02-06').getByText('Dinner at the Tap').first().click();
  await h.openCost(h.dlg(p));
  await h.dlg(p).getByRole('button', { name: 'Confirm with the real cost' }).click();
  const c = h.dlg(p);
  await c.getByLabel('What it cost').fill('80');
  await c.getByLabel('Currency', { exact: true }).selectOption('GBP');
  await c.getByRole('radio', { name: 'Total' }).click();
  r.confirmAbout = (await c.getByTestId('fx-about').innerText()).replace(/\s+/g, ' ').trim();
  await c.getByRole('button', { name: 'Confirm and log' }).click();
  await c.waitFor({ state: 'detached' });
  if (label === 'phone') await p.getByRole('tab', { name: 'Money' }).click();
  const fx2 = p.getByTestId('fx-pending').first();
  await fx2.getByText(/GBP 80\.00, about \$87\.92/).waitFor();
  await fx2.getByRole('button', { name: 'Keep the estimate' }).click();
  await p.getByTestId('fx-pending').first().waitFor({ state: 'detached' });
  r.kept = true;

  // An estimate in euros on a new plan.
  if (label === 'phone') await p.getByRole('tab', { name: /Itinerary/ }).click();
  await h.showDay(p, '2027-02-07');
  await p.locator('#day-2027-02-07').getByRole('button', { name: 'Add to morning' }).click();
  const e = h.dlg(p);
  await e.getByLabel('What').fill('Ski school');
  await h.openCost(e);
  await e.getByLabel(/Estimated/).fill('300');
  await e.getByLabel('Estimate currency').selectOption('EUR');
  r.estAbout = (await e.getByTestId('fx-est-about').innerText()).trim();
  await e.getByRole('button', { name: 'Add to trip' }).click();
  await e.waitFor({ state: 'detached' });
  await p.locator('#day-2027-02-07').getByText('Ski school').first().click();
  r.estNotes = await h.dlg(p).getByLabel('Notes (optional)').inputValue();
  r.overflow = await h.overflowX(p);
  await h.dlg(p).getByRole('button', { name: 'Done' }).click();
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok =
        /EUR 6,947\.50 is about \$7,635\.30 at today's rate \(1\.099/.test(r.about) &&
        /Check what your card was charged for Chalet \(EUR 6,947\.50, about \$7,635\.30\)/.test(r.todo) &&
        /Chalet: EUR 6,947\.50, about \$7,635\.30 at the day's rate\. Enter what your card charged/.test(r.pending) &&
        /Trip spend \$7,700/.test(r.spend) && /GBP 80\.00 is about \$87\.92/.test(r.confirmAbout) && r.kept &&
        /About \$329\.70 at today's rate/.test(r.estAbout) && /Priced EUR 300\.00: about \$329\.70 at 1\.099/.test(r.estNotes) &&
        r.overflow <= 0;
      if (!ok) result.failure = `${label}: a check failed`;
    }
  } catch (err) {
    result.failure = String(err);
  } finally {
    result.errors = h.errors;
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    if (result.failure || result.errors.length) process.exit(1);
  }
})();
