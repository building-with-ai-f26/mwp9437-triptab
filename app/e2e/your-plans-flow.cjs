// A trip's first view is about you (11/23 product manager review, item 4), at 1280 and 390 wide.
// Julia joins Mike's trip and the itinerary opens with "You're in 3 of 4 plans", her share so far
// and what she owes. Tapping it lists the plans: one tap takes her out of the hike and the strip
// counts it; the dinner that's paid shows her share instead of a switch. On a trip of one, or with
// no plans, the strip doesn't show. Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const people = (page) => page.locator('section[aria-labelledby="people-title"]');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const phone = label === 'phone';
  const o = h.watch(await (await h.context(browser, opts)).newPage(), `owner-${label}`);
  await h.startSkiTrip(o, `yp-owner-${label}`);
  r.aloneHasIt = await o.getByTestId('your-plans').count();
  if (phone) await o.getByRole('tab', { name: /People/ }).click();
  await people(o).getByRole('button', { name: 'Add', exact: true }).click();
  await h.dlg(o).getByLabel('Name').fill('Julia');
  await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
  await h.dlg(o).getByText('Added Julia').waitFor();
  await h.dlg(o).getByRole('button', { name: 'Done' }).click();
  const link = (await o.locator('section[aria-labelledby="link-title"] code').textContent()).trim();
  if (phone) await o.getByRole('tab', { name: 'Itinerary' }).click();
  r.noPlansHasIt = await o.getByTestId('your-plans').count();
  await h.addPlan(o, '2027-02-05', 'Add to morning', { title: 'Flight JFK to Geneva', kind: 'Flight', status: 'Planned' });
  await h.addPlan(o, '2027-02-06', 'Add to morning', { title: 'Ski school', status: 'Planned', est: '90', perPerson: true });
  await h.addPlan(o, '2027-02-06', 'Add to day', { title: 'Glacier hike' });
  await h.addPlan(o, '2027-02-06', 'Add to evening', { title: 'Dinner at Le Cap', kind: 'Meal', status: 'Planned', est: '380' });
  await o.locator('#day-2027-02-06').getByText('Dinner at Le Cap').click();
  await h.openCost(h.dlg(o));
  await h.dlg(o).getByRole('button', { name: 'Confirm with the real cost' }).click();
  await h.dlg(o).getByLabel('What it cost').fill('380');
  await h.dlg(o).getByRole('button', { name: 'Confirm and log' }).click();
  await o.locator('#day-2027-02-06').getByText(/Your share/).waitFor();

  // ---------- Julia joins and lands on a view about her ----------
  const j = h.watch(await (await h.context(browser, opts)).newPage(), `julia-${label}`);
  await j.goto(link);
  await j.getByRole('button', { name: 'Julia' }).click();
  await h.signUp(j, 'Julia', `yp-julia-${label}`);
  await h.joinTrip(j);
  await j.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  const strip = j.getByTestId('your-plans');
  await strip.waitFor();
  r.strip = (await strip.innerText()).replace(/\s+/g, ' ').trim();
  r.aboveItinerary = (await strip.boundingBox()).y < (await j.getByRole('heading', { name: 'Your Itinerary' }).boundingBox()).y;
  r.overflow = await h.overflowX(j);
  await h.shot(j, `your-plans-strip-${label}`);

  // One tap out of the hike; the paid dinner shows her share, no switch.
  await strip.click();
  const d = h.dlg(j);
  await d.getByText("Each plan says whether you're in").waitFor();
  r.rows = await d.locator('li').count();
  r.dinner = (await d.locator('li', { hasText: 'Dinner at Le Cap' }).innerText()).replace(/\s+/g, ' ').trim();
  r.dinnerHasSwitch = await d.locator('li', { hasText: 'Dinner at Le Cap' }).getByRole('button', { name: /^(Join|Drop) / }).count();
  // A status and an action, never one label for both (Mike's call 11/23).
  const row = (title) => d.locator('li', { hasText: title });
  r.flightStartsOut = (await row('Flight JFK to Geneva').locator('[data-status]').innerText()).trim() === "You're out" &&
    (await row('Flight JFK to Geneva').getByRole('button', { name: 'Join Flight JFK to Geneva' }).count()) === 1;
  r.hikeStartsIn = (await row('Glacier hike').locator('[data-status]').innerText()).trim() === "You're in";
  const hike = d.getByRole('button', { name: 'Drop Glacier hike' });
  r.tapTarget = Math.round((await hike.boundingBox()).height);
  await hike.click();
  await d.getByRole('button', { name: 'Join Glacier hike' }).waitFor();
  r.hikeNowOut = (await row('Glacier hike').locator('[data-status]').innerText()).trim() === "You're out";
  await h.shot(j, `your-plans-list-${label}`);
  await d.getByRole('button', { name: 'Done' }).click();
  await j.getByText("You're in 2 of 4 plans").waitFor();
  r.afterOut = (await strip.innerText()).replace(/\s+/g, ' ').trim();
  // The owner sees it on the hike's card.
  await o.reload();
  await o.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  r.ownerSees = await o.locator('#day-2027-02-06 .item-card', { hasText: 'Glacier hike' }).getByTestId('going').getAttribute('aria-label');
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok = r.aloneHasIt === 0 && r.noPlansHasIt === 0 && /You're in 3 of 4 plans Your share so far \$190 · you owe \$190/.test(r.strip) && r.aboveItinerary &&
        r.overflow <= 0 && r.rows === 4 && /You're in · your share \$190/.test(r.dinner) && r.dinnerHasSwitch === 0 && r.flightStartsOut && r.hikeStartsIn && r.hikeNowOut && r.tapTarget >= 44 &&
        /You're in 2 of 4 plans/.test(r.afterOut) && r.ownerSees === 'You are in';
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
