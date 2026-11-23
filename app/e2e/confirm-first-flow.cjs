// Confirm and log the cost is the main button on a Planned plan (11/23 product manager review,
// item 6), at 1280 and 390 wide. Opening a Planned plan on one bill shows the button at the top of
// the sheet, on the first screen; it opens the confirm step with the estimate filled in. A
// Suggested plan, a flight (everyone pays their own) and a plan that's already paid don't show it.
// Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `cf-${label}`);
  const day = p.locator('#day-2027-02-06');
  await h.addPlan(p, '2027-02-06', 'Add to evening', { title: 'Dinner at Le Cap', kind: 'Meal', status: 'Planned', est: '380' });
  await h.addPlan(p, '2027-02-06', 'Add to morning', { title: 'Ski school' });
  await h.addPlan(p, '2027-02-06', 'Add to day', { title: 'Flight to Barcelona', kind: 'Flight', status: 'Planned' });
  const top = () => h.dlg(p).getByTestId('confirm-first');

  await day.getByText('Ski school').click();
  await h.dlg(p).getByLabel('What').waitFor();
  r.suggestedHasIt = await top().count();
  await h.dlg(p).getByRole('button', { name: 'Done' }).click();
  await day.getByText('Flight to Barcelona').click();
  await h.dlg(p).getByLabel('What').waitFor();
  r.flightHasIt = await top().count();
  await h.dlg(p).getByRole('button', { name: 'Done' }).click();

  await day.getByText('Dinner at Le Cap').click();
  const button = top().getByRole('button', { name: 'Confirm and log the cost' });
  await button.waitFor();
  const box = await button.boundingBox();
  r.onFirstScreen = box.y + box.height < opts.viewport.height && box.y < (await h.dlg(p).getByLabel('What').boundingBox()).y;
  r.tapTarget = Math.round(box.height);
  r.overflow = await h.overflowX(p);
  await h.shot(p, `confirm-first-${label}`);
  await button.click();
  const c = h.dlg(p);
  await c.getByText('Logs $380, paid by Mike').waitFor();
  r.estimateFilledIn = await c.getByLabel('What it cost').inputValue();
  await c.getByRole('button', { name: 'Confirm and log' }).click();
  await day.locator('.item-card[data-status="confirmed"]', { hasText: 'Dinner at Le Cap' }).waitFor();
  await day.getByText('Dinner at Le Cap').click();
  await h.dlg(p).getByLabel('What').waitFor();
  r.paidHasIt = await top().count();
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok = r.suggestedHasIt === 0 && r.flightHasIt === 0 && r.onFirstScreen && r.tapTarget >= 44 && r.overflow <= 0 && r.estimateFilledIn === '380' && r.paidHasIt === 0;
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
