// Build 3 click-through: confirm a plan with its cost, a general expense split by shares, a
// flight, settle up, and a viewer's own view (their share, opting out). Run with the dev server
// up (npm run dev): node e2e/build3-flow.cjs. Events are tagged test_run in PostHog.
const path = require('path');
const { joinTrip, withEmail, openCost } = require('./helpers.cjs');
const { chromium, devices } = require('playwright');
const OUT = (process.env.E2E_SHOTS || path.join(__dirname, '..', '..', 'docs', 'screenshots'));
const BASE = 'http://localhost:5173';
const run = Math.random().toString(36).slice(2, 7);
const PW = `demo-${run}-Passw0rd`;
const errors = [];
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent };

async function prep(ctx) {
  await ctx.addInitScript(() => {
    try { localStorage.setItem('triptab.test_run', '1'); } catch {}
    try { localStorage.setItem('triptab.tour_seen', '1'); } catch {}
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'userAgentData', { get: () => ({ brands: [{ brand: 'Google Chrome', version: '131' }], mobile: false, platform: 'Windows' }) });
  });
  return ctx;
}
const watch = (page, who) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${who}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${who}: ${e}`));
  // A server error names its address (without the query, which can hold a token).
  page.on('response', (r) => { if (r.status() >= 500) errors.push(`${who}: ${r.status()} from ${r.url().split('?')[0]}`); });
};
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 80 });
const dlg = (page) => page.locator('dialog[open]');

async function signUp(page, name, who) {
  await withEmail(page);
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(`demo-${run}-${who}@example.com`);
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Create account' }).click();
}

async function addPlan(page, day, slot, f) {
  await page.locator(`#day-${day}`).getByRole('button', { name: slot }).click();
  const d = dlg(page);
  await d.getByLabel('What').fill(f.title);
  if (f.kind) await d.getByRole('radio', { name: f.kind }).click();
  if (f.status) await d.getByRole('radio', { name: f.status }).click();
  if (f.est || f.perPerson) await d.getByRole('button', { name: /^Cost/ }).click();
  if (f.est) await d.getByLabel(/Estimated/).fill(f.est);
  if (f.perPerson) await d.getByRole('radio', { name: 'Per person' }).click();
  await d.getByRole('button', { name: 'Add to trip' }).click();
  await page.locator(`#day-${day}`).getByText(f.title).first().waitFor();
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};

  // ---------- Owner, desktop ----------
  const ownerCtx = await prep(await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: DESKTOP_UA }));
  const o = await ownerCtx.newPage();
  watch(o, 'owner');
  await o.goto(`${BASE}/sign-in?next=/trips/new`);
  await signUp(o, 'Mike', 'owner');
  await o.waitForURL(/\/trips\/new/);
  await o.getByRole('button', { name: 'Fill in the ski trip example' }).click();
  await o.getByRole('button', { name: 'Start the trip' }).click();
  await o.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  result.tripUrl = o.url();

  // People: Vic (viewer) and Priya (owner), added directly.
  await o.locator('section[aria-labelledby="people-title"]').getByRole('button', { name: 'Add', exact: true }).click();
  await dlg(o).getByLabel('Name').fill('Vic');
  await dlg(o).getByRole('radio', { name: 'Viewer' }).click();
  await dlg(o).getByRole('button', { name: 'Add to trip' }).click();
  await dlg(o).getByText('Added Vic').waitFor();
  await dlg(o).getByLabel('Name').fill('Priya');
  await dlg(o).getByRole('radio', { name: 'Owner' }).click();
  await dlg(o).getByRole('button', { name: 'Add to trip' }).click();
  await dlg(o).getByText('Added Vic, Priya').waitFor();
  await dlg(o).getByRole('button', { name: 'Done' }).click();

  // Plans: fondue (planned), ski school (suggested), a flight.
  await addPlan(o, '2027-02-06', 'Add to evening', { title: 'Fondue at La Caleche', kind: 'Meal', status: 'Planned', est: '40', perPerson: true });
  await addPlan(o, '2027-02-06', 'Add to morning', { title: 'Ski school', est: '90', perPerson: true });
  await addPlan(o, '2027-02-05', 'Add to morning', { title: 'Flight JFK to Geneva', kind: 'Flight', status: 'Planned' });

  // Confirm the fondue: $120 total, Mike paid, everyone in, even.
  await o.locator('#day-2027-02-06').getByText('Fondue at La Caleche').click();
  await openCost(dlg(o));
  await dlg(o).getByRole('button', { name: 'Confirm with the real cost' }).click();
  const c = dlg(o);
  await c.getByLabel('What it cost').fill('120');
  await c.getByRole('radio', { name: 'Total' }).click();
  await c.getByText('Logs $120, paid by Mike, split 3 ways').waitFor();
  await shot(o, 'confirm-dialog-desktop');
  await c.getByRole('button', { name: 'Confirm and log' }).click();
  await o.locator('#day-2027-02-06').getByText('Your share $40').waitFor();
  result.fondueCard = (await o.locator('#day-2027-02-06 .item-card[data-status="confirmed"]').innerText()).replace(/\s+/g, ' ');

  // General expense: groceries $84, Priya paid, by shares 2:1:1.
  await o.getByRole('button', { name: 'Expense' }).click();
  const g = dlg(o);
  await g.getByLabel('What for').fill('Groceries for the chalet');
  await g.getByLabel('Amount').fill('84');
  await g.getByLabel('Paid by').selectOption({ label: 'Priya' });
  await g.getByRole('radio', { name: 'By shares' }).click();
  await g.getByLabel("Mike's shares").fill('2');
  await g.getByText('Logs $84, paid by Priya, split 3 ways').waitFor();
  await shot(o, 'expense-shares-desktop');
  await g.getByRole('button', { name: 'Add to the tab' }).click();
  await dlg(o).waitFor({ state: 'detached' });
  await o.waitForTimeout(600);
  result.ownerBalance = await o.locator('section[aria-labelledby="money-title"] .font-display.text-2xl').innerText();
  // Every cost and payment, plans included, takes the main column on desktop (Mike's 11/19 review).
  await o.locator('section[aria-labelledby="money-title"]').getByRole('button', { name: /Every cost and payment \(2\)/ }).click();
  const ownerLines = o.locator('section[aria-labelledby="money-lines-title"]');
  await ownerLines.getByText('Groceries for the chalet').waitFor();
  result.ownerLines = (await ownerLines.locator('[data-testid="money-lines"] > li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  if (!/Fondue at La Caleche.*You paid.*\$120.*you lent \$80/.test(result.ownerLines[0] ?? '')) throw new Error(`the fondue line: ${result.ownerLines[0]}`);
  if (!/Groceries for the chalet.*Priya paid.*\$84.*you borrowed \$42/.test(result.ownerLines[1] ?? '')) throw new Error(`the groceries line: ${result.ownerLines[1]}`);
  await ownerLines.getByRole('button', { name: /^Plans/ }).click();
  result.ownerOtherOnly = (await ownerLines.locator('[data-testid="money-lines"] > li').allInnerTexts()).length;
  if (result.ownerOtherOnly !== 1) throw new Error(`Plans filtered out should leave 1 line, left ${result.ownerOtherOnly}`);
  await ownerLines.getByRole('button', { name: /^Plans/ }).click();
  await shot(o, 'money-list-desktop');
  await ownerLines.getByText('Fondue at La Caleche').click();
  await dlg(o).getByRole('heading', { name: 'Edit plan' }).waitFor();
  result.openedFromList = await dlg(o).getByLabel('What').inputValue();
  if (result.openedFromList !== 'Fondue at La Caleche') throw new Error(`the list opened ${result.openedFromList}`);
  await dlg(o).getByRole('button', { name: 'Close' }).click();
  await o.getByRole('button', { name: 'Back to the itinerary' }).first().click();
  await o.locator('#day-2027-02-06').scrollIntoViewIfNeeded();
  await o.waitForTimeout(500);
  await shot(o, 'trip-money-desktop');

  await o.getByRole('button', { name: 'Settle up' }).click();
  await dlg(o).getByText('fewest payments').waitFor();
  result.transfers = (await dlg(o).locator('ol li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  await shot(o, 'settle-up-desktop');
  await dlg(o).getByRole('button', { name: 'Done' }).click();
  const groupUrl = (await o.locator('section[aria-labelledby="link-title"] code').textContent()).trim();

  // ---------- Vic, phone: claims his name, sees his share, opts out ----------
  const vicCtx = await prep(await browser.newContext({ ...PHONE }));
  const v = await vicCtx.newPage();
  watch(v, 'vic');
  await v.goto(groupUrl);
  await v.getByRole('button', { name: 'Vic' }).click();
  await signUp(v, 'Vic', 'vic');
  await joinTrip(v);
  await v.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await v.locator('#day-2027-02-06').getByText('Ski school').click();
  await dlg(v).getByRole('radio', { name: "I'm out" }).click();
  await v.locator(`#day-2027-02-06 .item-card[data-out="true"]`).waitFor();
  await dlg(v).getByRole('button', { name: 'Close' }).click();
  await v.locator('#day-2027-02-06').scrollIntoViewIfNeeded();
  await v.waitForTimeout(500);
  await shot(v, 'viewer-opted-out-phone');
  result.vicFondue = (await v.locator('#day-2027-02-06 .item-card[data-status="confirmed"]').innerText()).replace(/\s+/g, ' ');
  await v.getByRole('tab', { name: 'Money' }).click();
  await v.waitForTimeout(500);
  result.vicBalance = await v.locator('section[aria-labelledby="money-title"] .font-display.text-2xl').innerText();
  result.vicCanAddExpense = await v.getByRole('button', { name: 'Expense' }).count();
  result.vicOverflow = await v.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await shot(v, 'viewer-money-phone');
  // On a phone the list sits under the summary, in the Money tab.
  const vicLines = v.locator('section[aria-labelledby="money-lines-title"]');
  result.vicLines = (await vicLines.locator('[data-testid="money-lines"] > li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  if (!/Fondue at La Caleche.*you borrowed \$40/.test(result.vicLines[0] ?? '')) throw new Error(`Vic's fondue line: ${result.vicLines[0]}`);
  if (!/Groceries for the chalet.*you borrowed \$21/.test(result.vicLines[1] ?? '')) throw new Error(`Vic's groceries line: ${result.vicLines[1]}`);
  await vicLines.scrollIntoViewIfNeeded();
  await shot(v, 'viewer-money-list-phone');
  // Travel and lodging sits atop the itinerary on a phone.
  await v.getByRole('tab', { name: 'Itinerary' }).click();
  await v.locator('section[aria-labelledby="travel-title"]').getByRole('button', { name: "See everyone's" }).click();
  await dlg(v).getByText(/Flight JFK to Geneva/).waitFor();
  await shot(v, 'everyones-travel-phone');

  // Owner on a phone: the confirm dialog.
  const opCtx = await prep(await browser.newContext({ ...PHONE, storageState: await ownerCtx.storageState() }));
  const op = await opCtx.newPage();
  watch(op, 'owner-phone');
  await op.goto(result.tripUrl);
  await op.locator('#day-2027-02-06').getByText('Ski school').click();
  await openCost(dlg(op));
  await dlg(op).getByRole('button', { name: 'Confirm with the real cost' }).click();
  await dlg(op).getByLabel('What it cost').fill('90');
  await op.waitForTimeout(400);
  result.ownerPhoneOverflow = await op.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await shot(op, 'confirm-dialog-phone');

  await o.waitForTimeout(6000);
  result.errors = errors;
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch(async (e) => {
  console.error('FLOW FAILED:', e.message.split('\n')[0]);
  console.error('errors so far:', errors);
  process.exit(1);
});
