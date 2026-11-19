// "Continue with Google" (Build 3). The button shows only where the Supabase project has Google
// turned on: with the settings answer faked to say Google is off it is absent and the email form
// shows; faked to say Google is on, Google comes first and the email form waits behind "Use email
// and a password instead" (Mike's 11/18 call), and clicking Google leaves for Supabase's Google sign-in
// with a PKCE code challenge and the right way back: the sign-in page's next step, or the group
// link with the picked name. The trip to Google itself isn't made (no Google account in tests).
// Screens at 390 and 1280. Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const googleSetTo = (on) => async (ctx) =>
  ctx.route('**/auth/v1/settings', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.external = { ...body.external, google: on };
    await route.fulfill({ response: res, json: body });
  });
const googleOn = googleSetTo(true);
const googleOff = googleSetTo(false);

// Stops the browser at Supabase's authorize step and reports where it was going.
const catchAuthorize = (page) =>
  new Promise((resolve) => {
    page.route('**/auth/v1/authorize**', (route) => {
      resolve(new URL(route.request().url()));
      route.abort();
    });
  });

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    // ---------- Google off: no button, and the email form shows straight away ----------
    const offCtx = await h.context(browser, h.DESKTOP);
    await googleOff(offCtx);
    const off = h.watch(await offCtx.newPage(), 'google-off');
    await off.goto(`${h.BASE}/sign-in`);
    await off.getByRole('tab', { name: 'Sign in' }).waitFor();
    await off.waitForTimeout(800);
    result.buttonWhenOff = await off.getByRole('button', { name: 'Continue with Google' }).count();
    result.emailWhenOff = await off.getByLabel('Email').isVisible();

    // ---------- Google on: the sign-in page ----------
    const dCtx = await h.context(browser, h.DESKTOP);
    await googleOn(dCtx);
    const d = h.watch(await dCtx.newPage(), 'google-desktop');
    await d.goto(`${h.BASE}/sign-in?next=/trips/new`);
    await d.getByRole('button', { name: 'Continue with Google' }).waitFor();
    result.emailFoldedFirst = (await d.getByLabel('Email').count()) === 0;
    await h.shot(d, 'sign-in-google-desktop');
    // One tap opens the email form, with Google still above it.
    await d.getByRole('button', { name: 'Use email and a password instead' }).click();
    result.emailOpens = await d.getByLabel('Email').isVisible();
    result.googleStillThere = await d.getByRole('button', { name: 'Continue with Google' }).isVisible();
    await h.shot(d, 'sign-in-email-open-desktop');
    const leaving = catchAuthorize(d);
    await d.getByRole('button', { name: 'Continue with Google' }).click();
    const url = await leaving;
    result.provider = url.searchParams.get('provider');
    result.pkce = Boolean(url.searchParams.get('code_challenge')) && url.searchParams.get('code_challenge_method') === 's256';
    result.returnsTo = new URL(url.searchParams.get('redirect_to')).pathname + new URL(url.searchParams.get('redirect_to')).search;

    // ---------- Google on: the group link keeps the picked name ----------
    const oCtx = await h.context(browser, h.DESKTOP);
    const o = h.watch(await oCtx.newPage(), 'owner');
    await h.startSkiTrip(o);
    const groupUrl = (await o.locator('section[aria-labelledby="link-title"] code').textContent()).trim();

    const pCtx = await h.context(browser, h.PHONE);
    await googleOn(pCtx);
    const p = h.watch(await pCtx.newPage(), 'google-phone');
    await p.goto(groupUrl);
    await p.getByRole('button', { name: "Don't see your name?" }).click();
    await p.getByLabel('Your name').first().fill('Jo Ann');
    await p.getByRole('button', { name: 'Next' }).click();
    await p.getByRole('button', { name: 'Continue with Google' }).waitFor();
    result.joinEmailFolded = (await p.getByLabel('Email').count()) === 0;
    result.phoneOverflow = await h.overflowX(p);
    await h.shot(p, 'join-google-phone');
    const leavingJoin = catchAuthorize(p);
    await p.getByRole('button', { name: 'Continue with Google' }).click();
    const back = new URL((await leavingJoin).searchParams.get('redirect_to'));
    result.joinReturnsTo = back.pathname + back.search;

    // Coming back to that address before signing in shows the same step: joining as Jo Ann.
    await p.unroute('**/auth/v1/authorize**');
    await p.goto(back.toString());
    await p.getByText('Joining as').waitFor();
    result.joinStepKept = (await p.getByText('Joining as').textContent()).includes('Jo Ann');
    const ok =
      result.buttonWhenOff === 0 && result.emailWhenOff && result.emailFoldedFirst && result.emailOpens && result.googleStillThere &&
      result.provider === 'google' && result.pkce && result.joinEmailFolded && result.phoneOverflow <= 0 && result.joinStepKept;
    if (!ok) result.failure = 'a check failed';
  } catch (e) {
    result.failure = String(e);
  } finally {
    result.errors = h.errors.filter((e) => !/net::ERR_FAILED|ERR_ABORTED/.test(e));
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    if (result.failure || result.errors.length) process.exit(1);
  }
})();
