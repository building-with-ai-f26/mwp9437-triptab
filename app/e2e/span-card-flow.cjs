// T5 (Mike's 11/23 ski trip test and C58, journal/pm-review/spec-11-23.md): one card for a plan that
// runs across several parts of the day. At 1280 and 390 wide, against TripTab dev; made-up plans.
// - Skiing, Morning to Day on Sat: one card over both rows, as tall as them, not a card plus "continues".
// - An overnight flight, Fri 17:35 to Sat 07:25: one card on Fri over Evening and Night, and on Sat one
//   "Lands 7:25 AM" line in Morning (no second card). A flight Sun 19:00 to Mon 14:30: its line covers
//   Mon Morning and Day. The parts the line covers have no "Add to" button; the others keep theirs.
// - The week view draws the same: one ski chip, one flight chip, one line.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const covers = (p, scope, title) =>
  scope.locator('[data-slot], [data-slots]').evaluateAll(
    (els, t) =>
      els
        .filter((el) => [...el.querySelectorAll('.item-card')].some((c) => c.innerText.includes(t)))
        .flatMap((el) => (el.getAttribute('data-slots') ?? el.getAttribute('data-slot')).split(' ')),
    title,
  );

async function flight(p, day, slotLabel, title, dep, arr, lands) {
  await h.showDay(p, day);
  await p.locator(`#day-${day}`).getByRole('button', { name: slotLabel }).click();
  const d = h.dlg(p);
  await d.getByLabel('What').fill(title);
  await d.getByRole('radio', { name: 'Flight' }).click();
  await h.openTimes(d);
  await d.getByLabel('Departs at (optional)').fill(dep);
  await d.getByLabel('Lands at (optional)').fill(arr);
  await d.getByLabel('Lands on').selectOption(lands);
  await d.getByRole('button', { name: 'Add to trip' }).click();
  await p.locator('dialog[open]').waitFor({ state: 'detached' });
}

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `span-card-${label}`);

  // Skiing, Morning to Day on Sat 2/6.
  await h.showDay(p, '2027-02-06');
  await p.locator('#day-2027-02-06').getByRole('button', { name: 'Add to morning' }).click();
  await h.dlg(p).getByLabel('What').fill('Skiing');
  await h.dlg(p).getByRole('radio', { name: 'Planned' }).click();
  await h.dlg(p).getByRole('group', { name: 'Part of the day' }).getByRole('button', { name: 'Day', exact: true }).click();
  await h.dlg(p).getByRole('button', { name: 'Add to trip' }).click();
  await p.locator('dialog[open]').waitFor({ state: 'detached' });

  await flight(p, '2027-02-05', 'Add to evening', 'ZZ 57 Newark to Geneva', '17:35', '07:25', '2027-02-06');
  await flight(p, '2027-02-07', 'Add to evening', 'ZZ 9 Geneva to Tokyo', '19:00', '14:30', '2027-02-08');
  await p.locator('#day-2027-02-08 .item-card').filter({ hasText: 'ZZ 9' }).first().waitFor();

  // Skiing: one card over two rows.
  const sat = p.locator('#day-2027-02-06');
  r.skiCards = await sat.locator('.item-card').filter({ hasText: 'Skiing' }).count();
  r.skiCovers = await covers(p, sat, 'Skiing');
  r.skiContinues = await sat.locator('.item-card[data-continued="true"]').filter({ hasText: 'Skiing' }).count();
  const ski = await sat.locator('[data-span] .item-card').filter({ hasText: 'Skiing' }).boundingBox();
  const morningLabel = await sat.getByText('Morning', { exact: true }).boundingBox();
  const dayLabel = await sat.getByText('Day', { exact: true }).boundingBox();
  // As tall as both rows: it starts by the Morning label and reaches past the Day label.
  r.skiTall = ski.y <= morningLabel.y + 12 && ski.y + ski.height >= dayLabel.y + dayLabel.height;
  r.satMorningAdd = await sat.getByRole('button', { name: 'Add to morning' }).count();
  r.satEveningAdd = await sat.getByRole('button', { name: 'Add to evening' }).count();
  await sat.scrollIntoViewIfNeeded();
  await h.shot(p, `span-card-ski-${label}`);

  // The overnight flight: one card Fri Evening to Night, one line Sat Morning.
  const fri = p.locator('#day-2027-02-05');
  r.friCards = await fri.locator('.item-card:not([data-testid="overnight"])').filter({ hasText: 'ZZ 57' }).count();
  r.friCovers = await covers(p, fri, 'ZZ 57');
  r.friText = (await fri.locator('[data-span] .item-card').filter({ hasText: 'ZZ 57' }).innerText()).replace(/\s+/g, ' ');
  r.satFlight = (await sat.locator('.item-card').filter({ hasText: 'ZZ 57' }).allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  r.satFlightCovers = await covers(p, sat, 'ZZ 57');
  r.satFlightIsLine = await sat.locator('.item-card[data-continued="true"]').filter({ hasText: 'ZZ 57' }).count();
  await fri.scrollIntoViewIfNeeded();
  await h.shot(p, `span-card-flight-${label}`);

  // The 14:30 landing: its line covers Mon Morning and Day.
  const mon = p.locator('#day-2027-02-08');
  r.monCovers = await covers(p, mon, 'ZZ 9');
  r.monLine = (await mon.locator('.item-card[data-continued="true"]').filter({ hasText: 'ZZ 9' }).allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  r.monAdds = await mon.getByRole('button', { name: /^Add to (morning|day)$/ }).count();
  r.monEveningAdd = await mon.getByRole('button', { name: 'Add to evening' }).count();
  await mon.scrollIntoViewIfNeeded();
  await h.shot(p, `span-card-landing-${label}`);
  r.overflow = await h.overflowX(p);

  // The week view agrees.
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.getByRole('radio', { name: 'Week' }).click();
  const week = p.getByRole('region', { name: 'Week view' });
  await week.waitFor();
  r.weekSki = await week.locator('.item-card').filter({ hasText: 'Skiing' }).count();
  r.weekSkiSegment = await week.locator('[data-segment="2027-02-06|morning-day"] .item-card').filter({ hasText: 'Skiing' }).count();
  r.weekFlight = await week.locator('.item-card').filter({ hasText: 'ZZ 57' }).count();
  r.weekFlightSegment = await week.locator('[data-segment="2027-02-05|evening-night"] .item-card').filter({ hasText: 'ZZ 57' }).count();
  r.weekLanding = await week.locator('[data-segment="2027-02-08|morning-day"] .item-card[data-continued="true"]').filter({ hasText: 'ZZ 9' }).count();
  await week.scrollIntoViewIfNeeded();
  await h.shot(p, `span-card-week-${label}`);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const fail = [];
      const want = (name, ok) => ok || fail.push(name);
      want('ski one card', r.skiCards === 1 && r.skiContinues === 0 && JSON.stringify(r.skiCovers) === '["2027-02-06|morning","2027-02-06|day"]' && r.skiTall);
      want('ski slots taken, others open', r.satMorningAdd === 0 && r.satEveningAdd === 1);
      want('flight one card Fri', r.friCards === 1 && JSON.stringify(r.friCovers) === '["2027-02-05|evening","2027-02-05|night"]' && /Departs 5:35 PM, lands Sat 7:25 AM/.test(r.friText));
      want('flight one line Sat', r.satFlight.length === 1 && r.satFlightIsLine === 1 && /Lands 7:25 AM/.test(r.satFlight[0]) && JSON.stringify(r.satFlightCovers) === '["2027-02-06|morning"]');
      want('14:30 landing covers Morning and Day', JSON.stringify(r.monCovers) === '["2027-02-08|morning","2027-02-08|day"]' && r.monLine.length === 1 && /Lands 2:30 PM/.test(r.monLine[0]) && r.monAdds === 0 && r.monEveningAdd === 1);
      want('week agrees', r.weekSki === 1 && r.weekSkiSegment === 1 && r.weekFlightSegment === 1 && r.weekLanding === 1);
      want('no sideways scroll', r.overflow <= 0);
      if (fail.length) result.failure = `${result.failure ? `${result.failure} | ` : ''}${label}: ${fail.join('; ')}`;
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
