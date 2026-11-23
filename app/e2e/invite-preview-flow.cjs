// The invite shows the trip before asking anyone to sign up (C45, Mike's call 11/23), at 1280 and
// 390 wide. Signed out, a friend opening the group link sees who invited them, the next 3 plans
// (what, when, whether it's confirmed) with how many more there are, and who's coming; no cost,
// place or note. A trip with no plans yet says so. Needs the join_preview migration (TripTab dev
// has it). Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const people = (page) => page.locator('section[aria-labelledby="people-title"]');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const phone = label === 'phone';
  const o = h.watch(await (await h.context(browser, opts)).newPage(), `owner-${label}`);
  await h.startSkiTrip(o, `peek-${label}`);
  if (phone) await o.getByRole('tab', { name: /People/ }).click();
  const link = (await o.locator('section[aria-labelledby="link-title"] code').textContent()).trim();

  // No plans yet: the invite says so rather than showing an empty list.
  const f = h.watch(await (await h.context(browser, opts)).newPage(), `friend-${label}`);
  await f.goto(link);
  await f.getByText('Who are you?').waitFor();
  r.invitedBy = (await f.getByTestId('invited-by').innerText()).trim();
  r.empty = (await f.getByTestId('trip-peek').innerText()).replace(/\s+/g, ' ').trim();

  // The owner adds Julia and four plans, one with a cost and a place.
  await people(o).getByRole('button', { name: 'Add', exact: true }).click();
  await h.dlg(o).getByLabel('Name').fill('Julia');
  await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
  await h.dlg(o).getByText('Added Julia').waitFor();
  await h.dlg(o).getByRole('button', { name: 'Done' }).click();
  if (phone) await o.getByRole('tab', { name: 'Itinerary' }).click();
  await h.addPlan(o, '2027-02-05', 'Add to morning', { title: 'Flight JFK to Geneva', kind: 'Flight', status: 'Planned' });
  await h.addPlan(o, '2027-02-05', 'Add to evening', { title: 'Fondue at La Caleche', kind: 'Meal', status: 'Planned', est: '40', perPerson: true });
  await h.addPlan(o, '2027-02-06', 'Add to morning', { title: 'Ski school' });
  await h.addPlan(o, '2027-02-07', 'Add to day', { title: 'Aiguille du Midi' });

  await f.reload();
  await f.getByText('Who are you?').waitFor();
  const peek = f.getByTestId('trip-peek');
  r.plans = (await peek.locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  r.more = await peek.getByText('and 1 more plan on the trip').count();
  r.coming = (await f.getByTestId('whos-coming').innerText()).replace(/\s+/g, ' ').trim();
  r.noMoney = !/\$|40/.test(await peek.innerText());
  r.names = await f.getByRole('list').last().getByRole('button').allInnerTexts();
  r.overflow = await h.overflowX(f);
  await h.shot(f, `invite-preview-${label}`);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok = /^Mike invited you to$/i.test(r.invitedBy) && /No plans yet/.test(r.empty) && r.plans.length === 3 &&
        /^Flight JFK to Geneva Fri, Feb 5 · Morning · Planned$/.test(r.plans[0]) && /^Fondue at La Caleche Fri, Feb 5 · Evening · Planned$/.test(r.plans[1]) &&
        /^Ski school Sat, Feb 6 · Morning · Suggested$/.test(r.plans[2]) && r.more === 1 && /Who's coming\s*Mike is in, 1 more invited/i.test(r.coming) &&
        r.noMoney && r.overflow <= 0;
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
