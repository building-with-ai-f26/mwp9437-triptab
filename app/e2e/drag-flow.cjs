// Run with the dev server up (npm run dev): node e2e/drag-flow.cjs
// Drag and drop on the itinerary (Build 3 polish, the 11/17 pod notes), at 1280 and at 390 wide.
// Desktop drags with the mouse; the phone uses real touch events (press and hold, then move), sent
// through Chrome's DevTools protocol, the way a finger does. Checks:
// - a plan moves to another slot, keeping its time when only the day changes;
// - moving it to another part clears its time and says so; Undo puts it back; a reload keeps it;
// - dropping it on a day chip moves it to that day, keeping its part;
// - a tap or click still opens it, and a quick swipe (a scroll) moves nothing.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const slot = (p, day, part) => p.locator(`[data-slot="${day}|${part}"]`);
const card = (p, day, part, title) => slot(p, day, part).locator('[data-draggable="true"]').filter({ hasText: title });
const center = (b) => ({ x: b.x + b.width / 2, y: b.y + Math.min(b.height / 2, 22) });
const note = (p) => p.getByTestId('move-note');
/** The note for a finished move (a move shows "Moving..." until it has saved). */
const moved = async (p, text) => {
  await note(p).filter({ hasText: text }).waitFor();
  return (await note(p).innerText()).replace(/\s+/g, ' ');
};

async function addTimedPlan(p, day, slotLabel, title, kind, time) {
  await p.locator(`#day-${day}`).getByRole('button', { name: slotLabel }).click();
  const d = h.dlg(p);
  await d.getByLabel('What').fill(title);
  await d.getByRole('radio', { name: kind }).click();
  await d.getByRole('radio', { name: 'Planned' }).click();
  if (time) await d.getByLabel('Starts at (optional)').fill(time);
  await d.getByRole('button', { name: 'Add to trip' }).click();
  await p.locator('dialog[open]').waitFor({ state: 'detached' });
  await p.locator(`#day-${day}`).getByText(title).first().waitFor();
}

/** Scrolls so a block sits just under the sticky bars, so it and what follows are on screen. */
async function bringUp(p, locator, offset = 190) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  await p.evaluate((dy) => window.scrollBy(0, dy), box.y - offset);
  await p.waitForTimeout(250);
}

// A screenshot can fire a resize, and a drag is cancelled on resize (as it should be when a phone
// rotates). So a picture mid-drag is taken on a drag that is then cancelled with Escape; the real
// drags take no pictures.
async function mouseDrag(p, from, to, { shot } = {}) {
  const a = center(await from.boundingBox());
  await p.mouse.move(a.x, a.y);
  await p.mouse.down();
  await p.mouse.move(a.x + 14, a.y + 10, { steps: 4 });
  const b = center(await to.boundingBox());
  await p.mouse.move(b.x, b.y, { steps: 18 });
  await p.waitForTimeout(200);
  if (shot) {
    await h.shot(p, shot);
    await p.keyboard.press('Escape');
  }
  await p.mouse.up();
}

async function touchDrag(p, from, to, { hold = 450, shot } = {}) {
  const cdp = await p.context().newCDPSession(p);
  const a = center(await from.boundingBox());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  await p.waitForTimeout(hold);
  const b = center(await to.boundingBox());
  for (let i = 1; i <= 14; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + ((b.x - a.x) * i) / 14, y: a.y + ((b.y - a.y) * i) / 14 }] });
    await p.waitForTimeout(20);
  }
  await p.waitForTimeout(200);
  if (shot) await h.shot(p, shot);
  await cdp.send('Input.dispatchTouchEvent', { type: shot ? 'touchCancel' : 'touchEnd', touchPoints: [] });
  await cdp.detach();
  if (shot) await p.waitForTimeout(400);
}

