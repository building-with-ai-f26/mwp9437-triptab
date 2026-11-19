// Recording payments (Build 3, the 11/17 pod feedback): an owner at 1280 wide and a viewer on a
// 390 phone. Mike puts down the $200 Airbnb deposit, split with Vic; Mike adds his Venmo under How people pay you; Vic's
// Settle up shows "Pay with Venmo" with $100 filled in and "Record it"; Vic records it as cash and
// everyone's even at once; Mike sees "Vic paid you" and can remove it, which puts the $100 back.
// Run with `npm run dev` going.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const money = (page) => page.locator('section[aria-labelledby="money-title"]');
const lines = (page) => page.locator('section[aria-labelledby="money-lines-title"]');
const balance = async (page) => (await money(page).locator('.font-display.text-2xl').innerText()).trim();

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    const o = h.watch(await (await h.context(browser, h.DESKTOP)).newPage(), 'owner');
    await h.startSkiTrip(o, 'pay-owner');

    await o.locator('section[aria-labelledby="people-title"]').getByRole('button', { name: 'Add', exact: true }).click();
    await h.dlg(o).getByLabel('Name').fill('Vic');
    await h.dlg(o).getByRole('radio', { name: 'Viewer' }).click();
    await h.dlg(o).getByRole('button', { name: 'Add to trip' }).click();
    await h.dlg(o).getByText('Added Vic').waitFor();
    await h.dlg(o).getByRole('button', { name: 'Done' }).click();
    const groupUrl = (await o.locator('section[aria-labelledby="link-title"] code').textContent()).trim();

    // The deposit: $200, Mike paid, split evenly between the two of them.
    await o.getByRole('button', { name: 'Expense' }).click();
    await h.dlg(o).getByLabel('What for').fill('Airbnb deposit');
    await h.dlg(o).getByLabel('Amount').fill('200');
    await h.dlg(o).getByRole('button', { name: 'Add to the tab' }).click();
    await h.dlg(o).waitFor({ state: 'detached' });
    // Desktop: the whole list opens in the main column; it stays open for the payment below.
    await money(o).getByRole('button', { name: /Every cost and payment/ }).click();
    await lines(o).getByText('Airbnb deposit').waitFor();

    // Mike adds his Venmo in Settle up.
    await money(o).getByRole('button', { name: 'Settle up' }).click();
    const mine = h.dlg(o).getByRole('region', { name: 'How people pay you' });
    await mine.getByRole('button', { name: 'Add' }).click();
    await mine.getByLabel('Venmo username').fill('@mike-p-tt');
    await mine.getByRole('button', { name: 'Save' }).click();
    await mine.getByText('Venmo @mike-p-tt').waitFor();
    await h.dlg(o).getByRole('button', { name: 'Done' }).click();

    // Vic joins on a phone and settles up.
    const v = h.watch(await (await h.context(browser, h.PHONE)).newPage(), 'vic');
    await v.goto(groupUrl);
    await v.getByRole('button', { name: 'Vic' }).click();
    await h.signUp(v, 'Vic', 'pay-vic');
    await h.joinTrip(v);
    await v.getByRole('heading', { name: 'Your Itinerary' }).waitFor();
    await v.getByRole('tab', { name: /Money/ }).click();
    result.vicBefore = await balance(v);
    await money(v).getByRole('button', { name: 'Settle up' }).click();
    const row = h.dlg(v).getByTestId('transfer').first();
    result.transfer = (await row.innerText()).replace(/\s+/g, ' ');
    const venmo = row.getByRole('link', { name: 'Pay with Venmo' });
    const href = new URL(await venmo.getAttribute('href'));
    result.venmoLink = { host: href.host, recipients: href.searchParams.get('recipients'), amount: href.searchParams.get('amount'), note: href.searchParams.get('note') };
    // Venmo shows a + as it is, so spaces go as %20 (Mike's 11/19 review).
    result.venmoNoPlus = !href.search.includes('+');
    result.opensElsewhere = (await venmo.getAttribute('target')) === '_blank';
    result.settleOverflow = await h.overflowX(v);
    await h.shot(v, 'settle-up-pay-phone');

    await row.getByRole('button', { name: 'Record it' }).click();
    await h.dlg(v).getByRole('heading', { name: 'Record a payment' }).waitFor();
    result.prefilled = await h.dlg(v).getByLabel('Amount').inputValue();
    await h.dlg(v).getByRole('radio', { name: 'Cash' }).click();
    await h.shot(v, 'record-payment-phone');
    await h.dlg(v).getByRole('button', { name: 'Record payment' }).click();
    await h.dlg(v).getByText("Everyone's even.").waitFor();
    await h.dlg(v).getByRole('button', { name: 'Done' }).click();
    result.vicAfter = await balance(v);
    result.vicSees = (await lines(v).getByTestId('payment').first().innerText()).replace(/\s+/g, ' ');

    // Mike sees it at once (live updates), then removes it.
    await lines(o).getByTestId('payment').first().waitFor();
    result.ownerSees = (await lines(o).getByTestId('payment').first().innerText()).replace(/\s+/g, ' ');
    result.ownerAfter = await balance(o);
    // The chips show any mix: payments off leaves the deposit, and back on brings the payment back.
    await lines(o).getByRole('button', { name: /^Payments/ }).click();
    await lines(o).getByTestId('payment').waitFor({ state: 'detached' });
    result.withoutPayments = (await lines(o).locator('[data-testid="money-lines"] > li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
    await lines(o).getByRole('button', { name: /^Payments/ }).click();
    await lines(o).getByTestId('payment').waitFor();
    await h.shot(o, 'payments-list-desktop');
    o.once('dialog', (d) => d.accept());
    await lines(o).getByRole('button', { name: /Remove the \$100 payment from Vic/ }).click();
    await lines(o).getByTestId('payment').waitFor({ state: 'detached' });
    result.ownerAfterRemove = await balance(o);
    result.ownerOverflow = await h.overflowX(o);

    const ok =
      /You owe \$100/.test(result.vicBefore) &&
      /You.*Mike.*\$100/.test(result.transfer) &&
      result.venmoLink.host === 'venmo.com' && result.venmoLink.recipients === 'mike-p-tt' && result.venmoLink.amount === '100.00' &&
      result.venmoLink.note === 'TripTab · Euro ski trip' && result.venmoNoPlus && result.opensElsewhere &&
      result.prefilled === '100.00' && /even/i.test(result.vicAfter) && /You paid Mike.*Cash.*\$100/.test(result.vicSees) &&
      /Vic paid you.*Cash.*\$100.*you got \$100/.test(result.ownerSees) &&
      result.withoutPayments.length === 1 && /Airbnb deposit.*You paid.*\$200.*you lent \$100/.test(result.withoutPayments[0]) && /even/i.test(result.ownerAfter) && /owed \$100/.test(result.ownerAfterRemove) &&
      result.settleOverflow <= 0 && result.ownerOverflow <= 0;
    if (!ok) result.failure = 'a payments check failed';
  } catch (e) {
    result.failure = String(e);
  } finally {
    result.errors = h.errors;
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
    if (result.failure || result.errors.length) process.exit(1);
  }
})();
