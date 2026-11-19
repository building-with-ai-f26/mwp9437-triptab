// A plan's Where suggests addresses and places as you type (Mike's 11/19 review: "addresses
// autocomplete"), leaning toward the stop the plan's day is at. Photon and Open-Meteo are faked
// here, so the flow checks TripTab, not their data: suggestions show, the search carries the
// stop's location, a pick fills the box with the place and its town, and it saves on the plan.
// At 1280 and 390 wide.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const h = require('./helpers.cjs');

const CHAMONIX = { name: 'Chamonix', admin1: 'Auvergne-Rhône-Alpes', country: 'France', population: 8611, latitude: 45.92, longitude: 6.87 };
const FEATURES = [
  { properties: { name: 'Grands Montets', city: 'Chamonix', state: 'Auvergne-Rhône-Alpes', country: 'France' } },
  { properties: { name: 'Grands Montets Ski School', housenumber: '340', street: 'Route des Grands Montets', city: 'Chamonix', country: 'France' } },
];

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const ctx = await h.context(browser, opts);
  r.photon = [];
  await ctx.route('https://geocoding-api.open-meteo.com/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [CHAMONIX] }) }),
  );
  await ctx.route('https://photon.komoot.io/**', (route) => {
    const u = new URL(route.request().url());
    r.photon.push({ q: u.searchParams.get('q'), lat: u.searchParams.get('lat'), lon: u.searchParams.get('lon') });
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ features: FEATURES }) });
  });
  const p = h.watch(await ctx.newPage(), label);
  await h.startSkiTrip(p, `where-${label}`);

  // Saturday 2/6 is in Chamonix.
  await p.locator('#day-2027-02-06').getByRole('button', { name: 'Add to morning' }).click();
  const d = h.dlg(p);
  await d.getByLabel('What').fill('Skiing');
  const where = d.getByRole('combobox', { name: 'Where (optional)' });
  await where.pressSequentially('Grands', { delay: 50 });
  await d.getByRole('listbox').waitFor();
  r.options = (await d.getByRole('listbox').getByRole('option').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  r.credit = (await d.getByRole('listbox').innerText()).includes('OpenStreetMap');
  await h.shot(p, `where-suggestions-${label}`);
  // Keyboard on desktop, a tap on the phone.
  if (label === 'desktop') {
    await where.press('ArrowDown');
    await where.press('Enter');
  } else {
    await d.getByRole('listbox').getByRole('option').first().click();
  }
  r.filled = await where.inputValue();
  r.listClosed = (await d.getByRole('listbox').count()) === 0;
  r.leanedToStop = r.photon.some((c) => c.lat === '45.92' && c.lon === '6.87');
  await d.getByRole('button', { name: 'Add to trip' }).click();
  await p.locator('#day-2027-02-06 .item-card').filter({ hasText: 'Skiing' }).first().waitFor();
  r.onCard = (await p.locator('#day-2027-02-06 .item-card').filter({ hasText: 'Skiing' }).first().innerText()).includes('Grands Montets, Chamonix');
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
        r.options.length === 2 && /Grands Montets/.test(r.options[0]) && /340 Route des Grands Montets/.test(r.options[1]) && r.credit &&
        r.filled === 'Grands Montets, Chamonix' && r.listClosed && r.leanedToStop && r.onCard && r.overflow <= 0;
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
