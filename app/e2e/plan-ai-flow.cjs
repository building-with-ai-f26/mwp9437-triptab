// Run with the dev server up (npm run dev): node e2e/plan-ai-flow.cjs          (canned reply)
//                                           node e2e/plan-ai-flow.cjs --live   (the real function)
// Plan with AI click-through, at 1280 and 390 wide: an Owner asks for ideas, reviews them, unticks
// one and adds the rest as Suggested. By default the plan-with-ai reply is CANNED here, so the run
// costs nothing and tests only the screens; the eval (npm run eval:plan) tests the model. With
// --live the real function is called (a few cents, logged in ai_calls as test_run).
const { chromium } = require('playwright');
const h = require('./helpers.cjs');
const LIVE = process.argv.includes('--live');
const SHOTS = LIVE ? 'plan-ai' : 'plan-ai-screens';

const idea = (over) => ({ kind: 'meal', title: '', day: '2027-02-06', part: 'evening', location: null, est_cents: null, why: '', source_url: 'https://example.com/', ...over });
const CANNED = {
  suggestions: [
    idea({ title: 'Dinner at Le Monchu', location: 'Chamonix', why: 'Savoyard classics with room for a group.', source_url: 'https://example.com/chamonix-fondue' }),
    idea({ kind: 'activity', title: 'Montenvers train to the Mer de Glace', day: '2027-02-07', part: 'day', est_cents: 4500, why: 'A big day out for the non-skiers.', source_url: 'https://example.com/montenvers' }),
    idea({ kind: 'activity', title: 'Bunkers del Carmel at sunset', day: '2027-02-12', part: 'evening', why: 'Free views over Barcelona.', source_url: 'https://example.com/bunkers' }),
  ],
  note: null,
  dropped: 0,
  call_id: null,
  usage: { cost_usd: 0, searches: 0, latency_ms: 0, model: 'canned', effort: 'none' },
};

async function run(browser, label, opts, result) {
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  const r = (result[label] = { mode: LIVE ? 'live function' : 'canned reply (screens only)' });
  await h.startSkiTrip(p, `planai-${label}`);
  if (!LIVE) {
    await p.route('**/functions/v1/plan-with-ai', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(CANNED) })
        : route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: 'ok' }),
    );
  }
  // One AI button, two choices (Mike's 11/18 call).
  await p.getByRole('button', { name: 'AI help' }).click();
  await h.dlg(p).getByRole('button', { name: /^Give me ideas/ }).waitFor();
  r.choices = (await h.dlg(p).locator('button span.font-display').allInnerTexts()).map((t) => t.trim());
  r.choicesOverflow = await h.overflowX(p);
  await h.shot(p, `ai-help-choices-${label}`);
  await h.dlg(p).getByRole('button', { name: /^Give me ideas/ }).click();
  await h.dlg(p).getByLabel(/What would the group like/).fill('A nice dinner in Chamonix, and something for the non-skiers on Sunday.');
  await h.shot(p, `${SHOTS}-ask-${label}`);
  await h.dlg(p).getByRole('button', { name: 'Find ideas' }).click();
  await h.dlg(p).getByTestId('plan-ai-summary').waitFor({ timeout: 70000 });
  const cards = h.dlg(p).getByTestId('plan-idea');
  r.ideas = await cards.count();
  r.titles = (await cards.allInnerTexts()).map((t) => t.split('\n')[0]);
  r.sources = await cards.locator('a').count();
  r.cost = (await h.dlg(p).getByTestId('plan-ai-cost').innerText()).trim();
  await h.shot(p, `${SHOTS}-review-${label}`);
  if (r.ideas === 0) return;

  // Move the first idea to the last morning of the trip (the 11/17 pod test: pick a day for each
  // idea), untick the last, keep the rest.
  const first = r.titles[0];
  const daySelect = cards.first().getByLabel(`Day for ${first}`, { exact: true });
  const lastDay = await daySelect.locator('option').last().getAttribute('value');
  await daySelect.selectOption(lastDay);
  await cards.first().getByLabel(`Part of the day for ${first}`).selectOption('morning');
  r.movedTo = lastDay;
  await cards.last().getByRole('checkbox').uncheck();
  r.untickedHidesPickers = (await cards.last().getByRole('combobox').count()) === 0;
  const keep = r.ideas - 1;
  if (keep > 0) {
    await h.dlg(p).getByRole('button', { name: `Add ${keep} as Suggested` }).click();
    await p.locator('dialog[open]').waitFor({ state: 'detached', timeout: 30000 }).catch(() => {});
    if (label === 'phone') await p.getByRole('tab', { name: /Itinerary/ }).click().catch(() => {});
    const added = p.locator('.item-card[data-status="suggested"]');
    await added.first().waitFor();
    r.addedAsSuggested = await added.count();
    r.uncheckedLeftOut = (await p.locator('.item-card').filter({ hasText: r.titles[r.titles.length - 1] }).count()) === 0;
    // Suggested plans say who suggested them; a kept idea says it came from AI.
    r.suggestedBy = (await added.first().getByTestId('status-label').innerText()).trim();
    // The moved idea sits on the last day, in the morning.
    const movedCard = p.locator(`section[data-date="${lastDay}"] .item-card`).filter({ hasText: first });
    r.movedPlaced = (await movedCard.count()) > 0;
    // The why and the source are in the plan's notes.
    await added.first().click();
    r.notes = (await h.dlg(p).getByLabel(/Notes/).inputValue()).replace(/\s+/g, ' ');
    await h.dlg(p).getByRole('button', { name: 'Close' }).click().catch(() => p.keyboard.press('Escape'));
    await added.first().scrollIntoViewIfNeeded();
    await h.shot(p, `${SHOTS}-added-${label}`);
  }
  r.overflow = await h.overflowX(p);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  await run(browser, 'desktop', h.DESKTOP, result);
  await run(browser, 'phone', h.PHONE, result);
  result.errors = h.errors;
  if (!LIVE) {
    for (const [label, r] of Object.entries(result)) {
      if (label === 'errors') continue;
      const ok =
        r.choices.join('|') === 'I have bookings|Give me ideas' && r.choicesOverflow <= 0 && r.ideas === 3 && r.addedAsSuggested === 2 && r.uncheckedLeftOut && r.untickedHidesPickers &&
        /^ai idea, kept by you$/i.test(r.suggestedBy) && r.movedPlaced && r.overflow <= 0;
      if (!ok) result.failure = `${label}: a check failed`;
    }
  }
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (result.failure || result.errors.length) process.exit(1);
})().catch((e) => {
  console.error('FLOW FAILED:', e.message.split('\n').slice(0, 4).join(' | '));
  console.error('errors so far:', h.errors);
  process.exit(1);
});
