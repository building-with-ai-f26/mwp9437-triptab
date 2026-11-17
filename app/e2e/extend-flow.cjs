// Run with the dev server up (npm run dev): node e2e/extend-flow.cjs
// Extend the trip in one tap (Mike's call, 11/16), at 1280 and at 390 wide: a plan the day before
// the trip stretches the trip as it saves; the import review offers "Add Wed, Feb 3 to the trip";
// and a date change that would strand plans says which ones. The import reply is CANNED here, so
// the run costs nothing.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const plan = (over) => ({
  kind: 'activity', title: '', day: null, part: null, end_day: null, depart_time: null, arrive_time: null, times_from: null,
  source_url: null, location: null, confirmation_code: null, cost_cents: null, currency: null, cost_is_per_person: false,
  who_pays: 'split', paid: false, unsure: [], ...over,
});
const CANNED = {
  plans: [plan({ kind: 'flight', title: 'DL 44 to Geneva', day: '2027-02-03', part: 'evening', depart_time: '18:10', times_from: 'input', who_pays: 'own' })],
  note: null,
  call_id: null,
  usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, searches: 0, cost_usd: 0, latency_ms: 0, model: 'canned', effort: 'none' },
};

async function run(browser, label, opts, result) {
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  const r = (result[label] = {});
  await h.startSkiTrip(p, `extend-${label}`);
  const subtitle = async () => (await p.locator('header p').first().innerText()).trim();
  r.before = await subtitle();

  // 1. Add a plan on the day before the trip: the dialog says it will stretch the trip.
  await p.getByRole('button', { name: 'Add a plan', exact: true }).click();
  await h.dlg(p).getByLabel('What').fill('Airport hotel shuttle');
  await h.dlg(p).getByRole('combobox', { name: /^Day/ }).first().selectOption('2027-02-04');
  r.note = (await h.dlg(p).getByTestId('extends-trip').innerText()).trim();
  await h.dlg(p).getByTestId('extends-trip').scrollIntoViewIfNeeded();
  await h.shot(p, `extend-add-plan-${label}`);
  await h.dlg(p).getByRole('button', { name: 'Add to trip' }).click();
  await p.locator('#day-2027-02-04 .item-card').filter({ hasText: 'Airport hotel shuttle' }).waitFor();
  r.afterPlan = await subtitle();

  // 2. Import a flight two days before the trip: one tap adds the day, then it saves.
  await p.route('**/functions/v1/import-bookings', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(CANNED) })
      : route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: 'ok' }),
  );
  await p.getByRole('button', { name: 'Import' }).click();
  await h.dlg(p).getByLabel('Paste it here').fill('Flying DL 44 on Wed Feb 3 at 6:10 PM.');
  await h.dlg(p).getByRole('button', { name: 'Find the plans' }).click();
  const card = h.dlg(p).getByTestId('proposal').first();
  await card.waitFor();
  r.importWarning = (await card.innerText()).includes('Wed, Feb 3 is before the trip');
  r.keptBefore = await card.getByLabel('Keep this one').isChecked();
  await h.shot(p, `extend-import-offer-${label}`);
  await card.getByRole('button', { name: 'Add Wed, Feb 3 to the trip' }).click();
  await card.getByRole('button', { name: /Add Wed, Feb 3/ }).waitFor({ state: 'detached' });
  r.keptAfter = await card.getByLabel('Keep this one').isChecked();
  r.dayAfter = await card.getByLabel('Day', { exact: true }).inputValue();
  await h.dlg(p).getByRole('button', { name: /Add 1 to the trip/ }).click();
  await p.locator('dialog[open]').waitFor({ state: 'detached', timeout: 30000 }).catch(() => {});
  if (label === 'phone') await p.getByRole('tab', { name: /Itinerary/ }).click().catch(() => {});
  await p.locator('#day-2027-02-03 .item-card').filter({ hasText: 'DL 44' }).waitFor();
  r.afterImport = await subtitle();

  // 3. Shrinking the dates back is refused, naming the plans in the way.
  await p.getByRole('button', { name: 'Trip settings' }).click();
  await h.dlg(p).getByLabel('Stop 1 from').fill('2027-02-05');
  await h.dlg(p).getByRole('button', { name: 'Save' }).click();
  const alert = h.dlg(p).getByRole('alert');
  await alert.waitFor();
  r.refusal = (await alert.innerText()).trim();
  await alert.scrollIntoViewIfNeeded();
  await h.shot(p, `extend-refused-${label}`);
  r.overflow = await h.overflowX(p);
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
