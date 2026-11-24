// T1 (Mike's 11/23 ski trip test, journal/pm-review/spec-11-23.md): flights keep the times on the
// confirmation. At 1280 and 390 wide, against TripTab dev.
//
// Import (canned reply, no cost): (c) an overnight flight leaving the day before the trip, 17:35 on
// Thu Feb 4 to 07:25 on Fri Feb 5. The reviewer taps "Add Thu, Feb 4 to the trip" and then Night,
// as Mike did on 11/23, and adds it with no hand edit; (b) an overnight flight inside the trip,
// 17:35 Wed Feb 10 to 07:25 Thu Feb 11. Each card reads "Departs 5:35 PM, lands <day> 7:25 AM",
// covers Evening, Night and the next Morning, and its dialog says Lands on <day>, in the Morning.
//
// Inbox (one real AI call per width, logged as a test run): case (b) as a forwarded email, made up,
// reviewed from the trip's inbox banner.
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

const plan = (over) => ({
  kind: 'flight', title: '', day: null, part: null, end_day: null, depart_time: null, arrive_time: null, times_from: 'input',
  source_url: null, location: null, confirmation_code: null, cost_cents: null, currency: null, cost_is_per_person: false,
  who_pays: 'own', paid: false, unsure: [], ...over,
});
const CANNED = {
  plans: [
    plan({ title: 'UA 57 Newark to Geneva', day: '2027-02-04', end_day: '2027-02-05', depart_time: '17:35', arrive_time: '07:25', location: 'Newark to Geneva' }),
    plan({ title: 'ZZ 410 Geneva to Lisbon', day: '2027-02-10', end_day: '2027-02-11', depart_time: '17:35', arrive_time: '07:25', location: 'Geneva to Lisbon' }),
  ],
  note: null,
  call_id: null,
  usage: { input_tokens: 0, output_tokens: 0, searches: 0, cost_usd: 0, latency_ms: 0, model: 'canned', effort: 'none' },
};

// A made-up confirmation for case (b), forwarded as plain text.
const FLIGHT_EMAIL = (to) => [
  'From: Mike <mike@example.com>',
  `To: ${to}`,
  'Subject: Fwd: Your flight is booked: ZZ 731 Geneva to Reykjavik',
  'Content-Type: text/plain; charset=utf-8',
  '',
  '---------- Forwarded message ---------',
  'Booking reference: QX7TEST',
  'Flight ZZ 731, Geneva (GVA) to Reykjavik (KEF)',
  'Departs: Friday 12 February 2027, 17:35',
  'Arrives: Saturday 13 February 2027, 07:25',
  'Passenger: Mike',
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
    body: JSON.stringify({ to, raw }),
  });
  return `${res.status}`;
}

const itinerary = async (p, label) => {
  if (label === 'phone') await p.getByRole('tab', { name: /Itinerary/ }).click().catch(() => {});
};

/** Which slots a plan's cards cover, as day|part, in page order: a card in a slot, or one card over several (T5). */
const slotsOf = (p, title) =>
  p.locator('[data-slot], [data-slots]').evaluateAll(
    (els, t) =>
      els
        .filter((el) => [...el.querySelectorAll('.item-card')].some((c) => c.innerText.includes(t)))
        .flatMap((el) => (el.getAttribute('data-slots') ?? el.getAttribute('data-slot')).split(' ')),
    title,
  );

/** The flight's dialog: its Lands on and Lands in the fields, as shown. */
async function landing(p, day, title) {
  await h.showDay(p, day);
  await p.locator(`#day-${day} .item-card:not([data-continued="true"])`).filter({ hasText: title }).first().click();
  const d = h.dlg(p);
  // An Owner's tap opens the plan's panel; Edit opens the dialog with the times.
  const edit = d.getByRole('button', { name: /^Edit/ });
  if (await edit.count()) await edit.first().click();
  const d2 = h.dlg(p);
  await h.openTimes(d2).catch(() => {});
  const on = await d2.locator('label', { hasText: 'Lands on' }).locator('select').evaluate((s) => s.options[s.selectedIndex].text);
  const part = await d2.locator('label', { hasText: 'Lands in the' }).locator('select').evaluate((s) => s.options[s.selectedIndex].text);
  await d2.locator('label', { hasText: 'Lands in the' }).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(300);
  return { on, part, d: d2 };
}

