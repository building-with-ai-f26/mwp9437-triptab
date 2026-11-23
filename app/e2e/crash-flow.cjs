// A page that crashes shows "Something went wrong" with a Reload button instead of a blank screen
// (C48, Mike's call 11/23), at 1280 and 390 wide. The privacy page's code is swapped for one that
// throws while drawing. Run with `npm run dev` going. (posthog-check.cjs checks the error reaches
// PostHog scrubbed.)
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = await (await h.context(browser, opts)).newPage();
  await p.route('**/src/pages/Privacy.tsx*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'export default function Privacy() { throw new Error("made-up crash for the click-through"); }' }));
  await p.goto(`${h.BASE}/privacy`);
  await p.getByRole('heading', { name: 'Something went wrong' }).waitFor();
  r.reload = await p.getByRole('button', { name: 'Reload' }).count();
  const box = await p.getByRole('button', { name: 'Reload' }).boundingBox();
  r.tapTarget = Math.round(box.height);
  r.overflow = await h.overflowX(p);
  await h.shot(p, `crash-screen-${label}`);
  // Reload, with the real page back, recovers.
  await p.unroute('**/src/pages/Privacy.tsx*');
  await p.getByRole('button', { name: 'Reload' }).click();
  await p.getByRole('heading', { name: 'Privacy' }).first().waitFor();
  r.recovered = true;
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      if (!(r.reload === 1 && r.tapTarget >= 44 && r.overflow <= 0 && r.recovered)) result.failure = `${label}: a check failed`;
    }
  } catch (e) {
    result.failure = String(e);
  } finally {
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    if (result.failure) process.exit(1);
  }
})();
