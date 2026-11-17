// Run with the dev server up (npm run dev): node e2e/import-flow.cjs          (canned reply)
//                                           node e2e/import-flow.cjs --live   (the real function)
// AI import click-through: an Owner pastes a summary, reviews what was proposed and saves it, at
// 1280 and at 390 wide.
//
// By default the import-bookings function's reply is CANNED in this script (CANNED below), so the
// run costs nothing and tests only the screens: the review list, the flags, the duplicate check
// and saving. It says nothing about what the model returns; the eval (npm run eval:import) and
// --live do that. With --live the real function is called (a fraction of a cent, logged in
// ai_calls as test_run), and the script only checks that plans come back and can be saved.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');
const LIVE = process.argv.includes('--live');
// Screenshots from the real function are import-*.jpg; the canned run's are import-screens-*.jpg,
// so a routine run never replaces evidence from the model with pictures of a canned reply.
const SHOTS = LIVE ? 'import' : 'import-screens';

const PASTED = 'We fly UA 57 on Feb 4. Airbnb in Chamonix Feb 5 to 12, 3,200 euros, Mike paid. Lift passes Sat Feb 6, $84 each, paid.';
const plan = (over) => ({
  kind: 'activity', title: '', day: null, part: null, end_day: null, depart_time: null, arrive_time: null, times_from: null,
  source_url: null, location: null, confirmation_code: null, cost_cents: null, currency: null, cost_is_per_person: false,
  who_pays: 'split', paid: false, unsure: [], ...over,
});
const CANNED = {
  plans: [
    plan({ kind: 'flight', title: 'UA 57 Newark to Geneva', day: '2027-02-04', part: 'evening', who_pays: 'own', unsure: ['part'] }),
    plan({ kind: 'stay', title: 'Chamonix Airbnb', day: '2027-02-05', end_day: '2027-02-12', location: 'Chamonix', cost_cents: 320000, currency: 'EUR', paid: true }),
    plan({ kind: 'activity', title: 'Lift passes', day: '2027-02-06', part: 'morning', cost_cents: 8400, currency: 'USD', cost_is_per_person: true, who_pays: 'own', paid: true }),
    plan({ kind: 'meal', title: 'Fondue at La Caleche', day: '2027-02-06', part: 'evening' }),
  ],
  note: null,
  call_id: null,
  usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, searches: 0, cost_usd: 0, latency_ms: 0, model: 'canned', effort: 'none' },
};

