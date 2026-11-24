// T10 (Mike's C59, C60 and C64; the 11/24 pod's version; journal/pm-review/spec-11-23.md): Ask AI,
// three option cards and Refine your request. At 1280 and 390 wide, against TripTab dev, with canned
// replies (no cost; the eval covers the model; `--live` makes one real call per width).
// - Ask: three cards, each with a price range, the best time, Open in Google Maps and Found on.
// - Refine "cheaper": the ask goes again with the refinement and the options shown; three new cards
//   come in under the first three.
// - Add the first (it needs a booking) on Sat evening with "Book ..." on the To do list for you: it's
//   on the trip as Suggested with the Maps link, and the to-do is there.
// - Consider group preferences starts on (C64) and is sent off when unticked.
// - Reopened, Ask AI shows your last conversation (kept for you alone, C60).
const { chromium } = require('playwright');
const h = require('./helpers.cjs');
const LIVE = process.argv.includes('--live');

const opt = (title, price, extra = {}) => ({
  kind: 'meal', title, description: `${title}: a made-up Savoyard restaurant`, why: 'Fondue for the group in Chamonix', price_level: price,
  best_part: 'evening', best_time: '7:30 PM', needs_reservation: false, location: `${title}, Chamonix`, source_url: `https://example.com/${encodeURIComponent(title)}`, ...extra,
});
const FIRST = [opt('La Fondue Test', '$$$', { needs_reservation: true }), opt('Chalet Test', '$$$'), opt('Le Caquelon Test', '$$')];
const CHEAPER = [opt('Bistrot Test', '$'), opt('Crêperie Test', '$'), opt('Pizzeria Test', '$$')];
const reply = (options) => ({ options, note: null, dropped: 0, tastes_used: false, taste_answers: 1, usage: { cost_usd: 0, searches: 0, latency_ms: 0 } });

