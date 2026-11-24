// T3 (Mike's 11/23 ski trip test, journal/pm-review/spec-11-23.md): rename and delete a trip where
// you'd look. At 1280 and 390 wide, against TripTab dev. From Overview, an Owner taps the trip's
// name (one tap), renames it in Trip settings and sees the new name in the header and on My trips;
// the same dialog holds Delete trip (with its confirm), which works. There's no header gear (Mike's
// 11/23 review took it out). A Viewer, joined by the group link, has no name button. All made up.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const phone = label === 'phone';
  const o = h.watch(await (await h.context(browser, opts)).newPage(), `owner-${label}`);
  const url = await h.startSkiTrip(o, `rename-owner-${label}`);
  // A Viewer, to check they have no way in.
  if (phone) await o.getByRole('tab', { name: /People/ }).click();
  await o.locator('section[aria-labelledby="people-title"]').getByRole('button', { name: 'Add', exact: true }).click();
  await h.dlg(o).getByLabel('Name').fill('Sam');
  await h.dlg(o).getByRole('radio', { name: 'Viewer' }).click();
  await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
  await h.dlg(o).getByText('Added Sam').waitFor();
  await h.dlg(o).getByRole('button', { name: 'Done' }).click();
  const link = (await o.locator('section[aria-labelledby="link-title"] code').textContent()).trim();
  if (!phone) await o.getByRole('tab', { name: 'Overview' }).click();
  else await o.getByRole('tab', { name: /Itinerary/ }).click();

  // The header shows the whole of "Euro ski trip" (a fourth button on a phone had cut it to "Euro ski ...").
  r.nameTruncated = await o.getByTestId('trip-name').locator('span.truncate').evaluate((el) => el.scrollWidth > el.clientWidth);
  // One tap on the name opens Trip settings with the name field.
  let taps = 0;
  await o.getByTestId('trip-name').click();
  taps++;
  const d = h.dlg(o);
  await d.getByRole('heading', { name: 'Trip settings' }).waitFor();
  r.tapsToName = taps;
  r.nameFieldFocusable = await d.getByLabel('Trip name').isVisible();
  await d.getByLabel('Trip name').fill('Euro Ski Trip 2027');
  await h.shot(o, `rename-dialog-${label}`);
  await d.getByRole('button', { name: 'Save' }).click();
  await o.locator('dialog[open]').waitFor({ state: 'detached' });
  await o.getByTestId('trip-name').getByText('Euro Ski Trip 2027').waitFor();
  r.header = (await o.getByTestId('trip-name').locator('span.truncate').innerText()).trim();
  r.headerOverflow = await h.overflowX(o);
  await h.shot(o, `rename-header-${label}`);

  // The same dialog holds Delete trip; no header gear came back.
  r.noGear = (await o.getByRole('button', { name: 'Trip settings' }).count()) === 0;
  await o.getByTestId('trip-name').click();
  r.settingsButtonOpens = await h.dlg(o).getByRole('heading', { name: 'Trip settings' }).isVisible();
  r.hasDelete = await h.dlg(o).getByRole('button', { name: 'Delete trip' }).isVisible();
  await h.dlg(o).getByRole('button', { name: 'Cancel' }).click();
  await o.locator('dialog[open]').waitFor({ state: 'detached' });

  // My trips shows the new name.
  await o.getByRole('link', { name: 'My trips' }).click();
  await o.waitForURL(/\/trips$/);
  r.onTripsList = await o.getByText('Euro Ski Trip 2027').first().isVisible();
  await o.goto(url);
  await o.getByRole('heading', { name: 'Your Itinerary' }).waitFor();

  // Sam, a Viewer: no name button, no Settings.
  const v = h.watch(await (await h.context(browser, opts)).newPage(), `viewer-${label}`);
  await v.goto(link);
  await v.getByRole('button', { name: 'Sam' }).click();
  await h.signUp(v, 'Sam', `rename-viewer-${label}`);
  await h.joinTrip(v);
  await v.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  r.viewerSeesName = (await v.locator('header h1').innerText()).trim();
  r.viewerNameButton = await v.getByTestId('trip-name').count();
  r.viewerSettings = await v.getByRole('button', { name: 'Trip settings', exact: true }).count();
  await h.shot(v, `rename-viewer-${label}`);

  // Delete, with its confirm.
  let confirmed = null;
  o.once('dialog', (x) => {
    confirmed = x.message();
    x.accept();
  });
  await o.getByTestId('trip-name').click();
  await h.dlg(o).getByRole('button', { name: 'Delete trip' }).click();
  await o.waitForURL(/\/trips$/);
  await o.getByText('No trips yet').waitFor();
  r.deleteConfirm = confirmed;
  r.deleted = true;
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok =
        r.tapsToName <= 2 && r.nameFieldFocusable && r.header === 'Euro Ski Trip 2027' && r.headerOverflow <= 0 && r.noGear && r.settingsButtonOpens && r.hasDelete &&
        r.onTripsList && r.viewerSeesName === 'Euro Ski Trip 2027' && r.viewerNameButton === 0 && r.viewerSettings === 0 && !r.nameTruncated && Boolean(r.deleteConfirm) && r.deleted;
      if (!ok) result.failure = `${result.failure ? `${result.failure} | ` : ''}${label}: a check failed`;
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
