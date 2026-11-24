// T11 (the 11/24 pod test, journal/pm-review/spec-11-23.md): import a screenshot of the group chat.
// At 1280 and 390 wide, against TripTab dev, with a canned import reply (no cost; the eval covers the
// model). A made-up chat screenshot goes in through Import's file picker; the review shows the
// plans talked about with "From the group chat" and the booked transfer as a booking; saved, the
// chat plans are Suggested and the transfer is not.
const path = require('path');
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const SHOT = path.join(__dirname, '..', 'evals', 'import', 'cases', 'fixtures', '16-chat-with-booking.png');
const plan = (over) => ({
  kind: 'activity', title: '', day: null, part: null, end_day: null, depart_time: null, arrive_time: null, times_from: null,
  source_url: null, location: null, confirmation_code: null, cost_cents: null, currency: null, cost_is_per_person: false,
  who_pays: 'split', paid: false, unsure: [], link: null, details: null, with_points: false, payment_schedule: [], from_chat: false, ...over,
});
const CANNED = {
  plans: [
    plan({ kind: 'transport', title: 'Transfer Geneva Airport to Chamonix', day: '2027-02-05', part: 'morning', depart_time: '09:30', times_from: 'input', confirmation_code: 'AX-7731', cost_cents: 18000, currency: 'EUR', paid: true }),
    plan({ kind: 'meal', title: 'Welcome dinner', day: '2027-02-05', part: 'evening', location: 'somewhere in town', from_chat: true }),
  ],
  note: null,
  call_id: null,
  usage: { input_tokens: 0, output_tokens: 0, searches: 0, cost_usd: 0, latency_ms: 0, model: 'canned', effort: 'none' },
};

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const phone = label === 'phone';
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await p.route('**/api.frankfurter.dev/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ amount: 1, base: 'EUR', date: '2026-11-24', rates: { USD: 1.1 } }) }),
  );
  await p.route('**/functions/v1/import-bookings', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(CANNED) })
      : route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: 'ok' }),
  );
  await h.startSkiTrip(p, `chat-import-${label}`);
  await h.openAi(p, 'I have bookings');
  await h.dlg(p).getByLabel('Attach files').setInputFiles(SHOT);
  await h.dlg(p).getByRole('button', { name: 'Find the plans' }).click();
  const cards = h.dlg(p).getByTestId('proposal');
  await cards.first().waitFor({ timeout: 30000 });
  r.cards = (await cards.allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  await cards.nth(1).scrollIntoViewIfNeeded();
  await h.shot(p, `chat-import-review-${label}`);
  await h.dlg(p).getByRole('button', { name: /^Add \d+ to the trip$/ }).click();
  await p.locator('dialog[open]').waitFor({ state: 'detached', timeout: 30000 });
  if (phone) await p.getByRole('tab', { name: /Itinerary/ }).click().catch(() => {});
  const day = p.locator('#day-2027-02-05');
  await day.locator('.item-card').filter({ hasText: 'Welcome dinner' }).first().waitFor();
  r.dinnerStatus = await day.locator('.item-card').filter({ hasText: 'Welcome dinner' }).first().getAttribute('data-status');
  r.transferStatus = await day.locator('.item-card').filter({ hasText: 'Transfer' }).first().getAttribute('data-status');
  await day.locator('.item-card').filter({ hasText: 'Welcome dinner' }).first().scrollIntoViewIfNeeded();
  await h.shot(p, `chat-import-saved-${label}`);
  r.overflow = await h.overflowX(p);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const fail = [];
      // Titles sit in inputs (not in the card's text): card 2 is the dinner, card 1 the transfer.
      if (!/From the group chat/.test(r.cards[1] ?? '')) fail.push('review note');
      if (/From the group chat/.test(r.cards[0] ?? '') || !/Confirmation: AX-7731/.test(r.cards[0] ?? '')) fail.push('booking marked as chat');
      if (r.dinnerStatus !== 'suggested') fail.push(`dinner ${r.dinnerStatus}`);
      if (r.transferStatus === 'suggested') fail.push('transfer suggested');
      if (r.overflow > 0) fail.push('overflow');
      if (fail.length) result.failure = `${result.failure ? `${result.failure} | ` : ''}${label}: ${fail.join('; ')}`;
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
