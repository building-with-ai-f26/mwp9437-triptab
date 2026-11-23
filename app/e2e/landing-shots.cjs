// Shoots the three screens the landing page shows (app/public/landing/*.jpg) from the ski trip
// example at phone width: a day of plans, Settle up and the invite a friend opens. Made-up people
// and prices, the app's own example; nothing here is a real user's trip. Run with `npm run dev`
// going, on purpose, when those screens change: node e2e/landing-shots.cjs
const path = require('path');
const { chromium } = require('playwright');
const h = require('./helpers.cjs');
const OUT = path.join(__dirname, '..', 'public', 'landing');
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 72, clip: { x: 0, y: 0, width: 390, height: 700 } });
const people = (page) => page.locator('section[aria-labelledby="people-title"]');
const money = (page) => page.locator('section[aria-labelledby="money-title"]');

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  try {
    const ctx = await h.context(browser, h.PHONE);
    // Nothing that belongs to a first visit: no email reminder in these shots.
    await ctx.addInitScript(() => { try { sessionStorage.setItem('triptab.confirm_banner_hidden', '1'); } catch {} });
    const p = h.watch(await ctx.newPage(), 'owner');
    await h.startSkiTrip(p, 'landing');
    await p.getByRole('tab', { name: /People/ }).click();
    await people(p).getByRole('button', { name: 'Add', exact: true }).click();
    for (const [i, name] of ['Julia', 'Vic', 'Sam'].entries()) {
      await h.dlg(p).getByLabel('Name').fill(name);
      if (name === 'Julia') await h.dlg(p).getByLabel('Venmo (optional)').fill('@julia-b');
      await h.dlg(p).getByRole('button', { name: 'Add to trip' }).click();
      await h.dlg(p).getByText(`Added ${['Julia', 'Vic', 'Sam'].slice(0, i + 1).join(', ')}`).waitFor();
    }
    await h.dlg(p).getByRole('button', { name: 'Done' }).click();
    const link = (await p.locator('section[aria-labelledby="link-title"] code').textContent()).trim();
    await p.getByRole('tab', { name: 'Itinerary' }).click();
    await h.addPlan(p, '2027-02-06', 'Add to morning', { title: 'Ski school at Les Houches', status: 'Planned', est: '90', perPerson: true });
    await h.addPlan(p, '2027-02-06', 'Add to day', { title: 'Aiguille du Midi cable car', est: '75', perPerson: true });
    await h.addPlan(p, '2027-02-06', 'Add to evening', { title: 'Fondue at La Caleche', kind: 'Meal', status: 'Planned', est: '380' });
    const day = p.locator('#day-2027-02-06');
    await day.getByText('Fondue at La Caleche').click();
    await h.openCost(h.dlg(p));
    await h.dlg(p).getByRole('button', { name: 'Confirm with the real cost' }).click();
    await h.dlg(p).getByLabel('What it cost').fill('380');
    await h.dlg(p).getByLabel('Paid by').selectOption({ label: 'Julia' });
    await h.dlg(p).getByRole('button', { name: 'Confirm and log' }).click();
    await day.getByText(/Your share/).waitFor();
    await day.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 136));
    await p.waitForTimeout(600);
    await shot(p, 'plans');

    await p.getByRole('tab', { name: 'Money' }).click();
    await money(p).getByRole('button', { name: 'Settle up' }).click();
    await h.dlg(p).getByText('The fewest payments').waitFor();
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${OUT}/settle.jpg`, type: 'jpeg', quality: 72, clip: { x: 0, y: 144, width: 390, height: 700 } });

    const f = h.watch(await (await h.context(browser, h.PHONE)).newPage(), 'friend');
    await f.goto(link);
    await f.getByText('Who are you?').waitFor();
    await f.waitForTimeout(800);
    await shot(f, 'invite');
    console.log('Shot plans.jpg, settle.jpg and invite.jpg into app/public/landing/');
  } catch (e) {
    console.error(String(e));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