async function closeAll(p) {
  for (let i = 0; i < 3 && (await p.locator('dialog[open]').count()); i++) {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(250);
  }
}

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `flight-times-${label}`);
  await p.route('**/functions/v1/import-bookings', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(CANNED) })
      : route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: 'ok' }),
  );

  // Import, review: Add Thu, Feb 4 to the trip, then Night (Mike's taps on 11/23), then add both.
  await h.openAi(p, 'I have bookings');
  await h.dlg(p).getByLabel('Paste it here').fill('UA 57 and ZZ 410, made up for the test.');
  await h.dlg(p).getByRole('button', { name: 'Find the plans' }).click();
  const cards = h.dlg(p).getByTestId('proposal');
  await cards.first().waitFor();
  await cards.nth(0).getByRole('button', { name: /Add Thu, Feb 4 to the trip/ }).click();
  await cards.nth(0).getByLabel('Date', { exact: true }).waitFor();
  await p.waitForFunction(() => document.querySelector('[data-testid="proposal"] select[aria-label="Date"]')?.value === '2027-02-04');
  await cards.nth(0).getByRole('button', { name: 'Night', exact: true }).click();
  r.cardPartsAfterNight = await cards.nth(0).locator('[aria-pressed="true"]').allInnerTexts();
  await cards.nth(0).scrollIntoViewIfNeeded();
  await h.shot(p, `flight-times-review-${label}`);
  await h.dlg(p).getByRole('button', { name: /^Add 2 to the trip$/ }).click();
  await p.locator('dialog[open]').waitFor({ state: 'detached', timeout: 30000 });
  await itinerary(p, label);

  for (const [key, title, day, next] of [
    ['c', 'UA 57', '2027-02-04', '2027-02-05'],
    ['b', 'ZZ 410', '2027-02-10', '2027-02-11'],
  ]) {
    await h.showDay(p, day);
    const card = p.locator(`#day-${day} .item-card:not([data-continued="true"])`).filter({ hasText: title }).first();
    await card.waitFor();
    r[key] = { card: (await card.innerText()).replace(/\s+/g, ' '), slots: await slotsOf(p, title) };
    r[key].expectedSlots = [`${day}|evening`, `${day}|night`, `${next}|morning`];
    await card.scrollIntoViewIfNeeded();
    await h.shot(p, `flight-times-card-${key}-${label}`);
    const l = await landing(p, day, title);
    r[key].landsOn = l.on;
    r[key].landsIn = l.part;
    await h.shot(p, `flight-times-dialog-${key}-${label}`);
    await closeAll(p);
  }
  const tripStart = await p.locator('#day-2027-02-04').count();
  r.tripStartsFeb4 = tripStart > 0;

  // The inbox path: case (b) as a forwarded email, read by the real function.
  await p.unroute('**/functions/v1/import-bookings');
  await h.openAi(p, 'I have bookings');
  const address = (await h.dlg(p).getByTestId('forward-address-text').innerText()).trim();
  await h.dlg(p).getByRole('button', { name: 'Cancel' }).click();
  await h.dlg(p).waitFor({ state: 'detached' });
  r.sent = await send(p, address, FLIGHT_EMAIL(address));
  const banner = p.getByTestId('inbox');
  await banner.getByRole('button', { name: 'Review' }).first().waitFor({ timeout: 90000 });
  await banner.getByRole('button', { name: 'Review' }).first().click();
  const inboxCards = h.dlg(p).getByTestId('proposal');
  await inboxCards.first().waitFor();
  // Night, as on the import, to show the review's parts don't decide the landing.
  await inboxCards.nth(0).getByRole('button', { name: 'Night', exact: true }).click();
  await h.shot(p, `flight-times-inbox-review-${label}`);
  await h.dlg(p).getByRole('button', { name: /^Add \d+ to the trip$/ }).click();
  await p.locator('dialog[open]').waitFor({ state: 'detached', timeout: 30000 });
  await itinerary(p, label);
  await h.showDay(p, '2027-02-12');
  const inboxCard = p.locator('#day-2027-02-12 .item-card:not([data-continued="true"])').filter({ hasText: /731/ }).first();
  await inboxCard.waitFor();
  const inboxTitle = (await inboxCard.locator('h3, h4, .font-semibold').first().innerText().catch(() => 'ZZ 731')).trim();
  r.inbox = { card: (await inboxCard.innerText()).replace(/\s+/g, ' '), slots: await slotsOf(p, '731') };
  r.inbox.expectedSlots = ['2027-02-12|evening', '2027-02-12|night', '2027-02-13|morning'];
  await inboxCard.scrollIntoViewIfNeeded();
  await h.shot(p, `flight-times-inbox-card-${label}`);
  const li = await landing(p, '2027-02-12', '731');
  r.inbox.landsOn = li.on;
  r.inbox.landsIn = li.part;
  r.inbox.title = inboxTitle;
  await closeAll(p);
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
      for (const [key, weekday] of [['c', 'Fri'], ['b', 'Thu'], ['inbox', 'Sat']]) {
        const x = r[key];
        if (!x.card.includes(`Departs 5:35 PM, lands ${weekday} 7:25 AM`)) fail.push(`${key} card: ${x.card}`);
        if (JSON.stringify(x.slots) !== JSON.stringify(x.expectedSlots)) fail.push(`${key} slots: ${x.slots}`);
        if (!x.landsOn.startsWith(weekday)) fail.push(`${key} lands on: ${x.landsOn}`);
        if (x.landsIn !== 'Morning') fail.push(`${key} lands in: ${x.landsIn}`);
      }
      if (!r.tripStartsFeb4) fail.push('trip did not start Feb 4');
      if (r.sent !== '200') fail.push(`inbox send: ${r.sent}`);
      if (r.overflow > 0) fail.push(`overflow ${r.overflow}`);
      if (fail.length) result.failure = `${label}: ${fail.join('; ')}`;
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