async function swipe(p, from) {
  const cdp = await p.context().newCDPSession(p);
  const a = center(await from.boundingBox());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x, y: a.y - i * 15 }] });
    await p.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function desktop(browser, result) {
  const p = h.watch(await (await h.context(browser, h.DESKTOP)).newPage(), 'desktop');
  const r = (result.desktop = {});
  await h.startSkiTrip(p, 'drag-desktop');
  await addTimedPlan(p, '2027-02-06', 'Add to evening', 'Fondue', 'Meal', '19:00');
  const fondue = card(p, '2027-02-06', 'evening', 'Fondue');

  // A click still opens the plan.
  await fondue.click();
  r.clickOpens = await h.dlg(p).isVisible();
  await p.keyboard.press('Escape');
  await p.locator('dialog[open]').waitFor({ state: 'detached' });

  // To the next day, same part: the 7 PM time stays.
  await bringUp(p, slot(p, '2027-02-06', 'evening'));
  await mouseDrag(p, fondue, slot(p, '2027-02-07', 'evening'), { shot: 'drag-desktop-dragging' });
  r.cancelLeftItAlone = (await card(p, '2027-02-06', 'evening', 'Fondue').count()) === 1 && (await note(p).count()) === 0;
  await mouseDrag(p, fondue, slot(p, '2027-02-07', 'evening'));
  await card(p, '2027-02-07', 'evening', 'Fondue').waitFor();
  r.noteSameDay = await moved(p, 'Moved Fondue to Sun, Feb 7, evening');
  r.timeKept = !/cleared/.test(r.noteSameDay);
  await h.shot(p, 'drag-desktop-moved');

  // To the morning: the time is cleared and the note says so; Undo puts it back.
  await mouseDrag(p, card(p, '2027-02-07', 'evening', 'Fondue'), slot(p, '2027-02-07', 'morning'));
  await card(p, '2027-02-07', 'morning', 'Fondue').waitFor();
  r.noteOtherPart = await moved(p, 'Moved Fondue to Sun, Feb 7, morning');
  await note(p).getByRole('button', { name: 'Undo' }).click();
  r.undoNote = await moved(p, 'Put Fondue back.');
  await card(p, '2027-02-07', 'evening', 'Fondue').waitFor();
  r.undoneToEvening = true;

  // A reload keeps the move.
  await p.reload();
  await p.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  r.afterReload = (await card(p, '2027-02-07', 'evening', 'Fondue').count()) === 1 && (await card(p, '2027-02-06', 'evening', 'Fondue').count()) === 0;

  // Dropped on a day chip: to that day, same part, from wherever the page is scrolled.
  await bringUp(p, slot(p, '2027-02-07', 'evening'), 260);
  const chip9 = p.locator('nav[aria-label="Days"] [data-day="2027-02-09"]');
  await mouseDrag(p, card(p, '2027-02-07', 'evening', 'Fondue'), chip9, { shot: 'drag-desktop-chip' });
  await mouseDrag(p, card(p, '2027-02-07', 'evening', 'Fondue'), chip9);
  await card(p, '2027-02-09', 'evening', 'Fondue').waitFor();
  r.chipDrop = await moved(p, 'Moved Fondue to Tue, Feb 9');
  r.overflow = await h.overflowX(p);
}

