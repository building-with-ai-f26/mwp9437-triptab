// Show me around (the 11/17 pod notes): the first time a trip opens on a device, a short guide
// walks through it, ringing each part; on a phone it switches tabs. Done marks it seen, so a reload
// doesn't bring it back; the link under Your Itinerary replays it, and Skip or Escape stops it.
// At 1280 and 390 wide. Unlike the other flows, this one doesn't pre-mark the guide as seen.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const h = require('./helpers.cjs');

const TITLES = ['Your itinerary', 'Add plans', 'Tap a plan', 'To do', 'Money', 'People', 'Help, any time'];

async function context(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => {
    try { localStorage.setItem('triptab.test_run', '1'); } catch {}
  });
  return ctx;
}

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await context(browser, opts)).newPage(), label);
  // A trip with one plan, so the guide has a plan to point at. Its first open shows the guide; it's
  // skipped here so the plan can be added, and the guide is then cleared to show again on reload.
  await h.startSkiTrip(p, `tour-${label}`);
  const tour = p.getByTestId('tour');
  await tour.getByRole('dialog').waitFor({ timeout: 15000 });
  r.autoStarted = true;
  await tour.getByRole('button', { name: 'Skip' }).click();
  await tour.waitFor({ state: 'detached' });
  await h.addPlan(p, '2027-02-06', 'Add to evening', { title: 'Fondue at La Caleche', kind: 'Meal', status: 'Planned' });
  if (await h.dlg(p).count()) await h.dlg(p).getByRole('button', { name: 'Close' }).click();
  await p.evaluate(() => localStorage.removeItem('triptab.tour_seen'));
  await p.reload();

  // The whole guide, step by step.
  await tour.getByRole('dialog').waitFor({ timeout: 15000 });
  r.titles = [];
  r.tabs = [];
  r.ringed = [];
  for (let i = 0; i < TITLES.length; i++) {
    const card = tour.getByRole('dialog');
    await card.getByRole('heading', { name: TITLES[i] }).waitFor();
    await p.waitForTimeout(400);
    r.titles.push(await card.getByRole('heading').innerText());
    if (label === 'phone') r.tabs.push(await p.getByRole('tab', { selected: true }).innerText());
    // The ring sits on the part the step is about: its middle is inside that part.
    r.ringed.push(
      await p.evaluate(() => {
        const ring = document.querySelector('[data-testid="tour"] > div:nth-child(2)');
        const b = ring.getBoundingClientRect();
        const el = document.elementsFromPoint(b.left + b.width / 2, Math.min(b.top + b.height / 2, window.innerHeight - 10)).find((e) => !e.closest('[data-testid="tour"]'));
        return Boolean(el) && b.width > 40 && b.height > 30;
      }),
    );
    if (i === 0 || i === 2 || i === 4) await h.shot(p, `tour-${i + 1}-${label}`);
    await card.getByRole('button', { name: i === TITLES.length - 1 ? 'Done' : 'Next' }).click();
  }
  await tour.waitFor({ state: 'detached' });
  r.backOnItinerary = label === 'phone' ? (await p.getByRole('tab', { selected: true }).innerText()).includes('Itinerary') : true;
  r.overflow = await h.overflowX(p);

  // Seen: a reload doesn't bring it back.
  await p.reload();
  await p.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await p.waitForTimeout(2500);
  r.notAgain = (await tour.count()) === 0;

  // The link replays it; Back works; Escape stops it.
  await p.getByRole('button', { name: 'Show me around' }).first().click();
  await tour.getByRole('heading', { name: 'Your itinerary' }).waitFor();
  await tour.getByRole('button', { name: 'Next' }).click();
  await tour.getByRole('heading', { name: 'Add plans' }).waitFor();
  await tour.getByRole('button', { name: 'Back' }).click();
  r.back = (await tour.getByRole('heading').innerText()) === 'Your itinerary';
  await p.keyboard.press('Escape');
  await tour.waitFor({ state: 'detached' });
  r.escaped = true;
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok =
        r.autoStarted && r.titles.join('|') === TITLES.join('|') && r.ringed.every(Boolean) &&
        (label !== 'phone' || r.tabs.map((t) => t.trim().split(/\s/)[0]).join('|') === 'Itinerary|Itinerary|Itinerary|To|Money|People|Itinerary') &&
        r.backOnItinerary && r.notAgain && r.back && r.escaped && r.overflow <= 0;
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
