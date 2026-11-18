// Venmo names an Owner adds (Mike's 11/18 ask, from the pod test trip: "I should be able to add
// Jordan's Venmo"), at 1280 and 390 wide. Jordan is added with his Venmo; Sam without one. Jordan
// paid $90 and Sam $60, split three ways, so Settle up has You -> Jordan $40 (Pay with Venmo at
// once) and You -> Sam $10 (Add Sam's Venmo, then Pay with Venmo). Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const money = (page) => page.locator('section[aria-labelledby="money-title"]');

async function addPerson(page, name, venmo, phone) {
  if (phone) await page.getByRole('tab', { name: /People/ }).click();
  await page.locator('section[aria-labelledby="people-title"]').getByRole('button', { name: 'Add', exact: true }).click();
  const d = h.dlg(page);
  await d.getByLabel('Name').fill(name);
  if (venmo) await d.getByLabel('Venmo (optional)').fill(venmo);
  await d.getByRole('radio', { name: 'Viewer' }).click();
  await d.getByRole('button', { name: 'Add to trip' }).click();
  await d.getByText(`Added ${name}`).waitFor();
  await d.getByRole('button', { name: 'Done' }).click();
}

async function addExpense(page, what, amount, paidBy) {
  await money(page).getByRole('button', { name: 'Expense' }).click();
  const d = h.dlg(page);
  await d.getByLabel('What for').fill(what);
  await d.getByLabel('Amount').fill(amount);
  await d.getByLabel('Paid by').selectOption({ label: paidBy });
  await d.getByRole('button', { name: 'Add to the tab' }).click();
  await money(page).getByText(what).waitFor();
}

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const phone = label === 'phone';
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await h.startSkiTrip(p, `venmo-${label}`);
  await addPerson(p, 'Jordan', '@jordan-tt', phone);
  await addPerson(p, 'Sam', '', false);
  if (phone) await p.getByRole('tab', { name: /Money/ }).click();
  await addExpense(p, 'Chalet groceries', '90', 'Jordan');
  await addExpense(p, 'Lift tickets', '60', 'Sam');

  await money(p).getByRole('button', { name: 'Settle up' }).click();
  const d = h.dlg(p);
  const toJordan = d.getByTestId('transfer').filter({ hasText: 'Jordan' });
  const toSam = d.getByTestId('transfer').filter({ hasText: 'Sam' });
  r.lines = (await d.getByTestId('transfer').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  const jordanLink = new URL(await toJordan.getByRole('link', { name: 'Pay with Venmo' }).getAttribute('href'));
  r.jordan = { recipients: jordanLink.searchParams.get('recipients'), amount: jordanLink.searchParams.get('amount') };
  r.samHasNoVenmoAtFirst = (await toSam.getByRole('link', { name: 'Pay with Venmo' }).count()) === 0;
  await toSam.getByRole('button', { name: "Add Sam's Venmo" }).click();
  await toSam.getByLabel("Sam's Venmo username").fill('no');
  await toSam.getByRole('button', { name: 'Save' }).click();
  r.shortRefused = (await toSam.getByRole('alert').innerText()).trim();
  await toSam.getByLabel("Sam's Venmo username").fill('@sam-tt');
  await toSam.getByRole('button', { name: 'Save' }).click();
  await toSam.getByRole('link', { name: 'Pay with Venmo' }).waitFor();
  const samLink = new URL(await toSam.getByRole('link', { name: 'Pay with Venmo' }).getAttribute('href'));
  r.sam = { recipients: samLink.searchParams.get('recipients'), amount: samLink.searchParams.get('amount') };
  r.overflow = await h.overflowX(p);
  await h.shot(p, `settle-up-venmo-added-${label}`);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const ok =
        r.lines.some((t) => /You.*Jordan.*\$40/.test(t)) && r.lines.some((t) => /You.*Sam.*\$10/.test(t)) &&
        r.jordan.recipients === 'jordan-tt' && r.jordan.amount === '40.00' && r.samHasNoVenmoAtFirst &&
        /5 to 30/.test(r.shortRefused) && r.sam.recipients === 'sam-tt' && r.sam.amount === '10.00' && r.overflow <= 0;
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