async function run(browser, label, opts, result) {
  const r = (result[label] = { bodies: [] });
  const phone = label === 'phone';
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  if (!LIVE) {
    await p.route('**/functions/v1/ask-ai', (route) => {
      if (route.request().method() !== 'POST') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: 'ok' });
      const body = JSON.parse(route.request().postData() || '{}');
      r.bodies.push(body);
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(reply(body.refinements?.length ? CHEAPER : FIRST)) });
    });
  }
  await h.startSkiTrip(p, `ask-${label}`);
  await h.pickAdd(p, 'Ask AI');
  const d = h.dlg(p);
  r.toggleOn = await d.getByLabel('Consider group preferences').isChecked();
  await d.getByLabel('What would you like ideas for?').fill('A fondue dinner in Chamonix');
  await d.getByRole('button', { name: 'Ask', exact: true }).click();
  const cards = d.getByTestId('ask-option');
  await cards.first().waitFor({ timeout: 70000 });
  r.firstCount = await cards.count();
  r.firstCard = (await cards.first().innerText()).replace(/\s+/g, ' ');
  r.mapsLinks = await d.getByTestId('maps-link').evaluateAll((els) => els.map((e) => e.href));
  r.tastesNote = (await d.getByTestId('tastes-note').innerText().catch(() => '')).trim();
  await h.shot(p, `ask-cards-${label}`);
  if (LIVE) return;

  // Refine: cheaper.
  await d.getByLabel('Refine your request').fill('cheaper');
  await d.getByRole('button', { name: 'Refine' }).click();
  await d.getByText('Bistrot Test', { exact: true }).first().waitFor();
  r.afterRefine = await cards.count();
  r.sections = await d.locator('section[aria-label^="Refined"]').count();
  const refineBody = r.bodies[r.bodies.length - 1];
  r.refineSent = JSON.stringify({ request: refineBody.request, refinements: refineBody.refinements, shown: refineBody.shown });
  await d.getByLabel('Refine your request').scrollIntoViewIfNeeded();
  await h.shot(p, `ask-refined-${label}`);

  // Add the first: Sat evening, Book it on your To do list.
  await cards.first().getByRole('button', { name: 'Add', exact: true }).click();
  await cards.first().getByLabel('Day for La Fondue Test', { exact: true }).selectOption('2027-02-06');
  await cards.first().getByLabel('Part of the day for La Fondue Test').selectOption('evening');
  r.bookTicked = await cards.first().getByLabel(/Add "Book La Fondue Test" to To do/).isChecked();
  await cards.first().getByLabel('Who books it').selectOption({ label: 'Mike (you)' });
  await cards.first().getByLabel('Book by').fill('2026-12-15');
  await h.shot(p, `ask-add-${label}`);
  await cards.first().getByRole('button', { name: 'Add as Suggested' }).click();
  await cards.first().getByText('Added as Suggested').waitFor();

  // The toggle is sent off when unticked.
  await d.getByLabel('Consider group preferences').uncheck();
  await d.getByLabel('Refine your request').fill('closer to the chalet');
  await d.getByRole('button', { name: 'Refine' }).click();
  await p.waitForTimeout(800);
  r.toggleSentOff = r.bodies[r.bodies.length - 1].use_tastes === false;
  await d.getByRole('button', { name: 'Close' }).first().click();
  await p.locator('dialog[open]').waitFor({ state: 'detached' });

  // On the trip, Suggested, with the Maps link; and the to-do.
  if (phone) await p.getByRole('tab', { name: /Itinerary/ }).click().catch(() => {});
  await h.showDay(p, '2027-02-06');
  const card = p.locator('#day-2027-02-06 .item-card').filter({ hasText: 'La Fondue Test' }).first();
  await card.waitFor();
  r.planStatus = await card.getAttribute('data-status');
  await card.click();
  r.planLink = await h.dlg(p).getByLabel('Link').inputValue().catch(() => null);
  await h.dlg(p).getByRole('button', { name: /^(Done|Close)$/ }).first().click();
  await p.locator('dialog[open]').waitFor({ state: 'detached' }).catch(() => {});
  await p.getByRole('tab', { name: /To do/ }).click();
  r.todo = (await p.locator('section[aria-labelledby="actions-title"] li', { hasText: 'Book La Fondue Test' }).innerText().catch(() => '')).replace(/\s+/g, ' ');

  // Reopened: your last conversation is there.
  await p.getByRole('tab', { name: phone ? /Itinerary/ : 'Overview' }).click();
  await h.pickAdd(p, 'Ask AI');
  await h.dlg(p).getByText('Bistrot Test', { exact: true }).first().waitFor({ timeout: 15000 });
  r.restored = await h.dlg(p).getByTestId('ask-option').count();
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
      const want = (name, ok) => ok || fail.push(name);
      want('toggle starts on', r.toggleOn);
      want('three cards', r.firstCount === 3);
      want('maps links', r.mapsLinks.length >= 3 && r.mapsLinks.every((u) => u.startsWith('https://www.google.com/maps/search/?api=1&query=')));
      if (!LIVE) {
        want('card details', /\$\$\$/.test(r.firstCard) && /7:30 PM/.test(r.firstCard) && /book ahead/.test(r.firstCard) && /Found on/.test(r.firstCard));
        want('tastes note', /once 3 people/.test(r.tastesNote));
        want('refine adds three under', r.afterRefine === 6 && r.sections === 1);
        want('refine sends ask, refinement and shown', /"request":"A fondue dinner in Chamonix"/.test(r.refineSent) && /"refinements":\["cheaper"\]/.test(r.refineSent) && /La Fondue Test \(\$\$\$\)/.test(r.refineSent));
        want('book ticked for a reservation', r.bookTicked);
        want('toggle sent off', r.toggleSentOff);
        want('added as suggested with maps link', r.planStatus === 'suggested' && /^https:\/\/www\.google\.com\/maps\/search\//.test(r.planLink ?? ''));
        want('reservation to-do', /Book La Fondue Test/.test(r.todo) && /Dec 15/.test(r.todo));
        want('conversation kept', r.restored >= 6);
        want('no sideways scroll', r.overflow <= 0);
      }
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
