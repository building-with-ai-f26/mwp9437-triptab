// Confirming your email (C6, Mike's 11/18 call: use TripTab right away, with a reminder), at 1280
// and 390 wide. A new email-and-password account sees the reminder on My Trips and on a trip;
// Send it again says an example.com address can't get email (the suites never email anyone); the
// reminder hides for the visit; a broken link explains itself; and a good link (the function's
// answer faked, since the real link only exists in an email) says Email confirmed.
// Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await p.goto(`${h.BASE}/sign-in?next=/trips`);
  await h.signUp(p, 'Cleo', `confirm-${label}`);
  await p.waitForURL(/\/trips$/);
  const banner = p.getByRole('status').filter({ hasText: 'Confirm your email' });
  await banner.waitFor();
  r.bannerNamesEmail = (await banner.innerText()).includes(`confirm-${label}@example.com`);
  await banner.getByRole('button', { name: 'Send it again' }).click();
  await banner.getByText("That address can't get email").waitFor();
  r.reservedExplained = true;
  r.overflow = await h.overflowX(p);
  await h.shot(p, `confirm-banner-${label}`);

  // It also shows on a trip, and hides for the visit.
  await p.goto(`${h.BASE}/trips/new`);
  await p.getByRole('button', { name: 'Fill in the ski trip example' }).click();
  await p.getByRole('button', { name: 'Start the trip' }).click();
  await p.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  r.onTrip = await banner.count();
  await banner.getByRole('button', { name: 'Hide this for now' }).click();
  r.hidden = (await banner.count()) === 0;
  await p.reload();
  await p.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  r.staysHidden = (await banner.count()) === 0;

  // A broken link, then a good one (faked).
  await p.goto(`${h.BASE}/confirm-email?t=not-a-token`);
  await p.getByRole('heading', { name: "That link didn't work" }).waitFor();
  r.broken = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
  r.tokenLeftAddressBar = !p.url().includes('t=');
  await p.route('**/functions/v1/confirm-email', (route) => route.fulfill({ contentType: 'application/json', body: '{"ok":true}' }));
  await p.goto(`${h.BASE}/confirm-email?t=${'a'.repeat(64)}`);
  await p.getByRole('heading', { name: 'Email confirmed' }).waitFor();
  r.confirmedOffers = await p.getByRole('link', { name: 'Open my trips' }).count();
  await h.shot(p, `confirm-done-${label}`);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok = r.bannerNamesEmail && r.reservedExplained && r.overflow <= 0 && r.onTrip === 1 && r.hidden && r.staysHidden &&
        /isn't complete/.test(r.broken) && r.tokenLeftAddressBar && r.confirmedOffers === 1;
      if (!ok) result.failure = `${label}: a check failed`;
    }
  } catch (e) {
    result.failure = String(e);
  } finally {
    // The broken link's refusal shows in the console as a failed request; it's what this checks.
    result.errors = h.errors.filter((e) => !e.includes('status of 400'));
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    if (result.failure || result.errors.length) process.exit(1);
  }
})();
