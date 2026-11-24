// Mike's 11/23 review, at 1280 and 390 wide. Desktop: a banner of tabs under the header (Overview,
// Itinerary, Money, To do, People), each showing its own section. Phone: the legend is one row and
// so are the buttons under it. Both: Stops and dates opens from Travel and lodging (the header's
// gear is gone), and the profile formats a phone number as it's typed and holds Also forward from.
// Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const shown = (page, sel) => page.locator(sel).first().isVisible();
const SECTION = { itinerary: '[data-tour="itinerary"]', money: 'section[aria-labelledby="money-title"]', todo: 'section[aria-labelledby="actions-title"]', people: 'section[aria-labelledby="people-title"]' };
const which = async (page) => {
  const out = [];
  for (const [k, sel] of Object.entries(SECTION)) if (await shown(page, sel)) out.push(k);
  return out.join(',');
};

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const phone = label === 'phone';
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `sections-${label}`);
  await h.addPlan(p, '2027-02-06', 'Add to day', { title: 'Glacier hike', status: 'Planned' });

  // ---------- The legend and the buttons: one row each ----------
  const rows = async (sel) => p.locator(sel).evaluate((el) => new Set([...el.children].map((c) => Math.round(c.getBoundingClientRect().top / 8))).size);
  r.legendRows = await rows('[data-testid="legend"]');
  r.actionRows = await p.locator('[data-testid="itinerary-actions"]').evaluate((el) => {
    const tops = [...el.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().top / 8));
    return new Set(tops).size;
  });
  r.actionButtons = await p.locator('[data-testid="itinerary-actions"] button').count();
  r.minTap = await p.locator('[data-testid="itinerary-actions"] button').evaluateAll((els) => Math.min(...els.map((e) => Math.round(e.getBoundingClientRect().height))));
  r.overflow = await h.overflowX(p);
  r.gearGone = (await p.getByRole('button', { name: 'Trip settings' }).count()) === 0;
  await h.shot(p, `sections-itinerary-${label}`);

  // ---------- Desktop: the banner of tabs ----------
  if (!phone) {
    const tabs = p.getByTestId('top-tabs');
    r.tabs = (await tabs.getByRole('tab').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).join('|');
    r.overview = await which(p);
    await h.shot(p, 'sections-overview-desktop');
    for (const [name, key] of [['Itinerary', 'itinerary'], ['Money', 'money'], ['To do', 'todo'], ['People', 'people']]) {
      await tabs.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
      r[key] = await which(p);
      r[`${key}Overflow`] = await h.overflowX(p);
      await h.shot(p, `sections-${key}-desktop`);
    }
    // Overview's "Every cost and payment" opens the Money tab, where the full list is.
    await tabs.getByRole('tab', { name: 'Overview' }).click();
    r.backToOverview = await which(p);
    r.bottomBarHidden = !(await p.getByTestId('bottom-bar').isVisible());
  } else {
    r.topTabsHidden = !(await p.getByTestId('top-tabs').isVisible());
  }

  // ---------- Stops and dates lives in Travel and lodging ----------
  const travel = p.locator('section[aria-labelledby="travel-title"]');
  await travel.getByRole('button', { name: 'Stops and dates' }).click();
  await h.dlg(p).getByRole('heading', { name: 'Trip settings' }).waitFor();
  r.settingsHasName = (await h.dlg(p).getByLabel('Trip name').inputValue()).length > 0;
  await h.shot(p, `sections-stops-${label}`);
  await h.dlg(p).getByRole('button', { name: 'Cancel' }).click();

  // ---------- Your profile: the phone formats as it's typed; Also forward from is here ----------
  await p.goto(`${h.BASE}/trips`);
  r.forwardOnTrips = await p.getByTestId('forward-from').count();
  await p.getByRole('button', { name: 'You: your profile' }).click();
  const form = p.getByRole('form', { name: 'Your profile' });
  await form.waitFor();
  const tel = form.getByLabel(/^Phone/);
  await tel.pressSequentially('6178931350');
  r.phone = await tel.inputValue();
  for (let i = 0; i < 5; i++) await tel.press('Backspace');
  r.phoneAfterDeletes = await tel.inputValue();
  await tel.fill('');
  await tel.pressSequentially('+44 20 7946 0958');
  r.phoneAbroad = await tel.inputValue();
  await tel.fill('');
  await tel.pressSequentially('6178931350');
  const zelle = form.getByLabel(/^Zelle/);
  await zelle.pressSequentially('6178931350');
  r.zelle = await zelle.inputValue();
  await p.getByTestId('forward-from').waitFor();
  r.forwardOnYou = true;
  await form.getByRole('button', { name: 'Save' }).click();
  await p.getByText('Saved, on all your trips.').waitFor();
  await p.reload();
  await form.waitFor();
  r.phoneKept = await tel.inputValue();
  r.youOverflow = await h.overflowX(p);
  await p.getByTestId('forward-from').scrollIntoViewIfNeeded();
  await h.shot(p, `sections-you-${label}`);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const phone = label === 'phone';
      const ok = r.legendRows === 1 && r.actionRows === 1 && r.actionButtons === 4 && (!phone || r.minTap >= 36) && r.overflow <= 0 && r.gearGone &&
        (phone
          ? r.topTabsHidden
          : r.tabs === 'Overview|Itinerary|Money|To do|People 1' && r.overview === 'itinerary,money,todo,people' && r.itinerary === 'itinerary' && r.money === 'money' &&
            r.todo === 'todo' && r.people === 'people' && r.backToOverview === r.overview && r.bottomBarHidden &&
            ['itinerary', 'money', 'todo', 'people'].every((k) => r[`${k}Overflow`] <= 0)) &&
        r.settingsHasName && r.forwardOnTrips === 0 && r.forwardOnYou && r.phone === '(617) 893-1350' && r.phoneAfterDeletes === '(617) 89' &&
        r.phoneAbroad === '+44 20 7946 0958' && r.zelle === '(617) 893-1350' && r.phoneKept === '(617) 893-1350' && r.youOverflow <= 0;
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
