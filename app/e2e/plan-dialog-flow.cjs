// The Add a plan dialog after the 11/17 pod feedback (Build 3), at 1280 and 390 wide:
// 1. parts of the day are select all that apply, and a run has no gaps;
// 2. any plan can have a start and end time, which pick its parts for you;
// 3. the cost starts folded, saying what's in it;
// 4. skiing 9 AM to 4 PM every day shows its hours on the itinerary, and reopens as it was saved;
// 5. plans save as you go: an edit saves itself, closing a new plan any way keeps it, Discard doesn't.
// Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const pressed = async (d) =>
  (await d.getByRole('group', { name: 'Part of the day' }).getByRole('button', { pressed: true }).allInnerTexts()).join(', ');
const part = (d, name) => d.getByRole('group', { name: 'Part of the day' }).getByRole('button', { name, exact: true });

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `dialog-${label}`);

  // 1. Select all that apply, on a throwaway plan.
  await h.showDay(p, '2027-02-07');
  await p.locator('#day-2027-02-07').getByRole('button', { name: 'Add to morning' }).click();
  const d = h.dlg(p);
  r.start = await pressed(d);
  await part(d, 'Night').click();
  r.fillsTheGap = await pressed(d);
  await part(d, 'Morning').click();
  r.dropsAnEnd = await pressed(d);
  await part(d, 'Evening').click();
  r.middleStartsOver = await pressed(d);
  // 3. Cost folded, with a summary.
  const cost = d.getByRole('button', { name: /^Cost/ });
  r.costFolded = (await cost.getAttribute('aria-expanded')) === 'false';
  r.costSummary = (await cost.innerText()).replace(/\s+/g, ' ');
  r.estimateHidden = (await d.getByLabel(/Estimated/).count()) === 0;
  await h.shot(p, `plan-dialog-folded-${label}`);
  // A new plan with no name closes without a trace.
  await d.getByRole('button', { name: 'Close' }).click();
  await d.waitFor({ state: 'detached' });

  // 2 and 4. Ski school, 9 to 4, three days, about $60 a person.
  await h.showDay(p, '2027-02-06');
  await p.locator('#day-2027-02-06').getByRole('button', { name: 'Add to morning' }).click();
  await d.getByLabel('What').fill('Ski school');
  await h.openTimes(d);
  await d.getByLabel('Starts at (optional)').fill('09:00');
  await d.getByLabel('Ends at (optional)').fill('16:00');
  r.timesPickParts = await pressed(d);
  // Three days, as three plans (T6, 11/24): Sat plus Sun and Mon ticked in More days.
  for (const m of ['Sun, Feb 7', 'Mon, Feb 8']) await d.getByRole('group', { name: 'More days' }).getByRole('button', { name: m }).click();
  await cost.click();
  await d.getByLabel(/Estimated/).fill('60');
  await d.getByRole('radio', { name: 'Per person' }).click();
  r.costSummaryOpen = (await cost.innerText()).replace(/\s+/g, ' ');
  await d.getByLabel('Starts at (optional)').scrollIntoViewIfNeeded();
  await h.shot(p, `plan-dialog-times-${label}`);
  await d.getByRole('button', { name: 'Add to trip' }).click();
  const sat = p.locator('#day-2027-02-06 .item-card').filter({ hasText: 'Ski school' });
  await sat.first().waitFor();
  r.satCards = (await sat.allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  r.slots = await p.locator('.item-card').filter({ hasText: 'Ski school' }).count();
  await sat.first().scrollIntoViewIfNeeded();
  await h.shot(p, `plan-hours-${label}`);

  // Reopens as saved.
  await sat.first().click();
  r.reopened = [await pressed(d), await d.getByLabel('Starts at (optional)').inputValue(), await d.getByLabel('Ends at (optional)').inputValue()];
  // 5. An edit saves itself: rename it, wait, close with the X.
  await d.getByLabel('What').fill('Ski school, group lesson');
  await d.getByRole('status').filter({ hasText: 'Saved' }).waitFor();
  r.saveNote = (await d.getByRole('status').innerText()).trim();
  await h.shot(p, `plan-dialog-saved-${label}`);
  // Ending before it starts is caught: not saved, the first Done shows why, the second closes and
  // keeps the last saved version.
  await d.getByLabel('Ends at (optional)').fill('08:00');
  r.notSavedNote = (await d.getByRole('status').innerText()).trim();
  await d.getByRole('button', { name: 'Done' }).click();
  r.endBeforeStart = (await d.getByRole('alert').innerText()).trim();
  await d.getByRole('button', { name: 'Done' }).click();
  await d.waitFor({ state: 'detached' });
  const renamed = p.locator('#day-2027-02-06 .item-card').filter({ hasText: 'Ski school, group lesson' });
  r.renamedOnCard = await renamed.count();
  await renamed.first().click();
  r.keptTimes = [await d.getByLabel('Starts at (optional)').inputValue(), await d.getByLabel('Ends at (optional)').inputValue()].join('-');
  await d.getByRole('button', { name: 'Close' }).click();
  await d.waitFor({ state: 'detached' });

  // A new plan closed with the X is kept; one discarded isn't.
  await h.showDay(p, '2027-02-09');
  await p.locator('#day-2027-02-09').getByRole('button', { name: 'Add to evening' }).click();
  await d.getByLabel('What').fill('Fondue night');
  await d.getByRole('button', { name: 'Close' }).click();
  await p.locator('#day-2027-02-09 .item-card').filter({ hasText: 'Fondue night' }).waitFor();
  r.keptOnClose = true;
  await h.showDay(p, '2027-02-10');
  await p.locator('#day-2027-02-10').getByRole('button', { name: 'Add to evening' }).click();
  await d.getByLabel('What').fill('Not this one');
  await d.getByRole('button', { name: 'Discard' }).click();
  await d.waitFor({ state: 'detached' });
  await p.waitForTimeout(800);
  r.discarded = (await p.locator('.item-card').filter({ hasText: 'Not this one' }).count()) === 0;
  r.overflow = await h.overflowX(p);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok =
        r.start === 'Morning' && r.fillsTheGap === 'Morning, Day, Evening, Night' && r.dropsAnEnd === 'Day, Evening, Night' &&
        r.middleStartsOver === 'Evening' && r.costFolded && r.costSummary.includes('none yet') && r.estimateHidden &&
        r.timesPickParts === 'Morning, Day' && r.costSummaryOpen.includes('about $60 a person') &&
        // One card per day (T5), each its own plan with the hours (T6).
        r.satCards.length === 1 && r.satCards[0].includes('9:00 AM to 4:00 PM') && r.slots === 3 &&
        r.reopened.join('|') === 'Morning, Day|09:00|16:00' && r.endBeforeStart.includes('It has to end after it starts.') &&
        r.saveNote === 'Saved' && r.notSavedNote.startsWith('Not saved yet') && r.renamedOnCard === 1 && r.keptTimes === '09:00-16:00' &&
        r.keptOnClose && r.discarded && r.overflow <= 0;
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
