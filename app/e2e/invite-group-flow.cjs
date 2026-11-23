// Invite the group (C46, Mike's call 11/23), at 1280 and 390 wide. An owner alone on a new trip
// sees an Invite the group card at the top, with Copy the link, Text it and (where the browser has
// a share sheet, faked here) Share; the header's Invite button opens the same in a dialog; and the
// card goes once a second person is on the trip, while the header button stays.
// Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const ctx = await h.context(browser, opts);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ctx.addInitScript(() => {
    window.__shared = [];
    navigator.share = (d) => { window.__shared.push(d); return Promise.resolve(); };
  });
  const p = h.watch(await ctx.newPage(), label);
  await h.startSkiTrip(p, `invite-${label}`);

  const card = p.getByTestId('invite-card');
  await card.waitFor();
  r.cardTop = Math.round((await card.boundingBox()).y);
  r.aboveItinerary = r.cardTop < (await p.getByRole('heading', { name: 'Your Itinerary' }).boundingBox()).y;
  await card.getByRole('button', { name: 'Copy the link' }).click();
  await card.getByRole('button', { name: 'Copied' }).waitFor();
  r.copied = /\/join\/[0-9a-f]{20,}$/.test(await p.evaluate(() => navigator.clipboard.readText()));
  await card.getByRole('button', { name: 'Share' }).click();
  r.shared = await p.evaluate(() => /You're on the Euro ski trip trip in TripTab\. Tap to see the plan: http.*\/join\//.test(window.__shared[0]?.text ?? ''));
  r.textHref = /^sms:\?&body=.*join/.test(await card.getByRole('link', { name: 'Text it' }).getAttribute('href'));
  r.tapTargets = await card.locator('button, a').evaluateAll((els) => Math.min(...els.map((e) => Math.round(e.getBoundingClientRect().height))));
  r.overflow = await h.overflowX(p);
  await h.shot(p, `invite-card-${label}`);

  // The header button opens the same thing.
  await p.getByRole('button', { name: 'Invite the group' }).click();
  const d = h.dlg(p);
  await d.getByText("You're the only one here so far.").waitFor();
  r.dialogCopy = await d.getByRole('button', { name: 'Copy the link' }).count();
  await h.shot(p, `invite-dialog-${label}`);

  // Or add someone by name: the card goes, the header button stays and counts the people.
  await d.getByRole('button', { name: 'Or add someone by name' }).click();
  await h.dlg(p).getByLabel('Name').fill('Julia');
  await h.dlg(p).getByRole('button', { name: 'Add to trip' }).click();
  await h.dlg(p).getByText('Added Julia').waitFor();
  await h.dlg(p).getByRole('button', { name: 'Done' }).click();
  await card.waitFor({ state: 'detached' });
  r.cardGone = true;
  await p.getByRole('button', { name: 'Invite the group' }).click();
  await h.dlg(p).getByText('2 people are on it so far.').waitFor();
  r.headerStays = true;
  r.headerFits = await h.overflowX(p);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok = r.aboveItinerary && r.copied && r.shared && r.textHref && r.tapTargets >= 44 && r.overflow <= 0 &&
        r.dialogCopy === 1 && r.cardGone && r.headerStays && r.headerFits <= 0;
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
