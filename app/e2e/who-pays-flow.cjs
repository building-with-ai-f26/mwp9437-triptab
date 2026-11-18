// Run with the dev server up (npm run dev): node e2e/who-pays-flow.cjs
// Who pays (11/16): an owner at 1280 wide and a viewer on a 390 phone. A flight is "everyone pays
// their own" by default and can be logged while adding it; lift passes are switched to their own
// and three people log their own lines; each price shows only to its person and whoever entered
// it; the plan is Confirmed once everyone going has booked; a shared dinner is still one bill, and
// Settle up never includes an own line. Also records the PostHog events the app sends.
const { chromium } = require('playwright');
const zlib = require('zlib');
const h = require('./helpers.cjs');

const sent = [];
function listen(page) {
  page.on('request', (req) => {
    if (!/posthog\.com/.test(req.url())) return;
    const buf = req.postDataBuffer();
    if (!buf) return;
    let text;
    try { text = zlib.gunzipSync(buf).toString(); } catch { text = buf.toString(); }
    try {
      const body = JSON.parse(text);
      for (const e of Array.isArray(body) ? body : body.batch ?? [body]) {
        if (e.event && !e.event.startsWith('$')) sent.push({ event: e.event, to: e.properties?.to, who_pays: e.properties?.who_pays, test_run: e.properties?.test_run });
      }
    } catch { /* not an event batch */ }
  });
}

