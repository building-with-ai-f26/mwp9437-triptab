// "Forgot password?" (Build 3). Asking for a reset link (the email send is intercepted: until the
// project sends through Resend, Supabase's built-in sender only reaches the project team), the
// page a dead link opens, and setting a new password on /reset-password, then signing in with it.
// The email link itself (token_hash in Supabase's "Reset password" template) is checked by hand
// once Resend is set up. Screens at 1280 and 390. Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  const email = `demo-${h.run}-reset@example.com`;
  const NEW_PW = `new-${h.run}-Passw0rd`;
  try {
    // An account to reset.
    const aCtx = await h.context(browser, h.DESKTOP);
    const a = h.watch(await aCtx.newPage(), 'signup');
    await a.goto(`${h.BASE}/sign-in`);
    await h.signUp(a, 'Rae', 'reset');
    await a.waitForURL(/\/trips/);
    await aCtx.close();

    // ---------- Ask for a link (desktop, signed out) ----------
    const dCtx = await h.context(browser, h.DESKTOP);
    const d = h.watch(await dCtx.newPage(), 'ask');
    let recover = null;
    await d.route('**/auth/v1/recover**', async (route) => {
      recover = { url: new URL(route.request().url()), body: route.request().postDataJSON() };
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await d.goto(`${h.BASE}/sign-in?mode=sign-in`);
    await d.getByRole('button', { name: 'Forgot password?' }).click();
    await d.getByRole('heading', { name: 'Reset your password' }).waitFor();
    result.passwordFieldHidden = (await d.getByLabel('Password').count()) === 0;
    await d.getByLabel('Email').fill(email);
    await d.getByRole('button', { name: 'Email me a reset link' }).click();
    await d.getByRole('status').waitFor();
    result.confirmation = (await d.getByRole('status').textContent()).trim();
    result.sentFor = recover?.body?.email;
    result.linkGoesTo = recover && new URL(recover.url.searchParams.get('redirect_to')).pathname;
    await h.shot(d, 'reset-sent-desktop');
    await d.getByRole('button', { name: 'Back to sign in' }).click();
    result.backToSignIn = await d.getByRole('heading', { name: 'Welcome back' }).isVisible();

    // ---------- A used or made-up link ----------
    // Supabase refuses the made-up token with a 403, which the browser logs; that one is expected.
    const xCtx = await h.context(browser, h.PHONE);
    const x = h.watch(await xCtx.newPage(), 'dead-link');
    const refused = [];
    x.on('response', (r) => r.status() === 403 && refused.push(new URL(r.url()).pathname));
    await x.goto(`${h.BASE}/reset-password?token_hash=not-a-real-token&type=recovery`);
    await x.getByRole('heading', { name: 'This link has run out' }).waitFor();
    result.deadLinkSaysSo = true;
    result.tokenLeftAddress = !x.url().includes('token_hash');
    result.refusedBy = refused;
    await h.shot(x, 'reset-dead-link-phone');

    // ---------- Pick a new password (phone), then sign in with it ----------
    const pCtx = await h.context(browser, h.PHONE);
    const p = h.watch(await pCtx.newPage(), 'new-password');
    await p.goto(`${h.BASE}/sign-in?mode=sign-in`);
    await p.getByLabel('Email').fill(email);
    await p.getByLabel('Password').fill(h.PW);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click();
    await p.waitForURL(/\/trips/);
    await p.goto(`${h.BASE}/reset-password`);
    await p.getByRole('heading', { name: 'Pick a new password' }).waitFor();
    result.phoneOverflow = await h.overflowX(p);
    await h.shot(p, 'reset-new-password-phone');
    await p.getByLabel('New password').fill(NEW_PW);
    await p.getByRole('button', { name: 'Save and open my trips' }).click();
    await p.waitForURL(/\/trips$/);
    result.savedLandsOnTrips = true;

    const sCtx = await h.context(browser, h.DESKTOP);
    const s = h.watch(await sCtx.newPage(), 'sign-in-new');
    await s.goto(`${h.BASE}/sign-in?mode=sign-in`);
    await s.getByLabel('Email').fill(email);
    await s.getByLabel('Password').fill(NEW_PW);
    await s.getByRole('button', { name: 'Sign in', exact: true }).click();
    await s.waitForURL(/\/trips/);
    result.newPasswordSignsIn = true;
    await s.goto(`${h.BASE}/sign-in?mode=sign-in`);
    await s.waitForURL(/\/trips/); // signed in already: the sign-in page moves on
  } catch (e) {
    result.failure = String(e);
  } finally {
    // The only error allowed: the dead link's 403, and only if it came from Supabase's token check.
    const onlyVerify = (result.refusedBy || []).length > 0 && result.refusedBy.every((p) => p === '/auth/v1/verify');
    result.errors = h.errors.filter((e) => !(onlyVerify && e.startsWith('dead-link:') && e.includes('403')));
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    if (result.failure || result.errors.length) process.exit(1);
  }
})();
