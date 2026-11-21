// C34 (Mike's call, 11/21), at 1280 and 390 wide, against TripTab dev with import's reply canned:
// an "Airbnb" placeholder stay is on the trip; the chalet's booking merges into it and gives it the
// booking's name, shown in the merge note and changeable under What first. Cost stays as the plan
// had it. C32: the booking's page lands in Link and the listing's headline in Notes. Run with
// `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const usage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, searches: 0, cost_usd: 0, latency_ms: 0, model: 'canned', effort: 'none' };
const CHALET = {
  plans: [
    {
      kind: 'stay', title: 'Chalet Les Tissourds', day: '2027-02-05', part: null, end_day: '2027-02-12', depart_time: null, arrive_time: null,
      times_from: null, source_url: null, location: 'Chamonix-Mont-Blanc', confirmation_code: 'HM4ZK2', cost_cents: 760000, currency: 'USD',
      cost_is_per_person: false, who_pays: 'split', paid: false, unsure: [],
      link: 'https://www.airbnb.com/rooms/48213377', details: '5*, ski-in, sauna, mountain views',
    },
  ],
  note: 'One stay found.',
  call_id: null,
  usage,
};

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `merge-name-${label}`);
  await h.addPlan(p, '2027-02-05', "Add where everyone's staying", { title: 'Airbnb', checkout: '2027-02-12', status: 'Planned', est: '2400' });
  if (await h.dlg(p).count()) await h.dlg(p).getByRole('button', { name: 'Close' }).click();

  await p.route('**/functions/v1/import-bookings', (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: 'ok' });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(CHALET) });
  });
  await h.openAi(p, 'I have bookings');
  const d = h.dlg(p);
  await d.getByLabel('Paste it here').fill('Your Airbnb booking: Chalet Les Tissourds, Feb 5 to 12, 2027.');
  await d.getByRole('button', { name: 'Find the plans' }).click();
  await d.getByTestId('import-summary').waitFor();
  const card = d.getByTestId('proposal').first();
  r.note = (await card.getByTestId('merge-note').innerText()).replace(/\s+/g, ' ').trim();
  r.reviewLink = await card.getByLabel('Link', { exact: true }).inputValue();
  await h.shot(p, `merge-name-${label}`);
  // Change the name before saving: the note follows it.
  await card.getByLabel('What').fill('Chalet in Chamonix');
  r.noteAfter = (await card.getByTestId('merge-rename').innerText()).trim();
  await d.getByRole('button', { name: /^Add 1 to the trip$|^Save 1$|^Update 1/ }).click();
  await d.waitFor({ state: 'detached', timeout: 30000 });

  if (label === 'phone') await p.getByRole('tab', { name: /Itinerary/ }).click();
  const day = p.locator('#day-2027-02-05');
  await day.getByText('Chalet in Chamonix').first().waitFor();
  r.airbnbLeft = await day.locator('.item-card').filter({ hasText: /^Airbnb/ }).count();
  r.stays = await p.locator('section[aria-labelledby="travel-title"]').first().locator('li').filter({ hasText: /Chalet|Airbnb/ }).count();
  await day.locator('.item-card').filter({ hasText: 'Chalet in Chamonix' }).first().click();
  const f = h.dlg(p);
  r.location = await f.getByLabel(/Where/).first().inputValue();
  r.link = await f.getByLabel('Link (optional)').inputValue();
  r.notes = await f.getByLabel('Notes (optional)').inputValue();
  await h.openCost(f);
  r.est = await f.getByLabel(/Estimated/).inputValue();
  r.overflow = await h.overflowX(p);
  await f.getByRole('button', { name: 'Done' }).click();
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok =
        /Updates "Airbnb", already on the trip, and names it "Chalet Les Tissourds" \(change it under What\)/.test(r.note) &&
        r.noteAfter === '"Chalet in Chamonix"' && r.airbnbLeft === 0 && r.stays === 1 && /Chamonix-Mont-Blanc/.test(r.location) &&
        r.est === '2400' && r.overflow <= 0 &&
        r.reviewLink === 'https://www.airbnb.com/rooms/48213377' && r.link === 'https://www.airbnb.com/rooms/48213377' &&
        /5\*, ski-in, sauna, mountain views/.test(r.notes);
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
