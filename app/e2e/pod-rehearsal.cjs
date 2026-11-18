// A rehearsal of the 11/17 pod test, exactly as the runbook sets it up, against any copy of the
// app (E2E_BASE; the live site by default when run with --live-site). Mike sets up the Euro ski
// trip on a laptop; a Viewer podmate joins from a phone through the group link and does tasks 1 to
// 4; an Owner podmate joins and does task 5. It records what each person sees, not just that the
// clicks worked.
//   E2E_BASE='https://building-with-ai-f26.github.io/mwp9437-triptab/app/#' node e2e/pod-rehearsal.cjs
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const r = { base: h.BASE };

  // ---------- Mike, before class (laptop) ----------
  const o = h.watch(await (await h.context(browser, h.DESKTOP)).newPage(), 'mike');
  await h.startSkiTrip(o, 'pod-mike');
  await h.addPlan(o, '2027-02-06', 'Add to morning', { title: 'Ski school', status: 'Planned', est: '90', perPerson: true });
  await h.addPlan(o, '2027-02-06', 'Add to evening', { title: 'Fondue at La Caleche', kind: 'Meal', status: 'Planned', est: '40', perPerson: true });
  await h.addPlan(o, '2027-02-06', 'Add to night', { title: 'Drinks at Chambre Neuf', status: 'Suggested' });
  await o.locator('section[aria-labelledby="people-title"]').getByRole('button', { name: 'Add', exact: true }).click();
  const d = h.dlg(o);
  await d.getByLabel('Name').fill('Vic');
  await d.getByRole('radio', { name: 'Viewer' }).click();
  await d.getByRole('button', { name: 'Add to trip' }).click();
  await d.getByText('Added Vic').waitFor();
  await d.getByLabel('Name').fill('Olivia');
  await d.getByRole('radio', { name: 'Owner' }).click();
  await d.getByRole('button', { name: 'Add to trip' }).click();
  await d.getByText('Added Vic, Olivia').waitFor();
  await d.getByRole('button', { name: 'Done' }).click();
  const linkSection = o.locator('section[aria-labelledby="link-title"]');
  r.groupLinkInsidePeople = (await o.locator('section[aria-labelledby="people-title"] section[aria-labelledby="link-title"]').count()) === 1;
  r.textItButton = await linkSection.getByText('Text it to the group').count();
  const groupUrl = (await linkSection.locator('code').textContent()).trim();
  await o.locator('#day-2027-02-06').scrollIntoViewIfNeeded();
  await h.shot(o, 'pod-setup-desktop');

  // ---------- Task 1 (Vic, phone): get yourself on the trip ----------
  const v = h.watch(await (await h.context(browser, h.PHONE)).newPage(), 'vic');
  const t0 = Date.now();
  await v.goto(groupUrl);
  r.joinScreenNames = (await v.getByRole('button').allInnerTexts()).filter((t) => ['Mike', 'Vic', 'Olivia'].includes(t.trim()));
  await v.getByRole('button', { name: 'Vic' }).click();
  await h.signUp(v, 'Vic', 'pod-vic');
  await h.joinTrip(v);
  await v.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  r.task1SecondsForAScript = Math.round((Date.now() - t0) / 1000);

  // ---------- Task 2: what's planned for Saturday morning? ----------
  await v.getByRole('button', { name: /Sat\s*2\/6/ }).first().click();
  await v.waitForTimeout(800);
  const sat = v.locator('#day-2027-02-06 .item-card');
  r.task2SaturdayCards = (await sat.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  r.task2Statuses = await sat.evaluateAll((els) => els.map((e) => `${e.textContent.trim().split(/\s{2,}|\n/)[0]}: ${e.getAttribute('data-status')}`));
  await h.shot(v, 'pod-saturday-phone');

  // ---------- Task 3: you're skipping the fondue ----------
  await v.locator('#day-2027-02-06 .item-card').filter({ hasText: 'Fondue' }).click();
  await h.dlg(v).getByRole('radio', { name: "I'm out" }).click();
  await v.waitForTimeout(800);
  await h.dlg(v).getByRole('button', { name: 'Close' }).click().catch(() => v.keyboard.press('Escape'));
  await v.locator('#day-2027-02-06 .item-card[data-out="true"]').filter({ hasText: 'Fondue' }).waitFor();
  r.task3FondueShowsOut = true;

  // ---------- Task 5 (Olivia, Owner podmate, phone): you paid $120 for the fondue ----------
  const ol = h.watch(await (await h.context(browser, h.PHONE)).newPage(), 'olivia');
  await ol.goto(groupUrl);
  await ol.getByRole('button', { name: 'Olivia' }).click();
  await h.signUp(ol, 'Olivia', 'pod-olivia');
  await h.joinTrip(ol);
  await ol.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await ol.locator('#day-2027-02-06 .item-card').filter({ hasText: 'Fondue' }).scrollIntoViewIfNeeded();
  await ol.locator('#day-2027-02-06 .item-card').filter({ hasText: 'Fondue' }).click();
  await h.dlg(ol).getByRole('button', { name: 'Confirm with the real cost' }).click();
  await h.dlg(ol).getByLabel('What it cost').fill('120');
  await h.dlg(ol).getByRole('radio', { name: 'Total' }).click();
  r.task5PaidByDefault = await h.dlg(ol).getByLabel(/Paid by|Who paid/).inputValue().catch(() => 'not found');
  r.task5WhoIsIn = (await h.dlg(ol).locator('fieldset').filter({ hasText: /in/i }).first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
  await h.shot(ol, 'pod-confirm-phone');
  await h.dlg(ol).getByRole('button', { name: 'Confirm and log' }).click();
  await ol.locator('#day-2027-02-06 .item-card').filter({ hasText: 'Fondue' }).locator('[title="Confirmed and paid"]').waitFor();
  r.task5Confirmed = true;
  await ol.getByRole('tab', { name: /Money/ }).click();
  r.task5OliviaMoney = (await ol.locator('section[aria-labelledby="money-title"]').first().innerText()).replace(/\s+/g, ' ').slice(0, 220);

  // ---------- Task 4 (Vic): how much do you owe so far? ----------
  await v.reload();
  await v.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await v.getByRole('tab', { name: /Money/ }).click();
  r.task4VicMoney = (await v.locator('section[aria-labelledby="money-title"]').first().innerText()).replace(/\s+/g, ' ').slice(0, 220);
  await h.shot(v, 'pod-money-phone');

  // Mike's view afterwards.
  await o.reload();
  await o.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  r.mikeMoney = (await o.locator('section[aria-labelledby="money-title"]').first().innerText()).replace(/\s+/g, ' ').slice(0, 220);
  r.mikeSeesJoined = await o.locator('section[aria-labelledby="people-title"]').getByText('Joined').count();
  r.overflow = { vic: await h.overflowX(v), olivia: await h.overflowX(ol), mike: await h.overflowX(o) };
  r.errors = h.errors;
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('REHEARSAL FAILED:', e.message.split('\n').slice(0, 4).join(' | '));
  console.error('errors so far:', h.errors);
  process.exit(1);
});
