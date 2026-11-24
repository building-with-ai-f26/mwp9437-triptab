// T7 (Mike's 11/23 ski trip test, C63; journal/pm-review/spec-11-23.md): a payment schedule on a plan.
// At 1280 and 390 wide, against TripTab dev; a made-up chalet, the euro rate faked at 1.10.
// - A stay of 3,000 EUR as 1,000 paid on 11/18 and 2,000 due 12/11: the card reads "1 of 2 paid · next
//   due Dec 11" with no "$ ✓", a to-do "Pay Chalet: payment 2" is on the payer's list due 12/11, and
//   Money shows $1,100 spent and $2,200 coming up.
// - Marking payment 2 paid shows the "$ ✓" and ticks its to-do.
// - A third payment's to-do, ticked on the To do list, marks that payment paid.
const { chromium } = require('playwright');
const h = require('./helpers.cjs');

const card = (p) => p.locator('#day-2027-02-05 .item-card').filter({ hasText: 'Chalet' }).first();
const sched = (p) => h.dlg(p).getByTestId('payment-schedule');

async function openChalet(p, phone) {
  // Back to the itinerary from Money or To do (a laptop's Overview holds it).
  await p.getByRole('tab', { name: phone ? /Itinerary/ : 'Overview' }).click();
  await h.showDay(p, '2027-02-05');
  await card(p).click();
  await h.openCost(h.dlg(p));
  await sched(p).waitFor();
}
async function close(p) {
  await h.dlg(p).getByRole('button', { name: /^(Done|Close)$/ }).first().click();
  await p.locator('dialog[open]').waitFor({ state: 'detached' }).catch(() => {});
}
async function addPayment(p, amount, currency, date, paid) {
  await sched(p).getByRole('button', { name: 'Add a payment' }).click();
  await sched(p).getByLabel('Payment amount').fill(amount);
  await sched(p).getByLabel('Payment currency').selectOption(currency);
  if (paid) await sched(p).getByLabel('Already paid').check();
  await sched(p).getByLabel(paid ? 'Paid on' : 'Due by').fill(date);
  await sched(p).getByRole('button', { name: 'Add payment' }).click();
  await sched(p).getByRole('button', { name: 'Add a payment' }).waitFor();
}

async function run(browser, label, opts, result) {
  const r = (result[label] = {});
  const phone = label === 'phone';
  const p = h.watch(await (await h.context(browser, opts)).newPage(), label);
  await p.route('**/api.frankfurter.dev/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ amount: 1, base: 'EUR', date: '2026-11-24', rates: { USD: 1.1 } }) }),
  );
  await h.startSkiTrip(p, `schedule-${label}`);
  await h.addPlan(p, '2027-02-05', "Add where everyone's staying", { title: 'Chalet', kind: 'Stay', checkout: '2027-02-12', status: 'Planned' });

  // 1,000 EUR paid on 11/18, then 2,000 EUR due 12/11.
  await openChalet(p, phone);
  await addPayment(p, '1000', 'EUR', '2026-11-18', true);
  await addPayment(p, '2000', 'EUR', '2026-12-11', false);
  r.scheduleRows = (await sched(p).getByTestId('schedule-rows').innerText()).replace(/\s+/g, ' ');
  r.scheduleSummary = (await sched(p).getByTestId('schedule-summary').innerText()).trim();
  await sched(p).scrollIntoViewIfNeeded();
  await h.shot(p, `schedule-dialog-${label}`);
  await close(p);
  r.card = (await card(p).innerText()).replace(/\s+/g, ' ');
  r.cardPaidMark = await card(p).locator('[title="Confirmed and paid"]').count();
  await card(p).scrollIntoViewIfNeeded();
  await h.shot(p, `schedule-card-${label}`);

  // The to-do, and Money.
  await p.getByRole('tab', { name: /To do/ }).click();
  const todos = p.locator('section[aria-labelledby="actions-title"]');
  const todo = todos.locator('li', { hasText: 'Pay Chalet: payment 2' });
  await todo.waitFor();
  r.todo = (await todo.innerText()).replace(/\s+/g, ' ');
  r.todoAssignee = await todo.locator('select').inputValue().catch(() => null);
  await p.getByRole('tab', { name: /Money/ }).click();
  const money = p.locator('section[aria-labelledby="money-title"]');
  r.money = (await money.locator('p.text-xs').first().innerText()).replace(/\s+/g, ' ');
  r.comingUp = (await money.getByTestId('coming-up').innerText()).replace(/\s+/g, ' ');
  await money.scrollIntoViewIfNeeded();
  await h.shot(p, `schedule-money-${label}`);

  // Payment 2 marked paid: the "$ ✓", and its to-do ticked.
  await openChalet(p, phone);
  await sched(p).getByLabel('Payment 2 paid').click();
  await sched(p).getByTestId('schedule-summary').filter({ hasText: 'all 2 paid' }).waitFor();
  await close(p);
  await card(p).locator('[title="Confirmed and paid"]').waitFor();
  r.cardAfter = (await card(p).innerText()).replace(/\s+/g, ' ');
  await p.getByRole('tab', { name: /To do/ }).click();
  r.todoTicked = await todos.getByLabel('Mark not done: Pay Chalet: payment 2').count();

  // A third payment, ticked from the To do list: the payment is marked paid.
  await openChalet(p, phone);
  await addPayment(p, '500', 'USD', '2027-01-05', false);
  await close(p);
  await p.getByRole('tab', { name: /To do/ }).click();
  await todos.getByLabel('Mark done: Pay Chalet: payment 3').click();
  await todos.getByLabel('Mark not done: Pay Chalet: payment 3').waitFor({ state: 'attached' });
  await openChalet(p, phone);
  await sched(p).getByTestId('schedule-summary').filter({ hasText: 'all 3 paid' }).waitFor();
  r.afterTodo = (await sched(p).getByTestId('schedule-summary').innerText()).trim();
  await close(p);
  r.overflow = await h.overflowX(p);
}

(async () => {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const result = {};
  try {
    await run(browser, 'desktop', h.DESKTOP, result);
    await run(browser, 'phone', h.PHONE, result);
    for (const [label, r] of Object.entries(result)) {
      const fail = [];
      const want = (name, ok) => ok || fail.push(name);
      want('schedule rows', /Payment 1: EUR 1,000\.00 paid Nov 18/.test(r.scheduleRows) && /Payment 2: EUR 2,000\.00 due Dec 11/.test(r.scheduleRows));
      want('card 1 of 2 paid, no $', /1 of 2 paid · next due Dec 11/.test(r.card) && r.cardPaidMark === 0);
      want('to-do due 12/11', /by Fri, Dec 11/.test(r.todo));
      want('money spent and coming up', /Trip spend \$1,100/.test(r.money) && /Coming up \$2,200/.test(r.comingUp));
      want('all paid shows $', /All 2 paid/.test(r.cardAfter) && r.todoTicked === 1);
      want('to-do tick marks paid', /all 3 paid/.test(r.afterTodo));
      want('no sideways scroll', r.overflow <= 0);
      if (fail.length) result.failure = `${result.failure ? `${result.failure} | ` : ''}${label}: ${fail.join('; ')}`;
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
