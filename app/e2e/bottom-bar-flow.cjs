// The phone's bottom bar (Mike's call, 11/23): Itinerary, Money, To do and People as a fixed bar
// along the bottom at 390 wide, replacing the top tabs; hidden at 1280, where the panels sit side
// by side. Checks the bar stays put while the page scrolls, each button is a 44 px tap target, the
// page's last row ends above it, each section keeps its own place, and a dialog opens above it.
// Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

async function phone(browser, r) {
  const p = h.watch(await (await h.context(browser, h.PHONE)).newPage(), 'phone');
  await h.startSkiTrip(p, 'bar-phone');
  const bar = p.getByTestId('bottom-bar');
  const tabs = bar.getByRole('tab');
  r.tabs = await tabs.allInnerTexts();
  r.tablists = await p.getByRole('tablist').count();
  r.minTap = await tabs.evaluateAll((els) => Math.min(...els.map((e) => Math.round(Math.min(e.getBoundingClientRect().height, e.getBoundingClientRect().width)))));
  const atBottom = async () => {
    const b = await bar.boundingBox();
    return Math.round(b.y + b.height) === 844 && Math.round(b.width) === 390;
  };
  r.pinned = await atBottom();
  await h.shot(p, 'bottom-bar-itinerary-phone');

  // Scrolled to the very end, the bar is still there and the last row sits above it.
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await p.waitForTimeout(300);
  r.pinnedAfterScroll = await atBottom();
  const lastSlot = await p.locator('[id^="day-"]').last().locator('button').last().boundingBox();
  r.lastRowClear = lastSlot.y + lastSlot.height <= (await bar.boundingBox()).y;
  const deep = await p.evaluate(() => window.scrollY);

  // Each section, one pane at a time; the itinerary keeps its place.
  await bar.getByRole('tab', { name: 'Money' }).click();
  await p.locator('section[aria-labelledby="money-title"]').waitFor();
  r.moneyFromTop = await p.evaluate(() => window.scrollY);
  r.itineraryHidden = !(await p.getByRole('heading', { name: 'Your Itinerary' }).isVisible());
  await h.shot(p, 'bottom-bar-money-phone');
  await bar.getByRole('tab', { name: 'To do' }).click();
  await p.locator('section[aria-labelledby="actions-title"]').waitFor();
  await bar.getByRole('tab', { name: /^People \(1\)$/ }).click();
  await p.locator('section[aria-labelledby="people-title"]').waitFor();
  r.selected = await bar.getByRole('tab', { selected: true }).innerText();
  await h.shot(p, 'bottom-bar-people-phone');
  await bar.getByRole('tab', { name: 'Itinerary' }).click();
  await p.waitForTimeout(300);
  r.keptPlace = Math.abs((await p.evaluate(() => window.scrollY)) - deep) < 4;
  // Tapping the section you're on goes back to its top.
  await bar.getByRole('tab', { name: 'Itinerary' }).click();
  await p.waitForFunction(() => window.scrollY === 0);
  r.backToTop = true;

  // A dialog opens above the bar: its Add to trip button takes the tap, not the bar.
  await h.addByHand(p); // T9: Add (a laptop's button, or the phone's + sheet)
  const add = h.dlg(p).getByRole('button', { name: 'Add to trip' });
  await add.scrollIntoViewIfNeeded();
  r.dialogOnTop = await add.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
  });
  r.barUnderDialog = await p.evaluate(() => {
    const top = document.elementFromPoint(195, 820);
    return !document.querySelector('[data-testid="bottom-bar"]').contains(top);
  });
  await h.shot(p, 'bottom-bar-dialog-phone');
  r.overflow = await h.overflowX(p);
}

async function desktop(browser, r) {
  const p = h.watch(await (await h.context(browser, h.DESKTOP)).newPage(), 'desktop');
  await h.startSkiTrip(p, 'bar-desktop');
  r.barHidden = !(await p.getByTestId('bottom-bar').isVisible());
  r.sideBySide = (await p.getByRole('heading', { name: 'Your Itinerary' }).isVisible()) && (await p.locator('section[aria-labelledby="money-title"]').isVisible());
  r.overflow = await h.overflowX(p);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = { phone: {}, desktop: {} };
  try {
    await phone(browser, result.phone);
    await desktop(browser, result.desktop);
    const a = result.phone;
    const b = result.desktop;
    const ok = a.tabs.join('|') === 'Itinerary|Money|To do|People' && a.tablists === 1 && a.minTap >= 44 && a.pinned && a.pinnedAfterScroll &&
      a.lastRowClear && a.moneyFromTop === 0 && a.itineraryHidden && /People/.test(a.selected) && a.keptPlace && a.backToTop && a.dialogOnTop && a.barUnderDialog &&
      a.overflow <= 0 && b.barHidden && b.sideBySide && b.overflow <= 0;
    if (!ok) result.failure = 'a check failed';
  } catch (e) {
    result.failure = String(e);
  } finally {
    result.errors = h.errors;
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    if (result.failure || result.errors.length) process.exit(1);
  }
})();
