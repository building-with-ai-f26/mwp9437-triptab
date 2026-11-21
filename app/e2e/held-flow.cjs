// Forwards from any address, held for an Owner (C36, Mike's call 11/21), at 1280 and 390 wide,
// against TripTab dev. A made-up dinner booking is forwarded to the trip's address from a personal
// address nobody on the trip has, through the dev test path with the real sender check: it shows up
// held, unread, with its address. The Owner taps That's me: the AI reads it then, the booking opens
// on review, and the address now counts as the Owner's, so the next forward from it is read straight
// away, not held. Two real AI calls per width (logged as test runs), well under a cent.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')
    .map((l) => l.match(/^(VITE_[A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
);
const SUPABASE = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

const DINNER = (from, to) => [
  `From: Mike <${from}>`,
  `To: ${to}`,
  'Subject: Fwd: Your table at Le Bistrot',
  'Content-Type: text/plain',
  '',
  '---------- Forwarded message ---------',
  'Your reservation is confirmed: Le Bistrot, 12 Rue du Lac, Chamonix.',
  'Table for 6, Saturday 6 February 2027 at 19:30. Reference LB-4471.',
].join('\r\n');

const tokenOf = (p) =>
  p.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x));
    return JSON.parse(localStorage.getItem(k)).access_token;
  });

async function send(p, to, raw) {
  const res = await fetch(`${SUPABASE}/functions/v1/inbox-email`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${await tokenOf(p)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, raw, check_sender: true }),
  });
  return `${res.status} ${JSON.stringify(await res.json().catch(() => ({})))}`;
}

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `held-${label}`);
  await h.openAi(p, 'I have bookings');
  const box = h.dlg(p).getByTestId('forward-address');
  await box.waitFor();
  const address = (await box.getByTestId('forward-address-text').innerText()).trim();
  r.hint = (await box.innerText()).replace(/\s+/g, ' ');
  await h.dlg(p).getByRole('button', { name: 'Close' }).click();

  const personal = `held-${h.run}-${label}@example.com`;
  r.sent = await send(p, address, DINNER(personal, address));
  const inbox = p.getByTestId('inbox');
  const item = inbox.getByTestId('inbox-item').filter({ hasText: 'Le Bistrot' });
  await item.waitFor({ timeout: 20000 });
  r.heldText = (await item.innerText()).replace(/\s+/g, ' ').trim();
  r.heldStatus = await item.getAttribute('data-status');
  await h.shot(p, `held-${label}`);

  // That's me: read now, and the address counts as mine from here on.
  await item.getByRole('button', { name: "That's me" }).click();
  await inbox.getByTestId('inbox-item').filter({ hasText: 'Le Bistrot' }).getByRole('button', { name: 'Review' }).waitFor({ timeout: 60000 });
  r.afterText = (await inbox.getByTestId('inbox-item').filter({ hasText: 'Le Bistrot' }).innerText()).replace(/\s+/g, ' ').trim();
  await inbox.getByTestId('inbox-item').filter({ hasText: 'Le Bistrot' }).getByRole('button', { name: 'Review' }).click();
  const d = h.dlg(p);
  await d.getByTestId('proposal').first().waitFor();
  r.proposal = await d.getByTestId('proposal').first().getByLabel('What').inputValue();
  await d.getByRole('button', { name: 'Close' }).click();

  // The next forward from that address isn't held.
  r.second = await send(p, address, DINNER(personal, address).replace('Le Bistrot', 'La Calèche'));
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
        /from any other address, they wait for an Owner/.test(r.hint) && r.sent === '200 {"code":"held"}' && r.heldStatus === 'held' &&
        /isn't on this trip, so it hasn't been read/.test(r.heldText) && /held-.*@example\.com/.test(r.heldText) &&
        /1 plan to review/.test(r.afterText) && /Bistrot/.test(r.proposal) && /^200 /.test(r.second) && !/"held"/.test(r.second) &&
        r.overflow <= 0;
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
