// T2 (Mike's 11/23 ski trip test and his 11/24 call, journal/pm-review/spec-11-23.md): on a plan
// where everyone pays their own, the price and the status you see are your own. At 1280 and 390
// wide, against TripTab dev, with two accounts.
//
// Mike adds a flight he has booked ($850, logged while adding). Julia joins the trip by the group
// link and joins the flight from Your plans: no prompt for a price. Mike sees Confirmed with his
// price; Julia sees Planned with no price (never Mike's); both see "1 of 2 booked". Julia marks
// herself booked with no price: Confirmed for her, Mike's view unchanged. She adds her price later
// from the plan's panel; Mike's stays $850. Your plans and the week view agree with the card. Then
// Julia drops the flight: only her line goes, and Mike still sees Confirmed. All made up.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const DAY = '2027-02-05';
const TITLE = 'ZZ 88 Newark to Geneva';
const card = (p) => p.locator(`#day-${DAY} .item-card:not([data-continued="true"])`).filter({ hasText: TITLE }).first();
const panel = (p) => h.dlg(p).getByTestId('own-lines');
const ownStatus = (p) => h.dlg(p).getByTestId('own-status');

/** What one person sees of the flight: the card, its status and money mark, Your plans and the week view. */
async function view(p, phone) {
  if (phone) await p.getByRole('tab', { name: /Itinerary/ }).click().catch(() => {});
  await h.showDay(p, DAY);
  const c = card(p);
  await c.waitFor();
  const out = {
    status: await c.getAttribute('data-status'),
    text: (await c.innerText()).replace(/\s+/g, ' '),
    paidMark: await c.locator('[title="Confirmed and paid"]').count(),
  };
  const strip = p.getByTestId('your-plans');
  if (await strip.count()) {
    await strip.click();
    out.yourPlans = (await h.dlg(p).locator('li', { hasText: TITLE }).innerText()).replace(/\s+/g, ' ');
    await h.dlg(p).getByRole('button', { name: 'Done' }).click();
    await h.dlg(p).waitFor({ state: 'detached' });
  }
  await p.getByRole('radio', { name: 'Week' }).click();
  out.week = await p.locator('[data-status]').filter({ hasText: TITLE }).first().getAttribute('data-status');
  await p.getByRole('radio', { name: /^(Days|Day by day)$/ }).click();
  return out;
}

