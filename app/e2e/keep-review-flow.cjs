// An unsaved AI review is kept on the trip, not lost (11/23 product manager review, item 9), at
// 1280 and 390 wide. Ideas from Plan with AI are on screen when Escape shuts the dialog: the trip
// says "3 ideas from AI help are waiting", Review brings them back with the choice already made
// (one unticked) still made, and Discard on the trip clears them. The AI's reply is canned here,
// so nothing is spent. Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const idea = (over) => ({ kind: 'meal', title: '', day: '2027-02-06', part: 'evening', location: null, est_cents: null, why: '', source_url: 'https://example.com/', ...over });
const CANNED = {
  suggestions: [
    idea({ title: 'Dinner at Le Monchu', location: 'Chamonix', why: 'Savoyard classics with room for a group.', source_url: 'https://example.com/chamonix-fondue' }),
    idea({ kind: 'activity', title: 'Montenvers train to the Mer de Glace', day: '2027-02-07', part: 'day', why: 'A big day out for the non-skiers.', source_url: 'https://example.com/montenvers' }),
    idea({ kind: 'activity', title: 'Bunkers del Carmel at sunset', day: '2027-02-12', part: 'evening', why: 'Free views over Barcelona.', source_url: 'https://example.com/bunkers' }),
  ],
  note: null,
  dropped: 0,
  call_id: null,
  usage: { cost_usd: 0, searches: 0, latency_ms: 0, model: 'canned', effort: 'none' },
};

const plan = (over) => ({
  kind: 'activity', title: '', day: null, part: null, end_day: null, depart_time: null, arrive_time: null, times_from: null,
  source_url: null, location: null, confirmation_code: null, cost_cents: null, currency: null, cost_is_per_person: false,
  who_pays: 'split', paid: false, unsure: [], ...over,
});
const CANNED_IMPORT = {
  plans: [
    plan({ kind: 'activity', title: 'Lift passes', day: '2027-02-06', part: 'morning' }),
    plan({ kind: 'meal', title: 'Fondue at La Caleche', day: '2027-02-06', part: 'evening' }),
  ],
  note: null,
  call_id: null,
  usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, searches: 0, cost_usd: 0, latency_ms: 0, model: 'canned', effort: 'none' },
};

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `keep-${label}`);
  let calls = 0;
  await p.route('**/functions/v1/plan-with-ai', (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: 'ok' });
    calls += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(CANNED) });
  });
  const ask = async () => {
    await h.openAi(p, 'Give me ideas');
    await h.dlg(p).getByRole('button', { name: 'Find ideas' }).click();
    await h.dlg(p).getByTestId('plan-ai-summary').waitFor();
  };
  const banner = p.getByTestId('parked-review');

  await ask();
  const cards = h.dlg(p).getByTestId('plan-idea');
  await cards.last().getByRole('checkbox').uncheck();
  // Escape, with nothing added: the ideas wait on the trip.
  await p.keyboard.press('Escape');
  await h.dlg(p).waitFor({ state: 'detached' });
  await banner.waitFor();
  r.banner = (await banner.innerText()).replace(/\s+/g, ' ').trim();
  r.nothingAdded = await p.locator('.item-card', { hasText: 'Dinner at Le Monchu' }).count();
  r.overflow = await h.overflowX(p);
  await h.shot(p, `keep-review-banner-${label}`);

  // Review: the same ideas, the last one still unticked, and no second call to the AI.
  await banner.getByRole('button', { name: 'Review' }).click();
  await h.dlg(p).getByTestId('plan-ai-summary').waitFor();
  r.ideasBack = await cards.count();
  r.stillUnticked = !(await cards.last().getByRole('checkbox').isChecked());
  r.callsSoFar = calls;
  // The X keeps them too.
  await h.dlg(p).getByRole('button', { name: 'Close' }).click();
  await banner.waitFor();
  r.keptOnX = true;

  // Add them from the review: the banner goes and the two kept ideas are on the trip.
  await banner.getByRole('button', { name: 'Review' }).click();
  await h.dlg(p).getByRole('button', { name: /Add 2 as Suggested/ }).click();
  await h.dlg(p).waitFor({ state: 'detached' });
  await p.locator('.item-card', { hasText: 'Dinner at Le Monchu' }).first().waitFor();
  r.bannerGoneAfterAdd = (await banner.count()) === 0;

  // Ask again, shut it, and Discard on the trip: gone, and AI help starts fresh.
  await ask();
  await p.keyboard.press('Escape');
  await banner.waitFor();
  await banner.getByRole('button', { name: 'Discard' }).click();
  r.bannerGoneAfterDiscard = (await banner.count()) === 0;
  await h.openAi(p, 'Give me ideas');
  r.startsFresh = (await h.dlg(p).getByRole('button', { name: 'Find ideas' }).count()) === 1 && (await h.dlg(p).getByTestId('plan-idea').count()) === 0;
  await p.keyboard.press('Escape');
  await h.dlg(p).waitFor({ state: 'detached' });

  // The same for bookings read by AI import: shut by accident, the plans wait with the edit made.
  await p.route('**/functions/v1/import-bookings', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(CANNED_IMPORT) })
      : route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: 'ok' }));
  await h.openAi(p, 'I have bookings');
  await h.dlg(p).getByLabel('Paste it here').fill('Lift passes Sat Feb 6. Fondue at La Caleche, Sat Feb 6, 7:30 PM.');
  await h.dlg(p).getByRole('button', { name: 'Find the plans' }).click();
  await h.dlg(p).getByTestId('import-summary').waitFor();
  const proposals = h.dlg(p).getByTestId('proposal');
  await proposals.first().getByLabel('Keep this one').uncheck();
  await p.keyboard.press('Escape');
  await h.dlg(p).waitFor({ state: 'detached' });
  await banner.waitFor();
  r.importBanner = (await banner.innerText()).replace(/\s+/g, ' ').trim();
  await banner.getByRole('button', { name: 'Review' }).click();
  await h.dlg(p).getByTestId('import-summary').waitFor();
  r.importBack = (await proposals.count()) === 2 && !(await proposals.first().getByLabel('Keep this one').isChecked());
  await h.dlg(p).getByRole('button', { name: /Add 1 to the trip/ }).click();
  await h.dlg(p).waitFor({ state: 'detached' });
  await p.locator('.item-card', { hasText: 'Fondue at La Caleche' }).first().waitFor();
  r.importBannerGone = (await banner.count()) === 0;
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok = /^3 ideas from AI help are waiting\. Nothing is on the trip until you add it\. Review Discard$/.test(r.banner) && r.nothingAdded === 0 && r.overflow <= 0 &&
        r.ideasBack === 3 && r.stillUnticked && r.callsSoFar === 1 && r.keptOnX && r.bannerGoneAfterAdd && r.bannerGoneAfterDiscard && r.startsFresh &&
        /^2 plans from your bookings are waiting\./.test(r.importBanner) && r.importBack && r.importBannerGone;
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
