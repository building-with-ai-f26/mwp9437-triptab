// A sheet's main buttons stay on screen (11/23 review, item 9), at 390 and 1280 wide: Add a plan's
// Add to trip, Edit plan's Done and Confirm's Confirm and log are in view the moment the sheet
// opens and after scrolling its fields, and still take the tap. Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

async function inView(page, button, height) {
  const b = await button.boundingBox();
  const hit = await button.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });
  return Boolean(b) && b.y >= 0 && b.y + b.height <= height && hit;
}

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const H = opts.viewport.height;
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `sheet-${label}`);

  await h.addByHand(p); // T9: Add (a laptop's button, or the phone's + sheet)
  let d = h.dlg(p);
  const add = d.getByRole('button', { name: 'Add to trip' });
  await d.getByLabel('What').waitFor();
  r.addOnOpen = await inView(p, add, H);
  await d.getByLabel('What').fill('Dinner at Le Cap');
  await d.getByRole('radio', { name: 'Planned' }).click();
  await h.openCost(d);
  await d.getByLabel(/Estimated/).fill('380');
  r.addAfterFields = await inView(p, add, H);
  // Scrolled to the top and to the bottom of the fields, it's still there.
  await d.getByLabel('What').scrollIntoViewIfNeeded();
  r.addAtTop = await inView(p, add, H);
  await h.shot(p, `sheet-buttons-add-${label}`);
  await add.click();
  await p.locator('.item-card', { hasText: 'Dinner at Le Cap' }).first().waitFor();

  await p.locator('.item-card', { hasText: 'Dinner at Le Cap' }).first().click();
  d = h.dlg(p);
  await d.getByLabel('What').waitFor();
  r.doneOnOpen = await inView(p, d.getByRole('button', { name: 'Done' }), H);
  r.removeOnOpen = await inView(p, d.getByRole('button', { name: 'Remove' }), H);
  await h.openCost(d);
  await d.getByRole('button', { name: 'Confirm with the real cost' }).click();
  d = h.dlg(p);
  const confirm = d.getByRole('button', { name: 'Confirm and log' });
  await d.getByLabel('What it cost').waitFor();
  r.confirmOnOpen = await inView(p, confirm, H);
  await h.shot(p, `sheet-buttons-confirm-${label}`);
  await confirm.click();
  await p.locator('.item-card[data-status="confirmed"]', { hasText: 'Dinner at Le Cap' }).first().waitFor();
  r.overflow = await h.overflowX(p);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'phone', h.PHONE, result);
    await run(browser, 'desktop', h.DESKTOP, result);
    for (const [label, r] of Object.entries(result)) {
      const ok = r.addOnOpen && r.addAfterFields && r.addAtTop && r.doneOnOpen && r.removeOnOpen && r.confirmOnOpen && r.overflow <= 0;
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
