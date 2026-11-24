// A plan's link, and reading a confirmation from Add a plan (C22, Mike's call 11/20, from his 11/19
// review: "I did not see an option to upload screenshots or PDFs ... Or added a link to an Airbnb").
// At 1280 and 390 wide, against TripTab dev. Add a plan offers "Upload a screenshot or PDF", which
// opens import with the file picker; a stay gets an Airbnb link typed without https://, a bad link
// is refused, and the saved link opens from the plan.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const h = require('./helpers.cjs');


async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `link-${label}`);

  // Add a plan: the way to a confirmation is at the top, and it opens import's file picker.
  await h.addByHand(p); // T9: Add (a laptop's button, or the phone's + sheet)
  const offer = h.dlg(p).getByRole('button', { name: /Upload a screenshot or PDF/ });
  await offer.waitFor();
  await h.shot(p, `link-upload-offer-${label}`);
  await offer.click();
  await h.dlg(p).getByRole('heading', { name: 'Import bookings' }).waitFor();
  r.importOpen = true;
  r.filePicker = (await h.dlg(p).getByLabel('Attach files').count()) === 1;
  r.onePlanDialog = (await p.locator('dialog[open]').count()) === 1;
  await h.dlg(p).getByRole('button', { name: 'Cancel' }).click();
  await h.dlg(p).waitFor({ state: 'detached' });
  r.nothingAdded = (await p.locator('.item-card').count()) === 0;

  // A stay with its Airbnb link, typed without https://.
  await h.showDay(p, '2027-02-05');
  await p.locator('#day-2027-02-05').getByRole('button', { name: 'Add to day' }).click();
  const d = h.dlg(p);
  await d.getByLabel('What').fill('Chamonix Airbnb');
  await d.getByRole('radio', { name: 'Stay' }).click();
  await d.getByLabel('Link (optional)').fill('my airbnb');
  await d.getByLabel('What').click();
  r.badLink = (await d.getByText('Type the link as a web address').innerText()).trim();
  await d.getByLabel('Link (optional)').fill('airbnb.com/rooms/48213');
  r.openHref = await d.getByRole('link', { name: 'Open airbnb.com' }).getAttribute('href');
  await h.shot(p, `link-field-${label}`);
  await d.getByRole('button', { name: 'Add to trip' }).click();
  await d.waitFor({ state: 'detached' });
  const stay = p.locator('.item-card').filter({ hasText: 'Chamonix Airbnb' }).first();
  await stay.waitFor();

  // Reopen it: the link was saved with https://, and it opens in a new tab.
  await stay.click();
  r.saved = await h.dlg(p).getByLabel('Link (optional)').inputValue();
  r.target = await h.dlg(p).getByRole('link', { name: 'Open airbnb.com' }).getAttribute('target');
  // Clear it: it saves as you go, and stays cleared.
  await h.dlg(p).getByLabel('Link (optional)').fill('');
  await h.dlg(p).getByText('Saved').waitFor();
  await h.dlg(p).getByRole('button', { name: 'Done' }).click();
  await h.dlg(p).waitFor({ state: 'detached' });
  await p.reload();
  await p.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await p.locator('.item-card').filter({ hasText: 'Chamonix Airbnb' }).first().click();
  r.cleared = await h.dlg(p).getByLabel('Link (optional)').inputValue();
  r.overflow = await h.overflowX(p);
  await h.dlg(p).getByRole('button', { name: 'Done' }).click();
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok =
        r.importOpen && r.filePicker && r.onePlanDialog && r.nothingAdded && /web address/.test(r.badLink) &&
        r.openHref === 'https://airbnb.com/rooms/48213' && r.saved === 'https://airbnb.com/rooms/48213' && r.target === '_blank' &&
        r.cleared === '' && r.overflow <= 0;
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