async function run(browser, label, opts, result) {
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  const r = (result[label] = { mode: LIVE ? 'live function' : 'canned reply (screens only)' });
  await p.goto(`${h.BASE}/sign-in?next=/trips/new`);
  await h.signUp(p, 'Mike', `import-${label}`);
  await p.waitForURL(/\/trips\/new/);
  await p.getByRole('button', { name: 'Fill in the ski trip example' }).click();
  await p.getByRole('button', { name: 'Start the trip' }).click();
  await p.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  // A plan already on the trip, so the import has a duplicate to catch.
  await h.addPlan(p, '2027-02-06', 'Add to evening', { title: 'Fondue at La Caleche', kind: 'Meal', status: 'Planned' });

  // The canned run never calls the real function, so it costs nothing.
  if (!LIVE) {
    await p.route('**/functions/v1/import-bookings', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(CANNED) })
        : route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: 'ok' }),
    );
  }

  await p.getByRole('button', { name: 'Import' }).click();
  await h.dlg(p).getByLabel('Paste it here').fill(PASTED);
  await h.shot(p, `${SHOTS}-paste-${label}`);
  await h.dlg(p).getByRole('button', { name: 'Find the plans' }).click();
  await h.dlg(p).getByTestId('import-summary').waitFor({ timeout: 70000 });
  r.summary = (await h.dlg(p).getByTestId('import-summary').innerText()).trim();
  r.cost = (await h.dlg(p).getByTestId('import-cost').innerText()).trim();
  const cards = h.dlg(p).getByTestId('proposal');
  r.proposed = await cards.count();
  await h.shot(p, `${SHOTS}-review-${label}`);

  if (!LIVE) {
    const keep = (i) => cards.nth(i).getByLabel('Keep this one');
    r.keptByDefault = [];
    for (let i = 0; i < r.proposed; i++) r.keptByDefault.push(await keep(i).isChecked());
    r.flightWarning = (await cards.nth(0).innerText()).includes("outside the trip's dates");
    r.flightMarkedCheckThis = (await cards.nth(0).innerText()).includes('check this');
    r.euroNote = (await cards.nth(1).innerText()).includes('Priced in EUR 3200.00');
    r.euroCostLeftBlank = (await cards.nth(1).getByLabel('Cost').inputValue()) === '';
    r.duplicateFlagged = (await cards.nth(3).innerText()).includes('Possible duplicate');
    // The flight's day was outside the trip: keeping it without a day is refused, then fixed.
    await keep(0).check();
    await h.dlg(p).getByRole('button', { name: /Add 3 to the trip/ }).click();
    r.refusedWithoutDay = (await cards.nth(0).getByRole('alert').innerText()).trim();
    await cards.nth(0).getByLabel('Day', { exact: true }).selectOption('2027-02-05');
    // The stay was priced in euros: the Owner types what the card was charged.
    await cards.nth(1).getByLabel('Cost').fill('3460');
    await cards.nth(1).getByLabel(/Already paid/).check();
    await cards.nth(1).scrollIntoViewIfNeeded();
    await h.shot(p, `${SHOTS}-review-edited-${label}`);
    await h.dlg(p).getByRole('button', { name: /Add 3 to the trip/ }).click();
    await p.locator('dialog[open]').waitFor({ state: 'detached', timeout: 30000 }).catch(() => {});
    if (label === 'phone') await p.getByRole('tab', { name: /Itinerary/ }).click().catch(() => {});
    await p.locator('#day-2027-02-05 .item-card').filter({ hasText: 'UA 57 Newark to Geneva' }).waitFor();
    r.flight = (await p.locator('#day-2027-02-05 .item-card').filter({ hasText: 'UA 57' }).innerText()).replace(/\s+/g, ' ');
    r.stay = (await p.locator('#day-2027-02-05 .item-card').filter({ hasText: 'Chamonix Airbnb' }).first().innerText()).replace(/\s+/g, ' ');
    r.lift = (await p.locator('#day-2027-02-06 .item-card').filter({ hasText: 'Lift passes' }).innerText()).replace(/\s+/g, ' ');
    r.fondueCount = await p.locator('#day-2027-02-06 .item-card').filter({ hasText: 'Fondue at La Caleche' }).count();
  } else {
    const kept = await h.dlg(p).getByRole('button', { name: /Add \d+ to the trip/ }).innerText().catch(() => 'nothing to add');
    r.saveButton = kept.trim();
    r.cards = (await cards.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').slice(0, 260));
    // Save what the model proposed and the review kept, unedited, and read it back off the trip.
    if (/Add [1-9]/.test(kept)) {
      await h.dlg(p).getByRole('button', { name: /Add \d+ to the trip/ }).click();
      await p.locator('dialog[open]').waitFor({ state: 'detached', timeout: 30000 });
      if (label === 'phone') await p.getByRole('tab', { name: /Itinerary/ }).click().catch(() => {});
      await p.waitForTimeout(1500);
      r.onTheTrip = (await p.locator('.item-card').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => !t.includes('Fondue'));
    }
  }
  r.overflow = await h.overflowX(p);
  await p.locator('#day-2027-02-05').scrollIntoViewIfNeeded().catch(() => {});
  await h.shot(p, `${SHOTS}-saved-${label}`);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  await run(browser, 'desktop', h.DESKTOP, result);
  await run(browser, 'phone', h.PHONE, result);
  result.errors = h.errors;
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('FLOW FAILED:', e.message.split('\n').slice(0, 4).join(' | '));
  console.error('errors so far:', h.errors);
  process.exit(1);
});
