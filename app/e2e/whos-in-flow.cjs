// Who's in on a plan and who's on its bill always match (C47, Mike's call 11/23), at 1280 and 390
// wide. An Owner confirms a dinner split 3 ways with Sam left out: the card stops saying Everyone,
// the plan says "Who's in (3 of 4)" and that who's in follows the bill, and Change who's in opens
// the bill. Undoing the bill keeps Sam out. Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `whosin-${label}`);
  const phone = label === 'phone';
  if (phone) await p.getByRole('tab', { name: 'People' }).click();
  await p.locator('section[aria-labelledby="people-title"]').getByRole('button', { name: 'Add', exact: true }).click();
  for (const [i, name] of ['Julia', 'Vic', 'Sam'].entries()) {
    await h.dlg(p).getByLabel('Name').fill(name);
    await h.dlg(p).getByRole('button', { name: 'Add to trip' }).click();
    await h.dlg(p).getByText(`Added ${['Julia', 'Vic', 'Sam'].slice(0, i + 1).join(', ')}`).waitFor();
  }
  await h.dlg(p).getByRole('button', { name: 'Done' }).click();
  if (phone) await p.getByRole('tab', { name: 'Itinerary' }).click();

  const day = p.locator('#day-2027-02-06');
  await h.addPlan(p, '2027-02-06', 'Add to evening', { title: 'Dinner at Le Cap', kind: 'Meal', status: 'Planned', est: '380' });
  const card = day.locator('.item-card', { hasText: 'Dinner at Le Cap' });
  r.before = await card.getByTestId('going').getAttribute('aria-label');

  // Confirm it, split 3 ways, Sam unticked.
  await card.click();
  await h.openCost(h.dlg(p));
  await h.dlg(p).getByRole('button', { name: 'Confirm with the real cost' }).click();
  const c = h.dlg(p);
  await c.getByLabel('What it cost').fill('380');
  await c.getByRole('checkbox', { name: 'Sam' }).uncheck();
  await c.getByText('Logs $380, paid by Mike, split 3 ways').waitFor();
  await c.getByRole('button', { name: 'Confirm and log' }).click();
  await day.getByText('Your share $126.67').waitFor();
  r.after = await card.getByTestId('going').getAttribute('aria-label');
  r.cardSaysEveryone = await card.getByText('Everyone', { exact: true }).count();
  await h.shot(p, `whos-in-card-${label}`);

  // The plan: 3 of 4, who's in follows the bill, no in or out switch.
  await card.click();
  const d = h.dlg(p);
  await d.getByText("Who's in (3 of 4)").waitFor();
  r.note = (await d.getByTestId('bill-sets-in').innerText()).replace(/\s+/g, ' ');
  r.switchGone = (await d.getByRole('radio', { name: "I'm out" }).count()) === 0;
  r.overflow = await h.overflowX(p);
  await h.shot(p, `whos-in-plan-${label}`);

  // Change who's in opens the bill; putting Sam back makes it Everyone again.
  await d.getByRole('button', { name: "Change who's in" }).click();
  const e = h.dlg(p);
  await e.getByRole('checkbox', { name: 'Sam' }).check();
  await e.getByText('split 4 ways').waitFor();
  await e.getByRole('button', { name: /Save/ }).click();
  await day.getByText('Your share $95').waitFor();
  r.backIn = await card.getByTestId('going').getAttribute('aria-label');

  // Sam out again, then undo the bill: Sam stays out of the plan.
  await card.click();
  await h.dlg(p).getByRole('button', { name: "Change who's in" }).click();
  await h.dlg(p).getByRole('checkbox', { name: 'Sam' }).uncheck();
  await h.dlg(p).getByRole('button', { name: /Save/ }).click();
  await day.getByText('Your share $126.67').waitFor();
  await card.click();
  await h.dlg(p).getByRole('button', { name: "Change who's in" }).click();
  await h.dlg(p).getByRole('button', { name: /Undo/ }).click();
  await p.waitForTimeout(1200);
  r.afterUndo = await day.locator('.item-card', { hasText: 'Dinner at Le Cap' }).getByTestId('going').getAttribute('aria-label');
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok = r.before === "Everyone's in" && r.after === 'You, Julia and Vic are in' && r.cardSaysEveryone === 0 &&
        /You're in: your share is \$126\.67\. Who's in follows the bill, split 3 ways\./.test(r.note) && r.switchGone && r.overflow <= 0 &&
        r.backIn === "Everyone's in" && r.afterUndo === 'You, Julia and Vic are in';
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
