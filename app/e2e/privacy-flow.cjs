// The privacy page (Build 3), which Google's consent screen links to before Google sign-in can be
// published: it opens signed out, from the landing page and from sign-in, reads at 1280 and 390
// with no sideways scroll, and its contact link is a mailto. Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const BASE = process.env.E2E_BASE || 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    const ctx = await h.context(browser, h.DESKTOP);
    const page = h.watch(await ctx.newPage(), 'visitor');

    await page.goto(`${BASE}/`);
    await page.getByRole('link', { name: 'Privacy' }).click();
    await page.getByRole('heading', { name: 'How TripTab uses your data' }).waitFor();
    result.fromLanding = new URL(page.url()).pathname;
    result.sections = await page.locator('article h2').allTextContents();
    result.contact = await page.locator('article a[href^="mailto:"]').first().getAttribute('href');
    result.desktopOverflow = await h.overflowX(page);
    await h.shot(page, 'privacy-desktop');

    await page.goto(`${BASE}/sign-in`);
    await page.getByRole('link', { name: 'How TripTab uses your data' }).click();
    await page.getByRole('heading', { name: 'How TripTab uses your data' }).waitFor();
    result.fromSignIn = new URL(page.url()).pathname;

    const pCtx = await h.context(browser, h.PHONE);
    const p = h.watch(await pCtx.newPage(), 'visitor-phone');
    await p.goto(`${BASE}/privacy`);
    await p.getByRole('heading', { name: 'How TripTab uses your data' }).waitFor();
    result.phoneOverflow = await h.overflowX(p);
    await h.shot(p, 'privacy-phone');

    const ok =
      result.fromLanding === '/privacy' &&
      result.fromSignIn === '/privacy' &&
      result.sections.length >= 5 &&
      result.contact === 'mailto:privacy@triptab.org' &&
      result.desktopOverflow <= 0 &&
      result.phoneOverflow <= 0;
    if (!ok) result.failure = 'privacy page checks did not all pass';
  } catch (e) {
    result.failure = String(e);
  } finally {
    result.errors = h.errors;
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    if (result.failure || result.errors.length) process.exit(1);
  }
})();
