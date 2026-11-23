// The landing page (C48, part 2; 11/23 review, item 8), at 1280 and 390 wide, signed out. The
// three cards that looked like buttons are buttons: each takes you to its screen of the product.
// See how it works does the same; the three screens load; both Start a trip buttons go to sign-up;
// nothing scrolls sideways. No account is made. Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await p.goto(`${h.BASE}/`);
  await p.getByRole('heading', { name: /Plan it\. Split it\./ }).waitFor();
  r.startOnFirstScreen = (await p.getByRole('button', { name: 'Start a trip' }).first().boundingBox()).y < opts.viewport.height;
  await h.shot(p, `landing-${label}`);

  // Each card is a button that brings its screen into view.
  r.cards = [];
  for (const [title, id] of [["Everyone's on it", 'invite'], ['A plan and its cost are one thing', 'plans'], ['The tab settles itself', 'settle']]) {
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.getByRole('button', { name: new RegExp(`^${title}`) }).click();
    await p.waitForFunction((i) => {
      const b = document.getElementById(`how-${i}`).getBoundingClientRect();
      return b.top >= -4 && b.top < window.innerHeight * 0.5;
    }, id);
    r.cards.push(id);
  }
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.getByRole('button', { name: 'See how it works' }).click();
  await p.waitForFunction(() => document.getElementById('how-invite').getBoundingClientRect().top < window.innerHeight * 0.5);
  r.seeHow = true;

  // The three screens are real images that loaded, with words for a screen reader.
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await p.waitForFunction(() => [...document.querySelectorAll('section img')].every((i) => i.complete && i.naturalWidth > 0));
  r.images = await p.locator('section img').evaluateAll((els) => els.map((i) => ({ w: i.naturalWidth, alt: i.alt.length > 20 })));
  r.overflow = await h.overflowX(p);
  await p.locator('#how-plans').scrollIntoViewIfNeeded();
  await p.waitForTimeout(500);
  await h.shot(p, `landing-how-${label}`);

  // Both Start a trip buttons lead to making an account, then Start a trip.
  await p.getByRole('button', { name: 'Start a trip' }).last().click();
  await p.waitForURL(/\/sign-in\?next=%2Ftrips%2Fnew|\/sign-in\?next=\/trips\/new/);
  r.bottomStart = true;
  await p.goto(`${h.BASE}/`);
  await p.getByRole('button', { name: 'Start a trip' }).first().click();
  await p.waitForURL(/\/sign-in\?next=/);
  r.topStart = true;
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok = r.startOnFirstScreen && r.cards.length === 3 && r.seeHow && r.images.length === 3 && r.images.every((i) => i.w >= 700 && i.alt) &&
        r.overflow <= 0 && r.bottomStart && r.topStart;
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