async function phone(browser, result) {
  const p = h.watch(await (await h.context(browser, h.PHONE)).newPage(), 'phone');
  const r = (result.phone = {});
  await h.startSkiTrip(p, 'drag-phone');
  await addTimedPlan(p, '2027-02-06', 'Add to evening', 'Fondue', 'Meal', null);
  const fondue = card(p, '2027-02-06', 'evening', 'Fondue');
  await bringUp(p, slot(p, '2027-02-06', 'morning'), 300);

  // A quick swipe is a scroll: nothing moves.
  await swipe(p, fondue);
  await p.waitForTimeout(500);
  r.swipeMovedNothing = (await note(p).count()) === 0 && (await card(p, '2027-02-06', 'evening', 'Fondue').count()) === 1;

  // Press and hold, then drag up to the morning.
  await bringUp(p, slot(p, '2027-02-06', 'morning'), 300);
  await touchDrag(p, card(p, '2027-02-06', 'evening', 'Fondue'), slot(p, '2027-02-06', 'morning'), { shot: 'drag-phone-dragging' });
  r.cancelLeftItAlone = (await card(p, '2027-02-06', 'evening', 'Fondue').count()) === 1;
  await bringUp(p, slot(p, '2027-02-06', 'morning'), 300);
  await touchDrag(p, card(p, '2027-02-06', 'evening', 'Fondue'), slot(p, '2027-02-06', 'morning'));
  await card(p, '2027-02-06', 'morning', 'Fondue').waitFor();
  r.note = await moved(p, 'Moved Fondue to Sat, Feb 6, morning');
  await h.shot(p, 'drag-phone-moved');

  // Onto a day chip.
  await touchDrag(p, card(p, '2027-02-06', 'morning', 'Fondue'), p.locator('nav[aria-label="Days"] [data-day="2027-02-08"]'));
  await card(p, '2027-02-08', 'morning', 'Fondue').waitFor();
  r.chipDrop = await moved(p, 'Moved Fondue to Mon, Feb 8');

  // Hold it at the bottom edge: the page scrolls behind the lifted plan; then drop it mid-screen.
  await bringUp(p, slot(p, '2027-02-08', 'morning'), 300);
  const cdp = await p.context().newCDPSession(p);
  const a = center(await card(p, '2027-02-08', 'morning', 'Fondue').boundingBox());
  const before = await p.evaluate(() => window.scrollY);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  await p.waitForTimeout(450);
  const bottom = (await p.evaluate(() => window.innerHeight)) - 30;
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x, y: a.y + ((bottom - a.y) * i) / 10 }] });
    await p.waitForTimeout(20);
  }
  await p.waitForTimeout(1200);
  r.scrolledBehind = (await p.evaluate(() => window.scrollY)) - before;
  // Back to mid-screen, out of the edge, so the page stops; then aim at the slot there.
  const midY = Math.round((await p.evaluate(() => window.innerHeight)) * 0.55);
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 260, y: bottom + ((midY - bottom) * i) / 8 }] });
    await p.waitForTimeout(20);
  }
  await p.waitForTimeout(400);
  const mid = await p.evaluate(() => {
    for (let y = Math.round(window.innerHeight * 0.4); y < window.innerHeight * 0.75; y += 15) {
      const s = document.elementFromPoint(260, y)?.closest('[data-slot]');
      if (s) {
        const r = s.getBoundingClientRect();
        return { id: s.getAttribute('data-slot'), x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 22) };
      }
    }
    return null;
  });
  for (let i = 1; i <= 4; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 260 + ((mid.x - 260) * i) / 4, y: midY + ((mid.y - midY) * i) / 4 }] });
    await p.waitForTimeout(20);
  }
  await p.waitForTimeout(250);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  const [day, part] = mid.id.split('|');
  await card(p, day, part, 'Fondue').waitFor();
  r.droppedAfterScroll = mid.id;

  // A tap still opens it (after the brief pause that keeps a drop from also opening the plan).
  await p.waitForTimeout(500);
  await card(p, day, part, 'Fondue').tap();
  r.tapOpens = await h.dlg(p).isVisible();
  r.overflow = await h.overflowX(p);
}

const result = {};
(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  await desktop(browser, result);
  await phone(browser, result);
  result.errors = h.errors;
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  const d = result.desktop;
  const m = result.phone;
  const ok =
    d.clickOpens && d.cancelLeftItAlone && d.timeKept && /Moved Fondue to Sun, Feb 7, evening/.test(d.noteSameDay) && /7:00 PM time was cleared/.test(d.noteOtherPart) &&
    d.undoneToEvening && d.afterReload && /Tue, Feb 9, evening/.test(d.chipDrop) && d.overflow <= 0 &&
    m.swipeMovedNothing && m.cancelLeftItAlone && /Moved Fondue to Sat, Feb 6, morning/.test(m.note) && /Mon, Feb 8, morning/.test(m.chipDrop) && m.scrolledBehind > 150 && m.droppedAfterScroll > '2027-02-08|morning' && m.tapOpens && m.overflow <= 0 &&
    result.errors.length === 0;
  if (!ok) process.exit(1);
})().catch((e) => {
  console.error('FLOW FAILED:', e.message.split('\n').slice(0, 4).join(' | '));
  console.error('errors so far:', h.errors);
  console.error('results so far:', JSON.stringify(result));
  process.exit(1);
});