const card = (page, day, title) => page.locator(`#day-${day} .item-card`).filter({ hasText: title });
const panel = (page) => h.dlg(page).getByTestId('own-lines');
const status = (page) => h.dlg(page).getByTestId('own-status');

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  const o = h.watch(await (await h.context(browser, h.DESKTOP)).newPage(), 'owner');
  listen(o);
  result.tripUrl = await h.startSkiTrip(o);

  // People: Vic (a viewer, who joins on a phone) and Priya (added by name, never signs in).
  for (const [name, role] of [['Vic', 'Viewer'], ['Priya', 'Owner']]) {
    await o.locator('section[aria-labelledby="people-title"]').getByRole('button', { name: 'Add', exact: true }).click();
    await h.dlg(o).getByLabel('Name').fill(name);
    await h.dlg(o).getByRole('radio', { name: role }).click();
    await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
    await h.dlg(o).getByText(`Added ${name}`).waitFor();
    await h.dlg(o).getByRole('button', { name: 'Done' }).click();
  }
  const groupUrl = (await o.locator('section[aria-labelledby="link-title"] code').textContent()).trim();
  const v = h.watch(await (await h.context(browser, h.PHONE)).newPage(), 'vic');
  listen(v);
  await v.goto(groupUrl);
  await v.getByRole('button', { name: 'Vic' }).click();
  await h.signUp(v, 'Vic', 'vic');
  await v.getByRole('button', { name: 'Join the trip' }).click();
  await v.getByRole('heading', { name: 'Your Itinerary' }).waitFor();

  // 1. A flight, already booked: their own by default, logged while adding, Confirmed at once.
  await o.locator('#day-2027-02-05').getByRole('button', { name: 'Add to morning' }).click();
  await h.dlg(o).getByLabel('What').fill('UA 57 to Geneva');
  await h.dlg(o).getByRole('radio', { name: 'Flight' }).click();
  result.costFoldedAtFirst = (await h.dlg(o).getByRole('button', { name: /^Cost/ }).getAttribute('aria-expanded')) === 'false';
  await h.dlg(o).getByRole('button', { name: /^Cost/ }).click();
  result.flightDefaultsToOwn = (await h.dlg(o).getByRole('radio', { name: 'Everyone pays their own' }).getAttribute('aria-checked')) === 'true';
  await h.dlg(o).getByRole('radio', { name: 'Yes, log it now' }).click();
  await h.dlg(o).getByLabel('What you paid').fill('420');
  await h.dlg(o).getByRole('radio', { name: 'Flight' }).scrollIntoViewIfNeeded();
  await h.shot(o, 'who-pays-add-flight-desktop');
  await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
  await card(o, '2027-02-05', 'UA 57 to Geneva').locator('[title="Confirmed and paid"]').waitFor();
  result.flightCard = (await card(o, '2027-02-05', 'UA 57 to Geneva').innerText()).replace(/\s+/g, ' ');

  // 2. Lift passes: an activity is one bill by default; one tap makes it everyone pays their own.
  await h.addPlan(o, '2027-02-06', 'Add to morning', { title: 'Lift passes', status: 'Planned', est: '80', perPerson: true });
  await card(o, '2027-02-06', 'Lift passes').click();
  result.activityDefaultsToSplit = (await h.dlg(o).getByRole('radio', { name: 'One bill, split' }).getAttribute('aria-checked')) === 'true';
  await h.dlg(o).getByRole('radio', { name: 'Everyone pays their own' }).click();
  await status(o).waitFor();
  result.afterSwitch = await status(o).innerText();
  await h.dlg(o).getByRole('radio', { name: 'One bill, split' }).click();
  await h.dlg(o).getByRole('button', { name: 'Confirm with the real cost' }).waitFor();
  await h.dlg(o).getByRole('radio', { name: 'Everyone pays their own' }).click();
  await status(o).waitFor();
  result.switchedBackAndForth = true;

  // The owner logs their own, then Priya's (she hasn't joined).
  await panel(o).getByRole('button', { name: 'Log my cost' }).click();
  await panel(o).getByLabel('Your own cost').fill('80');
  await panel(o).getByRole('button', { name: 'Mark as booked' }).click();
  await status(o).getByText('1 of 3 booked').waitFor();
  result.switchLockedOnceLogged = (await h.dlg(o).getByRole('radio', { name: 'One bill, split' }).count()) === 0;
  await panel(o).getByRole('button', { name: 'Log for Priya' }).click();
  await panel(o).getByLabel("Priya's own cost").fill('90');
  await panel(o).getByRole('button', { name: 'Mark as booked' }).click();
  await status(o).getByText('Planned, 2 of 3 booked').waitFor();
  result.ownerStatus = await status(o).innerText();
  await h.shot(o, 'who-pays-own-lines-desktop');
  await h.dlg(o).getByRole('button', { name: 'Close' }).click();
  result.ownerCard = (await card(o, '2027-02-06', 'Lift passes').innerText()).replace(/\s+/g, ' ');

  // 3. Vic, a viewer on a phone: sees who has booked but no prices, and logs his own with points.
  await card(v, '2027-02-06', 'Lift passes').getByText('2 of 3 booked').waitFor({ timeout: 15000 });
  await card(v, '2027-02-06', 'Lift passes').click();
  const seen = await panel(v).innerText();
  result.viewerSees = seen.replace(/\s+/g, ' ').slice(0, 160);
  result.viewerSeesOthersPrices = /\$80|\$90/.test(seen);
  result.viewerCanLogForOthers = (await panel(v).getByRole('button', { name: /Log for/ }).count()) > 0;
  await panel(v).getByRole('button', { name: 'Log my cost' }).click();
  await panel(v).getByLabel('Paid with points').check();
  await panel(v).getByLabel('Your own cost').fill('25');
  await h.shot(v, 'who-pays-points-phone');
  await panel(v).getByRole('button', { name: 'Mark as booked' }).click();
  await status(v).getByText('Confirmed: everyone going has booked').waitFor();
  result.viewerOverflow = await h.overflowX(v);
  await h.shot(v, 'who-pays-viewer-phone');
  await h.dlg(v).getByRole('button', { name: 'Close' }).click();
  await card(v, '2027-02-06', 'Lift passes').locator('[title="Confirmed and paid"]').waitFor();
  await v.locator('#day-2027-02-06').scrollIntoViewIfNeeded();
  await h.shot(v, 'who-pays-trip-phone');

  // 4. The owner's screen follows: Confirmed, Vic's price hidden, his own and Priya's readable.
  await card(o, '2027-02-06', 'Lift passes').locator('[title="Confirmed and paid"]').waitFor({ timeout: 15000 });
  await card(o, '2027-02-06', 'Lift passes').click();
  const ownerSees = await panel(o).innerText();
  result.ownerSeesVicsPrice = /\$25|points/.test(ownerSees);
  result.ownerSeesOwnAndPriyas = /\$80/.test(ownerSees) && /\$90/.test(ownerSees);
  await h.shot(o, 'who-pays-confirmed-desktop');
  await h.dlg(o).getByRole('button', { name: 'Close' }).click();

  // 5. A shared dinner is still one bill, logged while adding it. Settle up has only that.
  await o.locator('#day-2027-02-06').getByRole('button', { name: 'Add to evening' }).click();
  await h.dlg(o).getByLabel('What').fill('Fondue at La Caleche');
  await h.dlg(o).getByRole('radio', { name: 'Meal' }).click();
  await h.dlg(o).getByRole('button', { name: /^Cost/ }).click();
  await h.dlg(o).getByRole('radio', { name: 'Yes, log it now' }).click();
  await h.dlg(o).getByLabel('What it cost').fill('120');
  await h.shot(o, 'who-pays-add-bill-desktop');
  await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
  await card(o, '2027-02-06', 'Fondue').locator('[title="Confirmed and paid"]').waitFor();
  const money = o.locator('section[aria-labelledby="money-title"]');
  await money.getByText("You're owed $80").waitFor();
  result.ownerBalance = (await money.locator('p.font-display').first().innerText()).trim();
  result.ownerOwnSpend = (await money.getByTestId('own-spend').innerText()).trim();
  await money.scrollIntoViewIfNeeded();
  await h.shot(o, 'who-pays-money-desktop');
  await money.getByRole('button', { name: 'Settle up' }).click();
  result.settle = (await h.dlg(o).locator('ol li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  await h.shot(o, 'who-pays-settle-desktop');
  await h.dlg(o).getByRole('button', { name: 'Done' }).click();
  result.ownerOverflow = await h.overflowX(o);

  // Vic's money: he owes his $40 share of dinner; his points line shows as his own, not as a debt.
  await v.getByRole('tab', { name: /Money/ }).click();
  const vMoney = v.locator('section[aria-labelledby="money-title"]');
  await vMoney.getByText('You owe $40').waitFor({ timeout: 15000 });
  result.viewerBalance = (await vMoney.locator('p.font-display').first().innerText()).trim();
  result.viewerOwnSpend = (await vMoney.getByTestId('own-spend').innerText()).trim();
  await h.shot(v, 'who-pays-money-phone');

  await o.waitForTimeout(6000); // let PostHog flush
  const names = sent.map((e) => e.event);
  result.posthog = {
    ownCostLogged: names.filter((n) => n === 'own cost logged').length,
    statusChangedToConfirmed: sent.filter((e) => e.event === 'plan status changed' && e.to === 'confirmed').map((e) => e.who_pays),
    planConfirmed: sent.filter((e) => e.event === 'plan confirmed').map((e) => e.who_pays),
    allTaggedTestRun: sent.every((e) => e.test_run === true),
  };
  result.errors = h.errors;
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('FLOW FAILED:', e.message.split('\n').slice(0, 4).join(' | '));
  console.error('errors so far:', h.errors);
  process.exit(1);
});
