// Email-in (Mike's call, 11/20): forward a booking confirmation to the trip's own address, then review
// it on the trip. At 1280 and 390 wide, against TripTab dev. The Owner finds the address under AI
// help, I have bookings; a made-up car rental confirmation (HTML, the way mail programs forward it)
// and an empty email go to that address through the dev-only test path, standing in for Cloudflare's
// email handler. Both show up on the trip without a reload; the booking opens on import's review and
// is added, the empty one says why and is dismissed. One real AI call per width (logged as a test run).
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const h = require('./helpers.cjs');

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')
    .map((l) => l.match(/^(VITE_[A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
);
const SUPABASE = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

const CAR = (to) => [
  'From: Mike <mike@example.com>',
  `To: ${to}`,
  'Subject: Fwd: Your Europcar reservation is confirmed',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<html><body><p>---------- Forwarded message ---------</p><h2>Your reservation is confirmed</h2>',
  '<table><tr><td>Confirmation</td><td>EC-58213</td></tr>',
  '<tr><td>Pick-up</td><td>Geneva Airport, Fri 5 Feb 2027, 10:30</td></tr>',
  '<tr><td>Return</td><td>Geneva Airport, Tue 16 Feb 2027, 09:00</td></tr>',
  '<tr><td>Car</td><td>VW Golf or similar</td></tr><tr><td>Total</td><td>EUR 412.80</td></tr></table></body></html>',
].join('\r\n');
const EMPTY = (to) => ['From: Mike <mike@example.com>', `To: ${to}`, 'Subject: Fwd: (no subject)', 'Content-Type: text/plain', '', ''].join('\r\n');

/** The page's signed-in session token, as the app keeps it. */
const tokenOf = (p) =>
  p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x));
    return JSON.parse(localStorage.getItem(k)).access_token;
  });

async function send(p, to, raw) {
  const res = await fetch(`${SUPABASE}/functions/v1/inbox-email`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${await tokenOf(p)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, raw }),
  });
  return `${res.status} ${JSON.stringify(await res.json().catch(() => ({})))}`;
}

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `inbox-${label}`);

  // The trip's address, under AI help, I have bookings.
  await h.openAi(p, 'I have bookings');
  const box = h.dlg(p).getByTestId('forward-address');
  await box.waitFor();
  const address = (await box.getByTestId('forward-address-text').innerText()).trim();
  r.address = /^trip\+[0-9a-f]{16}@triptab\.org$/.test(address);
  await box.getByRole('button', { name: 'Copy' }).click();
  r.copied = await box.getByRole('button', { name: 'Copied' }).isVisible();
  await h.shot(p, `inbox-address-${label}`);
  await h.dlg(p).getByRole('button', { name: 'Cancel' }).click();
  await h.dlg(p).waitFor({ state: 'detached' });

  // Two emails come in; the trip shows them without a reload.
  r.sentEmpty = await send(p, address, EMPTY(address));
  r.sentCar = await send(p, address, CAR(address));
  const banner = p.getByTestId('inbox');
  await banner.getByText('A booking came in by email').waitFor({ timeout: 60000 });
  await p.getByTestId('inbox-item').nth(1).waitFor();
  r.bannerText = (await banner.innerText()).replace(/\s+/g, ' ');
  r.bannerOverflow = await h.overflowX(p);
  await banner.scrollIntoViewIfNeeded();
  await h.shot(p, `inbox-banner-${label}`);

  // Review the booking: it opens on import's review, and adding it puts it on the trip.
  await banner.getByRole('button', { name: 'Review' }).click();
  const d = h.dlg(p);
  await d.getByRole('heading', { name: "From Mike's email" }).waitFor();
  r.reviewSummary = (await d.getByTestId('import-summary').innerText()).trim();
  await h.shot(p, `inbox-review-${label}`);
  await d.getByRole('button', { name: /^Add \d+ to the trip$/ }).click();
  await d.waitFor({ state: 'detached' });
  await p.locator('.item-card').filter({ hasText: /Europcar|car|Car/ }).first().waitFor();
  r.planAdded = true;

  // What's left is the empty one: it says why, and Dismiss clears it.
  await p.getByTestId('inbox-item').nth(1).waitFor({ state: 'detached' });
  r.leftText = (await banner.innerText()).replace(/\s+/g, ' ');
  await banner.getByRole('button', { name: 'Dismiss' }).click();
  await banner.waitFor({ state: 'detached' });
  r.cleared = true;
  r.overflow = await h.overflowX(p);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok =
        r.address && r.copied && /^200 /.test(r.sentEmpty) && /^200 /.test(r.sentCar) &&
        /Fwd: Your Europcar reservation is confirmed/.test(r.bannerText) && /plan(s)? to review/.test(r.bannerText) &&
        /That email had nothing to read/.test(r.bannerText) && r.planAdded &&
        /An email couldn't be read/.test(r.leftText) && r.cleared && r.bannerOverflow <= 0 && r.overflow <= 0;
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
