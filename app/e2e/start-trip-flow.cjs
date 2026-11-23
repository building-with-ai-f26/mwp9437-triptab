// Start a trip and add plans, from the 11/17 pod feedback (Build 3), at 1280 and 390 wide:
// 1. stops suggest places as you type (Open-Meteo's answers are faked here, so the run needs no
//    outside service), with the arrow keys and Enter or a tap;
// 2. the photo behind the form stays put while you type and changes once a place is picked;
// 3. on a phone, the Add a plan dialog opens where you are instead of scrolling you to the top.
// Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const PLACES = {
  Barc: [
    { name: 'Barcs', country: 'Hungary', population: 12116 },
    { name: 'Barcelona', admin1: 'Catalonia', country: 'Spain', population: 1686208 },
    { name: 'Barcelona', admin1: 'Anzoátegui', country: 'Venezuela', population: 815141 },
  ],
  Lisb: [{ name: 'Lisbon', admin1: 'Lisbon', country: 'Portugal', population: 517802 }],
};

const photo = (page) => page.locator('[aria-hidden] > img').first().getAttribute('src');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const ctx = await h.context(browser, opts);
  r.lookups = [];
  await ctx.route('https://geocoding-api.open-meteo.com/**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('name');
    r.lookups.push(q);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: PLACES[q] ?? [] }) });
  });
  const p = h.watch(await ctx.newPage(), label);
  await p.goto(`${h.BASE}/sign-in?next=/trips/new`);
  await h.signUp(p, 'Mike', `start-${label}`);
  await p.getByRole('heading', { name: "Where's the group going?" }).waitFor();

  // 1 and 2: the first stop by keyboard, the second by tap.
  const before = await photo(p);
  const stop1 = p.getByRole('combobox', { name: 'Stop 1 place' });
  await stop1.pressSequentially('Barc', { delay: 60 });
  await p.getByRole('listbox').waitFor();
  r.photoSteadyWhileTyping = (await photo(p)) === before;
  r.firstSuggestion = (await p.getByRole('option').first().innerText()).replace(/\s+/g, ' ');
  r.suggestions = await p.getByRole('option').count();
  await h.shot(p, `start-trip-places-${label}`);
  await stop1.press('ArrowDown');
  await stop1.press('Enter');
  r.stop1 = await stop1.inputValue();
  r.photoChangedOnPick = (await photo(p)) !== before;

  await p.getByRole('button', { name: 'Add a stop' }).click();
  const stop2 = p.getByRole('combobox', { name: 'Stop 2 place' });
  await stop2.pressSequentially('Lisb', { delay: 60 });
  await p.getByRole('option', { name: /Lisbon/ }).click();
  r.stop2 = await stop2.inputValue();
  r.listClosed = (await p.getByRole('listbox').count()) === 0;

  // A name with no suggestion still works, and the photo only moves once you leave the box.
  await stop2.fill('');
  const mid = await photo(p);
  await stop2.pressSequentially('Somewhere Else', { delay: 30 });
  r.photoSteadyWhileTypingUnknown = (await photo(p)) === mid;
  await stop2.fill('Lisbon');
  await p.getByLabel('Trip name').click();
  r.overflow = await h.overflowX(p);

  // 3. The ski trip, then a slot near the end of the itinerary.
  await p.getByRole('button', { name: 'Fill in the ski trip example' }).click();
  r.noListAfterExample = (await p.getByRole('listbox').count()) === 0;
  await p.getByRole('button', { name: 'Start the trip' }).click();
  await p.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  // An empty day is folded to one row (11/23): open it to reach its slots.
  await h.showDay(p, '2027-02-14');
  const slot = p.locator('#day-2027-02-14').getByRole('button', { name: 'Add to evening' });
  await slot.scrollIntoViewIfNeeded();
  const scrolledTo = await p.evaluate(() => Math.round(window.scrollY));
  await slot.click();
  await h.dlg(p).waitFor();
  const box = await h.dlg(p).boundingBox();
  const vh = await p.evaluate(() => window.innerHeight);
  r.stayedInPlace = (await p.evaluate(() => Math.round(window.scrollY))) === scrolledTo;
  r.dialogOnScreen = box.y >= 0 && box.y + box.height <= vh + 1;
  r.dialogDay = await h.dlg(p).locator('select').first().inputValue();
  await h.shot(p, `add-plan-in-place-${label}`);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok =
        r.photoSteadyWhileTyping && r.photoChangedOnPick && r.photoSteadyWhileTypingUnknown &&
        r.firstSuggestion.startsWith('Barcelona Catalonia, Spain') && r.suggestions === 3 &&
        r.stop1 === 'Barcelona' && r.stop2 === 'Lisbon' && r.listClosed && r.noListAfterExample &&
        !r.lookups.includes('Barcelona') &&
        r.overflow <= 0 && r.stayedInPlace && r.dialogOnScreen && r.dialogDay === '2027-02-14';
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
