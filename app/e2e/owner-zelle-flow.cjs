// An Owner adds someone's Zelle, as with Venmo (C20, Mike's call 11/20). At 1280 and 390 wide,
// against TripTab dev (the migration is on dev). Jordan is added with a Venmo and a Zelle; People
// shows both; Change Venmo or Zelle opens both, refuses a Zelle that's too short, and saves an email.
// (pay-info-flow checks that once someone sets their own, the Owner can't change either.)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const h = require('./helpers.cjs');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `ozelle-${label}`);
  if (label === 'phone') await p.getByRole('tab', { name: /People/ }).click();

  const people = p.locator('section[aria-labelledby="people-title"]');
  await people.getByRole('button', { name: 'Add', exact: true }).click();
  const d = h.dlg(p);
  await d.getByLabel('Name').fill('Jordan');
  await d.getByLabel('Venmo (optional)').fill('@jordan-b');
  await d.getByLabel('Zelle (optional)').fill('(555) 222-3333');
  await d.getByRole('radio', { name: 'Viewer' }).click();
  await h.shot(p, `owner-zelle-add-${label}`);
  await d.getByRole('button', { name: 'Add to trip' }).click();
  await d.getByText('Added Jordan').waitFor();
  await d.getByRole('button', { name: 'Done' }).click();
  await h.dlg(p).waitFor({ state: 'detached' });

  const row = people.locator('li').filter({ hasText: 'Jordan' }).first();
  await row.getByTestId('pay-line').waitFor();
  r.added = (await row.getByTestId('pay-line').innerText()).trim();

  await row.getByRole('button', { name: 'Change Venmo or Zelle' }).click();
  const e = h.dlg(p);
  await e.getByRole('heading', { name: "Jordan's Venmo and Zelle" }).waitFor();
  r.zelleShown = await e.getByLabel("Jordan's Zelle phone or email").inputValue();
  await e.getByLabel("Jordan's Zelle phone or email").fill('555-12');
  await e.getByRole('button', { name: 'Save' }).click();
  r.tooShort = (await e.getByRole('alert').innerText()).trim();
  await e.getByLabel("Jordan's Zelle phone or email").fill('jordan@example.com');
  await h.shot(p, `owner-zelle-change-${label}`);
  await e.getByRole('button', { name: 'Save' }).click();
  await e.waitFor({ state: 'detached' });
  await row.getByText('Zelle jordan@example.com').waitFor();
  r.changed = (await row.getByTestId('pay-line').innerText()).trim();
  r.overflow = await h.overflowX(p);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok =
        r.added === 'Venmo @jordan-b · Zelle (555) 222-3333' && r.zelleShown === '(555) 222-3333' && /10 digits/.test(r.tooShort) &&
        r.changed === 'Venmo @jordan-b · Zelle jordan@example.com' && r.overflow <= 0;
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
