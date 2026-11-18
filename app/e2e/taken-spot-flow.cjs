// A joined spot asks you to sign in (the 11/17 pod test: a podmate who joined on her phone found
// her name "taken" on her laptop). Vic joins on a phone; then, on a laptop and signed out, the
// same link offers "Joined · Sign in" on Vic's name, and signing in opens the trip. Typing a joined
// name under "Don't see your name?" leads to the same sign-in. Signed in as someone else, Vic's
// spot stays shut. Screens at 390 (phone) and 1280 (desktop). Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    // ---------- Owner starts the ski trip and adds Vic ----------
    const oCtx = await h.context(browser, h.DESKTOP);
    const o = h.watch(await oCtx.newPage(), 'owner');
    result.tripUrl = await h.startSkiTrip(o);
    await o.locator('section[aria-labelledby="people-title"]').getByRole('button', { name: 'Add', exact: true }).click();
    await h.dlg(o).getByLabel('Name').fill('Vic');
    await h.dlg(o).getByRole('radio', { name: 'Viewer' }).click();
    await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
    await h.dlg(o).getByText('Added Vic').waitFor();
    await h.dlg(o).getByRole('button', { name: 'Done' }).click();
    const groupUrl = (await o.locator('section[aria-labelledby="link-title"] code').textContent()).trim();

    // ---------- Vic joins on a phone ----------
    const vCtx = await h.context(browser, h.PHONE);
    const v = h.watch(await vCtx.newPage(), 'vic-phone');
    await v.goto(groupUrl);
    await v.getByRole('button', { name: 'Vic' }).click();
    await h.signUp(v, 'Vic', 'vic');
    await h.joinTrip(v);
    await v.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
    await vCtx.close();

    // ---------- Same link on a laptop, signed out: Vic's spot asks to sign in ----------
    const lCtx = await h.context(browser, h.DESKTOP);
    const l = h.watch(await lCtx.newPage(), 'vic-laptop');
    await l.goto(groupUrl);
    await l.getByText('Who are you?').waitFor();
    const vicButton = l.getByRole('button', { name: /^Vic, joined/ });
    result.joinedSpotOpen = await vicButton.isEnabled();
    result.joinedSpotLabel = (await vicButton.textContent()).trim();
    await h.shot(l, 'join-joined-spot-desktop');
    await vicButton.click();
    await l.getByText('already joined this trip').waitFor();
    result.signInTabSelected = await l.getByRole('tab', { name: 'Sign in' }).getAttribute('aria-selected');
    await h.shot(l, 'join-sign-in-to-spot-desktop');
    await l.getByLabel('Email').fill(`demo-${h.run}-vic@example.com`);
    await l.getByLabel('Password').fill(h.PW);
    await l.getByRole('button', { name: 'Sign in', exact: true }).click();
    await l.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
    await l.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
    result.laptopLandsOnTrip = l.url().endsWith(result.tripUrl.split('/').pop());

    // ---------- Phone, signed out: typing a joined name leads to the same sign-in ----------
    const pCtx = await h.context(browser, h.PHONE);
    const p = h.watch(await pCtx.newPage(), 'typed-name-phone');
    await p.goto(groupUrl);
    await p.getByRole('button', { name: "Don't see your name?" }).click();
    await p.getByLabel('Your name').first().fill('  vic ');
    await p.getByRole('button', { name: 'Next' }).click();
    await p.getByText('already joined this trip').waitFor();
    result.typedNameAsksSignIn = true;
    result.phoneOverflow = await h.overflowX(p);
    await h.shot(p, 'join-sign-in-to-spot-phone');
    await p.getByRole('button', { name: 'Not you?' }).click();
    await p.getByText('Who are you?').waitFor();
    result.notYouGoesBack = true;

    // ---------- Signed in as someone else: Vic's spot stays shut ----------
    const sCtx = await h.context(browser, h.DESKTOP);
    const s = h.watch(await sCtx.newPage(), 'stranger');
    await s.goto(`${h.BASE}/sign-in`);
    await h.signUp(s, 'Sam', 'sam');
    await s.waitForURL(/\/trips/);
    await s.goto(groupUrl);
    await s.getByText('Who are you?').waitFor();
    const shut = s.getByRole('button', { name: /^Vic/ });
    result.otherAccountSpotShut = await shut.isDisabled();
    result.otherAccountLabel = (await shut.textContent()).trim();
  } catch (e) {
    result.failure = String(e);
  } finally {
    result.errors = h.errors;
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    if (result.failure || h.errors.length) process.exit(1);
  }
})();
