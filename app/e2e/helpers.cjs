// Shared pieces for the Playwright click-throughs (build4 onward).
// Every run is tagged test_run in PostHog (src/lib/analytics.ts) so dashboards leave it out.
// PostHog drops events from browsers that look automated, so runs present a normal Chrome.
const path = require('path');
const { devices } = require('playwright');

// E2E_SHOTS sends a run's screenshots elsewhere (a full re-run that shouldn't rewrite the committed ones).
const OUT = process.env.E2E_SHOTS || path.join(__dirname, '..', '..', 'docs', 'screenshots');
// E2E_BASE points the flows at another copy of the app, such as a pull request's Preview (which
// uses TripTab dev). Don't point a flow that signs people up at https://triptab.org: production is
// for real users, and the flows make accounts. The one exception is e2e/rls-proof.cjs (C14).
const BASE = process.env.E2E_BASE || 'http://localhost:5173';
const run = Math.random().toString(36).slice(2, 7);
const PW = `demo-${run}-Passw0rd`;
const DESKTOP = {
  viewport: { width: 1280, height: 800 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent };
const errors = [];

async function context(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => {
    try { localStorage.setItem('triptab.test_run', '1'); } catch {}
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'userAgentData', { get: () => ({ brands: [{ brand: 'Google Chrome', version: '131' }], mobile: false, platform: 'Windows' }) });
  });
  return ctx;
}

function watch(page, who) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${who}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${who}: ${e}`));
  return page;
}

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 80 });
const dlg = (page) => page.locator('dialog[open]');
const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/**
 * Where Google sign-in is on, the sign-in form starts with Google and keeps email behind "Use email
 * and a password instead" (Mike's 11/18 call). Opens the email form if it's folded; does nothing if
 * it's already open (or Google is off).
 */
async function withEmail(page) {
  const fold = page.getByRole('button', { name: 'Use email and a password instead' });
  await Promise.race([fold.waitFor(), page.getByLabel('Email').waitFor()]);
  if (await fold.isVisible()) await fold.click();
  await page.getByLabel('Email').waitFor();
}

async function signUp(page, name, who) {
  await withEmail(page);
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(`demo-${run}-${who}@example.com`);
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Create account' }).click();
}

/** Signs up as the owner and starts the ski trip example; returns the trip URL. */
async function startSkiTrip(page, who = 'owner') {
  await page.goto(`${BASE}/sign-in?next=/trips/new`);
  await signUp(page, 'Mike', who);
  await page.waitForURL(/\/trips\/new/);
  await page.getByRole('button', { name: 'Fill in the ski trip example' }).click();
  await page.getByRole('button', { name: 'Start the trip' }).click();
  await page.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  return page.url();
}

/**
 * The plan dialog folds cost (with who pays and Confirm) and times away until they're used (Mike's
 * 11/19 review). These open a fold if it's shut, and leave it alone if it's open.
 */
async function openFold(d, name) {
  const b = d.getByRole('button', { name });
  if ((await b.getAttribute('aria-expanded')) === 'false') await b.click();
}
const openCost = (d) => openFold(d, /^Cost/);
const openTimes = (d) => openFold(d, /^Times/);

async function addPlan(page, day, slot, f) {
  await page.locator(`#day-${day}`).getByRole('button', { name: slot }).click();
  const d = dlg(page);
  await d.getByLabel('What').fill(f.title);
  if (f.kind) await d.getByRole('radio', { name: f.kind }).click();
  if (f.checkout) await d.getByLabel('Check out').selectOption(f.checkout);
  if (f.status) await d.getByRole('radio', { name: f.status }).click();
  // Cost starts folded (11/17): open it only when the plan has one.
  if (f.est || f.perPerson) await openCost(d);
  if (f.est) await d.getByLabel(/Estimated/).fill(f.est);
  if (f.perPerson) await d.getByRole('radio', { name: 'Per person' }).click();
  await d.getByRole('button', { name: 'Add to trip' }).click();
  await page.locator(`#day-${day}`).getByText(f.title).first().waitFor();
}

/** Signs in to an account an earlier signUp(page, name, who) made, through the Sign in tab. */
/**
 * Taps Join the trip. Right after joining, TripTab asks how people pay you (Mike's 11/18 notes);
 * flows about other things skip it. Returns true if that step showed.
 */
async function joinTrip(page) {
  await page.getByRole('button', { name: 'Join the trip' }).click();
  const step = page.getByRole('heading', { name: 'How should people pay you back?' });
  await Promise.race([step.waitFor(), page.waitForURL(/\/trips\/[0-9a-f-]{36}$/)]);
  if (!(await step.isVisible())) return false;
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  return true;
}

/** The trip's one AI button (Mike's 11/18 call), then a choice: 'I have bookings' or 'Give me ideas'. */
async function openAi(page, choice) {
  await page.getByRole('button', { name: 'AI help' }).click();
  await dlg(page).getByRole('button', { name: new RegExp(`^${choice}`) }).click();
}

async function signIn(page, who) {
  await withEmail(page);
  await page.getByRole('tab', { name: 'Sign in' }).click();
  await page.getByLabel('Email').fill(`demo-${run}-${who}@example.com`);
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

module.exports = { openCost, openTimes, run, PW, signIn, joinTrip, withEmail, openAi, OUT, BASE, DESKTOP, PHONE, errors, context, watch, shot, dlg, overflowX, signUp, startSkiTrip, addPlan };
