// What you like, the preferences survey on You (C51, Mike's call 11/23), at 1280 and 390 wide.
// Vic ticks a food and a thing to do and saves; it starts Private. He joins Mike's trip: Mike sees
// no picks beside Vic's name. Vic switches to Shared with the group; Mike then sees them. Needs the
// preferences migration (TripTab dev has it once its pull request has built). Run with
// `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const people = (page) => page.locator('section[aria-labelledby="people-title"]');
const TRIP = /\/trips\/[0-9a-f-]{36}$/;

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const phone = label === 'phone';
  const tab = async (page, name) => phone && (await page.getByRole('tab', { name: new RegExp(name) }).click());

  // ---------- Vic: an account, then the survey on You ----------
  const v = h.watch(await (await h.context(browser, opts)).newPage(), `vic-${label}`);
  await v.goto(`${h.BASE}/sign-in?next=/trips`);
  await h.signUp(v, 'Vic', `tastes-vic-${label}`);
  await v.waitForURL(/\/trips$/);
  await v.getByRole('button', { name: 'You: your profile' }).click();
  const form = v.getByRole('form', { name: 'Your profile' });
  await form.waitFor();
  const survey = form.getByTestId('tastes');
  await survey.waitFor();
  r.startsPrivate = (await survey.getByRole('radio', { name: /^Private/ }).getAttribute('aria-checked')) === 'true';
  await survey.getByRole('group', { name: 'Food' }).getByRole('button', { name: 'Italian' }).click();
  await survey.getByRole('group', { name: 'Things to do' }).getByRole('button', { name: 'Skiing' }).click();
  r.overflow = await h.overflowX(v);
  r.minTap = await survey.locator('button[role="radio"]').evaluateAll((els) => Math.min(...els.map((e) => Math.round(e.getBoundingClientRect().height))));
  await form.getByRole('button', { name: 'Save' }).click();
  await v.getByText('Saved, on all your trips.').waitFor();
  await h.shot(v, `tastes-you-${label}`);
  await v.reload();
  await survey.waitFor();
  r.kept =
    (await survey.getByRole('button', { name: 'Italian' }).getAttribute('aria-pressed')) === 'true' &&
    (await survey.getByRole('button', { name: 'Skiing' }).getAttribute('aria-pressed')) === 'true' &&
    (await survey.getByRole('button', { name: 'Japanese' }).getAttribute('aria-pressed')) === 'false';

  // ---------- Mike starts a trip; Vic joins it ----------
  const o = h.watch(await (await h.context(browser, opts)).newPage(), `owner-${label}`);
  await h.startSkiTrip(o, `tastes-owner-${label}`);
  await tab(o, 'People');
  const link = (await o.locator('section[aria-labelledby="link-title"] code').textContent()).trim();
  await v.goto(link);
  await v.getByText(/Join as/).waitFor();
  await v.getByRole('button', { name: 'Join the trip' }).click();
  await v.waitForURL(TRIP);
  await v.getByRole('heading', { name: 'Your Itinerary' }).waitFor();

  // ---------- Private: Mike sees no picks ----------
  await o.reload();
  await o.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await tab(o, 'People');
  const vicRow = people(o).locator('li').filter({ hasText: 'Vic' });
  await vicRow.waitFor();
  r.privateHidden = (await people(o).getByTestId('tastes-line').count()) === 0;

  // ---------- Shared: Mike sees them beside Vic's name ----------
  await tab(v, 'People');
  await people(v).getByRole('link', { name: 'Your profile' }).click();
  await survey.waitFor();
  await survey.getByRole('radio', { name: /^Shared with the group/ }).click();
  await form.getByRole('button', { name: 'Save' }).click();
  await v.getByText('Saved, on all your trips.').waitFor();
  await o.reload();
  await o.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await tab(o, 'People');
  await vicRow.getByTestId('tastes-line').waitFor();
  r.shared = (await vicRow.getByTestId('tastes-line').innerText()).trim();
  r.overflowPeople = await h.overflowX(o);
  await h.shot(o, `tastes-shared-${label}`);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok = r.startsPrivate && r.overflow <= 0 && (label !== 'phone' || r.minTap >= 44) && r.kept && r.privateHidden &&
        r.shared === 'Likes Italian · skiing' && r.overflowPeople <= 0;
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
