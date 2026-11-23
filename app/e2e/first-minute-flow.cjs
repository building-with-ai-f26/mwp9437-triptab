// The friend's first minute (C45, Mike's call 11/23), at 1280 and 390 wide. From the group link to
// the trip in as few steps as it takes:
//  - a new friend taps their name, makes an account and lands on the trip: no second "Join as ...?",
//    no pay step, no guide starting on its own and no "Confirm your email" reminder on that visit;
//  - their first Settle up asks how people pay them, once;
//  - someone who already has an account joins a second trip in one tap, on their name ("Join as
//    Julia?") or on "Join as Julia" when they aren't on the list yet, and their Venmo comes along.
// Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const people = (page) => page.locator('section[aria-labelledby="people-title"]');
const money = (page) => page.locator('section[aria-labelledby="money-title"]');
const TRIP = /\/trips\/[0-9a-f-]{36}$/;

/** A browser as a real friend has it: nothing marked seen. Only the PostHog test tag is set. */
async function freshContext(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => {
    try { localStorage.setItem('triptab.test_run', '1'); } catch {}
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  return ctx;
}

async function addByName(o, phone, name) {
  if (phone) await o.getByRole('tab', { name: /People/ }).click();
  if (name) {
    await people(o).getByRole('button', { name: 'Add', exact: true }).click();
    await h.dlg(o).getByLabel('Name').fill(name);
    await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
    await h.dlg(o).getByText(`Added ${name}`).waitFor();
    await h.dlg(o).getByRole('button', { name: 'Done' }).click();
  }
  return (await o.locator('section[aria-labelledby="link-title"] code').textContent()).trim();
}

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const phone = label === 'phone';

  // The owner: one trip with Julia added by name, a second with her on it too, a third without her.
  const o = h.watch(await (await h.context(browser, opts)).newPage(), `owner-${label}`);
  await h.startSkiTrip(o, `fm-owner-${label}`);
  const link1 = await addByName(o, phone, 'Julia');
  // A cost on the tab, so there's something to settle.
  if (phone) await o.getByRole('tab', { name: /Money/ }).click();
  await money(o).getByRole('button', { name: 'Expense' }).click();
  await h.dlg(o).getByLabel('What for').fill('Chalet groceries');
  await h.dlg(o).getByLabel('Amount').fill('90');
  await h.dlg(o).getByRole('button', { name: 'Add to the tab' }).click();
  await h.dlg(o).waitFor({ state: 'detached' });
  const newTrip = async () => {
    await o.goto(`${h.BASE}/trips/new`);
    await o.getByRole('button', { name: 'Fill in the ski trip example' }).click();
    await o.getByRole('button', { name: 'Start the trip' }).click();
    await o.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  };
  await newTrip();
  const link2 = await addByName(o, phone, 'Julia');
  await newTrip();
  const link3 = await addByName(o, phone, null);

  // ---------- A new friend: link, name, account, trip ----------
  const f = h.watch(await (await freshContext(browser, opts)).newPage(), `friend-${label}`);
  const screens = [];
  const sawJoinAgain = { n: 0 };
  f.on('framenavigated', () => {});
  const started = Date.now();
  await f.goto(link1);
  await f.getByText('Who are you?').waitFor();
  screens.push('Who are you?');
  await f.getByRole('button', { name: 'Julia' }).click();
  await h.withEmail(f);
  screens.push('Create your account');
  await f.getByLabel('Your name').waitFor();
  r.nameFilledIn = await f.getByLabel('Your name').inputValue();
  await f.getByLabel('Email').fill(`demo-${h.run}-fm-julia-${label}@example.com`);
  await f.getByLabel('Password').fill(h.PW);
  await h.shot(f, `first-minute-account-${label}`);
  await f.getByRole('button', { name: 'Create account' }).click();
  // Nothing in between: watch for the two old steps while the trip opens.
  const old = Promise.race([
    f.getByRole('button', { name: 'Join the trip' }).waitFor({ timeout: 15000 }).then(() => 'join again'),
    f.getByRole('heading', { name: 'How should people pay you back?' }).waitFor({ timeout: 15000 }).then(() => 'pay step'),
  ]).catch(() => null);
  await f.waitForURL(TRIP);
  await f.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  screens.push('The trip');
  r.seconds = Math.round((Date.now() - started) / 1000);
  r.screens = screens;
  r.oldStep = await Promise.race([old, new Promise((res) => setTimeout(() => res(null), 4000))]);
  sawJoinAgain.n = r.oldStep ? 1 : 0;
  // The guide checks once a second whether to start; give it time not to.
  await f.waitForTimeout(3500);
  r.tourStarted = await f.getByTestId('tour').count();
  r.emailBanner = await f.getByRole('status').filter({ hasText: 'Confirm your email' }).count();
  r.showMeAround = await f.getByRole('button', { name: 'Show me around' }).count();
  r.overflow = await h.overflowX(f);
  await h.shot(f, `first-minute-lands-${label}`);
  // Still quiet after a reload in the same visit.
  await f.reload();
  await f.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await f.waitForTimeout(2500);
  r.quietAfterReload = (await f.getByTestId('tour').count()) === 0 && (await f.getByRole('status').filter({ hasText: 'Confirm your email' }).count()) === 0;

  // ---------- Her first Settle up asks how people pay her, once ----------
  if (phone) await f.getByRole('tab', { name: /Money/ }).click();
  await money(f).getByRole('button', { name: 'Settle up' }).click();
  const ask = h.dlg(f).getByTestId('ask-my-pay');
  await ask.getByRole('heading', { name: 'How should people pay you back?' }).waitFor();
  await h.shot(f, `first-minute-settle-ask-${label}`);
  await ask.getByRole('button', { name: 'Not now' }).click();
  await ask.waitFor({ state: 'detached' });
  await h.dlg(f).getByRole('button', { name: 'Done' }).click();
  await money(f).getByRole('button', { name: 'Settle up' }).click();
  await h.dlg(f).getByText('The fewest payments').waitFor();
  r.askedOnce = (await h.dlg(f).getByTestId('ask-my-pay').count()) === 0;
  // She adds it from the same place after all; it's hers on every trip.
  const mine = h.dlg(f).getByRole('region', { name: 'How people pay you' });
  await mine.getByRole('button', { name: 'Add' }).click();
  await mine.getByLabel('Venmo username').fill('@julia-tt');
  await mine.getByRole('button', { name: 'Save' }).click();
  await mine.getByText('Venmo @julia-tt').waitFor();
  await h.dlg(f).getByRole('button', { name: 'Done' }).click();

  // ---------- An existing user: one tap, nothing to re-enter ----------
  await f.goto(link2);
  await f.getByText(/Join as/).waitFor();
  r.offered = (await f.locator('main').innerText()).replace(/\s+/g, ' ').match(/Join as Julia\?/)?.[0] ?? null;
  r.noForm = (await f.getByLabel('Email').count()) === 0 && (await f.getByLabel('Your name').count()) === 0;
  await h.shot(f, `first-minute-existing-${label}`);
  await f.getByRole('button', { name: 'Join the trip' }).click();
  await f.waitForURL(TRIP);
  await f.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  if (phone) await f.getByRole('tab', { name: /People/ }).click();
  r.venmoCameAlong = (await people(f).locator('li').filter({ hasText: 'Julia' }).getByTestId('pay-line').innerText()).includes('@julia-tt');

  // Not on the list yet: one button with her account's name.
  await f.goto(link3);
  await f.getByRole('button', { name: 'Join as Julia' }).click();
  await f.waitForURL(TRIP);
  await f.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  if (phone) await f.getByRole('tab', { name: /People/ }).click();
  await people(f).getByText('Julia').first().waitFor();
  r.addedInOneTap = true;
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok = r.nameFilledIn === 'Julia' && r.screens.length === 3 && r.oldStep === null && r.tourStarted === 0 && r.emailBanner === 0 &&
        r.showMeAround >= 1 && r.overflow <= 0 && r.quietAfterReload && r.askedOnce && r.offered === 'Join as Julia?' && r.noForm &&
        r.venmoCameAlong && r.addedInOneTap;
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
