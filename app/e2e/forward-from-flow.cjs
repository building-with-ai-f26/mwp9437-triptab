// Also forward from (C31, Mike's call 11/21), at 1280 and 390 wide, against TripTab dev: on My
// Trips, add another address to forward bookings from, type the code (dev hands a test address's
// code back, since example.com gets no mail), see it work, then remove it. Run with `npm run dev`
// going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await p.goto(`${h.BASE}/sign-in?next=/trips`);
  await h.signUp(p, 'Mike', `fwd-${label}`);
  const box = p.getByTestId('forward-from');
  await box.waitFor();
  r.intro = (await box.locator('p').first().innerText()).replace(/\s+/g, ' ').trim();

  const extra = `fwd-${h.run}-${label}-personal@example.com`;
  await box.getByLabel('Another address you forward from').fill(extra);
  const sent = p.waitForResponse((res) => res.url().includes('/functions/v1/confirm-email') && res.request().method() === 'POST');
  await box.getByRole('button', { name: 'Send a code' }).click();
  const code = (await (await sent).json()).dev_code;
  await box.getByText('Waiting for its code').waitFor();
  r.sentNote = (await box.getByTestId('forward-note').innerText()).trim();

  // A wrong code is refused and says so; the right one works.
  const seen = h.errors.length;
  await box.getByLabel(`Code for ${extra}`).fill(String((Number(code) + 1) % 1000000).padStart(6, '0'));
  await box.getByRole('button', { name: 'Confirm' }).click();
  r.wrong = (await box.getByRole('alert').innerText()).trim();
  // The wrong code is refused with a 400 on purpose, which the browser logs; set aside only that.
  const extraErrors = h.errors.splice(seen);
  r.unexpected = extraErrors.filter((e) => !/status of 400 \(Bad Request\)/.test(e));
  h.errors.push(...r.unexpected);
  await box.getByLabel(`Code for ${extra}`).fill(code);
  await box.getByRole('button', { name: 'Confirm' }).click();
  await box.getByText('Works', { exact: true }).waitFor();
  r.works = (await box.getByTestId('forward-item').innerText()).replace(/\s+/g, ' ').trim();
  r.overflow = await h.overflowX(p);
  await h.shot(p, `forward-from-${label}`);

  await box.getByRole('button', { name: `Remove ${extra}` }).click();
  await box.getByTestId('forward-item').waitFor({ state: 'detached' });
  r.removed = true;
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok =
        /Bookings you forward to a trip from demo-.*@example\.com are read right away/.test(r.intro) && /We sent a 6-digit code to fwd-/.test(r.sentNote) &&
        /doesn't match/.test(r.wrong) && /personal@example\.com Works/.test(r.works) && r.removed && r.overflow <= 0;
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