async function openFlight(p) {
  await h.showDay(p, DAY);
  await card(p).click();
  await h.openCost(h.dlg(p)).catch(() => {});
  await ownStatus(p).waitFor();
}
async function close(p) {
  await h.dlg(p).getByRole('button', { name: 'Close' }).first().click();
  await p.locator('dialog[open]').waitFor({ state: 'detached' }).catch(() => {});
}

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const phone = label === 'phone';
  const m = h.watch(await (await h.context(browser, opts)).newPage(), `mike-${label}`);
  await h.startSkiTrip(m, `own-mike-${label}`);
  if (phone) await m.getByRole('tab', { name: /People/ }).click();
  await m.locator('section[aria-labelledby="people-title"]').getByRole('button', { name: 'Add', exact: true }).click();
  await h.dlg(m).getByLabel('Name').fill('Julia');
  await h.dlg(m).getByRole('button', { name: 'Add to trip' }).click();
  await h.dlg(m).getByText('Added Julia').waitFor();
  await h.dlg(m).getByRole('button', { name: 'Done' }).click();
  const link = (await m.locator('section[aria-labelledby="link-title"] code').textContent()).trim();
  if (phone) await m.getByRole('tab', { name: /Itinerary/ }).click();

  // Mike's flight, booked: $850, logged while adding it.
  await h.showDay(m, DAY);
  await m.locator(`#day-${DAY}`).getByRole('button', { name: 'Add to evening' }).click();
  await h.dlg(m).getByLabel('What').fill(TITLE);
  await h.dlg(m).getByRole('radio', { name: 'Flight' }).click();
  await h.openCost(h.dlg(m));
  await h.dlg(m).getByRole('radio', { name: 'Yes, log it now' }).click();
  await h.dlg(m).getByLabel('What you paid').fill('850');
  await h.dlg(m).getByRole('button', { name: 'Add to trip' }).click();
  await card(m).locator('[title="Confirmed and paid"]').waitFor();

  // Julia joins the trip, then the flight from Your plans: no prompt for a price.
  const j = h.watch(await (await h.context(browser, opts)).newPage(), `julia-${label}`);
  await j.goto(link);
  await j.getByRole('button', { name: 'Julia' }).click();
  await h.signUp(j, 'Julia', `own-julia-${label}`);
  await h.joinTrip(j);
  await j.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await j.getByTestId('your-plans').click();
  await h.dlg(j).getByRole('button', { name: `Join ${TITLE}` }).click();
  await h.dlg(j).getByRole('button', { name: `Drop ${TITLE}` }).waitFor();
  await h.dlg(j).getByRole('button', { name: 'Done' }).click();
  await j.locator('dialog[open]').waitFor({ state: 'detached' });
  await j.waitForTimeout(800);
  r.promptAfterJoin = await j.locator('dialog[open]').count();

  // 1. Mike sees Confirmed with his price; Julia sees Planned, no price; both see 1 of 2 booked.
  await m.reload();
  await m.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  r.mike1 = await view(m, phone);
  r.julia1 = await view(j, phone);
  await card(j).scrollIntoViewIfNeeded();
  await h.shot(j, `own-status-julia-planned-${label}`);
  await card(m).scrollIntoViewIfNeeded();
  await h.shot(m, `own-status-mike-confirmed-${label}`);
  await openFlight(j);
  r.juliaPanel1 = (await panel(j).innerText()).replace(/\s+/g, ' ');
  r.juliaStatus1 = (await ownStatus(j).innerText()).trim();

  // 2. Julia marks herself booked with no price.
  await panel(j).getByRole('button', { name: 'Log my cost' }).click();
  r.priceStartsBlank = (await panel(j).getByLabel('Your own cost').inputValue()) === '';
  await panel(j).getByRole('button', { name: 'Mark as booked' }).click();
  await ownStatus(j).getByText('Confirmed: everyone going has booked').waitFor();
  r.juliaPanel2 = (await panel(j).innerText()).replace(/\s+/g, ' ');
  await h.shot(j, `own-status-julia-booked-${label}`);
  await close(j);
  r.julia2 = await view(j, phone);
  await m.reload();
  await m.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  r.mike2 = await view(m, phone);

  // 3. Julia adds her own price later; Mike's stays $850.
  await openFlight(j);
  await panel(j).locator('li', { hasText: 'Julia (you)' }).getByRole('button', { name: 'Edit' }).click();
  await panel(j).getByLabel('Your own cost').fill('640');
  await panel(j).getByRole('button', { name: 'Save' }).click();
  await panel(j).getByText('$640').first().waitFor();
  r.juliaPanel3 = (await panel(j).innerText()).replace(/\s+/g, ' ');
  await close(j);
  r.julia3 = await view(j, phone);
  await m.reload();
  await m.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  r.mike3 = await view(m, phone);

  // 4. Julia drops the flight: her line goes, Mike still sees Confirmed.
  await j.getByTestId('your-plans').click();
  await h.dlg(j).getByRole('button', { name: `Drop ${TITLE}` }).click();
  await h.dlg(j).getByRole('button', { name: `Join ${TITLE}` }).waitFor();
  await h.dlg(j).getByRole('button', { name: 'Done' }).click();
  await j.locator('dialog[open]').waitFor({ state: 'detached' });
  await openFlight(j);
  r.juliaPanel4 = (await panel(j).innerText()).replace(/\s+/g, ' ');
  await close(j);
  await m.reload();
  await m.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  r.mike4 = await view(m, phone);
  await card(m).scrollIntoViewIfNeeded();
  await h.shot(m, `own-status-mike-after-drop-${label}`);
  r.overflow = Math.max(await h.overflowX(m), await h.overflowX(j));
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
      want('no prompt after Join', r.promptAfterJoin === 0);
      // 1
      want('mike confirmed with his price', r.mike1.status === 'confirmed' && r.mike1.paidMark === 1 && /1 of 2 booked · yours \$850/.test(r.mike1.text));
      want('julia planned, no price', r.julia1.status === 'planned' && r.julia1.paidMark === 0 && /1 of 2 booked/.test(r.julia1.text) && !/\$850/.test(r.julia1.text));
      want('julia panel shows no $850', !/\$850/.test(r.juliaPanel1) && /^Planned, Each pays their own · 1 of 2 booked$/.test(r.juliaStatus1));
      want('your plans and week agree (1)', /Confirmed/.test(r.mike1.yourPlans) && r.mike1.week === 'confirmed' && /Planned/.test(r.julia1.yourPlans) && r.julia1.week === 'planned');
      // 2
      want('price starts blank', r.priceStartsBlank);
      want('julia booked, no $0.00', /Julia \(you\) Booked/.test(r.juliaPanel2) && !/\$0\b/.test(r.juliaPanel2));
      want('julia confirmed after booking', r.julia2.status === 'confirmed' && /Confirmed/.test(r.julia2.yourPlans) && r.julia2.week === 'confirmed' && !/\$/.test(r.julia2.text));
      want('mike unchanged (2)', r.mike2.status === 'confirmed' && r.mike2.paidMark === 1 && /\$850/.test(r.mike2.text));
      // 3
      want('julia price added', /\$640/.test(r.juliaPanel3) && /\$640/.test(r.julia3.text) && !/\$850/.test(r.julia3.text) && r.julia3.paidMark === 1);
      want('mike price kept', /\$850/.test(r.mike3.text) && !/\$640/.test(r.mike3.text));
      // 4
      want('julia line gone after drop', !/\$640/.test(r.juliaPanel4) && !/Julia \(you\) Booked/.test(r.juliaPanel4));
      want('mike still confirmed after drop', r.mike4.status === 'confirmed' && r.mike4.paidMark === 1 && /\$850/.test(r.mike4.text));
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
