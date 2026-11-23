// Votes on Suggested plans (11/23 product manager review, item 7), at 1280 and 390 wide. Mike adds
// two ideas; Julia joins, opens one and taps "I want this"; its card shows a thumbs up with 1, Mike
// sees "Julia wants this", adds his own (2), and takes it back (1). A Planned plan has no vote.
// Needs the item_votes migration (TripTab dev has it once its pull request has built). Run with
// `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const people = (page) => page.locator('section[aria-labelledby="people-title"]');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const phone = label === 'phone';
  const o = h.watch(await (await h.context(browser, opts)).newPage(), `owner-${label}`);
  await h.startSkiTrip(o, `votes-owner-${label}`);
  if (phone) await o.getByRole('tab', { name: /People/ }).click();
  await people(o).getByRole('button', { name: 'Add', exact: true }).click();
  await h.dlg(o).getByLabel('Name').fill('Julia');
  await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
  await h.dlg(o).getByText('Added Julia').waitFor();
  await h.dlg(o).getByRole('button', { name: 'Done' }).click();
  const link = (await o.locator('section[aria-labelledby="link-title"] code').textContent()).trim();
  if (phone) await o.getByRole('tab', { name: 'Itinerary' }).click();
  await h.addPlan(o, '2027-02-06', 'Add to day', { title: 'Glacier hike' });
  await h.addPlan(o, '2027-02-06', 'Add to evening', { title: 'Fondue at La Caleche', kind: 'Meal', status: 'Planned' });
  const day = (p) => p.locator('#day-2027-02-06');
  r.noVotesYet = await day(o).getByTestId('votes').count();

  const j = h.watch(await (await h.context(browser, opts)).newPage(), `julia-${label}`);
  await j.goto(link);
  await j.getByRole('button', { name: 'Julia' }).click();
  await h.signUp(j, 'Julia', `votes-julia-${label}`);
  await h.joinTrip(j);
  await j.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await day(j).getByText('Fondue at La Caleche').click();
  // A Planned plan opens with its title in a field, and no vote.
  await h.dlg(j).getByRole('heading').first().waitFor();
  r.plannedHasVote = await h.dlg(j).getByTestId('vote').count();
  await j.keyboard.press('Escape');
  await h.dlg(j).waitFor({ state: 'detached' });
  await day(j).getByText('Glacier hike').click();
  const vote = h.dlg(j).getByTestId('vote');
  await vote.getByRole('button', { name: 'I want this' }).click();
  await vote.getByRole('button', { name: 'You want this' }).waitFor();
  r.tapTarget = Math.round((await vote.getByRole('button', { name: 'You want this' }).boundingBox()).height);
  r.overflow = await h.overflowX(j);
  await h.shot(j, `votes-sheet-${label}`);
  await h.dlg(j).getByRole('button', { name: /Done|Close/ }).first().click();
  r.juliaCard = await day(j).locator('.item-card', { hasText: 'Glacier hike' }).getByTestId('votes').getAttribute('aria-label');
  await h.shot(j, `votes-card-${label}`);

  // Mike sees it, adds his own, and takes it back.
  await o.reload();
  await o.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  r.mikeCard = await day(o).locator('.item-card', { hasText: 'Glacier hike' }).getByTestId('votes').getAttribute('aria-label');
  await day(o).getByText('Glacier hike').click();
  const mine = h.dlg(o).getByTestId('vote');
  r.who = (await mine.innerText()).replace(/\s+/g, ' ').trim();
  await mine.getByRole('button', { name: 'I want this' }).click();
  await mine.getByText('You and Julia want this.').waitFor();
  await mine.getByRole('button', { name: 'You want this' }).click();
  await mine.getByText('Julia wants this.').waitFor();
  r.backToOne = true;
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok = r.noVotesYet === 0 && r.plannedHasVote === 0 && r.tapTarget >= 44 && r.overflow <= 0 && r.juliaCard === '1 person wants this, you included' &&
        r.mikeCard === '1 person wants this' && /Julia wants this\./.test(r.who) && r.backToOne;
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
