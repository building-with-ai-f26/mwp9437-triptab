// "A new version of TripTab is ready" (C57, Mike's call 11/24), at 1280 and 390 wide. A tab that's
// running the live build shows nothing; once version.json names another build, the note appears
// within the 5-minute check, above the phone's bottom bar, with Reload and Later. Later hides it;
// Reload loads the page again, and the fresh page shows no note. The page's clock is fast-forwarded
// so nobody waits five minutes. Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const phone = label === 'phone';
  const ctx = await h.context(browser, opts);
  const p = h.watch(await ctx.newPage(), label);
  await p.clock.install();
  await h.startSkiTrip(p, `newver-${label}`);
  const note = p.getByTestId('new-version');

  // The live build is this one: nothing, even after a check.
  await p.clock.fastForward('06:00');
  await p.waitForTimeout(500);
  r.quietWhenCurrent = (await note.count()) === 0;

  // triptab.org is updated: the next check offers a reload.
  await p.route('**/version.json*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'a-newer-build' }) }));
  await p.clock.fastForward('06:00');
  await note.waitFor();
  r.text = (await note.innerText()).replace(/\s+/g, ' ').trim();
  const box = await note.boundingBox();
  if (phone) {
    const bar = await p.getByTestId('bottom-bar').boundingBox();
    r.clearOfBar = box.y + box.height <= bar.y;
  } else r.clearOfBar = true;
  r.minTap = await note.getByRole('button').evaluateAll((els) => Math.min(...els.map((e) => Math.round(e.getBoundingClientRect().height))));
  r.overflow = await h.overflowX(p);
  await h.shot(p, `new-version-${label}`);

  // Later hides it for this tab.
  await note.getByRole('button', { name: 'Later' }).click();
  r.laterHides = (await note.count()) === 0;

  // Reload: a fresh page, with no note.
  const p2 = h.watch(await ctx.newPage(), `${label}-2`);
  await p2.clock.install();
  await p2.route('**/version.json*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'a-newer-build' }) }));
  await p2.goto(p.url());
  await p2.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await p2.clock.fastForward('06:00');
  await p2.getByTestId('new-version').waitFor();
  await p2.unroute('**/version.json*');
  const loaded = p2.waitForEvent('load');
  await p2.getByTestId('new-version').getByRole('button', { name: 'Reload' }).click();
  await loaded;
  await p2.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  r.reloadedClean = (await p2.getByTestId('new-version').count()) === 0;
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok = r.quietWhenCurrent && /A new version of TripTab is ready\. Reload to get it\. Reload Later/.test(r.text) && r.clearOfBar &&
        r.minTap >= 44 && r.overflow <= 0 && r.laterHides && r.reloadedClean;
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
