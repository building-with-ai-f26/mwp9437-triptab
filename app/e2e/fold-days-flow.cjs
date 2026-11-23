// Empty days fold on a phone (11/23 review, item 9: 12 empty days were about 4,900 px of
// scrolling). At 390 wide a new 12-day trip shows its first day whole and the other 11 as one row
// each; tapping a row shows that day's slots; its + adds a plan on that day; a day with a plan
// shows whole. At 1280 every day keeps its slots. Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

async function phone(browser, r) {
  const p = h.watch(await (await h.context(browser, h.PHONE)).newPage(), 'phone');
  await h.startSkiTrip(p, 'fold-phone');
  const folded = p.locator('[id^="day-"][data-folded]');
  r.days = await p.locator('[id^="day-"]').count();
  r.folded = await folded.count();
  r.firstDayOpen = await p.locator('#day-2027-02-05').getByRole('button', { name: 'Add to morning' }).count();
  r.pageHeight = await p.evaluate(() => document.documentElement.scrollHeight);
  r.rowHeight = Math.round((await folded.first().boundingBox()).height);
  await h.shot(p, 'fold-days-phone');

  // Tap a row: that day's slots show.
  await p.locator('#day-2027-02-08').getByRole('button', { name: /^Show Mon, Feb 8/ }).click();
  r.unfolded = await p.locator('#day-2027-02-08').getByRole('button', { name: 'Add to evening' }).count();
  // The + on a folded day adds a plan on that day.
  await p.locator('#day-2027-02-10').getByRole('button', { name: 'Add a plan on Wed, Feb 10' }).click();
  r.plusDate = await h.dlg(p).getByLabel('Date').inputValue();
  await h.dlg(p).getByLabel('What').fill('Thermal baths');
  await h.dlg(p).getByRole('button', { name: 'Add to trip' }).click();
  await p.locator('#day-2027-02-10').getByText('Thermal baths').waitFor();
  r.dayWithPlanWhole = (await p.locator('#day-2027-02-10[data-folded]').count()) === 0 && (await p.locator('#day-2027-02-10').getByRole('button', { name: 'Add to morning' }).count()) === 1;
  // Still whole after a reload; the first day folds now that the trip has a plan.
  await p.reload();
  await p.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await p.locator('#day-2027-02-10').getByText('Thermal baths').waitFor();
  r.foldedAfter = await p.locator('[id^="day-"][data-folded]').count();
  // The day chips still jump to a folded day.
  await p.getByRole('button', { name: /Tue\s*2\/16/ }).click().catch(() => {});
  r.overflow = await h.overflowX(p);
}

async function desktop(browser, r) {
  const p = h.watch(await (await h.context(browser, h.DESKTOP)).newPage(), 'desktop');
  await h.startSkiTrip(p, 'fold-desktop');
  r.folded = await p.locator('[id^="day-"][data-folded]').count();
  r.slots = await p.getByRole('button', { name: 'Add to morning' }).count();
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = { phone: {}, desktop: {} };
  try {
    await phone(browser, result.phone);
    await desktop(browser, result.desktop);
    const a = result.phone;
    const b = result.desktop;
    const ok = a.days === 12 && a.folded === 11 && a.firstDayOpen === 1 && a.pageHeight < 2400 && a.rowHeight <= 72 && a.unfolded === 1 &&
      a.plusDate === '2027-02-10' && a.dayWithPlanWhole && a.foldedAfter === 11 && a.overflow <= 0 && b.folded === 0 && b.slots === 12;
    if (!ok) result.failure = 'a check failed';
  } catch (e) {
    result.failure = String(e);
  } finally {
    result.errors = h.errors;
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    if (result.failure || result.errors.length) process.exit(1);
  }
})();
