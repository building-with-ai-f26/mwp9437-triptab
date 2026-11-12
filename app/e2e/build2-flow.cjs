// Run with the dev server up (npm run dev): node e2e/build2-flow.cjs
// Needs Playwright (preinstalled in the cloud session; on a laptop: npm i -D playwright && npx playwright install chromium).
// Build 2 click-through: owner creates the ski trip, adds plans, a stay and people; a viewer
// claims a name through the group link on a phone; a third person adds themselves.
const { chromium, devices } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', '..', 'docs', 'screenshots');
const BASE = 'http://localhost:5173';
const run = Math.random().toString(36).slice(2, 7);
const PW = `demo-${run}-Passw0rd`;
const errors = [];

function watch(page, who) {
  (global.__pages ||= []).push(page);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${who}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${who}: ${e}`));
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 80 });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent };
async function overflow(page) { return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); }

async function signUp(page, name, who) {
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(`demo-${run}-${who}@example.com`);
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Create account' }).click();
}

async function addPlan(page, day, slot, f) {
  await page.locator(`#day-${day}`).getByRole('button', { name: slot }).click();
  const d = page.locator('dialog[open]');
  await d.getByLabel('What').fill(f.title);
  if (f.kind) await d.getByRole('radio', { name: f.kind }).click();
  if (f.checkout) await d.getByLabel('Check out').selectOption(f.checkout);
  if (f.status) await d.getByRole('radio', { name: f.status }).click();
  if (f.est) await d.getByLabel(/Estimated/).fill(f.est);
  if (f.perPerson) await d.getByRole('radio', { name: 'Per person' }).click();
  if (f.where) await d.getByLabel('Where (optional)').fill(f.where);
  if (f.shot) await shot(page, f.shot);
  await d.getByRole('button', { name: 'Add to trip' }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' }).catch(() => {});
  await page.locator(`#day-${day}`).getByText(f.title).first().waitFor();
}

(async () => {
  const browser = await chromium.launch();
  const result = {};

  // ---------- Owner, desktop ----------
  const ownerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const o = await ownerCtx.newPage();
  watch(o, 'owner');
  await o.goto(`${BASE}/`);
  await o.getByRole('button', { name: 'Start a trip' }).click();
  await o.waitForURL(/sign-in/);
  await signUp(o, 'Mike', 'owner');
  await o.waitForURL(/\/trips\/new/);
  await o.getByRole('button', { name: 'Fill in the ski trip example' }).click();
  await o.waitForTimeout(500);
  await shot(o, 'new-trip-desktop');
  await o.getByRole('button', { name: 'Start the trip' }).click();
  await o.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  await o.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await o.waitForTimeout(800);
  await shot(o, 'trip-blank-desktop');
  result.tripUrl = o.url();

  await addPlan(o, '2027-02-05', "Add where everyone's staying", {
    title: 'Chamonix Airbnb', checkout: '2027-02-12', status: 'Planned', est: '2400', where: 'Chemin des Moussoux',
  });
  await addPlan(o, '2027-02-06', 'Add to morning', {
    title: 'Ski school', status: 'Planned', est: '90', perPerson: true, where: 'ESF Chamonix', shot: 'plan-dialog-desktop',
  });
  await addPlan(o, '2027-02-06', 'Add to evening', { title: 'Fondue at La Caleche', kind: 'Meal', est: '40', perPerson: true });
  await addPlan(o, '2027-02-06', 'Add to night', { title: 'Drinks at Chambre Neuf', kind: 'Activity' });
  await addPlan(o, '2027-02-05', 'Add to day', { title: 'Train from Geneva', kind: 'Transport', status: 'Planned', est: '35', perPerson: true });

  // People: add Vic as a viewer and Priya as an owner, directly.
  await o.getByRole('button', { name: 'Add', exact: true }).click();
  let d = o.locator('dialog[open]');
  await d.getByLabel('Name').fill('Vic');
  await d.getByLabel('Email (optional)').fill(`vic-${run}@example.com`);
  await d.getByRole('radio', { name: 'Viewer' }).click();
  await shot(o, 'add-person-desktop');
  await d.getByRole('button', { name: 'Add to trip' }).click();
  await d.getByText('Added Vic').waitFor();
  await d.getByLabel('Name').fill('Priya');
  await d.getByLabel('Phone (optional)').fill('+1 555 555 0123');
  await d.getByRole('radio', { name: 'Owner' }).click();
  await d.getByRole('button', { name: 'Add to trip' }).click();
  await d.getByText('Added Vic, Priya').waitFor();
  await d.getByRole('button', { name: 'Done' }).click();
  await o.getByText('Not joined yet').first().waitFor();
  await o.locator('#day-2027-02-06').scrollIntoViewIfNeeded();
  await o.waitForTimeout(600);
  await shot(o, 'trip-plans-desktop');
  const groupUrl = (await o.locator('section[aria-labelledby="link-title"] code').textContent()).trim();
  result.groupUrl = groupUrl;

  // Phone screenshots of the owner's trip, same account.
  const state = await ownerCtx.storageState();
  const phoneCtx = await browser.newContext({ ...PHONE, storageState: state });
  const op = await phoneCtx.newPage();
  watch(op, 'owner-phone');
  await op.goto(result.tripUrl);
  await op.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await op.waitForTimeout(800);
  result.ownerPhoneOverflow = await overflow(op);
  await shot(op, 'trip-blank-phone');
  await op.locator('#day-2027-02-06').scrollIntoViewIfNeeded();
  await op.waitForTimeout(500);
  await shot(op, 'trip-plans-phone');
  await op.locator('#day-2027-02-06').getByText('Ski school').click();
  await op.locator('dialog[open]').waitFor();
  await op.waitForTimeout(400);
  await shot(op, 'plan-dialog-phone');
  await op.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click();
  await op.getByRole('tab', { name: /People/ }).click();
  await op.waitForTimeout(500);
  await shot(op, 'people-phone');

  // ---------- Vic, on a phone: claims the name the owner added ----------
  const vicCtx = await browser.newContext({ ...PHONE });
  const v = await vicCtx.newPage();
  watch(v, 'vic');
  await v.goto(groupUrl);
  await v.getByText('Who are you?').waitFor();
  await v.waitForTimeout(500);
  await shot(v, 'join-pick-phone');
  await v.getByRole('button', { name: 'Vic' }).click();
  await signUp(v, 'Vic', 'vic');
  await v.getByRole('button', { name: 'Join the trip' }).waitFor();
  await shot(v, 'join-confirm-phone');
  await v.getByRole('button', { name: 'Join the trip' }).click();
  await v.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  await v.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await v.waitForTimeout(800);
  result.vicCanAdd = await v.getByRole('button', { name: 'Add a plan' }).count();
  result.vicEmptySlots = await v.getByRole('button', { name: /^Add to / }).count();
  result.vicPhoneOverflow = await overflow(v);
  await v.locator('#day-2027-02-06').scrollIntoViewIfNeeded();
  await v.waitForTimeout(500);
  await shot(v, 'viewer-trip-phone');
  await v.getByRole('tab', { name: /People/ }).click();
  result.vicSeesGroupLink = await v.getByText('Group link').count();
  await shot(v, 'viewer-people-phone');

  // ---------- Jules, desktop: adds their own name through the link ----------
  const julesCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const j = await julesCtx.newPage();
  watch(j, 'jules');
  await j.goto(groupUrl);
  await j.getByText('Who are you?').waitFor();
  await j.waitForTimeout(500);
  await shot(j, 'join-pick-desktop');
  await j.getByRole('button', { name: "Don't see your name?" }).click();
  await j.getByLabel('Your name').first().fill('Jules');
  await j.getByRole('button', { name: 'Next' }).click();
  await signUp(j, 'Jules', 'jules');
  await j.getByRole('button', { name: 'Join the trip' }).click();
  await j.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  await j.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  result.julesCanAdd = await j.getByRole('button', { name: 'Add a plan' }).count();

  // ---------- Owner sees both joined ----------
  await o.reload();
  await o.getByRole('heading', { name: 'People' }).waitFor();
  await o.waitForTimeout(800);
  const people = await o.locator('section[aria-labelledby="people-title"] li').allInnerTexts();
  result.people = people.map((t) => t.replace(/\s+/g, ' ').trim());
  await shot(o, 'people-joined-desktop');

  // My trips list
  await o.goto(`${BASE}/trips`);
  await o.getByText('Euro ski trip').waitFor();
  await o.waitForTimeout(800);
  await shot(o, 'my-trips-desktop');

  result.errors = errors;
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch(async (e) => {
  try { for (const pg of global.__pages || []) await pg.screenshot({ path: path.join(OUT, `..`, `..`, `app`, `e2e`, `fail-${global.__pages.indexOf(pg)}.png`) }); } catch {}
  console.error('FLOW FAILED:', e.message);
  console.error('errors so far:', errors);
  process.exit(1);
});
