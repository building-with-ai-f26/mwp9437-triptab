// Mike's 11/21 import test, played back (C25 to C29, his calls 11/21), at 1280 and 390 wide,
// against TripTab dev with the import function's replies and the day's euro rate canned:
// - a half-filled UA 956 is already on the trip; two screenshots are attached at once, a third is
//   pasted and then removed (C29), so import is called twice;
// - the outbound flight fills in UA 956 instead of being flagged a duplicate (C25);
// - the round trip's one $992.39 fare goes on UA 956, and UA 957 says its fare is on it (C26: two
//   plans and one expense);
// - the chalet, priced in euros and paid, comes converted at the day's rate and lands with a to-do to
//   check the card charge (C28);
// - in Add a plan, "Yes, log it now" with no amount saves as Confirmed with a to-do (C27).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const h = require('./helpers.cjs');

const plan = (over) => ({
  kind: 'activity', title: '', day: null, part: null, end_day: null, depart_time: null, arrive_time: null, times_from: null,
  source_url: null, location: null, confirmation_code: null, cost_cents: null, currency: null, cost_is_per_person: false,
  who_pays: 'own', paid: false, unsure: [], ...over,
});
const usage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, searches: 0, cost_usd: 0, latency_ms: 0, model: 'canned', effort: 'none' };
const FLIGHTS = {
  plans: [
    plan({ kind: 'flight', title: 'UA 956 Newark to Geneva', day: '2027-02-05', part: 'evening', end_day: '2027-02-06', depart_time: '17:05', arrive_time: '07:10', location: 'Newark to Geneva', paid: true }),
    plan({ kind: 'flight', title: 'UA 957 Geneva to Newark', day: '2027-02-16', part: 'morning', depart_time: '11:00', arrive_time: '14:15', location: 'Geneva to Newark', paid: true }),
  ],
  note: 'Two United flights are in the booking; the $992.39 total covers both flights, so I left cost blank on each.',
  call_id: null,
  usage,
};
const CHALET = {
  plans: [
    plan({ kind: 'stay', title: 'Chalet Les Tissourds', day: '2027-02-05', end_day: '2027-02-12', location: 'Chamonix-Mont-Blanc', cost_cents: 694750, currency: 'EUR', who_pays: 'split', paid: true }),
  ],
  note: 'One stay found in the screenshot.',
  call_id: null,
  usage,
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `review-${label}`);
  await h.addPlan(p, '2027-02-05', 'Add to evening', { title: 'UA 956 Newark to Geneva', kind: 'Flight', status: 'Planned' });
  if (await h.dlg(p).count()) await h.dlg(p).getByRole('button', { name: 'Close' }).click();

  let calls = 0;
  await p.route('**/functions/v1/import-bookings', (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: 'ok' });
    calls += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(calls === 1 ? FLIGHTS : CHALET) });
  });
  await p.route('**/api.frankfurter.dev/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ amount: 1, base: 'EUR', date: '2026-11-20', rates: { USD: 1.099 } }) }),
  );

  // Two screenshots at once, then a third pasted, then that one removed (C29).
  await h.openAi(p, 'I have bookings');
  const d = h.dlg(p);
  await d.getByLabel('Attach files').setInputFiles([
    { name: 'flights.png', mimeType: 'image/png', buffer: PNG },
    { name: 'chalet.png', mimeType: 'image/png', buffer: PNG },
  ]);
  await d.getByLabel('Paste it here').click();
  await p.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
    document.querySelector('dialog[open] textarea').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, PNG.toString('base64'));
  const files = d.getByTestId('attached-files');
  await files.getByText('Pasted screenshot 3.png').waitFor();
  r.attached = (await files.locator('li').allInnerTexts()).map((t) => t.trim());
  r.pastedText = await d.getByLabel('Paste it here').inputValue();
  await h.shot(p, `import-review-files-${label}`);
  await files.getByRole('button', { name: 'Remove Pasted screenshot 3.png' }).click();
  r.afterRemove = await files.locator('li').count();
  await d.getByRole('button', { name: 'Find the plans' }).click();
  await d.getByTestId('import-summary').waitFor();
  r.calls = calls;
  const cards = d.getByTestId('proposal');
  r.cards = await cards.count();

  // UA 956 fills in the plan already on the trip (C25); the chalet comes converted (C28).
  r.merge = (await cards.nth(0).getByTestId('merge-note').innerText()).trim();
  r.mergeTicked = await cards.nth(0).getByLabel('Keep this one').isChecked();
  await cards.nth(2).getByText(/About \$7635\.30 at today's rate/).waitFor();
  r.chaletCost = await cards.nth(2).getByLabel('Cost', { exact: true }).inputValue();

  // The round trip's one fare goes on the first flight (C26).
  const fare = d.getByTestId('one-fare');
  r.farePrefill = await fare.getByLabel('The one fare').inputValue();
  await h.shot(p, `import-review-fare-${label}`);
  await fare.getByRole('button', { name: 'Put it on the first flight' }).click();
  r.ua956Cost = await cards.nth(0).getByLabel('Cost', { exact: true }).inputValue();
  r.fareOn = (await cards.nth(1).getByTestId('fare-on-note').innerText()).trim();
  r.fareGone = (await d.getByTestId('one-fare').count()) === 0;
  await d.getByRole('button', { name: 'Add 3 to the trip' }).click();
  await d.waitFor({ state: 'detached', timeout: 30000 });

  // On the trip: one UA 956, filled in and paid; UA 957 Confirmed on its fare; the chalet paid.
  if (label === 'phone') await p.getByRole('tab', { name: /Itinerary/ }).click();
  const on = (day, text) => p.locator(`#day-${day} .item-card`).filter({ hasText: text });
  await on('2027-02-05', 'Chalet Les Tissourds').first().waitFor();
  // One UA 956 on the trip, not two (a flight spanning the night shows in each slot it covers, so
  // count it in Travel and lodging, which lists each plan once).
  r.ua956Count = await p.locator('section[aria-labelledby="travel-title"]').first().locator('li').filter({ hasText: 'UA 956' }).count();
  r.ua956Paid = (await on('2027-02-05', 'UA 956').first().getByTestId('badge-paid').count()) === 1;
  r.ua957Confirmed = (await on('2027-02-16', 'UA 957').first().getByTestId('badge-confirmed').count()) === 1;
  r.chaletPaid = (await on('2027-02-05', 'Chalet Les Tissourds').first().getByTestId('badge-paid').count()) === 1;
  await on('2027-02-05', 'UA 956').first().click();
  r.ua956Notes = await h.dlg(p).getByLabel('Notes (optional)').inputValue();
  await h.dlg(p).getByRole('button', { name: 'Done' }).click();
  await h.dlg(p).waitFor({ state: 'detached' });

  // Paid with no amount, from Add a plan (C27).
  await p.locator('#day-2027-02-07').getByRole('button', { name: 'Add to day' }).click();
  const f = h.dlg(p);
  await f.getByLabel('What').fill('Ski lessons');
  await h.openCost(f);
  await f.getByRole('radio', { name: 'Yes, log it now' }).click();
  r.laterHint = (await f.getByTestId('amount-later').innerText()).trim();
  await h.shot(p, `import-review-later-${label}`);
  await f.getByRole('button', { name: 'Add to trip' }).click();
  await f.waitFor({ state: 'detached' });
  await on('2027-02-07', 'Ski lessons').first().getByTestId('badge-confirmed').waitFor();
  r.lessonsConfirmed = true;

  // Both to-dos are on the To do list, for whoever paid.
  if (label === 'phone') await p.getByRole('tab', { name: 'To do' }).click();
  const todo = p.locator('section[aria-labelledby="actions-title"]');
  await todo.getByText('Add what you paid for Ski lessons').waitFor();
  r.todos = (await todo.locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  r.overflow = await h.overflowX(p);
  await h.shot(p, `import-review-todo-${label}`);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok =
        r.attached.join('|').includes('Pasted screenshot 3.png') && r.attached.length === 3 && r.pastedText === '' && r.afterRemove === 2 &&
        r.calls === 2 && r.cards === 3 && /Updates "UA 956 Newark to Geneva"/.test(r.merge) && r.mergeTicked && r.chaletCost === '7635.30' &&
        r.farePrefill === '992.39' && r.ua956Cost === '992.39' && /Its fare is on "UA 956 Newark to Geneva"/.test(r.fareOn) && r.fareGone &&
        r.ua956Count === 1 && r.ua956Paid && r.ua957Confirmed && r.chaletPaid && /One fare for the round trip/.test(r.ua956Notes) &&
        /Departs 17:05/.test(r.ua956Notes) && /Leave it empty/.test(r.laterHint) && r.lessonsConfirmed &&
        r.todos.some((t) => /Check what your card was charged for Chalet Les Tissourds \(EUR 6,947\.50, about \$7,635\.30\)/.test(t)) &&
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
