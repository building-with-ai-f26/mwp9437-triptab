// Link Google (C19, Mike's call 11/20): an email account links Google from My Trips, so Google signs
// in there instead of starting a second account. At 1280 and 390 wide, against TripTab dev. Google
// itself can't be reached from a test, so Supabase's answers are faked: whether Google sign-in is on,
// the link request (checked for Google and the way back to My Trips), and the two refusals Mike could
// meet (linking not turned on yet; that Google account already has its own TripTab account).
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const googleOn = (ctx, on) =>
  ctx.route('**/auth/v1/settings', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.external = { ...body.external, google: on };
    await route.fulfill({ response: res, json: body });
  });

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const ctx = await h.context(browser, opts);
  await googleOn(ctx, true);
  const p = h.watch(await ctx.newPage(), label);
  await p.goto(`${h.BASE}/sign-in?next=/trips`);
  await h.signUp(p, 'Mike', `linkg-${label}`);
  await p.waitForURL(/\/trips$/);

  const card = p.getByTestId('link-google');
  await card.waitFor();
  r.card = (await card.innerText()).replace(/\s+/g, ' ');
  r.overflow = await h.overflowX(p);
  await card.scrollIntoViewIfNeeded();
  await h.shot(p, `link-google-${label}`);

  // Linking isn't turned on yet (Supabase answers 404 manual_linking_disabled): it says so.
  await p.route('**/auth/v1/user/identities/authorize**', (route) =>
    route.fulfill({ status: 404, json: { code: 404, error_code: 'manual_linking_disabled', msg: 'Manual linking is disabled' } }),
  );
  const before = h.errors.length;
  await card.getByRole('button', { name: 'Link Google' }).click();
  r.notOn = (await card.getByRole('alert').innerText()).trim();
  // The browser logs the faked 404 itself; that one is expected.
  for (let i = h.errors.length - 1; i >= before; i--) if (/Failed to load resource: .*404/.test(h.errors[i])) h.errors.splice(i, 1);
  await p.unroute('**/auth/v1/user/identities/authorize**');

  // Turned on: it asks Supabase to link Google, coming back to My Trips. Here Supabase sends it back
  // the way it does when that Google account already has its own TripTab account.
  let asked = null;
  await p.route('**/auth/v1/user/identities/authorize**', (route) => {
    asked = new URL(route.request().url());
    route.fulfill({
      json: { url: `${h.BASE}/trips?linked=google#error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user` },
    });
  });
  await card.getByRole('button', { name: 'Link Google' }).click();
  await p.waitForURL(/error_code=identity_already_exists/);
  r.provider = asked?.searchParams.get('provider');
  r.back = asked?.searchParams.get('redirect_to');
  r.taken = (await p.getByTestId('link-google').getByRole('alert').innerText()).trim();
  r.notLinked = (await p.getByTestId('google-linked').count()) === 0;
  await h.shot(p, `link-google-taken-${label}`);

  // Where Google sign-in is off, there's nothing to link.
  const off = await h.context(browser, opts);
  await googleOn(off, false);
  const q = h.watch(await off.newPage(), `${label}-off`);
  await q.goto(`${h.BASE}/sign-in?next=/trips`);
  await h.signUp(q, 'Mike', `linkg-off-${label}`);
  await q.waitForURL(/\/trips$/);
  await q.getByRole('heading', { name: 'No trips yet' }).waitFor();
  await q.waitForTimeout(800);
  r.hiddenWhenOff = (await q.getByTestId('link-google').count()) === 0;
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok =
        /Sign in with Google too/.test(r.card) && /@example\.com/.test(r.card) && r.overflow <= 0 &&
        /isn't turned on yet/.test(r.notOn) && r.provider === 'google' && /\/trips\?linked=google$/.test(r.back ?? '') &&
        /already has its own TripTab account/.test(r.taken) && r.notLinked && r.hiddenWhenOff;
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
