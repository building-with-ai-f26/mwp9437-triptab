// Help, the guide and feedback (Mike's call 11/23), at 1280 and 390 wide. Help is on every
// signed-in page long after the first log-in: a button in the header where there's room, and a line
// at the bottom of every page. From a trip it replays Show me around; Guide opens How TripTab
// works, which a signed-out visitor can read too; Send feedback takes a bug or an idea, refuses an
// empty one, and says thank you. Needs the feedback migration (TripTab dev has it once its pull
// request has built). Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const phone = label === 'phone';
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `help-${label}`);
  const footer = p.getByTestId('help-footer');
  const tour = p.getByTestId('tour');

  // ---------- On a trip: the line at the bottom, on every phone tab ----------
  await footer.scrollIntoViewIfNeeded();
  r.footer = (await footer.innerText()).replace(/\s+/g, ' ').trim();
  r.minTap = await footer.locator('a, button').evaluateAll((els) => Math.min(...els.map((e) => Math.round(e.getBoundingClientRect().height))));
  if (phone) {
    const bar = await p.getByTestId('bottom-bar').boundingBox();
    const f = await footer.boundingBox();
    r.clearOfBar = f.y + f.height <= bar.y + 1;
    r.onEveryTab = true;
    for (const t of ['Money', 'To do', /^People/]) {
      await p.getByTestId('bottom-bar').getByRole('tab', { name: t }).click();
      r.onEveryTab = r.onEveryTab && (await footer.count()) === 1 && (await footer.isVisible());
    }
    await p.getByTestId('bottom-bar').getByRole('tab', { name: 'Itinerary' }).click();
    r.headerButton = await p.getByRole('button', { name: 'Help and feedback' }).isVisible();
  } else {
    r.clearOfBar = true;
    r.onEveryTab = true;
    r.headerButton = await p.getByRole('button', { name: 'Help and feedback' }).isVisible();
  }
  await h.shot(p, `help-footer-${label}`);

  // ---------- Show me around, long after the first visit ----------
  if (phone) {
    await footer.scrollIntoViewIfNeeded();
    await footer.getByRole('button', { name: 'Show me around' }).click();
  } else {
    await p.getByRole('button', { name: 'Help and feedback' }).click();
    await h.dlg(p).getByTestId('help-menu').waitFor();
    r.menu = (await h.dlg(p).getByTestId('help-menu').locator('a, button').allInnerTexts()).map((t) => t.split('\n')[0].trim());
    await h.shot(p, `help-menu-${label}`);
    await h.dlg(p).getByRole('button', { name: /Show me around/ }).click();
  }
  await tour.getByRole('heading', { name: 'Your itinerary' }).waitFor();
  r.tourSteps = (await tour.getByText(/Show me around · 1 of \d+/i).innerText()).match(/of (\d+)/i)[1];
  await p.keyboard.press('Escape');
  await tour.waitFor({ state: 'detached' });

  // ---------- Send feedback: empty is refused, then it's sent ----------
  await footer.scrollIntoViewIfNeeded();
  await footer.getByRole('button', { name: 'Send feedback' }).click();
  const d = h.dlg(p);
  await d.getByRole('button', { name: 'Send' }).click();
  r.emptyRefused = (await d.getByRole('alert').innerText()).trim();
  await d.getByRole('radio', { name: 'An idea or request' }).click();
  await d.getByLabel('Tell us').fill('A packing list for the trip would be great.');
  r.overflowForm = await h.overflowX(p);
  await h.shot(p, `help-feedback-${label}`);
  await d.getByRole('button', { name: 'Send' }).click();
  await d.getByTestId('feedback-thanks').waitFor();
  r.thanks = (await d.getByTestId('feedback-thanks').innerText()).split('\n')[0].trim();
  await d.getByRole('button', { name: 'Done' }).click();
  await d.waitFor({ state: 'detached' });
  // The next one starts empty.
  await footer.getByRole('button', { name: 'Send feedback' }).click();
  r.freshForm = (await h.dlg(p).getByLabel('Tell us').inputValue()) === '';
  await p.keyboard.press('Escape');

  // ---------- The guide, from My trips ----------
  await p.goto(`${h.BASE}/trips`);
  await p.getByRole('button', { name: 'Help and feedback' }).click();
  await h.dlg(p).getByRole('link', { name: /How TripTab works/ }).click();
  await p.waitForURL(/\/guide$/);
  await p.getByRole('heading', { name: 'How TripTab works' }).waitFor();
  r.guideSections = await p.locator('article section h2').allInnerTexts();
  r.guideOverflow = await h.overflowX(p);
  r.guideMinTap = await p.getByRole('navigation', { name: 'In this guide' }).locator('a').evaluateAll((els) => Math.min(...els.map((e) => Math.round(e.getBoundingClientRect().height))));
  await h.shot(p, `help-guide-${label}`);
  await p.getByRole('link', { name: 'My trips' }).click();
  await p.waitForURL(/\/trips$/);
  r.backToTrips = true;

  // ---------- Your profile has it too ----------
  await p.goto(`${h.BASE}/you`);
  await p.getByTestId('help-footer').waitFor();
  r.onYou = (await p.getByRole('button', { name: 'Help and feedback' }).count()) === 1;

  // ---------- Signed out: the guide is public, from the landing page ----------
  const v = h.watch(await (await h.context(browser, opts)).newPage(), `visitor-${label}`);
  await v.goto(`${h.BASE}/`);
  await v.getByRole('link', { name: 'How TripTab works' }).click();
  await v.getByRole('heading', { name: 'How TripTab works' }).waitFor();
  r.publicGuide = true;
  await v.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    const SECTIONS = 'Start a trip and get everyone in|Plans|Money|To do|You: your profile|On a phone or a computer|Help and feedback';
    for (const [label, r] of Object.entries(result)) {
      const phone = label === 'phone';
      const ok = r.footer === 'Show me around Guide Send feedback Privacy' && r.minTap >= 44 && r.clearOfBar && r.onEveryTab && r.headerButton === !phone &&
        (phone || r.menu.join('|') === 'Show me around|How TripTab works|Send feedback|Privacy') && Number(r.tourSteps) >= 5 &&
        /few words/.test(r.emptyRefused) && r.overflowForm <= 0 && /^Thank you/.test(r.thanks) && r.freshForm &&
        r.guideSections.join('|') === SECTIONS && r.guideOverflow <= 0 && r.guideMinTap >= 44 && r.backToTrips && r.onYou && r.publicGuide;
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
