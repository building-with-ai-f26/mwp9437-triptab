// Online (GitHub Pages) click-through: hash routes under /mwp9437-triptab/app/. Run against the
// live site (default) or a local mirror: node e2e/online-flow.cjs http://localhost:8088
const { chromium } = require('playwright');
const h = require('./helpers.cjs');
const ROOT = (process.argv[2] || 'https://building-with-ai-f26.github.io') + '/mwp9437-triptab/app/';

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = { root: ROOT };
  const oCtx = await h.context(browser, h.DESKTOP);
  const o = h.watch(await oCtx.newPage(), 'owner');
  await o.goto(ROOT);
  await o.getByRole('button', { name: 'Start a trip' }).click();
  await o.waitForURL(/#\/sign-in/);
  await h.signUp(o, 'Mike', 'owner');
  await o.waitForURL(/#\/trips\/new/);
  await o.getByRole('button', { name: 'Fill in the ski trip example' }).click();
  await o.getByRole('button', { name: 'Start the trip' }).click();
  await o.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  result.tripUrl = o.url();
  await h.addPlan(o, '2027-02-06', 'Add to morning', { title: 'Ski school', status: 'Planned' });

  // A deep link survives a reload (the reason for hash routes on Pages).
  await o.reload();
  await o.locator('#day-2027-02-06').getByText('Ski school').waitFor();
  result.reloadKeepsTrip = true;

  await o.locator('section[aria-labelledby="people-title"]').getByRole('button', { name: 'Add', exact: true }).click();
  await h.dlg(o).getByLabel('Name').fill('Vic');
  await h.dlg(o).getByRole('radio', { name: 'Viewer' }).click();
  await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
  await h.dlg(o).getByText('Added Vic').waitFor();
  await h.dlg(o).getByRole('button', { name: 'Done' }).click();
  const groupUrl = (await o.locator('section[aria-labelledby="link-title"] code').textContent()).trim();
  result.groupUrl = groupUrl;

  // A friend on a phone opens the link cold.
  const v = h.watch(await (await h.context(browser, h.PHONE)).newPage(), 'vic');
  await v.goto(groupUrl);
  await v.getByRole('button', { name: 'Vic' }).click();
  await h.signUp(v, 'Vic', 'vic');
  await v.getByRole('button', { name: 'Join the trip' }).click();
  await v.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await v.locator('#day-2027-02-06').getByText('Ski school').waitFor();
  result.vicJoined = true;
  result.vicOverflow = await h.overflowX(v);
  await h.shot(v, 'online-viewer-phone');

  await o.waitForTimeout(3000);
  result.errors = h.errors;
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('FLOW FAILED:', e.message.split('\n')[0]);
  console.error('errors so far:', h.errors);
  process.exit(1);
});
