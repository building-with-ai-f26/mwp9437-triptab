// Build 4 click-through (no AI pieces): the week view. Run with the dev server up:
//   node e2e/build4-flow.cjs
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};

  const ownerCtx = await h.context(browser, h.DESKTOP);
  const o = h.watch(await ownerCtx.newPage(), 'owner');
  result.tripUrl = await h.startSkiTrip(o);
  await h.addPlan(o, '2027-02-05', "Add where everyone's staying", { title: 'Chamonix Airbnb', checkout: '2027-02-12', status: 'Planned', est: '2400' });
  await h.addPlan(o, '2027-02-06', 'Add to morning', { title: 'Ski school', status: 'Planned', est: '90', perPerson: true });
  await h.addPlan(o, '2027-02-06', 'Add to evening', { title: 'Fondue at La Caleche', kind: 'Meal', est: '40', perPerson: true });
  await h.addPlan(o, '2027-02-08', 'Add to night', { title: 'Apres-ski at Chambre Neuf' });
  await h.addPlan(o, '2027-02-12', 'Add to day', { title: 'Train to Barcelona', kind: 'Transport', status: 'Planned' });

  // Week view: seven days side by side.
  await o.getByRole('radio', { name: 'Week' }).click();
  const week = o.getByRole('region', { name: 'Week view' });
  await week.getByText('Week 1 of 2').waitFor();
  result.week1Plans = await week.locator('.item-card').count();
  await h.shot(o, 'week-view-desktop');

  // Add from an empty cell in the week view.
  await week.getByRole('button', { name: 'Add to morning on Sun 2/7' }).click();
  await h.dlg(o).getByLabel('What').fill('Aiguille du Midi cable car');
  await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
  await week.getByText('Aiguille du Midi cable car').waitFor();

  await week.getByRole('button', { name: 'Next week' }).click();
  await week.getByText('Week 2 of 2').waitFor();
  result.week2HasTrain = await week.getByText('Train to Barcelona').count();

  // Action items: add Vic and Priya, hand out two items.
  await o.getByRole('radio', { name: 'Day by day' }).click();
  await o.locator('section[aria-labelledby="people-title"]').getByRole('button', { name: 'Add', exact: true }).click();
  await h.dlg(o).getByLabel('Name').fill('Vic');
  await h.dlg(o).getByRole('radio', { name: 'Viewer' }).click();
  await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
  await h.dlg(o).getByText('Added Vic').waitFor();
  await h.dlg(o).getByLabel('Name').fill('Priya');
  await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
  await h.dlg(o).getByText('Added Vic, Priya').waitFor();
  await h.dlg(o).getByRole('button', { name: 'Done' }).click();
  const todo = o.locator('section[aria-labelledby="actions-title"]');
  await todo.getByLabel('New action item').fill('Book the Barcelona flight');
  await todo.getByLabel("Who's on it").selectOption({ label: 'Vic' });
  await todo.getByLabel('Due by (optional)').fill('2026-12-01'); // a pre-trip booking: any day from today through the trip's last
  await todo.getByRole('button', { name: 'Add' }).click();
  await todo.getByText('Book the Barcelona flight').waitFor();
  await todo.getByText('by Tue, Dec 1').waitFor();
  await todo.getByLabel('New action item').fill('Thursday night plans');
  await todo.getByLabel("Who's on it").selectOption({ label: 'Priya' });
  await todo.getByRole('button', { name: 'Add' }).click();
  await todo.getByText('Thursday night plans').waitFor();
  await todo.scrollIntoViewIfNeeded();
  await h.shot(o, 'action-items-desktop');
  const groupUrl = (await o.locator('section[aria-labelledby="link-title"] code').textContent()).trim();

  // Vic on a phone: sees his item first, ticks it off, can't tick Priya's.
  const vCtx = await h.context(browser, h.PHONE);
  const v = h.watch(await vCtx.newPage(), 'vic');
  await v.goto(groupUrl);
  await v.getByRole('button', { name: 'Vic' }).click();
  await h.signUp(v, 'Vic', 'vic');
  await h.joinTrip(v);
  await v.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await v.getByRole('tab', { name: 'To do' }).click();
  const vt = v.locator('section[aria-labelledby="actions-title"]');
  result.vicFirstItem = await vt.locator('li').first().innerText();
  result.vicCanTickPriyas = await vt.getByLabel('Mark done: Thursday night plans').isEnabled();
  await vt.getByLabel('Mark done: Book the Barcelona flight').click();
  await vt.getByText('1 done').waitFor();
  result.vicTabsOverflow = await h.overflowX(v);
  await h.shot(v, 'action-items-phone');

  // Add to calendar: the whole trip (your plans) from the header, and one plan from its dialog.
  const fs = require('fs');
  const [tripIcs] = await Promise.all([o.waitForEvent('download'), o.getByRole('button', { name: 'Add your plans to your calendar' }).click()]);
  const tripText = fs.readFileSync(await tripIcs.path(), 'utf8');
  result.tripIcs = { file: tripIcs.suggestedFilename(), events: (tripText.match(/BEGIN:VEVENT/g) || []).length, hasSki: tripText.includes('SUMMARY:Ski school'), hasStay: tripText.includes('SUMMARY:Stay: Chamonix Airbnb') };
  await o.locator('#day-2027-02-06').getByText('Ski school').click();
  const [planIcs] = await Promise.all([o.waitForEvent('download'), h.dlg(o).getByRole('button', { name: 'Add to calendar' }).click()]);
  const planText = fs.readFileSync(await planIcs.path(), 'utf8');
  result.planIcs = { events: (planText.match(/BEGIN:VEVENT/g) || []).length, start: (planText.match(/DTSTART:(\S+)/) || [])[1] };
  await h.dlg(o).getByRole('button', { name: 'Close' }).click();

  // PDF itinerary: the print page, printed to a real PDF.
  await o.getByRole('button', { name: 'PDF itinerary' }).click();
  await o.getByText('TripTab itinerary').waitFor();
  await o.waitForTimeout(500);
  await h.shot(o, 'pdf-itinerary-desktop');
  const pdf = await o.pdf({ format: 'Letter', printBackground: true });
  result.pdf = { bytes: pdf.length, pages: (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length };

  // Phone: the grid scrolls inside its card; the page itself doesn't scroll sideways.
  const pCtx = await h.context(browser, { ...h.PHONE, storageState: await ownerCtx.storageState() });
  const p = h.watch(await pCtx.newPage(), 'owner-phone');
  await p.goto(result.tripUrl);
  await p.getByRole('radio', { name: 'Week' }).click();
  await p.getByRole('region', { name: 'Week view' }).getByText('Week 1 of 2').waitFor();
  await p.waitForTimeout(500);
  result.phoneOverflow = await h.overflowX(p);
  await h.shot(p, 'week-view-phone');

  await o.waitForTimeout(5000);
  result.errors = h.errors;
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('FLOW FAILED:', e.message.split('\n')[0]);
  console.error('errors so far:', h.errors);
  process.exit(1);
});
