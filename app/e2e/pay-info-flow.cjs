// How people pay you (Mike's notes, 11/18), at 1280 and 390 wide. The Owner adds Vic with a Venmo
// guess; Vic joins by the group link and, at his first Settle up, is asked how people pay him back, with the guess filled in;
// a short Zelle number is refused; he saves his own Venmo and Zelle. Then, for the Owner: Vic's row
// in People shows both with a lock and no Change Venmo; Settle up pays Vic with Venmo (the note says
// TripTab, the trip and its dates) or copies his Zelle; and the Owner adds their own from Settle up.
// Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const people = (page) => page.locator('section[aria-labelledby="people-title"]');
const money = (page) => page.locator('section[aria-labelledby="money-title"]');

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const phone = label === 'phone';
  const tab = async (page, name) => phone && (await page.getByRole('tab', { name: new RegExp(name) }).click());

  // ---------- The Owner starts a trip and adds Vic with a guess at his Venmo ----------
  const o = h.watch(await (await h.context(browser, opts)).newPage(), `owner-${label}`);
  await h.startSkiTrip(o, `pay-${label}`);
  await tab(o, 'People');
  await people(o).getByRole('button', { name: 'Add', exact: true }).click();
  let d = h.dlg(o);
  await d.getByLabel('Name').fill('Vic');
  await d.getByLabel('Venmo (optional)').fill('@vic-guess');
  await d.getByRole('radio', { name: 'Viewer' }).click();
  await d.getByRole('button', { name: 'Add to trip' }).click();
  await d.getByText('Added Vic').waitFor();
  await d.getByRole('button', { name: 'Done' }).click();
  const groupUrl = (await o.locator('section[aria-labelledby="link-title"] code').textContent()).trim();
  // A cost Vic paid, so there's something to settle when he gets there.
  await tab(o, 'Money');
  await money(o).getByRole('button', { name: 'Expense' }).click();
  d = h.dlg(o);
  await d.getByLabel('What for').fill('Chalet groceries');
  await d.getByLabel('Amount').fill('90');
  await d.getByLabel('Paid by').selectOption({ label: 'Vic' });
  await d.getByRole('button', { name: 'Add to the tab' }).click();
  // The dialog closes once it's saved; the Money card is a summary now, with no lines (11/19).
  await h.dlg(o).waitFor({ state: 'detached' });

  // ---------- Vic joins and is asked how people pay him back ----------
  const v = h.watch(await (await h.context(browser, opts)).newPage(), `vic-${label}`);
  await v.goto(groupUrl);
  await v.getByRole('button', { name: 'Vic' }).click();
  await h.signUp(v, 'Vic', `pay-vic-${label}`);
  // No pay step on the way in any more (C45, 11/23): he lands on the trip, and his first Settle up asks.
  await v.waitForURL(/\/trips\/[0-9a-f-]{36}$/);
  await v.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await v.evaluate(() => localStorage.removeItem('triptab.pay_asked'));
  await tab(v, 'Money');
  await money(v).getByRole('button', { name: 'Settle up' }).click();
  const ask = h.dlg(v).getByTestId('ask-my-pay');
  await ask.getByRole('heading', { name: 'How should people pay you back?' }).waitFor();
  r.prefilled = await ask.getByLabel('Venmo username').inputValue();
  await ask.getByLabel('Venmo username').fill('@vic-tt');
  await ask.getByLabel('Zelle phone or email').fill('555-12');
  await ask.getByRole('button', { name: 'Save' }).click();
  r.shortZelle = (await ask.getByRole('alert').innerText()).trim();
  await ask.getByLabel('Zelle phone or email').fill('(555) 123-4567');
  r.stepOverflow = await h.overflowX(v);
  await h.shot(v, `join-pay-step-${label}`);
  await ask.getByRole('button', { name: 'Save' }).click();
  await ask.waitFor({ state: 'detached' });
  await h.dlg(v).getByText('Venmo @vic-tt').waitFor();

  // ---------- The Owner: Vic's row is locked to him ----------
  await o.reload();
  await o.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
  await tab(o, 'People');
  const vicRow = people(o).locator('li').filter({ hasText: 'Vic' });
  r.vicLine = (await vicRow.getByTestId('pay-line').innerText()).trim();
  // The lock is a button that says what it means (Mike's 11/19 review: tapping it did nothing).
  const lock = vicRow.getByRole('button', { name: /^Locked: only Vic can change this/ });
  r.vicLocked = (await lock.count()) === 1;
  if (r.vicLocked) {
    await lock.click();
    r.lockWhy = (await vicRow.getByTestId('pay-lock-why').innerText()).trim();
  }
  r.noChangeForVic = (await vicRow.getByRole('button', { name: /Venmo/ }).count()) === 0;
  r.ownButton = (await people(o).getByRole('button', { name: 'Add how people pay you' }).count()) === 1;
  r.peopleOverflow = await h.overflowX(o);
  await h.shot(o, `people-pay-locked-${label}`);

  // ---------- Settle up: pay Vic with Venmo or Zelle ----------
  await tab(o, 'Money');
  await money(o).getByRole('button', { name: 'Settle up' }).click();
  d = h.dlg(o);
  const toVic = d.getByTestId('transfer').filter({ hasText: 'Vic' });
  const link = new URL(await toVic.getByRole('link', { name: 'Pay with Venmo' }).getAttribute('href'));
  r.venmo = { recipients: link.searchParams.get('recipients'), amount: link.searchParams.get('amount'), note: link.searchParams.get('note') };
  r.zelleButton = (await toVic.getByRole('button', { name: /Copy Zelle/ }).innerText()).trim();
  r.noChangeInSettle = (await toVic.getByRole('button', { name: /Vic's Venmo/ }).count()) === 0;

  // The Owner adds their own, from Settle up.
  const mine = d.getByRole('region', { name: 'How people pay you' });
  await mine.getByRole('button', { name: 'Add' }).click();
  await mine.getByLabel('Venmo username').fill('@mike-tt');
  await mine.getByRole('button', { name: 'Save' }).click();
  await mine.getByText('Venmo @mike-tt').waitFor();
  r.settleOverflow = await h.overflowX(o);
  await h.shot(o, `settle-up-zelle-${label}`);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok =
        r.prefilled === '@vic-guess' && /10 digits/.test(r.shortZelle) && r.stepOverflow <= 0 &&
        /Venmo @vic-tt · Zelle \(555\) 123-4567/.test(r.vicLine) && r.vicLocked && r.noChangeForVic && r.ownButton &&
        r.venmo.recipients === 'vic-tt' && r.venmo.amount === '45.00' && /^TripTab · [^·]+$/.test(r.venmo.note) && /only Vic can change it/.test(r.lockWhy ?? '') &&
        r.zelleButton === 'Zelle (555) 123-4567' && r.noChangeInSettle && r.peopleOverflow <= 0 && r.settleOverflow <= 0;
      if (!ok) result.failure = `${label}: a check failed`;
    }
  } catch (e) {
    result.failure = String(e);
  } finally {
    result.errors = h.errors.filter((e) => !e.includes('status of 400'));
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    if (result.failure || result.errors.length) process.exit(1);
  }
})();
